'use strict';

/* =====================================================
   VIEW: DASHBOARD - Habituiri
===================================================== */

async function loadHabits() {
  const grid = document.getElementById('habits-grid');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div> Se încarcă...</div>';

  try {
    const today = new Date().toISOString().split('T')[0];
    state.habits = await api(`/habits?date=${today}`);
    renderHabits();
    updateDashStats();
  } catch (err) {
    grid.innerHTML = `<div class="error-msg">Eroare: ${err.message}</div>`;
  }
}

function renderHabits() {
  const grid = document.getElementById('habits-grid');

  if (state.habits.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-icon">🌱</span>
        <h3>Niciun habit încă!</h3>
        <p>Creează primul tău habit și începe să construiești rutine sănătoase.</p>
        <button class="btn btn-primary" onclick="openHabitModal()">+ Primul meu habit</button>
      </div>`;
    return;
  }

  grid.innerHTML = state.habits.map(h => {
    const maxComp = maxDailyCompletions(h);
    const curr    = h.completionsToday || 0;
    const pct     = Math.min(100, Math.round((curr / maxComp) * 100));
    const isDone  = curr >= maxComp;

    return `
      <div class="habit-card ${isDone ? 'completed-full' : ''}"
           style="--habit-color:${h.color}">
        <div class="habit-header">
          <div class="habit-icon">${h.icon}</div>
          <div class="habit-meta">
            <div class="habit-title">${escHtml(h.title)}</div>
            <div class="habit-freq">${freqLabel(h)}</div>
          </div>
          ${h.isPublic ? '<span title="Habit public">🌐</span>' : ''}
        </div>

        <!-- Progress bar -->
        <div class="habit-progress">
          <div class="progress-label">
            <span>${curr}/${maxComp} completări</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>

        <!-- Acțiuni -->
        <div class="habit-actions">
          <button class="complete-btn ${isDone ? 'done' : ''}"
                  onclick="completeHabit(${h.id})"
                  ${isDone ? 'disabled' : ''}>
            ${isDone ? '✅ Completat' : '+ Marchează'}
          </button>
          <button class="habit-edit-btn" onclick="openHabitModal(${h.id})" title="Editează">✏️</button>
          <button class="habit-edit-btn" onclick="deleteHabit(${h.id})" title="Șterge" style="color:var(--red)">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function updateDashStats() {
  const habits = state.habits;
  const today  = new Date().toISOString().split('T')[0];

  document.getElementById('stat-total').textContent  = habits.length;
  document.getElementById('stat-today').textContent  = habits.filter(h => h.completionsToday >= maxDailyCompletions(h)).length;
  document.getElementById('stat-public').textContent = habits.filter(h => h.isPublic).length;
  // Streak: simplificat - numărul de habituiri cu completări azi
  document.getElementById('stat-streak').textContent = habits.filter(h => h.completionsToday > 0).length;
}

/** Marchează un habit ca completat */
async function completeHabit(habitId) {
  try {
    await api(`/habits/${habitId}/complete`, { method: 'POST', body: {} });
    toast('✅ Habit marcat ca completat!', 'success');
    // Reîncărcăm lista
    loadHabits();
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}

/** Șterge un habit */
async function deleteHabit(habitId) {
  if (!confirm('Ești sigur că vrei să ștergi acest habit?')) return;

  try {
    await api(`/habits/${habitId}`, { method: 'DELETE' });
    toast('🗑️ Habit șters', 'info');
    loadHabits();
  } catch (err) {
    toast(`Eroare: ${err.message}`, 'error');
  }
}

/* =====================================================
   MODAL: Creare / Editare Habit
===================================================== */

// Culorile disponibile pentru habituiri
const HABIT_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#06b6d4',
  '#3b82f6','#10b981','#f59e0b','#6b7280',
];

// Icon-urile disponibile
const HABIT_ICONS = ['✓','🏃','📚','💪','🧘','🍎','💧','😴','🧠','✍️','🎯','🎸','🌿','🏊','🚴','🍵','💊','🙏','🌅','🎨'];

function initHabitModalPickers() {
  // Inițializăm selectorul de culori
  const colorEl = document.getElementById('color-picker');
  colorEl.innerHTML = HABIT_COLORS.map(c => `
    <div class="color-opt ${c === state.habit.color ? 'selected' : ''}"
         style="background:${c}"
         onclick="selectColor(this,'${c}')"
         title="${c}"></div>
  `).join('');

  // Inițializăm selectorul de icon-uri
  const iconEl = document.getElementById('icon-picker');
  iconEl.innerHTML = HABIT_ICONS.map(i => `
    <div class="icon-opt ${i === state.habit.icon ? 'selected' : ''}"
         onclick="selectIcon(this,'${i}')">${i}</div>
  `).join('');
}

function selectColor(el, color) {
  state.habit.color = color;
  document.querySelectorAll('.color-opt').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function selectIcon(el, icon) {
  state.habit.icon = icon;
  document.querySelectorAll('.icon-opt').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
}

function selectFreq(el, type) {
  state.habit.freq = type;
  document.querySelectorAll('.freq-opt').forEach(f => f.classList.remove('selected'));
  el.classList.add('selected');

  // Afișăm/ascundem câmpul pentru valoare
  const grp = document.getElementById('freq-value-group');
  const lbl = document.getElementById('freq-value-label');
  if (type === 'daily' || type === 'weekly') {
    grp.style.display = 'none';
  } else {
    grp.style.display = '';
    if (type === 'times_per_day')  lbl.textContent = 'De câte ori pe zi';
    if (type === 'times_per_week') lbl.textContent = 'De câte ori pe săptămână';
    if (type === 'hourly')         lbl.textContent = 'La fiecare câte ore';
    if (type === 'interval_days')  lbl.textContent = 'La fiecare câte zile';
  }
}

/** Deschide modalul de creare/editare */
function openHabitModal(habitId = null) {
  const modal = document.getElementById('habit-modal');
  document.getElementById('habit-modal-error').innerHTML = '';

  if (habitId) {
    // Mod editare: populăm cu datele existente
    const h = state.habits.find(x => x.id === habitId);
    if (!h) return;

    state.habit.editing = habitId;
    state.habit.color   = h.color;
    state.habit.icon    = h.icon;
    state.habit.freq    = h.frequencyType;

    document.getElementById('habit-modal-title').textContent = '✏️ Editează Habit';
    document.getElementById('habit-title').value       = h.title;
    document.getElementById('habit-desc').value        = h.description || '';
    document.getElementById('habit-freq-value').value  = h.frequencyValue;
    document.getElementById('habit-target-time').value = h.targetTime ? h.targetTime.substring(0,5) : '';
    document.getElementById('habit-public').checked    = h.isPublic;
  } else {
    // Mod creare: resetăm formularul
    state.habit.editing = null;
    state.habit.color   = '#6366f1';
    state.habit.icon    = '✓';
    state.habit.freq    = 'daily';

    document.getElementById('habit-modal-title').textContent = '✨ Habit nou';
    document.getElementById('habit-title').value       = '';
    document.getElementById('habit-desc').value        = '';
    document.getElementById('habit-freq-value').value  = '1';
    document.getElementById('habit-target-time').value = '';
    document.getElementById('habit-public').checked    = false;
  }

  // Reinițializăm picker-ele cu starea curentă
  initHabitModalPickers();

  // Selectăm frecvența curentă în UI
  document.querySelectorAll('.freq-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.type === state.habit.freq);
  });

  // Afișăm/ascundem câmpul valoare frecvență
  const needsValue = !['daily', 'weekly'].includes(state.habit.freq);
  document.getElementById('freq-value-group').style.display = needsValue ? '' : 'none';

  modal.classList.add('open');
}

function closeHabitModal() {
  document.getElementById('habit-modal').classList.remove('open');
}

/** Salvează habitiul (creare sau editare) */
async function saveHabit() {
  const title     = document.getElementById('habit-title').value.trim();
  const desc      = document.getElementById('habit-desc').value.trim();
  const freqValue = parseInt(document.getElementById('habit-freq-value').value) || 1;
  const targetTime = document.getElementById('habit-target-time').value || null;
  const isPublic  = document.getElementById('habit-public').checked;
  const errEl     = document.getElementById('habit-modal-error');

  errEl.innerHTML = '';

  if (!title) {
    errEl.innerHTML = '<div class="error-msg">Titlul este obligatoriu!</div>';
    return;
  }

  const body = {
    title,
    description:    desc || null,
    isPublic,
    color:          state.habit.color,
    icon:           state.habit.icon,
    frequencyType:  state.habit.freq,
    frequencyValue: freqValue,
    targetTime,
  };

  try {
    if (state.habit.editing) {
      await api(`/habits/${state.habit.editing}`, { method: 'PUT', body });
      toast('✅ Habit actualizat!', 'success');
    } else {
      await api('/habits', { method: 'POST', body });
      toast('🎉 Habit creat!', 'success');
    }
    closeHabitModal();
    loadHabits();
  } catch (err) {
    errEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}
