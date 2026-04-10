import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://ftechtqyocgdabfkmclm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  throw new Error(
    'Clé Supabase manquante. Crée un fichier .env avec VITE_SUPABASE_ANON_KEY=ta_cle_anon.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
