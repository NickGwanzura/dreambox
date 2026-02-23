
import { createClient } from '@supabase/supabase-js';

// Support both Vite and older NEXT_PUBLIC names, plus process.env for server-side
const readEnv = (key: string) => {
  try {
    // Vite exposes client envs on import.meta.env — access it safely
    // @ts-ignore
    if ((import.meta as any)?.env?.[key]) {
      // @ts-ignore
      return (import.meta as any).env[key];
    }
  } catch (e) {
    // ignore (import.meta may not be supported in some runtimes)
  }

  try {
    if (typeof process !== 'undefined' && (process as any).env && (process as any).env[key]) {
      return (process as any).env[key];
    }
  } catch (e) {
    // ignore
  }

  // Browser-local fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    if (key === 'VITE_SUPABASE_URL' || key === 'NEXT_PUBLIC_SUPABASE_URL' || key === 'SUPABASE_URL') {
      return window.localStorage.getItem('sb_url');
    }
    if (key === 'VITE_SUPABASE_ANON_KEY' || key === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY' || key === 'SUPABASE_KEY') {
      return window.localStorage.getItem('sb_key');
    }
  }

  return null;
};

const SUPABASE_URL_KEYS = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const SUPABASE_KEY_KEYS = ['VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY', 'SUPABASE_KEY', 'VITE_SUPABASE_KEY'];

const findFirst = (keys: string[]) => {
  for (const k of keys) {
    const v = readEnv(k);
    if (v) return v;
  }
  return null;
};

const supabaseUrl = findFirst(SUPABASE_URL_KEYS);
const supabaseKey = findFirst(SUPABASE_KEY_KEYS);

let client: any = null;

try {
  if (supabaseUrl && supabaseKey) {
    if (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) {
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

export const checkSupabaseConnection = async () => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      // eslint-disable-next-line no-console
      console.error('Supabase Connection Check Error:', error);
      return false;
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Supabase Connection Exception:', e);
    return false;
  }
};
