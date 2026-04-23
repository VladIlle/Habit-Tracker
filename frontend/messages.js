'use strict';

/* =====================================================
   VIEW: MESAJE
===================================================== */

async function loadMessages() {
  document.getElementById('msg-list-items').innerHTML =
    '<div class="loading"><div class="spinner"></div></div>';

  try {
    const [inbox, sent] = await Promise.all([
      api('/messages'),
      api('/messages/sent'),
    ]);
    state.messages.inbox = inbox;
    state.messages.sent  = sent;
    renderMessageList();
  } catch (err) {
    document.getElementById('msg-list-items').innerHTML =
      `<div class="error-msg">Eroare: ${err.message}</div>`;
  }
}

function switchMsgTab(tab) {
  state.messages.tab = tab;
  state.messages.selected = null;

  document.getElementById('tab-inbox').style.cssText =
    tab === 'inbox' ? 'flex:1;background:var(--bg3);color:var(--accent)' : 'flex:1;background:transparent;color:var(--text2)';
  document.getElementById('tab-sent').style.cssText =
    tab === 'sent' ? 'flex:1;background:var(--bg3);color:var(--accent)' : 'flex:1;background:transparent;color:var(--text2)';

  renderMessageList();
  document.getElementById('msg-detail').innerHTML = `
    <div class="msg-empty">
      <div class="msg-empty-icon">💬</div>
      <p>Selectează un mesaj din stânga</p>
    </div>`;
}

function renderMessageList() {
  const list   = document.getElementById('msg-list-items');
  const items  = state.messages.tab === 'inbox' ? state.messages.inbox : state.messages.sent;

  if (items.length === 0) {
    list.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">
        ${state.messages.tab === 'inbox' ? 'Niciun mesaj primit' : 'Niciun mesaj trimis'}
      </div>`;
    return;
  }

  list.innerHTML = items.map(m => {
    const isInbox  = state.messages.tab === 'inbox';
    const name     = isInbox ? m.senderName : (m.receiverName || 'Unknown');
    const color    = isInbox ? m.senderColor : '#6366f1';
    const isActive = state.messages.selected === m.id;

    return `
      <div class="msg-item ${!m.isRead && isInbox ? 'unread' : ''} ${isActive ? 'active' : ''}"
           onclick="openMessage(${m.id})">
        <div class="user-avatar" style="background:${color};width:34px;height:34px;font-size:12px">
          ${getInitial(name)}
        </div>
        <div class="msg-item-info">
          <div class="msg-item-from">${escHtml(name)}</div>
          <div class="msg-item-preview">${escHtml(m.content || '')}</div>
        </div>
        <div class="msg-item-time">${timeAgo(m.createdAt)}</div>
      </div>`;
  }).join('');
}

async function openMessage(msgId) {
  state.messages.selected = msgId;
  renderMessageList(); // Actualizăm starea activ

  const isInbox = state.messages.tab === 'inbox';
  const items   = isInbox ? state.messages.inbox : state.messages.sent;
  const msg     = items.find(m => m.id === msgId);
  if (!msg) return;

  const detail = document.getElementById('msg-detail');
  const name   = isInbox ? msg.senderName : (msg.receiverName || 'Unknown');
  const color  = isInbox ? msg.senderColor : '#6366f1';

  detail.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:20px">
      <div class="user-avatar" style="background:${color}">
        ${getInitial(name)}
      </div>
      <div>
        <div style="font-size:15px;font-weight:600">${escHtml(name)}</div>
        <div style="font-size:12px;color:var(--text2)">${new Date(msg.createdAt).toLocaleString('ro-RO')}</div>
      </div>
    </div>
    ${msg.habitTitle ? `
      <div style="background:var(--bg3);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px">
        <span style="color:var(--text2)">Legat de habitul:</span> <strong>${escHtml(msg.habitTitle)}</strong>
      </div>` : ''}
    <div class="msg-bubble">${escHtml(msg.content || '')}</div>
  `;

  // Marcăm ca citit dacă e inbox și necitit
  if (isInbox && !msg.isRead) {
    msg.isRead = true;
    api(`/messages/${msgId}/read`, { method: 'PUT' }).catch(() => {});
    updateUnreadBadge();
  }
}

/** Actualizează badge-ul de mesaje necitite */
async function updateUnreadBadge() {
  try {
    const res = await api('/messages/unread-count');
    const badge = document.getElementById('unread-badge');
    if (res.count > 0) {
      badge.textContent    = res.count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

/* =====================================================
   MODAL: Trimite Mesaj
===================================================== */

// Contor caractere mesaj
document.addEventListener('DOMContentLoaded', () => {
  const contentEl = document.getElementById('msg-content');
  if (contentEl) {
    contentEl.addEventListener('input', () => {
      document.getElementById('msg-char-count').textContent = contentEl.value.length;
    });
  }
});

/**
 * Deschide modalul de trimitere mesaj
 * @param {number} receiverId - ID-ul destinatarului (opțional)
 * @param {string} receiverName - Username-ul destinatarului (opțional)
 * @param {number} habitId - ID-ul habitului legat (opțional)
 * @param {string} habitName - Titlul habitului (opțional)
 */
function openSendMessage(receiverId = null, receiverName = null, habitId = null, habitName = null) {
  document.getElementById('message-modal-error').innerHTML = '';
  document.getElementById('msg-receiver').value  = receiverName || '';
  document.getElementById('msg-content').value   = '';
  document.getElementById('msg-char-count').textContent = '0';

  state.sendMsg.habitId   = habitId;
  state.sendMsg.habitName = habitName;

  const habitGroup = document.getElementById('msg-habit-group');
  if (habitId && habitName) {
    habitGroup.style.display = '';
    document.getElementById('msg-habit-name').value = habitName;
    document.getElementById('msg-habit-id').value   = habitId;
  } else {
    habitGroup.style.display = 'none';
  }

  document.getElementById('message-modal').classList.add('open');
}

function closeSendMessage() {
  document.getElementById('message-modal').classList.remove('open');
}

/** Caută ID-ul unui utilizator după username */
async function findUserId(username) {
  // Obținem lista utilizatorilor din feed (nu expunem un endpoint de căutare separat)
  // Alternativ, trimitem direct username-ul și lăsăm backend-ul să îl rezolve
  // Soluție simplă: folosim endpoint-ul admin dacă suntem admin, altfel ne bazăm pe feed
  try {
    const feed = await api('/social/feed?limit=100&offset=0');
    const user = feed.find(h => h.username.toLowerCase() === username.toLowerCase());
    return user ? user.userId : null;
  } catch {
    return null;
  }
}

async function sendMessage() {
  const receiverName = document.getElementById('msg-receiver').value.trim();
  const content      = document.getElementById('msg-content').value.trim();
  const habitId      = document.getElementById('msg-habit-id').value || null;
  const errEl        = document.getElementById('message-modal-error');
  errEl.innerHTML    = '';

  if (!receiverName || !content) {
    errEl.innerHTML = '<div class="error-msg">Completează toate câmpurile!</div>';
    return;
  }

  // Găsim ID-ul destinatarului
  const receiverId = await findUserId(receiverName);
  if (!receiverId) {
    errEl.innerHTML = `<div class="error-msg">Utilizatorul "${receiverName}" nu a fost găsit sau nu are habituiri publice.</div>`;
    return;
  }

  try {
    await api('/messages', {
      method: 'POST',
      body: {
        receiverId,
        content,
        habitId: habitId ? parseInt(habitId) : null,
      }
    });
    toast('💌 Mesaj trimis cu succes!', 'success');
    closeSendMessage();
    if (state.currentView === 'messages') loadMessages();
  } catch (err) {
    errEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

/* =====================================================
   MODAL: Trimite Mesaj
===================================================== */

// Contor caractere mesaj
document.addEventListener('DOMContentLoaded', () => {
  const contentEl = document.getElementById('msg-content');
  if (contentEl) {
    contentEl.addEventListener('input', () => {
      document.getElementById('msg-char-count').textContent = contentEl.value.length;
    });
  }
});

/**
 * Deschide modalul de trimitere mesaj
 * @param {number} receiverId - ID-ul destinatarului (opțional)
 * @param {string} receiverName - Username-ul destinatarului (opțional)
 * @param {number} habitId - ID-ul habitului legat (opțional)
 * @param {string} habitName - Titlul habitului (opțional)
 */
function openSendMessage(receiverId = null, receiverName = null, habitId = null, habitName = null) {
  document.getElementById('message-modal-error').innerHTML = '';
  document.getElementById('msg-receiver').value  = receiverName || '';
  document.getElementById('msg-content').value   = '';
  document.getElementById('msg-char-count').textContent = '0';

  state.sendMsg.habitId   = habitId;
  state.sendMsg.habitName = habitName;

  const habitGroup = document.getElementById('msg-habit-group');
  if (habitId && habitName) {
    habitGroup.style.display = '';
    document.getElementById('msg-habit-name').value = habitName;
    document.getElementById('msg-habit-id').value   = habitId;
  } else {
    habitGroup.style.display = 'none';
  }

  document.getElementById('message-modal').classList.add('open');
}

function closeSendMessage() {
  document.getElementById('message-modal').classList.remove('open');
}

/** Caută ID-ul unui utilizator după username */
async function findUserId(username) {
  // Obținem lista utilizatorilor din feed (nu expunem un endpoint de căutare separat)
  // Alternativ, trimitem direct username-ul și lăsăm backend-ul să îl rezolve
  // Soluție simplă: folosim endpoint-ul admin dacă suntem admin, altfel ne bazăm pe feed
  try {
    const feed = await api('/social/feed?limit=100&offset=0');
    const user = feed.find(h => h.username.toLowerCase() === username.toLowerCase());
    return user ? user.userId : null;
  } catch {
    return null;
  }
}

async function sendMessage() {
  const receiverName = document.getElementById('msg-receiver').value.trim();
  const content      = document.getElementById('msg-content').value.trim();
  const habitId      = document.getElementById('msg-habit-id').value || null;
  const errEl        = document.getElementById('message-modal-error');
  errEl.innerHTML    = '';

  if (!receiverName || !content) {
    errEl.innerHTML = '<div class="error-msg">Completează toate câmpurile!</div>';
    return;
  }

  // Găsim ID-ul destinatarului
  const receiverId = await findUserId(receiverName);
  if (!receiverId) {
    errEl.innerHTML = `<div class="error-msg">Utilizatorul "${receiverName}" nu a fost găsit sau nu are habituiri publice.</div>`;
    return;
  }

  try {
    await api('/messages', {
      method: 'POST',
      body: {
        receiverId,
        content,
        habitId: habitId ? parseInt(habitId) : null,
      }
    });
    toast('💌 Mesaj trimis cu succes!', 'success');
    closeSendMessage();
    if (state.currentView === 'messages') loadMessages();
  } catch (err) {
    errEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}
