-- CRM Tables Migration
-- Run this in Supabase SQL Editor to enable cross-account CRM data sharing

-- Companies
CREATE TABLE IF NOT EXISTS "crm_companies" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  "streetAddress" TEXT,
  city TEXT,
  country TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS "crm_contacts" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "crm_companies"(id) ON DELETE CASCADE,
  "fullName" TEXT NOT NULL,
  "jobTitle" TEXT,
  phone TEXT,
  email TEXT,
  "linkedinUrl" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Opportunities
CREATE TABLE IF NOT EXISTS "crm_opportunities" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "crm_companies"(id) ON DELETE CASCADE,
  "primaryContactId" TEXT NOT NULL,
  "secondaryContactId" TEXT,
  "locationInterest" TEXT,
  "billboardType" TEXT,
  "campaignDuration" TEXT,
  "estimatedValue" NUMERIC,
  "actualValue" NUMERIC,
  status TEXT NOT NULL DEFAULT 'new',
  stage TEXT NOT NULL DEFAULT 'new_lead',
  "leadSource" TEXT,
  "lastContactDate" TEXT,
  "nextFollowUpDate" TEXT,
  "callOutcomeNotes" TEXT,
  "numberOfAttempts" INTEGER NOT NULL DEFAULT 0,
  "assignedTo" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "closedAt" TIMESTAMPTZ,
  "closedReason" TEXT,
  "daysInCurrentStage" INTEGER NOT NULL DEFAULT 0,
  "stageHistory" JSONB NOT NULL DEFAULT '[]'
);

-- Touchpoints (all outreach activity)
CREATE TABLE IF NOT EXISTS "crm_touchpoints" (
  id TEXT PRIMARY KEY,
  "opportunityId" TEXT NOT NULL REFERENCES "crm_opportunities"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  direction TEXT NOT NULL,
  subject TEXT,
  content TEXT,
  "clientResponse" TEXT,
  outcome TEXT,
  sentiment TEXT,
  "durationSeconds" INTEGER,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS "crm_tasks" (
  id TEXT PRIMARY KEY,
  "opportunityId" TEXT NOT NULL REFERENCES "crm_opportunities"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  "dueDate" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  "assignedTo" TEXT NOT NULL,
  "completedBy" TEXT,
  "completedAt" TIMESTAMPTZ,
  "completionNotes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy" TEXT NOT NULL
);

-- Email Threads
CREATE TABLE IF NOT EXISTS "crm_emailThreads" (
  id TEXT PRIMARY KEY,
  "opportunityId" TEXT NOT NULL REFERENCES "crm_opportunities"(id) ON DELETE CASCADE,
  "contactId" TEXT NOT NULL,
  subject TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  "lastActivityAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "replyCount" INTEGER NOT NULL DEFAULT 0
);

-- Call Logs
CREATE TABLE IF NOT EXISTS "crm_callLogs" (
  id TEXT PRIMARY KEY,
  "opportunityId" TEXT NOT NULL REFERENCES "crm_opportunities"(id) ON DELETE CASCADE,
  "contactId" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  direction TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "endedAt" TIMESTAMPTZ,
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  notes TEXT,
  "recordingUrl" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (allow all authenticated + anon reads/writes for shared team use)
ALTER TABLE "crm_companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_touchpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_emailThreads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_callLogs" ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (team shares one project)
CREATE POLICY "allow_all_crm_companies" ON "crm_companies" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_crm_contacts" ON "crm_contacts" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_crm_opportunities" ON "crm_opportunities" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_crm_touchpoints" ON "crm_touchpoints" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_crm_tasks" ON "crm_tasks" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_crm_emailThreads" ON "crm_emailThreads" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_crm_callLogs" ON "crm_callLogs" FOR ALL USING (true) WITH CHECK (true);
