// ============================================================
// SUPABASE CLIENT
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://aqgyfgohnulutofgmlcp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZ3lmZ29obnVsdXRvZmdtbGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMTk1MTcsImV4cCI6MjEwMjY5NTUxN30.XmFuO1IlOFKhTf7Ijmo9zXmXhm6PCXgrcXYLXRJbcdE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase client initialized');

// 👇 ADD THIS LINE
window.supabase = supabase;
console.log('✅ Supabase client exposed to window for console testing');
