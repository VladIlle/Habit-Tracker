'use strict';

/* =====================================================
   VIEW: PRIETENI
   - Cautare utilizatori
   - Trimitere / acceptare / refuzare cereri
   - Lista prieteni cu actiuni rapide
   - Vizualizare habituiri prieten + incurajari
===================================================== */

/** Incarca si afiseaza tot view-ul de prieteni */
async function loadFriends() {
  // Incarcam in paralel: lista prieteni + cereri primite
  const [friendsRes, requestsRes] = await Promise.all([
    api('/friends').catch(() => []),
    api('/friends/requests').catch(() => []),
  ]);

  renderFriendRequests(requestsRes);
  renderFriendsList(friendsRes);
  updateFriendReqBadge(requestsRes.length);
}

/** Afiseaza cererile de prietenie primite */
function renderFriendRequests(requests) {
  const el = document.getElementById('friend-requests-list');
  const cnt = document.getElementById('req-count');
  cnt.textContent = requests.length ? `(${requests.length})` : '';

  if (requests.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text2)">Nicio cerere noua.</p>';
    return;
  }

  el.innerHTML = requests.map(r => `
    <div class="friend-item">
      <div class="user-avatar" style="background:${r.requester_color};width:34px;height:34px;font-size:12px">
        ${getInitial(r.requester_username)}
      </div>
      <div class="friend-item-info">
        <div class="friend-item-name">${escHtml(r.requester_username)}</div>
        <div class="friend-item-sub">${timeAgo(r.created_at)}</div>
      </div>
      <div class="friend-item-actions">
        <button class="btn btn-sm" style="background:rgba(52,211,153,0.15);color:var(--green);border:1px solid var(--green)"
          onclick="respondFriendRequest(${r.friendship_id}, 'accept')">✓</button>
        <button class="btn btn-sm" style="background:rgba(248,113,113,0.1);color:var(--red);border:1px solid var(--red)"
          onclick="respondFriendRequest(${r.friendship_id}, 'decline')">✕</button>
      </div>
    </div>
  `).join('');
}

/** Afiseaza lista de prieteni acceptati */
function renderFriendsList(friends) {
  const el  = document.getElementById('friends-list');
  const cnt = document.getElementById('friends-count');
  cnt.textContent = friends.length ? `(${friends.length})` : '';

  if (friends.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:20px 0;color:var(--text2)">
        <div style="font-size:36px;opacity:0.3;margin-bottom:8px">👥</div>
        <p style="font-size:13px">Niciun prieten inca.<br>Cauta utilizatori in dreapta!</p>
      </div>`;
    return;
  }

  el.innerHTML = friends.map(f => `
    <div class="friend-item" id="friend-item-${f.friendship_id}">
      <div class="user-avatar" style="background:${f.friend_color};width:34px;height:34px;font-size:12px;cursor:pointer"
           onclick="openFriendHabits(${f.friend_id}, '${escHtml(f.friend_username)}')">
        ${getInitial(f.friend_username)}
      </div>
      <div class="friend-item-info" style="cursor:pointer"
           onclick="openFriendHabits(${f.friend_id}, '${escHtml(f.friend_username)}')">
        <div class="friend-item-name">${escHtml(f.friend_username)}</div>
        <div class="friend-item-sub">Prieten din ${timeAgo(f.created_at)}</div>
      </div>
      <div class="friend-item-actions">
        <!-- Buton mesaj rapid -->
        <button class="btn btn-sm btn-secondary" title="Trimite mesaj"
          onclick="openSendMessage(${f.friend_id}, '${escHtml(f.friend_username)}')">💬</button>
        <!-- Buton vizualizare habituiri -->
        <button class="btn btn-sm btn-secondary" title="Habituiri prieten"
          onclick="openFriendHabits(${f.friend_id}, '${escHtml(f.friend_username)}')">📋</button>
        <!-- Buton stergere prietenie -->
        <button class="btn btn-sm" style="color:var(--red);background:transparent;border:1px solid var(--border)"
          title="Sterge prieten" onclick="removeFriend(${f.friendship_id})">🗑️</button>
      </div>
    </div>
  `).join('');
}

/** Accepta sau refuza o cerere de prietenie */
async function respondFriendRequest(friendshipId, action) {
  try {
    await api(`/friends/${friendshipId}/${action}`, { method: 'PUT', body: {} });
    toast(action === 'accept' ? '✅ Cerere acceptata!' : '❌ Cerere refuzata', action === 'accept' ? 'success' : 'info');
    loadFriends(); // Reincarcam toata lista
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}

/** Sterge o prietenie */
async function removeFriend(friendshipId) {
  if (!confirm('Sigur vrei sa stergi acest prieten?')) return;
  try {
    await api(`/friends/${friendshipId}`, { method: 'DELETE' });
    toast('Prieten sters', 'info');
    loadFriends();
    // Inchidem panoul de habituiri daca era deschis
    document.getElementById('friend-habits-panel').style.display = 'none';
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}

/** Debounce timer pentru cautare */
let searchTimer = null;

/** Cauta utilizatori dupa username (cu debounce 300ms) */
function searchUsers(q) {
  clearTimeout(searchTimer);
  const el = document.getElementById('friend-search-results');

  if (q.trim().length < 2) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  searchTimer = setTimeout(async () => {
    try {
      const results = await api(`/friends/search?q=${encodeURIComponent(q.trim())}`);
      renderSearchResults(results);
    } catch (err) {
      el.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }, 300);
}

/** Afiseaza rezultatele cautarii cu butoane de actiune */
function renderSearchResults(results) {
  const el = document.getElementById('friend-search-results');

  if (results.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text2);padding:8px 0">Niciun utilizator gasit.</p>';
    return;
  }

  el.innerHTML = results.map(u => {
    // Buton in functie de statusul relatiei
    let actionBtn = '';
    if (u.friendship_status === 'accepted') {
      actionBtn = `<span class="badge badge-user" style="font-size:11px">Prieten</span>`;
    } else if (u.friendship_status === 'pending_sent') {
      actionBtn = `<span style="font-size:12px;color:var(--text2)">Cerere trimisa</span>`;
    } else if (u.friendship_status === 'pending_received') {
      actionBtn = `
        <button class="btn btn-sm" style="background:rgba(52,211,153,0.15);color:var(--green);border:1px solid var(--green)"
          onclick="respondFriendRequest(${u.friendship_id}, 'accept')">Accepta</button>`;
    } else {
      actionBtn = `
        <button class="btn btn-sm btn-primary"
          onclick="sendFriendRequest(${u.id}, this)">+ Adauga</button>`;
    }

    return `
      <div class="search-result-item">
        <div class="user-avatar" style="background:${u.avatar_color};width:34px;height:34px;font-size:12px">
          ${getInitial(u.username)}
        </div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600">${escHtml(u.username)}</div>
        </div>
        ${actionBtn}
      </div>`;
  }).join('');
}

/** Trimite o cerere de prietenie */
async function sendFriendRequest(userId, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await api(`/friends/request/${userId}`, { method: 'POST', body: {} });
    btn.textContent = 'Trimisa';
    btn.style.cssText = 'font-size:12px;color:var(--text2);background:transparent;border:none;cursor:default';
    toast('Cerere de prietenie trimisa!', 'success');
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = '+ Adauga';
  }
}

/** Deschide panoul cu habiturile unui prieten */
async function openFriendHabits(friendId, friendUsername) {
  const panel = document.getElementById('friend-habits-panel');
  const title  = document.getElementById('friend-habits-title');
  const list   = document.getElementById('friend-habits-list');

  panel.style.display = '';
  title.textContent   = `Habiturile lui ${friendUsername}`;
  list.innerHTML      = '<div class="loading"><div class="spinner"></div> Se incarca...</div>';

  try {
    const habits = await api(`/friends/${friendId}/habits`);

    if (habits.length === 0) {
      list.innerHTML = '<p style="font-size:13px;color:var(--text2)">Niciun habit inca.</p>';
      return;
    }

    list.innerHTML = habits.map(h => `
      <div class="friend-habit-card" style="border-left:3px solid ${h.color}">
        <div class="friend-habit-icon">${h.icon}</div>
        <div class="friend-habit-info">
          <div class="friend-habit-title">${escHtml(h.title)}</div>
          <div class="friend-habit-freq">${freqLabel(h)}
            ${h.completionsToday > 0 ? ' · <span style="color:var(--green)">Completat azi ✅</span>' : ''}
          </div>
          ${h.description ? `<div style="font-size:12px;color:var(--text2);margin-top:2px">${escHtml(h.description)}</div>` : ''}
        </div>
        <!-- Buton de incurajare direct pe habitul prietenului -->
        <button class="encourage-btn"
          onclick="openSendMessage(${friendId}, '${escHtml(friendUsername)}', ${h.id}, '${escHtml(h.title)}')">
          💌 Incurajeaza
        </button>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

/** Actualizeaza badge-ul cu numarul de cereri de prietenie in asteptare */
async function updateFriendReqBadge(count) {
  const badge = document.getElementById('friend-req-badge');
  if (count === undefined) {
    try {
      const requests = await api('/friends/requests');
      count = requests.length;
    } catch { count = 0; }
  }
  if (count > 0) {
    badge.textContent   = count;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// Pornire aplicatie
init();
