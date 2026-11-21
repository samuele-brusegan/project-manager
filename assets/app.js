/* Project Hub */

document.head.insertAdjacentHTML('beforeend', '<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">');

let projects = [], currentUser = null, registerMode = false, currentView = 'overview',
    computers = [], githubPreviewUrl = '', csrfToken = '';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '#';
const PRIORITY = {low:'Bassa', medium:'Media', high:'Alta'};

async function api(action, data) {
  const headers = {'Content-Type':'application/json'};
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const r = await fetch('?api=' + encodeURIComponent(action), {
    method: data ? 'POST' : 'GET', headers,
    body: data ? JSON.stringify(data) : undefined
  });
  const x = await r.json();
  if (x.csrf && x.error) csrfToken = '';
  if (!r.ok || x.error) throw new Error(x.error || 'Richiesta non riuscita');
  if (x.csrf) csrfToken = x.csrf;
  return x;
}

function initials(n) {
  return (n || '').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() || '–';
}

function notice(message, error = false) {
  let n = $('#notice');
  if (!n) { n = document.createElement('div'); n.id = 'notice'; n.setAttribute('role','status'); document.body.append(n); }
  n.textContent = message;
  n.className = error ? 'error show' : 'show';
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => n.className = '', 3500);
}

/* ---------- tempo ---------- */
function isoToday() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function isoAfter(days) {
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days);
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function parseDate(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T') + (String(v).includes('T') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d;
}
function relTime(v) {
  const d = parseDate(v); if (!d) return '—';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 120) return 'ora';
  if (s < 3600) return Math.floor(s/60) + ' min fa';
  if (s < 86400) return Math.floor(s/3600) + ' h fa';
  const days = Math.floor(s/86400);
  if (days < 30) return days + ' g fa';
  return d.toLocaleDateString('it-IT', {day:'numeric', month:'short'});
}
function fmtDate(v) {
  const d = parseDate(v);
  return d ? d.toLocaleDateString('it-IT', {day:'numeric', month:'short', year:'numeric'}) : '—';
}
function daysSince(v) {
  const d = parseDate(v);
  return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null;
}


/* ---------- stati ---------- */
function stampFor(p) {
  const rot = 'stamp-rot-' + (p.id % 3 + 1);
  const age = daysSince(p.updated_at || p.commit_date);
  if (p.status === 'completed') return `<span class="stamp g ${rot}">completato</span>`;
  if (p.status === 'paused') return `<span class="stamp n ${rot}">in pausa</span>`;
  if (age !== null && age >= 30) return `<span class="stamp a ${rot}">inattivo ${age} g</span>`;
  return `<span class="stamp b ${rot}">attivo</span>`;
}
function routeFor(p) {
  const origin = (p.locations || [])[0];
  const src = origin ? (origin.computer || 'macchina') : '—';
  let dst = p.provider || '—';
  try { if (p.repo_url) dst = new URL(p.repo_url).hostname; } catch(e) {}
  return `<span class="route"><b>${esc(src)}</b><span class="seg">→</span><b>${esc(dst)}</b></span>`;
}
function waybillNo(p) {
  return 'n. ' + String(p.id).padStart(4, '0');
}
function taskDue(t) {
  if (!t.due_date) return '';
  const today = isoToday();
  const label = t.due_date < today ? 'Scaduto'
    : t.due_date === today ? 'Oggi'
    : new Date(t.due_date + 'T12:00:00').toLocaleDateString('it-IT', {day:'numeric', month:'short'});
  return `<small class="task-due ${t.due_date < today && !+t.done ? 'overdue' : ''}">${esc(label)}</small>`;
}
function faviconMarkup(link) {
  let host = '';
  try { host = new URL(link.url).hostname; } catch(e) {}
  const direct = link.favicon_url || 'assets/favicon.svg';
  const fallback = host ? 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(host) + '.ico' : 'assets/favicon.svg';
  return `<img class="project-link-favicon" src="${esc(direct)}" data-fallback="${esc(fallback)}" alt="" loading="lazy" onerror="this.onerror=null;this.src=this.dataset.fallback">`;
}

/* ---------- sessione ---------- */
async function start() {
  try {
    const x = await api('session');
    csrfToken = x.csrf || '';
    if (x.user) { currentUser = x.user; showApp(); await load(); }
    else showLogin();
  } catch(e) { notice(e.message, true); }
}
function showLogin() {
  $('#loginScreen').hidden = false;
  $('#loginScreen').style.display = 'grid';
  document.body.classList.add('logged-out');
}
function showApp() {
  document.body.classList.remove('logged-out');
  $('#loginScreen').hidden = true;
  $('#loginScreen').style.display = 'none';
  const n = currentUser.name;
  $('#sideName').textContent = n;

  $('#sideAvatar').textContent = initials(n);
  $('#headerAvatar').textContent = initials(n);
}
async function load() {
  $('#projectGrid').innerHTML = '<div class="manifest"><div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div></div>';
  projects = await api('list');
  try { computers = await api('computers'); } catch(e) { computers = []; }
  render();
  refreshNotifications();
}

/* ---------- project ordering ---------- */
let sortKey = 'stamp', sortDir = -1;
function sortList(list) {
  const val = p => sortKey === 'name' ? (p.name||'').toLowerCase()
    : sortKey === 'colli' ? (p.tasks||[]).filter(t=>!+t.done).length
    : (parseDate(p.commit_date || p.updated_at)?.getTime() || 0);
  return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sortDir);
}


let mapMachine = 0;
function renderMap() {
  const host = $('#projectGrid');
  const nodes = new Map(computers.map(c => [+c.id, c.name]));
  for (const p of projects) {
    for (const l of p.locations || []) if (l.computer_id) nodes.set(+l.computer_id, l.computer || 'Computer');
  }
  if (mapMachine && !nodes.has(mapMachine)) mapMachine = 0;
  const available = [...nodes].sort((a,b) => a[1].localeCompare(b[1]));
  const right = available.filter(([id]) => !mapMachine || id === mapMachine);
  const left = projects.map(p => ({...p, edges:[...new Set((p.locations || []).map(l => +l.computer_id))].filter(id => nodes.has(id) && (!mapMachine || id === mapMachine))})).filter(p => !mapMachine || p.edges.length);
  const graphNodes = [
    ...left.map(p => ({key:'project-' + p.id, id:p.id, name:p.name, type:'project'})),
    ...right.map(([id,name]) => ({key:'machine-' + id, id, name, type:'machine'}))
  ];
  const graphLinks = left.flatMap(p => p.edges.map(id => ['project-' + p.id, 'machine-' + id]));
  host.innerHTML = `<div class="map-intro"><label>Macchina <select id="mapMachine"><option value="0">Tutte le macchine</option>${available.map(([id,name]) => `<option value="${id}" ${id === mapMachine ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><button type="button" class="secondary" onclick="addComputer()">${hubIcon('plus')} Registra computer</button></div>
    <div class="map-legend"><span>${hubIcon('folder')} Progetti · ${left.length}</span><span>${hubIcon('machine')} Macchine · ${right.length}</span></div>
    ${graphNodes.length ? `<div class="force-map">
      <div id="graphViewport" class="graph-viewport" role="group" aria-label="Grafo dei progetti e delle macchine"></div>
      <div class="graph-controls" role="group" aria-label="Zoom e posizione">
        <button type="button" data-graph-action="out" aria-label="Riduci zoom" title="Riduci zoom">−</button>
        <button type="button" data-graph-action="fit">Centra</button>
        <button type="button" data-graph-action="in" aria-label="Aumenta zoom" title="Aumenta zoom">+</button>
      </div>
    </div>` : '<p class="hub-empty">Associa un percorso a un progetto per costruire la mappa.</p>'}
    <details class="map-list" ${mapMachine ? 'open' : ''}><summary>Percorsi e gestione computer</summary><div id="mapComputers"></div></details>`;
  $('#mapMachine').onchange = e => selectMachine(+e.target.value);
  if (graphNodes.length) {
    mountForceGraph($('#graphViewport'), graphNodes, graphLinks, node => {
      if (node.type === 'project') detail(node.id);
      else selectMachine(node.id === mapMachine ? 0 : node.id);
    });
  }
  renderComputers($('#mapComputers'), mapMachine);
  if (mapMachine && !computers.some(c => +c.id === mapMachine)) {
    $('#mapComputers').innerHTML = left.map(p => `<div class="resume-row"><button onclick="detail(${p.id})">${esc(p.name)}</button><span class="mono">${p.locations.filter(l => +l.computer_id === mapMachine).map(l => esc(l.folder)).join('<br>')}</span></div>`).join('');
  }
}
function selectMachine(id) {
  mapMachine = id;
  renderMap();
  $('#mapMachine').focus();
}
function renderComputers(host, selected = 0) {
  const visible = computers.filter(c => !selected || +c.id === selected);
  const moorings = c => projects.flatMap(p => (p.locations || [])
    .filter(l => +l.computer_id === +c.id).map(l => ({p, l})));
  host.innerHTML = `<div class="computer-toolbar"><span>Cartelle associate alle tue macchine</span><button type="button" class="secondary" onclick="addComputer()">Registra computer</button></div>` +
    (visible.length
      ? '<div class="computers-grid">' + visible.map(c => {
          const m = moorings(c);
          return `<article class="computer-card"><span class="port-tag ${m.length ? '' : 'stale'}">${m.length ? 'in uso' : 'libero'}</span>
            <h3>${esc(c.name)}</h3>
            ${m.length ? '<ul class="port-ormeggi">' + m.map(({p, l}) => `<li><button type="button" class="port-link" onclick="detail(${p.id})">${esc(p.name)}</button><span class="mono">${esc(l.folder)}</span></li>`).join('') + '</ul>'
                       : '<p>Nessun progetto associato.</p>'}
            <div class="port-actions"><button type="button" class="secondary" onclick="moorToPort(${c.id})">Associa progetto</button><button type="button" class="port-remove" aria-label="Rimuovi ${esc(c.name)}" onclick="removeComputer(${c.id})">×</button></div>
          </article>`;
        }).join('') + '</div>'
      : '<div class="empty"><svg class="empty-mark" viewBox="0 0 48 48"><rect x="6" y="14" width="36" height="20" rx="2"/><path d="M14 40h20M24 34v6"/></svg><h3>Nessun computer registrato</h3><p>Una macchina è un PC o server dove vivono i tuoi progetti. Registrala, poi associ i percorsi locali.</p><button type="button" class="primary" onclick="addComputer()">＋ Registra la prima macchina</button></div>');
}
async function moorToPort(cid) {
  const writable = projects.filter(p => ['owner','editor'].includes(p.member_role));
  if (!writable.length) return notice('Nessun progetto su cui hai diritto di scrittura', true);
  const v = await uiPrompt({title:'Associa un progetto', message:'Associa una cartella locale di questa macchina a un progetto.', fields:[
    {name:'project', label:'Progetto', type:'select', options:writable.map(p => [p.id, p.name])},
    {name:'folder', label:'Percorso cartella', placeholder:'/percorso/della/repo', required:true}]});
  if (!v) return;
  try { await api('location', {project_id: +v.project, computer_id: cid, folder: v.folder.trim()}); await load(); notice('Progetto associato'); }
  catch(e) { notice(e.message, true); }
}

/* ---------- dettaglio progetto ---------- */
function projectLinkRows(p) {
  const canEdit = ['owner','editor'].includes(p.member_role);
  return (p.links || []).map(l =>
    `<div class="project-link-row"><a class="project-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${faviconMarkup(l)}<span><b>${esc(l.label || l.url)}</b><small>${esc(l.url)}</small></span></a>${canEdit ? `<button type="button" class="remove-project-link" aria-label="Rimuovi link" onclick="removeProjectLink(${l.id},${p.id})">×</button>` : ''}</div>`).join('');
}
function taskRow(t, pid) {
  const canEdit = ['owner','editor'].includes(projects.find(p => p.id === pid)?.member_role);
  return `<div class="task-row"><label class="detail-task ${+t.done ? 'is-done' : ''}"><input type="checkbox" ${+t.done ? 'checked' : ''} ${canEdit ? '' : 'disabled'} onchange="toggleTask(${t.id},${pid},this.checked)"><span>${esc(t.title)}<small class="task-priority ${esc(t.priority||'medium')}">${PRIORITY[t.priority]||'Media'}</small>${taskDue(t)}</span></label>
  ${canEdit ? `<span class="task-actions"><button type="button" aria-label="Modifica task" onclick="editTask(${t.id},${pid})">✎</button><button type="button" aria-label="Elimina task" onclick="deleteTask(${t.id},${pid})">×</button></span>` : ''}</div>`;
}
function detail(id) {
  $('#accountPage').classList.remove('open');
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const tasks = p.tasks || [], locations = p.locations || [];
  const canEdit = ['owner','editor'].includes(p.member_role);
  const reveal = (label, inner) => canEdit
    ? `<button type="button" class="add-reveal" onclick="this.hidden=true;this.nextElementSibling.hidden=false;this.nextElementSibling.querySelector('input,select')?.focus()">${label}</button><div class="add-line" hidden>${inner}</div>`
    : '';
  $('#detail').innerHTML = `
    <div class="detail-head"><div><h1>${esc(p.name)}</h1></div>${canEdit ? `<div class="detail-actions">${p.member_role === 'owner' ? `<button type="button" class="secondary" onclick="shareProject(${p.id})">Condividi</button>` : ''}<button type="button" class="secondary" onclick="editProject(${p.id})">Modifica progetto</button>${p.member_role === 'owner' ? `<button type="button" class="danger" onclick="deleteProject(${p.id})">Elimina</button>` : ''}</div>` : ''}</div>
    <div class="detail-route">${stampFor(p)}<span class="detail-role">${({owner:'Proprietario',editor:'Editor',viewer:'Visualizzatore'})[p.member_role] || ''}</span></div>
    ${p.description ? `<p class="detail-desc">${esc(p.description)}</p>` : ''}
    <div class="project-layout"><div class="detail-section detail-tasks"><h3>Task · ${tasks.filter(t => !+t.done).length} da completare</h3>
      ${canEdit ? `<div class="add-line quick-task"><input id="newTask" placeholder="Scrivi un nuovo task…" aria-label="Nuovo task"><select id="newTaskPriority" aria-label="Priorità"><option value="medium">Media</option><option value="high">Alta</option><option value="low">Bassa</option></select><input id="newTaskDue" type="date" aria-label="Scadenza"><button type="button" onclick="addTask(${p.id})">Aggiungi</button></div>` : ''}
      ${[...tasks].sort((a,b) => +a.done - +b.done || (a.due_date || '9999').localeCompare(b.due_date || '9999')).map(t => taskRow(t, p.id)).join('') || '<p class="sub">Nessun task. Aggiungine uno per iniziare.</p>'}</div>
    <div class="project-resources"><div class="detail-section"><h3>Percorsi e repository</h3>
      ${locations.map(l => `<div class="location"><span><b>${esc(l.computer || 'Porto')}</b></span><span class="mono">${esc(l.folder)}</span><span>${canEdit ? `<button type="button" aria-label="Modifica percorso" onclick="editLocation(${l.id},${p.id})">✎</button><button type="button" aria-label="Rimuovi percorso" onclick="removeLocation(${l.id},${p.id})">×</button>` : ''}</span></div>`).join('') || '<p class="sub">Nessun percorso locale associato.</p>'}
      ${reveal('＋ Associa un percorso', `<select id="locationComputer" aria-label="Macchina">${computers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><input id="newFolder" placeholder="/percorso/della/repo"><button type="button" aria-label="Aggiungi percorso" onclick="addLocation(${p.id})">＋</button>`)}
      ${canEdit && !computers.length ? `<button type="button" class="text-button" onclick="addComputer()">Registra prima una macchina →</button>` : ''}
      ${p.repo_url || locations.length ? `<div class="detail-repo">${p.repo_url ? `<a class="link" target="_blank" rel="noopener" href="${esc(safeUrl(p.repo_url))}">${esc(p.repo_url)}</a>` : ''}
        <p class="sub">Ultimo commit: <b>${esc(p.last_commit) || 'non indicato'}</b>${p.commit_date ? ' · ' + esc(fmtDate(p.commit_date)) : ''}${p.default_branch ? ' · <span class="mono">' + esc(p.default_branch) + '</span>' : ''}</p>
        ${canEdit ? `<button type="button" class="secondary" onclick="syncGit(${p.id})">Aggiorna da repository</button> <button type="button" class="secondary" onclick="showTree(${p.id})">Git tree</button>` : ''}</div>` : ''}</div>
    <div class="detail-section"><h3>Collegamenti</h3>
      ${projectLinkRows(p) || '<p class="sub">Nessun collegamento registrato.</p>'}
      ${reveal('＋ Aggiungi collegamento', `<input id="newLinkLabel" placeholder="Nome (es. Documentazione)"><input id="newLinkUrl" type="url" placeholder="https://..."><button type="button" aria-label="Aggiungi link" onclick="addProjectLink(${p.id})">＋</button>`)}</div>
    <section class="detail-section"><h3>${hubIcon('people')} Collaboratori</h3><div id="projectMembers" aria-live="polite">Caricamento…</div></section>
    </div></div>`;
  loadMembers(p);
  $('#detailModal').dataset.projectId = id;
  $('#detailModal').classList.add('open');
  $('#pageTitle').textContent = p.name;
  window.scrollTo(0, 0);
}

async function loadMembers(project) {
  const target = $('#projectMembers');
  if (!target) return;
  try {
    const members = await api('members', {project_id:project.id});
    const roles = {owner:'Proprietario',editor:'Editor',viewer:'Visualizzatore'};
    target.innerHTML = members.map(member => `<div class="member-row"><span class="avatar" aria-hidden="true">${esc(initials(member.name))}</span><div><strong>${esc(member.name)}</strong><small>${roles[member.role] || 'Membro'}</small></div>${project.member_role === 'owner' && +member.id !== +project.user_id ? `<button type="button" class="secondary" onclick="removeProjectMember(${project.id},${member.id})">Rimuovi</button>` : ''}</div>`).join('') || '<p class="sub">Nessun collaboratore registrato.</p>';
  } catch(e) { target.textContent = e.message; }
}
async function removeProjectMember(projectId, userId) {
  if (!await uiConfirm({title:'Rimuovere il collaboratore?', message:'Il collaboratore perderà accesso al progetto.', confirm:'Rimuovi', danger:true})) return;
  try {
    await api('unshare', {project_id:projectId, user_id:userId});
    if ($('#detailModal').dataset.projectId === String(projectId)) loadMembers(projects.find(p => p.id === projectId));
    notice('Accesso rimosso');
  } catch(e) { notice(e.message, true); }
}

/* ---------- azioni ---------- */
async function quickAddTask() {
  const writable = projects.filter(p => ['owner', 'editor'].includes(p.member_role));
  if (!writable.length) return notice('Crea prima un progetto per aggiungere un task.', true);
  const values = await uiPrompt({title:'Nuovo task', message:'Scegli il progetto e descrivi cosa fare.', confirm:'Aggiungi task', fields:[
    {name:'project', label:'Progetto', type:'select', options:writable.map(p => [p.id, p.name])},
    {name:'title', label:'Task', placeholder:'Cosa devi fare?', required:true},
    {name:'priority', label:'Priorità', type:'select', options:[['medium','Media'],['high','Alta'],['low','Bassa']]},
    {name:'due_date', label:'Scadenza', type:'date'}]});
  if (!values) return;
  if (!values.title.trim()) return notice('Scrivi il nome del task.', true);
  try { await api('task', {project_id:+values.project, title:values.title.trim(), priority:values.priority, due_date:values.due_date}); await load(); notice('Task aggiunto'); }
  catch(e) { notice(e.message, true); }
}
async function addTask(pid) {
  const title = $('#newTask').value.trim();
  const priority = $('#newTaskPriority')?.value || 'medium';
  const due_date = $('#newTaskDue')?.value || '';
  if (!title) { $('#newTask').focus(); return notice('Scrivi il nome del task.', true); }
  try { await api('task', {project_id: pid, title, priority, due_date}); await load(); detail(pid); }
  catch(e) { notice(e.message, true); }
}
async function toggleTask(id, pid, done) {
  const t = projects.find(p => p.id === pid).tasks.find(t => t.id === id);
  try { await api('task', {id, project_id: pid, title: t.title, done, priority: t.priority, due_date: t.due_date}); await load(); if ($('#detailModal').classList.contains('open')) detail(pid); }
  catch(e) { notice(e.message, true); }
}
async function editTask(id, pid) {
  const t = projects.find(p => p.id === pid)?.tasks.find(x => x.id === id);
  if (!t) return;
  const v = await uiPrompt({title:'Modifica task', message:'Aggiorna testo, priorità o scadenza.', fields:[
    {name:'title', label:'Task', value:t.title, required:true},
    {name:'priority', label:'Priorità', type:'select', value:t.priority||'medium', options:[['high','Alta'],['medium','Media'],['low','Bassa']]},
    {name:'due_date', label:'Scadenza', type:'date', value:t.due_date||''}]});
  if (!v) return;
  try { await api('task', {id, project_id: pid, title: v.title, done: t.done, priority: v.priority, due_date: v.due_date}); await load();
    if ($('#detailModal').classList.contains('open')) detail(pid);
    notice('Task aggiornato'); } catch(e) { notice(e.message, true); }
}
async function deleteTask(id, pid) {
  if (!await uiConfirm({title:'Eliminare task?', message:'Il task verrà rimosso definitivamente.', confirm:'Elimina', danger:true})) return;
  try { await api('delete-task', {id, project_id: pid}); await load();
    if ($('#detailModal').classList.contains('open')) detail(pid);
    notice('Task eliminato'); } catch(e) { notice(e.message, true); }
}
async function addProjectLink(pid) {
  const label = $('#newLinkLabel')?.value.trim() || '', url = $('#newLinkUrl')?.value.trim() || '';
  if (!url) return notice('Inserisci un URL', true);
  try { await api('project-link', {project_id: pid, label, url}); await load(); detail(pid); notice('Link aggiunto'); }
  catch(e) { notice(e.message, true); }
}
async function removeProjectLink(id, pid) {
  if (!await uiConfirm({title:'Rimuovere link?', message:'Il collegamento verrà rimosso dal progetto.', confirm:'Rimuovi', danger:true})) return;
  try { await api('remove-project-link', {id, project_id: pid}); await load(); detail(pid); notice('Link rimosso'); }
  catch(e) { notice(e.message, true); }
}
async function addComputer() {
  const v = await uiPrompt({title:'Registra computer', message:'Un nome riconoscibile per questa macchina.', fields:[{name:'name', label:'Nome macchina', placeholder:'es. PC fisso', required:true}]});
  if (!v) return;
  try { await api('computer', {name: typeof v === 'string' ? v : v.name}); await load(); notice('Computer registrato'); }
  catch(e) { notice(e.message, true); }
}
async function removeComputer(id) {
  if (!await uiConfirm({title:'Rimuovere computer?', message:'Le associazioni collegate saranno eliminate. L’azione non può essere annullata.', confirm:'Rimuovi', danger:true})) return;
  try { await api('remove-computer', {id}); await load(); } catch(e) { notice(e.message, true); }
}
async function addLocation(pid) {
  const folder = $('#newFolder').value.trim(), computer_id = +$('#locationComputer').value;
  if (!folder || !computer_id) return;
  try { await api('location', {project_id: pid, computer_id, folder}); await load(); detail(pid); }
  catch(e) { notice(e.message, true); }
}
async function editLocation(id, pid) {
  const folder = (projects.find(p => p.id === pid)?.locations || []).find(l => l.id === id)?.folder || '';
  const v = await uiPrompt({title:'Modifica percorso', message:'Aggiorna il percorso locale associato a questo progetto.', fields:[{name:'folder', label:'Percorso cartella', value: folder, required:true}]});
  if (v === null || v === undefined) return;
  const input = typeof v === 'string' ? v : v.folder;
  if (!input.trim()) return;
  try { await api('update-location', {id, project_id: pid, folder: input.trim()}); await load(); detail(pid); notice('Percorso aggiornato'); }
  catch(e) { notice(e.message, true); }
}
async function removeLocation(id, pid) {
  try { await api('remove-location', {id, project_id: pid}); await load(); detail(pid); }
  catch(e) { notice(e.message, true); }
}
async function syncGit(id) {
  const p = projects.find(x => x.id === id);
  const path = (p.locations || [])[0]?.folder;
  if (!path) return notice('Nessun percorso Git: aggiungi una cartella locale nel dettaglio', true);
  try {
    const x = await api('git-info', {path});
    await api('save', {...p, last_commit: x.last_commit, commit_date: x.commit_date ? x.commit_date.slice(0,10) : ''});
    await load(); notice('Dati Git aggiornati');
    if ($('#detailModal').classList.contains('open')) detail(id);
  } catch(e) { notice(e.message, true); }
}
async function showTree(id) {
  const p = projects.find(x => x.id === id);
  const path = (p.locations || [])[0]?.folder;
  if (!path) return notice('Nessun percorso Git: aggiungi una cartella locale nel dettaglio', true);
  try {
    const x = await api('git-tree', {path});
    $('#detail').insertAdjacentHTML('beforeend', `<div class="detail-section git-tree"><h3>Git tree e branch</h3>${x.commits.map(c => { const [hash,date,author,refs,subject] = c.split('|'); return `<div><code>${esc(hash)}</code><span>${esc(subject)} <small>${esc(refs||'')}</small></span><small>${esc(date)} · ${esc(author)}</small></div>`; }).join('') || '<p class="sub">Nessun commit.</p>'}</div>`);
  } catch(e) { notice(e.message, true); }
}
function editProject(id) {
  openModal(projects.find(p => p.id === id));
}
async function deleteProject(id) {
  if (!await uiConfirm({title:'Eliminare progetto?', message:'Il progetto e tutti i suoi dati verranno rimossi. L’azione non può essere annullata.', confirm:'Elimina', danger:true})) return;
  try { await api('delete', {id}); $('#detailModal').classList.remove('open'); await load(); }
  catch(e) { notice(e.message, true); }
}
async function shareProject(id) {
  const v = await uiPrompt({title:'Condividi progetto', message:'L’utente deve essere già registrato nel workspace.', fields:[
    {name:'email', label:'Email utente', type:'email', placeholder:'utente@email.it', required:true},
    {name:'role', label:'Ruolo', type:'select', options:[['viewer','Visualizzatore'],['editor','Editor']]}]});
  if (!v) return;
  try { await api('share', {project_id: id, email: v.email, role: v.role}); notice('Progetto condiviso'); if ($('#detailModal').dataset.projectId === String(id)) loadMembers(projects.find(p => p.id === id)); await refreshNotifications(); }
  catch(e) { notice(e.message, true); }
}

/* ---------- modal progetto ---------- */
function openModal(p) {
  githubPreviewUrl = p?.repo_url || '';
  $('#modal').classList.add('open');
  $('#modalTitle').textContent = p ? 'Modifica progetto' : 'Nuovo progetto';
  $('#modalNo').textContent = p ? waybillNo(p) : 'nuovo';
  $('#projectId').value = p?.id || '';
  $('#gitPreview').hidden = true;
  $('#projectForm').reset();
  ['name','description','status','provider','repo_url'].forEach(k => { if (p?.[k] != null) $('#'+k).value = p[k]; });
  setTimeout(() => $('#name').focus(), 0);
}
async function loadGithubInfo() {
  const url = $('#repo_url').value.trim();
  if (!url || url === githubPreviewUrl || !/^https?:\/\/github\.com\//i.test(url)) return;
  githubPreviewUrl = url;
  try {
    const x = await api('github-info', {url});
    $('#name').value = x.name || $('#name').value;
    $('#description').value = x.description || '';
    $('#provider').value = 'GitHub';
    const gp = $('#gitPreview');
    gp.hidden = false;
    gp.innerHTML = `<b>✓ GitHub</b> — ${esc(x.branch || 'main')} · ultimo commit: ${esc(x.last_commit || '—')}${x.commit_date ? ' · ' + esc(fmtDate(x.commit_date)) : ''}`;
    notice('Informazioni GitHub recuperate');
  } catch(e) {
    $('#gitPreview').hidden = true;
    notice('Non è stato possibile leggere il repository GitHub: ' + e.message, true);
  }
}
function closeModal() { $('#modal').classList.remove('open'); }

/* ---------- notifiche ---------- */
function formatNotificationDate(v) {
  const d = parseDate(v);
  return d ? d.toLocaleString('it-IT', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '';
}
function renderNotificationPanel(items) {
  let panel = $('#notificationPanel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'notificationPanel'; panel.className = 'notification-panel'; document.body.append(panel); }
  panel.innerHTML = '<div class="notification-head"><strong>Notifiche</strong><button type="button" id="readNotifications">Segna tutte lette</button></div>' +
    (items.length
      ? items.map(x => `<button type="button" class="notification-item" data-project="${x.project_id||''}">${esc(x.message)}<small>${esc(x.project||'Progetto')} · ${esc(formatNotificationDate(x.created_at))}${x.read_at ? '' : ' · Nuovo'}</small></button>`).join('')
      : '<div class="notification-empty">Nessuna notifica.</div>');
  panel.querySelector('#readNotifications').onclick = async () => {
    try { await api('notifications-read', {}); items.forEach(x => x.read_at = '1'); renderNotificationPanel(items); updateNotifDot(0); }
    catch(e) { notice(e.message, true); }
  };
  panel.querySelectorAll('.notification-item').forEach(item => item.onclick = () => {
    const id = +item.dataset.project; panel.classList.remove('open'); if (id) detail(id);
  });
}
function updateNotifDot(unread) {
  const dot = $('.notif-dot'), btn = $('#notifBtn');
  dot.hidden = unread === 0;
  btn.title = unread ? unread + ' notifiche non lette' : 'Nessuna nuova notifica';
}
async function refreshNotifications() {
  try {
    const items = await api('notifications');
    updateNotifDot(items.filter(x => !x.read_at).length);
    renderNotificationPanel(items);
  } catch(e) {}
}

/* ---------- dialog ---------- */
function uiDialog({title, message, fields = [], confirm = 'Conferma', cancel = 'Annulla', danger = false, confirmation = false}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div'); wrap.className = 'ui-dialog-wrap';
    const box = document.createElement('div'); box.className = 'ui-dialog'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    const close = () => { wrap.remove(); document.removeEventListener('keydown', key); resolve(null); };
    const key = e => { if (e.key === 'Escape') close(); };
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = message || '';
    box.append(h, p);
    const controls = [];
    fields.forEach(f => {
      const label = document.createElement('label'); label.textContent = f.label;
      const input = f.type === 'select' ? document.createElement('select') : document.createElement('input');
      input.name = f.name;
      if (f.type !== 'select') input.type = f.type || 'text';
      input.placeholder = f.placeholder || ''; input.value = f.value || ''; input.required = !!f.required;
      if (f.options) f.options.forEach(o => { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; input.append(op); });
      if (f.value != null) input.value = f.value;
      label.append(input); box.append(label); controls.push(input);
    });
    const actions = document.createElement('div'); actions.className = 'ui-dialog-actions';
    const cancelButton = document.createElement('button'); cancelButton.className = 'secondary'; cancelButton.type = 'button'; cancelButton.textContent = cancel; cancelButton.onclick = close;
    const ok = document.createElement('button'); ok.className = danger ? 'danger' : 'primary'; ok.type = 'button'; ok.textContent = confirm;
    ok.onclick = () => {
      if (controls.some(x => !x.reportValidity())) return;
      const value = fields.length === 1 ? controls[0].value : Object.fromEntries(controls.map(x => [x.name, x.value]));
      wrap.remove(); document.removeEventListener('keydown', key);
      resolve(confirmation ? true : value);
    };
    actions.append(cancelButton, ok); box.append(actions); wrap.append(box);
    wrap.onclick = e => { if (e.target === wrap) close(); };
    document.body.append(wrap); document.addEventListener('keydown', key);
    setTimeout(() => controls[0]?.focus(), 0);
  });
}
const uiPrompt = o => uiDialog(o);
const uiConfirm = o => uiDialog({...o, confirmation: true});

/* ---------- navigazione ---------- */
function activateView(view) {
  currentView = view;
  $('#detailModal').classList.remove('open');
  $('#accountPage').classList.remove('open');
  $('#search').value = '';
  $('.filters').open = false;
  document.querySelectorAll('.nav').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0,0);
}

/* ---------- wiring ---------- */
document.querySelectorAll('.nav').forEach(n => n.onclick = () => activateView(n.dataset.view));
$('#newBtn').onclick = () => openModal();
for (const id of ['#newBtn','#quickTaskBtn']) $(id).insertAdjacentHTML('afterbegin',hubIcon('plus'));
$('#quickTaskBtn').onclick = quickAddTask;
$('#close').onclick = closeModal;
$('#cancel').onclick = closeModal;
$('#detailClose').onclick = () => { $('#detailModal').classList.remove('open'); render(); };
$('#search').oninput = render;
$('#filter').onchange = render;
$('#projectSort').onchange = e => { sortKey = e.target.value; sortDir = sortKey === 'name' ? 1 : -1; render(); };
$('#repo_url').addEventListener('blur', loadGithubInfo);

$('#projectForm').onsubmit = async e => {
  e.preventDefault();
  const p = projects.find(x => x.id === +$('#projectId').value);
  const d = {
    id: +$('#projectId').value,
    name: $('#name').value, description: $('#description').value,
    status: $('#status').value, provider: $('#provider').value, repo_url: $('#repo_url').value,
    last_commit: p?.last_commit || '', commit_date: p?.commit_date || '', default_branch: p?.default_branch || ''
  };
  try {
    const x = await api('save', d);
    closeModal(); await load();
    if (p && $('#detailModal').classList.contains('open')) detail(x.id);
    notice(x.remote ? 'Progetto salvato (dati GitHub aggiornati)' : 'Progetto salvato');
  } catch(x) { notice(x.message, true); }
};

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const d = {email: $('#authEmail').value, password: $('#authPassword').value};
  if (registerMode) d.name = $('#authName').value;
  try {
    const x = await api(registerMode ? 'register' : 'login', d);
    csrfToken = x.csrf || csrfToken;
    currentUser = x.user; showApp(); await load();
  } catch(x) { $('#authError').textContent = x.message; }
};
$('#authSwitch').onclick = () => {
  registerMode = !registerMode;
  $('#authTitle').textContent = registerMode ? 'Nuovo account' : 'Accedi';
  $('#authNameWrap').hidden = !registerMode;
  $('#authForm .primary').textContent = registerMode ? 'Registrati' : 'Accedi';
  $('#authSwitch').textContent = registerMode ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati';
};

/* account */
function openAccount() {
  $('#detailModal').classList.remove('open');
  $('#accountName').value = currentUser.name;
  $('#accountEmail').value = currentUser.email;
  $('#passwordForm').reset();
  $('#accountPage').classList.add('open');
  $('#pageTitle').textContent = 'Account';
  window.scrollTo(0, 0);
}
$('#profileMore').onclick = openAccount;
$('#headerAvatar').onclick = openAccount;
$('#accountBack').onclick = () => activateView('overview');
$('#accountForm').onsubmit = async e => { e.preventDefault(); try { const x = await api('account-name', {name:$('#accountName').value}); currentUser = x.user; showApp(); notice('Nome aggiornato'); } catch(err) { notice(err.message, true); } };
$('#passwordForm').onsubmit = async e => { e.preventDefault(); if ($('#newPassword').value !== $('#confirmPassword').value) return notice('Le nuove password non coincidono.', true); try { await api('account-password', {current_password:$('#currentPassword').value, new_password:$('#newPassword').value}); e.target.reset(); notice('Password aggiornata'); } catch(err) { notice(err.message, true); } };
$('#logoutBtn').onclick = async () => { await api('logout', {}); location.reload(); };
$('#themeToggle').onclick = () => {
  document.body.classList.toggle('light');
  const light = document.body.classList.contains('light');
  $('#themeToggle').textContent = light ? 'Tema scuro' : 'Tema chiaro';
  localStorage.theme = light ? 'light' : 'dark';
};
if (localStorage.theme !== 'dark') { document.body.classList.add('light'); $('#themeToggle').textContent = 'Tema scuro'; }

/* notifiche click */
$('#notifBtn').onclick = () => $('#notificationPanel')?.classList.toggle('open');

/* chiusure: click fuori, Escape */
document.addEventListener('click', e => {
  const menuBtn = e.target.closest('[data-menu]');
  document.querySelectorAll('.card-menu.open').forEach(m => {
    if (menuBtn && m.id === 'cardMenu' + menuBtn.dataset.menu) return;
    m.classList.remove('open');
  });
  if (menuBtn) {
    const m = $('#cardMenu' + menuBtn.dataset.menu);
    if (m) { m.classList.toggle('open'); e.stopPropagation(); }
  }
  const panel = $('#notificationPanel'), bell = $('#notifBtn');
  if (panel?.classList.contains('open') && !panel.contains(e.target) && !bell.contains(e.target)) panel.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('.ui-dialog-wrap')) return;
  if ($('#modal').classList.contains('open')) { closeModal(); return; }
  if ($('#accountPage').classList.contains('open')) activateView('overview');
  else if ($('#detailModal').classList.contains('open')) { $('#detailModal').classList.remove('open'); render(); }
});
$('#modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

/* Reuse the same navigation on small screens. */
const mobileNav = $('.app > aside nav').cloneNode(true);
mobileNav.className = 'mobile-nav';
mobileNav.querySelector('[id]')?.removeAttribute('id');
mobileNav.querySelectorAll('button').forEach(button => {
  button.onclick = () => activateView(button.dataset.view);
});
document.body.append(mobileNav);
mobileNav.querySelector('button[data-view="overview"]').classList.add('active');

/* OIDC opzionale */
api('oidc-config').then(x => {
  if (x.enabled) {
    const b = document.createElement('a');
    b.href = '?oidc=1'; b.className = 'auth-switch'; b.textContent = 'Accedi con Authentik';
    $('#authForm').after(b);
  }
}).catch(() => {});

const urlAuthError = new URLSearchParams(location.search).get('auth_error');
if (urlAuthError) $('#authError').textContent = urlAuthError;
start();
