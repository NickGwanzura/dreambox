
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Invoice, Contract, Client, Expense, OutsourcedBillboard, Billboard, BillboardType } from '../types';
import { getCompanyProfile, getCompanyLogo, getContracts } from './mockData';

type RGB = [number, number, number];

const luminance = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const saturation = (c: RGB) => {
    const mx = Math.max(...c), mn = Math.min(...c);
    return mx === 0 ? 0 : (mx - mn) / mx;
};
const scaleRgb = (c: RGB, factor: number): RGB => [
    Math.max(0, Math.min(255, Math.round(c[0] * factor))),
    Math.max(0, Math.min(255, Math.round(c[1] * factor))),
    Math.max(0, Math.min(255, Math.round(c[2] * factor)))
];

type LogoInfo = { pngDataUrl: string; width: number; height: number; primary: RGB; accent: RGB };

const prepareLogoForPdf = (logoDataUrl?: string | null): Promise<LogoInfo | null> => {
    return new Promise((resolve) => {
        if (!logoDataUrl || !logoDataUrl.startsWith('data:image')) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                // Normalise to PNG for jsPDF (handles AVIF/WebP sources the browser decoded)
                const normCanvas = document.createElement('canvas');
                const maxSide = 512;
                const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
                normCanvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                normCanvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                const normCtx = normCanvas.getContext('2d');
                if (!normCtx) { resolve(null); return; }
                normCtx.drawImage(img, 0, 0, normCanvas.width, normCanvas.height);
                const pngDataUrl = normCanvas.toDataURL('image/png');

                // Palette sampling on a smaller canvas
                const size = 64;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }
                ctx.drawImage(img, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;

                const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
                    if (a < 200) continue;
                    if (r > 240 && g > 240 && b > 240) continue; // near-white
                    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
                    if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
                    buckets[key].r += r;
                    buckets[key].g += g;
                    buckets[key].b += b;
                    buckets[key].count += 1;
                }

                const top = Object.values(buckets)
                    .filter(b => b.count > 5)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8)
                    .map(b => [Math.round(b.r / b.count), Math.round(b.g / b.count), Math.round(b.b / b.count)] as RGB);

                let primary: RGB = [15, 23, 42];
                let accent: RGB = [202, 163, 73];

                if (top.length > 0) {
                    const darkCandidates = [...top].sort((a, b) => luminance(a) - luminance(b));
                    primary = darkCandidates[0];
                    if (luminance(primary) > 140) primary = scaleRgb(primary, 0.35);

                    const accentCandidates = [...top].sort((a, b) => saturation(b) - saturation(a));
                    for (const c of accentCandidates) {
                        const dist = Math.hypot(c[0] - primary[0], c[1] - primary[1], c[2] - primary[2]);
                        if (dist > 60) { accent = c; break; }
                    }
                }

                resolve({ pngDataUrl, width: normCanvas.width, height: normCanvas.height, primary, accent });
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = logoDataUrl;
    });
};

// Helper to safely execute autoTable regardless of import structure
const runAutoTable = (doc: any, options: any) => {
    try {
        if (typeof autoTable === 'function') {
            autoTable(doc, options);
            return;
        } 
        if (typeof (doc as any).autoTable === 'function') {
            (doc as any).autoTable(options);
            return;
        }
        if ((autoTable as any)?.default && typeof (autoTable as any).default === 'function') {
            (autoTable as any).default(doc, options);
            return;
        }
    } catch (e) {
        console.error('Error running autoTable:', e);
    }
};

// Memoised logo preparation — keyed by the raw data URL so re-uploads invalidate
let _brandingCache: { key: string; value: LogoInfo | null } | null = null;

const getPdfBranding = async (): Promise<LogoInfo | null> => {
    const logo = getCompanyLogo();
    const key = logo || '';
    if (_brandingCache && _brandingCache.key === key) return _brandingCache.value;
    const value = await prepareLogoForPdf(logo);
    _brandingCache = { key, value };
    return value;
};

const addCompanyHeader = (doc: jsPDF, logoInfo?: LogoInfo | null): number => {
    const profile = getCompanyProfile();
    const pageWidth = doc.internal.pageSize.width;
    let startY = 15;

    // Logo (Top Left) — aspect-preserving inside a 30mm x 22mm bounding box
    if (logoInfo && logoInfo.pngDataUrl) {
        const boxW = 30, boxH = 22;
        const scale = Math.min(boxW / logoInfo.width, boxH / logoInfo.height);
        const drawW = logoInfo.width * scale;
        const drawH = logoInfo.height * scale;
        const drawX = 14;
        const drawY = 10 + (boxH - drawH) / 2;
        try {
            doc.addImage(logoInfo.pngDataUrl, 'PNG', drawX, drawY, drawW, drawH);
        } catch (err) {
            console.warn('Could not add logo to PDF', err);
        }
    } else {
        const rawLogo = getCompanyLogo();
        if (rawLogo && rawLogo.startsWith('data:image') && !rawLogo.startsWith('data:image/avif')) {
            const fmt = rawLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            try { doc.addImage(rawLogo, fmt, 14, 10, 25, 22); } catch { /* ignore */ }
        }
    }

    // Company Details (Top Right aligned)
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text(profile.name, pageWidth - 14, startY, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    
    const lineHeight = 4;
    startY += 6;
    
    doc.text(profile.address, pageWidth - 14, startY, { align: 'right' });
    startY += lineHeight;
    
    doc.text(`${profile.city}, ${profile.country}`, pageWidth - 14, startY, { align: 'right' });
    startY += lineHeight;
    
    doc.text(profile.phone, pageWidth - 14, startY, { align: 'right' });
    startY += lineHeight;
    
    doc.text(profile.email, pageWidth - 14, startY, { align: 'right' });
    startY += lineHeight;

    if(profile.vatNumber) {
        doc.text(`VAT: ${profile.vatNumber}`, pageWidth - 14, startY, { align: 'right' });
        startY += lineHeight;
    }

    if(profile.website) {
        doc.text(profile.website, pageWidth - 14, startY, { align: 'right' });
        startY += lineHeight;
    }

    // Draw a divider line
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.line(14, startY + 5, pageWidth - 14, startY + 5);

    return startY + 15; // Return Y position for next elements
};

// Adds a contact footer to every page of the document
const addContactFooter = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : 1;

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const footerY = pageHeight - 10;

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(14, footerY - 5, pageWidth - 14, footerY - 5);

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);

        const contactLine = '54 Brooke Village, Borrowdale Brooke, Harare, Zimbabwe  |  +263 778 018 909  |  info@dreamboxadvertising.com  |  www.dreamboxadvertising.com';
        doc.text(contactLine, pageWidth / 2, footerY, { align: 'center' });

        if (pageCount > 1) {
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, footerY, { align: 'right' });
        }
    }
};

export const generateInvoicePDF = async (invoice: Invoice, client: Client) => {
  try {
    const doc = new jsPDF();
    const branding = await getPdfBranding();
    let currentY = addCompanyHeader(doc, branding);
    
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(invoice.type === 'Quotation' ? 'QUOTATION' : invoice.type === 'Receipt' ? 'RECEIPT' : 'INVOICE', 14, currentY);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`#${invoice.id}`, 14, currentY + 6);
    
    const metaY = currentY + 15;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(150);
    doc.text('BILL TO', 14, metaY);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(client.companyName || 'Unknown Company', 14, metaY + 6);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(client.contactPerson || '', 14, metaY + 11);
    doc.text(client.email || '', 14, metaY + 16);
    doc.text(client.phone || '', 14, metaY + 21);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(150);
    doc.text('DETAILS', 120, metaY);

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.setFont("helvetica", "normal");
    
    doc.text('Date Issued:', 120, metaY + 6);
    doc.text(invoice.date, 160, metaY + 6, { align: 'right' });
    
    doc.text('Status:', 120, metaY + 11);
    doc.setTextColor(invoice.status === 'Paid' ? 'green' : invoice.status === 'Overdue' ? 'red' : 'black');
    doc.text(invoice.status, 160, metaY + 11, { align: 'right' });
    doc.setTextColor(50);

    if (invoice.contractId) {
        doc.text('Contract Ref:', 120, metaY + 16);
        doc.text(invoice.contractId, 160, metaY + 16, { align: 'right' });
    }

    const tableColumn = ["Description", "Amount ($)"];
    const tableRows = (invoice.items || []).map(item => [item.description, item.amount.toFixed(2)]);
    
    const tableStartY = metaY + 30;

    if (tableRows.length > 0) {
        runAutoTable(doc, {
            startY: tableStartY,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], fontSize: 10, fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 4 },
            columnStyles: { 1: { halign: 'right' } }
        });
    }

    const finalY = (doc as any).lastAutoTable?.finalY || tableStartY + 20;
    const totalsX = 140;
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Subtotal:`, totalsX, finalY + 10);
    doc.text(`$${(invoice.subtotal || 0).toFixed(2)}`, 195, finalY + 10, { align: 'right' });
    
    const discountLabel = invoice.discountDescription ? `Discount (${invoice.discountDescription})` : 'Discount';
    doc.text(discountLabel + ':', totalsX, finalY + 15);
    doc.text(`-$${(invoice.discountAmount || 0).toFixed(2)}`, 195, finalY + 15, { align: 'right' });

    doc.text(`VAT (15%):`, totalsX, finalY + 20);
    doc.text(`$${(invoice.vatAmount || 0).toFixed(2)}`, 195, finalY + 20, { align: 'right' });
    
    doc.setDrawColor(200);
    doc.line(totalsX, finalY + 23, 195, finalY + 23);

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(`Total:`, totalsX, finalY + 31);
    doc.text(`$${(invoice.total || 0).toFixed(2)}`, 195, finalY + 31, { align: 'right' });

    addContactFooter(doc);
    doc.save(`${invoice.type}_${invoice.id}.pdf`);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    alert("Failed to generate PDF. Please check console for details.");
  }
};

export const generateContractPDF = async (contract: Contract, client: Client, billboardName: string) => {
  try {
    const doc = new jsPDF();
    const profile = getCompanyProfile();
    const branding = await getPdfBranding();
    let currentY = addCompanyHeader(doc, branding);

    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text('RENTAL AGREEMENT', 105, currentY, { align: 'center' });
    
    currentY += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Contract ID: ${contract.id}`, 105, currentY, { align: 'center' });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 105, currentY + 5, { align: 'center' });

    currentY += 15;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, currentY, 182, 35, 'FD');

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text('Parties Involved', 20, currentY + 10);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50);
    
    doc.text(`Lessor: ${profile.name}`, 20, currentY + 20);
    doc.text(`Address: ${profile.address}, ${profile.city}`, 20, currentY + 25);
    
    doc.text(`Lessee: ${client.companyName}`, 110, currentY + 20);
    doc.text(`Contact: ${client.contactPerson}`, 110, currentY + 25);

    currentY += 45;

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text('1. Asset Details', 14, currentY);
    
    currentY += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50);
    const assetInfo = [
        `Billboard Location: ${billboardName}`,
        `Specific Unit/Side: ${contract.details}`,
        `Contract Duration: ${contract.startDate} to ${contract.endDate}`,
    ];
    assetInfo.forEach(line => {
        doc.text(`• ${line}`, 20, currentY);
        currentY += 6;
    });

    currentY += 10;

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text('2. Financial Terms', 14, currentY);
    
    currentY += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Monthly Rental Rate: $${contract.monthlyRate.toFixed(2)}`, 20, currentY);
    currentY += 6;
    if(contract.installationCost > 0) {
        doc.text(`Installation Fee (One-time): $${contract.installationCost.toFixed(2)}`, 20, currentY);
        currentY += 6;
    }
    if(contract.printingCost > 0) {
        doc.text(`Printing/Production Cost: $${contract.printingCost.toFixed(2)}`, 20, currentY);
        currentY += 6;
    }
    
    currentY += 4;
    doc.setFont("helvetica", "bold");
    doc.text(`Total Contract Value: $${contract.totalContractValue.toFixed(2)}`, 20, currentY);
    
    currentY += 15;

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text('3. Terms and Conditions', 14, currentY);
    
    currentY += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50);
    
    const terms = [
        "1. PAYMENT: All rental payments are due in advance on the 1st of each month unless otherwise specified.",
        "2. ARTWORK: The Lessee is responsible for providing artwork in the required format. Printing costs are separate.",
        "3. MAINTENANCE: The Lessor shall maintain the structure in good repair.",
        "4. INDEMNITY: The Lessee indemnifies the Lessor against claims arising from the content of the advertisement.",
        "5. TERMINATION: Either party may terminate this agreement with 30 days written notice.",
        "6. JURISDICTION: This agreement is governed by the laws of Zimbabwe."
    ];
    
    terms.forEach(term => {
        doc.text(term, 20, currentY);
        currentY += 5;
    });
    
    currentY += 15;
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("4. Signatures", 14, currentY);
    
    currentY += 15;
    
    const boxY = currentY;
    
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.rect(14, boxY, 80, 30);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Signed for and on behalf of Lessor:", 16, boxY + 5);
    doc.line(20, boxY + 22, 80, boxY + 22); 
    doc.text(profile.name, 20, boxY + 27);

    doc.rect(110, boxY, 80, 30);
    doc.text("Signed for and on behalf of Lessee:", 112, boxY + 5);
    doc.line(116, boxY + 22, 176, boxY + 22); 
    doc.text(client.companyName, 116, boxY + 27);

    addContactFooter(doc);
    doc.save(`Contract_${contract.id}.pdf`);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    alert("Failed to generate Contract PDF.");
  }
};

export const generateStatementPDF = async (client: Client, transactions: Invoice[], activeRentals: Contract[], billboardNameGetter: (id: string) => string) => {
    try {
        const doc = new jsPDF();
        const branding = await getPdfBranding();
        let currentY = addCompanyHeader(doc, branding);

        doc.setFontSize(20);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.text('STATEMENT OF ACCOUNT', 14, currentY);
        
        currentY += 8;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, currentY);
        
        currentY += 15;

        doc.setFillColor(241, 245, 249);
        doc.rect(14, currentY, 90, 25, 'F');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.text(client.companyName, 18, currentY + 6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50);
        doc.text(client.contactPerson, 18, currentY + 12);
        doc.text(client.email, 18, currentY + 18);

        const totalBilled = transactions.filter(t => String(t.type || '').toLowerCase() === 'invoice').reduce((acc, t) => acc + (Number(t.total) || 0), 0);
        const totalPaid = transactions.filter(t => String(t.type || '').toLowerCase() === 'receipt').reduce((acc, t) => acc + (Number(t.total) || 0), 0);
        const balance = totalBilled - totalPaid;

        doc.setFillColor(balance > 0 ? 254 : 240, balance > 0 ? 242 : 253, balance > 0 ? 242 : 244);
        doc.rect(120, currentY, 76, 25, 'F');
        doc.setTextColor(100);
        doc.text("Amount Due:", 125, currentY + 8);
        doc.setFontSize(16);
        doc.setTextColor(balance > 0 ? 220 : 22, balance > 0 ? 38 : 163, balance > 0 ? 38 : 74); 
        doc.setFont("helvetica", "bold");
        doc.text(`$${balance.toFixed(2)}`, 190, currentY + 18, { align: 'right' });

        currentY += 35;

        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text("Active Services", 14, currentY);
        
        const rentalRows = activeRentals.map(r => [
            billboardNameGetter(r.billboardId),
            r.details,
            `$${r.monthlyRate}/mo`,
            `${r.startDate} to ${r.endDate}`
        ]);
        
        runAutoTable(doc, {
            startY: currentY + 5,
            head: [['Billboard', 'Side/Slot', 'Rate', 'Duration']],
            body: rentalRows,
            theme: 'striped',
            headStyles: { fillColor: [71, 85, 105] },
            styles: { fontSize: 9 }
        });

        const finalY = (doc as any).lastAutoTable?.finalY || currentY + 20;
        doc.text("Transaction History", 14, finalY + 15);

        const transactionRows = transactions.map(t => [
            t.date,
            t.type.toUpperCase(),
            t.id,
            String(t.type || '').toLowerCase() === 'invoice' ? `$${(Number(t.total) || 0).toFixed(2)}` : '-',
            String(t.type || '').toLowerCase() === 'receipt' ? `$${(Number(t.total) || 0).toFixed(2)}` : '-'
        ]);
        transactionRows.push(['', 'TOTALS', '', `$${totalBilled.toFixed(2)}`, `$${totalPaid.toFixed(2)}`]);

        runAutoTable(doc, {
            startY: finalY + 20,
            head: [['Date', 'Type', 'Reference', 'Billed', 'Paid']],
            body: transactionRows,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 9, halign: 'right' },
            columnStyles: {
                0: { halign: 'left' },
                1: { halign: 'left' },
                2: { halign: 'left' }
            }
        });

        addContactFooter(doc);
        doc.save(`Statement_${client.companyName.replace(/\s/g, '_')}.pdf`);
    } catch (error) {
        console.error("PDF Generation Error:", error);
        alert("Failed to generate Statement PDF.");
    }
};

export const generateExpensesPDF = async (expenses: Expense[]) => {
    try {
        const doc = new jsPDF();
        const branding = await getPdfBranding();
        let y = addCompanyHeader(doc, branding);
        
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text("Operational Expenses Report", 14, y);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, y + 6);

        const rows = expenses.map(e => [e.date, e.category, e.description, `$${e.amount.toFixed(2)}`]);
        const total = expenses.reduce((acc, curr) => acc + curr.amount, 0);
        rows.push(['', '', 'TOTAL EXPENSES', `$${total.toFixed(2)}`]);

        runAutoTable(doc, {
            startY: y + 15,
            head: [['Date', 'Category', 'Description', 'Amount']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42] },
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
        });

        addContactFooter(doc);
        doc.save('Expenses_Report.pdf');
    } catch (e) {
        alert("Failed to generate Expenses PDF");
    }
};

export const generatePaymentSchedulePDF = async (schedule: any[]) => {
    try {
        const doc = new jsPDF();
        const branding = await getPdfBranding();
        let y = addCompanyHeader(doc, branding);
        
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text("Payment Schedule / Collections", 14, y);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, y + 6);

        const rows = schedule.map(s => [s.date, s.clientName, s.day, `$${s.amount.toLocaleString()}`]);
        const total = schedule.reduce((acc, curr) => acc + curr.amount, 0);
        rows.push(['', 'TOTAL PROJECTED', '', `$${total.toLocaleString()}`]);

        runAutoTable(doc, {
            startY: y + 15,
            head: [['Due Date', 'Client Name', 'Billing Day', 'Est. Amount']],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }, // Indigo
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
        });

        addContactFooter(doc);
        doc.save('Payment_Schedule.pdf');
    } catch (e) {
        alert("Failed to generate Schedule PDF");
    }
};

export const generateActiveContractsPDF = async (contracts: Contract[], getClientName: (id: string) => string, getBillboardName: (id: string) => string) => {
    try {
        const doc = new jsPDF('l'); // Landscape for more data
        const branding = await getPdfBranding();
        let y = addCompanyHeader(doc, branding);
        
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text("Active Rental Contracts Register", 14, y);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, y + 6);

        const rows = contracts.map(c => [
            c.id,
            getClientName(c.clientId),
            getBillboardName(c.billboardId),
            c.details,
            `${c.startDate} - ${c.endDate}`,
            `$${c.monthlyRate.toLocaleString()}`,
            `$${c.totalContractValue.toLocaleString()}`
        ]);

        const totalMonthly = contracts.reduce((acc, c) => acc + c.monthlyRate, 0);
        rows.push(['', '', '', '', 'TOTAL MONTHLY REVENUE', `$${totalMonthly.toLocaleString()}`, '']);

        runAutoTable(doc, {
            startY: y + 15,
            head: [['Ref', 'Client', 'Billboard', 'Details', 'Period', 'Monthly Rate', 'Total Value']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 9 },
            columnStyles: { 
                5: { halign: 'right' }, 
                6: { halign: 'right' } 
            }
        });

        addContactFooter(doc);
        doc.save('Active_Contracts_Register.pdf');
    } catch (e) {
        alert("Failed to generate Contracts PDF");
    }
};

export const generateClientDirectoryPDF = async (clients: Client[]) => {
    try {
        const doc = new jsPDF();
        const branding = await getPdfBranding();
        let y = addCompanyHeader(doc, branding);
        
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text("Client Directory", 14, y);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Total Clients: ${clients.length}`, 14, y + 6);

        const rows = clients.map(c => [
            c.companyName,
            c.contactPerson,
            c.email,
            c.phone,
            c.billingDay ? `Day ${c.billingDay}` : 'Var',
            c.status
        ]);

        runAutoTable(doc, {
            startY: y + 15,
            head: [['Company', 'Contact', 'Email', 'Phone', 'Bill Day', 'Status']],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [51, 65, 85] },
            styles: { fontSize: 8 }
        });

        addContactFooter(doc);
        doc.save('Client_Directory.pdf');
    } catch (e) {
        alert("Failed to generate Client PDF");
    }
};

export const generateOutsourcedInventoryPDF = async (billboards: OutsourcedBillboard[]) => {
    try {
        const doc = new jsPDF();
        const branding = await getPdfBranding();
        let y = addCompanyHeader(doc, branding);
        
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text("Outsourced Inventory Report", 14, y);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, y + 6);

        const rows = billboards.map(b => [
            b.billboardName,
            b.mediaOwner,
            b.ownerContact,
            `$${b.monthlyPayout.toLocaleString()}`,
            b.contractEnd
        ]);

        const totalPayout = billboards.reduce((acc, curr) => acc + curr.monthlyPayout, 0);
        rows.push(['', '', 'TOTAL MONTHLY PAYOUT', `$${totalPayout.toLocaleString()}`, '']);

        runAutoTable(doc, {
            startY: y + 15,
            head: [['Billboard Asset', 'Partner / Owner', 'Contact', 'Monthly Payout', 'Contract End']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [15, 118, 110] }, // Teal-ish
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
        });

        addContactFooter(doc);
        doc.save('Outsourced_Inventory.pdf');
    } catch (e) {
        alert("Failed to generate Outsourced PDF");
    }
};

type AvailabilityRow = {
    siteName: string;
    location: string;
    type: 'Static' | 'LED';
    size: string;
    availability: string;
    slotsFree: number;
    dailyTraffic: number;
    monthlyRate: number;
};

const formatCompactNumber = (n: number): string => {
    if (!n || n <= 0) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
};

export const generateAvailabilitySheetPDF = async (billboards: Billboard[]) => {
    try {
        const doc = new jsPDF('l');
        const pageWidth = doc.internal.pageSize.width;
        const palette = await getPdfBranding();
        const primary: RGB = palette?.primary || [15, 23, 42];
        const accent: RGB = palette?.accent || [202, 163, 73];
        const primarySoft: RGB = [
            Math.round(primary[0] + (255 - primary[0]) * 0.85),
            Math.round(primary[1] + (255 - primary[1]) * 0.85),
            Math.round(primary[2] + (255 - primary[2]) * 0.85)
        ];
        let y = addCompanyHeader(doc, palette);

        // Canonical availability: derived from active contracts with date filtering
        // (matches getAvailabilityStatus in BillboardList). Drift-prone side flags
        // like sideAStatus/rentedSlots are intentionally NOT used — they can fall
        // out of sync with contract lifecycle (future-dated contracts, expired
        // contracts not auto-reverted, manual status flips).
        const asOf = new Date();
        asOf.setHours(23, 59, 59, 999); // compare dates inclusively
        const activeContractsFor = (billboardId: string): Contract[] =>
            getContracts().filter(c =>
                c.billboardId === billboardId &&
                String(c.status || '').toLowerCase() === 'active' &&
                new Date(c.startDate) <= asOf &&
                new Date(c.endDate) >= new Date(new Date().setHours(0, 0, 0, 0))
            );

        const rows: AvailabilityRow[] = [];
        billboards.forEach(b => {
            const sizeStr = b.width && b.height ? `${b.width}m x ${b.height}m` : '—';
            const dailyTraffic = b.dailyTraffic || 0;
            const locationStr = `${b.location}, ${b.town}`;
            const active = activeContractsFor(b.id);

            if (b.type === BillboardType.Static) {
                const sideABooked = active.some(c => c.side === 'A' || c.side === 'Both');
                const sideBBooked = active.some(c => c.side === 'B' || c.side === 'Both');
                if (!sideABooked) {
                    rows.push({ siteName: b.name, location: locationStr, type: 'Static', size: sizeStr, availability: 'Side A', slotsFree: 1, dailyTraffic, monthlyRate: b.sideARate || 0 });
                }
                if (!sideBBooked) {
                    rows.push({ siteName: b.name, location: locationStr, type: 'Static', size: sizeStr, availability: 'Side B', slotsFree: 1, dailyTraffic, monthlyRate: b.sideBRate || 0 });
                }
            } else {
                const total = b.totalSlots || 0;
                // Count distinct occupied slot numbers to prevent double-counting
                // when two contracts accidentally target the same slotNumber.
                const occupiedSlots = new Set(
                    active
                        .filter(c => typeof c.slotNumber === 'number')
                        .map(c => c.slotNumber as number)
                );
                // Contracts without a slotNumber still consume one slot each.
                const unnumbered = active.filter(c => typeof c.slotNumber !== 'number').length;
                const used = Math.min(total, occupiedSlots.size + unnumbered);
                const free = Math.max(0, total - used);
                if (free > 0) {
                    rows.push({ siteName: b.name, location: locationStr, type: 'LED', size: sizeStr, availability: `${free} of ${total} slots`, slotsFree: free, dailyTraffic, monthlyRate: b.ratePerSlot || 0 });
                }
            }
        });

        // Traffic aggregates — de-duplicate per site so one site with two open sides
        // doesn't double-count its daily impression number.
        const siteTraffic = new Map<string, number>();
        rows.forEach(r => {
            if (!siteTraffic.has(r.siteName)) siteTraffic.set(r.siteName, r.dailyTraffic);
        });
        const totalDailyTraffic = Array.from(siteTraffic.values()).reduce((acc, n) => acc + n, 0);
        const monthlyImpressions = totalDailyTraffic * 30;
        const sitesWithTraffic = Array.from(siteTraffic.values()).filter(n => n > 0).length;
        const avgDailyTraffic = sitesWithTraffic > 0 ? Math.round(totalDailyTraffic / sitesWithTraffic) : 0;

        // Premium title band — uses brand primary + accent from logo
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(14, y - 5, pageWidth - 28, 24, 'F');
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.rect(14, y - 5, 4, 24, 'F');

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('AVAILABLE INVENTORY', 24, y + 5);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(203, 213, 225);
        doc.text('Unoccupied Sites & Monthly Rates', 24, y + 12);

        doc.setFontSize(8);
        doc.setTextColor(203, 213, 225);
        doc.text(`Availability as of ${new Date().toLocaleDateString()}`, pageWidth - 18, y + 5, { align: 'right' });
        doc.text(`${rows.length} opening${rows.length === 1 ? '' : 's'} listed`, pageWidth - 18, y + 12, { align: 'right' });

        y += 28;

        // KPI cards
        const uniqueSites = new Set(rows.map(r => r.siteName)).size;
        const staticFaces = rows.filter(r => r.type === 'Static').length;
        const ledSlotsOpen = rows.filter(r => r.type === 'LED').reduce((acc, r) => acc + r.slotsFree, 0);
        const monthlyPotential = rows.reduce((acc, r) => acc + r.monthlyRate * r.slotsFree, 0);

        const kpis = [
            { label: 'SITES AVAILABLE', value: String(uniqueSites) },
            { label: 'STATIC FACES', value: String(staticFaces) },
            { label: 'LED SLOTS OPEN', value: String(ledSlotsOpen) },
            { label: 'DAILY VIEWS', value: formatCompactNumber(totalDailyTraffic) },
            { label: 'MONTHLY IMPRESSIONS', value: formatCompactNumber(monthlyImpressions) },
            { label: 'MONTHLY POTENTIAL', value: `$${monthlyPotential.toLocaleString()}` }
        ];

        const cardCount = kpis.length;
        const cardGap = 3;
        const cardWidth = (pageWidth - 28 - cardGap * (cardCount - 1)) / cardCount;
        kpis.forEach((kpi, idx) => {
            const x = 14 + idx * (cardWidth + cardGap);
            doc.setFillColor(primarySoft[0], primarySoft[1], primarySoft[2]);
            doc.setDrawColor(primary[0], primary[1], primary[2]);
            doc.roundedRect(x, y, cardWidth, 18, 2, 2, 'FD');
            doc.setFillColor(accent[0], accent[1], accent[2]);
            doc.rect(x, y, 2, 18, 'F');
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primary[0], primary[1], primary[2]);
            doc.text(kpi.label, x + 4, y + 6);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primary[0], primary[1], primary[2]);
            doc.text(kpi.value, x + 4, y + 14);
        });
        y += 26;

        if (rows.length === 0) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('All sites are currently booked. No inventory to list.', pageWidth / 2, y + 20, { align: 'center' });
        } else {
            const tableRows = rows.map(r => [
                r.siteName,
                r.location,
                r.type,
                r.size,
                r.availability,
                r.dailyTraffic > 0 ? r.dailyTraffic.toLocaleString() : '—',
                r.dailyTraffic > 0 ? formatCompactNumber(r.dailyTraffic * 30) : '—',
                `$${r.monthlyRate.toLocaleString()}`
            ]);

            runAutoTable(doc, {
                startY: y,
                head: [['Site', 'Location', 'Type', 'Size', 'Availability', 'Daily Views', 'Monthly Impr.', 'Monthly Rate']],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: primary, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', cellPadding: 5 },
                styles: { fontSize: 9, cellPadding: 4, textColor: [30, 41, 59] },
                alternateRowStyles: { fillColor: primarySoft },
                columnStyles: {
                    0: { fontStyle: 'bold' },
                    5: { halign: 'right' },
                    6: { halign: 'right' },
                    7: { halign: 'right', fontStyle: 'bold', textColor: accent }
                },
                foot: [[
                    'NETWORK TOTALS',
                    `${uniqueSites} site${uniqueSites === 1 ? '' : 's'}`,
                    '',
                    '',
                    `${staticFaces + ledSlotsOpen} opening${(staticFaces + ledSlotsOpen) === 1 ? '' : 's'}`,
                    totalDailyTraffic.toLocaleString(),
                    formatCompactNumber(monthlyImpressions),
                    `$${monthlyPotential.toLocaleString()}`
                ]],
                footStyles: { fillColor: primary, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', halign: 'right' }
            });
        }

        const finalY = (doc as any).lastAutoTable?.finalY || y + 10;
        doc.setDrawColor(accent[0], accent[1], accent[2]);
        doc.setLineWidth(0.6);
        doc.line(14, finalY + 8, pageWidth - 14, finalY + 8);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 116, 139);
        doc.text(
            `Rates shown are monthly and exclude VAT (15%) and production/printing. To reserve, contact us using the details below.`,
            14, finalY + 14
        );
        const trafficNote = rows.length > 0 && totalDailyTraffic > 0
            ? `Traffic figures are per-site daily view estimates from surveys; monthly impressions = daily views × 30 (not unique reach). Network average: ${avgDailyTraffic.toLocaleString()} views/day per site.`
            : `Traffic figures are on-site survey estimates; monthly impressions = daily views × 30 (not unique reach).`;
        doc.text(trafficNote, 14, finalY + 19);

        // Premium "Contact Us" block
        const pageHeight = doc.internal.pageSize.height;
        const contactBlockHeight = 34;
        let contactY = finalY + 26;
        if (contactY + contactBlockHeight > pageHeight - 20) {
            doc.addPage();
            contactY = 20;
        }

        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(14, contactY, pageWidth - 28, contactBlockHeight, 'F');
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.rect(14, contactY, 4, contactBlockHeight, 'F');

        // Logo inside the contact band (right side) — aspect-preserving
        if (palette && palette.pngDataUrl) {
            try {
                const boxW = 26, boxH = 26;
                const scale = Math.min(boxW / palette.width, boxH / palette.height);
                const drawW = palette.width * scale;
                const drawH = palette.height * scale;
                const logoX = pageWidth - 14 - boxW + (boxW - drawW) / 2;
                const logoY = contactY + (contactBlockHeight - drawH) / 2;
                doc.addImage(palette.pngDataUrl, 'PNG', logoX, logoY, drawW, drawH);
            } catch {
                // ignore logo render failure
            }
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('CONTACT US', 24, contactY + 9);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(accent[0], accent[1], accent[2]);
        doc.text('OUR OFFICES', 24, contactY + 16);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(226, 232, 240);
        doc.text('54 Brooke Village, Borrowdale Brooke, Harare, Zimbabwe', 24, contactY + 22);

        const col2X = 24 + (pageWidth - 28) * 0.45;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(accent[0], accent[1], accent[2]);
        doc.text('CALL US', col2X, contactY + 16);
        doc.text('EMAIL US', col2X + 55, contactY + 16);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(226, 232, 240);
        doc.text('+263 778 018 909', col2X, contactY + 22);
        doc.text('info@dreamboxadvertising.com', col2X + 55, contactY + 22);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(203, 213, 225);
        doc.text('www.dreamboxadvertising.com', 24, contactY + 29);

        addContactFooter(doc);
        doc.save(`Availability_Sheet_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
        console.error('Availability PDF Error:', e);
        alert('Failed to generate Availability PDF.');
    }
};

export const generateAppFeaturesPDF = async () => {
    try {
        const doc = new jsPDF();
        const branding = await getPdfBranding();
        let y = addCompanyHeader(doc, branding);

        doc.setFontSize(22);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.text("Platform Features Guide", 14, y);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, y + 6);

        const features = [
            ['Module', 'Key Capabilities'],
            ['Dashboard', 'Real-time financial KPIs, Occupancy rates, AI-driven business insights, Industry news feed.'],
            ['Inventory', 'Track Static & LED billboards, Map view with geolocation, Maintenance schedules, Traffic estimates.'],
            ['Rentals', 'Contract management, Automatic availability checking, Gantt chart calendar, PDF contract generation.'],
            ['Financials', 'Create Invoices/Quotes, Track payments, Manage expenses, VAT calculations, Profit & Loss analytics.'],
            ['Clients', 'CRM directory, Contact management, Dedicated Client Portal access, Transaction history.'],
            ['System', 'Role-based access control (Admin/Manager/Staff), Cloud synchronization, Automated backups, Audit logging.'],
            ['Payment Mgmt', 'Record receipts, Delete erroneous payments (Smart Revert), Payment Scheduling reports.']
        ];

        runAutoTable(doc, {
            startY: y + 15,
            head: [features[0]],
            body: features.slice(1),
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], fontSize: 11, fontStyle: 'bold' }, // Indigo accent
            styles: { fontSize: 10, cellPadding: 6, overflow: 'linebreak' },
            columnStyles: { 0: { fontStyle: 'bold', width: 40 } }
        });

        addContactFooter(doc);
        doc.save('Dreambox_Features_List.pdf');
    } catch (e) {
        console.error(e);
        alert("Failed to generate Features PDF");
    }
};

export const generateUserManualPDF = async () => {
     try {
        const doc = new jsPDF();
        const branding = await getPdfBranding();
        let y = addCompanyHeader(doc, branding);

        doc.setFontSize(22);
        doc.setTextColor(15, 23, 42);
        doc.text("Quick Start User Manual", 14, y);
        
        y += 15;
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.text("1. Getting Started", 14, y);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50);
        doc.text("Log in using your assigned credentials. The Dashboard provides an immediate overview of active contracts and revenue.", 14, y + 6, { maxWidth: 180 });

        y += 20;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text("2. Managing Inventory", 14, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(50);
        doc.text("Navigate to 'Billboards' to add new assets. Use the 'Map' view to visualize locations. Click 'Edit' to update pricing or details.", 14, y + 6, { maxWidth: 180 });

        y += 20;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text("3. Creating Rentals", 14, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(50);
        doc.text("Go to 'Rentals' > 'New Rental'. Select a Client and Billboard. The system automatically checks availability for the selected dates.", 14, y + 6, { maxWidth: 180 });

        addContactFooter(doc);
        doc.save('Dreambox_User_Manual.pdf');
    } catch (e) {
        alert("Failed to generate Manual PDF");
    }
};
