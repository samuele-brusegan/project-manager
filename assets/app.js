/* Project Hub */

document.head.insertAdjacentHTML('beforeend', '<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">');

let projects = [], currentUser = null, registerMode = false, currentView = 'overview',
    computers = [], githubPreviewUrl = '', csrfToken = '',
    viewMode = localStorage.viewMode || 'manifest';

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
function greeting() {
  const h = new Date().getHours();
  const part = h < 6 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  return `${part}, ${currentUser?.name?.split(' ')[0] || ''}`.trim();
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
  $('#greeting').textContent = greeting();
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

/* ---------- render principale ---------- */
function setTaskControls(active) {
  $('#filter').hidden = active;
  $('#taskFilter').hidden = !active;
  $('#taskPriorityFilter').hidden = !active;
  $('.view-toggle').hidden = active;
  $('#search').placeholder = active ? 'Cerca task o progetto…' : 'Cerca progetto…';
}

function render() {
  const q = ($('#search').value || '').toLowerCase();
  const f = $('#filter').value;
  const tasks = projects.flatMap(p => (p.tasks || []).map(t => ({...t, project: p})));
  const cutoff = new Date(Date.now() - 30 * 86400000);
  const recent = projects.filter(p => parseDate(p.commit_date) >= cutoff || parseDate(p.updated_at) >= cutoff).length;

  $('#pageTitle').textContent = currentView === 'tasks' ? 'Task'
    : currentView === 'projects' ? 'Progetti'
    : currentView === 'computers' ? 'Computer' : 'Panoramica';
  const attn = attentionItems(tasks);
  $('#openStat').textContent = attn.length;
  $('#taskStat').textContent = tasks.filter(t => !+t.done && t.due_date && t.due_date < isoToday()).length;
  $('#commitStat').textContent = recent;
  $('#openDelta').textContent = attn.length ? 'da risolvere' : 'tutto ok';
  $('#navCount').textContent = projects.length;
  $('#fleetLine').innerHTML = computers.length
    ? 'Macchine: ' + computers.map(c => `<b>${esc(c.name || 'porto')}</b>`).join(' · ') + ` — ${computers.length} ${computers.length === 1 ? 'macchina registrata' : 'macchine registrate'}`
    : 'nessuna macchina registrata — <span class="stale">aggiungine una per associare i percorsi locali ai progetti</span>';

  if (currentView === 'computers') { setTaskControls(false); $('#sectionTitle').textContent = 'Macchine registrate'; $('#sectionSubtitle').textContent = 'PC e server con percorsi locali associati'; renderComputers(); return; }
  if (currentView === 'tasks') { renderTaskCenter(tasks, q); return; }

  setTaskControls(false);
  const list = projects.filter(p =>
    (f === 'all' || p.status === f) &&
    (!q || String(p.name||'').toLowerCase().includes(q)
        || String(p.description||'').toLowerCase().includes(q)
        || (p.tasks||[]).some(t => String(t.title||'').toLowerCase().includes(q))));

  const host = $('#projectGrid');
  const paint = rows => viewMode === 'cards'
    ? '<div class="cards-grid">' + rows.map(cardHtml).join('') + '</div>'
    : manifestTable(rows, currentView === 'projects');
  $('#empty').hidden = list.length > 0;

  if (currentView === 'overview') {
    $('#sectionTitle').textContent = 'Aggiornati di recente';
    $('#sectionSubtitle').textContent = 'I progetti modificati di recente — elenco completo in “Progetti”';
    host.innerHTML = attentionBlock(attn) +
      (list.length ? paint(list.slice(0, 5)) : '') +
      (projects.length > 5 ? `<button type="button" class="text-button" onclick="activateView('projects')">Tutti i progetti (${projects.length}) →</button>` : '');
    $('#empty h3').textContent = 'Nessun progetto';
    $('#empty p').textContent = 'Crea il primo progetto per iniziare.';
  } else {
    $('#sectionTitle').textContent = 'Tutti i progetti';
    $('#sectionSubtitle').textContent = 'Tutti i progetti, ordinati per ' + ({name:'nome',colli:'task',stamp:'ultimo aggiornamento'}[sortKey]||'ultimo bollo');
    host.innerHTML = paint(sortList(list));
    $('#empty h3').textContent = 'Nessun progetto trovato';
    $('#empty p').textContent = 'Prova a cambiare ricerca o filtro.';
  }

  host.querySelectorAll('[data-open]').forEach(el => el.onclick = e => {
    if (e.target.closest('button,a,input,select')) return;
    detail(+el.dataset.open);
  });
  host.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
    const k = th.dataset.sort;
    sortDir = sortKey === k ? -sortDir : 1;
    sortKey = k;
    render();
  });
}

/* ---------- attenzione ---------- */
function attentionItems(tasks) {
  const items = [], today = isoToday();
  projects
    .filter(p => p.status === 'active' && (daysSince(p.updated_at) ?? 0) >= 14)
    .forEach(p => items.push({cls:'a', stamp:'inattivo', text:`<b>${esc(p.name)}</b> inattivo da ${daysSince(p.updated_at)} giorni — lo stato potrebbe non essere aggiornato`, act:'Apri', fn:`detail(${p.id})`}));
  const overdue = tasks.filter(t => !+t.done && t.due_date && t.due_date < today);
  if (overdue.length) items.push({cls:'r', stamp:'scaduto', text:`<b>${overdue.length}</b> ${overdue.length === 1 ? 'task è' : 'task sono'} in ritardo`, act:'Vai ai task', fn:`activateView('tasks')`});
  projects.filter(p => !(p.locations || []).length).slice(0, 3)
    .forEach(p => items.push({cls:'n', stamp:'senza percorso', text:`<b>${esc(p.name)}</b> non è associato a nessuna macchina`, act:'Associa', fn:`detail(${p.id})`}));
  if (!computers.length) items.push({cls:'r', stamp:'senza macchina', text:'Nessuna macchina registrata — non puoi ancora associare percorsi locali ai progetti', act:'Registra computer', fn:'addComputer()'});
  return items;
}
function attentionBlock(items) {
  if (!items.length) {
    return `<div class="attn attn-clear"><span class="stamp g">tutto ok</span><p>nessun elemento da risolvere.</p></div>`;
  }
  return `<div class="attn">${items.map(i =>
    `<div class="attn-row"><span class="stamp ${i.cls}">${i.stamp}</span><p>${i.text}</p><button type="button" class="secondary" onclick="${i.fn}">${i.act}</button></div>`).join('')}</div>`;
}

/* ---------- ordinamento manifesto ---------- */
let sortKey = 'stamp', sortDir = -1;
function sortList(list) {
  const val = p => sortKey === 'name' ? (p.name||'').toLowerCase()
    : sortKey === 'colli' ? (p.tasks||[]).filter(t=>!+t.done).length
    : (parseDate(p.commit_date || p.updated_at)?.getTime() || 0);
  return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sortDir);
}

function manifestTable(list, sortable) {
  if (!list.length) return '';
  const arrow = k => sortable && sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : '';
  const th = (k, label) => sortable ? `<th data-sort="${k}" class="sortable">${label}${arrow(k)}</th>` : `<th>${label}</th>`;
  const rows = list.map(p => {
    const ts = p.tasks || [], done = ts.filter(t => +t.done).length;
    const open = ts.length - done;
    const colli = ts.length ? `${done}/${ts.length} task` : 'nessun task';
    const stamp = fmtDate(p.commit_date || p.updated_at);
    return `<tr data-open="${p.id}">
      <td class="m-name">${esc(p.name)}<small>${waybillNo(p)}${esc(p.default_branch ? ' · ' + p.default_branch : '')}</small></td>
      <td>${routeFor(p)}</td>
      <td class="mono" data-colli="${open}">${colli}</td>
      <td class="mono">${stamp}</td>
      <td>${stampFor(p)}</td>
      <td class="row-menu"><button type="button" class="more" aria-label="Azioni su ${esc(p.name)}" data-menu="${p.id}">⋮</button>
        <div class="card-menu" id="cardMenu${p.id}">
          <button type="button" onclick="event.stopPropagation();detail(${p.id})">Apri</button>
          <button type="button" onclick="event.stopPropagation();editProject(${p.id})">Modifica</button>
          <button type="button" onclick="event.stopPropagation();syncGit(${p.id})">Aggiorna Git</button>
          <button type="button" class="delete-link" onclick="event.stopPropagation();deleteProject(${p.id})">Elimina</button>
        </div></td>
    </tr>`;
  }).join('');
  return `<table class="manifest"><thead><tr>${th('name','Progetto')}<th>Percorso</th>${th('colli','Task')}${th('stamp','Aggiornato')}<th>Stato</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function cardHtml(p) {
  const ts = p.tasks || [], done = ts.filter(t => +t.done).length;
  const quickLink = (p.links || [])[0];
  return `<article class="project-card" data-open="${p.id}">
    <div class="card-top"><div class="project-mark">${esc(initials(p.name))}</div>
      <div class="row-menu"><button type="button" class="more" aria-label="Azioni" data-menu="${p.id}">⋮</button>
      <div class="card-menu" id="cardMenu${p.id}">
        <button type="button" onclick="event.stopPropagation();detail(${p.id})">Apri</button>
        <button type="button" onclick="event.stopPropagation();editProject(${p.id})">Modifica</button>
        <button type="button" onclick="event.stopPropagation();syncGit(${p.id})">Aggiorna Git</button>
        <button type="button" class="delete-link" onclick="event.stopPropagation();deleteProject(${p.id})">Elimina</button>
      </div></div></div>
    <h3>${esc(p.name)} <span class="mono">${waybillNo(p)}</span></h3>
    <p class="desc">${esc(p.description) || 'Nessuna descrizione aggiunta.'}</p>
    ${stampFor(p)}
    <div class="card-foot">${routeFor(p)}<span>${ts.length ? done + '/' + ts.length + ' task' : 'nessun task'}</span>
    ${quickLink ? `<a class="card-quick-link" href="${esc(safeUrl(quickLink.url))}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${faviconMarkup(quickLink)}<span>${esc(quickLink.label || quickLink.url)}</span></a>` : ''}</div>
  </article>`;
}

function renderTaskCenter(tasks, q) {
  setTaskControls(true);
  $('#sectionTitle').textContent = 'Task';
  $('#sectionSubtitle').textContent = 'Task aperti in tutti i progetti';
  const filter = $('#taskFilter').value, priority = $('#taskPriorityFilter').value;
  const today = isoToday(), week = isoAfter(7);
  const list = tasks.filter(t => !+t.done)
    .filter(t => { const due = t.due_date || '';
      return filter === 'all' || (filter === 'today' && due === today) ||
        (filter === 'week' && due >= today && due <= week) ||
        (filter === 'overdue' && due && due < today) || (filter === 'nodate' && !due); })
    .filter(t => priority === 'all' || t.priority === priority)
    .filter(t => !q || String(t.title||'').toLowerCase().includes(q) || String(t.project.name||'').toLowerCase().includes(q));

  $('#projectGrid').innerHTML = '<div class="task-center">' + list.map(t =>
    `<article class="task-center-item"><label class="detail-task"><input type="checkbox" onchange="toggleTask(${t.id},${t.project_id},this.checked)"><span><b>${esc(t.title)}</b><small class="task-project">${esc(t.project.name)}</small>${taskDue(t)}<small class="task-priority ${esc(t.priority||'medium')}">${PRIORITY[t.priority]||'Media'}</small></span></label>
    <div class="task-center-actions"><button type="button" class="secondary" onclick="detail(${t.project_id})">Dettagli</button><button type="button" class="secondary" onclick="editTask(${t.id},${t.project_id})">Modifica</button></div></article>`).join('') + '</div>';

  $('#empty').hidden = list.length > 0;
  $('#empty h3').textContent = 'Nessun task in questa vista';
  $('#empty p').textContent = tasks.some(t => !+t.done) ? 'Prova a cambiare filtro o ricerca.' : 'Aggiungi un task a un progetto per iniziare.';
}

function renderComputers() {
  const host = $('#projectGrid');
  const moorings = c => projects.flatMap(p => (p.locations || [])
    .filter(l => +l.computer_id === c.id).map(l => ({p, l})));
  host.innerHTML = `<div class="computer-toolbar"><h2>Macchine registrate</h2><button type="button" class="primary" onclick="addComputer()">＋ Registra computer</button></div>` +
    (computers.length
      ? '<div class="computers-grid">' + computers.map(c => {
          const m = moorings(c);
          return `<article class="computer-card"><span class="port-tag ${m.length ? '' : 'stale'}">${m.length ? 'in uso' : 'libero'}</span>
            <h3>${esc(c.name)}</h3>
            ${m.length ? '<ul class="port-ormeggi">' + m.map(({p, l}) => `<li><button type="button" class="port-link" onclick="detail(${p.id})">${esc(p.name)}</button><span class="mono">${esc(l.folder)}</span></li>`).join('') + '</ul>'
                       : '<p>Nessun progetto associato.</p>'}
            <div class="port-actions"><button type="button" class="secondary" onclick="moorToPort(${c.id})">Associa progetto</button><button type="button" class="port-remove" aria-label="Rimuovi ${esc(c.name)}" onclick="removeComputer(${c.id})">×</button></div>
          </article>`;
        }).join('') + '</div>'
      : '<div class="empty"><svg class="empty-mark" viewBox="0 0 48 48"><rect x="6" y="14" width="36" height="20" rx="2"/><path d="M14 40h20M24 34v6"/></svg><h3>Nessun macchina registrata</h3><p>Una macchina è un PC o server dove vivono i tuoi progetti. Registrala, poi associ i percorsi locali.</p><button type="button" class="primary" onclick="addComputer()">＋ Registra la prima macchina</button></div>');
  $('#empty').hidden = true;
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
  return `<div class="task-row"><label class="detail-task ${+t.done ? 'is-done' : ''}"><input type="checkbox" ${+t.done ? 'checked' : ''} onchange="toggleTask(${t.id},${pid},this.checked)"><span>${esc(t.title)}<small class="task-priority ${esc(t.priority||'medium')}">${PRIORITY[t.priority]||'Media'}</small>${taskDue(t)}</span></label>
  <span class="task-actions"><button type="button" aria-label="Modifica task" onclick="editTask(${t.id},${pid})">✎</button><button type="button" aria-label="Elimina task" onclick="deleteTask(${t.id},${pid})">×</button></span></div>`;
}
function detail(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const tasks = p.tasks || [], locations = p.locations || [];
  const canEdit = ['owner','editor'].includes(p.member_role);
  const reveal = (label, inner) => canEdit
    ? `<button type="button" class="add-reveal" onclick="this.hidden=true;this.nextElementSibling.hidden=false;this.nextElementSibling.querySelector('input,select')?.focus()">${label}</button><div class="add-line" hidden>${inner}</div>`
    : '';
  $('#detail').innerHTML = `
    <div class="detail-head"><h2>${esc(p.name)}</h2><span class="waybill-no">${waybillNo(p)}</span></div>
    <div class="detail-route">${routeFor(p)}<span class="detail-route-right">${stampFor(p)}</span></div>
    ${p.description ? `<p class="detail-desc">${esc(p.description)}</p>` : ''}
    <div class="detail-section"><h3>Percorsi e repository</h3>
      ${locations.map(l => `<div class="location"><span><b>${esc(l.computer || 'Porto')}</b></span><span class="mono">${esc(l.folder)}</span><span>${canEdit ? `<button type="button" aria-label="Modifica percorso" onclick="editLocation(${l.id},${p.id})">✎</button><button type="button" aria-label="Rimuovi percorso" onclick="removeLocation(${l.id},${p.id})">×</button>` : ''}</span></div>`).join('') || '<p class="sub">Nessun percorso locale associato.</p>'}
      ${reveal('＋ Associa un percorso', `<select id="locationComputer" aria-label="Macchina">${computers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><input id="newFolder" placeholder="/percorso/della/repo"><button type="button" aria-label="Aggiungi percorso" onclick="addLocation(${p.id})">＋</button>`)}
      ${canEdit && !computers.length ? `<button type="button" class="text-button" onclick="addComputer()">Registra prima una macchina →</button>` : ''}
      ${p.repo_url ? `<div class="detail-repo"><a class="link" target="_blank" rel="noopener" href="${esc(safeUrl(p.repo_url))}">${esc(p.repo_url)}</a>
        <p class="sub">Ultimo commit: <b>${esc(p.last_commit) || 'non indicato'}</b>${p.commit_date ? ' · ' + esc(fmtDate(p.commit_date)) : ''}${p.default_branch ? ' · <span class="mono">' + esc(p.default_branch) + '</span>' : ''}</p>
        ${canEdit ? `<button type="button" class="secondary" onclick="syncGit(${p.id})">Aggiorna da repository</button> <button type="button" class="secondary" onclick="showTree(${p.id})">Git tree</button>` : ''}</div>` : ''}</div>
    <div class="detail-section"><h3>Task · ${tasks.filter(t => !+t.done).length} da completare</h3>
      ${tasks.map(t => taskRow(t, p.id)).join('') || '<p class="sub">Nessun task aperto.</p>'}
      ${reveal('＋ Aggiungi task', `<input id="newTask" placeholder="Aggiungi un task…"><select id="newTaskPriority" aria-label="Priorità"><option value="medium">Media</option><option value="high">Alta</option><option value="low">Bassa</option></select><input id="newTaskDue" type="date" aria-label="Scadenza"><button type="button" aria-label="Aggiungi task" onclick="addTask(${p.id})">＋</button>`)}</div>
    <div class="detail-section"><h3>Collegamenti</h3>
      ${projectLinkRows(p) || '<p class="sub">Nessun collegamento registrato.</p>'}
      ${reveal('＋ Aggiungi collegamento', `<input id="newLinkLabel" placeholder="Nome (es. Documentazione)"><input id="newLinkUrl" type="url" placeholder="https://..."><button type="button" aria-label="Aggiungi link" onclick="addProjectLink(${p.id})">＋</button>`)}</div>
    ${canEdit ? `<div class="detail-actions">
      ${p.member_role === 'owner' ? `<button type="button" class="secondary" onclick="shareProject(${p.id})">Condividi</button>` : ''}
      <button type="button" class="secondary" onclick="editProject(${p.id})">Modifica</button>
      ${p.member_role === 'owner' ? `<button type="button" class="danger" onclick="deleteProject(${p.id})">Elimina</button>` : ''}</div>` : ''}`;
  $('#detailModal').classList.add('open');
}

/* ---------- azioni ---------- */
async function addTask(pid) {
  const title = $('#newTask').value.trim();
  const priority = $('#newTaskPriority')?.value || 'medium';
  const due_date = $('#newTaskDue')?.value || '';
  if (!title) return;
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
    if (currentView === 'tasks') render(); else if ($('#detailModal').classList.contains('open')) detail(pid); else render();
    notice('Task aggiornato'); } catch(e) { notice(e.message, true); }
}
async function deleteTask(id, pid) {
  if (!await uiConfirm({title:'Eliminare task?', message:'Il task verrà rimosso definitivamente.', confirm:'Elimina', danger:true})) return;
  try { await api('delete-task', {id, project_id: pid}); await load();
    if (currentView === 'tasks') render(); else if ($('#detailModal').classList.contains('open')) detail(pid); else render();
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
  $('#detailModal').classList.remove('open');
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
  try { await api('share', {project_id: id, email: v.email, role: v.role}); notice('Progetto condiviso'); await refreshNotifications(); }
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
  ['name','description','status','provider','repo_url'].forEach(k => $('#'+k).value = p?.[k] || ($('#'+k).tagName === 'SELECT' ? $('#'+k).value : ''));
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
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  document.querySelectorAll('.mobile-nav button').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  render();
}

/* ---------- wiring ---------- */
document.querySelectorAll('.nav').forEach(n => n.onclick = () => activateView(n.dataset.view));
$('#newBtn').onclick = () => openModal();
$('#emptyBtn').onclick = () => openModal();
$('#close').onclick = closeModal;
$('#cancel').onclick = closeModal;
$('#detailClose').onclick = () => $('#detailModal').classList.remove('open');
$('#search').oninput = render;
$('#filter').onchange = render;
$('#taskFilter').onchange = render;
$('#taskPriorityFilter').onchange = render;
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

/* menu utente */
function positionUserMenu() {
  const m = $('#userMenu'), r = $('#profileMore').getBoundingClientRect();
  m.style.left = Math.max(8, r.left - 120) + 'px';
  m.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  m.style.top = 'auto';
}
function toggleUserMenu() { positionUserMenu(); $('#userMenu').classList.toggle('open'); }
$('#profileMore').onclick = toggleUserMenu;
$('#headerAvatar').onclick = toggleUserMenu;
$('#logoutBtn').onclick = async () => { await api('logout', {}); location.reload(); };
$('#themeToggle').onclick = () => {
  document.body.classList.toggle('light');
  const light = document.body.classList.contains('light');
  $('#themeToggle').textContent = light ? 'Tema scuro' : 'Tema chiaro';
  localStorage.theme = light ? 'light' : 'dark';
};
if (localStorage.theme === 'light') { document.body.classList.add('light'); $('#themeToggle').textContent = 'Tema scuro'; }

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
  const um = $('#userMenu');
  if (um.classList.contains('open') && !um.contains(e.target) && !$('#profileMore').contains(e.target) && !$('#headerAvatar').contains(e.target)) um.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('.ui-dialog-wrap')) return;
  if ($('#detailModal').classList.contains('open')) $('#detailModal').classList.remove('open');
  else if ($('#modal').classList.contains('open')) closeModal();
});
$('#detailModal').addEventListener('click', e => { if (e.target === e.currentTarget) $('#detailModal').classList.remove('open'); });
$('#modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

/* view toggle */
document.querySelectorAll('.view-btn').forEach(b => b.onclick = () => {
  viewMode = b.dataset.viewmode;
  localStorage.viewMode = viewMode;
  document.querySelectorAll('.view-btn').forEach(x => x.classList.toggle('active', x === b));
  render();
});
if (viewMode === 'cards') document.querySelectorAll('.view-btn').forEach(x => x.classList.toggle('active', x.dataset.viewmode === 'cards'));

/* mobile nav */
const mobileNav = document.createElement('nav');
mobileNav.className = 'mobile-nav';
mobileNav.setAttribute('aria-label', 'Navigazione principale');
mobileNav.innerHTML =
  '<button type="button" data-view="overview"><svg viewBox="0 0 16 16"><path d="M2 13V6l6-4 6 4v7"/></svg>Panoramica</button>' +
  '<button type="button" data-view="projects"><svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M6 7v6"/></svg>Progetti</button>' +
  '<button type="button" data-view="tasks"><svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-8"/></svg>Task</button>' +
  '<button type="button" data-view="computers"><svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="8" rx="1"/><path d="M8 11v3M5 14h6"/></svg>Computer</button>';
document.body.append(mobileNav);
mobileNav.querySelectorAll('button').forEach(x => x.onclick = () => activateView(x.dataset.view));
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
