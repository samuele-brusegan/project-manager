const hubIcons = {
  plus:'<path d="M8 3v10M3 8h10"/>',
  arrow:'<path d="M3 8h10m-4-4 4 4-4 4"/>',
  pin:'<path d="m5 2 6 1-1 4 2 3-9-1 2-2zM7 10l-1 4"/>',
  folder:'<path d="M2 5V3h5l2 2h5v8H2z"/>',
  machine:'<rect x="2" y="2" width="12" height="9" rx="2"/><path d="M5 14h6M8 11v3"/>',
  people:'<circle cx="6" cy="5" r="2"/><path d="M2 13v-1a4 4 0 0 1 8 0v1m1-10a2 2 0 0 1 0 4m1 2a4 4 0 0 1 2 4"/>',
  edit:'<path d="m3 11 8-8 2 2-8 8H3zM9 5l2 2"/>',
  clock:'<circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1"/>'
};
function hubIcon(name) {
  return '<svg viewBox="0 0 16 16" aria-hidden="true">' + hubIcons[name] + '</svg>';
}
function hubPrefs() {
  try { return JSON.parse(localStorage.getItem('hub-prefs-' + currentUser.id)) || {}; }
  catch { return {}; }
}
function hubSet(key, value) {
  localStorage.setItem('hub-prefs-' + currentUser.id, JSON.stringify({...hubPrefs(), [key]:value}));
  render();
}
function togglePin(id) {
  const pins = hubPrefs().pins || [];
  hubSet('pins', pins.includes(id) ? pins.filter(p => p !== id) : [...pins, id]);
}
let agendaFilter = 'due';
let agendaLimit = 8;
let agendaPriority = '';
function setAgenda(value) {
  agendaFilter = value;
  agendaLimit = 8;
  render();
  document.querySelector('.agenda-tabs [aria-pressed="true"]')?.focus();
}
function projectTile(p, pins, compact = false) {
  const open = (p.tasks || []).filter(t => !+t.done);
  const late = open.filter(t => t.due_date && t.due_date < isoToday()).length;
  const machines = new Set((p.locations || []).map(l => l.computer_id).filter(Boolean)).size;
  const pinned = pins.includes(p.id);
  const repo = p.repo_url ? '<a class="tile-link" href="' + esc(safeUrl(p.repo_url)) + '" target="_blank" rel="noopener noreferrer">Repository ↗</a>' : '';
  return `<article class="hub-project ${compact ? 'compact' : ''}">
    <div class="hub-project-top"><span class="entity project-entity">${hubIcon('folder')}</span>
      <button class="icon-btn pin-control" type="button" aria-pressed="${pinned}" aria-label="${pinned ? 'Sblocca' : 'Fissa'} ${esc(p.name)}" title="${pinned ? 'Rimuovi dai preferiti' : 'Fissa nei preferiti'}" onclick="togglePin(${p.id})">${hubIcon('pin')}</button></div>
    <h3><button type="button" onclick="detail(${p.id})">${esc(p.name)}</button></h3>
    ${!compact && p.description ? `<p class="tile-description">${esc(p.description)}</p>` : ''}
    <div class="tile-status">${stampFor(p)}${p.member_role !== 'owner' ? '<span title="Progetto condiviso">' + hubIcon('people') + ' Condiviso</span>' : ''}</div>
    <div class="tile-meta"><span class="${late ? 'urgent' : ''}">${open.length} task aperti${late ? ' · ' + late + ' scaduti' : ''}</span><span>${hubIcon('machine')} ${machines}</span>${repo}</div>
  </article>`;
}
function agendaRow(t) {
  const editable = ['owner','editor'].includes(t.project.member_role);
  return `<article class="agenda-row">
    <input type="checkbox" aria-label="Completa ${esc(t.title)}" ${editable ? '' : 'disabled'} onchange="toggleTask(${t.id},${t.project.id},this.checked)">
    <div><strong>${esc(t.title)}</strong><button class="agenda-project" type="button" onclick="detail(${t.project.id})">${esc(t.project.name)}</button></div>
    <span class="agenda-priority ${t.priority === 'high' ? 'urgent' : ''}">${PRIORITY[t.priority] || 'Media'}</span>
    ${taskDue(t) || '<small class="task-due">Senza data</small>'}
    ${editable ? `<button type="button" class="icon-btn" title="Modifica task" aria-label="Modifica ${esc(t.title)}" onclick="editTask(${t.id},${t.project.id})">${hubIcon('edit')}</button>` : ''}
  </article>`;
}
function renderHome(host, tasks, matching, prefs) {
  const today = isoToday(), week = isoAfter(7);
  const open = tasks.filter(t => !+t.done);
  const windows = [
    ['late','Scaduti', open.filter(t => t.due_date && t.due_date < today)],
    ['today','Oggi', open.filter(t => t.due_date === today)],
    ['week','Prossimi 7 giorni', open.filter(t => t.due_date > today && t.due_date <= week)]
  ];
  const selected = windows.find(([key]) => key === agendaFilter);
  const urgent = windows.flatMap(([, , rows]) => rows);
  const queue = selected ? selected[2] : agendaFilter === 'all' ? open : agendaFilter === 'undated' ? open.filter(t => !t.due_date) : urgent;
  const agenda = queue.filter(t => matching.has(t.project.id) && (!agendaPriority || t.priority === agendaPriority)).sort((a,b) =>
    (a.due_date || '9999').localeCompare(b.due_date || '9999') || Number(b.priority === 'high') - Number(a.priority === 'high'));
  const pins = prefs.pins || [];
  const shortlist = projects.filter(p => matching.has(p.id)).sort((a,b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id))).slice(0, 4);
  const max = Math.max(1, ...windows.map(([, , rows]) => rows.length));
  host.innerHTML = `<div class="command-layout">
    <section class="command-agenda"><div class="hub-section-head"><div><h2>Da fare</h2><p>${open.length} task aperti nei progetti a cui hai accesso</p></div></div>
      <div class="agenda-tabs" role="group" aria-label="Scadenze">
        ${[['due','Entro 7 giorni'], ...windows, ['undated','Senza data'], ['all','Tutti']].map(([key,label]) => `<button type="button" aria-pressed="${key === agendaFilter}" onclick="setAgenda('${key}')">${label}${key === 'late' && windows[0][2].length ? ` <b class="urgent">${windows[0][2].length}</b>` : ''}</button>`).join('')}
      </div>
      <label class="priority-filter">Priorità <select id="agendaPriority"><option value="">Tutte</option>${Object.entries(PRIORITY).map(([value,label]) => `<option value="${value}" ${value === agendaPriority ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <div class="agenda-list">${agenda.slice(0,agendaLimit).map(agendaRow).join('') || '<p class="hub-empty">Nessun task con questi criteri. Seleziona Tutti per vedere anche quelli senza scadenza.</p>'}</div>
      ${agenda.length > agendaLimit ? '<button class="text-button" type="button" onclick="agendaLimit+=8;render()">Mostra altri task</button>' : ''}
    </section>
    <aside class="command-side">
      ${prefs.chart === false ? '<button class="text-button" type="button" onclick="hubSet(\'chart\',true)">Mostra scadenze</button>' : `<section class="deadline-chart"><div class="hub-section-head"><h2>Scadenze</h2><button class="text-button" type="button" onclick="hubSet('chart',false)">Nascondi</button></div>
      ${windows.map(([key,label,rows]) => `<button type="button" class="chart-row ${key}" onclick="setAgenda('${key}')"><span>${label}</span><span class="chart-track"><i style="width:${rows.length / max * 100}%"></i></span><b>${rows.length}</b></button>`).join('')}</section>`}
      <section class="resume-projects"><div class="hub-section-head"><h2>Riprendi un progetto</h2><button class="icon-btn" title="Tutti i progetti" aria-label="Tutti i progetti" onclick="activateView('projects')">${hubIcon('arrow')}</button></div>
        ${shortlist.map(p => `<div class="resume-row"><button type="button" onclick="detail(${p.id})">${hubIcon('folder')}<span>${esc(p.name)}</span></button><button type="button" class="icon-btn pin-control" aria-pressed="${pins.includes(p.id)}" aria-label="${pins.includes(p.id) ? 'Sblocca' : 'Fissa'} ${esc(p.name)}" onclick="togglePin(${p.id})">${hubIcon('pin')}</button></div>`).join('') || '<p class="hub-empty">Nessun progetto da mostrare.</p>'}
      </section>
    </aside></div>`;
  $('#agendaPriority').onchange = e => {
    agendaPriority = e.target.value;
    agendaLimit = 8;
    render();
    $('#agendaPriority').focus();
  };
}
function render() {
  const host = $('#projectGrid');
  const view = currentView;
  const prefs = hubPrefs();
  const query = $('#search').value.trim().toLocaleLowerCase();
  const state = $('#filter').value;
  const matches = p => [p.name, p.description, p.repo_url, ...(p.locations || []).flatMap(l => [l.computer,l.folder]), ...(p.tasks || []).map(t => t.title)]
    .some(value => String(value ?? '').toLocaleLowerCase().includes(query));
  const list = projects.filter(p => matches(p) && (view !== 'projects' || state === 'all' || p.status === state));
  const title = {overview:'Spazio di lavoro',projects:'Progetti',map:'Mappa'}[view];
  $('#pageTitle').textContent = title;
  $('#greeting').textContent = title;
  $('#fleetLine').textContent = {
    overview:'Scadenze, attività e progetti da riprendere.',
    projects:'Cerca per nome, task, repository o percorso.',
    map:'Esplora le associazioni tra progetti e macchine.'
  }[view];
  $('#navCount').textContent = projects.length;
  $('.section-head').hidden = view === 'map';
  $('.filters').hidden = view !== 'projects';
  $('#projectSort').hidden = view !== 'projects';
  $('#quickTaskBtn').hidden = view !== 'overview';
  $('.home-actions').hidden = view === 'map';
  if (view === 'map') { renderMap(); return; }
  if (view === 'overview') {
    const tasks = projects.flatMap(p => (p.tasks || []).map(t => ({...t, project:p})));
    renderHome(host, tasks, new Set(list.map(p => p.id)), prefs);
    return;
  }
  const pins = prefs.pins || [];
  const compact = !!prefs.compact;
  const sorted = sortList(list).sort((a,b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)));
  host.innerHTML = `<div class="catalog-head"><span>${sorted.length} di ${projects.length} progetti</span><button type="button" class="secondary" aria-pressed="${compact}" onclick="hubSet('compact',${!compact})">Vista compatta</button></div>
    <div class="hub-catalog ${compact ? 'dense' : ''}">${sorted.map(p => projectTile(p,pins,compact)).join('') || '<p class="hub-empty">Nessun progetto corrisponde alla ricerca.</p>'}</div>`;
}
