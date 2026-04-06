/* ══════════════════════════════════════════════════════════════════════
   SiteCheck — Construction QC App
   ══════════════════════════════════════════════════════════════════════ */

const API = '/api';
const STATUS_LABELS = { unchecked: 'Open', flagged: 'Flagged', confirmed: 'Completed', na: 'N/A' };
const STATUS_ICONS = { unchecked: '○', flagged: '⚑', confirmed: '✓', na: '—' };
const TAG_LABELS = ['VERIFY','ACTION','CLIENT','PRIOR TO ORDER','PRIOR TO POUR','INFORM CONTRACTOR','CUSTOM'];

// ── State ────────────────────────────────────────────────────────────
let currentTab = 'home';
let navStack = [];
let currentProject = null;
let currentPhase = null;
let activeFilter = 'all';
let bulkSelected = new Set();
let bulkMode = false;
let commentItemId = null;
let categoryCollapseState = {}; // {catId: true/false}
let timerState = { running: false, inspectionId: null, phaseId: null, startTime: null, elapsed: 0, interval: null };
let currentUser = null;

// ── DOM refs ─────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $content = $('#content');
const $topTitle = $('#top-title');
const $topBack = $('#top-back-btn');
const $logoMark = $('#logo-mark');
const $searchBtn = $('#search-btn');
const $filterBtn = $('#filter-btn');
const $archiveBtn = $('#archive-btn');
const $newBtn = $('#new-project-btn');
const $modalOverlay = $('#modal-overlay');
const $sheetOverlay = $('#sheet-overlay');
const $commentSheet = $('#comment-sheet');
const $searchSheet = $('#search-sheet');
const $bulkBar = $('#bulk-bar');
const $filterBar = $('#filter-bar');
const $notifBell = $('#notif-bell-btn');
const $notifBadge = $('#notif-badge');

// ── API ──────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}

// ── Utility ──────────────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function initials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function tagClass(tag) { return tag.replace(/\s+/g, '_'); }

// ── Navigation ───────────────────────────────────────────────────────
function navigateTo(view, data, pushStack = true) {
  exitBulkMode();
  activeFilter = 'all';
  $filterBar.style.display = 'none';

  $content.classList.remove('view-enter');
  void $content.offsetWidth;
  $content.classList.add('view-enter');

  if (view === 'dashboard') {
    navStack = [{ view: 'dashboard' }];
    setTopBar('Dashboard', false, { search: false, filter: false, archive: true, newBtn: true });
    loadDashboard();
  } else if (view === 'projects') {
    navStack = [{ view: 'projects' }];
    setTopBar('Projects', false, { search: false, filter: false, archive: true, newBtn: true });
    loadProjects();
  } else if (view === 'project-detail') {
    if (pushStack) navStack.push({ view: 'project-detail', data });
    currentProject = data;
    setTopBar(data.name, true, { search: false, filter: false, archive: false, newBtn: false });
    loadProjectDetail(data.id);
  } else if (view === 'phase-detail') {
    if (pushStack) navStack.push({ view: 'phase-detail', data });
    currentPhase = data;
    setTopBar(data.name, true, { search: false, filter: false, archive: false, newBtn: false });
    loadPhaseDetail(data.id);
  } else if (view === 'template') {
    navStack = [{ view: 'template' }];
    setTopBar('Master Template', false, { search: false, filter: false, archive: false, newBtn: false });
    loadTemplate();
  } else if (view === 'reports') {
    navStack = [{ view: 'reports' }];
    setTopBar('Calendar', false, { search: false, filter: false, archive: false, newBtn: false });
    loadCalendar();
  } else if (view === 'more') {
    navStack = [{ view: 'more' }];
    setTopBar('More', false, { search: false, filter: false, archive: false, newBtn: false });
    showMore();
  } else if (view === 'archived') {
    if (pushStack) navStack.push({ view: 'archived' });
    setTopBar('Archived Projects', true, { search: false, filter: false, archive: false, newBtn: false });
    loadArchived();
  } else if (view === 'flagged') {
    if (pushStack) navStack.push({ view: 'flagged' });
    setTopBar('Flagged Items', true, { search: false, filter: false, archive: false, newBtn: false });
    loadFlaggedItems();
  }
}

function goBack() {
  navStack.pop();
  const prev = navStack[navStack.length - 1];
  if (prev) navigateTo(prev.view, prev.data, false);
  else switchTab('home');
}

function setTopBar(title, showBack, buttons) {
  $topTitle.textContent = title;
  $topBack.classList.toggle('visible', showBack);
  $logoMark.style.display = showBack ? 'none' : 'grid';
  $searchBtn.style.display = buttons.search ? 'grid' : 'none';
  $filterBtn.style.display = buttons.filter ? 'grid' : 'none';
  $archiveBtn.style.display = buttons.archive ? 'grid' : 'none';
  $newBtn.style.display = buttons.newBtn ? 'inline-flex' : 'none';
}

$topBack.onclick = goBack;

// ── Tab switching ────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.side-nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  if (tab === 'home') navigateTo('dashboard');
  else if (tab === 'projects') navigateTo('projects');
  else if (tab === 'template') navigateTo('template');
  else if (tab === 'reports') navigateTo('reports');
  else if (tab === 'more') navigateTo('more');
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
document.querySelectorAll('.side-nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

$newBtn.onclick = () => openNewProjectModal();
$archiveBtn.onclick = () => navigateTo('archived');

// ════════════════════════════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════════════════════════════

// ── Dashboard ────────────────────────────────────────────────────────
async function loadDashboard() {
  const data = await api('/dashboard');
  let totalProjects = data.active_projects.length;
  let totalItems = 0, totalConfirmed = 0;
  data.active_projects.forEach(p => { totalItems += p.total_items; totalConfirmed += p.confirmed_count; });
  const overallPct = totalItems > 0 ? Math.round((totalConfirmed / totalItems) * 100) : 0;

  // Fetch calendar events for mini calendar
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let dashEvents = [];
  try { dashEvents = await api(`/events?month=${monthKey}`); } catch {}

  let html = `
    <div class="dash-hero">
      <div class="dash-hero-greeting">
        <h2 class="dash-hero-title">Welcome to Site<em>Check</em></h2>
        <p class="dash-hero-subtitle">Construction quality control at your fingertips</p>
      </div>
      <div class="dash-stats-row">
        <div class="dash-stat-card"><div class="dash-stat-number">${totalProjects}</div><div class="dash-stat-label">Active Projects</div></div>
        <div class="dash-stat-card"><div class="dash-stat-number">${overallPct}%</div><div class="dash-stat-label">Overall Progress</div></div>
        <div class="dash-stat-card accent"><div class="dash-stat-number">${data.total_flagged}</div><div class="dash-stat-label">Flagged Items</div></div>
      </div>
    </div>`;

  if (data.total_flagged > 0) {
    html += `<div class="attention-widget" id="attention-widget"><div class="attention-header"><div class="attention-icon">⚠</div><div class="attention-title">Needs Attention</div></div><div class="attention-counts"><div class="attention-stat"><strong>${data.total_flagged}</strong> flagged items</div></div></div>`;
  }

  // Two-column layout: projects left, calendar right (desktop)
  html += '<div class="dash-two-col">';

  // Left column: projects
  html += '<div class="dash-col-main">';
  if (!data.active_projects.length) {
    html += `<div class="empty-state"><div class="empty-icon"><svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="26" height="26" rx="4"/><path d="M16 10v12M10 16h12"/></svg></div><div class="empty-title">No active projects</div><div class="empty-desc">Tap "+ New Project" to create your first project.</div></div>`;
  } else {
    html += '<div class="section-title">Active Projects</div><div class="p-grid-desktop">';
    data.active_projects.forEach(p => html += renderProjectCard(p));
    html += '</div>';
  }
  html += '</div>';

  // Right column: mini calendar + events
  html += '<div class="dash-col-side">';
  html += buildMiniCalendar(now, dashEvents);

  // Add event button
  html += `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:10px" id="dash-add-event">+ Add Event</button>`;

  // All events this month, sorted by date
  const todayStr = now.toISOString().slice(0, 10);
  const sortedEvents = [...dashEvents].sort((a, b) => a.event_date.localeCompare(b.event_date));

  html += '<div class="dash-upcoming">';
  if (sortedEvents.length) {
    html += '<div class="section-title" style="padding-top:12px">Events This Month</div>';
    sortedEvents.forEach(ev => {
      const isPast = ev.event_date < todayStr;
      const isToday = ev.event_date === todayStr;
      html += `<div class="dash-event-item ${isToday ? 'today-event' : ''} ${isPast ? 'past-event' : ''} ${ev.notify ? 'notify-event' : ''}" data-event-id="${ev.id}">
        ${ev.notify ? '<span class="dash-event-bell">&#128276;</span>' : ''}
        <div class="dash-event-date">${ev.event_date.slice(5)}${ev.event_time ? ' at ' + ev.event_time : ''}${isToday ? ' &mdash; Today' : ''}</div>
        <div class="dash-event-title">${esc(ev.title)}</div>
        ${ev.note ? `<div class="dash-event-note">${esc(ev.note)}</div>` : ''}
      </div>`;
    });
  } else {
    html += '<p style="font-size:.82rem;color:var(--text-muted);padding:16px 0;text-align:center">No events this month</p>';
  }
  html += '</div>';

  html += '</div>';
  html += '</div>'; // close dash-two-col

  $content.innerHTML = html;
  const aw = $('#attention-widget');
  if (aw) aw.onclick = () => navigateTo('flagged');
  bindProjectCards();

  // Bind mini calendar day clicks -> create event
  const projects = data.active_projects;
  $content.querySelectorAll('.mini-cal-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const d = parseInt(cell.textContent);
      const clickedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      openAddEventModal(clickedDate, projects);
    });
  });

  // Bind add event button
  const addEvBtn = document.getElementById('dash-add-event');
  if (addEvBtn) addEvBtn.onclick = () => openAddEventModal(todayStr, projects);

  // Bind event card clicks -> edit
  $content.querySelectorAll('.dash-event-item[data-event-id]').forEach(card => {
    card.addEventListener('click', () => openEditEventModal(parseInt(card.dataset.eventId), projects));
  });

  // Fire browser notification for today's events with notify flag
  if ('Notification' in window && Notification.permission === 'granted') {
    dashEvents.filter(e => e.event_date === todayStr && e.notify).forEach(ev => {
      new Notification('SiteCheck Reminder', { body: `${ev.title}${ev.event_time ? ' at ' + ev.event_time : ''}`, icon: '/static/icon.png' });
    });
  } else if ('Notification' in window && Notification.permission === 'default') {
    const hasNotify = dashEvents.some(e => e.notify);
    if (hasNotify) Notification.requestPermission();
  }
}

function buildMiniCalendar(date, events) {
  const year = date.getFullYear(), month = date.getMonth();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthStr = String(month + 1).padStart(2, '0');
  const today = date.getDate();

  let h = `<div class="mini-cal"><div class="mini-cal-title">${monthNames[month]} ${year}</div><div class="mini-cal-grid">`;
  ['S','M','T','W','T','F','S'].forEach(d => h += `<div class="mini-cal-label">${d}</div>`);
  for (let i = 0; i < firstDay; i++) h += '<div class="mini-cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
    const hasEv = events.some(e => e.event_date === dateStr);
    const isToday = d === today;
    h += `<div class="mini-cal-cell ${isToday ? 'today' : ''} ${hasEv ? 'has-event' : ''}">${d}</div>`;
  }
  h += '</div></div>';
  return h;
}

function renderProjectCard(p) {
  const dotClass = p.has_flags ? 'orange' : 'green';
  return `<div class="card project-card" data-id="${p.id}"><div class="project-card-header"><div class="project-avatar">${initials(p.name)}</div><div class="project-info"><div class="project-name">${esc(p.name)}</div><div class="project-client">${esc(p.client_name || 'No client')}</div><div class="project-address">${esc(p.site_address || '')}</div>${p.current_phase ? `<div class="project-phase-tag">${esc(p.current_phase)}</div>` : ''}</div><div class="project-status-dot ${dotClass}"></div></div><div class="project-progress-row"><div class="project-progress-bar"><div class="project-progress-fill" style="width:${p.progress_pct}%"></div></div><span class="project-pct">${p.progress_pct}%</span></div></div>`;
}

function bindProjectCards() {
  $content.querySelectorAll('.project-card').forEach(el => {
    el.addEventListener('click', () => navigateTo('project-detail', { id: parseInt(el.dataset.id), name: el.querySelector('.project-name').textContent }));
  });
}

// ── Projects list ────────────────────────────────────────────────────
async function loadProjects() {
  const projects = await api('/projects');
  if (!projects.length) {
    $content.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="26" height="26" rx="4"/><path d="M16 10v12M10 16h12"/></svg></div><div class="empty-title">No projects yet</div><div class="empty-desc">Create your first project to start quality checks.</div></div>`;
    return;
  }
  $content.innerHTML = '<div class="p-grid-desktop">' + projects.map(p => renderProjectCard(p)).join('') + '</div>';
  bindProjectCards();
}

// ── Project Detail (REDESIGNED per wireframe) ────────────────────────
async function loadProjectDetail(projectId) {
  const project = await api(`/projects/${projectId}`);
  currentProject = project;

  // Header with project info + edit dropdown
  let html = `
    <div class="proj-detail-header">
      <div class="proj-detail-info">
        <h1 class="proj-detail-name">${esc(project.name)}</h1>
        <p class="proj-detail-meta">
          ${project.client_name ? esc(project.client_name) : 'No client'}
          ${project.site_address ? ' &middot; ' + esc(project.site_address) : ''}
          ${project.supervisor ? ' &middot; ' + esc(project.supervisor) : ''}
        </p>
      </div>
      <div class="proj-edit-dropdown-wrap">
        <button class="proj-edit-btn" id="proj-edit-toggle" title="Options">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="4" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="16" r="1.5"/></svg>
        </button>
        <div class="proj-edit-dropdown" id="proj-edit-menu">
          <button class="proj-edit-option" id="proj-opt-edit">Edit Project</button>
          <button class="proj-edit-option" id="proj-opt-archive">Archive</button>
          <button class="proj-edit-option danger" id="proj-opt-delete">Delete</button>
        </div>
      </div>
    </div>`;

  // General Notes inline
  const notes = project.notes || [];
  html += `
    <div class="notes-inline">
      <div class="notes-inline-header" id="notes-toggle">
        <span>General Notes</span>
        <span class="notes-count">${notes.length}</span>
        <svg class="notes-chevron" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l6 6 6-6"/></svg>
      </div>
      <div class="notes-inline-body" id="notes-body">
        <div class="notes-input-row">
          <textarea class="notes-textarea" id="inline-note-input" placeholder="Add a note..." rows="2"></textarea>
          <button class="btn btn-primary btn-sm" id="inline-note-save">Add</button>
        </div>`;
  if (notes.length) {
    notes.slice(0, 5).forEach(n => {
      const date = new Date(n.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += `<div class="note-entry"><div class="note-date">${date}</div><div class="note-text">${esc(n.content)}</div></div>`;
    });
  }
  html += `</div></div>`;

  // Inline filter toolbar
  html += `
    <div class="filter-toolbar">
      <div class="filter-toolbar-chips">
        <button class="filter-chip active" data-pf="all">All</button>
        <button class="filter-chip confirmed" data-pf="confirmed">Completed</button>
        <button class="filter-chip flagged" data-pf="flagged">Flagged</button>
        <button class="filter-chip unchecked" data-pf="unchecked">Open</button>
        <button class="filter-chip na-filter" data-pf="na">N/A</button>
      </div>
      <div class="filter-toolbar-search">
        <input class="filter-search-input" id="proj-search-input" placeholder="Search items...">
      </div>
    </div>`;

  // Phases (collapsible, closed by default)
  html += '<div class="section-title">Phases</div>';
  project.phases.forEach((ph, i) => {
    const isComplete = ph.is_complete;
    const catCount = ph.categories ? ph.categories.length : (ph.category_count || 0);
    html += `
      <div class="card phase-card" data-id="${ph.id}" data-name="${esc(ph.name)}">
        <div class="phase-number ${isComplete ? 'complete' : ''}">${isComplete ? '✓' : i + 1}</div>
        <div class="phase-info">
          <div class="phase-name">${esc(ph.name)}</div>
          <div class="phase-stats">
            ${ph.confirmed_count ? `<span class="phase-stat confirmed">${ph.confirmed_count} ✓</span>` : ''}
            ${ph.flagged_count ? `<span class="phase-stat flagged">${ph.flagged_count} ⚑</span>` : ''}
            ${ph.unchecked_count ? `<span class="phase-stat unchecked">${ph.unchecked_count} ○</span>` : ''}
            ${ph.na_count ? `<span class="phase-stat na">${ph.na_count} —</span>` : ''}
          </div>
        </div>
        <div class="phase-progress">
          <div class="phase-pct">${ph.progress_pct}%</div>
          <div class="phase-mini-bar"><div class="phase-mini-fill" style="width:${ph.progress_pct}%"></div></div>
        </div>
        ${isComplete ? '<div class="phase-complete-badge">★</div>' : ''}
        <span class="phase-chevron"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4l6 6-6 6"/></svg></span>
      </div>`;
  });

  $content.innerHTML = html;

  // Edit dropdown toggle
  const editToggle = $('#proj-edit-toggle');
  const editMenu = $('#proj-edit-menu');
  editToggle.onclick = (e) => { e.stopPropagation(); editMenu.classList.toggle('open'); };
  document.addEventListener('click', () => editMenu.classList.remove('open'), { once: true });

  $('#proj-opt-edit').onclick = () => { editMenu.classList.remove('open'); openEditProjectModal(project); };
  $('#proj-opt-archive').onclick = async () => { editMenu.classList.remove('open'); if (confirm('Archive this project?')) { await api(`/projects/${projectId}/archive`, { method: 'PATCH' }); goBack(); } };
  $('#proj-opt-delete').onclick = async () => { editMenu.classList.remove('open'); if (confirm('Permanently delete? This cannot be undone.')) { await api(`/projects/${projectId}`, { method: 'DELETE' }); goBack(); } };

  // Notes toggle
  const notesToggle = $('#notes-toggle');
  const notesBody = $('#notes-body');
  notesToggle.onclick = () => { notesBody.classList.toggle('expanded'); notesToggle.querySelector('.notes-chevron').classList.toggle('rotated'); };

  // Inline note save
  $('#inline-note-save').onclick = async () => {
    const content = $('#inline-note-input').value.trim();
    if (!content) return;
    await api(`/projects/${projectId}/notes`, { method: 'POST', body: { content } });
    loadProjectDetail(projectId);
  };

  // Filter chips (multi-select, filter phases by item status)
  let projFilters = new Set();
  document.querySelectorAll('[data-pf]').forEach(chip => {
    chip.onclick = () => {
      const val = chip.dataset.pf;
      if (val === 'all') {
        projFilters.clear();
        document.querySelectorAll('[data-pf]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      } else {
        document.querySelector('[data-pf="all"]')?.classList.remove('active');
        chip.classList.toggle('active');
        if (projFilters.has(val)) projFilters.delete(val); else projFilters.add(val);
        if (projFilters.size === 0) {
          document.querySelector('[data-pf="all"]')?.classList.add('active');
        }
      }
      $content.querySelectorAll('.phase-card').forEach(pc => {
        if (projFilters.size === 0) { pc.style.display = ''; return; }
        let show = false;
        projFilters.forEach(f => { if (pc.querySelector(`.phase-stat.${f}`)) show = true; });
        pc.style.display = show ? '' : 'none';
      });
    };
  });

  // Search
  const searchInput = $('#proj-search-input');
  if (searchInput) {
    let debounce;
    searchInput.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const q = searchInput.value.trim();
        if (!q) { $content.querySelectorAll('.phase-card').forEach(pc => pc.style.display = ''); return; }
        const results = await api(`/projects/${projectId}/search?q=${encodeURIComponent(q)}`);
        const matchedPhaseIds = new Set(results.map(r => r.phase_id));
        $content.querySelectorAll('.phase-card').forEach(pc => {
          pc.style.display = matchedPhaseIds.has(parseInt(pc.dataset.id)) ? '' : 'none';
        });
      }, 250);
    };
  }

  // Phase cards: double-click to open phase detail
  $content.querySelectorAll('.phase-card').forEach(el => {
    el.addEventListener('dblclick', () => {
      navigateTo('phase-detail', { id: parseInt(el.dataset.id), name: el.dataset.name });
    });
  });
}

// ── Edit Project Modal ───────────────────────────────────────────────
function openEditProjectModal(project) {
  $('#modal-body').innerHTML = `
    <h2>Edit Project</h2>
    <div class="form-group"><label class="form-label">Project Name</label><input class="form-input" id="m-name" value="${esc(project.name)}"></div>
    <div class="form-group"><label class="form-label">Client Name</label><input class="form-input" id="m-client" value="${esc(project.client_name)}"></div>
    <div class="form-group"><label class="form-label">Site Address</label><input class="form-input" id="m-address" value="${esc(project.site_address)}"></div>
    <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" id="m-date" type="date" value="${project.start_date || ''}"></div>
    <div class="form-group"><label class="form-label">Supervisor</label><input class="form-input" id="m-supervisor" value="${esc(project.supervisor)}"></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-submit">Save</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => {
    await api(`/projects/${project.id}`, {
      method: 'PATCH',
      body: { name: $('#m-name').value.trim(), client_name: $('#m-client').value.trim(), site_address: $('#m-address').value.trim(), start_date: $('#m-date').value || null, supervisor: $('#m-supervisor').value.trim() }
    });
    closeModal();
    loadProjectDetail(project.id);
  };
  bindModalEnter();
}

// ── Phase Detail (with collapsible categories) ───────────────────────
async function loadPhaseDetail(phaseId) {
  const phase = await api(`/phases/${phaseId}`);
  currentPhase = phase;
  const categories = phase.categories || [];

  if (!categories.length) {
    $content.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="26" height="26" rx="4"/></svg></div><div class="empty-title">No items yet</div></div>`;
    return;
  }

  let total = 0, counts = { unchecked: 0, flagged: 0, confirmed: 0, na: 0 };
  categories.forEach(c => c.items.forEach(i => { total++; counts[i.status]++; }));
  const active = total - counts.na;
  const pct = active > 0 ? Math.round((counts.confirmed / active) * 100) : (total > 0 ? 100 : 0);

  let html = `
    <div class="progress-section">
      <div class="progress-header"><span class="progress-label">Phase Progress</span><span class="progress-value">${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="status-grid">
        <div class="status-grid-item unchecked"><div class="status-grid-count">${counts.unchecked}</div><div class="status-grid-label">Open</div></div>
        <div class="status-grid-item flagged"><div class="status-grid-count">${counts.flagged}</div><div class="status-grid-label">Flagged</div></div>
        <div class="status-grid-item confirmed"><div class="status-grid-count">${counts.confirmed}</div><div class="status-grid-label">Completed</div></div>
        <div class="status-grid-item na"><div class="status-grid-count">${counts.na}</div><div class="status-grid-label">N/A</div></div>
      </div>
    </div>`;

  // Timer widget
  const isTimerForThisPhase = timerState.running && timerState.phaseId === phaseId;
  html += `
    <div class="timer-widget ${isTimerForThisPhase ? 'running' : ''}">
      <div class="timer-display">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg>
        <span class="timer-clock" id="timer-clock">${isTimerForThisPhase ? formatTimer(timerState.elapsed) : '00:00:00'}</span>
      </div>
      <div class="timer-actions">
        ${isTimerForThisPhase
          ? `<button class="btn btn-sm timer-stop-btn" id="timer-stop">Stop</button>`
          : `<button class="btn btn-primary btn-sm" id="timer-start">Start Inspection</button>`
        }
        <button class="btn btn-ghost btn-sm" id="timer-history-btn">History</button>
      </div>
    </div>`;

  // Inline filter + search
  html += `
    <div class="filter-toolbar">
      <div class="filter-toolbar-chips">
        <button class="filter-chip active" data-if="all">All</button>
        <button class="filter-chip confirmed" data-if="confirmed">Completed</button>
        <button class="filter-chip flagged" data-if="flagged">Flagged</button>
        <button class="filter-chip unchecked" data-if="unchecked">Open</button>
        <button class="filter-chip na-filter" data-if="na">N/A</button>
      </div>
      <div class="filter-toolbar-search">
        <input class="filter-search-input" id="phase-search-input" placeholder="Search...">
      </div>
    </div>`;

  html += `<div class="item-hint">Tap = Flag &middot; Double-tap = Approve &middot; Swipe left = N/A &middot; Swipe right = Undo</div>`;

  // Collapsible categories
  categories.forEach(cat => {
    const catCounts = { unchecked: 0, flagged: 0, confirmed: 0, na: 0 };
    cat.items.forEach(i => catCounts[i.status]++);
    const isExpanded = categoryCollapseState[cat.id] === true;

    html += `
      <div class="cat-section" data-cat-id="${cat.id}">
        <div class="cat-header" data-cat-id="${cat.id}">
          <span class="cat-header-name">${esc(cat.name)}</span>
          <span class="cat-header-badges">
            ${catCounts.confirmed ? `<span class="cat-badge confirmed">${catCounts.confirmed}</span>` : ''}
            ${catCounts.flagged ? `<span class="cat-badge flagged">${catCounts.flagged}</span>` : ''}
            ${catCounts.unchecked ? `<span class="cat-badge unchecked">${catCounts.unchecked}</span>` : ''}
          </span>
          <svg class="cat-chevron ${isExpanded ? 'rotated' : ''}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l6 6 6-6"/></svg>
        </div>
        <div class="cat-body ${isExpanded ? 'expanded' : ''}">`;
    cat.items.forEach(item => html += renderItemCard(item));
    html += `<button class="add-item-btn" data-cat-id="${cat.id}" data-cat-name="${esc(cat.name)}">+ Add Item</button>
        </div>
      </div>`;
  });

  $content.innerHTML = html;

  // Category collapse toggle (double-click to expand/collapse)
  document.querySelectorAll('.cat-header').forEach(header => {
    header.addEventListener('dblclick', () => {
      const catId = header.dataset.catId;
      const body = header.nextElementSibling;
      const chevron = header.querySelector('.cat-chevron');
      body.classList.toggle('expanded');
      chevron.classList.toggle('rotated');
      categoryCollapseState[catId] = body.classList.contains('expanded');
    });
  });

  // Inline filter chips (multi-select)
  let activeFilters = new Set();
  document.querySelectorAll('[data-if]').forEach(chip => {
    chip.onclick = () => {
      const val = chip.dataset.if;
      if (val === 'all') {
        activeFilters.clear();
        document.querySelectorAll('[data-if]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      } else {
        document.querySelector('[data-if="all"]')?.classList.remove('active');
        chip.classList.toggle('active');
        if (activeFilters.has(val)) activeFilters.delete(val); else activeFilters.add(val);
        if (activeFilters.size === 0) {
          document.querySelector('[data-if="all"]')?.classList.add('active');
        }
      }
      document.querySelectorAll('.item-card').forEach(card => {
        card.style.display = (activeFilters.size === 0 || activeFilters.has(card.dataset.status)) ? '' : 'none';
      });
    };
  });

  // Inline search
  const phaseSearch = $('#phase-search-input');
  if (phaseSearch) {
    phaseSearch.oninput = () => {
      const q = phaseSearch.value.trim().toLowerCase();
      document.querySelectorAll('.item-card').forEach(card => {
        const desc = card.querySelector('.item-desc')?.textContent?.toLowerCase() || '';
        card.style.display = (!q || desc.includes(q)) ? '' : 'none';
      });
    };
  }

  bindItemCards(phaseId);

  $content.querySelectorAll('.add-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openAddItemModal(parseInt(btn.dataset.catId), btn.dataset.catName, phaseId); });
  });

  // Timer bindings
  const startBtn = $('#timer-start');
  const stopBtn = $('#timer-stop');
  const historyBtn = $('#timer-history-btn');

  if (startBtn) {
    startBtn.onclick = async () => {
      const resp = await api(`/phases/${phaseId}/timer/start`, { method: 'POST', body: {} });
      timerState = { running: true, inspectionId: resp.id, phaseId, startTime: Date.now(), elapsed: 0, interval: null };
      timerState.interval = setInterval(() => {
        timerState.elapsed = Math.floor((Date.now() - timerState.startTime) / 1000);
        const el = document.getElementById('timer-clock');
        if (el) el.textContent = formatTimer(timerState.elapsed);
      }, 1000);
      loadPhaseDetail(phaseId);
    };
  }

  if (stopBtn) {
    stopBtn.onclick = () => openStopTimerModal(phaseId);
  }

  if (historyBtn) {
    historyBtn.onclick = () => openTimerHistoryModal(phaseId);
  }

  // Resume ticking if timer is running for this phase
  if (isTimerForThisPhase && !timerState.interval) {
    timerState.interval = setInterval(() => {
      timerState.elapsed = Math.floor((Date.now() - timerState.startTime) / 1000);
      const el = document.getElementById('timer-clock');
      if (el) el.textContent = formatTimer(timerState.elapsed);
    }, 1000);
  }

  if (pct === 100 && active > 0) triggerConfetti();
}

function renderItemCard(item) {
  const hasComment = item.comment && item.comment.trim();
  return `
    <div class="card item-card" data-status="${item.status}" data-id="${item.id}">
      <div class="item-content">
        <div class="item-desc">${esc(item.description)}</div>
        <div class="item-meta">
          <span class="tag-badge ${tagClass(item.tag)}" data-tag="${item.tag}">${esc(item.tag)}</span>
          <span class="item-status-label ${item.status}">${STATUS_LABELS[item.status]}</span>
        </div>
        ${hasComment ? `<div style="font-size:.75rem;color:var(--text-secondary);margin-top:4px;font-style:italic;padding-left:8px;border-left:2px solid var(--border)">${esc(item.comment)}</div>` : ''}
      </div>
      <div class="comment-icon ${hasComment ? 'has-comment' : ''}" data-id="${item.id}" title="Comment">
        <svg width="20" height="20" fill="${hasComment ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </div>
    </div>`;
}

// ── Item Gesture Binding ─────────────────────────────────────────────
// Single tap = FLAG | Double tap = APPROVE | Swipe left = N/A | Swipe right = UNDO
function bindItemCards(phaseId) {
  let lastTap = 0, lastTapId = null;

  $content.querySelectorAll('.item-card').forEach(card => {
    const itemId = card.dataset.id;

    // Comment icon
    card.querySelector('.comment-icon').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!bulkMode) openCommentSheet(parseInt(itemId), phaseId);
    });

    // Swipe handling (touch + mouse for desktop)
    let startX = 0, startY = 0, swipeDir = null, isDragging = false;

    function onSwipeStart(x, y) { startX = x; startY = y; swipeDir = null; isDragging = true; }
    function onSwipeMove(x, y) {
      if (!isDragging) return;
      const dx = x - startX;
      const dy = Math.abs(y - startY);
      if (Math.abs(dx) > 30 && dy < 30) {
        swipeDir = dx < 0 ? 'left' : 'right';
        card.style.transform = `translateX(${Math.max(Math.min(dx, 100), -100)}px)`;
        card.style.opacity = Math.max(0.5, 1 - Math.abs(dx) / 200);
      }
    }
    async function onSwipeEnd() {
      if (!isDragging) return;
      isDragging = false;
      card.style.transition = 'transform .2s, opacity .2s';
      card.style.transform = '';
      card.style.opacity = '';
      setTimeout(() => { card.style.transition = ''; }, 200);

      if (swipeDir === 'left') {
        await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: 'na' } });
        loadPhaseDetail(phaseId);
      } else if (swipeDir === 'right') {
        await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: 'unchecked' } });
        loadPhaseDetail(phaseId);
      }
      swipeDir = null;
    }

    // Touch events
    card.addEventListener('touchstart', (e) => onSwipeStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    card.addEventListener('touchmove', (e) => onSwipeMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    card.addEventListener('touchend', onSwipeEnd);

    // Mouse events (desktop swipe)
    card.addEventListener('mousedown', (e) => { if (e.button === 0) onSwipeStart(e.clientX, e.clientY); });
    card.addEventListener('mousemove', (e) => { if (isDragging) { e.preventDefault(); onSwipeMove(e.clientX, e.clientY); } });
    card.addEventListener('mouseup', onSwipeEnd);
    card.addEventListener('mouseleave', () => { if (isDragging) onSwipeEnd(); });

    // Click: single tap = flag, double tap = approve
    card.addEventListener('click', (e) => {
      if (e.target.closest('.comment-icon')) return;
      if (swipeDir) return;
      if (bulkMode) { toggleBulkSelect(card); return; }

      const now = Date.now();
      const isDoubleTap = (now - lastTap < 350) && (lastTapId === itemId);
      lastTap = now;
      lastTapId = itemId;

      if (isDoubleTap) {
        clearTimeout(card._tapTimer);
        (async () => {
          await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: 'confirmed' } });
          loadPhaseDetail(phaseId);
        })();
        return;
      }

      card._tapTimer = setTimeout(async () => {
        if (Date.now() - lastTap >= 300 || lastTapId !== itemId) {
          const st = card.dataset.status;
          if (st === 'unchecked') {
            await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: 'flagged' } });
            loadPhaseDetail(phaseId);
          } else {
            showActionMenu(parseInt(itemId), card, phaseId);
          }
        }
      }, 350);
    });

    // Long press = bulk mode
    let pressTimer;
    card.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => { if (!bulkMode && !swipeDir) { enterBulkMode(); toggleBulkSelect(card); } }, 600);
    }, { passive: true });
    card.addEventListener('touchend', () => clearTimeout(pressTimer));
    card.addEventListener('touchmove', () => clearTimeout(pressTimer));

    // Right-click = action menu
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!bulkMode) showActionMenu(parseInt(itemId), card, phaseId); });
  });
}

// ── Action Menu (with Edit & Move) ───────────────────────────────────
function showActionMenu(itemId, anchorEl, phaseId) {
  document.querySelectorAll('.action-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'action-menu open';
  menu.innerHTML = `
    <button class="action-menu-item" data-action="confirmed"><div class="dot" style="background:var(--confirmed)"></div>Approve</button>
    <button class="action-menu-item" data-action="flagged"><div class="dot" style="background:var(--flagged)"></div>Flag</button>
    <button class="action-menu-item" data-action="na"><div class="dot" style="background:var(--na)"></div>N/A</button>
    <button class="action-menu-item" data-action="unchecked"><div class="dot" style="background:var(--unchecked)"></div>Reset</button>
    <button class="action-menu-item" data-action="comment">Add / Edit Comment</button>
    <button class="action-menu-item" data-action="edit">Edit Item</button>
    <button class="action-menu-item" data-action="move">Move to Category...</button>
  `;
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 320) + 'px';
  menu.style.right = '16px';
  document.body.appendChild(menu);

  menu.querySelectorAll('.action-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      menu.remove();
      if (action === 'comment') { openCommentSheet(itemId, phaseId); }
      else if (action === 'edit') { openEditItemModal(itemId, phaseId); }
      else if (action === 'move') { openMoveItemModal(itemId, phaseId); }
      else { await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: action } }); loadPhaseDetail(phaseId); }
    });
  });

  setTimeout(() => document.addEventListener('click', function handler(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', handler); } }), 10);
}

// ── Edit Item Modal ──────────────────────────────────────────────────
async function openEditItemModal(itemId, phaseId) {
  const card = document.querySelector(`.item-card[data-id="${itemId}"]`);
  const desc = card?.querySelector('.item-desc')?.textContent || '';
  const tag = card?.querySelector('.tag-badge')?.dataset.tag || 'VERIFY';

  $('#modal-body').innerHTML = `
    <h2>Edit Item</h2>
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="m-desc" value="${esc(desc)}"></div>
    <div class="form-group"><label class="form-label">Tag</label><select class="form-select" id="m-tag">${TAG_LABELS.map(t => `<option value="${t}" ${t === tag ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-submit">Save</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => {
    await api(`/items/${itemId}`, { method: 'PATCH', body: { description: $('#m-desc').value.trim(), tag: $('#m-tag').value } });
    closeModal();
    loadPhaseDetail(phaseId);
  };
  bindModalEnter();
}

// ── Move Item Modal ──────────────────────────────────────────────────
async function openMoveItemModal(itemId, phaseId) {
  const phase = currentPhase;
  if (!phase || !phase.categories) return;
  const item = document.querySelector(`.item-card[data-id="${itemId}"]`);
  const currentCatId = item?.closest('.cat-section')?.dataset.catId;

  $('#modal-body').innerHTML = `
    <h2>Move Item</h2>
    <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:12px">Select destination category:</p>
    ${phase.categories.filter(c => String(c.id) !== currentCatId).map(c => `<button class="btn btn-outline move-cat-btn" data-cat-id="${c.id}" style="display:block;width:100%;margin-bottom:8px;text-align:left">${esc(c.name)}</button>`).join('')}
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  document.querySelectorAll('.move-cat-btn').forEach(btn => {
    btn.onclick = async () => {
      await api(`/items/${itemId}/move`, { method: 'PATCH', body: { target_category_id: parseInt(btn.dataset.catId) } });
      closeModal();
      loadPhaseDetail(phaseId);
    };
  });
}

// ── Bulk Mode ────────────────────────────────────────────────────────
function enterBulkMode() { bulkMode = true; bulkSelected.clear(); $bulkBar.classList.add('active'); updateBulkCount(); }
function exitBulkMode() { bulkMode = false; bulkSelected.clear(); $bulkBar.classList.remove('active'); document.querySelectorAll('.item-card.selected').forEach(c => c.classList.remove('selected')); }
function toggleBulkSelect(card) { const id = card.dataset.id; if (bulkSelected.has(id)) { bulkSelected.delete(id); card.classList.remove('selected'); } else { bulkSelected.add(id); card.classList.add('selected'); } updateBulkCount(); if (bulkSelected.size === 0) exitBulkMode(); }
function updateBulkCount() { $('#bulk-count').textContent = `${bulkSelected.size} selected`; }
$('#bulk-cancel').onclick = exitBulkMode;
document.querySelectorAll('.bulk-btn[data-action]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const status = btn.dataset.action;
    const ids = [...bulkSelected].map(Number);
    const params = ids.map(id => `item_ids=${id}`).join('&');
    await fetch(`${API}/items/bulk-status?${params}&status=${status}`, { method: 'PATCH' });
    exitBulkMode();
    if (currentPhase) loadPhaseDetail(currentPhase.id);
  });
});

// ── Comment Sheet ────────────────────────────────────────────────────
function openCommentSheet(itemId, phaseId) {
  const card = document.querySelector(`.item-card[data-id="${itemId}"]`);
  const existing = card ? (card.querySelector('[style*="font-style"]')?.textContent || '') : '';
  $('#comment-input').value = existing;
  $sheetOverlay.classList.add('open');
  $commentSheet.classList.add('open');
  setTimeout(() => $('#comment-input').focus(), 300);
  $('#comment-save').onclick = async () => { await api(`/items/${itemId}/comment`, { method: 'PATCH', body: { comment: $('#comment-input').value.trim() } }); closeSheet(); if (phaseId) loadPhaseDetail(phaseId); };
  $('#comment-cancel').onclick = closeSheet;
}

function closeSheet() { $sheetOverlay.classList.remove('open'); $commentSheet.classList.remove('open'); $searchSheet.classList.remove('open'); }
$sheetOverlay.onclick = closeSheet;

// ── Template view ────────────────────────────────────────────────────
async function loadTemplate() {
  let template;
  try { template = await api('/template'); } catch {
    $content.innerHTML = `<div class="empty-state"><div class="empty-title">No template found</div><button class="btn btn-outline" id="seed-template-btn">Seed Master Template</button></div>`;
    $('#seed-template-btn').onclick = async () => { await api('/template/seed', { method: 'POST' }); loadTemplate(); };
    return;
  }
  if (!template.phases || !template.phases.length) {
    $content.innerHTML = `<div class="empty-state"><div class="empty-title">Template is empty</div><button class="btn btn-outline" id="seed-template-btn">Seed Master Template</button></div>`;
    $('#seed-template-btn').onclick = async () => { await api('/template/seed', { method: 'POST' }); loadTemplate(); };
    return;
  }

  let totalItems = 0;
  template.phases.forEach(ph => ph.categories.forEach(c => totalItems += c.items.length));

  let html = `<div class="template-header"><h3>Master Checklist Template</h3><p>${template.phases.length} phases &middot; ${totalItems} items</p><p class="template-hint">Items added in any project sync back here.</p></div>`;

  template.phases.forEach((phase, pi) => {
    let phaseItemCount = 0;
    phase.categories.forEach(c => phaseItemCount += c.items.length);
    html += `<div class="tmpl-phase"><div class="tmpl-phase-header" data-phase-idx="${pi}"><div class="tmpl-phase-number">${pi + 1}</div><div class="tmpl-phase-info"><div class="tmpl-phase-name">${esc(phase.name)}</div><div class="tmpl-phase-meta">${phase.categories.length} categories &middot; ${phaseItemCount} items</div></div><svg class="tmpl-chevron" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></div><div class="tmpl-phase-body" id="tmpl-phase-${pi}">`;
    phase.categories.forEach(cat => {
      html += `<div class="tmpl-category"><div class="tmpl-cat-name">${esc(cat.name)} <span class="tmpl-cat-count">${cat.items.length}</span></div><div class="tmpl-items">`;
      cat.items.forEach(item => { html += `<div class="tmpl-item"><span class="tag-badge ${tagClass(item.tag)}" data-tag="${item.tag}" style="font-size:.55rem">${esc(item.tag)}</span><span class="tmpl-item-desc">${esc(item.description)}</span></div>`; });
      html += '</div></div>';
    });
    html += '</div></div>';
  });
  $content.innerHTML = html;
  document.querySelectorAll('.tmpl-phase-header').forEach(header => {
    header.addEventListener('click', () => {
      const body = document.getElementById(`tmpl-phase-${header.dataset.phaseIdx}`);
      body.classList.toggle('expanded');
      header.querySelector('.tmpl-chevron').classList.toggle('rotated');
    });
  });
}

// ── Archived / Flagged / Notes / Reports / More ──────────────────────
async function loadArchived() {
  const projects = await api('/projects?archived=true');
  if (!projects.length) { $content.innerHTML = `<div class="empty-state"><div class="empty-title">No archived projects</div></div>`; return; }
  let html = '';
  projects.forEach(p => { html += `<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div style="font-weight:600">${esc(p.name)}</div><div style="font-size:.78rem;color:var(--text-muted)">${esc(p.client_name)}</div></div><div style="display:flex;gap:6px"><button class="btn btn-ghost" style="font-size:.78rem;padding:6px 12px" data-restore="${p.id}">Restore</button><button class="btn btn-ghost" style="font-size:.78rem;padding:6px 12px;color:var(--flagged)" data-del="${p.id}">Delete</button></div></div>`; });
  $content.innerHTML = html;
  $content.querySelectorAll('[data-restore]').forEach(btn => { btn.onclick = async () => { await api(`/projects/${btn.dataset.restore}/restore`, { method: 'PATCH' }); loadArchived(); }; });
  $content.querySelectorAll('[data-del]').forEach(btn => { btn.onclick = async () => { if (confirm('Permanently delete?')) { await api(`/projects/${btn.dataset.del}`, { method: 'DELETE' }); loadArchived(); } }; });
}

async function loadFlaggedItems() {
  const items = await api('/flagged');
  if (!items.length) { $content.innerHTML = `<div class="empty-state"><div class="empty-title">No flagged items</div><div class="empty-desc">All clear!</div></div>`; return; }
  $content.innerHTML = items.map(r => `<div class="card" style="border-left:4px solid var(--flagged);cursor:pointer" data-phase-id="${r.phase_id}" data-phase-name="${esc(r.phase_name.split(' → ').pop())}"><div style="font-size:.85rem;font-weight:600">${esc(r.description)}</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:2px">${esc(r.phase_name)} → ${esc(r.category_name)}</div></div>`).join('');
  $content.querySelectorAll('.card').forEach(el => { el.onclick = () => navigateTo('phase-detail', { id: parseInt(el.dataset.phaseId), name: el.dataset.phaseName }); });
}

function showReports() { $content.innerHTML = `<div class="coming-soon"><h2>Reports</h2><p style="font-size:.9rem;margin-top:8px">PDF and Excel export coming soon.</p></div>`; }

function showMore() {
  $content.innerHTML = `
    <div class="settings-section"><div class="settings-item" id="more-archive"><div class="settings-icon" style="background:var(--na-bg);color:var(--na)"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="4" rx="1"/><path d="M3 7v7a2 2 0 002 2h10a2 2 0 002-2V7M8 11h4"/></svg></div>Archived Projects</div><div class="settings-item" id="more-seed"><div class="settings-icon" style="background:#E3F2FD;color:#42A5F5"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div>Re-seed Template</div></div>
    <div style="text-align:center;padding:20px;font-size:.75rem;color:var(--text-muted)">SiteCheck v1.0</div>`;
  $('#more-archive').onclick = () => navigateTo('archived');
  $('#more-seed').onclick = async () => { if (confirm('Re-seed template?')) { await api('/template/seed', { method: 'POST' }); alert('Done.'); } };
}

// ── Modals ───────────────────────────────────────────────────────────
function openNewProjectModal() {
  $('#modal-body').innerHTML = `
    <h2>New Project</h2>
    <div class="form-group"><label class="form-label">Project Name *</label><input class="form-input" id="m-name" placeholder="e.g. Riverside Residence" required></div>
    <div class="form-group"><label class="form-label">Client Name</label><input class="form-input" id="m-client" placeholder="e.g. John Smith"></div>
    <div class="form-group"><label class="form-label">Site Address</label><input class="form-input" id="m-address" placeholder="e.g. 123 Maple St, Toronto"></div>
    <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" id="m-date" type="date"></div>
    <div class="form-group"><label class="form-label">Supervisor</label><input class="form-input" id="m-supervisor" placeholder="e.g. Mike Johnson"></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-submit">Create Project</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => {
    const name = $('#m-name').value.trim();
    if (!name) { $('#m-name').focus(); return; }
    $('#m-submit').textContent = 'Creating...'; $('#m-submit').disabled = true;
    await api('/projects', { method: 'POST', body: { name, client_name: $('#m-client').value.trim(), site_address: $('#m-address').value.trim(), start_date: $('#m-date').value || null, supervisor: $('#m-supervisor').value.trim() } });
    closeModal();
    if (currentTab === 'home') loadDashboard(); else if (currentTab === 'projects') loadProjects();
  };
  setTimeout(() => $('#m-name').focus(), 200);
  bindModalEnter();
}

function openAddItemModal(categoryId, categoryName, phaseId) {
  $('#modal-body').innerHTML = `
    <h2>Add Item to ${esc(categoryName)}</h2>
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="m-desc" placeholder="e.g. Rebar spacing verified" required></div>
    <div class="form-group"><label class="form-label">Tag</label><select class="form-select" id="m-tag">${TAG_LABELS.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-submit">Add Item</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => { const desc = $('#m-desc').value.trim(); if (!desc) { $('#m-desc').focus(); return; } await api(`/categories/${categoryId}/items`, { method: 'POST', body: { description: desc, tag: $('#m-tag').value } }); closeModal(); loadPhaseDetail(phaseId); };
  setTimeout(() => $('#m-desc').focus(), 200);
  bindModalEnter();
}

function closeModal() { $modalOverlay.classList.remove('open'); }
$modalOverlay.onclick = (e) => { if (e.target === $modalOverlay) closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSheet(); } });
function bindModalEnter() { $modalOverlay.querySelectorAll('input').forEach(input => { input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#m-submit')?.click(); }); }); }

// ── Confetti ─────────────────────────────────────────────────────────
function triggerConfetti() {
  const c = document.createElement('div'); c.className = 'confetti-container'; document.body.appendChild(c);
  const colors = ['#F4C542','#2E7D32','#1E3A5F','#F28C38','#FFD700'];
  for (let i = 0; i < 40; i++) { const p = document.createElement('div'); p.className = 'confetti-piece'; p.style.left = Math.random()*100+'%'; p.style.background = colors[Math.floor(Math.random()*colors.length)]; p.style.animationDelay = Math.random()*.5+'s'; p.style.animationDuration = (1.5+Math.random())+'s'; c.appendChild(p); }
  setTimeout(() => c.remove(), 3000);
}

// ── Timer Helpers ───────────────────────────────────────────────────
function formatTimer(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function openStopTimerModal(phaseId) {
  $('#modal-body').innerHTML = `
    <h2>Stop Inspection</h2>
    <p style="font-size:.9rem;margin-bottom:12px">Duration: <strong>${formatTimer(timerState.elapsed)}</strong></p>
    <div class="form-group"><label class="form-label">Notes (optional)</label><textarea class="form-input" id="m-timer-note" rows="3" placeholder="Any observations..."></textarea></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-submit">Save & Stop</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => {
    clearInterval(timerState.interval);
    await api(`/inspections/${timerState.inspectionId}/stop`, {
      method: 'PATCH', body: { duration_seconds: timerState.elapsed, note: $('#m-timer-note').value.trim() }
    });
    timerState = { running: false, inspectionId: null, phaseId: null, startTime: null, elapsed: 0, interval: null };
    closeModal();
    loadPhaseDetail(phaseId);
  };
}

async function openTimerHistoryModal(phaseId) {
  const history = await api(`/phases/${phaseId}/timer/history`);
  let body = '<h2>Inspection History</h2>';
  if (!history.length) {
    body += '<p style="font-size:.85rem;color:var(--text-muted);padding:12px 0">No inspections recorded yet.</p>';
  } else {
    body += '<div style="max-height:400px;overflow-y:auto">';
    history.forEach(h => {
      const date = new Date(h.started_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const pct = h.total_items > 0 ? Math.round((h.confirmed_count / (h.total_items - h.na_count || 1)) * 100) : 0;
      body += `
        <div style="padding:12px 0;border-bottom:1px solid var(--border-light)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.92rem;font-weight:700">${formatTimer(h.duration_seconds)}</span>
            <span style="font-size:.72rem;color:var(--text-muted)">${date}</span>
          </div>
          ${h.inspector_name ? `<div style="font-size:.75rem;color:var(--navy);font-weight:600;margin-top:3px">Inspector: ${esc(h.inspector_name)}</div>` : ''}
          ${h.total_items > 0 ? `
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
              <span class="phase-stat confirmed" style="font-size:.65rem">${h.confirmed_count} Approved</span>
              <span class="phase-stat flagged" style="font-size:.65rem">${h.flagged_count} Flagged</span>
              <span class="phase-stat unchecked" style="font-size:.65rem">${h.unchecked_count} Pending</span>
              <span class="phase-stat na" style="font-size:.65rem">${h.na_count} N/A</span>
            </div>
            <div style="margin-top:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--confirmed);border-radius:2px"></div></div>
                <span style="font-size:.72rem;font-weight:700;color:var(--confirmed)">${pct}%</span>
              </div>
            </div>
          ` : ''}
          ${h.note ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-top:6px;padding:6px 8px;background:var(--bg);border-radius:6px;font-style:italic">${esc(h.note)}</div>` : ''}
        </div>`;
    });
    body += '</div>';
  }
  body += '<div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Close</button></div>';
  $('#modal-body').innerHTML = body;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
}

// ── Calendar View ───────────────────────────────────────────────────
let calendarDate = new Date();
let calendarEvents = [];

async function loadCalendar() {
  const year = calendarDate.getFullYear();
  const month = String(calendarDate.getMonth() + 1).padStart(2, '0');
  const monthKey = `${year}-${month}`;
  calendarEvents = await api(`/events?month=${monthKey}`);

  // Also load projects for the event form
  const projects = await api('/projects');

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const daysInMonth = new Date(year, calendarDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(year, calendarDate.getMonth(), 1).getDay();

  let html = `
    <div class="calendar-header">
      <button class="btn btn-ghost btn-sm" id="cal-prev"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4l-6 6 6 6"/></svg></button>
      <h2 class="calendar-month">${monthNames[calendarDate.getMonth()]} ${year}</h2>
      <button class="btn btn-ghost btn-sm" id="cal-next"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l6 6-6 6"/></svg></button>
    </div>
    <div class="calendar-grid">
      <div class="cal-day-label">Sun</div><div class="cal-day-label">Mon</div><div class="cal-day-label">Tue</div>
      <div class="cal-day-label">Wed</div><div class="cal-day-label">Thu</div><div class="cal-day-label">Fri</div><div class="cal-day-label">Sat</div>`;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === calendarDate.getMonth();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month}-${String(d).padStart(2, '0')}`;
    const dayEvents = calendarEvents.filter(e => e.event_date === dateStr);
    const isToday = isCurrentMonth && today.getDate() === d;
    html += `<div class="cal-cell ${isToday ? 'today' : ''} ${dayEvents.length ? 'has-events' : ''}" data-date="${dateStr}">
      <span class="cal-date">${d}</span>
      ${dayEvents.length ? `<span class="cal-dot-count">${dayEvents.length}</span>` : ''}
    </div>`;
  }

  html += '</div>';

  // Events list for the month
  html += '<div class="calendar-events-section">';
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px"><div class="section-title" style="padding:0;margin:0">Events</div><button class="btn btn-primary btn-sm" id="cal-add-event">+ Add Event</button></div>`;

  if (!calendarEvents.length) {
    html += '<p style="font-size:.85rem;color:var(--text-muted);padding:8px 0">No events this month.</p>';
  } else {
    calendarEvents.forEach(ev => {
      const time = ev.event_time || '';
      html += `<div class="cal-event-card" data-event-id="${ev.id}">
        <div class="cal-event-date">${ev.event_date.slice(8)}${time ? ' at ' + time : ''}</div>
        <div class="cal-event-title">${esc(ev.title)}</div>
        ${ev.note ? `<div class="cal-event-note">${esc(ev.note)}</div>` : ''}
        ${ev.notify ? '<span class="cal-notify-badge">Notify</span>' : ''}
      </div>`;
    });
  }
  html += '</div>';

  $content.innerHTML = html;

  // Bind navigation
  $('#cal-prev').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() - 1); loadCalendar(); };
  $('#cal-next').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() + 1); loadCalendar(); };

  // Bind day cells
  $content.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.onclick = () => openAddEventModal(cell.dataset.date, projects);
  });

  // Add event button
  const addBtn = $('#cal-add-event');
  if (addBtn) addBtn.onclick = () => openAddEventModal('', projects);

  // Click event cards to edit
  $content.querySelectorAll('.cal-event-card').forEach(card => {
    card.onclick = () => openEditEventModal(parseInt(card.dataset.eventId), projects);
  });

  // Request notification permission if any event has notify
  if (calendarEvents.some(e => e.notify) && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function openAddEventModal(prefillDate, projects) {
  const projectOptions = projects.filter(p => !p.is_template && !p.is_archived).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#modal-body').innerHTML = `
    <h2>New Event</h2>
    <div class="form-group"><label class="form-label">Project</label><select class="form-select" id="m-proj">${projectOptions}</select></div>
    <div class="form-group"><label class="form-label">Title *</label><input class="form-input" id="m-title" placeholder="e.g. Foundation inspection"></div>
    <div class="form-group"><label class="form-label">Date *</label><input class="form-input" id="m-date" type="date" value="${prefillDate}"></div>
    <div class="form-group"><label class="form-label">Time</label><input class="form-input" id="m-time" type="time"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" id="m-note" rows="2" placeholder="Optional notes..."></textarea></div>
    <div class="form-group" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-notify"><label for="m-notify" style="font-size:.85rem">Send notification reminder</label></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-submit">Create</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => {
    const title = $('#m-title').value.trim();
    const date = $('#m-date').value;
    if (!title || !date) { $('#m-title').focus(); return; }
    await api('/events', { method: 'POST', body: {
      project_id: parseInt($('#m-proj').value),
      title, event_date: date, event_time: $('#m-time').value || null,
      note: $('#m-note').value.trim(), notify: $('#m-notify').checked,
    }});
    closeModal();
    if (currentTab === 'home') loadDashboard(); else loadCalendar(); refreshNotifications();
  };
  setTimeout(() => $('#m-title').focus(), 200);
  bindModalEnter();
}

async function openEditEventModal(eventId, projects) {
  const ev = await api(`/events/${eventId}`);
  const projectOptions = projects.filter(p => !p.is_template && !p.is_archived).map(p => `<option value="${p.id}" ${p.id === ev.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#modal-body').innerHTML = `
    <h2>Edit Event</h2>
    <div class="form-group"><label class="form-label">Project</label><select class="form-select" id="m-proj" disabled>${projectOptions}</select></div>
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="m-title" value="${esc(ev.title)}"></div>
    <div class="form-group"><label class="form-label">Date</label><input class="form-input" id="m-date" type="date" value="${ev.event_date}"></div>
    <div class="form-group"><label class="form-label">Time</label><input class="form-input" id="m-time" type="time" value="${ev.event_time || ''}"></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" id="m-note" rows="2">${esc(ev.note || '')}</textarea></div>
    <div class="form-group" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-notify" ${ev.notify ? 'checked' : ''}><label for="m-notify" style="font-size:.85rem">Send notification reminder</label></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="m-cancel">Cancel</button><button class="btn btn-ghost danger" id="m-delete">Delete</button><button class="btn btn-primary" id="m-submit">Save</button></div>`;
  $modalOverlay.classList.add('open');
  $('#m-cancel').onclick = closeModal;
  $('#m-delete').onclick = async () => { if (confirm('Delete this event?')) { await api(`/events/${eventId}`, { method: 'DELETE' }); closeModal(); refreshNotifications(); if (currentTab === 'home') loadDashboard(); else loadCalendar(); } };
  $('#m-submit').onclick = async () => {
    await api(`/events/${eventId}`, { method: 'PATCH', body: {
      title: $('#m-title').value.trim(), event_date: $('#m-date').value,
      event_time: $('#m-time').value || null, note: $('#m-note').value.trim(),
      notify: $('#m-notify').checked,
    }});
    closeModal();
    if (currentTab === 'home') loadDashboard(); else loadCalendar(); refreshNotifications();
  };
  bindModalEnter();
}

// ── Notification Bell System ─────────────────────────────────────────
let notifEvents = [];
let notifDropdownOpen = false;
let notifiedEventIds = new Set(); // track which events already played sound

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Soft chime: two gentle tones
    [440, 554].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.6);
    });
  } catch {}
}

async function refreshNotifications() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const allEvents = await api(`/events?month=${monthKey}`);

    // Today's events with notify=true, plus upcoming 3 days
    const threeDaysLater = new Date(now); threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const futureStr = threeDaysLater.toISOString().slice(0, 10);

    notifEvents = allEvents.filter(e => e.notify && e.event_date >= todayStr && e.event_date <= futureStr)
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || '').localeCompare(b.event_time || ''));

    // Update badge
    if (notifEvents.length > 0) {
      $notifBadge.textContent = notifEvents.length;
      $notifBadge.style.display = '';
      $notifBell.classList.add('has-notifs');
    } else {
      $notifBadge.style.display = 'none';
      $notifBell.classList.remove('has-notifs');
    }

    // Check if any event is happening RIGHT NOW (match hour:minute) — play sound
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    notifEvents.forEach(ev => {
      if (ev.event_date === todayStr && ev.event_time === currentTime && !notifiedEventIds.has(ev.id)) {
        notifiedEventIds.add(ev.id);
        playNotifSound();
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('SiteCheck Reminder', { body: ev.title + (ev.note ? '\n' + ev.note : '') });
        }
      }
    });
  } catch {}
}

function renderNotifDropdown() {
  // Remove existing
  document.querySelectorAll('.notif-dropdown').forEach(d => d.remove());

  const dropdown = document.createElement('div');
  dropdown.className = 'notif-dropdown open';

  const todayStr = new Date().toISOString().slice(0, 10);

  let inner = `<div class="notif-dropdown-header"><span>Notifications</span><span style="font-size:.7rem;color:var(--text-muted)">${notifEvents.length} upcoming</span></div>`;

  if (!notifEvents.length) {
    inner += '<div class="notif-empty">No upcoming reminders</div>';
  } else {
    notifEvents.forEach(ev => {
      const isToday = ev.event_date === todayStr;
      const dayLabel = isToday ? 'Today' : ev.event_date.slice(5);
      inner += `
        <div class="notif-item" data-event-id="${ev.id}">
          <div class="notif-icon-wrap ${isToday ? 'today' : 'upcoming'}">&#128276;</div>
          <div class="notif-body">
            <div class="notif-title">${esc(ev.title)}</div>
            <div class="notif-meta">${dayLabel}${ev.event_time ? ' at ' + ev.event_time : ''}${ev.note ? ' &mdash; ' + esc(ev.note) : ''}</div>
          </div>
        </div>`;
    });
  }

  dropdown.innerHTML = inner;
  $notifBell.parentElement.style.position = 'relative';
  $notifBell.parentElement.appendChild(dropdown);

  // Click event items to navigate
  dropdown.querySelectorAll('.notif-item').forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      dropdown.remove();
      notifDropdownOpen = false;
      switchTab('reports'); // go to calendar
    };
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!dropdown.contains(e.target) && e.target !== $notifBell) {
        dropdown.remove();
        notifDropdownOpen = false;
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

$notifBell.onclick = (e) => {
  e.stopPropagation();
  if (notifDropdownOpen) {
    document.querySelectorAll('.notif-dropdown').forEach(d => d.remove());
    notifDropdownOpen = false;
  } else {
    renderNotifDropdown();
    notifDropdownOpen = true;
  }
};

// Poll for notifications every 30 seconds
setInterval(refreshNotifications, 30000);

// ── Auth UI ─────────────────────────────────────────────────────────
function showAuthScreen() {
  document.querySelector('.sidebar')?.classList.add('auth-hidden');
  document.querySelector('.bottom-nav')?.classList.add('auth-hidden');
  document.querySelector('.top-header')?.classList.add('auth-hidden');
  $content.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">Site<em>Check</em></div>
        <p class="auth-subtitle">Construction Quality Control</p>
        <div id="auth-form">
          <div class="auth-tabs">
            <button class="auth-tab active" id="tab-login">Login</button>
            <button class="auth-tab" id="tab-register">Register</button>
          </div>
          <div id="auth-login-form">
            <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="a-email" type="email" placeholder="you@example.com"></div>
            <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="a-password" type="password" placeholder="Enter password"></div>
            <div id="auth-error" style="color:var(--flagged);font-size:.8rem;margin-bottom:8px;display:none"></div>
            <button class="btn btn-primary" style="width:100%" id="a-login-btn">Log In</button>
          </div>
          <div id="auth-register-form" style="display:none">
            <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="a-name" placeholder="John Smith"></div>
            <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="a-reg-email" type="email" placeholder="you@example.com"></div>
            <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="a-reg-password" type="password" placeholder="Min 4 characters"></div>
            <div id="reg-error" style="color:var(--flagged);font-size:.8rem;margin-bottom:8px;display:none"></div>
            <button class="btn btn-primary" style="width:100%" id="a-register-btn">Create Account</button>
          </div>
        </div>
      </div>
    </div>`;

  $('#tab-login').onclick = () => {
    $('#tab-login').classList.add('active'); $('#tab-register').classList.remove('active');
    $('#auth-login-form').style.display = ''; $('#auth-register-form').style.display = 'none';
  };
  $('#tab-register').onclick = () => {
    $('#tab-register').classList.add('active'); $('#tab-login').classList.remove('active');
    $('#auth-register-form').style.display = ''; $('#auth-login-form').style.display = 'none';
  };

  $('#a-login-btn').onclick = async () => {
    const errEl = $('#auth-error');
    errEl.style.display = 'none';
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('#a-email').value.trim(), password: $('#a-password').value }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Login failed'); }
      currentUser = await res.json();
      startApp();
    } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  };

  $('#a-register-btn').onclick = async () => {
    const errEl = $('#reg-error');
    errEl.style.display = 'none';
    const pw = $('#a-reg-password').value;
    if (pw.length < 4) { errEl.textContent = 'Password must be at least 4 characters'; errEl.style.display = 'block'; return; }
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('#a-name').value.trim(), email: $('#a-reg-email').value.trim(), password: pw }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Registration failed'); }
      currentUser = await res.json();
      startApp();
    } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  };

  // Enter key support
  document.querySelectorAll('#auth-login-form input').forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') $('#a-login-btn').click(); }));
  document.querySelectorAll('#auth-register-form input').forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') $('#a-register-btn').click(); }));
}

function updateUserUI() {
  const userSlot = document.getElementById('sidebar-user');
  if (userSlot && currentUser) {
    userSlot.innerHTML = `
      <div class="sidebar-user-info">
        <div class="sidebar-user-avatar">${initials(currentUser.name)}</div>
        <div class="sidebar-user-details">
          <div class="sidebar-user-name">${esc(currentUser.name)}</div>
          <div class="sidebar-user-role">${esc(currentUser.role)}</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="logout-btn" style="color:rgba(255,255,255,.6);font-size:.72rem;margin-top:8px;width:100%">Log Out</button>`;
    document.getElementById('logout-btn').onclick = async () => {
      await api('/auth/logout', { method: 'POST' });
      currentUser = null;
      showAuthScreen();
    };
  }
}

function startApp() {
  document.querySelector('.sidebar')?.classList.remove('auth-hidden');
  document.querySelector('.bottom-nav')?.classList.remove('auth-hidden');
  document.querySelector('.top-header')?.classList.remove('auth-hidden');
  updateUserUI();
  refreshNotifications();
  // Request notification permission early
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  switchTab('home');
}

// ── Init ─────────────────────────────────────────────────────────────
(async () => {
  try { await api('/template'); } catch { await api('/template/seed', { method: 'POST' }); }
  // Check if already logged in
  try {
    const me = await api('/auth/me');
    if (me && me.id) {
      currentUser = me;
      startApp();
      return;
    }
  } catch {}
  showAuthScreen();
})();
