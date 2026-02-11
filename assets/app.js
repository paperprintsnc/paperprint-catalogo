'use strict';

/**
 * PaperPrint CRM — Admin JS (v7)
 * Fix v7:
 * - Login: usa SEMPRE il client `supa` (non `supabase`) -> evita crash e POST 501.
 * - Hook login: intercetta SUBMIT in capture + imposta button type=button se possibile.
 * - Input detection più robusta: password può essere type="text" (non password).
 * - Nessun "Identifier already declared" (client singleton).
 */

// ============================
// 1) SUPABASE CONFIG (COMPILA)
// ============================
// ATTENZIONE: i valori possono essere sovrascritti da `window.SUPABASE_URL` e `window.SUPABASE_ANON_KEY`.
// Se preferisci mantenere la config in un file separato, crea `assets/supabase-config.js`
// e definisci `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` prima di questo file.
const SUPABASE_URL = (window.SUPABASE_URL && String(window.SUPABASE_URL).trim()) || 'https://fyddanuilbuwndeeihqw.supabase.co';
const SUPABASE_ANON_KEY = (window.SUPABASE_ANON_KEY && String(window.SUPABASE_ANON_KEY).trim()) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5ZGRhbnVpbGJ1d25kZWVpaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzU2OTAsImV4cCI6MjA4Mjc1MTY5MH0.bwOGjCU58jG6eqaxm2K_UayufORUQuWyu5TWbNAFjSo';

const EDGE_FN_NAME = 'admin-create-user';

// ============================
// 2) HELPERS
// ============================
const DEBUG = true;

function log(...args) {
  if (!DEBUG) return;
  console.log('[PaperPrint]', ...args);
}

function $(sel, root = document) {
  return root.querySelector(sel);
}
function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function pickFirst(...candidates) {
  for (const c of candidates) if (c) return c;
  return null;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showMsg(text, isError = false) {
  const box = document.getElementById('create-user-msg');
  if (!box) return;
  box.textContent = text || '';
  box.style.color = isError ? '#c0392b' : '#2c7';
}

function showLoginMsg(text, isError = false) {
  const msgEl = document.getElementById('admin-login-msg')
    || document.getElementById('login-msg')
    || document.querySelector('.pp-msg');
  if (msgEl) {
    msgEl.textContent = text;
    msgEl.style.color = isError ? '#d13b2b' : '#2c7';
    return;
  }
  if (isError) alert(text);
  else log(text);
}

// ============================
// 3) SUPABASE CLIENT
// ============================
function assertSupabaseLoaded() {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    // NON lanciare eccezione silenziosa: scrivi in console e fallback UI
    console.error('[PaperPrint] Supabase JS non caricato (manca window.supabase.createClient).');
    showMsg('Supabase JS non caricato. Controlla lo script CDN.', true);
    showLoginMsg('Supabase JS non caricato. Controlla lo script CDN.', true);
    return false;
  }
  return true;
}

function getOrCreateClient() {
  if (!assertSupabaseLoaded()) return null;

  if (window.__pp_supabase_client) return window.__pp_supabase_client;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  window.__pp_supabase_client = client;
  return client;
}

const supa = getOrCreateClient();

// ============================
// 4) ADMIN PAGE (users)
// ============================
function getUsersPanel() {
  return document.getElementById('users-panel');
}

function resolveUsersInputs() {
  const panel = getUsersPanel();
  if (!panel) return { panel: null };

  const inputs = $all('input', panel);

  // Nome
  const nameEl = pickFirst(
    $('input[name="full_name"]', panel),
    $('input[name="name"]', panel),
    $('input[id*="name" i]', panel),
    inputs.find(i => i.type === 'text')
  );

  // Email
  const emailEl = pickFirst(
    $('input[name="email"]', panel),
    $('input[type="email"]', panel),
    $('input[id*="mail" i]', panel),
    inputs.find(i => (i.getAttribute('placeholder') || '').includes('@'))
  );

  // Password (può essere type=password O type=text!)
  const passwordEl = pickFirst(
    $('input[name="password"]', panel),
    $('input[id*="pass" i]', panel),
    $('input[type="password"]', panel),
    // fallback: input che ha placeholder "123456" o contiene parola password
    inputs.find(i => {
      const ph = (i.getAttribute('placeholder') || '').toLowerCase();
      const nm = (i.getAttribute('name') || '').toLowerCase();
      const id = (i.getAttribute('id') || '').toLowerCase();
      return ph.includes('123') || ph.includes('pass') || nm.includes('pass') || id.includes('pass');
    })
  );

  // Attivo
  const activeEl = pickFirst(
    $('input[name="is_active"]', panel),
    $('input[id*="active" i]', panel),
    $('input[type="checkbox"]', panel)
  );

  return { panel, nameEl, emailEl, passwordEl, activeEl };
}

function resolveCreateButton(panel) {
  const byId = pickFirst(
    document.getElementById('create-user-btn'),
    document.getElementById('btn-create-user'),
    document.getElementById('create-user-submit')
  );
  if (byId) return byId;

  const submitInPanel = panel ? $('button[type="submit"]', panel) : null;
  if (submitInPanel) return submitInPanel;

  const btn = panel ? $all('button', panel).find(b => /crea\s+utente/i.test((b.textContent || '').trim())) : null;
  return btn || null;
}

async function invokeAdminFn(body) {
  if (!supa) throw new Error('Supabase client non inizializzato.');

  const { data, error } = await supa.functions.invoke(EDGE_FN_NAME, { body });
  if (error) {
    const status = error.status || error.statusCode;
    const msg = error.message || 'Errore invocazione Edge Function';
    log('Edge invoke error:', { status, error });
    throw new Error(status ? `${msg} (HTTP ${status})` : msg);
  }
  return data;
}

async function refreshUsers() {
  const tbody = document.querySelector('#users-panel table tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7">Caricamento...</td></tr>`;
  showMsg('', false);

  try {
    const payload = await invokeAdminFn({ action: 'list' });
    const users = payload?.users || [];

    if (!Array.isArray(users) || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">Nessun utente trovato.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const stato = (u.is_active === false) ? 'Disattivo' : 'Attivo';
      return `
        <tr>
          <td>${escapeHtml(u.id)}</td>
          <td>${escapeHtml(u.full_name || '')}</td>
          <td>${escapeHtml(u.email || '')}</td>
          <td>${escapeHtml(u.role || '')}</td>
          <td>${escapeHtml(stato)}</td>
          <td></td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    log('refreshUsers failed:', e);
    tbody.innerHTML = `<tr><td colspan="7">Connessione non disponibile o Supabase non raggiungibile.</td></tr>`;
    showMsg(String(e.message || e), true);
  }
}

async function createUserFlow() {
  const { panel, nameEl, emailEl, passwordEl, activeEl } = resolveUsersInputs();
  const btn = resolveCreateButton(panel);

  const full_name = (nameEl?.value || '').trim();
  const email = (emailEl?.value || '').trim().toLowerCase();
  const password = (passwordEl?.value || '').trim();
  const is_active = activeEl ? !!activeEl.checked : true;

  log('createUserFlow inputs:', { full_name, email, passwordLen: password.length, is_active });

  if (!email || !password) {
    showMsg('Email e password obbligatorie.', true);
    return;
  }
  if (password.length < 6) {
    showMsg('Password troppo corta (min 6).', true);
    return;
  }

  if (btn) btn.disabled = true;
  showMsg('Creazione utente in corso...', false);

  try {
    const res = await invokeAdminFn({
      action: 'create',
      email,
      password,
      full_name: full_name || null,
      is_active,
    });

    log('create result:', res);
    showMsg('✅ Utente creato!', false);

    if (passwordEl) passwordEl.value = '';
    await refreshUsers();
  } catch (e) {
    log('createUserFlow failed:', e);
    showMsg(`❌ ${String(e.message || e)}`, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function hookCreateButton() {
  const { panel } = resolveUsersInputs();
  if (!panel) return;

  const btn = resolveCreateButton(panel);
  if (!btn) {
    showMsg('Pulsante "Crea utente" non trovato nel DOM.', true);
    log('Create button not found.');
    return;
  }

  // evita submit di form (python http.server non supporta POST)
  try { btn.setAttribute('type', 'button'); } catch {}

  btn.onclick = null;
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    createUserFlow();
  }, { capture: true });

  log('Hook OK on create button:', btn);
}

// ============================
// 5) LOGIN PAGE
// ============================
function resolveLoginEls() {
  const form = document.getElementById('admin-login-form') || document.querySelector('form');
  const emailEl = document.getElementById('admin-email')
    || (form ? form.querySelector('input[type="email"], input[name="email"], input[id*="mail" i]') : null)
    || document.querySelector('input[type="email"], input[name="email"], input[id*="mail" i]');

  const passwordEl = document.getElementById('admin-password')
    || (form ? form.querySelector('input[type="password"], input[name="password"], input[id*="pass" i]') : null)
    || document.querySelector('input[type="password"], input[name="password"], input[id*="pass" i]');

  const btn = document.getElementById('admin-submit-btn')
    || (form ? form.querySelector('button[type="submit"], button') : null);

  return { form, emailEl, passwordEl, btn };
}

async function adminLoginFlow() {
  if (!supa) {
    showLoginMsg('Supabase client non inizializzato (config mancante?).', true);
    return;
  }

  const { emailEl, passwordEl, btn } = resolveLoginEls();
  const email = (emailEl?.value || '').trim().toLowerCase();
  const password = String(passwordEl?.value || '');

  log('login inputs:', { email, passwordLen: password.length });

  if (!email || !password) {
    showLoginMsg('Email e password obbligatorie.', true);
    return;
  }
  if (!email.includes('@')) {
    showLoginMsg('Inserisci una email valida (es: admin@admin.it).', true);
    return;
  }

  if (btn) btn.disabled = true;
  showLoginMsg('Accesso in corso...', false);

  try {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) {
      showLoginMsg(`Login fallito: ${error.message}`, true);
      return;
    }
    if (!data?.session) {
      showLoginMsg('Login fallito: sessione assente.', true);
      return;
    }

    showLoginMsg('OK! Reindirizzo...', false);
    window.location.href = 'admin.html';
  } catch (e) {
    showLoginMsg(`Login errore: ${String(e.message || e)}`, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function hookLogin() {
  const { form, btn } = resolveLoginEls();
  if (!btn && !form) return;

  if (btn) {
    // evita submit di default
    try { btn.setAttribute('type', 'button'); } catch {}
    btn.onclick = null;
  }

  const handler = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    adminLoginFlow();
  };

  // Intercetta submit in CAPTURE per bloccare anche se altri handler fanno casino
  if (form) {
    form.addEventListener('submit', handler, { capture: true });
  }
  if (btn) {
    btn.addEventListener('click', handler, { capture: true });
  }

  log('Hook OK on login:', { form: !!form, btn: !!btn });
}

// ============================
// 6) INIT
// ============================
async function initPage() {
  const isUsersPage = !!document.getElementById('users-panel');
  const isLoginPage = !!document.getElementById('admin-submit-btn')
    || !!document.getElementById('admin-login-form')
    || /admin-login\.html/i.test(location.pathname);

  if (isUsersPage) {
    hookCreateButton();
    await refreshUsers();
    return;
  }

  if (isLoginPage) {
    hookLogin();
    return;
  }
}

document.addEventListener('DOMContentLoaded', initPage);
