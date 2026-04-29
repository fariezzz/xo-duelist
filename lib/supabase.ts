import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseClient: SupabaseClient = createClient(url, anonKey);

export const supabaseAdmin: SupabaseClient | null = serviceRole
  ? createClient(url, serviceRole)
  : null;

export default supabaseClient;
