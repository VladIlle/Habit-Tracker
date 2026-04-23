'use strict';

/* =====================================================
   AUTENTIFICARE
===================================================== */

/** Comutare tab login/register */
function showAuthTab(tab) {
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  document.querySelectorAll('.auth-tab').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0) === (tab === 'login'));
  });
}

/** Login */
async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.innerHTML = '';

  if (!username || !password) {
    errEl.innerHTML = '<div class="error-msg">Completează toate câmpurile!</div>';
    return;
  }

  try {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    onLoginSuccess(data);
  } catch (err) {
    errEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

/** Înregistrare */
async function register() {
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('register-error');
  errEl.innerHTML = '';

  if (!username || !email || !password) {
    errEl.innerHTML = '<div class="error-msg">Completează toate câmpurile!</div>';
    return;
  }

  try {
    const data = await api('/auth/register', { method: 'POST', body: { username, email, password } });
    onLoginSuccess(data);
  } catch (err) {
    errEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

/** Callback după login/register reușit */
function onLoginSuccess(data) {
  state.token = data.token;
  state.user  = data.user;

  // Salvăm token-ul în localStorage pentru sesiune persistentă
  localStorage.setItem('hf_token', data.token);

  // Afișăm aplicația și ascundem pagina de auth
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app').style.display = 'flex';

  // Inițializăm interfața
  initApp();
}

/** Deconectare - reseteaza complet state-ul si UI-ul */
function logout() {
  // Stergem tokenul
  localStorage.removeItem('hf_token');

  // Resetam TOT state-ul la valorile initiale.
  // Fara asta, datele contului precedent raman in memorie
  // si sunt vizibile pana la primul raspuns API.
  state.token       = null;
  state.user        = null;
  state.habits      = [];
  state.currentView = 'dashboard';
  state.calendar    = {
    year:  new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    data:  {},
  };
  state.feed     = { items: [], offset: 0 };
  state.messages = { inbox: [], sent: [], tab: 'inbox', selected: null };
  state.habit    = { editing: null, color: '#6366f1', icon: '\u2713', freq: 'daily' };
  state.sendMsg  = { habitId: null, habitName: null };

  // Golim containerele cu date ale utilizatorului
  ['habits-grid', 'feed-list', 'msg-list', 'msg-detail',
   'friend-requests-list', 'friends-list', 'friend-search-results',
   'friend-habits-list', 'cal-detail-list', 'calendar-grid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // Resetam panoul calendar
  const calEmpty   = document.getElementById('cal-day-empty');
  const calContent = document.getElementById('cal-day-content');
  if (calEmpty)   calEmpty.style.display   = '';
  if (calContent) calContent.style.display = 'none';

  // Resetam badge-urile la 0
  ['unread-badge', 'friend-req-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Golim campurile de login
  ['login-username', 'login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const loginErr = document.getElementById('login-error');
  if (loginErr) loginErr.innerHTML = '';

  // Resetam navigarea la dashboard
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const dashBtn = document.querySelector('[data-view="dashboard"]');
  if (dashBtn) dashBtn.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

  // Afisam pagina de autentificare
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('app').style.display = 'none';
}
