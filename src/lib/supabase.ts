import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_url') {
  console.warn('Supabase URL or Anon Key not configured. Using placeholders.');
}

export const supabase = createClient(
  supabaseUrl && supabaseUrl !== 'your_supabase_url' ? supabaseUrl : 'https://abcdefghijklmnopqrst.supabase.co',
  supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key' ? supabaseAnonKey : 'placeholder'
);
