import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta as any).env?.PUBLIC_SUPABASE_URL ??
  (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseAnonKey =
  (import.meta as any).env?.PUBLIC_SUPABASE_ANON_KEY ??
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
