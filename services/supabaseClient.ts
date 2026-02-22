
import { createClient } from '@supabase/supabase-js';

// Access LocalStorage directly since this runs in the browser
const supabaseUrl = localStorage.getItem('sb_url');
const supabaseKey = localStorage.getItem('sb_key');

let client = null;

try {
    if (supabaseUrl && supabaseKey) {
        // Basic validation to prevent synchronous crashes in createClient
        if (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) {
            client = createClient(supabaseUrl, supabaseKey);
        } else {
            console.warn("Supabase URL ignored: Must start with http:// or https://");
        }
    }
} catch (e) {
    console.error("Supabase initialization failed:", e);
    // Keep client as null so the app continues to work in local-only mode
}

export const supabase = client;

export const isSupabaseConfigured = () => !!supabase;

// Helper to check connection
export const checkSupabaseConnection = async () => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
        // PGRST116 (JSON result) or success (null error) means we hit the API. 
        // A connection error usually comes as a network error or 400/404/500 object.
        if (error && error.code !== 'PGRST116') { 
             console.error("Supabase Connection Check Error:", error);
             return false;
        }
        return true;
    } catch (e) {
        console.error("Supabase Connection Exception:", e);
        return false;
    }
};
