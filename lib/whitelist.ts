/**
 * Field whitelist functions for API endpoints.
 *
 * Each function explicitly picks only the fields present in the corresponding
 * Prisma model. This prevents unknown client-sent fields from reaching Prisma
 * and causing "Unknown arg" errors (the root cause of the invoice 500 incident).
 *
 * Every mutation (create / update / upsert) in the API should go through
 * one of these functions before being passed to prisma.
 */

// ─── toDate helper ───────────────────────────────────────────────────────────

function toDate(v: unknown): Date | undefined {
  if (v == null || v === '') return undefined;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export function pickInvoiceData(body: any) {
  return {
    // Absent fields must stay undefined so partial updates don't corrupt
    // rows: Number(undefined) is NaN (Prisma rejects it), and defaulting
    // status/vatAmount here would silently reset them on partial PUTs.
    // POST guarantees the required fields via zod + its own defaults.
    clientId:              body.clientId,
    contractId:            body.contractId            ?? undefined,
    date:                  body.date,
    dueDate:               body.dueDate               ?? undefined,
    items:                 body.items,
    subtotal:              body.subtotal != null ? Number(body.subtotal) : undefined,
    discountAmount:        body.discountAmount != null ? Number(body.discountAmount) : undefined,
    discountDescription:   body.discountDescription   ?? undefined,
    vatAmount:             body.vatAmount != null ? Number(body.vatAmount) : undefined,
    total:                 body.total != null ? Number(body.total) : undefined,
    status:                body.status                ?? undefined,
    type:                  body.type                  ?? undefined,
    paymentMethod:         body.paymentMethod         ?? undefined,
    paymentReference:      body.paymentReference      ?? undefined,
    receivedBy:            body.receivedBy            ?? undefined,
    receivedByUserId:      body.receivedByUserId      ?? undefined,
    receivingAccount:      body.receivingAccount      ?? undefined,
    proofPaymentUrl:       body.proofPaymentUrl       ?? undefined,
    proofOriginalName:     body.proofOriginalName     ?? undefined,
    proofMimeType:         body.proofMimeType         ?? undefined,
    proofUploadedAt:       toDate(body.proofUploadedAt),
    recordedAt:            toDate(body.recordedAt),
    postedAt:              toDate(body.postedAt),
    isVoided:              body.isVoided              ?? undefined,
    voidReason:            body.voidReason            ?? undefined,
    voidedAt:              toDate(body.voidedAt),
    voidedBy:              body.voidedBy              ?? undefined,
    linkedInvoiceId:       body.linkedInvoiceId       ?? undefined,
    quoteNumber:           body.quoteNumber           ?? undefined,
    expiryDate:            body.expiryDate            ?? undefined,
    terms:                 body.terms                 ?? undefined,
    notes:                 body.notes                 ?? undefined,
    sentAt:                toDate(body.sentAt),
    sentTo:                body.sentTo                ?? undefined,
    quoteStatus:           body.quoteStatus           ?? undefined,
    convertedToInvoiceId:  body.convertedToInvoiceId  ?? undefined,
    convertedToContractId: body.convertedToContractId ?? undefined,
    convertedAt:           toDate(body.convertedAt),
    createdBy:             body.createdBy             ?? undefined,
    assignedTo:            body.assignedTo            ?? undefined,
  };
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export function pickClientData(body: any) {
  return {
    companyName:   body.companyName,
    contactPerson: body.contactPerson,
    email:         body.email                 ?? undefined,
    phone:         body.phone,
    status:        body.status                ?? undefined,
    billingDay:    body.billingDay != null    ? Number(body.billingDay) : undefined,
    streetAddress: body.streetAddress         ?? undefined,
    city:          body.city                  ?? undefined,
    country:       body.country               ?? undefined,
  };
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export function pickExpenseData(body: any) {
  return {
    category:    body.category,
    description: body.description,
    amount:      Number(body.amount),
    date:        body.date,
    reference:   body.reference              ?? undefined,
    // Preserve undefined (skip on update) but normalise '' to null so an
    // explicit clear is possible; null is a valid value for the nullable link.
    clientId:    body.clientId === undefined ? undefined : (body.clientId || null),
    contractId:  body.contractId === undefined ? undefined : (body.contractId || null),
  };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function pickTaskData(body: any) {
  return {
    title:              body.title,
    description:        body.description,
    assignedTo:         body.assignedTo,
    priority:           body.priority,
    status:             body.status               ?? undefined,
    dueDate:            body.dueDate,
    createdAt:          body.createdAt            ?? undefined,
    relatedBillboardId: body.relatedBillboardId   ?? undefined,
  };
}

// ─── Outsourced Billboards ────────────────────────────────────────────────────

export function pickOutsourcedData(body: any) {
  return {
    billboardId:   body.billboardId,
    billboardName: body.billboardName        ?? undefined,
    mediaOwner:    body.mediaOwner,
    ownerContact:  body.ownerContact,
    monthlyPayout: Number(body.monthlyPayout),
    contractStart: body.contractStart,
    contractEnd:   body.contractEnd,
    status:        body.status               ?? undefined,
  };
}

// ─── Printing Jobs ────────────────────────────────────────────────────────────

export function pickPrintingJobData(body: any) {
  return {
    clientId:        body.clientId,
    billboardId:     body.billboardId        ?? undefined,
    date:            body.date,
    description:     body.description,
    dimensions:      body.dimensions,
    pvcCost:         Number(body.pvcCost),
    inkCost:         Number(body.inkCost),
    electricityCost: Number(body.electricityCost),
    operatorCost:    Number(body.operatorCost),
    weldingCost:     Number(body.weldingCost),
    totalCost:       Number(body.totalCost),
    chargedAmount:   Number(body.chargedAmount),
  };
}

// ─── CRM: Companies ────────────────────────────────────────────────────────────

export function pickCRMCompanyData(body: any) {
  return {
    name:          body.name,
    industry:      body.industry             ?? undefined,
    website:       body.website              ?? undefined,
    streetAddress: body.streetAddress        ?? undefined,
    city:          body.city                 ?? undefined,
    country:       body.country              ?? undefined,
  };
}

// ─── CRM: Contacts ────────────────────────────────────────────────────────────

export function pickCRMContactData(body: any) {
  return {
    companyId:   body.companyId,
    fullName:    body.fullName,
    jobTitle:    body.jobTitle               ?? undefined,
    phone:       body.phone                  ?? undefined,
    email:       body.email                  ?? undefined,
    linkedinUrl: body.linkedinUrl            ?? undefined,
    isPrimary:   body.isPrimary              ?? false,
  };
}

// ─── CRM: Opportunities ────────────────────────────────────────────────────────

export function pickCRMOpportunityData(body: any) {
  return {
    companyId:          body.companyId,
    primaryContactId:   body.primaryContactId,
    secondaryContactId: body.secondaryContactId      ?? undefined,
    locationInterest:   body.locationInterest        ?? undefined,
    billboardType:      body.billboardType           ?? undefined,
    campaignDuration:   body.campaignDuration        ?? undefined,
    estimatedValue:     body.estimatedValue != null   ? Number(body.estimatedValue) : undefined,
    actualValue:        body.actualValue != null      ? Number(body.actualValue) : undefined,
    status:             body.status,
    stage:              body.stage,
    leadSource:         body.leadSource              ?? undefined,
    lastContactDate:    body.lastContactDate         ?? undefined,
    nextFollowUpDate:   body.nextFollowUpDate        ?? undefined,
    callOutcomeNotes:   body.callOutcomeNotes        ?? undefined,
    numberOfAttempts:   body.numberOfAttempts != null ? Number(body.numberOfAttempts) : undefined,
    assignedTo:         body.assignedTo              ?? undefined,
    createdBy:          body.createdBy               ?? undefined,
    closedAt:           body.closedAt                ?? undefined,
    closedReason:       body.closedReason            ?? undefined,
    daysInCurrentStage: body.daysInCurrentStage != null ? Number(body.daysInCurrentStage) : undefined,
    stageHistory:       body.stageHistory            ?? undefined,
  };
}

// ─── CRM: Touchpoints ─────────────────────────────────────────────────────────

export function pickCRMTouchpointData(body: any) {
  return {
    opportunityId:   body.opportunityId,
    type:            body.type,
    direction:       body.direction,
    subject:         body.subject                ?? undefined,
    content:         body.content                ?? undefined,
    clientResponse:  body.clientResponse         ?? undefined,
    outcome:         body.outcome                ?? undefined,
    sentiment:       body.sentiment              ?? undefined,
    durationSeconds: body.durationSeconds != null ? Number(body.durationSeconds) : undefined,
    createdBy:       body.createdBy,
  };
}

// ─── CRM: Tasks ───────────────────────────────────────────────────────────────

export function pickCRMTaskData(body: any) {
  return {
    opportunityId:   body.opportunityId,
    type:            body.type,
    title:           body.title,
    description:     body.description            ?? undefined,
    dueDate:         body.dueDate,
    status:          body.status,
    priority:        body.priority,
    assignedTo:      body.assignedTo,
    completedBy:     body.completedBy            ?? undefined,
    completedAt:     body.completedAt            ?? undefined,
    completionNotes: body.completionNotes        ?? undefined,
    createdBy:       body.createdBy,
  };
}

// ─── CRM: Call Logs ───────────────────────────────────────────────────────────

export function pickCRMCallLogData(body: any) {
  return {
    opportunityId:   body.opportunityId,
    contactId:       body.contactId,
    phoneNumber:     body.phoneNumber,
    direction:       body.direction,
    startedAt:       body.startedAt,
    endedAt:         body.endedAt                ?? undefined,
    durationSeconds: Number(body.durationSeconds),
    outcome:         body.outcome,
    notes:           body.notes                  ?? undefined,
    recordingUrl:    body.recordingUrl           ?? undefined,
    createdBy:       body.createdBy,
  };
}

// ─── CRM: Email Threads ───────────────────────────────────────────────────────

export function pickCRMEmailThreadData(body: any) {
  return {
    opportunityId:  body.opportunityId,
    contactId:      body.contactId,
    subject:        body.subject,
    messages:       body.messages               ?? [],
    status:         body.status,
    lastActivityAt: body.lastActivityAt,
    sentCount:      body.sentCount != null       ? Number(body.sentCount) : 0,
    openCount:      body.openCount != null       ? Number(body.openCount) : 0,
    clickCount:     body.clickCount != null      ? Number(body.clickCount) : 0,
    replyCount:     body.replyCount != null      ? Number(body.replyCount) : 0,
  };
}
