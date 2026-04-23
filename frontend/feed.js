'use strict';

/* =====================================================
   VIEW: FEED SOCIAL
===================================================== */

async function loadFeed(reset = false) {
  if (reset) {
    state.feed.items  = [];
    state.feed.offset = 0;
    document.getElementById('feed-list').innerHTML =
      '<div class="loading"><div class="spinner"></div> Se încarcă...</div>';
  }

  try {
    const items = await api(`/social/feed?limit=10&offset=${state.feed.offset}`);
    state.feed.items  = [...state.feed.items, ...items];
    state.feed.offset += items.length;

    renderFeed();

    // Afișăm butonul "Mai mult" dacă s-au returnat 10 itemi
    document.getElementById('load-more-btn').style.display = items.length === 10 ? '' : 'none';
  } catch (err) {
    document.getElementById('feed-list').innerHTML =
      `<div class="error-msg">Eroare: ${err.message}</div>`;
  }
}

function loadMoreFeed() {
  loadFeed(false);
}

function renderFeed() {
  const list = document.getElementById('feed-list');

  if (state.feed.items.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🌐</span>
        <h3>Feed-ul este gol</h3>
        <p>Nimeni nu a adăugat habituiri publice încă. Fii primul!</p>
      </div>`;
    return;
  }

  list.innerHTML = state.feed.items.map(h => `
    <div class="feed-card">
      <!-- Autor -->
      <div class="feed-header">
        <div class="feed-avatar" style="background:${h.avatarColor}">
          ${getInitial(h.username)}
        </div>
        <div class="feed-user-info">
          <div class="feed-username">${escHtml(h.username)}</div>
          <div class="feed-time">${timeAgo(h.createdAt)}</div>
        </div>
      </div>

      <!-- Habitiul -->
      <div class="feed-habit" style="border-left:3px solid ${h.color}">
        <div class="feed-habit-icon" style="background:rgba(0,0,0,0.2)">${h.icon}</div>
        <div class="feed-habit-info">
          <div class="feed-habit-title">${escHtml(h.title)}</div>
          <div class="feed-habit-freq">${freqLabel(h)}</div>
          ${h.description ? `<div style="font-size:12px;color:var(--text2);margin-top:2px">${escHtml(h.description)}</div>` : ''}
        </div>
        ${h.completionsToday > 0 ? `<span style="color:var(--green);font-size:18px" title="Completat azi">✅</span>` : ''}
      </div>

      <!-- Acțiuni -->
      <div class="feed-actions">
        <button class="like-btn ${h.userLiked ? 'liked' : ''}"
                id="like-btn-${h.id}"
                onclick="toggleLike(${h.id})">
          ${h.userLiked ? '⭐' : '☆'} <span id="likes-${h.id}">${h.likesCount}</span> Like-uri
        </button>
        ${h.userId !== state.user.id ? `
          <button class="encourage-btn"
                  onclick="openSendMessage(${h.userId}, '${escHtml(h.username)}', ${h.id}, '${escHtml(h.title)}')">
            💌 Încurajează
          </button>` : '<span style="font-size:12px;color:var(--text2);padding:6px 14px">Habiturile tale</span>'}
      </div>
    </div>
  `).join('');
}

/** Toggle like pe un habit din feed */
async function toggleLike(habitId) {
  try {
    const res = await api(`/social/${habitId}/like`, { method: 'POST' });
    const item = state.feed.items.find(h => h.id === habitId);
    if (item) {
      item.userLiked   = res.liked;
      item.likesCount += res.liked ? 1 : -1;

      // Actualizăm UI fără re-render complet
      const btn = document.getElementById(`like-btn-${habitId}`);
      if (btn) {
        btn.classList.toggle('liked', res.liked);
        btn.innerHTML = `${res.liked ? '⭐' : '☆'} <span id="likes-${habitId}">${item.likesCount}</span> Like-uri`;
      }
    }
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}
