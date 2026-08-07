/**
 * Link legacy RCT-* payments (receipts) to their invoices.
 *
 * Preview mode (default) — READ-ONLY:
 *   npx tsx scripts/link-payments.ts "postgresql://user:pass@host:port/db"
 *   Matches every unlinked RCT receipt to invoices by client + amount + date
 *   (default tolerance ±7 days), buckets them exact / ambiguous / amount-only /
 *   none, prints a summary, and writes /tmp/link-payments-preview.csv so a
 *   human can confirm which receipt ids to link. No writes.
 *
 * Apply mode — only for ids explicitly confirmed from the preview:
 *   npx tsx scripts/link-payments.ts "postgresql://..." --apply <id,id,...> [--by <userId>]
 *   Re-runs the exact match per id (fails if not uniquely resolvable), backfills
 *   receipt evidence the way the app's record-payment flow does (reference,
 *   receivedBy, recordedBy, recordedAt, postedAt), sets linkedInvoiceId,
 *   inserts a payment_allocations row, and writes an audit trail entry.
 *   Bank-transfer receipts without an uploaded proof are skipped — the
 *   receipt-evidence CHECK (invoices_receipt_evidence_chk) requires proof for
 *   bank payments, and this script will not fabricate proofs.
 */
import { Pool, PoolClient } from 'pg';
import { writeFileSync } from 'fs';

const DATE_TOLERANCE_DAYS = 7;
const BANK_METHOD_RE = /bank|transfer|rtgs|swift|wire/i;
const DEFAULT_BY_USER_ID = '1'; // seeded admin@dreambox.com — attribution default

interface Receipt {
  id: string;
  clientId: string | null;
  total: number;
  date: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  createdAt: Date;
  proofPaymentUrl: string | null;
  receivedBy: string | null;
  receivedByUserId: string | null;
  recordedAt: Date | null;
  postedAt: Date | null;
  linkedInvoiceId: string | null;
}

interface Invoice {
  id: string;
  clientId: string | null;
  total: number;
  date: string | null;
  status: string;
  remaining: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((ta - tb) / 86_400_000);
}

function loadReceipts(pool: Pool): Promise<Receipt[]> {
  return pool.query(
    `SELECT id, "clientId", total, date, "paymentMethod", "paymentReference", "createdAt",
            "proofPaymentUrl", "receivedBy", "receivedByUserId", "recordedAt", "postedAt", "linkedInvoiceId"
     FROM invoices
     WHERE type = 'Receipt' AND id LIKE 'RCT-%' AND NOT "isVoided" AND total > 0
     ORDER BY date, id`,
  ).then(r => r.rows as Receipt[]);
}

async function loadInvoices(pool: Pool): Promise<Invoice[]> {
  const rows = (await pool.query(
    `SELECT id, "clientId", total, date, status FROM invoices
     WHERE type IN ('Invoice','Proforma') AND NOT "isVoided"`,
  )).rows as Invoice[];

  // Remaining balance per invoice = total minus linked non-voided receipts.
  const paid = (await pool.query(
    `SELECT "linkedInvoiceId" AS iid, sum(total) AS tot FROM invoices
     WHERE type='Receipt' AND NOT "isVoided" AND "linkedInvoiceId" IS NOT NULL
     GROUP BY "linkedInvoiceId"`,
  )).rows as Array<{ iid: string; tot: string | number }>;
  const paidBy = new Map(paid.map(p => [p.iid, Number(p.tot)]));
  return rows.map(inv => ({
    ...inv,
    remaining: round2(Number(inv.total) - (paidBy.get(inv.id) ?? 0)),
  }));
}

interface Match {
  bucket: 'exact' | 'ambiguous' | 'amount-only' | 'none';
  candidates: Array<{ invoice: Invoice; dateDelta: number | null; linkable: boolean }>;
}

function matchReceipt(receipt: Receipt, invoices: Invoice[]): Match {
  const amountMatches = invoices.filter(i =>
    i.clientId === receipt.clientId &&
    Math.abs(Number(i.total) - Number(receipt.total)) < 0.01 &&
    i.remaining >= Number(receipt.total) - 0.01,
  );
  if (amountMatches.length === 0) return { bucket: 'none', candidates: [] };

  const withDelta = amountMatches.map(inv => ({
    invoice: inv,
    dateDelta: daysBetween(receipt.date, inv.date),
  }));
  const dateMatched = withDelta.filter(c =>
    c.dateDelta !== null && Math.abs(c.dateDelta) <= DATE_TOLERANCE_DAYS,
  );

  let bucket: Match['bucket'];
  if (dateMatched.length === 1) bucket = 'exact';
  else if (dateMatched.length > 1 || (dateMatched.length === 0 && amountMatches.length > 1)) bucket = 'ambiguous';
  else bucket = 'amount-only';

  const linkable = (c: { invoice: Invoice }) => {
    const m = receipt.paymentMethod ?? '';
    if (BANK_METHOD_RE.test(m)) return !!receipt.proofPaymentUrl;
    return true;
  };
  const candidates = (bucket === 'ambiguous' ? withDelta : dateMatched.length > 0 ? dateMatched : withDelta)
    .map(c => ({ ...c, linkable: linkable(c) }));
  return { bucket, candidates };
}

async function preview(pool: Pool): Promise<void> {
  const receipts = await loadReceipts(pool);
  const invoices = await loadInvoices(pool);
  console.log(`Receipts to match: ${receipts.length}   Invoice pool: ${invoices.length}`);

  const rows: string[][] = [['receipt_id','receipt_date','amount','method','client_id','bucket','invoice_id','invoice_date','invoice_status','invoice_total','invoice_remaining','date_delta_days','linkable']];
  const counts = { exact: 0, ambiguous: 0, 'amount-only': 0, none: 0 };

  for (const receipt of receipts) {
    const { bucket, candidates } = matchReceipt(receipt, invoices);
    counts[bucket] += 1;
    if (candidates.length === 0) {
      rows.push([receipt.id, receipt.date ?? '', String(receipt.total), receipt.paymentMethod ?? '', receipt.clientId ?? '', bucket, '', '', '', '', '', '', '']);
    }
    for (const c of candidates) {
      rows.push([
        receipt.id, receipt.date ?? '', String(receipt.total), receipt.paymentMethod ?? '', receipt.clientId ?? '',
        bucket,        c.invoice.id, c.invoice.date ?? '', c.invoice.status,
        String(c.invoice.total), String(c.invoice.remaining), c.dateDelta === null ? '' : String(c.dateDelta),
        c.linkable ? 'yes' : 'blocked-proof',
      ]);
    }
  }

  console.log('\n── Buckets ──');
  (['exact', 'amount-only', 'ambiguous', 'none'] as const).forEach(b =>
    console.log(`  ${b.padEnd(11)} ${counts[b]}`),
  );

  const exactIds = new Set(rows.filter(r => r[5] === 'exact').map(r => r[0]));
  const linkableExact = rows.filter(r => r[5] === 'exact' && r[12] === 'yes');
  const blocked = rows.filter(r => r[5] === 'exact' && r[12] === 'blocked-proof');
  const none = rows.filter(r => r[5] === 'none');
  console.log(`\n  Unique exact-match receipts : ${exactIds.size}`);
  console.log(`  of which linkable now       : ${linkableExact.length}  (cash/other — evidence backfill OK)`);
  console.log(`  of which blocked (bank, no proof): ${blocked.length}`);
  console.log(`  Unmatched (no client+amount candidate): ${none.length}`);

  if (linkableExact.length > 0) {
    console.log('\n── Suggest linking these (exact match, linkable) ──');
    linkableExact.forEach(r =>
      console.log(`  ${r[0].padEnd(20)} $${r[2].padStart(9)}  ${r[1]}  -> ${r[6]} (${r[8]}, remaining $${r[10]})`),
    );
  }
  if (blocked.length > 0) {
    console.log('\n── Exact match but BLOCKED (bank transfer needs uploaded proof) ──');
    blocked.slice(0, 30).forEach(r =>
      console.log(`  ${r[0].padEnd(20)} $${r[2].padStart(9)}  ${r[1]}  -> ${r[6]} (${r[8]})  [no proof on file]`),
    );
    if (blocked.length > 30) console.log(`  … ${blocked.length - 30} more`);
  }
  if (none.length > 0) {
    console.log('\n── No candidate invoice found (review manually) ──');
    none.slice(0, 20).forEach(r =>
      console.log(`  ${r[0].padEnd(20)} $${r[2].padStart(9)}  ${r[1]}  client ${r[4]}`),
    );
    if (none.length > 20) console.log(`  … ${none.length - 20} more`);
  }

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  writeFileSync('/tmp/link-payments-preview.csv', csv);
  console.log(`\nFull detail written to /tmp/link-payments-preview.csv (${rows.length - 1} rows)`);
  console.log('\nTo apply: npx tsx scripts/link-payments.ts "<url>" --apply <confirmed receipt ids...>');
}

async function apply(pool: Pool, ids: string[], byUserId: string): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const by = (await pool.query(`SELECT id, email FROM users WHERE id = $1`, [byUserId]).catch(() => ({ rows: [] }))).rows[0] as { id: string; email: string } | undefined;
  if (!by) { console.error(`User ${byUserId} not found — pass --by <userId>`); process.exit(1); }
  console.log(`Attributing to user ${by.email} (${by.id})${dryRun ? '  [DRY RUN — nothing will persist]' : ''}`);

  const receipts = await loadReceipts(pool);
  const invoices = await loadInvoices(pool);
  const byId = new Map(receipts.map(r => [r.id, r]));
  const existingPaid = (await pool.query(
    `SELECT "invoiceId" AS iid, sum(amount) AS tot FROM payment_allocations WHERE NOT "isReversed" GROUP BY "invoiceId"`,
  )).rows as Array<{ iid: string; tot: string | number }>;
  const allocated = new Map(existingPaid.map(p => [p.iid, Number(p.tot)]));
  const applied = new Map<string, number>(); // invoiceId -> amount applied this run
  let ok = 0, skipped = 0, failed = 0;

  for (const id of ids) {
    const receipt = byId.get(id);
    if (!receipt) { console.log(`  SKIP ${id}: not an unlinked positive RCT receipt`); skipped++; continue; }
    if (receipt.linkedInvoiceId) { console.log(`  SKIP ${id}: already linked to ${receipt.linkedInvoiceId}`); skipped++; continue; }

    const { bucket, candidates } = matchReceipt(receipt, invoices);
    if (bucket !== 'exact' || candidates.length !== 1) {
      console.log(`  FAIL ${id}: not uniquely resolvable (${bucket}) — re-run preview`); failed++; continue;
    }
    const target = candidates[0].invoice;
    const method = receipt.paymentMethod ?? '';
    if (BANK_METHOD_RE.test(method) && (!receipt.proofPaymentUrl || !(receipt as any).receivingAccount)) {
      console.log(`  BLOCK ${id}: bank transfer without proof/receiving account — cannot link (CHECK requires evidence)`); skipped++; continue;
    }

    // Never over-allocate: paid-so-far (existing + this run) + receipt <= invoice total.
    const alreadyPaid = (allocated.get(target.id) ?? 0) + (applied.get(target.id) ?? 0);
    const amount = round2(Number(receipt.total));
    if (alreadyPaid + amount > Number(target.total) + 0.01) {
      console.log(`  SKIP ${id}: would over-allocate invoice ${target.id} (${
        round2(alreadyPaid)}+$${amount} > $${target.total})`);
      skipped++; continue;
    }

    const before = { id: receipt.id, linkedInvoiceId: receipt.linkedInvoiceId, paymentReference: receipt.paymentReference, receivedBy: receipt.receivedBy, recordedAt: receipt.recordedAt, postedAt: receipt.postedAt };
    try {
      await pool.query('BEGIN');
      // Empty strings are as good as missing here — the legacy RCT batch stored
      // '' in paymentReference, which would otherwise defeat the backfill and
      // trip the receipt-evidence CHECK (NULLIF(btrim(...),'') IS NOT NULL).
      const updated = await pool.query(
        `UPDATE invoices SET
            "linkedInvoiceId" = $2,
            "paymentReference" = CASE WHEN NULLIF(btrim(COALESCE("paymentReference",'')),'') IS NULL THEN $3 ELSE "paymentReference" END,
            "receivedBy"       = CASE WHEN NULLIF(btrim(COALESCE("receivedBy",'')),'') IS NULL THEN $4 ELSE "receivedBy" END,
            "receivedByUserId" = CASE WHEN NULLIF(btrim(COALESCE("receivedByUserId",'')),'') IS NULL THEN $5 ELSE "receivedByUserId" END,
            "recordedAt"       = COALESCE("recordedAt", $6),
            "postedAt"         = COALESCE("postedAt", $6),
            "updatedAt"        = now()
         WHERE id = $1 AND "linkedInvoiceId" IS NULL
         RETURNING id, "paymentReference", "receivedBy", "recordedAt", "postedAt"`,
        [id, target.id, id, 'System cleanup (legacy RCT batch)', by.id, receipt.createdAt],
      );
      if (updated.rowCount !== 1) { await pool.query('ROLLBACK'); console.log(`  FAIL ${id}: row changed concurrently`); failed++; continue; }

      await pool.query(
        `INSERT INTO payment_allocations (id, "receiptId","invoiceId",amount,"allocatedBy","allocatedAt")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,now()) ON CONFLICT DO NOTHING`,
        [id, target.id, amount, by.id],
      );
      // Keep the invoice status honest: mark Paid when fully covered by links/allocations.
      await pool.query(
        `UPDATE invoices i SET status = 'Paid'
         WHERE i.id = $1 AND i.type = 'Invoice' AND NOT i."isVoided"
           AND (i.total - COALESCE((SELECT sum(total) FROM invoices r WHERE r.type='Receipt' AND NOT r."isVoided" AND r."linkedInvoiceId" = i.id), 0)) <= 0.01`,
        [target.id],
      );
      await pool.query(
        `INSERT INTO audit_logs (id, action, details, "userId", "userEmail", "tableName", "recordId", "beforeData", "afterData", source)
         VALUES (gen_random_uuid(), 'Finance: Payment Linked', $1, $2, $3, 'invoices', $4, $5::jsonb, $6::jsonb, 'SYSTEM')`,
        [
          `Linked receipt ${id} ($${receipt.total}) to invoice ${target.id} (${target.status}) — legacy RCT cleanup`,
          by.id, by.email, id, JSON.stringify(before), JSON.stringify(updated.rows[0]),
        ],
      );
      applied.set(target.id, (applied.get(target.id) ?? 0) + amount);
      if (dryRun) {
        await pool.query('ROLLBACK');
        console.log(`  OK   ${id}: linked -> ${target.id} ($${receipt.total}) [DRY RUN, rolled back]`);
      } else {
        await pool.query('COMMIT');
        console.log(`  OK   ${id}: linked -> ${target.id} ($${receipt.total})`);
      }
      ok++;
    } catch (e: any) {
      await pool.query('ROLLBACK').catch(() => undefined);
      console.log(`  FAIL ${id}: ${(e.message || e).slice(0, 160)}`);
      failed++;
    }
  }
  console.log(`\nDone: ${ok} linked${dryRun ? ' (dry run)' : ''}, ${skipped} skipped, ${failed} failed.`);
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx tsx scripts/link-payments.ts "<postgresql-url>" [--apply id1,id2,...] [--by <userId>] [--dry-run]');
    process.exit(1);
  }
  const applyIdx = process.argv.indexOf('--apply');
  const byIdx = process.argv.indexOf('--by');
  const byUserId = byIdx >= 0 ? process.argv[byIdx + 1] : DEFAULT_BY_USER_ID;
  const ids = applyIdx >= 0
    ? process.argv.slice(applyIdx + 1).flatMap(s => s.split(',')).map(s => s.trim()).filter(Boolean).filter(s => !s.startsWith('--'))
    : [];

  const pool = new Pool({ connectionString: url, max: 4 });
  try {
    if (ids.length > 0) await apply(pool, ids, byUserId);
    else await preview(pool);
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
