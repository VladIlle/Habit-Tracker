'use strict';

/* =====================================================
   INIȚIALIZARE APLICAȚIE
===================================================== */

function initApp() {
  // Actualizăm sidebar-ul cu datele utilizatorului
  const u = state.user;
  document.getElementById('sidebar-username').textContent = u.username;
  document.getElementById('sidebar-role').textContent     = u.role === 'admin' ? '🛡️ Administrator' : '👤 Utilizator';

  const avatarEl = document.getElementById('sidebar-avatar');
  avatarEl.textContent       = getInitial(u.username);
  avatarEl.style.background  = u.avatarColor;

  // Afișăm/ascundem meniul admin
  document.getElementById('admin-nav').style.display = u.role === 'admin' ? '' : 'none';

  // Inițializăm picker-ele din modal
  initHabitModalPickers();

  // Navigăm la dashboard
  navigate('dashboard');

  // Actualizăm badge-ul de mesaje necitite la fiecare 30 sec
  updateUnreadBadge();
  updateFriendReqBadge();
  setInterval(updateUnreadBadge, 30000);
  setInterval(updateFriendReqBadge, 30000);
}

/* =====================================================
   NAVIGARE ÎNTRE VIEW-URI
===================================================== */

function navigate(view) {
  state.currentView = view;

  // Ascundem toate view-urile
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

  // Activăm butonul de nav corespunzător
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Afișăm view-ul cerut
  document.getElementById(`view-${view}`).style.display = '';

  // Încărcăm datele pentru view-ul curent
  switch (view) {
    case 'dashboard': loadHabits();     break;
    case 'calendar':  loadCalendar();   break;
    case 'feed':      loadFeed(true);   break;
    case 'messages':  loadMessages();   break;
    case 'friends':   loadFriends();    break;
    case 'admin':     loadAdmin('stats'); break;
  }
}

/* =====================================================
   INIȚIALIZARE: Verificare sesiune existentă la pornire
===================================================== */

async function init() {
  // Verificăm dacă există un token salvat în localStorage
  const savedToken = localStorage.getItem('hf_token');
  if (!savedToken) return; // Afișăm pagina de login

  // Validăm token-ul cu serverul
  try {
    state.token = savedToken;
    const user  = await api('/auth/me');
    state.user  = user;

    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('app').style.display = 'flex';
    initApp();
  } catch (err) {
    // Token invalid/expirat -> ștergem și afișăm login
    localStorage.removeItem('hf_token');
    state.token = null;
  }
}
