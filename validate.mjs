import { access, readFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const files = ['manifest.json', 'newtab.html', 'styles.css', 'newtab.js', 'icon.svg', 'README.md', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE', '.gitignore'];
const read = file => readFile(new URL(file, root), 'utf8');
const [manifestText, html, css, js, readme, privacy, notices, license, ignore] = await Promise.all([
  read('manifest.json'), read('newtab.html'), read('styles.css'), read('newtab.js'), read('README.md'), read('PRIVACY.md'), read('THIRD_PARTY_NOTICES.md'), read('LICENSE'), read('.gitignore')
]);
const manifest = JSON.parse(manifestText);

for (const file of files) await access(new URL(file, root));
if (manifest.manifest_version !== 3 || manifest.chrome_url_overrides?.newtab !== 'newtab.html') throw Error('MV3 new-tab override is missing');
if (manifest.icons || manifest.action) throw Error('Manifest references unavailable action/icon assets');
if (!manifest.permissions.includes('storage') || !manifest.permissions.includes('geolocation') || !manifest.permissions.includes('favicon') || !manifest.permissions.includes('identity')) throw Error('Required extension permissions are missing');
if (manifest.permissions.includes('declarativeNetRequest') || manifest.declarative_net_request) throw Error('Unused declarative network rules remain');
for (const host of ['https://api.open-meteo.com/*', 'https://geocoding-api.open-meteo.com/*', 'https://air-quality-api.open-meteo.com/*', 'https://api.todoist.com/*']) if (!manifest.optional_host_permissions.includes(host)) throw Error(`Required optional host missing: ${host}`);
if (manifest.optional_host_permissions.some(host => /pollen/i.test(host))) throw Error('Removed service permission remains');

for (const text of [manifestText, html, css, js, readme, privacy, notices]) if (/pollen|declarativeNetRequest/i.test(text)) throw Error('Removed service residue remains');
try { await access(new URL('pollen-referer-rules.json', root)); throw Error('Removed rules file remains'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

for (const id of ['shortcutDialog', 'sectionDialog', 'locationDialog', 'settingsDialog', 'locationButton', 'resetLocation', 'todoistConnect', 'todoistStatus', 'todoistTasks', 'settingsTodoistConnect', 'todoistDisconnect']) if (!html.includes(`id="${id}"`)) throw Error(`Missing required element: ${id}`);
if (!html.includes('Reset location') || !html.includes('shortcuts, Todoist connection, sidebar, and snoozes stay unchanged')) throw Error('Dedicated location reset scope is not visible');
if (html.includes('<script>') || html.includes('style=')) throw Error('Inline script/style found');
for (const id of ['shortcutGrid', 'addSection', 'shortcutSection', 'deleteShortcut', 'deleteSection']) if (!html.includes(`id="${id}"`)) throw Error(`Missing required element: ${id}`);
if (!html.includes('class="now-panel"')) throw Error('Compact now panel missing');
if (!html.includes('class="dashboard-layout"') || !html.includes('<aside class="shortcuts-panel"')) throw Error('Vertical shortcut sidebar missing');
if (!html.includes('id="shortcutResizer"') || !html.includes('role="separator"')) throw Error('Accessible shortcut sidebar resizer missing');
if (!html.includes('aria-valuemin="165"') || !html.includes('aria-valuemax="340"') || !html.includes('aria-valuenow="195"')) throw Error('Sidebar resizer range missing');
if (html.includes('searchForm') || html.includes('searchInput') || html.includes('What are you looking for?')) throw Error('Removed search section still present');
if (!html.includes('type="text" inputmode="url"') || !html.includes('autocapitalize="off"')) throw Error('Bare-domain URL input regression');
if (!html.includes('id="saveShortcut" type="submit"')) throw Error('Shortcut save must be the submit control');
if (!html.includes('id="saveSection" type="submit"')) throw Error('Section save must be the submit control');
if (!html.includes('+ Add section') || !html.includes('for="shortcutSection"')) throw Error('Section creation or shortcut assignment UI missing');
if (!html.includes('class="close-button" type="button"') || !html.includes('class="text-button" type="button">Cancel')) throw Error('Dialog cancel controls must not submit');
if (!css.includes('.shortcut-section-grid') || !css.includes('repeat(auto-fill, minmax(88px, 1fr))') || !css.includes('.section-empty')) throw Error('Section grid or empty-state styling missing');
if (!css.includes('scrollbar-width: none') || !css.includes('.shortcuts-panel::-webkit-scrollbar')) throw Error('Shortcut sidebar scrollbar hiding missing');
if (!css.includes('--shortcut-sidebar-width') || !css.includes('grid-template-columns: var(--shortcut-sidebar-width)')) throw Error('Resizable sidebar track missing');
if (js.includes("hostname.className = 'shortcut-host'") || js.includes("hostname.textContent")) throw Error('Shortcut host text must not be rendered');
if (css.includes('.shortcut-host')) throw Error('Obsolete shortcut host styling still present');
for (const token of ['background: transparent', 'border: 0', 'flex-direction: column', 'text-align: center', 'text-overflow: ellipsis', 'background: rgba(164, 82, 54, .12)', 'box-shadow: inset 0 0 0 1px', '.shortcut:hover, .shortcut:focus-within', 'outline: 2px solid var(--rust)', '@media (hover: none), (pointer: coarse)', 'opacity: .55', '.shortcut:hover, .shortcut:focus-within { transform: none; }']) if (!css.includes(token)) throw Error(`Shortcut styling missing: ${token}`);
if (css.includes('padding-right: 34px') || css.includes('minmax(130px')) throw Error('Obsolete horizontal shortcut spacing remains');
if (!css.includes('.shortcut.is-dragging') || !css.includes('.shortcut-section-grid.is-drop-target') || !css.includes('.shortcut-section-grid:empty')) throw Error('Shortcut drag/drop state styling missing');

for (const [pattern, label] of [
  [/chrome\.storage\.local/, 'local extension storage'],
  [/navigator\.geolocation/, 'click-triggered geolocation'],
  [/geocoding-api\.open-meteo\.com/, 'city search'],
  [/await set\(LOCATION_KEY,location\)/, 'location persistence'],
  [/const l\s*=\s*await get\(LOCATION_KEY,\s*null\)/, 'location restoration'],
  [/async function clearWeatherLocation\(\)\{locationSelection\+\+;weatherRequest\+\+;/, 'stale location and weather request cancellation'],
  [/activeController\.abort\(\)/, 'active request abort'],
  [/store\.remove\(\[WEATHER_KEY,LOCATION_KEY\]\)/, 'location-only storage removal'],
  [/async function resetLocation\(\)\{await clearWeatherLocation\(\);\$\('#settingsDialog'\)\.close\(\);showLocationEmpty\(\)/, 'dedicated reset behavior'],
  [/function showLocationEmpty\(\)/, 'choose-location empty state'],
  [/link\.href='https:\/\/open-meteo\.com\/'/, 'clickable Open-Meteo attribution'],
  [/AQI · CAMS VIA OPEN-METEO/, 'CAMS AQI attribution'],
  [/void fetchAirQuality\(location,selection,token,saved,controller\)/, 'nonblocking AQI request'],
  [/TODOIST_AUTH_KEY = 'fieldTodoistAuth'/, 'Todoist local auth storage'],
  [/chrome\.identity\.launchWebAuthFlow/, 'Todoist OAuth'],
  [/scope: 'data:read_write'/, 'Todoist task mutation scope'],
  [/\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/close/, 'Todoist completion'],
  [/TODOIST_SNOOZE_KEY = 'fieldTodoistSnoozes'/, 'local Todoist snoozes'],
  [/task\.due\?\.is_recurring/, 'recurring task reschedule guard']
]) if (!pattern.test(js)) throw Error(`Missing behavior: ${label}`);

for (const [pattern, label] of [
  [/const saved=\{data,location,savedAt:Date\.now\(\),requestId:crypto\.randomUUID\(\)\}/, 'weather cache wrapper preserves data and request identity'],
  [/await set\(WEATHER_KEY,\{\.\.\.cached,\[key\]:value\}\)/, 'AQI merges beside weather data'],
  [/renderWeather\(cached\.data,location,false,value\)/, 'AQI refresh rerenders weather'],
  [/repeat\(3, minmax\(0, 1fr\)\)/, 'dense desktop weather detail layout'],
  [/function finiteNumber\(value\)\{if\(value===null\|\|value===undefined\|\|\(typeof value==='string'&&!value\.trim\(\)\)\)return null;const number=Number\(value\);return Number\.isFinite\(number\)\?number:null\}/, 'missing numeric API values do not coerce to zero'],
  [/LOCATION_GUARD_KEY = 'fieldLocationGuard'/, 'persisted location guard key'],
  [/LOCATION_LOCK = 'field-notes-location'/, 'cross-tab location lock'],
  [/WEATHER_LOCK = 'field-notes-weather'/, 'cross-tab weather lock'],
  [/async function beginLocationSelection\(startedAt\)\{return withLocationLock/, 'persisted location selection claim'],
  [/if\(startedAt<=guard\.resetAt\)return null/, 'reset tombstone rejects pending selection'],
  [/resetToken:guard\.resetToken\+1,resetAt:Date\.now\(\)/, 'reset advances persisted tombstone'],
  [/if\(!await saveLocation\(selection,l\)\|\|localSelection!==locationSelection\)return;\$\('#locationDialog'\)\.close\(\);fetchWeather\(l,selection\)/, 'stale location result cannot store, close, or fetch'],
  [/async function persistWeather\(location,selection,token,saved\)\{return withLocationLock/, 'weather persistence verifies location under lock'],
  [/renderWeather\(saved\.data,location,false,saved\.airQuality\)/, 'weather persistence renders AQI immediately'],
  [/locationIsCurrentWithoutLock\(location,selection\)/, 'weather response checks saved location identity'],
  [/cached\?\.requestId!==saved\.requestId\|\|!sameLocation\(cached\.location,location\)/, 'AQI response cannot roll back newer weather cache'],
  [/function ensureAirQualityHost\(\)\{if\(!airQualityPermission\).*?airQualityPermission=null/, 'resolved air permission request is not cached'],
  [/name:\[p\.name,p\.admin1,p\.country_code\]\.filter\(Boolean\)\.join\(', '\)/, 'city display includes admin region'],
  [/@media \(max-width: 1120px\) and \(min-width: 761px\)[\s\S]*?\.weather-reading \{ grid-template-columns: 44px minmax\(120px, 1fr\) minmax\(220px, 1\.4fr\); \}/, 'intermediate width weather layout']
]) if (!pattern.test(js + css)) throw Error(`Weather detail behavior missing: ${label}`);
if (js.includes('renderWeather=')) throw Error('Late renderer monkey patch remains');

for (const [pattern, label] of [
  [/SHORTCUTS_VERSION\s*=\s*2/, 'versioned shortcut model'],
  [/DEFAULT_SECTION_ID\s*=\s*'default'/, 'stable default section'],
  [/normalizeShortcutModel/, 'shortcut model normalization'],
  [/Array\.isArray\(raw\)/, 'legacy array migration'],
  [/needsPersist/, 'safe migration persistence gate'],
  [/readShortcutModel/, 'model read path'],
  [/sectionId:\s*DEFAULT_SECTION_ID/, 'default assignment during import']
]) if (!pattern.test(js)) throw Error(`Shortcut model migration missing: ${label}`);
for (const [pattern, label] of [
  [/SIDEBAR_WIDTH_KEY/, 'sidebar width storage key'],
  [/SIDEBAR_WIDTH_DEFAULT = 195/, 'narrow default sidebar width'],
  [/SIDEBAR_WIDTH_MIN = 165/, 'sidebar minimum width'],
  [/SIDEBAR_WIDTH_MAX = 340/, 'sidebar maximum width'],
  [/chrome\.storage\.local/, 'local sidebar width storage'],
  [/ArrowLeft/, 'keyboard sidebar resize'],
  [/event\.key === 'Home' \? SIDEBAR_WIDTH_MIN : SIDEBAR_WIDTH_MAX/, 'keyboard sidebar range controls'],
  [/SIDEBAR_STACK_BREAKPOINT = 930/, 'responsive sidebar stacking breakpoint'],
  [/SIDEBAR_LAYOUT_RESERVE = 762/, 'main-content width reservation'],
  [/window\.innerWidth - SIDEBAR_LAYOUT_RESERVE/, 'viewport-aware sidebar maximum'],
  [/event\.button !== 0 \|\| !event\.isPrimary/, 'primary pointer resize guard'],
  [/activePointerId !== null/, 'concurrent pointer resize guard'],
  [/event\.pointerId !== activePointerId/, 'active pointer ownership'],
  [/dragStartWidth \+ event\.clientX - dragStartX/, 'jump-free pointer delta resize'],
  [/lostpointercapture/, 'lost pointer capture cleanup'],
  [/shortcutSidebarRevision/, 'initial width load ordering guard'],
  [/pointermove/, 'pointer sidebar resize'],
  [/const finishDrag[\s\S]*?persistSidebarWidth\(shortcutSidebarWidth\)/, 'sidebar width persistence after drag'],
  [/changes\[SIDEBAR_WIDTH_KEY\][\s\S]*?applySidebarWidth/, 'cross-tab sidebar width update'],
  [/dblclick/, 'sidebar width reset'],
  [/meta\.className = 'shortcut-section-meta'[\s\S]*?meta\.append\(count, edit\)/, 'second-line section metadata']
]) if (!pattern.test(js)) throw Error(`Sidebar resize behavior missing: ${label}`);
for (const [pattern, label] of [
  [/openSection/, 'section editor'], [/model\.sections\.push/, 'section creation'], [/section\.name\s*=\s*name/, 'section rename'], [/model\.shortcuts\.forEach/, 'section shortcut move'], [/shortcut\.sectionId\s*===\s*sectionId/, 'section membership check'], [/shortcut\.sectionId\s*=\s*DEFAULT_SECTION_ID/, 'move to default section'], [/model\.sections\s*=\s*model\.sections\.filter/, 'section deletion'], [/refreshShortcutSectionOptions/, 'section selector refresh']
]) if (!pattern.test(js)) throw Error(`Section CRUD or shortcut move behavior missing: ${label}`);
for (const [pattern, label] of [
  [/navigator\.locks\.request\(SHORTCUTS_LOCK,\s*\{\s*mode:\s*'exclusive'\s*\}/, 'exclusive cross-tab shortcut lock'],
  [/shortcutMutation\s*=\s*shortcutMutation\.then\(\(\)\s*=>\s*withShortcutLock\(callback\)/, 'local queue wrapped by cross-tab lock'],
  [/async function loadShortcuts\(\)\s*\{\s*await queue\(/, 'startup migration under lock'],
  [/const shortcutId\s*=\s*editingId/, 'captured shortcut edit id'], [/const sectionId\s*=\s*editingSectionId/, 'captured section edit id'],
  [/function openShortcut[\s\S]*?shortcutUrl'\)\.setCustomValidity\(''\)/, 'shortcut dialog validity reset'],
  [/shortcutUrl'\)\.addEventListener\('input',\s*\(\)\s*=>\s*\$\('#shortcutUrl'\)\.setCustomValidity\(''\)\)/, 'shortcut URL input validity reset'],
  [/const importResetToken\s*=\s*await queue\(async \(\)\s*=>\s*\(await readShortcutModel\(\)\)\.resetToken\)/, 'import reset token capture'],
  [/async function importTopSites\(\)\s*\{\s*const importResetToken[\s\S]*?if\s*\(!await requestPermission/, 'import intent captured before permission prompt'],
  [/model\.resetToken\s*!==\s*importResetToken/, 'stale import reset-token guard'],
  [/emptyShortcutModel\(previous\.resetToken\s*\+\s*1\)/, 'clear data reset-token advance'],
  [/let shortcutDialogSession\s*=\s*0/, 'shortcut dialog session counter'], [/let sectionDialogSession\s*=\s*0/, 'section dialog session counter'],
  [/function openShortcut[\s\S]*?shortcutDialogSession\s*\+=\s*1/, 'shortcut dialog session advance'], [/function openSection[\s\S]*?sectionDialogSession\s*\+=\s*1/, 'section dialog session advance'],
  [/const dialogSession\s*=\s*shortcutDialogSession/, 'captured shortcut dialog session'], [/const dialogSession\s*=\s*sectionDialogSession/, 'captured section dialog session'],
  [/shortcutDialogSession\s*===\s*dialogSession\s*&&\s*\$\('#shortcutDialog'\)\.open/, 'shortcut dialog close guard'], [/sectionDialogSession\s*===\s*dialogSession\s*&&\s*\$\('#sectionDialog'\)\.open/, 'section dialog close guard']
]) if (!pattern.test(js)) throw Error(`Concurrency or dialog safety behavior missing: ${label}`);
for (const [pattern, label] of [
  [/card\.draggable\s*=\s*true/, 'draggable shortcut cards'], [/card\.addEventListener\('dragstart'/, 'shortcut drag start'], [/card\.addEventListener\('dragend',\s*clearShortcutDragState\)/, 'shortcut drag cleanup'], [/grid\.addEventListener\('dragover'/, 'section grid drag target'], [/grid\.addEventListener\('drop'/, 'section grid drop target'], [/targetSectionExists/, 'stale section drop guard'], [/shortcut\.sectionId\s*===\s*section\.id\)\s*return/, 'same-section drop no-op'], [/shortcut\.sectionId\s*=\s*section\.id/, 'locked section move'], [/clearShortcutDragState\(\)/, 'drop visual-state cleanup']
]) if (!pattern.test(js)) throw Error(`Shortcut drag/drop behavior missing: ${label}`);
if (js.includes('shortcut"') && js.includes('<button')) throw Error('Potential nested shortcut button');
if (js.includes("$('#searchForm')") || js.includes("$('#dayPart')")) throw Error('Removed DOM node still referenced by JavaScript');
for (const [pattern, label] of [
  [/todoistAuthStore = chrome\.storage\.local/, 'persistent Todoist auth storage'], [/TODOIST_AUTH_EPOCH_KEY = 'fieldTodoistAuthEpoch'/, 'persistent Todoist auth invalidation epoch'], [/TODOIST_AUTH_ATTEMPT_KEY = 'fieldTodoistAuthAttempt'/, 'OAuth attempt marker preserves the active session until success'], [/setAccessLevel\(\{ accessLevel: 'TRUSTED_CONTEXTS' \}\)/, 'trusted-context local storage restriction'], [/chrome\.identity\.getRedirectURL\('oauth2'\)/, 'Chrome OAuth redirect'], [/code_challenge_method: 'S256'/, 'OAuth PKCE'], [/https:\/\/api\.todoist\.com\/oauth\/register/, 'dynamic public client registration'], [/https:\/\/api\.todoist\.com\/oauth\/access_token/, 'Todoist token exchange'], [/\/tasks\/filter\?\$\{params\}/, 'today task filter'], [/query: 'today', limit: '200'/, 'today filter and bounded page size'], [/while \(cursor\)/, 'Todoist cursor pagination'], [/JSON\.stringify\(\{ due_date: dueDate \}\)/, 'tomorrow mutation allowlist'], [/TODOIST_SNOOZE_MS = 60 \* 60 \* 1000/, 'one-hour local snooze'], [/TODOIST_AUTH_LOCK = 'field-notes-todoist-auth'/, 'cross-tab token refresh lock'], [/withTodoistAuthLock\(\(\) => invalidateTodoistAuthLocked\(/, 'disconnect serializes auth removal'], [/completeTodoistConnect\(authAttempt, session\)/, 'OAuth replacement is committed only after success'], [/if \(error\.todoistCredentialsInvalid\) await invalidateTodoistAuthLocked\(latest\)/, 'definitively rejected refresh removes credentials'], [/if \(!isTodoistSession\(session\)\)/, 'malformed Todoist credentials are rejected'], [/TODOIST_SNOOZE_LOCK = 'field-notes-todoist-snooze'/, 'cross-tab snooze lock'], [/latest\.accessToken !== session\?\.accessToken/, 'rotated token preservation'], [/resource_types: '\["user"\]'/, 'Todoist account timezone lookup'], [/payload\?\.user\?\.tz_info\?\.timezone/, 'Todoist account timezone use'], [/changes\[TODOIST_SNOOZE_KEY\] && todoistConnected/, 'cross-tab snooze refresh'], [/changes\[TODOIST_AUTH_KEY\]/, 'cross-tab Todoist auth change'], [/changes\[TODOIST_AUTH_EPOCH_KEY\][\s\S]*?invalidateTodoistTaskLoads\(/, 'cross-tab Todoist auth replacement clears rows before reload'], [/const todoistApiPriority = task => \{[\s\S]*?priority >= 1 && priority <= 4 \? priority : 1;/, 'invalid Todoist priorities fall back to API P4'], [/visible\.filter\(task => todoistApiPriority\(task\) === priority\)/, 'Todoist groups use normalized API priorities'], [/const groups = \[\s*\[4, 'P1 · Must do'\],\s*\[3, 'P2 · Should do'\],\s*\[2, 'P3 · Do when you have time'\],\s*\[1, 'P4 · Optional'\]\s*\];/, 'Todoist API priority mapping and user-facing order'], [/heading\.textContent = `\$\{label\} · \$\{tasks\.length\} task\$\{tasks\.length === 1 \? '' : 's'\}`;/, 'Todoist priority label count grammar']
]) if (!pattern.test(js)) throw Error(`Todoist behavior missing: ${label}`);
for (const [pattern, label] of [
  [/TODOIST_TASK_CACHE_KEY = 'fieldTodoistTodayCache'/, 'Todoist Today cache storage key'],
  [/const todoistTaskForCache = task => \(\{[\s\S]*?id:[\s\S]*?content:[\s\S]*?priority:[\s\S]*?due:[\s\S]*?\}\);/, 'Todoist cache task field allowlist'],
  [/Object\.keys\(task\)\.every\(key => \['id', 'content', 'priority', 'due'\]\.includes\(key\)\)/, 'Todoist cache rejects unexpected task fields'],
  [/Object\.keys\(task\.due\)\.every\(key => \['date', 'is_recurring'\]\.includes\(key\)\)/, 'Todoist cache rejects unexpected due fields'],
  [/Object\.keys\(cache\)\.every\(key => \['tasks', 'savedAt', 'authEpoch'\]\.includes\(key\)\)/, 'Todoist cache rejects unexpected root fields'],
  [/const isTodoistTaskCache = cache => Boolean\(cache[\s\S]*?cache\.tasks\.every\(isTodoistCachedTask\)[\s\S]*?Number\.isFinite\(cache\.savedAt\)[\s\S]*?typeof cache\.authEpoch === 'string'/, 'validated Todoist cache schema'],
  [/cache\.authEpoch === authEpoch/, 'Todoist cache is bound to the auth epoch'],
  [/const cache = \{ tasks: tasks\.map\(todoistTaskForCache\)\.filter\(isTodoistCachedTask\), savedAt: Date\.now\(\), authEpoch \};[\s\S]*?todoistAuthSet\(TODOIST_TASK_CACHE_KEY, cache\)/, 'Todoist refresh stores only allowlisted task fields without credentials'],
  [/remove\(clearClient \? \[TODOIST_AUTH_KEY, TODOIST_CLIENT_KEY, TODOIST_AUTH_ATTEMPT_KEY, TODOIST_TASK_CACHE_KEY\] : \[TODOIST_AUTH_KEY, TODOIST_AUTH_ATTEMPT_KEY, TODOIST_TASK_CACHE_KEY\]\)/, 'Todoist disconnect clears the task cache'],
  [/async function beginTodoistConnect\(\)[\s\S]*?todoistAuthSet\(TODOIST_AUTH_ATTEMPT_KEY, attempt\)[\s\S]*?return attempt;/, 'reconnect keeps the current cache and epoch until authorization succeeds'],
  [/async function completeTodoistConnect\(attempt, session\)[\s\S]*?todoistAuthSet\(TODOIST_AUTH_EPOCH_KEY, authEpoch\)[\s\S]*?remove\(\[TODOIST_AUTH_ATTEMPT_KEY, TODOIST_TASK_CACHE_KEY\]\)[\s\S]*?todoistAuthSet\(TODOIST_AUTH_KEY, session\)/, 'successful replacement rotates the epoch before storing the new session'],
  [/const request = \+\+todoistTaskRequest;[\s\S]*?todoistActiveAuthEpoch = authEpoch;[\s\S]*?const cache = await readTodoistTaskCache\(authEpoch\);[\s\S]*?todoistTaskLoadIsCurrent\(request, authEpoch\)[\s\S]*?todoistAuthGet\(TODOIST_AUTH_EPOCH_KEY, null\) === authEpoch[\s\S]*?todoistTasks = cache\.tasks;[\s\S]*?void loadTodoistTasks\(\{ retainCurrentTasks: true \}\)/, 'cached tasks render before the guarded unawaited startup refresh'],
  [/async function writeTodoistTaskCache\(tasks, authEpoch, request\) \{[\s\S]*?if \(!Array\.isArray\(tasks\) \|\| !todoistTaskLoadIsCurrent\(request, authEpoch\) \|\| await todoistAuthGet\(TODOIST_AUTH_EPOCH_KEY, null\) !== authEpoch \|\| !isTodoistSession\(session\)\) return null;[\s\S]*?try \{[\s\S]*?todoistAuthSet\(TODOIST_TASK_CACHE_KEY, cache\);[\s\S]*?return \{ cache, persisted: true \};[\s\S]*?\} catch \{[\s\S]*?console\.warn\('Todoist task cache could not be saved\.'\);[\s\S]*?return \{ cache, persisted: false \};/, 'Todoist cache write failure is logged and does not bypass auth or epoch validation'],
  [/const cacheResult = await writeTodoistTaskCache\(tasks, authEpoch, request\);[\s\S]*?if \(!cacheResult \|\| !todoistTaskLoadIsCurrent\(request, authEpoch\)\) return;[\s\S]*?const \{ cache, persisted \} = cacheResult;[\s\S]*?todoistTasks = tasks;[\s\S]*?todoistTaskSnapshotSavedAt = cache\.savedAt;[\s\S]*?todoistHasTaskSnapshot = true;[\s\S]*?todoistTaskSnapshotPersisted = persisted;[\s\S]*?todoistTasksConfirmed = true;[\s\S]*?setTodoistStatus\(`Updated just now · \$\{visible\.length\} task/, 'live Todoist tasks render and confirm even when their cache was not persisted'],
  [/if \(retainCurrentTasks && todoistHasTaskSnapshot && todoistTaskSnapshotAuthEpoch === authEpoch\) \{[\s\S]*?todoistTasksConfirmed = false;[\s\S]*?const source = todoistTaskSnapshotPersisted \? 'saved' : 'last fetched';[\s\S]*?setTodoistStatus\(`Showing \$\{source\} tasks from \$\{formatTodoistCacheTime\(todoistTaskSnapshotSavedAt\)\} · Updating…`, false, true\);[\s\S]*?renderTodoistTasks\(\{ preserveStatus: true, isCurrent: renderIsCurrent \}\)/, 'refresh makes retained tasks read-only and distinguishes persisted from in-memory data'],
  [/const todoistTaskLoadIsCurrent = \(request, authEpoch\) => request === todoistTaskRequest && authEpoch === todoistActiveAuthEpoch/, 'task responses are gated by request generation and auth epoch'],
  [/let todoistTasksConfirmed = false;/, 'Todoist task confirmation state starts read-only'],
  [/function clearTodoistTaskSnapshot\(\) \{[\s\S]*?todoistHasTaskSnapshot = false;[\s\S]*?todoistTaskSnapshotPersisted = false;[\s\S]*?todoistTasksConfirmed = false;/, 'Todoist invalidation and reset clear task confirmation and persistence'],
  [/todoistTasks = cache\.tasks;[\s\S]*?todoistHasTaskSnapshot = true;[\s\S]*?todoistTasksConfirmed = false;/, 'adopted Todoist cache stays read-only until live confirmation'],
  [/todoistTasks = tasks;[\s\S]*?todoistHasTaskSnapshot = true;[\s\S]*?todoistTaskSnapshotPersisted = persisted;[\s\S]*?todoistTasksConfirmed = true;/, 'current live Todoist load confirms task actions while tracking persistence'],
  [/async function connectTodoist\(\)[\s\S]*?const source = todoistTaskSnapshotPersisted \? 'saved' : 'last fetched';[\s\S]*?setTodoistStatus\(`Showing \$\{source\} tasks from \$\{formatTodoistCacheTime\(todoistTaskSnapshotSavedAt\)\} · Sign-in failed\.\`\)/, 'reconnect failure labels persisted versus last-fetched tasks accurately'],
  [/const source = todoistTaskSnapshotPersisted \? 'saved' : 'last fetched';[\s\S]*?setTodoistStatus\(`Showing \$\{source\} tasks\$\{savedAt\} · Update failed\.`\)/, 'failed refresh labels unsaved in-memory tasks accurately'],
  [/if \(!todoistTasksConfirmed\) \{[\s\S]*?complete\.disabled = true;[\s\S]*?complete\.setAttribute\('aria-label', `Complete \$\{task\.content\}\. \$\{reason\}`\);[\s\S]*?tomorrow\.disabled = true;[\s\S]*?tomorrow\.setAttribute\('aria-label', `Move \$\{task\.content\} to tomorrow\. \$\{reason\}`\);/, 'unconfirmed Todoist writes are disabled with accessible explanations'],
  [/async function mutateTodoistTask\(task, action\) \{\s*if \(!todoistTasksConfirmed && \(action === 'complete' \|\| action === 'tomorrow'\)\) return;/, 'unconfirmed Todoist writes are blocked outside the UI while local snooze remains available'],
  [/async function visibleTodoistTasks\(tasks, isCurrent\) \{[\s\S]*?const knownIds = new Set\(tasks\.map\(task => String\(task\.id\)\)\);[\s\S]*?const visible = tasks\.filter\(task => \{[\s\S]*?if \(changed\) \{[\s\S]*?withTodoistAuthLock\(async \(\) => \{[\s\S]*?if \(!await isCurrent\(\)\) return false;[\s\S]*?await set\(TODOIST_SNOOZE_KEY, snoozes\);[\s\S]*?if \(!saved\) return null;/, 'Todoist snooze cleanup uses the render task snapshot and rechecks current auth before writing'],
  [/async function renderTodoistTasks\(\{ preserveStatus = false, isCurrent = null \} = \{\}\) \{[\s\S]*?const tasks = todoistTasks\.slice\(\);[\s\S]*?const request = todoistTaskRequest;[\s\S]*?const authEpoch = todoistActiveAuthEpoch;[\s\S]*?const renderIsCurrent = isCurrent \|\| \(\(\) => todoistTaskRenderIsCurrent\(request, authEpoch\)\);[\s\S]*?const result = await visibleTodoistTasks\(tasks, renderIsCurrent\);[\s\S]*?if \(!result \|\| !await renderIsCurrent\(\)\) return null;[\s\S]*?container\.replaceChildren\(\);/, 'Todoist task DOM and snooze cleanup commit only for the captured current render'],
  [/const todoistTaskRenderIsCurrent = async \(request, authEpoch\) => todoistTaskLoadIsCurrent\(request, authEpoch\) && await todoistAuthGet\(TODOIST_AUTH_EPOCH_KEY, null\) === authEpoch;/, 'Todoist render guards validate request generation and persisted auth epoch'],
  [/const renderIsCurrent = \(\) => todoistTaskRenderIsCurrent\(request, authEpoch\);[\s\S]*?const rendered = await renderTodoistTasks\(\{ preserveStatus: true, isCurrent: renderIsCurrent \}\);[\s\S]*?if \(!rendered \|\| !await renderIsCurrent\(\)\) return;[\s\S]*?setTodoistStatus\(`Updated just now/, 'Todoist success status rechecks request and stored epoch after rendering'],
  [/if \(!todoistTaskLoadIsCurrent\(request, authEpoch\) \|\| await todoistAuthGet\(TODOIST_AUTH_EPOCH_KEY, null\) !== authEpoch\)/, 'stale task failures cannot change the new account view'],
  [/changes\[TODOIST_AUTH_EPOCH_KEY\][\s\S]*?invalidateTodoistTaskLoads\(/, 'epoch storage changes immediately clear stale tasks'],
  [/changes\[TODOIST_AUTH_EPOCH_KEY\][\s\S]*?invalidateTodoistTaskLoads\(/, 'auth replacement immediately clears rows when its epoch changes'],
  [/todoistHasTaskSnapshot && todoistTaskSnapshotAuthEpoch === authEpoch[\s\S]*?setTodoistConnection\(true\);[\s\S]*?return;/, 'same-epoch token refresh preserves the current account snapshot'],
  [/const cache = await readTodoistTaskCache\(authEpoch\);[\s\S]*?todoistTasks = cache\.tasks;[\s\S]*?void loadTodoistTasks\(\{ retainCurrentTasks: Boolean\(cache\) \}\)/, 'same-epoch token refresh during startup adopts the saved snapshot'],
  [/const request = todoistTaskRequest;\s*const renderIsCurrent = \(\) => todoistTaskRenderIsCurrent\(request, authEpoch\);\s*const cache = await readTodoistTaskCache\(authEpoch\);\s*if \(!todoistTaskLoadIsCurrent\(request, authEpoch\) \|\| await todoistAuthGet\(TODOIST_AUTH_EPOCH_KEY, null\) !== authEpoch\) return;\s*if \(cache\) \{\s*todoistTasks = cache\.tasks;/, 'stale auth storage handlers cannot adopt a cache after the epoch changes'],
  [/const request = todoistTaskRequest;\s*const renderIsCurrent = \(\) => todoistTaskRenderIsCurrent\(request, authEpoch\);[\s\S]*?const rendered = await renderTodoistTasks\(\{ preserveStatus: true, isCurrent: renderIsCurrent \}\);\s*if \(!rendered \|\| !await renderIsCurrent\(\)\) return;\s*setTodoistStatus\(`Showing saved tasks/, 'auth storage cache adoption cannot commit stale tasks or status'],
  [/const request = \+\+todoistTaskRequest;\s*todoistActiveAuthEpoch = authEpoch;\s*const renderIsCurrent = \(\) => todoistTaskRenderIsCurrent\(request, authEpoch\);[\s\S]*?const rendered = await renderTodoistTasks\(\{ preserveStatus: true, isCurrent: renderIsCurrent \}\);\s*if \(rendered && await renderIsCurrent\(\)\) \{\s*setTodoistStatus\(`Showing saved tasks/, 'startup cache adoption cannot commit stale tasks or status'],
  [/changes\[TODOIST_TASK_CACHE_KEY\][\s\S]*?cache\.authEpoch !== todoistActiveAuthEpoch\) invalidateTodoistTaskLoads\(/, 'cache storage changes reject the wrong account cache'],
  [/\.todoist-status\.is-updating::before[\s\S]*?border-right-color: transparent/, 'subtle Todoist refresh indicator'],
  [/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.todoist-status\.is-updating::before \{ animation: none; \}/, 'Todoist refresh indicator respects reduced motion']
]) if (!pattern.test(js + css)) throw Error(`Todoist cache behavior missing: ${label}`);
const todoistSpinnerIndex = css.indexOf('.todoist-status.is-updating::before {');
const reducedMotionIndex = css.indexOf('@media (prefers-reduced-motion: reduce)', todoistSpinnerIndex);
if (todoistSpinnerIndex < 0 || reducedMotionIndex < 0 || reducedMotionIndex < todoistSpinnerIndex) throw Error('Reduced-motion override must follow the Todoist spinner rule');
for (const [pattern, label] of [
  [/\.dashboard-layout \{[\s\S]*?grid-template-columns: var\(--shortcut-sidebar-width\)/, 'desktop sidebar layout'], [/\.shortcuts-panel \.shortcut-section-grid \{ gap: 0; grid-template-columns: 1fr;/, 'single-column shortcut sections'], [/\.todoist-tasks \{ display: grid;/, 'stacked task groups'], [/\.todoist-group-list \{ display: grid;/, 'stacked task rows'], [/\.todoist-task \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto auto;/, 'dense full-width task row']
]) if (!pattern.test(css)) throw Error(`Todoist layout missing: ${label}`);

const expectedIgnore = ['/_metadata/', '/work/', '.DS_Store', '*.zip', '/.chrome-profile/', '/chrome-profile-*/', '/test-profile-*/'];
const actualIgnore = ignore.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
if (JSON.stringify(actualIgnore) !== JSON.stringify(expectedIgnore)) throw Error('Public repository ignore rules changed unexpectedly');
if (!license.includes('MIT License') || !license.includes('Copyright (c) 2026 Josh Saint Jacque')) throw Error('MIT license is incomplete');
for (const token of ['Open-Meteo', 'CAMS', 'CC BY 4.0', 'non-commercial', 'rate limited']) if (!notices.includes(token)) throw Error(`Third-party notice missing: ${token}`);
for (const token of ['chrome.storage.local', 'Todoist', 'saved Today tasks', 'OAuth tokens', 'Open-Meteo', 'topSites', 'Reset location', 'Disconnect Todoist', 'Clear local data', 'Limited Use', 'analytics']) if (!privacy.includes(token)) throw Error(`Privacy policy missing: ${token}`);
for (const token of ['dependency-free', 'Reset location', 'saves the last confirmed Today response', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'MIT License']) if (!readme.includes(token)) throw Error(`README missing: ${token}`);
if (js.includes('innerHTML')) throw Error('Dynamic innerHTML found');
if (/client_secret|todoist[^\n]{0,30}(api[_-]?token|bearer\s+[a-z0-9_-]{12,})/i.test(js + html + manifestText)) throw Error('A Todoist secret appears to be hardcoded');

console.log(`Validated ${files.length} release files: MV3 permissions, no removed-service residue, location save/restore/reset, weather attribution, Todoist cache behavior, documentation, and license.`);
