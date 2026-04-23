'use strict';

/* =====================================================
   VIEW: ADMIN PANEL
===================================================== */

let currentAdminTab = 'stats';

function switchAdminTab(tab) {
  currentAdminTab = tab;
  document.querySelectorAll('.admin-tab').forEach((btn, i) => {
    btn.classList.toggle('active', btn.onclick.toString().includes(`'${tab}'`));
  });
  loadAdmin(tab);
}

async function loadAdmin(tab) {
  const content = document.getElementById('admin-content');

  // Marcăm butonul activ
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${tab}'`));
  });

  content.innerHTML = '<div class="loading"><div class="spinner"></div> Se încarcă...</div>';

  try {
    switch (tab) {
      case 'stats':    await renderAdminStats(content);    break;
      case 'users':    await renderAdminUsers(content);    break;
      case 'habits':   await renderAdminHabits(content);   break;
      case 'messages': await renderAdminMessages(content); break;
      case 'logs':     await renderAdminLogs(content);     break;
    }
  } catch (err) {
    content.innerHTML = `<div class="error-msg">Eroare: ${err.message}</div>`;
  }
}

async function renderAdminStats(el) {
  const stats = await api('/admin/stats');
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalUsers}</div>
        <div class="stat-label">👥 Utilizatori</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalHabits}</div>
        <div class="stat-label">📋 Habituiri</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalMessages}</div>
        <div class="stat-label">💬 Mesaje</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.completionsLast24h}</div>
        <div class="stat-label">✅ Completări 24h</div>
      </div>
    </div>
    <div style="color:var(--text2);font-size:14px;margin-top:12px">
      🔒 Toate datele sensibile sunt criptate AES-256-GCM în baza de date.
    </div>`;
}

async function renderAdminUsers(el) {
  const users = await api('/admin/users');
  el.innerHTML = `
    <div style="overflow-x:auto">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th><th>Username</th><th>Rol</th><th>Habituiri</th><th>Mesaje</th><th>Înregistrat</th><th>Acțiuni</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${u.id}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="user-avatar" style="background:${u.avatarColor};width:28px;height:28px;font-size:11px">
                    ${getInitial(u.username)}
                  </div>
                  ${escHtml(u.username)}
                  ${u.isBanned ? '<span class="badge badge-banned">BLOCAT</span>' : ''}
                </div>
              </td>
              <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span></td>
              <td>${u.habitsCount}</td>
              <td>${u.messagesCount}</td>
              <td>${new Date(u.createdAt).toLocaleDateString('ro-RO')}</td>
              <td>
                ${u.role !== 'admin' ? `
                  <button class="btn btn-sm btn-danger" onclick="adminToggleBan(${u.id}, ${u.isBanned})">
                    ${u.isBanned ? '🔓 Deblochează' : '🔒 Blochează'}
                  </button>` : '<span style="color:var(--text2);font-size:12px">Admin protejat</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderAdminHabits(el) {
  const habits = await api('/admin/habits');
  el.innerHTML = `
    <div style="overflow-x:auto">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th><th>Utilizator</th><th>Titlu</th><th>Vizibil</th><th>Status</th><th>Creat</th><th>Acțiuni</th>
          </tr>
        </thead>
        <tbody>
          ${habits.map(h => `
            <tr style="${h.isDeleted ? 'opacity:0.5' : ''}">
              <td>${h.id}</td>
              <td>${escHtml(h.username || '?')}</td>
              <td>
                <span style="margin-right:6px">${h.icon}</span>
                ${escHtml(h.title || '[criptat]')}
              </td>
              <td>${h.isPublic ? '<span class="badge badge-public">Public</span>' : 'Privat'}</td>
              <td>${h.isDeleted ? '<span class="badge badge-deleted">Șters</span>' : '<span class="badge badge-user">Activ</span>'}</td>
              <td>${new Date(h.createdAt).toLocaleDateString('ro-RO')}</td>
              <td>
                ${!h.isDeleted ? `
                  <button class="btn btn-sm btn-danger" onclick="adminDeleteHabit(${h.id})">
                    🗑️ Șterge
                  </button>` : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderAdminMessages(el) {
  const msgs = await api('/admin/messages');
  el.innerHTML = `
    <div style="overflow-x:auto">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th><th>De la</th><th>Către</th><th>Mesaj</th><th>Status</th><th>Data</th><th>Acțiuni</th>
          </tr>
        </thead>
        <tbody>
          ${msgs.map(m => `
            <tr style="${m.isDeleted ? 'opacity:0.5' : ''}">
              <td>${m.id}</td>
              <td>${escHtml(m.senderName)}</td>
              <td>${escHtml(m.receiverName)}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${escHtml(m.content || '[criptat]')}
              </td>
              <td>${m.isDeleted ? '<span class="badge badge-deleted">Șters</span>' : 'Activ'}</td>
              <td>${new Date(m.createdAt).toLocaleDateString('ro-RO')}</td>
              <td>
                ${!m.isDeleted ? `
                  <button class="btn btn-sm btn-danger" onclick="adminDeleteMessage(${m.id})">
                    🗑️ Șterge
                  </button>` : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderAdminLogs(el) {
  const logs = await api('/admin/logs?limit=100');
  el.innerHTML = `
    <div style="overflow-x:auto">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th><th>Utilizator</th><th>Acțiune</th><th>Resursă</th><th>IP</th><th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td>${l.id}</td>
              <td>${escHtml(l.username)}</td>
              <td>
                <code style="font-size:12px;background:var(--bg3);padding:2px 6px;border-radius:4px">
                  ${escHtml(l.action)}
                </code>
              </td>
              <td>${l.targetType ? `${l.targetType} #${l.targetId}` : '—'}</td>
              <td style="font-size:12px;color:var(--text2)">${l.ipAddress || '—'}</td>
              <td style="font-size:12px">${new Date(l.createdAt).toLocaleString('ro-RO')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

/* Acțiuni Admin */

async function adminToggleBan(userId, isBanned) {
  const reason = isBanned ? null : (prompt('Motiv blocare (opțional):') || 'Conținut inappropriate');
  try {
    await api(`/admin/users/${userId}/ban`, {
      method: 'PUT',
      body: { ban: !isBanned, reason }
    });
    toast(isBanned ? '🔓 Utilizator deblocat' : '🔒 Utilizator blocat', 'success');
    loadAdmin('users');
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}

async function adminDeleteHabit(habitId) {
  if (!confirm('Ești sigur că vrei să ștergi acest habit (acțiune de moderare)?')) return;
  try {
    await api(`/admin/habits/${habitId}`, { method: 'DELETE' });
    toast('🗑️ Habit șters de moderator', 'success');
    loadAdmin('habits');
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}

async function adminDeleteMessage(msgId) {
  if (!confirm('Ești sigur că vrei să ștergi acest mesaj?')) return;
  try {
    await api(`/admin/messages/${msgId}`, { method: 'DELETE' });
    toast('🗑️ Mesaj șters de moderator', 'success');
    loadAdmin('messages');
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}
