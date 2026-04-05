/* ══════════════════════════════════════════════════════════════════════
   SiteCheck — Construction QC App
   ══════════════════════════════════════════════════════════════════════ */

const API = '/api';
const STATUS_CYCLE = ['unchecked', 'flagged', 'confirmed', 'na'];
const STATUS_LABELS = { unchecked: 'Unchecked', flagged: 'Flagged', confirmed: 'Confirmed', na: 'N/A' };
const STATUS_ICONS = { unchecked: '○', flagged: '⚑', confirmed: '✓', na: '—' };
const TAG_LABELS = ['VERIFY','ACTION','CLIENT','PRIOR TO ORDER','PRIOR TO POUR','INFORM CONTRACTOR','CUSTOM'];

// ── State ────────────────────────────────────────────────────────────
let currentTab = 'home';
let navStack = []; // [{view, data}]
let currentProject = null;
let currentPhase = null;
let activeFilter = 'all';
let bulkSelected = new Set();
let bulkMode = false;
let longPressTimer = null;
let commentItemId = null;

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

function tagClass(tag) {
  return tag.replace(/\s+/g, '_');
}

// ── Navigation ───────────────────────────────────────────────────────
function navigateTo(view, data, pushStack = true) {
  if (pushStack && navStack.length > 0) {
    // save current
  }
  exitBulkMode();
  activeFilter = 'all';
  $filterBar.style.display = 'none';

  $content.classList.remove('view-enter');
  void $content.offsetWidth;
  $content.classList.add('view-enter');

  if (view === 'dashboard') {
    navStack = [{ view: 'dashboard' }];
    setTopBar('SiteCheck', false, { search: false, filter: false, archive: true, newBtn: true });
    loadDashboard();
  } else if (view === 'projects') {
    navStack = [{ view: 'projects' }];
    setTopBar('Projects', false, { search: false, filter: false, archive: true, newBtn: true });
    loadProjects();
  } else if (view === 'project-detail') {
    if (pushStack) navStack.push({ view: 'project-detail', data });
    currentProject = data;
    setTopBar(data.name, true, { search: true, filter: false, archive: false, newBtn: false });
    loadProjectDetail(data.id);
  } else if (view === 'phase-detail') {
    if (pushStack) navStack.push({ view: 'phase-detail', data });
    currentPhase = data;
    setTopBar(data.name, true, { search: true, filter: true, archive: false, newBtn: false });
    loadPhaseDetail(data.id);
  } else if (view === 'template') {
    navStack = [{ view: 'template' }];
    setTopBar('Master Template', false, { search: false, filter: false, archive: false, newBtn: false });
    loadTemplate();
  } else if (view === 'reports') {
    navStack = [{ view: 'reports' }];
    setTopBar('Reports', false, { search: false, filter: false, archive: false, newBtn: false });
    showReports();
  } else if (view === 'more') {
    navStack = [{ view: 'more' }];
    setTopBar('More', false, { search: false, filter: false, archive: false, newBtn: false });
    showMore();
  } else if (view === 'archived') {
    if (pushStack) navStack.push({ view: 'archived' });
    setTopBar('Archived Projects', true, { search: false, filter: false, archive: false, newBtn: false });
    loadArchived();
  } else if (view === 'project-notes') {
    if (pushStack) navStack.push({ view: 'project-notes', data });
    setTopBar('Project Notes', true, { search: false, filter: false, archive: false, newBtn: false });
    loadProjectNotes(data.id);
  } else if (view === 'flagged') {
    if (pushStack) navStack.push({ view: 'flagged' });
    setTopBar('Flagged Items', true, { search: false, filter: false, archive: false, newBtn: false });
    loadFlaggedItems();
  }
}

function goBack() {
  navStack.pop();
  const prev = navStack[navStack.length - 1];
  if (prev) {
    navigateTo(prev.view, prev.data, false);
  } else {
    switchTab('home');
  }
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
  if (tab === 'home') navigateTo('dashboard');
  else if (tab === 'projects') navigateTo('projects');
  else if (tab === 'template') navigateTo('template');
  else if (tab === 'reports') navigateTo('reports');
  else if (tab === 'more') navigateTo('more');
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Top bar buttons ──────────────────────────────────────────────────
$newBtn.onclick = () => openNewProjectModal();
$archiveBtn.onclick = () => navigateTo('archived');
$searchBtn.onclick = () => openSearchSheet();
$filterBtn.onclick = () => {
  $filterBar.style.display = $filterBar.style.display === 'none' ? 'flex' : 'none';
};

// ── Filter bar ───────────────────────────────────────────────────────
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    applyFilter();
  });
});

function applyFilter() {
  document.querySelectorAll('.item-card').forEach(card => {
    if (activeFilter === 'all') {
      card.style.display = '';
    } else {
      card.style.display = card.dataset.status === activeFilter ? '' : 'none';
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════════════════════════════

// ── Dashboard ────────────────────────────────────────────────────────
async function loadDashboard() {
  const data = await api('/dashboard');

  let html = '';

  // Attention widget
  if (data.total_flagged > 0) {
    html += `
      <div class="attention-widget" id="attention-widget">
        <div class="attention-header">
          <div class="attention-icon">⚠</div>
          <div class="attention-title">Needs Attention</div>
        </div>
        <div class="attention-counts">
          <div class="attention-stat"><strong>${data.total_flagged}</strong> flagged items</div>
        </div>
      </div>`;
  }

  if (!data.active_projects.length) {
    html += `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="26" height="26" rx="4"/><path d="M16 10v12M10 16h12"/></svg>
        </div>
        <div class="empty-title">No active projects</div>
        <div class="empty-desc">Tap "+ New" to create your first project and start inspecting.</div>
      </div>`;
  } else {
    html += '<div class="section-title">Active Projects</div>';
    data.active_projects.forEach(p => {
      html += renderProjectCard(p);
    });
  }

  $content.innerHTML = html;

  // Event: attention widget
  const aw = $('#attention-widget');
  if (aw) aw.onclick = () => navigateTo('flagged');

  // Event: project cards
  bindProjectCards();
}

function renderProjectCard(p) {
  const dotClass = p.has_flags ? 'orange' : 'green';
  return `
    <div class="card project-card" data-id="${p.id}">
      <div class="project-card-header">
        <div class="project-avatar">${initials(p.name)}</div>
        <div class="project-info">
          <div class="project-name">${esc(p.name)}</div>
          <div class="project-client">${esc(p.client_name || 'No client')}</div>
          <div class="project-address">${esc(p.site_address || 'No address')}</div>
          ${p.current_phase ? `<div class="project-phase-tag">${esc(p.current_phase)}</div>` : ''}
        </div>
        <div class="project-status-dot ${dotClass}"></div>
      </div>
      <div class="project-progress-row">
        <div class="project-progress-bar"><div class="project-progress-fill" style="width:${p.progress_pct}%"></div></div>
        <span class="project-pct">${p.progress_pct}%</span>
      </div>
    </div>`;
}

function bindProjectCards() {
  $content.querySelectorAll('.project-card').forEach(el => {
    el.addEventListener('click', () => {
      navigateTo('project-detail', { id: parseInt(el.dataset.id), name: el.querySelector('.project-name').textContent });
    });
  });
}

// ── Projects list ────────────────────────────────────────────────────
async function loadProjects() {
  const projects = await api('/projects');
  if (!projects.length) {
    $content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="26" height="26" rx="4"/><path d="M16 10v12M10 16h12"/></svg>
        </div>
        <div class="empty-title">No projects yet</div>
        <div class="empty-desc">Create your first project to start quality checks.</div>
      </div>`;
    return;
  }
  $content.innerHTML = projects.map(p => renderProjectCard(p)).join('');
  bindProjectCards();
}

// ── Project Detail ───────────────────────────────────────────────────
async function loadProjectDetail(projectId) {
  const project = await api(`/projects/${projectId}`);
  currentProject = project;

  let html = `
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-ghost" id="proj-notes-btn" style="font-size:.8rem">📝 Notes</button>
      <button class="btn btn-ghost" id="proj-archive-btn" style="font-size:.8rem">📦 Archive</button>
      <button class="btn btn-ghost" id="proj-delete-btn" style="font-size:.8rem;color:var(--flagged)">🗑 Delete</button>
    </div>`;

  if (project.client_name || project.site_address || project.supervisor) {
    html += `<div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:12px">`;
    if (project.client_name) html += `Client: <strong>${esc(project.client_name)}</strong> &nbsp;`;
    if (project.site_address) html += `<br>Address: ${esc(project.site_address)} &nbsp;`;
    if (project.supervisor) html += `<br>Supervisor: ${esc(project.supervisor)}`;
    html += `</div>`;
  }

  html += '<div class="section-title">Phases</div>';

  project.phases.forEach((ph, i) => {
    const isComplete = ph.is_complete;
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
        ${isComplete ? `<div class="phase-complete-badge">★</div>` : ''}
        <span class="phase-chevron"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4l6 6-6 6"/></svg></span>
      </div>`;
  });

  $content.innerHTML = html;

  // Events
  $('#proj-notes-btn').onclick = () => navigateTo('project-notes', project);
  $('#proj-archive-btn').onclick = async () => {
    if (confirm('Archive this project?')) {
      await api(`/projects/${projectId}/archive`, { method: 'PATCH' });
      goBack();
    }
  };
  $('#proj-delete-btn').onclick = async () => {
    if (confirm('Permanently delete this project and all its data? This cannot be undone.')) {
      await api(`/projects/${projectId}`, { method: 'DELETE' });
      goBack();
    }
  };

  $content.querySelectorAll('.phase-card').forEach(el => {
    el.addEventListener('click', () => {
      navigateTo('phase-detail', { id: parseInt(el.dataset.id), name: el.dataset.name });
    });
  });
}

// ── Phase Detail (checklist) ─────────────────────────────────────────
async function loadPhaseDetail(phaseId) {
  const phase = await api(`/phases/${phaseId}`);
  currentPhase = phase;
  const categories = phase.categories || [];

  if (!categories.length) {
    $content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="26" height="26" rx="4"/></svg></div>
        <div class="empty-title">No items yet</div>
        <div class="empty-desc">Add categories and checklist items.</div>
      </div>`;
    return;
  }

  // Stats
  let total = 0, counts = { unchecked: 0, flagged: 0, confirmed: 0, na: 0 };
  categories.forEach(c => c.items.forEach(i => { total++; counts[i.status]++; }));
  const active = total - counts.na;
  const pct = active > 0 ? Math.round((counts.confirmed / active) * 100) : (total > 0 ? 100 : 0);

  let html = `
    <div class="progress-section">
      <div class="progress-header">
        <span class="progress-label">Phase Progress</span>
        <span class="progress-value">${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="status-grid">
        <div class="status-grid-item unchecked"><div class="status-grid-count">${counts.unchecked}</div><div class="status-grid-label">Unchecked</div></div>
        <div class="status-grid-item flagged"><div class="status-grid-count">${counts.flagged}</div><div class="status-grid-label">Flagged</div></div>
        <div class="status-grid-item confirmed"><div class="status-grid-count">${counts.confirmed}</div><div class="status-grid-label">Confirmed</div></div>
        <div class="status-grid-item na"><div class="status-grid-count">${counts.na}</div><div class="status-grid-label">N/A</div></div>
      </div>
    </div>`;

  // Filter bar placeholder (positioned in main content flow)
  html += `<div id="filter-bar-slot"></div>`;

  categories.forEach(cat => {
    html += `<div class="section-title">${esc(cat.name)}</div>`;
    cat.items.forEach(item => {
      html += renderItemCard(item);
    });
    html += `<button class="add-item-btn" data-cat-id="${cat.id}" data-cat-name="${esc(cat.name)}">+ Add Item</button>`;
  });

  $content.innerHTML = html;

  // Move filter bar into slot
  const slot = document.getElementById('filter-bar-slot');
  if (slot) slot.appendChild($filterBar);

  bindItemCards(phaseId);

  // Add item buttons
  $content.querySelectorAll('.add-item-btn').forEach(btn => {
    btn.addEventListener('click', () => openAddItemModal(parseInt(btn.dataset.catId), btn.dataset.catName, phaseId));
  });

  // Check if phase is newly complete
  if (pct === 100 && active > 0) {
    triggerConfetti();
  }
}

function renderItemCard(item) {
  const hasComment = item.comment && item.comment.trim();
  return `
    <div class="card item-card" data-status="${item.status}" data-id="${item.id}">
      <div class="item-content">
        <div class="item-desc">${esc(item.description)}</div>
        <div class="item-meta">
          <span class="tag-badge ${tagClass(item.tag)}" data-tag="${item.tag}">${esc(item.tag)}</span>
          ${item.is_custom ? '<span class="tag-badge CUSTOM">CUSTOM</span>' : ''}
        </div>
        ${hasComment ? `<div style="font-size:.75rem;color:var(--text-secondary);margin-top:4px;font-style:italic;padding-left:8px;border-left:2px solid var(--border)">💬 ${esc(item.comment)}</div>` : ''}
      </div>
      <div class="comment-icon ${hasComment ? 'has-comment' : ''}" data-id="${item.id}" title="Comment">
        <svg width="20" height="20" fill="${hasComment ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </div>
      <button class="status-indicator" data-status="${item.status}" data-id="${item.id}">
        ${STATUS_ICONS[item.status]}
      </button>
    </div>`;
}

function bindItemCards(phaseId) {
  let lastTap = 0;
  let lastTapId = null;

  $content.querySelectorAll('.item-card').forEach(card => {
    const itemId = card.dataset.id;

    // Comment icon
    card.querySelector('.comment-icon').addEventListener('click', (e) => {
      e.stopPropagation();
      if (bulkMode) return;
      openCommentSheet(parseInt(itemId), phaseId);
    });

    // Status button — single tap: unchecked→flagged, double tap: →confirmed
    const statusBtn = card.querySelector('.status-indicator');
    statusBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (bulkMode) {
        toggleBulkSelect(card);
        return;
      }

      const now = Date.now();
      const isDoubleTap = (now - lastTap < 350) && (lastTapId === itemId);
      lastTap = now;
      lastTapId = itemId;

      const currentStatus = card.dataset.status;

      if (isDoubleTap) {
        // Double tap → confirmed
        await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: 'confirmed' } });
        loadPhaseDetail(phaseId);
        return;
      }

      // Wait a bit to see if double tap comes
      setTimeout(async () => {
        if (Date.now() - lastTap >= 300 || lastTapId !== itemId) {
          // Single tap
          if (currentStatus === 'unchecked') {
            await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: 'flagged' } });
            loadPhaseDetail(phaseId);
          } else if (currentStatus === 'confirmed' || currentStatus === 'na') {
            showActionMenu(parseInt(itemId), card, phaseId);
          } else if (currentStatus === 'flagged') {
            showActionMenu(parseInt(itemId), card, phaseId);
          }
        }
      }, 350);
    });

    // Long press — action menu or bulk mode
    let pressTimer;
    card.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        if (!bulkMode) {
          enterBulkMode();
          toggleBulkSelect(card);
        }
      }, 600);
    }, { passive: true });
    card.addEventListener('touchend', () => clearTimeout(pressTimer));
    card.addEventListener('touchmove', () => clearTimeout(pressTimer));

    // Desktop: contextmenu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!bulkMode) {
        showActionMenu(parseInt(itemId), card, phaseId);
      }
    });

    // In bulk mode, tap card to select
    card.addEventListener('click', () => {
      if (bulkMode) {
        toggleBulkSelect(card);
      }
    });
  });
}

// ── Action Menu ──────────────────────────────────────────────────────
function showActionMenu(itemId, anchorEl, phaseId) {
  // Remove existing
  document.querySelectorAll('.action-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'action-menu open';
  menu.innerHTML = `
    <button class="action-menu-item" data-action="na"><div class="dot" style="background:var(--na)"></div>Mark as N/A</button>
    <button class="action-menu-item" data-action="confirmed"><div class="dot" style="background:var(--confirmed)"></div>Mark Confirmed</button>
    <button class="action-menu-item" data-action="flagged"><div class="dot" style="background:var(--flagged)"></div>Mark Flagged</button>
    <button class="action-menu-item" data-action="unchecked"><div class="dot" style="background:var(--unchecked)"></div>Reset to Unchecked</button>
    <button class="action-menu-item" data-action="comment">💬 Add / Edit Comment</button>
  `;

  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 250) + 'px';
  menu.style.right = '16px';
  document.body.appendChild(menu);

  menu.querySelectorAll('.action-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      if (action === 'comment') {
        openCommentSheet(itemId, phaseId);
      } else {
        await api(`/items/${itemId}/status`, { method: 'PATCH', body: { status: action } });
        loadPhaseDetail(phaseId);
      }
      menu.remove();
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

// ── Bulk Mode ────────────────────────────────────────────────────────
function enterBulkMode() {
  bulkMode = true;
  bulkSelected.clear();
  $bulkBar.classList.add('active');
  updateBulkCount();
}

function exitBulkMode() {
  bulkMode = false;
  bulkSelected.clear();
  $bulkBar.classList.remove('active');
  document.querySelectorAll('.item-card.selected').forEach(c => c.classList.remove('selected'));
}

function toggleBulkSelect(card) {
  const id = card.dataset.id;
  if (bulkSelected.has(id)) {
    bulkSelected.delete(id);
    card.classList.remove('selected');
  } else {
    bulkSelected.add(id);
    card.classList.add('selected');
  }
  updateBulkCount();
  if (bulkSelected.size === 0) exitBulkMode();
}

function updateBulkCount() {
  $('#bulk-count').textContent = `${bulkSelected.size} selected`;
}

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
  commentItemId = itemId;
  // Find current comment
  const card = document.querySelector(`.item-card[data-id="${itemId}"]`);
  const existing = card ? (card.querySelector('[style*="font-style"]')?.textContent?.replace('💬 ', '') || '') : '';
  $('#comment-input').value = existing;
  $sheetOverlay.classList.add('open');
  $commentSheet.classList.add('open');
  setTimeout(() => $('#comment-input').focus(), 300);

  $('#comment-save').onclick = async () => {
    const comment = $('#comment-input').value.trim();
    await api(`/items/${itemId}/comment`, { method: 'PATCH', body: { comment } });
    closeSheet();
    if (phaseId) loadPhaseDetail(phaseId);
  };
  $('#comment-cancel').onclick = closeSheet;
}

// ── Search Sheet ─────────────────────────────────────────────────────
function openSearchSheet() {
  $sheetOverlay.classList.add('open');
  $searchSheet.classList.add('open');
  $('#search-input').value = '';
  $('#search-results').innerHTML = '';
  setTimeout(() => $('#search-input').focus(), 300);

  let debounce;
  $('#search-input').oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = $('#search-input').value.trim();
      if (!q || !currentProject) { $('#search-results').innerHTML = ''; return; }
      const results = await api(`/projects/${currentProject.id}/search?q=${encodeURIComponent(q)}`);
      if (!results.length) {
        $('#search-results').innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center;font-size:.85rem">No results</div>';
        return;
      }
      $('#search-results').innerHTML = results.map(r => `
        <div class="search-result-item" data-phase-id="${r.phase_id}" data-phase-name="${esc(r.phase_name)}">
          <div class="search-result-desc" style="border-left:3px solid var(--${r.status});padding-left:8px">${esc(r.description)}</div>
          <div class="search-result-path">${esc(r.phase_name)} → ${esc(r.category_name)}</div>
        </div>
      `).join('');
      document.querySelectorAll('.search-result-item').forEach(el => {
        el.onclick = () => {
          closeSheet();
          navigateTo('phase-detail', { id: parseInt(el.dataset.phaseId), name: el.dataset.phaseName });
        };
      });
    }, 250);
  };

  $('#search-close').onclick = closeSheet;
}

function closeSheet() {
  $sheetOverlay.classList.remove('open');
  $commentSheet.classList.remove('open');
  $searchSheet.classList.remove('open');
}
$sheetOverlay.onclick = closeSheet;

// ── Template view ────────────────────────────────────────────────────
async function loadTemplate() {
  let template;
  try {
    template = await api('/template');
  } catch {
    $content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg></div>
        <div class="empty-title">No template found</div>
        <div class="empty-desc">Initialize the master checklist template.</div>
        <button class="btn btn-outline" id="seed-template-btn">Seed Master Template</button>
      </div>`;
    $('#seed-template-btn').onclick = async () => {
      await api('/template/seed', { method: 'POST' });
      loadTemplate();
    };
    return;
  }

  if (!template.phases || !template.phases.length) {
    $content.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Template is empty</div>
        <button class="btn btn-outline" id="seed-template-btn">Seed Master Template</button>
      </div>`;
    $('#seed-template-btn').onclick = async () => {
      await api('/template/seed', { method: 'POST' });
      loadTemplate();
    };
    return;
  }

  let html = `<div style="font-size:.82rem;color:var(--text-secondary);margin-bottom:12px">This is the master checklist. New projects clone from this template.</div>`;

  template.phases.forEach(phase => {
    html += `<div class="section-title">${esc(phase.name)}</div>`;
    phase.categories.forEach(cat => {
      html += `<div style="font-size:.78rem;font-weight:600;color:var(--navy);padding:8px 0 4px">${esc(cat.name)} (${cat.items.length})</div>`;
      cat.items.forEach(item => {
        html += `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light)">
            <span class="tag-badge ${tagClass(item.tag)}" data-tag="${item.tag}" style="font-size:.55rem">${esc(item.tag)}</span>
            <span style="font-size:.82rem;flex:1">${esc(item.description)}</span>
          </div>`;
      });
    });
  });

  $content.innerHTML = html;
}

// ── Archived ─────────────────────────────────────────────────────────
async function loadArchived() {
  const projects = await api('/projects?archived=true');
  if (!projects.length) {
    $content.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">No archived projects</div>
        <div class="empty-desc">Archived projects will appear here.</div>
      </div>`;
    return;
  }
  let html = '';
  projects.forEach(p => {
    html += `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-weight:600;font-size:.92rem">${esc(p.name)}</div>
          <div style="font-size:.78rem;color:var(--text-muted)">${esc(p.client_name)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost" style="font-size:.78rem;padding:6px 12px" data-restore="${p.id}">Restore</button>
          <button class="btn btn-ghost" style="font-size:.78rem;padding:6px 12px;color:var(--flagged)" data-del="${p.id}">Delete</button>
        </div>
      </div>`;
  });
  $content.innerHTML = html;

  $content.querySelectorAll('[data-restore]').forEach(btn => {
    btn.onclick = async () => {
      await api(`/projects/${btn.dataset.restore}/restore`, { method: 'PATCH' });
      loadArchived();
    };
  });
  $content.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Permanently delete?')) {
        await api(`/projects/${btn.dataset.del}`, { method: 'DELETE' });
        loadArchived();
      }
    };
  });
}

// ── Flagged Items ────────────────────────────────────────────────────
async function loadFlaggedItems() {
  const items = await api('/flagged');
  if (!items.length) {
    $content.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">No flagged items</div>
        <div class="empty-desc">All clear! No items need attention.</div>
      </div>`;
    return;
  }
  $content.innerHTML = items.map(r => `
    <div class="card" style="border-left:4px solid var(--flagged);cursor:pointer" data-phase-id="${r.phase_id}" data-phase-name="${esc(r.phase_name.split(' → ').pop())}">
      <div style="font-size:.85rem;font-weight:600">${esc(r.description)}</div>
      <div style="font-size:.72rem;color:var(--text-muted);margin-top:2px">${esc(r.phase_name)} → ${esc(r.category_name)}</div>
    </div>
  `).join('');

  $content.querySelectorAll('.card').forEach(el => {
    el.onclick = () => navigateTo('phase-detail', { id: parseInt(el.dataset.phaseId), name: el.dataset.phaseName });
  });
}

// ── Project Notes ────────────────────────────────────────────────────
async function loadProjectNotes(projectId) {
  const project = await api(`/projects/${projectId}`);
  const notes = project.notes || [];

  let html = `
    <div style="margin-bottom:16px">
      <textarea class="sheet-textarea" id="new-note-input" placeholder="Add a note..." rows="3"></textarea>
      <button class="btn btn-primary" id="save-note-btn" style="margin-top:8px;font-size:.82rem">Save Note</button>
    </div>`;

  if (!notes.length) {
    html += '<div style="text-align:center;color:var(--text-muted);padding:24px;font-size:.88rem">No notes yet.</div>';
  } else {
    notes.forEach(n => {
      const date = new Date(n.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += `
        <div class="note-entry">
          <div class="note-date">${date}</div>
          <div class="note-text">${esc(n.content)}</div>
        </div>`;
    });
  }

  $content.innerHTML = html;

  $('#save-note-btn').onclick = async () => {
    const content = $('#new-note-input').value.trim();
    if (!content) return;
    await api(`/projects/${projectId}/notes`, { method: 'POST', body: { content } });
    loadProjectNotes(projectId);
  };
}

// ── Reports (placeholder) ────────────────────────────────────────────
function showReports() {
  $content.innerHTML = `
    <div class="coming-soon">
      <h2>Reports</h2>
      <p style="font-size:.9rem;margin-top:8px">PDF and Excel export coming soon.</p>
      <div style="margin-top:24px;font-size:3rem">📊</div>
    </div>`;
}

// ── More ─────────────────────────────────────────────────────────────
function showMore() {
  $content.innerHTML = `
    <div class="settings-section">
      <div class="settings-item" id="more-archive">
        <div class="settings-icon" style="background:var(--na-bg);color:var(--na)">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="4" rx="1"/><path d="M3 7v7a2 2 0 002 2h10a2 2 0 002-2V7M8 11h4"/></svg>
        </div>
        Archived Projects
      </div>
      <div class="settings-item" id="more-team">
        <div class="settings-icon" style="background:#EDE7F6;color:#7E57C2">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        </div>
        Team / Users
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-item" id="more-seed">
        <div class="settings-icon" style="background:#E3F2FD;color:#42A5F5">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        </div>
        Re-seed Master Template
      </div>
      <div class="settings-item">
        <div class="settings-icon" style="background:#FFF3E0;color:#FF9800">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </div>
        Settings
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-item">
        <div class="settings-icon" style="background:#E8F5E9;color:var(--confirmed)">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </div>
        About SiteCheck
      </div>
    </div>
    <div style="text-align:center;padding:20px;font-size:.75rem;color:var(--text-muted)">SiteCheck v1.0 — Built for Canadian residential construction</div>
  `;

  $('#more-archive').onclick = () => navigateTo('archived');
  $('#more-team').onclick = () => {
    $content.innerHTML = '<div class="coming-soon"><h2>Team Management</h2><p style="font-size:.9rem;margin-top:8px">Role-based access coming soon.</p></div>';
  };
  $('#more-seed').onclick = async () => {
    if (confirm('Re-seed the master template? This will replace the current template.')) {
      await api('/template/seed', { method: 'POST' });
      alert('Master template has been re-seeded.');
    }
  };
}

// ── Modals ───────────────────────────────────────────────────────────
function openNewProjectModal() {
  $('#modal-body').innerHTML = `
    <h2>New Project</h2>
    <div class="form-group">
      <label class="form-label">Project Name *</label>
      <input class="form-input" id="m-name" placeholder="e.g. Riverside Residence" required>
    </div>
    <div class="form-group">
      <label class="form-label">Client Name *</label>
      <input class="form-input" id="m-client" placeholder="e.g. John & Jane Smith">
    </div>
    <div class="form-group">
      <label class="form-label">Site Address *</label>
      <input class="form-input" id="m-address" placeholder="e.g. 123 Maple St, Toronto, ON">
    </div>
    <div class="form-group">
      <label class="form-label">Project Start Date</label>
      <input class="form-input" id="m-date" type="date">
    </div>
    <div class="form-group">
      <label class="form-label">Site Supervisor</label>
      <input class="form-input" id="m-supervisor" placeholder="e.g. Mike Johnson">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-submit">Create Project</button>
    </div>`;
  $modalOverlay.classList.add('open');

  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => {
    const name = $('#m-name').value.trim();
    const client = $('#m-client').value.trim();
    const address = $('#m-address').value.trim();
    if (!name) { $('#m-name').focus(); return; }
    $('#m-submit').textContent = 'Creating...';
    $('#m-submit').disabled = true;
    await api('/projects', {
      method: 'POST',
      body: {
        name,
        client_name: client,
        site_address: address,
        start_date: $('#m-date').value || null,
        supervisor: $('#m-supervisor').value.trim(),
      }
    });
    closeModal();
    // Navigate to the new project or refresh
    if (currentTab === 'home') loadDashboard();
    else if (currentTab === 'projects') loadProjects();
  };

  setTimeout(() => $('#m-name').focus(), 200);
  bindModalEnter();
}

function openAddItemModal(categoryId, categoryName, phaseId) {
  $('#modal-body').innerHTML = `
    <h2>Add Item to ${esc(categoryName)}</h2>
    <div class="form-group">
      <label class="form-label">Item Description</label>
      <input class="form-input" id="m-desc" placeholder="e.g. Rebar spacing verified" required>
    </div>
    <div class="form-group">
      <label class="form-label">Tag</label>
      <select class="form-select" id="m-tag">
        ${TAG_LABELS.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-submit">Add Item</button>
    </div>`;
  $modalOverlay.classList.add('open');

  $('#m-cancel').onclick = closeModal;
  $('#m-submit').onclick = async () => {
    const desc = $('#m-desc').value.trim();
    if (!desc) { $('#m-desc').focus(); return; }
    const tag = $('#m-tag').value;
    await api(`/categories/${categoryId}/items`, { method: 'POST', body: { description: desc, tag } });
    closeModal();
    loadPhaseDetail(phaseId);
  };

  setTimeout(() => $('#m-desc').focus(), 200);
  bindModalEnter();
}

function closeModal() {
  $modalOverlay.classList.remove('open');
}
$modalOverlay.onclick = (e) => { if (e.target === $modalOverlay) closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSheet(); } });

function bindModalEnter() {
  $modalOverlay.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#m-submit')?.click(); });
  });
}

// ── Confetti ─────────────────────────────────────────────────────────
function triggerConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  const colors = ['#F4C542', '#2E7D32', '#1E3A5F', '#F28C38', '#9E9E9E', '#FFD700'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * .5 + 's';
    piece.style.animationDuration = (1.5 + Math.random()) + 's';
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 3000);
}

// ── Init ─────────────────────────────────────────────────────────────
(async () => {
  // Check if template exists, if not seed it
  try {
    await api('/template');
  } catch {
    await api('/template/seed', { method: 'POST' });
  }
  switchTab('home');
})();
