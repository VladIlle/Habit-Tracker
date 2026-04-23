'use strict';

/* =====================================================
   STAREA GLOBALĂ A APLICAȚIEI
   Toate datele sunt stocate în acest obiect
===================================================== */
const state = {
  token:       null,     // JWT token
  user:        null,     // { id, username, role, avatarColor }
  habits:      [],       // habiturile utilizatorului curent
  currentView: 'dashboard',
  calendar: {
    year:  new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    data:  {},           // { "2024-01-15": { total, habits } }
  },
  feed: {
    items:  [],
    offset: 0,
  },
  messages: {
    inbox:     [],
    sent:      [],
    tab:       'inbox',
    selected:  null,
  },
  habit: {
    editing: null,       // habit-ul editat (null = habit nou)
    color:   '#6366f1',
    icon:    '✓',
    freq:    'daily',
  },
  sendMsg: {
    habitId:   null,
    habitName: null,
  },
};

/* =====================================================
   SECURITATE: Escape HTML pentru XSS prevention
===================================================== */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =====================================================
   UTILITARE: API calls, formatare, etc.
===================================================== */

// Baza URL a API-ului (proxied de Nginx)
const API = 'http://localhost:3000/api'; // Apelam backend-ul direct, ocolind nginx

/**
 * Apel API generic cu autentificare JWT
 * @param {string} path - Calea API (ex: '/habits')
 * @param {object} opts - Opțiuni fetch (method, body, etc.)
 * @returns {Promise<object>} - Răspunsul JSON
 */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  let res;
  try {
    res = await fetch(API + path, {
      ...opts,
      headers: { ...headers, ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new Error('Nu se poate conecta la server. Verifică că aplicația rulează.');
  }

  // Citim text brut - dacă backend-ul nu e pornit Nginx întoarce HTML (502), nu JSON
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (res.status === 502 || res.status === 503) {
      throw new Error('Backend-ul pornește încă. Așteaptă câteva secunde și încearcă din nou.');
    }
    throw new Error(`Eroare server (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Eroare HTTP ${res.status}`);
  }

  return data;
}

/**
 * Afișează un toast notification
 * @param {string} msg - Mesajul
 * @param {string} type - 'success' | 'error' | 'info'
 */
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => { el.className = ''; }, 3000);
}

/**
 * Formatează o dată relativă (ex: "acum 2 ore")
 */
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'acum';
  if (mins < 60) return `acum ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `acum ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `acum ${days}z`;
}

/**
 * Generează inițiala din username pentru avatar
 */
function getInitial(username) {
  return (username || 'U')[0].toUpperCase();
}

/**
 * Returnează textul descriptiv al frecvenței
 */
function freqLabel(habit) {
  const { frequencyType: t, frequencyValue: v } = habit;
  if (t === 'daily')          return 'Zilnic';
  if (t === 'times_per_day')  return `De ${v} ori pe zi`;
  if (t === 'weekly')         return 'Săptămânal';
  if (t === 'times_per_week') return `De ${v} ori pe săptămână`;
  if (t === 'hourly')         return `La fiecare ${v} ore`;
  if (t === 'interval_days')  return `La fiecare ${v} zile`;
  return t;
}

/**
 * Returnează numărul maxim de completări pe zi pentru un habit
 */
function maxDailyCompletions(habit) {
  const { frequencyType: t, frequencyValue: v } = habit;
  if (t === 'daily')          return 1;
  if (t === 'times_per_day')  return v;
  if (t === 'weekly' || t === 'times_per_week' || t === 'interval_days') return 1;
  if (t === 'hourly')         return Math.floor(24 / (v || 1));
  return 1;
}
