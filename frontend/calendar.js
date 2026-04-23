'use strict';

/* =====================================================
   VIEW: CALENDAR
   - Grid lunar cu navigare
   - Disponibilitate habituiri per zi (bazata pe frecventa)
   - Completare retroactiva direct din calendar
   - Detalii zi in coloana dreapta
===================================================== */

async function loadCalendar() {
  const { year, month } = state.calendar;
  try {
    state.calendar.data = await api(`/calendar?year=${year}&month=${month}`);
    renderCalendar();
  } catch (err) {
    toast(`Eroare calendar: ${err.message}`, 'error');
  }
}

function calNav(dir) {
  state.calendar.month += dir;
  if (state.calendar.month > 12) { state.calendar.month = 1;  state.calendar.year++; }
  if (state.calendar.month < 1)  { state.calendar.month = 12; state.calendar.year--; }
  loadCalendar();
}

/**
 * Determina daca un habit este disponibil (datorat) intr-o anumita zi.
 */
function isHabitAvailableOnDate(habit, dateStr) {
  const date    = new Date(dateStr + 'T12:00:00');
  const created = new Date(habit.createdAt);
  created.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  if (date < created) return false;

  const val = habit.frequencyValue || 1;

  switch (habit.frequencyType) {
    case 'daily':
    case 'times_per_day':
    case 'times_per_week':
    case 'hourly':
      return true;

    case 'weekly': {
      // Aceeasi zi a saptamanii ca ziua crearii
      const createdDay = new Date(habit.createdAt).getDay();
      return date.getDay() === createdDay;
    }

    case 'interval_days': {
      const diffDays = Math.round((date - created) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays % val === 0;
    }

    default:
      return true;
  }
}

/**
 * Cate completari trebuie facute pentru un habit intr-o zi?
 */
function habitDailyTarget(habit) {
  if (habit.frequencyType === 'times_per_day') return habit.frequencyValue || 1;
  if (habit.frequencyType === 'hourly')        return Math.floor(16 / (habit.frequencyValue || 1));
  return 1;
}

/**
 * Randeaza grila calendarului lunar.
 */
function renderCalendar() {
  const { year, month, data } = state.calendar;
  const grid = document.getElementById('calendar-grid');

  const months = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie',
                  'Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
  document.getElementById('cal-month-label').textContent = `${months[month - 1]} ${year}`;

  const headers = `
    <div class="cal-day-header">Lun</div><div class="cal-day-header">Mar</div>
    <div class="cal-day-header">Mie</div><div class="cal-day-header">Joi</div>
    <div class="cal-day-header">Vin</div><div class="cal-day-header">Sam</div>
    <div class="cal-day-header">Dum</div>`;

  const firstDay    = new Date(year, month - 1, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = new Date().toISOString().split('T')[0];

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData = data[dateStr];
    const isToday  = dateStr === today;
    const isFuture = dateStr > today;

    // Habituiri disponibile in aceasta zi
    const available = state.habits.filter(h => isHabitAvailableOnDate(h, dateStr));
    const avCount   = available.length;

    const hasComp   = dayData && dayData.habits > 0;
    const isFullDay = hasComp && avCount > 0 && dayData.habits >= avCount;

    let indicator = '';
    if (hasComp) {
      // Zi trecuta/azi cu completari: arata X/Y
      indicator = `<span class="cal-day-count">${dayData.habits}/${avCount}</span>`;
    } else if (avCount > 0 && !isFuture) {
      // Zi trecuta fara completari: arata 0/Y estompat
      indicator = `<span class="cal-day-count" style="opacity:0.25">0/${avCount}</span>`;
    } else if (avCount > 0 && isFuture) {
      // Zi viitoare: arata cate habituiri sunt planificate
      indicator = `<span class="cal-day-count" style="opacity:0.35;color:var(--accent)">${avCount}</span>`;
    }

    cells += `<div class="cal-day ${isToday?'today':''} ${isFuture?'future':''} ${hasComp?(isFullDay?'full-day':'has-completions'):''}"
      data-date="${dateStr}" onclick="showCalDay('${dateStr}')">
      <span class="cal-day-num">${d}</span>${indicator}</div>`;
  }

  grid.innerHTML = headers + cells;
}

/**
 * Afiseaza detaliile unei zile + permite completare retroactiva.
 */
async function showCalDay(dateStr) {
  const empty      = document.getElementById('cal-day-empty');
  const dayContent = document.getElementById('cal-day-content');
  const title      = document.getElementById('cal-detail-title');
  const subtitle   = document.getElementById('cal-detail-subtitle');
  const badge      = document.getElementById('cal-detail-badge');
  const list       = document.getElementById('cal-detail-list');

  const date = new Date(dateStr + 'T12:00:00');
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  title.textContent = date.toLocaleDateString('ro-RO', opts);

  document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
  const cell = document.querySelector(`.cal-day[data-date="${dateStr}"]`);
  if (cell) cell.classList.add('selected');

  empty.style.display      = 'none';
  dayContent.style.display = '';
  subtitle.textContent     = 'Se incarca...';
  badge.innerHTML          = '';
  list.innerHTML           = '<div class="loading"><div class="spinner"></div></div>';

  const today    = new Date().toISOString().split('T')[0];
  const isFuture = dateStr > today;
  const isToday  = dateStr === today;

  if (isFuture) {
    subtitle.textContent = 'Data viitoare';
    badge.innerHTML = '&#128302;';
    const available = state.habits.filter(h => isHabitAvailableOnDate(h, dateStr));
    if (available.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text2);font-size:13px">Niciun habit planificat.</div>`;
    } else {
      list.innerHTML = `
        <div class="cal-section-label">Habituiri planificate (${available.length})</div>
        ${available.map(h => `
          <div class="cal-habit-row" style="opacity:0.5">
            <div class="cal-habit-icon" style="background:${h.color}22;border-color:${h.color}55">${h.icon}</div>
            <div class="cal-habit-info">
              <div class="cal-habit-name">${escHtml(h.title)}</div>
              <div class="cal-habit-meta">${freqLabel(h)}</div>
            </div>
            <span style="font-size:12px;color:var(--text2)">viitor</span>
          </div>`).join('')}`;
    }
    return;
  }

  try {
    const available = state.habits.filter(h => isHabitAvailableOnDate(h, dateStr));

    if (available.length === 0) {
      subtitle.textContent = 'Niciun habit disponibil';
      list.innerHTML = `
        <div style="text-align:center;padding:30px 0;color:var(--text2)">
          <div style="font-size:13px">Nu ai niciun habit activ in aceasta zi.</div>
          <div style="font-size:12px;opacity:0.6;margin-top:4px">Habiturile create dupa aceasta data nu apar retroactiv.</div>
        </div>`;
      return;
    }

    // Incarcam completarile din aceasta zi
    const results = await Promise.all(
      available.map(h =>
        api(`/habits/${h.id}/completions?from=${dateStr}&to=${dateStr}`)
          .then(comps => ({ habit: h, completions: comps }))
          .catch(() => ({ habit: h, completions: [] }))
      )
    );

    const completed = results.filter(r => r.completions.length > 0);
    const pending   = results.filter(r => r.completions.length === 0);
    const isFullDay = completed.length === available.length && available.length > 0;

    subtitle.textContent = `${completed.length} din ${available.length} completate`;
    badge.innerHTML = isFullDay ? '&#127942;' : (completed.length > 0 ? '&#128994;' : '');

    let html = '';

    // Completate
    if (completed.length > 0) {
      html += `<div class="cal-section-label">Completate (${completed.length})</div>`;
      html += completed.map(({ habit, completions }) => {
        const target  = habitDailyTarget(habit);
        const count   = completions.length;
        const timeStr = new Date(completions[0].completedAt)
          .toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        const canAddMore = count < target;

        return `
          <div class="cal-habit-row" id="calrow-${habit.id}-${dateStr.replace(/-/g,'')}">
            <div class="cal-habit-icon" style="background:${habit.color}22;border-color:${habit.color}55">${habit.icon}</div>
            <div class="cal-habit-info">
              <div class="cal-habit-name">${escHtml(habit.title)}</div>
              <div class="cal-habit-meta">
                ${count}${target > 1 ? '/'+target : ''} completare(i)
                &bull; ultima la ${timeStr}
              </div>
            </div>
            <div class="cal-habit-actions">
              ${canAddMore
                ? `<button class="btn btn-sm" style="background:rgba(52,211,153,0.15);color:var(--green);border:1px solid var(--green)"
                     onclick="calCompleteHabit(${habit.id},'${dateStr}',this)">+1</button>`
                : `<span style="color:var(--green);font-size:20px">&#10003;</span>`}
            </div>
          </div>`;
      }).join('');
    }

    // Necompletate
    if (pending.length > 0) {
      html += `<div class="cal-section-label" style="margin-top:${completed.length > 0 ? '16px' : '0'}">
        Necompletate (${pending.length})
        ${!isToday ? `<span style="font-size:11px;font-weight:400;color:var(--accent)"> &mdash; completare retroactiva disponibila</span>` : ''}
      </div>`;
      html += pending.map(({ habit }) => {
        const target = habitDailyTarget(habit);
        return `
          <div class="cal-habit-row" id="calrow-${habit.id}-${dateStr.replace(/-/g,'')}" style="opacity:0.75">
            <div class="cal-habit-icon" style="background:var(--bg3)">${habit.icon}</div>
            <div class="cal-habit-info">
              <div class="cal-habit-name">${escHtml(habit.title)}</div>
              <div class="cal-habit-meta">${freqLabel(habit)}${target > 1 ? ' &bull; obiectiv: '+target : ''}</div>
            </div>
            <div class="cal-habit-actions">
              <button class="btn btn-sm btn-primary"
                onclick="calCompleteHabit(${habit.id},'${dateStr}',this)">
                ${isToday ? 'Completeaza' : 'Adauga retroactiv'}
              </button>
            </div>
          </div>`;
      }).join('');
    }

    list.innerHTML = html;

  } catch (err) {
    list.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

/**
 * Completeaza un habit pentru o data specifica din calendar.
 * Functioneaza atat pentru azi cat si pentru date din trecut.
 */
async function calCompleteHabit(habitId, dateStr, btn) {
  btn.disabled    = true;
  btn.textContent = '...';

  try {
    await api(`/habits/${habitId}/complete`, { method: 'POST', body: { date: dateStr } });
    toast('Completat!', 'success');

    // Refresh calendar data + re-render ziua
    state.calendar.data = await api(`/calendar?year=${state.calendar.year}&month=${state.calendar.month}`);
    renderCalendar();
    showCalDay(dateStr);

    // Daca e azi, actualizam si dashboard-ul
    if (dateStr === new Date().toISOString().split('T')[0]) {
      await loadHabits();
    }
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled    = false;
    btn.textContent = dateStr === new Date().toISOString().split('T')[0] ? 'Completeaza' : 'Adauga retroactiv';
  }
}
