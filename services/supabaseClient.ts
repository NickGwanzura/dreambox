
import { createClient } from '@supabase/supabase-js';

// AGGRESSIVE CLEANUP: Clear any old keys immediately on module load
if (typeof window !== 'undefined' && window.localStorage) {
  const keysToRemove = ['sb_key', 'sb_url', 'supabase_key', 'supabase_url'];
  keysToRemove.forEach(k => {
    const val = window.localStorage.getItem(k);
    if (val && (val.includes('publishable') || val.startsWith('sb_publishable_'))) {
      console.warn(`Removing old key ${k} from localStorage`);
      window.localStorage.removeItem(k);
    }
  });
}

// Support both Vite and older NEXT_PUBLIC names, plus process.env for server-side
const readEnv = (key: string) => {
  // Priority 1: Vite environment variables (build-time)
  try {
    // @ts-ignore
    if ((import.meta as any)?.env?.[key]) {
      // @ts-ignore
      return (import.meta as any).env[key];
    }
  } catch (e) {
    // ignore
  }

  // Priority 2: process.env (server-side)
  try {
    if (typeof process !== 'undefined' && (process as any).env && (process as any).env[key]) {
      return (process as any).env[key];
    }
  } catch (e) {
    // ignore
  }

  // Priority 3: Browser localStorage (fallback - only if env vars not set)
  // NOTE: We check if env var equivalent was already found above, so this is truly a fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    // Warn if localStorage has a different key than what was configured
    const localUrl = window.localStorage.getItem('sb_url');
    const localKey = window.localStorage.getItem('sb_key');
    
    if (localKey && localKey.startsWith('sb_publishable_')) {
      console.warn('╔════════════════════════════════════════════════════════════════╗');
      console.warn('║  WARNING: localStorage has old publishable key                 ║');
      console.warn('║                                                                ║');
      console.warn('║  Clear localStorage and refresh to use the new anon key:       ║');
      console.warn('║  localStorage.clear(); location.reload();                      ║');
      console.warn('╚════════════════════════════════════════════════════════════════╝');
    }
    
    if (key === 'VITE_SUPABASE_URL' || key === 'NEXT_PUBLIC_SUPABASE_URL' || key === 'SUPABASE_URL') {
      return localUrl;
    }
    if (key === 'VITE_SUPABASE_ANON_KEY' || key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' || key === 'SUPABASE_KEY') {
      // CRITICAL: Never use old publishable key from localStorage
      if (localKey && localKey.startsWith('sb_publishable_')) {
        console.error('REJECTING old publishable key from localStorage');
        return null;
      }
      return localKey;
    }
  }

  return null;
};

const SUPABASE_URL_KEYS = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const SUPABASE_KEY_KEYS = ['VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_KEY', 'VITE_SUPABASE_KEY'];

const findFirst = (keys: string[]) => {
  for (const k of keys) {
    const v = readEnv(k);
    if (v) return v;
  }
  return null;
};

const supabaseUrl = findFirst(SUPABASE_URL_KEYS);
const supabaseKey = findFirst(SUPABASE_KEY_KEYS);

// Auto-clear bad keys from localStorage on load
if (typeof window !== 'undefined' && window.localStorage) {
  const storedKey = window.localStorage.getItem('sb_key');
  if (storedKey && storedKey.startsWith('sb_publishable_')) {
    console.warn('Clearing old publishable key from localStorage...');
    window.localStorage.removeItem('sb_key');
    window.localStorage.removeItem('sb_url');
  }
}

let client: any = null;

try {
  if (supabaseUrl && supabaseKey) {
    if (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) {
      // Warn if using publishable key instead of anon key
      if (supabaseKey.startsWith('sb_publishable_')) {
        console.error('╔════════════════════════════════════════════════════════════════╗');
        console.error('║  SUPABASE AUTHENTICATION ERROR                                 ║');
        console.error('║                                                                ║');
        console.error('║  You are using a PUBLISHABLE key instead of an ANON key.       ║');
        console.error('║  The publishable key cannot access the database.               ║');
        console.error('║                                                                ║');
        console.error('║  FIX: Get the ANON key from Supabase Dashboard:                ║');
        console.error('║  Project Settings → API → anon public                          ║');
        console.error('║                                                                ║');
        console.error('║  Anon key format: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...      ║');
        console.error('║  Publishable key: sb_publishable_... (WRONG - won\'t work)     ║');
        console.error('╚════════════════════════════════════════════════════════════════╝');
      }
      client = createClient(supabaseUrl, supabaseKey);
    } else {
      console.warn('Supabase URL ignored: Must start with http:// or https://');
    }
  }
} catch (e) {
  // don't crash the app if Supabase fails to initialize
  // keep client as null so the app can operate in local-only mode
  // eslint-disable-next-line no-console
  console.error('Supabase initialization failed:', e);
}

export const supabase = client;

export const isSupabaseConfigured = () => !!supabaseUrl && !!supabaseKey;

export const checkSupabaseConnection = async (): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error) {
      // eslint-disable-next-line no-console
      if (error.code === '401') {
        console.error('Supabase 401 Error: Your API key is invalid or missing permissions.');
        console.error('Make sure you are using the ANON key (starts with eyJhbGci), not a publishable key (sb_publishable_).');
        console.error('See SUPABASE_401_FIX.md for instructions.');
      } else if (error.code === 'PGRST116') {
        // Table doesn't exist, but connection is valid
        return true;
      } else {
        console.error('Supabase Connection Check Error:', error);
      }
      return false;
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Supabase Connection Exception:', e);
    return false;
  }
};

// Validate that the key looks like a proper anon key
export const isValidSupabaseKey = (key: string | null): boolean => {
  if (!key) return false;
  // Anon keys are JWT tokens that start with "eyJ" and have multiple segments
  if (key.startsWith('sb_publishable_')) {
    console.warn('WARNING: You are using a publishable key instead of an anon key.');
    console.warn('Get the correct anon key from Supabase Dashboard → Settings → API');
    return false;
  }
  // Valid JWT should start with eyJ and have 2 dots (3 segments)
  return key.startsWith('eyJ') && key.split('.').length === 3;
};
