// assets/supabase-config.js
// Replace the placeholder values below with your project's Supabase URL and anon key.
// Do NOT put a service_role key here — this file runs client-side and must contain only the public anon key.

window.SUPABASE_URL = window.SUPABASE_URL || "https://fyddanuilbuwndeeihqw.supabase.co";
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5ZGRhbnVpbGJ1d25kZWVpaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzU2OTAsImV4cCI6MjA4Mjc1MTY5MH0.bwOGjCU58jG6eqaxm2K_UayufORUQuWyu5TWbNAFjSo";

// Optional: if the Supabase SDK is already loaded, initialize a client singleton so pages
// that expect `window.supabase` can use it immediately. If not, `assets/app.js` will create
// its own client when it runs.
(function(){
  try{
    // Do NOT overwrite `window.supabase` (the SDK). Instead create a client singleton
    // `window.__pp_supabase_client` if the SDK is available.
    if (!window.__pp_supabase_inited && window.supabase && typeof window.supabase.createClient === 'function') {
      try{
        window.__pp_supabase_client = window.__pp_supabase_client || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        window.__pp_supabase_inited = true;
        console.log('[PaperPrint] Supabase client singleton created from supabase-config.js');
      }catch(e){ console.warn('[PaperPrint] createClient failed in supabase-config.js', e); }
    }
  }catch(e){ console.warn('[PaperPrint] supabase-config init failed', e); }
})();
