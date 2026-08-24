const $ = s => document.querySelector(s);
const store = chrome.storage.local;
const WEATHER_KEY = 'fieldWeather';
const LOCATION_KEY = 'fieldLocation';
const LOCATION_GUARD_KEY = 'fieldLocationGuard';
const SHORTCUTS_KEY = 'fieldShortcuts';
const SIDEBAR_WIDTH_KEY = 'fieldShortcutsSidebarWidth';
const SIDEBAR_WIDTH_DEFAULT = 195;
const SIDEBAR_WIDTH_MIN = 165;
const SIDEBAR_WIDTH_MAX = 340;
const SIDEBAR_STACK_BREAKPOINT = 930;
const SIDEBAR_LAYOUT_RESERVE = 762;
const SHORTCUTS_VERSION = 2;
const DEFAULT_SECTION_ID = 'default';
const SHORTCUTS_LOCK = 'field-notes-shortcuts';
const LOCATION_LOCK = 'field-notes-location';
const WEATHER_LOCK = 'field-notes-weather';
const todoistAuthStore = chrome.storage.local;
const TODOIST_CLIENT_KEY = 'fieldTodoistClient';
const TODOIST_AUTH_KEY = 'fieldTodoistAuth';
const TODOIST_AUTH_EPOCH_KEY = 'fieldTodoistAuthEpoch';
const TODOIST_AUTH_ATTEMPT_KEY = 'fieldTodoistAuthAttempt';
const TODOIST_SNOOZE_KEY = 'fieldTodoistSnoozes';
const TODOIST_TASK_CACHE_KEY = 'fieldTodoistTodayCache';
const TODOIST_API = 'https://api.todoist.com/api/v1';
const TODOIST_HOST = 'https://api.todoist.com/*';
const TODOIST_AUTH_URL = 'https://app.todoist.com/oauth/authorize';
const TODOIST_TOKEN_URL = 'https://api.todoist.com/oauth/access_token';
const TODOIST_REGISTER_URL = 'https://api.todoist.com/oauth/register';
const TODOIST_SNOOZE_MS = 60 * 60 * 1000;
const TODOIST_AUTH_LOCK = 'field-notes-todoist-auth';
const TODOIST_SNOOZE_LOCK = 'field-notes-todoist-snooze';

let editingId = null;
let editingSectionId = null;
let shortcutDialogSession = 0;
let sectionDialogSession = 0;
let weatherRequest = 0;
let shortcutMutation = Promise.resolve();
let activeController = null;
let airQualityPermission = null;
let locationSelection = 0;
let currentShortcutModel = emptyShortcutModel();
let todoistTasks = [];
let todoistTaskSnapshotSavedAt = null;
let todoistTaskSnapshotAuthEpoch = null;
let todoistHasTaskSnapshot = false;
let todoistTaskSnapshotPersisted = false;
let todoistTasksConfirmed = false;
let todoistTaskRequest = 0;
let todoistActiveAuthEpoch = null;
let todoistPending = new Set();
let todoistRowErrors = new Map();
let todoistSnoozeTimer = null;
let todoistConnected = false;
let shortcutSidebarWidth = SIDEBAR_WIDTH_DEFAULT;
let shortcutSidebarRevision = 0;
const weatherCodes={0:['Clear sky','☼'],1:['Mainly clear','◒'],2:['Partly cloudy','◐'],3:['Overcast','☁'],45:['Fog','≋'],48:['Rime fog','≋'],51:['Light drizzle','⋰'],53:['Drizzle','⋰'],55:['Heavy drizzle','⋰'],61:['Light rain','♢'],63:['Rain','♢'],65:['Heavy rain','♢'],71:['Light snow','❅'],73:['Snow','❅'],75:['Heavy snow','❅'],80:['Rain showers','♢'],81:['Rain showers','♢'],82:['Heavy showers','♢'],95:['Thunderstorm','ϟ'],96:['Thunderstorm','ϟ'],99:['Thunderstorm','ϟ']};
const get=async(k,f)=>{const d=await store.get(k);return d[k]??f},set=(k,v)=>store.set({[k]:v});
const withShortcutLock = callback => navigator.locks.request(SHORTCUTS_LOCK, { mode: 'exclusive' }, callback);
const withLocationLock = callback => navigator.locks.request(LOCATION_LOCK, { mode: 'exclusive' }, callback);
const withWeatherLock = callback => navigator.locks.request(WEATHER_LOCK, { mode: 'exclusive' }, callback);
const withTodoistAuthLock = callback => navigator.locks.request(TODOIST_AUTH_LOCK, { mode: 'exclusive' }, callback);
const withTodoistSnoozeLock = callback => navigator.locks.request(TODOIST_SNOOZE_LOCK, { mode: 'exclusive' }, callback);
const queue = callback => (shortcutMutation = shortcutMutation.then(() => withShortcutLock(callback), () => withShortcutLock(callback)));
async function restrictLocalStorageAccess() {
  if (typeof store.setAccessLevel !== 'function') return;
  try {
    await store.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch (error) {
    console.warn('Could not restrict local extension storage access.', error);
  }
}
function formatTime(){const n=new Date();$('#clock').textContent=n.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('#clockSeconds').textContent=String(n.getSeconds()).padStart(2,'0');$('#clock').dateTime=n.toISOString();$('#todayLabel').textContent=n.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}).toUpperCase();$('#timeZoneLabel').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_',' ').toUpperCase()}formatTime();setInterval(formatTime,1e3);
function normalizeUrl(value) {
  let url = String(value || '').trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try { return new URL(url).href; } catch { return null; }
}
function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function favicon(url) { return chrome.runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`); }
function initials(name) { return String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '↗'; }

function emptyShortcutModel(resetToken = 0) {
  return { version: SHORTCUTS_VERSION, resetToken, sections: [{ id: DEFAULT_SECTION_ID, name: 'General' }], shortcuts: [] };
}

function normalizeShortcutModel(raw) {
  const source = Array.isArray(raw) ? { sections: [], shortcuts: raw } : raw && typeof raw === 'object' ? raw : {};
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  const savedDefault = rawSections.find(section => section && typeof section === 'object' && section.id === DEFAULT_SECTION_ID);
  const defaultName = typeof savedDefault?.name === 'string' && savedDefault.name.trim() ? savedDefault.name.trim() : 'General';
  const resetToken = Number.isSafeInteger(source.resetToken) && source.resetToken >= 0 ? source.resetToken : 0;
  const sectionIds = new Set([DEFAULT_SECTION_ID]);
  const sections = [{ id: DEFAULT_SECTION_ID, name: defaultName }];

  for (const section of rawSections) {
    if (!section || typeof section !== 'object' || typeof section.id !== 'string' || !section.id || sectionIds.has(section.id)) continue;
    sectionIds.add(section.id);
    sections.push({ id: section.id, name: typeof section.name === 'string' && section.name.trim() ? section.name.trim() : 'Untitled section' });
  }

  const shortcuts = (Array.isArray(source.shortcuts) ? source.shortcuts : [])
    .filter(item => item && typeof item === 'object')
    .map(item => ({ ...item, sectionId: sectionIds.has(item.sectionId) ? item.sectionId : DEFAULT_SECTION_ID }));
  const model = { version: SHORTCUTS_VERSION, resetToken, sections, shortcuts };
  const needsPersist = raw !== null && raw !== undefined && (Array.isArray(raw) || JSON.stringify(raw) !== JSON.stringify(model));
  return { model, needsPersist };
}

async function readShortcutModel() {
  const { model, needsPersist } = normalizeShortcutModel(await get(SHORTCUTS_KEY, null));
  if (needsPersist) await set(SHORTCUTS_KEY, model);
  return model;
}

function sectionOptionText(section) { return section.name; }
function refreshShortcutSectionOptions(sections = currentShortcutModel.sections, selectedId = $('#shortcutSection').value) {
  const select = $('#shortcutSection');
  select.replaceChildren();
  for (const section of sections) {
    const option = document.createElement('option');
    option.value = section.id;
    option.textContent = sectionOptionText(section);
    select.append(option);
  }
  select.value = sections.some(section => section.id === selectedId) ? selectedId : DEFAULT_SECTION_ID;
}
function clearShortcutDragState() {
  for (const element of document.querySelectorAll('.is-dragging, .is-drop-target')) {
    element.classList.remove('is-dragging', 'is-drop-target');
  }
}
function shortcutCard(item) {
  const itemName = typeof item.name === 'string' ? item.name : 'Untitled shortcut';
  const itemUrl = typeof item.url === 'string' ? item.url : '';
  const card = document.createElement('div');
  const link = document.createElement('a');
  const image = document.createElement('img');
  const copy = document.createElement('span');
  const name = document.createElement('span');
  const edit = document.createElement('button');

  card.className = 'shortcut';
  card.draggable = true;
  link.href = itemUrl;
  link.className = 'shortcut-link';
  link.title = `Open ${itemName}`;
  image.alt = '';
  image.src = favicon(itemUrl);
  image.onerror = () => {
    const fallback = document.createElement('span');
    fallback.className = 'shortcut-fallback';
    fallback.textContent = initials(itemName);
    fallback.setAttribute('aria-hidden', 'true');
    image.replaceWith(fallback);
  };
  copy.className = 'shortcut-copy';
  name.className = 'shortcut-name';
  name.textContent = itemName;
  copy.append(name);
  link.append(image, copy);
  edit.className = 'shortcut-menu';
  edit.type = 'button';
  edit.setAttribute('aria-label', `Edit ${itemName}`);
  edit.textContent = '···';
  edit.addEventListener('click', () => openShortcut(item));
  card.addEventListener('dragstart', event => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.id);
    card.classList.add('is-dragging');
  });
  card.addEventListener('dragend', clearShortcutDragState);
  card.append(link, edit);
  return card;
}

function renderShortcuts(model) {
  currentShortcutModel = model;
  const container = $('#shortcutGrid');
  container.replaceChildren();
  container.className = 'shortcut-sections';
  $('#shortcutHint').textContent = model.shortcuts.length ? '' : 'Import frequent sites to get started. Chrome’s protected customized New Tab tiles cannot be imported.';

  for (const section of model.sections) {
    const items = model.shortcuts.filter(item => item.sectionId === section.id);
    const element = document.createElement('section');
    const header = document.createElement('div');
    const title = document.createElement('div');
    const name = document.createElement('h3');
    const count = document.createElement('span');
    const edit = document.createElement('button');
    const meta = document.createElement('div');
    const grid = document.createElement('div');

    element.className = 'shortcut-section';
    element.setAttribute('aria-labelledby', `section-${section.id}`);
    header.className = 'shortcut-section-header';
    title.className = 'shortcut-section-title';
    name.id = `section-${section.id}`;
    name.textContent = section.name;
    count.className = 'section-count';
    count.textContent = `${items.length} shortcut${items.length === 1 ? '' : 's'}`;
    edit.className = 'text-button section-edit';
    edit.type = 'button';
    edit.textContent = 'Edit section';
    edit.setAttribute('aria-label', `Edit ${section.name} section`);
    edit.addEventListener('click', () => openSection(section));
    meta.className = 'shortcut-section-meta';
    meta.append(count, edit);
    title.append(name, meta);
    header.append(title);
    grid.className = 'shortcut-section-grid';
    grid.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      grid.classList.add('is-drop-target');
    });
    grid.addEventListener('dragleave', event => {
      if (!grid.contains(event.relatedTarget)) grid.classList.remove('is-drop-target');
    });
    grid.addEventListener('drop', event => {
      event.preventDefault();
      const shortcutId = event.dataTransfer.getData('text/plain');
      clearShortcutDragState();
      if (!shortcutId) return;
      queue(async () => {
        const latestModel = await readShortcutModel();
        const shortcut = latestModel.shortcuts.find(item => item.id === shortcutId);
        const targetSectionExists = latestModel.sections.some(item => item.id === section.id);
        if (!targetSectionExists) {
          renderShortcuts(latestModel);
          return;
        }
        if (!shortcut || shortcut.sectionId === section.id) return;
        shortcut.sectionId = section.id;
        await set(SHORTCUTS_KEY, latestModel);
        renderShortcuts(latestModel);
      });
    });
    for (const item of items) grid.append(shortcutCard(item));
    element.append(header, grid);
    if (!items.length && section.id !== DEFAULT_SECTION_ID) {
      const empty = document.createElement('p');
      empty.className = 'section-empty';
      empty.textContent = 'No shortcuts in this section yet.';
      element.append(empty);
    }
    container.append(element);
  }
  refreshShortcutSectionOptions(model.sections);
}

async function loadShortcuts() {
  await queue(async () => renderShortcuts(await readShortcutModel()));
}
function clampSidebarWidth(width) {
  const responsiveMax = window.innerWidth > SIDEBAR_STACK_BREAKPOINT ? Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, window.innerWidth - SIDEBAR_LAYOUT_RESERVE)) : SIDEBAR_WIDTH_MAX;
  return Math.min(responsiveMax, Math.max(SIDEBAR_WIDTH_MIN, Math.round(Number(width) || SIDEBAR_WIDTH_DEFAULT)));
}
function applySidebarWidth(width) {
  shortcutSidebarWidth = clampSidebarWidth(width);
  $('.dashboard-layout').style.setProperty('--shortcut-sidebar-width', `${shortcutSidebarWidth}px`);
  const resizer = $('#shortcutResizer');
  resizer.setAttribute('aria-valuemax', String(clampSidebarWidth(SIDEBAR_WIDTH_MAX)));
  resizer.setAttribute('aria-valuenow', String(shortcutSidebarWidth));
  resizer.setAttribute('aria-valuetext', `${shortcutSidebarWidth} pixels wide`);
}
function persistSidebarWidth(width) {
  const next = clampSidebarWidth(width);
  applySidebarWidth(next);
  void set(SIDEBAR_WIDTH_KEY, next);
}
function resetSidebarWidth() { persistSidebarWidth(SIDEBAR_WIDTH_DEFAULT); }
function setupSidebarResizer() {
  const resizer = $('#shortcutResizer');
  let activePointerId = null;
  let dragStartX = 0;
  let dragStartWidth = shortcutSidebarWidth;
  resizer.addEventListener('pointerdown', event => {
    if (activePointerId !== null || window.matchMedia(`(max-width: ${SIDEBAR_STACK_BREAKPOINT}px)`).matches || event.button !== 0 || !event.isPrimary) return;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartWidth = shortcutSidebarWidth;
    resizer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  resizer.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointerId) return;
    applySidebarWidth(dragStartWidth + event.clientX - dragStartX);
  });
  const finishDrag = event => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
    persistSidebarWidth(shortcutSidebarWidth);
  };
  resizer.addEventListener('pointerup', finishDrag);
  resizer.addEventListener('pointercancel', finishDrag);
  resizer.addEventListener('lostpointercapture', finishDrag);
  resizer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      persistSidebarWidth(shortcutSidebarWidth + (event.key === 'ArrowRight' ? 10 : -10));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      persistSidebarWidth(event.key === 'Home' ? SIDEBAR_WIDTH_MIN : SIDEBAR_WIDTH_MAX);
    }
  });
  resizer.addEventListener('dblclick', resetSidebarWidth);
  window.addEventListener('resize', () => applySidebarWidth(shortcutSidebarWidth));
}
async function initializeSidebarResizer() {
  const revision = shortcutSidebarRevision;
  const savedWidth = await get(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH_DEFAULT);
  if (revision === shortcutSidebarRevision) applySidebarWidth(savedWidth);
  setupSidebarResizer();
}
void initializeSidebarResizer();
function openShortcut(item = null) {
  shortcutDialogSession += 1;
  editingId = item?.id || null;
  $('#dialogTitle').textContent = item ? 'Edit shortcut' : 'Add a shortcut';
  $('#shortcutName').value = item?.name || '';
  $('#shortcutUrl').value = item?.url || '';
  $('#shortcutUrl').setCustomValidity('');
  refreshShortcutSectionOptions(currentShortcutModel.sections, item?.sectionId || DEFAULT_SECTION_ID);
  $('#deleteShortcut').hidden = !item;
  $('#shortcutDialog').showModal();
  setTimeout(() => $('#shortcutName').focus(), 30);
}
function openSection(section = null) {
  sectionDialogSession += 1;
  editingSectionId = section?.id || null;
  const isDefault = section?.id === DEFAULT_SECTION_ID;
  $('#sectionDialogTitle').textContent = section ? 'Edit section' : 'Add a section';
  $('#sectionName').value = section?.name || '';
  $('#sectionDialogNote').hidden = !isDefault;
  $('#sectionDialogNote').textContent = isDefault ? 'This is the default section. It cannot be deleted.' : '';
  $('#deleteSection').hidden = !section || isDefault;
  $('#sectionDialog').showModal();
  setTimeout(() => $('#sectionName').focus(), 30);
}

$('#addShortcut').addEventListener('click', () => openShortcut());
$('#addSection').addEventListener('click', () => openSection());
$('#shortcutUrl').addEventListener('input', () => $('#shortcutUrl').setCustomValidity(''));
$('#shortcutForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#shortcutName').value.trim();
  const url = normalizeUrl($('#shortcutUrl').value);
  const selectedSectionId = $('#shortcutSection').value;
  const shortcutId = editingId;
  const dialogSession = shortcutDialogSession;
  if (!url) {
    $('#shortcutUrl').setCustomValidity('Enter a valid web address.');
    $('#shortcutUrl').reportValidity();
    return;
  }
  $('#shortcutUrl').setCustomValidity('');
  queue(async () => {
    const model = await readShortcutModel();
    const sectionId = model.sections.some(section => section.id === selectedSectionId) ? selectedSectionId : DEFAULT_SECTION_ID;
    if (shortcutId) {
      const item = model.shortcuts.find(shortcut => shortcut.id === shortcutId);
      if (item) Object.assign(item, { name, url, sectionId });
    } else {
      model.shortcuts.push({ id: crypto.randomUUID(), name, url, sectionId });
    }
    await set(SHORTCUTS_KEY, model);
    renderShortcuts(model);
    if (shortcutDialogSession === dialogSession && $('#shortcutDialog').open) $('#shortcutDialog').close();
  });
});

$('#deleteShortcut').addEventListener('click', () => {
  const shortcutId = editingId;
  const dialogSession = shortcutDialogSession;
  if (!shortcutId || !confirm('Delete this shortcut?')) return;
  queue(async () => {
    const model = await readShortcutModel();
    model.shortcuts = model.shortcuts.filter(item => item.id !== shortcutId);
    await set(SHORTCUTS_KEY, model);
    renderShortcuts(model);
    if (shortcutDialogSession === dialogSession && $('#shortcutDialog').open) {
      $('#shortcutDialog').close();
      $('#addShortcut').focus();
    }
  });
});

$('#sectionForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#sectionName').value.trim();
  const sectionId = editingSectionId;
  const dialogSession = sectionDialogSession;
  if (!name) return;
  queue(async () => {
    const model = await readShortcutModel();
    if (sectionId) {
      const section = model.sections.find(item => item.id === sectionId);
      if (section) section.name = name;
    } else {
      model.sections.push({ id: crypto.randomUUID(), name });
    }
    await set(SHORTCUTS_KEY, model);
    renderShortcuts(model);
    if (sectionDialogSession === dialogSession && $('#sectionDialog').open) $('#sectionDialog').close();
  });
});

$('#deleteSection').addEventListener('click', () => {
  const sectionId = editingSectionId;
  const dialogSession = sectionDialogSession;
  if (!sectionId || sectionId === DEFAULT_SECTION_ID || !confirm('Delete this section? Its shortcuts will move to the default section.')) return;
  queue(async () => {
    const model = await readShortcutModel();
    if (!model.sections.some(section => section.id === sectionId)) return;
    model.shortcuts.forEach(shortcut => {
      if (shortcut.sectionId === sectionId) shortcut.sectionId = DEFAULT_SECTION_ID;
    });
    model.sections = model.sections.filter(section => section.id !== sectionId);
    await set(SHORTCUTS_KEY, model);
    renderShortcuts(model);
    if (sectionDialogSession === dialogSession && $('#sectionDialog').open) {
      $('#sectionDialog').close();
      $('#addSection').focus();
    }
  });
});

const requestPermission = permission => new Promise(resolve => chrome.permissions.request(permission, resolve));
async function importTopSites() {
  const importResetToken = await queue(async () => (await readShortcutModel()).resetToken);
  if (!await requestPermission({ permissions: ['topSites'] })) {
    alert('Permission is needed to read frequently visited sites.');
    return;
  }
  chrome.topSites.get(sites => queue(async () => {
    const model = await readShortcutModel();
    if (model.resetToken !== importResetToken) {
      renderShortcuts(model);
      $('#shortcutHint').textContent = 'Import was not applied because shortcut data was cleared.';
      return;
    }
    const known = new Set(model.shortcuts.map(item => normalizeUrl(item.url)).filter(Boolean));
    const added = sites
      .map(site => ({ url: normalizeUrl(site.url), name: site.title || host(site.url) }))
      .filter(site => {
        if (!site.url || known.has(site.url)) return false;
        known.add(site.url);
        return true;
      })
      .map(site => ({ id: crypto.randomUUID(), name: site.name, url: site.url, sectionId: DEFAULT_SECTION_ID }));
    model.shortcuts.push(...added);
    await set(SHORTCUTS_KEY, model);
    renderShortcuts(model);
    $('#shortcutHint').textContent = added.length ? `Imported ${added.length} frequent site${added.length === 1 ? '' : 's'}` : 'No new frequent sites found.';
  }));
}
$('#importTopSites').addEventListener('click', importTopSites);

const todoistAuthGet = async (key, fallback = null) => {
  const data = await todoistAuthStore.get(key);
  return data[key] ?? fallback;
};
const todoistAuthSet = (key, value) => todoistAuthStore.set({ [key]: value });
const isTodoistSession = session => Boolean(session && typeof session === 'object' && typeof session.accessToken === 'string' && session.accessToken && (session.refreshToken === null || session.refreshToken === undefined || typeof session.refreshToken === 'string') && (session.expiresAt === null || session.expiresAt === undefined || Number.isFinite(session.expiresAt)) && (session.timeZone === null || session.timeZone === undefined || typeof session.timeZone === 'string'));
const sameTodoistAccessToken = (left, right) => Boolean(left?.accessToken && left.accessToken === right?.accessToken);
const todoistCredentialError = message => Object.assign(new Error(message), { todoistCredentialsInvalid: true });
const todoistAuthInvalidatedError = () => todoistCredentialError('Todoist sign-in changed. Connect again.');
const todoistTaskForCache = task => ({
  id: typeof task.id === 'string' || typeof task.id === 'number' ? String(task.id) : '',
  content: typeof task.content === 'string' ? task.content : '',
  priority: Number.isInteger(task.priority) ? task.priority : 1,
  due: task.due && typeof task.due.date === 'string' ? { date: task.due.date, is_recurring: Boolean(task.due.is_recurring) } : null
});
const isTodoistCachedTask = task => Boolean(task && typeof task === 'object' && !Array.isArray(task) && typeof task.id === 'string' && task.id && typeof task.content === 'string' && Number.isInteger(task.priority) && task.priority >= 1 && task.priority <= 4 && (task.due === null || (typeof task.due === 'object' && !Array.isArray(task.due) && typeof task.due.date === 'string' && typeof task.due.is_recurring === 'boolean' && Object.keys(task.due).every(key => ['date', 'is_recurring'].includes(key)))) && Object.keys(task).every(key => ['id', 'content', 'priority', 'due'].includes(key)));
const isTodoistTaskCache = cache => Boolean(cache && typeof cache === 'object' && !Array.isArray(cache) && Array.isArray(cache.tasks) && cache.tasks.every(isTodoistCachedTask) && Number.isFinite(cache.savedAt) && typeof cache.authEpoch === 'string' && cache.authEpoch && Object.keys(cache).every(key => ['tasks', 'savedAt', 'authEpoch'].includes(key)));
const formatTodoistCacheTime = savedAt => new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

async function ensureTodoistAuthEpoch() {
  return withTodoistAuthLock(async () => {
    if (!isTodoistSession(await todoistAuthGet(TODOIST_AUTH_KEY, null))) return null;
    const existing = await todoistAuthGet(TODOIST_AUTH_EPOCH_KEY, null);
    if (typeof existing === 'string' && existing) return existing;
    const epoch = randomToken();
    await todoistAuthSet(TODOIST_AUTH_EPOCH_KEY, epoch);
    return epoch;
  });
}

async function readTodoistTaskCache(authEpoch) {
  const cache = await todoistAuthGet(TODOIST_TASK_CACHE_KEY, null);
  return isTodoistTaskCache(cache) && cache.authEpoch === authEpoch ? cache : null;
}

async function writeTodoistTaskCache(tasks, authEpoch, request) {
  return withTodoistAuthLock(async () => {
    const session = await todoistAuthGet(TODOIST_AUTH_KEY, null);
    if (!Array.isArray(tasks) || !todoistTaskLoadIsCurrent(request, authEpoch) || await todoistAuthGet(TODOIST_AUTH_EPOCH_KEY, null) !== authEpoch || !isTodoistSession(session)) return null;
    const cache = { tasks: tasks.map(todoistTaskForCache).filter(isTodoistCachedTask), savedAt: Date.now(), authEpoch };
    try {
      await todoistAuthSet(TODOIST_TASK_CACHE_KEY, cache);
      return { cache, persisted: true };
    } catch {
      console.warn('Todoist task cache could not be saved.');
      return { cache, persisted: false };
    }
  });
}

const todoistTaskLoadIsCurrent = (request, authEpoch) => request === todoistTaskRequest && authEpoch === todoistActiveAuthEpoch;

function clearTodoistTaskSnapshot() {
  todoistTasks = [];
  todoistTaskSnapshotSavedAt = null;
  todoistTaskSnapshotAuthEpoch = null;
  todoistHasTaskSnapshot = false;
  todoistTaskSnapshotPersisted = false;
  todoistTasksConfirmed = false;
  todoistPending.clear();
  todoistRowErrors.clear();
  if (todoistSnoozeTimer) clearTimeout(todoistSnoozeTimer);
  todoistSnoozeTimer = null;
  $('#todoistTasks').replaceChildren();
}

function invalidateTodoistTaskLoads(authEpoch = null) {
  todoistTaskRequest += 1;
  todoistActiveAuthEpoch = authEpoch;
  clearTodoistTaskSnapshot();
}

async function invalidateTodoistAuthLocked(expectedSession = null, clearClient = false) {
  const latest = await todoistAuthGet(TODOIST_AUTH_KEY, null);
  if (expectedSession && !sameTodoistAccessToken(latest, expectedSession)) return false;
  await todoistAuthSet(TODOIST_AUTH_EPOCH_KEY, randomToken());
  await todoistAuthStore.remove(clearClient ? [TODOIST_AUTH_KEY, TODOIST_CLIENT_KEY, TODOIST_AUTH_ATTEMPT_KEY, TODOIST_TASK_CACHE_KEY] : [TODOIST_AUTH_KEY, TODOIST_AUTH_ATTEMPT_KEY, TODOIST_TASK_CACHE_KEY]);
  return true;
}

async function invalidateTodoistAuth(expectedSession = null, clearClient = false) {
  return withTodoistAuthLock(() => invalidateTodoistAuthLocked(expectedSession, clearClient));
}

async function discardMalformedTodoistAuth() {
  return withTodoistAuthLock(async () => {
    const latest = await todoistAuthGet(TODOIST_AUTH_KEY, null);
    if (latest && !isTodoistSession(latest)) await invalidateTodoistAuthLocked();
  });
}

async function readTodoistSession() {
  const session = await todoistAuthGet(TODOIST_AUTH_KEY, null);
  if (!session) return null;
  if (isTodoistSession(session)) return session;
  await discardMalformedTodoistAuth();
  return null;
}

async function beginTodoistConnect() {
  return withTodoistAuthLock(async () => {
    const attempt = randomToken();
    await todoistAuthSet(TODOIST_AUTH_ATTEMPT_KEY, attempt);
    return attempt;
  });
}

async function cancelTodoistConnectAttempt(attempt) {
  return withTodoistAuthLock(async () => {
    if (await todoistAuthGet(TODOIST_AUTH_ATTEMPT_KEY, null) !== attempt) return false;
    await todoistAuthStore.remove(TODOIST_AUTH_ATTEMPT_KEY);
    return true;
  });
}

async function completeTodoistConnect(attempt, session) {
  return withTodoistAuthLock(async () => {
    if (await todoistAuthGet(TODOIST_AUTH_ATTEMPT_KEY, null) !== attempt) throw todoistAuthInvalidatedError();
    const authEpoch = randomToken();
    await todoistAuthSet(TODOIST_AUTH_EPOCH_KEY, authEpoch);
    await todoistAuthStore.remove([TODOIST_AUTH_ATTEMPT_KEY, TODOIST_TASK_CACHE_KEY]);
    await todoistAuthSet(TODOIST_AUTH_KEY, session);
    return authEpoch;
  });
}
const containsPermission = permission => new Promise(resolve => chrome.permissions.contains(permission, resolve));
const launchWebAuthFlow = details => new Promise((resolve, reject) => chrome.identity.launchWebAuthFlow(details, redirectUrl => {
  const error = chrome.runtime.lastError;
  if (error || !redirectUrl) reject(new Error(error?.message || 'Todoist sign-in did not finish.'));
  else resolve(redirectUrl);
}));
const base64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const randomToken = () => base64Url(crypto.getRandomValues(new Uint8Array(32)));
const todoistDueKey = task => `${task?.due?.date || ''}|${task?.due?.is_recurring ? 'recurring' : 'once'}`;
const todoistApiPriority = task => {
  const priority = Number(task?.priority);
  return Number.isInteger(priority) && priority >= 1 && priority <= 4 ? priority : 1;
};
const todoistTomorrow = timeZone => {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const noonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  noonUtc.setUTCDate(noonUtc.getUTCDate() + 1);
  return `${noonUtc.getUTCFullYear()}-${String(noonUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(noonUtc.getUTCDate()).padStart(2, '0')}`;
};

function setTodoistStatus(message, isError = false, isUpdating = false) {
  const status = $('#todoistStatus');
  status.textContent = message;
  status.classList.toggle('is-error', isError);
  status.classList.toggle('is-updating', isUpdating);
}

function setTodoistConnection(connected) {
  todoistConnected = connected;
  $('#todoistConnect').textContent = connected ? 'Refresh' : 'Connect Todoist';
  $('#settingsTodoistConnect').textContent = connected ? 'Reconnect Todoist' : 'Connect Todoist';
  $('#todoistDisconnect').hidden = !connected;
  $('#todoistConnectionStatus').textContent = connected ? 'Connected. Sign-in persists on this device.' : 'Not connected. Sign-in will persist on this device after you connect.';
}

async function ensureTodoistHost() {
  if (await containsPermission({ origins: [TODOIST_HOST] })) return true;
  return requestPermission({ origins: [TODOIST_HOST] });
}

async function todoistClient() {
  const redirectUri = chrome.identity.getRedirectURL('oauth2');
  const saved = await get(TODOIST_CLIENT_KEY, null);
  if (saved?.clientId && saved.redirectUri === redirectUri) return saved;
  const response = await fetch(TODOIST_REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      application_type: 'web',
      client_name: 'Field Notes New Tab',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    })
  });
  if (!response.ok) throw new Error('Todoist could not create a sign-in connection.');
  const payload = await response.json();
  if (typeof payload.client_id !== 'string' || !payload.client_id) throw new Error('Todoist returned an invalid sign-in connection.');
  const client = { clientId: payload.client_id, redirectUri };
  await set(TODOIST_CLIENT_KEY, client);
  return client;
}

function normalizeTodoistSession(payload, previous = {}) {
  if (typeof payload?.access_token !== 'string' || !payload.access_token) throw new Error('Todoist did not return an access token.');
  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === 'string' && payload.refresh_token ? payload.refresh_token : previous.refreshToken || null,
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + Math.max(0, expiresIn * 1000 - 30000) : null,
    timeZone: typeof previous.timeZone === 'string' ? previous.timeZone : null
  };
}

async function exchangeTodoistToken(fields, previous = {}) {
  const response = await fetch(TODOIST_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields)
  });
  if (!response.ok) {
    const error = new Error('Todoist sign-in could not be completed.');
    error.todoistCredentialsInvalid = [400, 401, 403].includes(response.status);
    throw error;
  }
  const session = normalizeTodoistSession(await response.json(), previous);
  return session;
}

async function refreshTodoistSession(session, force = false) {
  return withTodoistAuthLock(async () => {
    const latest = await todoistAuthGet(TODOIST_AUTH_KEY, null);
    if (!isTodoistSession(latest)) {
      if (latest) await invalidateTodoistAuthLocked();
      throw todoistCredentialError('Connect Todoist to continue.');
    }
    if (latest.accessToken !== session?.accessToken) return latest;
    if (!force && (!latest.expiresAt || latest.expiresAt > Date.now())) return latest;
    if (!latest.refreshToken) {
      await invalidateTodoistAuthLocked(latest);
      throw todoistCredentialError('Todoist sign-in expired. Connect again.');
    }
    const client = await todoistClient();
    try {
      const refreshed = await exchangeTodoistToken({ grant_type: 'refresh_token', refresh_token: latest.refreshToken, client_id: client.clientId }, latest);
      await todoistAuthSet(TODOIST_AUTH_KEY, refreshed);
      return refreshed;
    } catch (error) {
      if (error.todoistCredentialsInvalid) await invalidateTodoistAuthLocked(latest);
      throw error;
    }
  });
}

async function activeTodoistSession() {
  const session = await readTodoistSession();
  if (!session) return null;
  if (session.expiresAt && session.expiresAt <= Date.now()) return refreshTodoistSession(session);
  return session;
}

async function todoistFetch(path, options = {}, retryAuth = true) {
  let session = await activeTodoistSession();
  if (!session) throw new Error('Connect Todoist to continue.');
  const response = await fetch(`${TODOIST_API}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${session.accessToken}` }
  });
  if (response.status === 401 && retryAuth && session.refreshToken) {
    session = await refreshTodoistSession(session, true);
    return todoistFetch(path, options, false);
  }
  if (response.status === 401) {
    await invalidateTodoistAuth(session);
    throw todoistCredentialError('Todoist sign-in expired. Connect again.');
  }
  if (!response.ok) throw new Error(`Todoist request failed (${response.status}).`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadTodoistTimeZone() {
  const session = await activeTodoistSession();
  if (!session || session.timeZone) return session?.timeZone || null;
  try {
    const payload = await todoistFetch('/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ sync_token: '*', resource_types: '["user"]' })
    });
    const timeZone = payload?.user?.tz_info?.timezone;
    if (typeof timeZone !== 'string' || !timeZone) return null;
    new Intl.DateTimeFormat('en', { timeZone }).format();
    await withTodoistAuthLock(async () => {
      const latest = await todoistAuthGet(TODOIST_AUTH_KEY, null);
      if (isTodoistSession(latest) && sameTodoistAccessToken(latest, session)) await todoistAuthSet(TODOIST_AUTH_KEY, { ...latest, timeZone });
    });
    return timeZone;
  } catch {
    return null;
  }
}

async function connectTodoist() {
  setTodoistStatus('Opening Todoist sign-in…');
  let authAttempt = null;
  try {
    authAttempt = await beginTodoistConnect();
    if (!await ensureTodoistHost()) throw new Error('Todoist network access was not granted.');
    const client = await todoistClient();
    const verifier = randomToken();
    const challenge = base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randomToken();
    const authUrl = new URL(TODOIST_AUTH_URL);
    authUrl.search = new URLSearchParams({
      client_id: client.clientId,
      scope: 'data:read_write',
      state,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });
    const redirect = new URL(await launchWebAuthFlow({ url: authUrl.href, interactive: true }));
    if (redirect.searchParams.get('state') !== state) throw new Error('Todoist sign-in state did not match.');
    const oauthError = redirect.searchParams.get('error');
    const code = redirect.searchParams.get('code');
    if (oauthError || !code) throw new Error(oauthError === 'access_denied' ? 'Todoist sign-in was canceled.' : 'Todoist sign-in did not return a code.');
    const session = await exchangeTodoistToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: client.redirectUri,
      client_id: client.clientId,
      code_verifier: verifier
    });
    const authEpoch = await completeTodoistConnect(authAttempt, session);
    invalidateTodoistTaskLoads(authEpoch);
    setTodoistConnection(true);
    await loadTodoistTasks({ retainCurrentTasks: false });
  } catch (error) {
    if (authAttempt) await cancelTodoistConnectAttempt(authAttempt);
    setTodoistConnection(Boolean(await readTodoistSession()));
    if (todoistHasTaskSnapshot) setTodoistStatus(`Showing saved tasks from ${formatTodoistCacheTime(todoistTaskSnapshotSavedAt)} · Sign-in failed.`);
    else setTodoistStatus(error.message || 'Todoist sign-in failed.', true);
  }
}

function resetTodoistUi(status = 'Connect Todoist to see today’s tasks.') {
  invalidateTodoistTaskLoads();
  setTodoistConnection(false);
  setTodoistStatus(status);
  $('#todoistTasks').replaceChildren();
}

async function disconnectTodoist({ clearClient = false } = {}) {
  await invalidateTodoistAuth(null, clearClient);
  resetTodoistUi();
}

async function loadTodoistSnoozes() {
  const raw = await get(TODOIST_SNOOZE_KEY, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

async function updateTodoistSnoozes(callback) {
  return withTodoistSnoozeLock(async () => {
    const snoozes = await loadTodoistSnoozes();
    const result = callback(snoozes);
    await set(TODOIST_SNOOZE_KEY, snoozes);
    return result;
  });
}

function todoistTime(task) {
  const value = task?.due?.date;
  if (!value || !value.includes('T')) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function todoistButton(label, action, task, className = 'todoist-action') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = task.id;
  button.disabled = todoistPending.has(task.id);
  return button;
}

async function visibleTodoistTasks() {
  return withTodoistSnoozeLock(async () => {
    const snoozes = await loadTodoistSnoozes();
    const now = Date.now();
    const knownIds = new Set(todoistTasks.map(task => String(task.id)));
    let changed = false;
    let snoozed = 0;
    let nextExpiry = Infinity;
    const visible = todoistTasks.filter(task => {
      const id = String(task.id);
      const entry = snoozes[id];
      if (!entry) return true;
      if (!knownIds.has(id) || entry.dueKey !== todoistDueKey(task) || !Number.isFinite(entry.snoozedUntil) || entry.snoozedUntil <= now) {
        delete snoozes[id];
        changed = true;
        return true;
      }
      snoozed += 1;
      nextExpiry = Math.min(nextExpiry, entry.snoozedUntil);
      return false;
    });
    for (const id of Object.keys(snoozes)) {
      if (!knownIds.has(id)) {
        delete snoozes[id];
        changed = true;
      }
    }
    if (changed) await set(TODOIST_SNOOZE_KEY, snoozes);
    if (todoistSnoozeTimer) clearTimeout(todoistSnoozeTimer);
    todoistSnoozeTimer = Number.isFinite(nextExpiry) ? setTimeout(() => { void loadTodoistTasks(); }, Math.max(1000, nextExpiry - now + 50)) : null;
    return { visible, snoozed };
  });
}

async function renderTodoistTasks({ preserveStatus = false, isCurrent = () => true } = {}) {
  const container = $('#todoistTasks');
  const { visible, snoozed } = await visibleTodoistTasks();
  if (!await isCurrent()) return null;
  container.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'todoist-empty';
    empty.textContent = snoozed ? `All remaining tasks are snoozed (${snoozed}).` : 'No tasks due today.';
    container.append(empty);
  }
  const groups = [
    [4, 'P1 · Must do'],
    [3, 'P2 · Should do'],
    [2, 'P3 · Do when you have time'],
    [1, 'P4 · Optional']
  ];
  for (const [priority, label] of groups) {
    const tasks = visible.filter(task => todoistApiPriority(task) === priority).sort((a, b) => (a.due?.date || '').localeCompare(b.due?.date || '') || String(a.content).localeCompare(String(b.content)));
    if (!tasks.length) continue;
    const group = document.createElement('section');
    const heading = document.createElement('h3');
    const list = document.createElement('div');
    group.className = 'todoist-group';
    heading.textContent = `${label} · ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
    list.className = 'todoist-group-list';
    for (const task of tasks) {
      const row = document.createElement('article');
      const complete = todoistButton('', 'complete', task, 'todoist-complete');
      const content = document.createElement('div');
      const title = document.createElement('b');
      const due = document.createElement('span');
      const tomorrow = todoistButton('Tomorrow', 'tomorrow', task);
      const snooze = todoistButton('Snooze 1h', 'snooze', task);
      row.className = `todoist-task${todoistPending.has(task.id) ? ' is-pending' : ''}`;
      complete.setAttribute('aria-label', `Complete ${task.content}`);
      complete.title = task.due?.is_recurring ? 'Complete this occurrence' : 'Complete task';
      content.className = 'todoist-content';
      title.textContent = task.content || 'Untitled task';
      due.className = 'todoist-due';
      due.textContent = todoistTime(task);
      tomorrow.disabled = todoistPending.has(task.id) || Boolean(task.due?.is_recurring);
      tomorrow.title = task.due?.is_recurring ? 'Recurring tasks keep their Todoist schedule.' : task.due?.date?.includes('T') ? 'Move to tomorrow as an all-day task.' : 'Move to tomorrow.';
      snooze.title = 'Hide this task here for one hour. Its Todoist date will not change.';
      if (!todoistTasksConfirmed) {
        const reason = 'Refresh to confirm saved tasks before changing Todoist.';
        complete.disabled = true;
        complete.title = reason;
        complete.setAttribute('aria-label', `Complete ${task.content}. ${reason}`);
        tomorrow.disabled = true;
        tomorrow.title = reason;
        tomorrow.setAttribute('aria-label', `Move ${task.content} to tomorrow. ${reason}`);
      }
      content.append(title);
      if (due.textContent) content.append(due);
      row.append(complete, content, tomorrow, snooze);
      const rowError = todoistRowErrors.get(task.id);
      if (rowError) {
        const error = document.createElement('p');
        error.className = 'todoist-row-error';
        error.textContent = rowError;
        row.append(error);
      }
      list.append(row);
    }
    group.append(heading, list);
    container.append(group);
  }
  if (todoistConnected && !preserveStatus && !$('#todoistStatus').classList.contains('is-updating')) setTodoistStatus(`${visible.length} task${visible.length === 1 ? '' : 's'} due today${snoozed ? ` · ${snoozed} snoozed` : ''}.`);
  return { visible, snoozed };
}

async function loadTodoistTasks({ retainCurrentTasks = todoistHasTaskSnapshot } = {}) {
  const authEpoch = await ensureTodoistAuthEpoch();
  if (!authEpoch) return;
  const request = ++todoistTaskRequest;
  todoistActiveAuthEpoch = authEpoch;
  const renderIsCurrent = async () => todoistTaskLoadIsCurrent(request, authEpoch) && await todoistAuthGet(TODOIST_AUTH_EPOCH_KEY, null) === authEpoch;
  if (retainCurrentTasks && todoistHasTaskSnapshot && todoistTaskSnapshotAuthEpoch === authEpoch) {
    todoistTasksConfirmed = false;
    const source = todoistTaskSnapshotPersisted ? 'saved' : 'last fetched';
    setTodoistStatus(`Showing ${source} tasks from ${formatTodoistCacheTime(todoistTaskSnapshotSavedAt)} · Updating…`, false, true);
    if (!await renderTodoistTasks({ preserveStatus: true, isCurrent: renderIsCurrent })) return;
  } else setTodoistStatus('Loading today’s tasks…', false, true);
  try {
    await loadTodoistTimeZone();
    const tasks = [];
    let cursor = null;
    do {
      const params = new URLSearchParams({ query: 'today', limit: '200' });
      if (cursor) params.set('cursor', cursor);
      const page = await todoistFetch(`/tasks/filter?${params}`);
      if (!Array.isArray(page?.results)) throw new Error('Todoist returned an invalid task list.');
      tasks.push(...page.results);
      cursor = page.next_cursor || null;
    } while (cursor);
    if (!todoistTaskLoadIsCurrent(request, authEpoch) || await todoistAuthGet(TODOIST_AUTH_EPOCH_KEY, null) !== authEpoch || !await readTodoistSession()) return;
    const cacheResult = await writeTodoistTaskCache(tasks, authEpoch, request);
    if (!cacheResult || !todoistTaskLoadIsCurrent(request, authEpoch)) return;
    const { cache, persisted } = cacheResult;
    todoistTasks = tasks;
    todoistTaskSnapshotSavedAt = cache.savedAt;
    todoistTaskSnapshotAuthEpoch = authEpoch;
    todoistHasTaskSnapshot = true;
    todoistTaskSnapshotPersisted = persisted;
    todoistTasksConfirmed = true;
    todoistRowErrors.clear();
    setTodoistConnection(true);
    const rendered = await renderTodoistTasks({ preserveStatus: true, isCurrent: renderIsCurrent });
    if (!rendered || !await renderIsCurrent()) return;
    const { visible, snoozed } = rendered;
    setTodoistStatus(`Updated just now · ${visible.length} task${visible.length === 1 ? '' : 's'} due today${snoozed ? ` · ${snoozed} snoozed` : ''}.`);
  } catch (error) {
    if (!todoistTaskLoadIsCurrent(request, authEpoch) || await todoistAuthGet(TODOIST_AUTH_EPOCH_KEY, null) !== authEpoch) return;
    const session = await readTodoistSession();
    setTodoistConnection(Boolean(session));
    if (todoistHasTaskSnapshot && todoistTaskSnapshotAuthEpoch === authEpoch) {
      const savedAt = todoistTaskSnapshotSavedAt ? ` from ${formatTodoistCacheTime(todoistTaskSnapshotSavedAt)}` : '';
      const source = todoistTaskSnapshotPersisted ? 'saved' : 'last fetched';
      setTodoistStatus(`Showing ${source} tasks${savedAt} · Update failed.`);
      return;
    }
    setTodoistStatus(error.message || 'Todoist tasks are unavailable.', true);
  }
}

async function clearTodoistSnooze(taskId) {
  await updateTodoistSnoozes(snoozes => { delete snoozes[taskId]; });
}

async function mutateTodoistTask(task, action) {
  if (!todoistTasksConfirmed && (action === 'complete' || action === 'tomorrow')) return;
  todoistPending.add(task.id);
  todoistRowErrors.delete(task.id);
  await renderTodoistTasks();
  try {
    if (action === 'complete') {
      await todoistFetch(`/tasks/${encodeURIComponent(task.id)}/close`, { method: 'POST' });
      await clearTodoistSnooze(String(task.id));
    } else if (action === 'tomorrow') {
      if (task.due?.is_recurring) throw new Error('Recurring tasks keep their Todoist schedule.');
      const session = await activeTodoistSession();
      const dueDate = todoistTomorrow(session?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      await todoistFetch(`/tasks/${encodeURIComponent(task.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date: dueDate }) });
      await clearTodoistSnooze(String(task.id));
    } else if (action === 'snooze') {
      await updateTodoistSnoozes(snoozes => {
        snoozes[String(task.id)] = { snoozedUntil: Date.now() + TODOIST_SNOOZE_MS, dueKey: todoistDueKey(task) };
      });
    }
    todoistPending.delete(task.id);
    if (action === 'snooze') await renderTodoistTasks();
    else await loadTodoistTasks();
  } catch (error) {
    todoistPending.delete(task.id);
    todoistRowErrors.set(task.id, `${error.message || 'Action failed'} Refresh to confirm the task’s current state.`);
    await renderTodoistTasks();
  }
}

$('#todoistTasks').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const task = todoistTasks.find(item => String(item.id) === button.dataset.id);
  if (task) void mutateTodoistTask(task, button.dataset.action);
});
$('#todoistConnect').addEventListener('click', () => todoistConnected ? void loadTodoistTasks() : void connectTodoist());
$('#settingsTodoistConnect').addEventListener('click', () => void connectTodoist());
$('#todoistDisconnect').addEventListener('click', () => void disconnectTodoist());

function emptyWeather(symbol,text,action){const box=document.createElement('div');box.className='weather-empty';const s=document.createElement('span');s.className='weather-symbol';s.setAttribute('aria-hidden','true');s.textContent=symbol;const p=document.createElement('p');p.textContent=text;box.append(s,p);if(action){const b=document.createElement('button');b.className='text-button';b.type='button';b.textContent='Try again';b.addEventListener('click',openLocation);box.append(b)}$('#weatherContent').replaceChildren(box)}function showLocationEmpty(){const box=document.createElement('div'),symbol=document.createElement('span'),copy=document.createElement('p'),current=document.createElement('button'),search=document.createElement('button');box.className='weather-empty';symbol.className='weather-symbol';symbol.setAttribute('aria-hidden','true');symbol.textContent='✧';copy.textContent='Choose your location to begin a local forecast.';current.className='accent-button';current.type='button';current.textContent='Use my location';current.addEventListener('click',openLocation);search.className='text-button';search.type='button';search.textContent='Search a city';search.addEventListener('click',openLocation);box.append(symbol,copy,current,search);$('#weatherContent').replaceChildren(box)}function showWeatherLoading(){emptyWeather('⌁','Reading the sky…')}function showWeatherError(msg){emptyWeather('!',msg,true)}
function finiteNumber(value){if(value===null||value===undefined||(typeof value==='string'&&!value.trim()))return null;const number=Number(value);return Number.isFinite(number)?number:null}function rounded(value){const number=finiteNumber(value);return number===null?'—':String(Math.round(number))}function dateLabel(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'recently'}function aqiCategory(value){const aqi=finiteNumber(value);if(aqi===null||aqi<0)return 'Unavailable';if(aqi<=50)return 'Good';if(aqi<=100)return 'Moderate';if(aqi<=150)return 'Unhealthy for Sensitive Groups';if(aqi<=200)return 'Unhealthy';if(aqi<=300)return 'Very Unhealthy';return 'Hazardous'}
function appendAttribution(place){const weather=document.createElement('p');weather.className='weather-attribution';const link=document.createElement('a');link.href='https://open-meteo.com/';link.target='_blank';link.rel='noreferrer';link.textContent='WEATHER · OPEN-METEO';link.title='Open-Meteo weather data';weather.append(link);const aqi=document.createElement('p');aqi.className='weather-attribution';aqi.textContent='AQI · CAMS VIA OPEN-METEO';aqi.title='US Air Quality Index from CAMS via Open-Meteo';place.append(weather,aqi)}
function renderWeather(data,location,stale=false,airQuality=null){const c=data?.current||{},[summary,icon]=weatherCodes[c.weather_code]||['Variable conditions','✧'],reading=document.createElement('div');reading.className='weather-reading';const wi=document.createElement('div');wi.className='weather-icon';wi.setAttribute('aria-hidden','true');wi.textContent=icon;const main=document.createElement('div'),temp=document.createElement('div');temp.className='temp';temp.textContent=rounded(c.temperature_2m);const sup=document.createElement('sup');sup.textContent='°F';temp.append(sup);const sm=document.createElement('p');sm.className='weather-summary';sm.textContent=`${summary} · feels like ${rounded(c.apparent_temperature)}°`;main.append(temp,sm);const place=document.createElement('div'),pn=document.createElement('p');pn.className='weather-place';pn.textContent=location.name||'Local position';const detail=document.createElement('p');detail.className='weather-detail';detail.textContent=stale?`Cached ${dateLabel(stale)} · offline`:`Updated ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;place.append(pn,detail);appendAttribution(place);const details=document.createElement('div');details.className='weather-details';const high=rounded(data?.daily?.temperature_2m_max?.[0]),low=rounded(data?.daily?.temperature_2m_min?.[0]),aqi=finiteNumber(airQuality?.current?.us_aqi),aqiValue=aqi===null?'Unavailable':`${Math.round(aqi)} · ${aqiCategory(aqi)}`;for(const [label,value,title] of [['HIGH',`${high}°F`,'Today’s forecast high'],['LOW',`${low}°F`,'Today’s forecast low'],['WIND',`${rounded(c.wind_speed_10m)} km/h`,'Wind speed'],['HUMIDITY',`${rounded(c.relative_humidity_2m)}%`,'Relative humidity'],['US AQI',aqiValue,aqi===null?'US Air Quality Index unavailable':`US Air Quality Index: ${aqiCategory(aqi)}`]]){const d=document.createElement('div'),l=document.createElement('span'),b=document.createElement('b');l.className='card-label';l.textContent=label;b.textContent=value;d.title=title;d.setAttribute('aria-label',`${label}: ${value}. ${title}`);d.append(l,b);details.append(d)}reading.append(wi,main,place,details);$('#weatherContent').replaceChildren(reading)}
const sameLocation=(a,b)=>Boolean(a&&b)&&a.latitude===b.latitude&&a.longitude===b.longitude;
const normalizeLocationGuard=raw=>({resetToken:Number.isSafeInteger(raw?.resetToken)&&raw.resetToken>=0?raw.resetToken:0,resetAt:finiteNumber(raw?.resetAt)??0,selectionEpoch:Number.isSafeInteger(raw?.selectionEpoch)&&raw.selectionEpoch>=0?raw.selectionEpoch:0,selectionId:typeof raw?.selectionId==='string'?raw.selectionId:null});
const readLocationGuard=async()=>normalizeLocationGuard(await get(LOCATION_GUARD_KEY,null));
const selectionMatches=(guard,selection)=>guard.resetToken===selection.resetToken&&guard.selectionId===selection.id;
async function beginLocationSelection(startedAt){return withLocationLock(async()=>{const guard=await readLocationGuard();if(startedAt<=guard.resetAt)return null;const selection={id:crypto.randomUUID(),resetToken:guard.resetToken};await set(LOCATION_GUARD_KEY,{...guard,selectionEpoch:guard.selectionEpoch+1,selectionId:selection.id});return selection})}
async function locationIsCurrent(location,selection){return withLocationLock(async()=>{const [stored,guard]=await Promise.all([get(LOCATION_KEY,null),readLocationGuard()]);return sameLocation(stored,location)&&selectionMatches(guard,selection)})}
async function saveLocation(selection,location){return withLocationLock(async()=>{const guard=await readLocationGuard();if(!selectionMatches(guard,selection))return false;await set(LOCATION_KEY,location);return true})}
async function clearWeatherLocation(){locationSelection++;weatherRequest++;if(activeController)activeController.abort();activeController=null;return withLocationLock(async()=>{const guard=await readLocationGuard(),resetGuard={...guard,resetToken:guard.resetToken+1,resetAt:Date.now(),selectionEpoch:guard.selectionEpoch+1,selectionId:null};await set(LOCATION_GUARD_KEY,resetGuard);await withWeatherLock(()=>store.remove([WEATHER_KEY,LOCATION_KEY]))})}
async function ensureHosts(){return requestPermission({origins:['https://api.open-meteo.com/*','https://geocoding-api.open-meteo.com/*']})}function ensureAirQualityHost(){if(!airQualityPermission){const request=requestPermission({origins:['https://air-quality-api.open-meteo.com/*']});airQualityPermission=request.finally(()=>{airQualityPermission=null})}return airQualityPermission}const hasAirQualityHost=()=>airQualityPermission??new Promise(resolve=>chrome.permissions.contains({origins:['https://air-quality-api.open-meteo.com/*']},resolve));
async function mergeWeatherSibling(key,value,location,selection,token,saved){return withLocationLock(async()=>{if(token!==weatherRequest||!await locationIsCurrentWithoutLock(location,selection))return false;return withWeatherLock(async()=>{const cached=await get(WEATHER_KEY,null);if(cached?.requestId!==saved.requestId||!sameLocation(cached.location,location))return false;await set(WEATHER_KEY,{...cached,[key]:value});if(token===weatherRequest)renderWeather(cached.data,location,false,value);return true})})}
async function fetchAirQuality(location,selection,token,saved,controller){try{if(!await hasAirQualityHost()||token!==weatherRequest)return;const params=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),current:'us_aqi',timezone:'auto'}),response=await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,{signal:controller.signal});if(!response.ok)throw Error();const airQuality=await response.json();if(token!==weatherRequest)return;await mergeWeatherSibling('airQuality',airQuality,location,selection,token,saved)}catch(e){if(e.name!=='AbortError')console.warn('Air-quality data unavailable.',e)}}
async function locationIsCurrentWithoutLock(location,selection){const [stored,guard]=await Promise.all([get(LOCATION_KEY,null),readLocationGuard()]);return sameLocation(stored,location)&&selectionMatches(guard,selection)}
async function persistWeather(location,selection,token,saved){return withLocationLock(async()=>{if(token!==weatherRequest||!await locationIsCurrentWithoutLock(location,selection))return false;await withWeatherLock(()=>set(WEATHER_KEY,saved));if(token!==weatherRequest||!await locationIsCurrentWithoutLock(location,selection))return false;renderWeather(saved.data,location,false,saved.airQuality);return true})}
async function renderCachedWeather(location,selection,token){return withLocationLock(async()=>{if(token!==weatherRequest||!await locationIsCurrentWithoutLock(location,selection))return false;return withWeatherLock(async()=>{const cached=await get(WEATHER_KEY,null);if(!cached?.data||!sameLocation(cached.location,location))return false;renderWeather(cached.data,location,cached.savedAt,cached.airQuality);return true})})}
async function fetchWeather(location,selection){const token=++weatherRequest;if(activeController)activeController.abort();const controller=activeController=new AbortController();showWeatherLoading();try{const params=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min',temperature_unit:'fahrenheit',timezone:'auto'}),response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(token!==weatherRequest)return;const saved={data,location,savedAt:Date.now(),requestId:crypto.randomUUID()};if(!await persistWeather(location,selection,token,saved))return;void fetchAirQuality(location,selection,token,saved,controller)}catch(e){if(e.name==='AbortError'||token!==weatherRequest)return;if(!await renderCachedWeather(location,selection,token)&&await locationIsCurrent(location,selection))showWeatherError('The forecast is unavailable right now.')}}
async function useCoordinates(){const localSelection=++locationSelection,startedAt=Date.now(),status=$('#locationStatus'),selectionPromise=beginLocationSelection(startedAt);status.textContent='';void ensureAirQualityHost();if(!await ensureHosts()){if(localSelection!==locationSelection)return;const selection=await selectionPromise;if(!selection||localSelection!==locationSelection)return;status.textContent='Network access was not granted.';showWeatherError('Network access was not granted. Search again when ready.');return}const selection=await selectionPromise;if(!selection||localSelection!==locationSelection)return;showWeatherLoading();navigator.geolocation.getCurrentPosition(async p=>{if(localSelection!==locationSelection)return;const l={latitude:p.coords.latitude,longitude:p.coords.longitude,name:'Current location'};if(!await saveLocation(selection,l)||localSelection!==locationSelection)return;$('#locationDialog').close();fetchWeather(l,selection)},()=>{if(localSelection!==locationSelection)return;status.textContent='We could not read your location. Search for a city instead.';showWeatherError('We could not read your location. Search for a city instead.')},{timeout:1e4,maximumAge:3e5})}
async function searchCity(){const q=$('#cityInput').value.trim();if(!q)return;const localSelection=++locationSelection,startedAt=Date.now(),selectionPromise=beginLocationSelection(startedAt);$('#locationStatus').textContent='Searching…';void ensureAirQualityHost();try{if(!await ensureHosts())throw Error('permission');const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`),x=await r.json(),p=x.results?.[0],selection=await selectionPromise;if(!selection||localSelection!==locationSelection)return;if(!p)throw Error();const l={latitude:p.latitude,longitude:p.longitude,name:[p.name,p.admin1,p.country_code].filter(Boolean).join(', ')};if(!await saveLocation(selection,l)||localSelection!==locationSelection)return;$('#locationDialog').close();fetchWeather(l,selection)}catch(e){if(localSelection!==locationSelection)return;const selection=await selectionPromise;if(!selection||localSelection!==locationSelection)return;$('#locationStatus').textContent=e.message==='permission'?'Network access was not granted.':'No matching city found. Try a country or region.'}}
function openLocation(){$('#locationStatus').textContent='';$('#locationDialog').showModal();setTimeout(()=>$('#cityInput').focus(),30)}async function resetLocation(){await clearWeatherLocation();$('#settingsDialog').close();showLocationEmpty()}$('#locationButton').addEventListener('click',openLocation);$('#startLocation').addEventListener('click',openLocation);$('#useLocation').addEventListener('click',e=>{e.preventDefault();useCoordinates()});$('#searchLocation').addEventListener('click',openLocation);$('#findCity').addEventListener('click',searchCity);$('#cityInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchCity()}});$('#settingsButton').addEventListener('click',()=>$('#settingsDialog').showModal());$('#resetLocation').addEventListener('click',()=>{void resetLocation()});$('#clearData').addEventListener('click',async()=>{if(confirm('Clear shortcuts, location, weather, Todoist connection, saved tasks, snoozes, and sidebar width from this device?')){await clearWeatherLocation();await queue(async()=>{const previous=await readShortcutModel(),model=emptyShortcutModel(previous.resetToken+1);await set(SHORTCUTS_KEY,model);renderShortcuts(model)});await store.remove([TODOIST_SNOOZE_KEY,SIDEBAR_WIDTH_KEY]);applySidebarWidth(SIDEBAR_WIDTH_DEFAULT);await disconnectTodoist({clearClient:true});$('#settingsDialog').close();showLocationEmpty()}});
for(const dialogId of ['shortcutDialog','sectionDialog'])for(const cancel of document.querySelectorAll(`#${dialogId} .dialog-actions .text-button:not(.danger)`))cancel.addEventListener('click',event=>{event.preventDefault();$(`#${dialogId}`).close()});
for(const dialog of document.querySelectorAll('dialog'))for(const close of dialog.querySelectorAll('.close-button'))close.addEventListener('click',event=>{event.preventDefault();dialog.close()});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (area === 'local' && changes[SIDEBAR_WIDTH_KEY]) {
    shortcutSidebarRevision += 1;
    applySidebarWidth(changes[SIDEBAR_WIDTH_KEY].newValue ?? SIDEBAR_WIDTH_DEFAULT);
  }
  if (area === 'local' && changes[TODOIST_SNOOZE_KEY] && todoistConnected) void renderTodoistTasks();
  if (changes[TODOIST_AUTH_EPOCH_KEY] && changes[TODOIST_AUTH_EPOCH_KEY].newValue !== todoistActiveAuthEpoch) invalidateTodoistTaskLoads(typeof changes[TODOIST_AUTH_EPOCH_KEY].newValue === 'string' ? changes[TODOIST_AUTH_EPOCH_KEY].newValue : null);
  if (changes[TODOIST_TASK_CACHE_KEY]) {
    const cache = changes[TODOIST_TASK_CACHE_KEY].newValue;
    if (!isTodoistTaskCache(cache) || cache.authEpoch !== todoistActiveAuthEpoch) invalidateTodoistTaskLoads(todoistActiveAuthEpoch);
  }
  if (changes[TODOIST_AUTH_KEY]) void (async () => {
    const session = changes[TODOIST_AUTH_KEY].newValue;
    if (!isTodoistSession(session)) {
      resetTodoistUi();
      if (session) await discardMalformedTodoistAuth();
      return;
    }
    if (!todoistConnected || !sameTodoistAccessToken(changes[TODOIST_AUTH_KEY].oldValue, session)) {
      const authEpoch = await ensureTodoistAuthEpoch();
      if (todoistHasTaskSnapshot && todoistTaskSnapshotAuthEpoch === authEpoch) {
        setTodoistConnection(true);
        return;
      }
      invalidateTodoistTaskLoads(authEpoch);
      setTodoistConnection(true);
      const request = todoistTaskRequest;
      const cache = await readTodoistTaskCache(authEpoch);
      if (!todoistTaskLoadIsCurrent(request, authEpoch) || await todoistAuthGet(TODOIST_AUTH_EPOCH_KEY, null) !== authEpoch) return;
      if (cache) {
        todoistTasks = cache.tasks;
        todoistTaskSnapshotSavedAt = cache.savedAt;
        todoistTaskSnapshotAuthEpoch = authEpoch;
        todoistHasTaskSnapshot = true;
        todoistTaskSnapshotPersisted = true;
        todoistTasksConfirmed = false;
        await renderTodoistTasks({ preserveStatus: true });
        setTodoistStatus(`Showing saved tasks from ${formatTodoistCacheTime(cache.savedAt)} · Updating…`, false, true);
      }
      void loadTodoistTasks({ retainCurrentTasks: Boolean(cache) });
    }
  })();
});
(async () => {
  await restrictLocalStorageAccess();
  await loadShortcuts();
  const todoistAuth = await readTodoistSession();
  setTodoistConnection(Boolean(todoistAuth));
  if (todoistAuth) {
    const authEpoch = await ensureTodoistAuthEpoch();
    const request = ++todoistTaskRequest;
    todoistActiveAuthEpoch = authEpoch;
    const cache = await readTodoistTaskCache(authEpoch);
    if (todoistTaskLoadIsCurrent(request, authEpoch) && await todoistAuthGet(TODOIST_AUTH_EPOCH_KEY, null) === authEpoch) {
      if (cache) {
        todoistTasks = cache.tasks;
        todoistTaskSnapshotSavedAt = cache.savedAt;
        todoistTaskSnapshotAuthEpoch = authEpoch;
        todoistHasTaskSnapshot = true;
        todoistTaskSnapshotPersisted = true;
        todoistTasksConfirmed = false;
        await renderTodoistTasks({ preserveStatus: true });
        setTodoistStatus(`Showing saved tasks from ${formatTodoistCacheTime(cache.savedAt)} · Updating…`, false, true);
        void loadTodoistTasks({ retainCurrentTasks: true });
      } else void loadTodoistTasks();
    }
  }
  const l = await get(LOCATION_KEY, null);
  const guard = await readLocationGuard();
  const selection = { id: guard.selectionId, resetToken: guard.resetToken };
  if (l && await locationIsCurrent(l, selection)) {
    const c = await get(WEATHER_KEY, null);
    if (c?.data && sameLocation(c.location, l) && await locationIsCurrent(l, selection)) renderWeather(c.data, l, c.savedAt, c.airQuality);
    fetchWeather(l, selection);
  }
})();
