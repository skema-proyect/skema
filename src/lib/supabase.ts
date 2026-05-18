import { createClient } from "@supabase/supabase-js";

const rawUrl          = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseUrl     = rawUrl?.replace(/\/rest\/v1\/?$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
