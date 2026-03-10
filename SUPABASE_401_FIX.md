# Supabase 401 Unauthorized Fix

## Problem
The API key you set (`sb_publishable_ECtk9UIokpPYAwI5eb7lGA_s7YtRSk4`) is a **publishable key**, not the **anon key** required for database access.

## Solution

### Step 1: Get the Correct Anon Key from Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `iiphiigaksyshionjhmt`
3. Go to **Project Settings** (gear icon) → **API**
4. Copy the **`anon` public** key (NOT the `service_role` key)

The anon key looks like:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpcGhpaWdha3N5c2hpb25qaG10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTIzNDU2NzgsImV4cCI6MjAyNzkyMTY3OH0.xxxxxxxx
```

### Step 2: Update Environment Variable in Vercel

```bash
# Remove the old key
npx vercel env rm NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY production

# Add the correct anon key
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Paste the eyJhbGciOiJIUzI1Ni... key when prompted
```

Or via Vercel Dashboard:
1. https://vercel.com/dashboard
2. Select your project
3. Settings → Environment Variables
4. Delete `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
5. Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the correct anon key

### Step 3: Redeploy

```bash
npx vercel --prod
```

## Where to Find the Anon Key

In Supabase Dashboard:
```
Project Settings → API → Project API keys
├─ anon public (copy this one)
├─ service_role secret (NEVER use this in frontend)
└─ JWT Settings
```

## How to Verify You Have the Right Key

✅ **Correct (anon key):**
- Starts with `eyJhbGciOiJIUzI1Ni...`
- Long string with multiple segments separated by dots
- JWT format

❌ **Incorrect (publishable key):**
- Starts with `sb_publishable_...`
- Short string
- Only grants access to auth endpoints, not database

## Also Check Row Level Security (RLS)

If you still get 401s after fixing the key, you need to enable RLS policies:

1. Go to Supabase Dashboard → Table Editor
2. For each table (users, billboards, clients, etc.):
   - Click the table → **Edit Table**
   - Go to **Policies** tab
   - Click **Enable RLS**
   - Add this policy:

```sql
-- Allow all operations for anon users
CREATE POLICY "Allow all" ON table_name
FOR ALL USING (true) WITH CHECK (true);
```

Or run this SQL for all tables:

```sql
-- Enable RLS on all tables
ALTER TABLE billboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsourced_billboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE printing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
CREATE POLICY "Allow all" ON billboards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contracts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON maintenance_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON outsourced_billboards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON printing_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON company_profile FOR ALL USING (true) WITH CHECK (true);
```

## Quick Commands

```bash
# Check current env vars
npx vercel env ls

# Fix the key
npx vercel env rm NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY production -y
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production

# Redeploy
npx vercel --prod
```
