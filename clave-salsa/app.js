const DEPTS = {"01": "Ain", "03": "Allier", "07": "Ardèche", "15": "Cantal", "26": "Drôme", "38": "Isère", "42": "Loire", "43": "Haute-Loire", "63": "Puy-de-Dôme", "69": "Rhône", "73": "Savoie", "74": "Haute-Savoie"};
let GEO = null;
let COMMUNES = []; // [nom, dept, lat, lng, population]
const REGION = {code:'84', name:'Auvergne-Rhône-Alpes'};

const STYLE_GROUPS = [
  {key:'salsa', label:'Salsa', match:['salsa','salsa cubaine','salsa portoricaine','timba','son','rueda']},
  {key:'cubaine', label:'Cubaine', match:['salsa cubaine','timba','son','rueda']},
  {key:'porto', label:'Portoricaine', match:['salsa portoricaine']},
  {key:'bachata', label:'Bachata', match:['bachata']},
  {key:'kizomba', label:'Kizomba', match:['kizomba']},
  {key:'zouk', label:'Zouk', match:['zouk']},
];
const STYLE_LABEL = {'salsa':'Salsa','salsa cubaine':'Salsa cubaine','salsa portoricaine':'Salsa portoricaine','bachata':'Bachata','kizomba':'Kizomba','rueda':'Rueda','son':'Son','timba':'Timba','zouk':'Zouk','merengue':'Merengue'};
const TYPE_GROUPS = [
  {key:'soiree', label:'Soirées', match:['soirée']},
  {key:'festival', label:'Festivals', match:['festival']},
  {key:'stage', label:'Stages', match:['stage','initiation']},
  {key:'concert', label:'Concerts', match:['concert']},
];
const TYPE_LABEL = {'soirée':'Soirée','festival':'Festival','stage':'Stage','initiation':'Initiation','concert':'Concert'};
const WD = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const WD_SHORT = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
const PERIOD_LABEL = {weekend:'ce week-end', '7j':'les 7 prochains jours', '30j':'les 30 prochains jours', tout:'toute la saison connue'};

/* ---------- utilitaires ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return iso(d); };
const TODAY = iso(new Date());
const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fmtDay = s => parse(s).toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long'});
const fmtShort = s => parse(s).toLocaleDateString('fr-FR',{weekday:'short', day:'numeric', month:'short'});
const fmtDM = s => parse(s).toLocaleDateString('fr-FR',{day:'numeric', month:'short'});
const plural = (n, one, many) => `${n} ${n>1?many:one}`;
function km(a, b){ const R=6371, toR=x=>x*Math.PI/180; const dLa=toR(b.lat-a.lat), dLo=toR(b.lng-a.lng); const h=Math.sin(dLa/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function store(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function load(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } }
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true, 2000); }
function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return 'site de l\'organisateur'; } }
function relDay(s){ if(s===TODAY) return "Aujourd'hui"; if(s===addDays(TODAY,1)) return 'Demain'; return ''; }
function recLabel(r){
  if(!r) return '';
  if(r.freq==='weekly') return 'Chaque ' + WD[r.weekday];
  if(r.nth===-1) return 'Dernier ' + WD[r.weekday] + ' du mois';
  return (r.nth===1 ? '1er ' : r.nth + 'e ') + WD[r.weekday] + ' du mois';
}

/* ---------- état ---------- */
const saved = load('clave.v1') || {};
const state = {
  loc: saved.loc || {mode:'region'},
  when: saved.when || '30j',
  styles: new Set(saved.styles || []),
  types: new Set(saved.types || []),
  oneoff: !!saved.oneoff, free: !!saved.free,
  q: '', tab: 'agenda', mapCity: null, radiusDraft: (saved.loc && saved.loc.radius) || 0,
};
let EVENTS = [], META = null, LOADED = false, NODATA = false;
let favs = new Set(load('clave.favs') || []);
let favRef = null;
function persist(){ store('clave.v1', {loc:state.loc, when:state.when, styles:[...state.styles], types:[...state.types], oneoff:state.oneoff, free:state.free}); }

/* ---------- occurrences ---------- */
function occurrences(ev, from, to, recTo){
  const out = [], r = ev.recurrence;
  if(!r){
    const end = ev.end_date || ev.date;
    if(end < from || ev.date > to) return out;
    out.push(ev.date < from ? from : ev.date);
    return out;
  }
  const start = ev.date > from ? ev.date : from;
  let lim = recTo < to ? recTo : to;
  if(r.until && r.until < lim) lim = r.until;
  const ex = Array.isArray(ev.exdates) ? ev.exdates : null;
  if(ex){ const res = occurrences({...ev, exdates:null}, from, to, recTo); return res.filter(d => !ex.includes(d)); }
  if(r.freq === 'weekly'){
    const d = parse(start); d.setDate(d.getDate() + (r.weekday - d.getDay() + 7) % 7);
    while(iso(d) <= lim){ out.push(iso(d)); d.setDate(d.getDate()+7); }
  } else if(r.freq === 'monthly'){
    let m = parse(start); m.setDate(1); const endD = parse(lim);
    while(m <= endD){
      const y = m.getFullYear(), mo = m.getMonth(); let day = null;
      if(r.nth > 0){ const first = new Date(y,mo,1); day = new Date(y, mo, 1 + (r.weekday-first.getDay()+7)%7 + 7*(r.nth-1)); if(day.getMonth()!==mo) day = null; }
      else { const last = new Date(y,mo+1,0); day = new Date(y, mo, last.getDate() - (last.getDay()-r.weekday+7)%7); }
      if(day){ const s = iso(day); if(s >= start && s <= lim) out.push(s); }
      m = new Date(y, mo+1, 1);
    }
  }
  return out;
}
function period(key){
  const t = TODAY, wd = parse(t).getDay();
  if(key === 'weekend'){ const from = [5,6,0].includes(wd) ? t : addDays(t, (5-wd+7)%7); return [from, addDays(from, (7-parse(from).getDay())%7)]; }
  if(key === '7j') return [t, addDays(t,6)];
  if(key === '30j') return [t, addDays(t,29)];
  let to = addDays(t, 84);
  for(const e of EVENTS){ const d = e.end_date || e.date; if(!e.recurrence && d > to) to = d; }
  return [t, to];
}
const REC_HORIZON = () => addDays(TODAY, 84);

/* ---------- lieu ---------- */
function cityKey(e){ return norm(e.city) + '|' + e.dept_code; }
function inLoc(ev){
  const L = state.loc;
  if(L.mode === 'dept') return ev.dept_code === L.dept;
  if(L.mode === 'city' && L.city){
    const d = km(ev, L.city);
    if(!L.radius) return (norm(ev.city) === norm(L.city.n) && ev.dept_code === L.city.d) || d < 1.5;
    return d <= L.radius;
  }
  return true;
}
function locLabel(){
  const L = state.loc;
  if(L.mode === 'dept') return {kind:'Département', name:`${DEPTS[L.dept]} (${L.dept})`, short: DEPTS[L.dept]};
  if(L.mode === 'city' && L.city) return {kind: L.radius ? `Ville + ${L.radius} km` : 'Ville', name: L.city.n, short: L.radius ? `${L.city.n} et ${L.radius} km autour` : L.city.n};
  return {kind:'Région', name: REGION.name, short: REGION.name};
}

/* ---------- filtrage ---------- */
function matchFilters(ev, opts={}){
  if(!inLoc(ev)) return false;
  if(opts.all) return true;
  if(state.styles.size && !STYLE_GROUPS.some(g => state.styles.has(g.key) && (ev.styles||[]).some(s => g.match.includes(s)))) return false;
  if(state.types.size && !TYPE_GROUPS.some(g => state.types.has(g.key) && g.match.includes(ev.type))) return false;
  if(state.oneoff && ev.recurrence) return false;
  if(state.free && ev.price_min !== 0) return false;
  if(state.q){ const hay = norm([ev.title, ev.venue, ev.city, ev.organizer, ev.description, (ev.styles||[]).join(' ')].join(' ')); if(!norm(state.q).split(' ').every(w => hay.includes(w))) return false; }
  return true;
}
function occs(opts={}){
  const [from, to] = period(state.when), recTo = REC_HORIZON(), res = [];
  for(const ev of EVENTS){ if(!matchFilters(ev, opts)) continue; for(const d of occurrences(ev, from, to, recTo)) res.push({ev, date:d}); }
  res.sort((a,b) => a.date.localeCompare(b.date) || (a.ev.start_time||'99').localeCompare(b.ev.start_time||'99') || a.ev.title.localeCompare(b.ev.title));
  return res;
}
function nextDates(ev, n){ return occurrences(ev, TODAY, addDays(TODAY, 400), addDays(TODAY, 120)).slice(0, n); }
function isNew(ev){ return META && META.first_seed && ev.added_on && ev.added_on > META.first_seed && ev.added_on >= addDays(TODAY,-7); }
function filtersActive(){ return state.styles.size || state.types.size || state.oneoff || state.free || state.q; }

/* ---------- rendu : cartes ---------- */
const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8L12 3.5z"/></svg>';
function priceTag(ev){ if(ev.price_min === 0) return '<span class="tag free">Gratuit</span>'; if(ev.price) return `<span class="tag">${esc(ev.price.length > 22 ? (ev.price_min!=null ? ev.price_min+' €' : ev.price.slice(0,20)+'…') : ev.price)}</span>`; return ''; }
function cardHTML(o, opts={}){
  const ev = o.ev, styles = (ev.styles||[]).slice(0,4).map(s => `<span class="tag">${esc(STYLE_LABEL[s]||s)}</span>`).join('');
  const multi = ev.end_date && ev.end_date !== ev.date ? `<span class="tag type">Jusqu'au ${esc(fmtDM(ev.end_date))}</span>` : '';
  const type = ev.type !== 'soirée' ? `<span class="tag type">${esc(TYPE_LABEL[ev.type]||ev.type)}</span>` : '';
  const time = ev.start_time ? ev.start_time.replace(':','h') : 'n.c.';
  const dateLine = opts.showDate ? `<small>${esc(fmtShort(o.date))}</small>` : '';
  return `<div class="card" role="button" tabindex="0" data-open="${esc(ev.id)}" data-date="${o.date}">
    <div class="time">${dateLine}${esc(time)}</div>
    <div class="body">
      <div class="title">${esc(ev.title)}</div>
      <div class="where">${esc([ev.venue, ev.city].filter(Boolean).join(' · '))}</div>
      <div class="tags">${isNew(ev)?'<span class="tag new">Nouveau</span>':''}${type}${multi}${styles}${ev.recurrence?`<span class="tag rec">${esc(recLabel(ev.recurrence))}</span>`:''}${priceTag(ev)}${ev.confidence==='moyenne'?'<span class="tag warn">À confirmer</span>':''}</div>
    </div>
    <button class="star" data-fav="${esc(ev.id)}" aria-pressed="${favs.has(ev.id)}" aria-label="${favs.has(ev.id)?'Retirer des favoris':'Ajouter aux favoris'}">${STAR}</button>
  </div>`;
}
function loadingHTML(){ return `<div class="empty loading"><div class="clave" aria-hidden="true">${$('.brand .clave').innerHTML}</div><span>Chargement des soirées…</span></div>`; }
function noDataHTML(){ return `<div class="empty"><b>Soirées indisponibles</b><span>Le chargement n'a pas abouti. Vérifie ta connexion puis réessaie.</span><button class="btn primary" data-retry>Réessayer</button></div>`; }

/* ---------- rendu : agenda ---------- */
function renderChips(){
  const parts = STYLE_GROUPS.map(g => `<button class="chip" data-style="${g.key}" aria-pressed="${state.styles.has(g.key)}">${g.label}</button>`);
  parts.push('<span class="chip sep" aria-hidden="true"></span>');
  TYPE_GROUPS.forEach(g => parts.push(`<button class="chip" data-type="${g.key}" aria-pressed="${state.types.has(g.key)}">${g.label}</button>`));
  parts.push('<span class="chip sep" aria-hidden="true"></span>');
  parts.push(`<button class="chip" data-toggle="oneoff" aria-pressed="${state.oneoff}">Ponctuels</button>`);
  parts.push(`<button class="chip" data-toggle="free" aria-pressed="${state.free}">Gratuit</button>`);
  $('#chips').innerHTML = parts.join('');
  document.querySelectorAll('#whenSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.when === state.when));
}
function renderAgenda(){
  renderChips();
  $('#resetBtn').hidden = !filtersActive();
  const list = $('#list');
  if(NODATA){ list.innerHTML = noDataHTML(); $('#summary').textContent=''; return; }
  if(!LOADED){ list.innerHTML = loadingHTML(); $('#summary').textContent=''; return; }
  const o = occs(), ids = new Set(o.map(x => x.ev.id));
  $('#summary').innerHTML = `<b>${plural(o.length,'date','dates')}</b> · ${plural(ids.size,'événement','événements')} · ${esc(PERIOD_LABEL[state.when])}`;
  if(!o.length){
    list.innerHTML = `<div class="empty"><b>Rien sur cette sélection</b><span>${state.loc.mode==='city' && !state.loc.radius ? 'Essaie un rayon de 10 ou 25 km autour de la ville, ou ' : 'Essaie '}une période plus longue${filtersActive()?', ou retire quelques filtres':''}.</span>${state.when!=='tout'?'<button class="btn primary" data-when-set="tout">Voir toute la saison</button>':''}</div>`;
    return;
  }
  const byDay = new Map();
  o.forEach(x => { if(!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date).push(x); });
  let html = '';
  for(const [d, items] of byDay){
    const rel = relDay(d);
    const n = items.every(i => i.ev.type === 'soirée') ? plural(items.length,'soirée','soirées') : plural(items.length,'date','dates');
    html += `<div class="day"><h3>${esc(fmtDay(d))}${rel?`<span class="rel">${rel}</span>`:''}<span class="n">${n}</span></h3>${items.map(x => cardHTML(x)).join('')}</div>`;
  }
  list.innerHTML = html;
}
function renderNote(){
  const upd = META && META.updated_at ? new Date(META.updated_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) : null;
  const txt = `Événements relevés sur des agendas et sites publics (écoles, associations, billetteries, offices de tourisme). Les annonces publiées seulement sur Facebook ou Instagram n'y figurent pas. Mise à jour automatique chaque lundi${upd?` · <b>dernière mise à jour le ${esc(upd)}</b>`:''}. <button class="linkbtn" data-about>À propos et sources</button>`;
  $('#dataNote').innerHTML = LOADED ? txt : '';
}

/* ---------- rendu : favoris ---------- */
function renderFavs(){
  const box = $('#favs');
  const badge = $('#favBadge');
  const upcoming = EVENTS.filter(e => favs.has(e.id)).map(e => ({ev:e, date: nextDates(e,1)[0]})).filter(x => x.date).sort((a,b) => a.date.localeCompare(b.date));
  badge.hidden = !upcoming.length; badge.textContent = upcoming.length;
  if(NODATA){ box.innerHTML = noDataHTML(); return; }
  if(!LOADED){ box.innerHTML = loadingHTML(); return; }
  if(!upcoming.length){ box.innerHTML = `<div class="empty"><b>Pas encore de favoris</b><span>Touche l'étoile d'une soirée pour la garder ici. Pour une soirée régulière, la prochaine date s'affiche automatiquement.</span></div>`; return; }
  box.innerHTML = `<div class="summary"><span><b>${plural(upcoming.length,'favori','favoris')}</b> à venir, toutes zones confondues</span></div>` + upcoming.map(x => cardHTML(x, {showDate:true})).join('');
}

/* ---------- rendu : stats ---------- */
function vbars(rows, opts={}){
  const max = Math.max(1, ...rows.map(r => r.v));
  return `<div class="vbars${rows.length > 8 ? ' dense' : ''}">${rows.map(r => `<div class="vbar"><span class="val">${r.v}</span><div class="bar ${r.dim?'dim':''}" style="height:${(r.v/max*100).toFixed(1)}%"></div><span class="lab">${esc(r.l)}</span></div>`).join('')}</div>`;
}
function hbars(rows, color=''){
  const max = Math.max(1, ...rows.map(r => r.v));
  return `<div class="hbars">${rows.map(r => `<div class="hbar"><span class="lab" title="${esc(r.l)}">${esc(r.l)}</span><div class="track"><div class="fill ${color}" style="width:${(r.v/max*100).toFixed(1)}%"></div></div><span class="val">${r.v}</span></div>`).join('')}</div>`;
}
function renderStats(){
  const box = $('#stats');
  if(NODATA){ box.innerHTML = noDataHTML(); return; }
  if(!LOADED){ box.innerHTML = loadingHTML(); return; }
  const o = occs({all:true});
  const evs = [...new Map(o.map(x => [x.ev.id, x.ev])).values()];
  const scope = `<div class="seg" role="group" aria-label="Période">${['weekend','7j','30j','tout'].map(k=>`<button data-when-set="${k}" aria-pressed="${state.when===k}">${{weekend:'Week-end','7j':'7 jours','30j':'30 jours',tout:'Tout'}[k]}</button>`).join('')}</div><p class="note" style="padding:0">Calculé sur ${esc(PERIOD_LABEL[state.when])}, ${esc(locLabel().short)}, tous styles confondus.</p>`;
  if(!o.length){ box.innerHTML = scope + `<div class="empty"><b>Pas assez de données</b><span>Aucun événement sur cette zone et cette période. Élargis la zone ou la période.</span></div>`; return; }
  // weekday
  const wdCount = [0,0,0,0,0,0,0]; o.forEach(x => wdCount[parse(x.date).getDay()]++);
  const order = [1,2,3,4,5,6,0], maxWd = Math.max(...wdCount), topWd = order.reduce((a,b) => wdCount[b] > wdCount[a] ? b : a, 1);
  // prices
  const known = evs.filter(e => typeof e.price_min === 'number').map(e => e.price_min).sort((a,b)=>a-b);
  const median = known.length ? (known.length%2 ? known[(known.length-1)/2] : (known[known.length/2-1]+known[known.length/2])/2) : null;
  const cities = new Set(evs.map(cityKey));
  // styles
  const sc = {}; evs.forEach(e => (e.styles||[]).forEach(s => sc[s] = (sc[s]||0)+1));
  const styleRows = Object.entries(sc).sort((a,b)=>b[1]-a[1]).map(([s,v]) => ({l:STYLE_LABEL[s]||s, v}));
  // where
  let whereTitle, whereRows;
  if(state.loc.mode === 'region'){ whereTitle = 'Dates par département'; const c={}; o.forEach(x => c[x.ev.dept_code]=(c[x.ev.dept_code]||0)+1); whereRows = Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v]) => ({l:DEPTS[k]||k, v})); }
  else if(state.loc.mode === 'dept' || (state.loc.mode==='city' && state.loc.radius)){ whereTitle = 'Dates par ville'; const c={}; o.forEach(x => c[x.ev.city]=(c[x.ev.city]||0)+1); whereRows = Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => ({l:k, v})); }
  else { whereTitle = 'Dates par lieu'; const c={}; o.forEach(x => { const k = x.ev.venue || x.ev.organizer || x.ev.city; c[k]=(c[k]||0)+1; }); whereRows = Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => ({l:k, v})); }
  // weeks
  const [from, to] = period(state.when); const weeks = [];
  const wEnd = to < REC_HORIZON() ? to : REC_HORIZON();
  let ws = addDays(from, -((parse(from).getDay()+6)%7));
  while(ws <= wEnd && weeks.length < 12){ const we = addDays(ws, 6), wd = parse(ws); weeks.push({l: `${wd.getDate()}/${wd.getMonth()+1}`, v: o.filter(x => x.date >= ws && x.date <= we).length}); ws = addDays(ws, 7); }
  // price buckets
  const pb = [['Gratuit',0,'ok'],['1 à 10 €',0],['11 à 20 €',0],['Plus de 20 €',0],['Non précisé',0]];
  evs.forEach(e => { const p = e.price_min; if(p==null) pb[4][1]++; else if(p===0) pb[0][1]++; else if(p<=10) pb[1][1]++; else if(p<=20) pb[2][1]++; else pb[3][1]++; });
  const types = {}; evs.forEach(e => types[e.type] = (types[e.type]||0)+1);
  const recShare = Math.round(evs.filter(e=>e.recurrence).length / evs.length * 100);

  box.innerHTML = scope + `
  <div class="kpis">
    <div class="kpi"><span class="v">${o.length}</span><span class="k">dates de danse</span></div>
    <div class="kpi"><span class="v">${cities.size}</span><span class="k">${cities.size>1?'villes actives':'ville active'}</span></div>
    <div class="kpi"><span class="v">${median==null?'n.c.':(median===0?'0 €':Math.round(median)+' €')}</span><span class="k">prix d'entrée médian</span></div>
    <div class="kpi"><span class="v" style="text-transform:capitalize">${maxWd?WD[topWd].slice(0,3)+'.':'n.c.'}</span><span class="k">soir le plus chargé</span></div>
  </div>
  <div class="panel"><h3>Quel soir sortir ?</h3><p>Nombre de dates par jour de la semaine.</p>${vbars(order.map(i => ({l:WD_SHORT[i], v:wdCount[i], dim:wdCount[i]<maxWd})))}</div>
  ${weeks.length>1?`<div class="panel"><h3>Les semaines à venir</h3><p>Dates par semaine, du lundi au dimanche.</p>${vbars(weeks.map((w,i)=>({l:w.l, v:w.v, dim:false})))}</div>`:''}
  <div class="panel"><h3>Styles au programme</h3><p>Nombre d'événements qui proposent chaque style (une soirée peut en mêler plusieurs).</p>${hbars(styleRows)}</div>
  <div class="panel"><h3>${whereTitle}</h3>${hbars(whereRows,'mango')}</div>
  <div class="panel"><h3>Combien ça coûte</h3><p>Prix d'entrée le plus bas annoncé, par événement.</p>${hbars(pb.map(r=>({l:r[0], v:r[1]})),'ok')}</div>
  <div class="panel"><h3>Formats</h3><p>${recShare} % des événements sont des soirées régulières.</p>${hbars(Object.entries(types).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({l:TYPE_LABEL[k]||k, v})))}</div>
  <p class="note">${$('#dataNote').innerHTML}</p>`;
}

/* ---------- carte ---------- */
let map = null, deptLayer = null, bubbleLayer = null, extraLayer = null;
function deptSelected(code){
  const L = state.loc;
  if(L.mode === 'dept') return code === L.dept;
  if(L.mode === 'city' && L.city) return code === L.city.d;
  return false;
}
function deptStyle(f){ const sel = deptSelected(f.properties.code); return {color: cssVar('--map-edge'), weight: sel?1.6:1, fillColor: sel ? cssVar('--map-sel') : cssVar('--map-land'), fillOpacity: 1}; }
function initMap(){
  if(map) return;
  if(!GEO) return;
  if(typeof L === 'undefined'){ $('#map').innerHTML = '<div class="empty" style="height:100%;justify-content:center"><b>Carte indisponible</b><span>La bibliothèque de carte ne s\'est pas chargée. Recharge la page.</span></div>'; return; }
  map = L.map('map', {zoomSnap:0.25, minZoom:6, maxZoom:13, attributionControl:true});
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Contours IGN Admin Express · Villes GeoNames');
  deptLayer = L.geoJSON(GEO, {style: deptStyle, onEachFeature: (f, layer) => layer.on('click', () => { state.mapCity = null; renderCityPanel(); })}).addTo(map);
  map.createPane('labels'); map.getPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none';
  map.on('zoomend', drawBubbles);
  GEO.features.filter(f => !f.properties.metro).forEach(f => L.marker(f.properties.lab, {pane:'labels', interactive:false, keyboard:false, icon: L.divIcon({className:'', html:`<div class="dept-label">${esc(f.properties.nom)}</div>`, iconSize:[0,0]})}).addTo(map));
  extraLayer = L.layerGroup().addTo(map);
  bubbleLayer = L.layerGroup().addTo(map);
  map.setMaxBounds(deptLayer.getBounds().pad(0.35));
  fitMap();
}
function fitMap(){
  if(!map) return;
  const Lc = state.loc;
  extraLayer.clearLayers();
  if(Lc.mode === 'city' && Lc.city){
    L.circle([Lc.city.lat, Lc.city.lng], {radius: Math.max(Lc.radius, 2)*1000, color: cssVar('--accent'), weight: 1.5, dashArray: '5 5', fill: false, interactive:false}).addTo(extraLayer);
    map.fitBounds(L.latLng(Lc.city.lat, Lc.city.lng).toBounds(Math.max(Lc.radius, 8)*2000), {padding:[16,16]});
  } else if(Lc.mode === 'dept'){
    const layers = []; deptLayer.eachLayer(l => { if(l.feature.properties.code === Lc.dept) layers.push(l); });
    if(layers.length) map.fitBounds(L.featureGroup(layers).getBounds(), {padding:[12,12]});
  } else map.fitBounds(deptLayer.getBounds(), {padding:[8,8]});
}
function renderMap(){
  if(!map) return;
  deptLayer.setStyle(deptStyle);
  bubbleLayer.clearLayers();
  const o = LOADED ? occs() : [];
  const groups = new Map();
  o.forEach(x => { const k = cityKey(x.ev); if(!groups.has(k)) groups.set(k, {k, city:x.ev.city, dept:x.ev.dept_code, lat:x.ev.lat, lng:x.ev.lng, n:0, ids:new Set()}); const g = groups.get(k); g.n++; g.ids.add(x.ev.id); });
  $('#mapSummary').innerHTML = LOADED ? `<b>${plural(o.length,'date','dates')}</b> dans <b>${plural(groups.size,'ville','villes')}</b> · ${esc(PERIOD_LABEL[state.when])}${filtersActive()?' · filtres de l\'agenda appliqués':''}` : '';
  map._groups = groups;
  drawBubbles();
}
function drawBubbles(){
  if(!map || !map._groups) return;
  bubbleLayer.clearLayers();
  const z = map.getZoom(), clusters = [];
  for(const g of [...map._groups.values()].sort((a,b) => b.n - a.n)){
    const pt = map.project([g.lat, g.lng], z);
    const c = clusters.find(c => c.pt.distanceTo(pt) < 30 + 5*Math.sqrt(c.n));
    if(c){ c.members.push(g); c.n += g.n; } else clusters.push({pt, lat:g.lat, lng:g.lng, n:g.n, members:[g]});
  }
  clusters.sort((a,b) => a.n - b.n).forEach(c => {
    const size = Math.round(24 + 7*Math.sqrt(c.n)), single = c.members.length === 1, g0 = c.members[0];
    const sel = c.members.some(m => m.k === state.mapCity);
    const title = single ? `${g0.city} : ${c.n} dates` : `${c.members.map(m => m.city).join(', ')} : ${c.n} dates`;
    const m = L.marker([c.lat, c.lng], {title, icon: L.divIcon({className:'', iconSize:[size,size], iconAnchor:[size/2,size/2], html:`<div class="bubble${sel?' sel':''}${single?'':' multi'}">${c.n}</div>`})});
    m.on('click', () => {
      if(single){ state.mapCity = g0.k; drawBubbles(); renderCityPanel(); }
      else map.fitBounds(L.latLngBounds(c.members.map(x => [x.lat, x.lng])), {padding:[48,48], maxZoom:12});
    });
    m.addTo(bubbleLayer);
  });
}
function renderCityPanel(){
  const box = $('#cityPanel');
  if(NODATA){ box.innerHTML = noDataHTML(); return; }
  if(!LOADED){ box.innerHTML = loadingHTML(); return; }
  const o = occs();
  if(state.mapCity){
    const sel = o.filter(x => cityKey(x.ev) === state.mapCity);
    if(!sel.length){ state.mapCity = null; return renderCityPanel(); }
    const byEv = new Map(); sel.forEach(x => { if(!byEv.has(x.ev.id)) byEv.set(x.ev.id, {ev:x.ev, dates:[]}); byEv.get(x.ev.id).dates.push(x.date); });
    box.innerHTML = `<h3>${esc(sel[0].ev.city)} <small>${plural(sel.length,'date','dates')} · ${esc(DEPTS[sel[0].ev.dept_code])}</small></h3><div class="rows">${[...byEv.values()].sort((a,b)=>a.dates[0].localeCompare(b.dates[0])).map(r => `<button class="row" data-open="${esc(r.ev.id)}" data-date="${r.dates[0]}"><span class="l"><b>${esc(r.ev.title)}</b><small>${esc(r.ev.venue||'Lieu à préciser')} · ${r.ev.recurrence?esc(recLabel(r.ev.recurrence)):esc(fmtShort(r.dates[0]))}</small></span><span class="r">${r.dates.length>1?r.dates.length+' dates<br>':''}${esc(fmtDM(r.dates[0]))}</span></button>`).join('')}</div>`;
  } else {
    const c = new Map(); o.forEach(x => { const k = cityKey(x.ev); if(!c.has(k)) c.set(k, {k, city:x.ev.city, dept:x.ev.dept_code, n:0}); c.get(k).n++; });
    const top = [...c.values()].sort((a,b)=>b.n-a.n).slice(0,8);
    box.innerHTML = top.length ? `<p class="lbl-sm">Touche une bulle, ou choisis une ville</p><div class="rows">${top.map(t => `<button class="row" data-mapcity="${esc(t.k)}"><span class="l"><b>${esc(t.city)}</b><small>${esc(DEPTS[t.dept])}</small></span><span class="r">${plural(t.n,'date','dates')}</span></button>`).join('')}</div>` : `<div class="empty"><b>Aucune soirée à afficher</b><span>Élargis la période dans l'agenda ou change de zone.</span></div>`;
  }
}

/* ---------- feuille lieu ---------- */
let locMode = null;
function openLoc(){ locMode = state.loc.mode; state.radiusDraft = state.loc.radius || 0; $('#locSheet').hidden = false; renderLoc(); }
function closeSheets(){ document.querySelectorAll('.backdrop').forEach(b => b.hidden = true); }
function counts(){
  const [from,to] = period('tout'), recTo = REC_HORIZON(), byDept = {}, byCity = new Map();
  for(const ev of EVENTS){ if(!occurrences(ev, from, to, recTo).length) continue; byDept[ev.dept_code] = (byDept[ev.dept_code]||0)+1; const k = cityKey(ev); if(!byCity.has(k)) byCity.set(k, {n:ev.city, d:ev.dept_code, lat:ev.lat, lng:ev.lng, c:0}); byCity.get(k).c++; }
  return {byDept, byCity:[...byCity.values()].sort((a,b)=>b.c-a.c)};
}
function renderLoc(){
  document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === locMode));
  const body = $('#locBody'), {byDept, byCity} = counts(), total = Object.values(byDept).reduce((a,b)=>a+b,0);
  if(locMode === 'region'){
    body.innerHTML = `<div class="list-btns"><button class="opt" data-pick-region aria-pressed="${state.loc.mode==='region'}"><span class="code">ARA</span><span class="nm">${REGION.name}<small>12 départements · ${plural(total,'événement','événements')} à venir</small></span></button></div><p class="note">D'autres régions arriveront ensuite.</p>`;
  } else if(locMode === 'dept'){
    const codes = Object.keys(DEPTS).sort((a,b) => DEPTS[a].localeCompare(DEPTS[b], 'fr'));
    body.innerHTML = `<div class="list-btns">${codes.map(c => `<button class="opt" data-pick-dept="${c}" aria-pressed="${state.loc.mode==='dept'&&state.loc.dept===c}"><span class="code">${c}</span><span class="nm">${esc(DEPTS[c])}</span><span class="ct">${byDept[c]?plural(byDept[c],'événement','événements'):'aucun pour l\'instant'}</span></button>`).join('')}</div>`;
  } else {
    const r = state.radiusDraft;
    body.innerHTML = `
      <label class="search" for="citySearch"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="citySearch" type="search" placeholder="Une commune : Vienne, Chambéry, Riom…" autocomplete="off"></label>
      <div><p class="lbl-sm" style="margin-bottom:8px">Rayon autour de la ville</p><div class="seg" id="radiusSeg">${[0,10,25,50].map(v => `<button data-radius="${v}" aria-pressed="${r===v}">${v?v+' km':'Ville seule'}</button>`).join('')}</div></div>
      <div class="list-btns" id="cityResults" hidden></div>
      <div id="cityQuick"><p class="lbl-sm" style="margin-bottom:8px">Villes avec des événements</p><div class="list-btns">${byCity.slice(0,12).map(c => `<button class="opt" data-pick-city="${esc(c.n)}|${c.d}" aria-pressed="${state.loc.mode==='city'&&state.loc.city&&norm(state.loc.city.n)===norm(c.n)}"><span class="code">${c.d}</span><span class="nm">${esc(c.n)}</span><span class="ct">${plural(c.c,'événement','événements')}</span></button>`).join('')}</div></div>`;
  }
}
function findCommune(name, dept){
  const n = norm(name);
  const row = COMMUNES.find(r => norm(r[0]) === n && r[1] === dept);
  if(row) return {n: row[0], d: row[1], lat: row[2], lng: row[3]};
  const ev = EVENTS.find(e => norm(e.city) === n && e.dept_code === dept);
  return ev ? {n: ev.city, d: ev.dept_code, lat: ev.lat, lng: ev.lng} : null;
}
function searchCities(q){
  const n = norm(q); if(n.length < 2) return [];
  const res = [];
  for(const r of COMMUNES){ const nn = norm(r[0]); const i = nn.indexOf(n); if(i === -1) continue; res.push({r, score: (i===0?0:1)*1e7 - r[4]}); }
  return res.sort((a,b)=>a.score-b.score).slice(0,8).map(x => x.r);
}
function setLoc(loc){ state.loc = loc; state.mapCity = null; persist(); closeSheets(); renderAll(); fitMap(); }

/* ---------- feuille événement ---------- */
function openEvent(id, date){
  const ev = EVENTS.find(e => e.id === id); if(!ev) return;
  const nd = nextDates(ev, 6);
  const d = date || nd[0] || ev.date;
  const when = `${fmtDay(d)}${ev.start_time ? ' · ' + ev.start_time.replace(':','h') : ''}${ev.end_date && ev.end_date!==ev.date ? ` · jusqu'au ${fmtDay(ev.end_date)}` : ''}`;
  const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([ev.venue, ev.address || ev.city].filter(Boolean).join(', '));
  const fav = favs.has(ev.id);
  $('#evBody').innerHTML = `
    <div class="grab" aria-hidden="true"></div>
    <div class="sheet-head"><h2 id="evTitle">${esc(ev.title)}</h2><button class="icon-btn" data-close aria-label="Fermer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="tags"><span class="tag type">${esc(TYPE_LABEL[ev.type]||ev.type)}</span>${(ev.styles||[]).map(s=>`<span class="tag">${esc(STYLE_LABEL[s]||s)}</span>`).join('')}${ev.recurrence?`<span class="tag rec">${esc(recLabel(ev.recurrence))}</span>`:''}${priceTag(ev)}</div>
    ${ev.confidence==='moyenne'?'<div class="callout">Annonce à confirmer : la source ne précise pas toutes les infos ou ne date pas sa mise à jour. Vérifie auprès de l\'organisateur avant de te déplacer.</div>':''}
    <div class="detail-meta">
      <div class="dm"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><div><span style="text-transform:capitalize">${esc(when)}</span>${ev.start_time?'':'<small>Horaire non communiqué</small>'}</div></div>
      <div class="dm"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg><div>${esc(ev.venue || 'Lieu à préciser')}<small>${esc(ev.address || ev.city)} · ${esc(DEPTS[ev.dept_code]||'')}</small></div></div>
      <div class="dm"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h18M3 15h18" /><rect x="3" y="5" width="18" height="14" rx="2.5"/></svg><div>${esc(ev.price || 'Prix non communiqué')}${ev.organizer?`<small>Organisé par ${esc(ev.organizer)}</small>`:''}</div></div>
    </div>
    ${ev.description?`<p class="desc">${esc(ev.description)}</p>`:''}
    ${ev.recurrence && nd.length>1?`<div><p class="lbl-sm" style="margin-bottom:8px">Prochaines dates</p><div class="next-dates">${nd.map(x=>`<span class="tag">${esc(fmtShort(x))}</span>`).join('')}</div></div>`:''}
    <div class="actions">
      <a class="btn primary" href="${esc(ev.source_url)}" target="_blank" rel="noopener">Voir l'annonce</a>
      <a class="btn" href="${maps}" target="_blank" rel="noopener">Itinéraire</a>
      <button class="btn" data-copy="${esc([ev.venue, ev.address || ev.city].filter(Boolean).join(', '))}">Copier l'adresse</button>
      <button class="btn" data-fav="${esc(ev.id)}" aria-pressed="${fav}">${fav?'Retirer des favoris':'Ajouter aux favoris'}</button>
    </div>
    <p class="note" style="padding:0">Source : ${esc(ev.source_name || hostOf(ev.source_url))}</p>`;
  $('#evSheet').hidden = false;
}

/* ---------- favoris ---------- */
let favWriting = false, favDirty = false;
async function saveFavs(){
  store('clave.favs', [...favs]);
  if(!favRef) return;
  if(favWriting){ favDirty = true; return; }
  favWriting = true;
  try{ await favRef.set({ids:[...favs]}); }catch(e){ favRef = null; }
  favWriting = false;
  if(favDirty){ favDirty = false; saveFavs(); }
}
function toggleFav(id){
  if(favs.has(id)){ favs.delete(id); toast('Retiré des favoris'); } else { favs.add(id); toast('Ajouté aux favoris'); }
  saveFavs();
  document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach(b => { const on = favs.has(id); b.setAttribute('aria-pressed', on); if(b.classList.contains('btn')) b.textContent = on ? 'Retirer des favoris' : 'Ajouter aux favoris'; else b.setAttribute('aria-label', on?'Retirer des favoris':'Ajouter aux favoris'); });
  if(state.tab === 'favoris') renderFavs(); else { const badge = $('#favBadge'); const n = EVENTS.filter(e => favs.has(e.id) && nextDates(e,1).length).length; badge.hidden = !n; badge.textContent = n; }
}

/* ---------- navigation ---------- */
function setTab(t){
  state.tab = t;
  ['agenda','carte','stats','favoris'].forEach(k => { $('#view-'+k).hidden = k !== t; document.querySelector(`.tabs [data-tab="${k}"]`).toggleAttribute('aria-current', k===t); if(k===t) document.querySelector(`.tabs [data-tab="${k}"]`).setAttribute('aria-current','page'); });
  window.scrollTo(0,0);
  if(t === 'carte'){ initMap(); if(map){ setTimeout(() => { map.invalidateSize(); fitMap(); renderMap(); }, 30); } renderCityPanel(); }
  if(t === 'stats') renderStats();
  if(t === 'favoris') renderFavs();
}
function renderHeader(){ const l = locLabel(); $('#locKind').textContent = l.kind; $('#locName').textContent = l.name; }
function renderAll(){
  renderHeader(); renderNote(); renderAgenda();
  if(state.tab === 'stats') renderStats();
  if(state.tab === 'favoris') renderFavs(); else { const n = EVENTS.filter(e => favs.has(e.id) && nextDates(e,1).length).length; $('#favBadge').hidden = !n; $('#favBadge').textContent = n; }
  if(state.tab === 'carte'){ renderMap(); renderCityPanel(); }
}

/* ---------- événements UI ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-open], a'); if(!t) return;
  if(t.dataset.fav){ e.stopPropagation(); toggleFav(t.dataset.fav); return; }
  if(t.dataset.copy !== undefined && t.dataset.copy){ const txt = t.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Adresse copiée'), () => toast(txt)); return; }
  if(t.dataset.open){ openEvent(t.dataset.open, t.dataset.date); return; }
  if(t.hasAttribute('data-retry')){ NODATA = false; renderAll(); initData(); return; }
  if(t.hasAttribute('data-about')){ openAbout(); return; }
  if(t.hasAttribute('data-install')){ promptInstall(); return; }
  if(t.hasAttribute('data-install-dismiss')){ store('clave.installDismissed', true); renderInstall(); return; }
  if(t.hasAttribute('data-close')){ closeSheets(); return; }
  if(t.dataset.tab){ setTab(t.dataset.tab); return; }
  if(t.dataset.when){ state.when = t.dataset.when; persist(); renderAll(); return; }
  if(t.dataset.whenSet){ state.when = t.dataset.whenSet; persist(); renderAll(); return; }
  if(t.dataset.style){ const k = t.dataset.style; state.styles.has(k) ? state.styles.delete(k) : state.styles.add(k); persist(); renderAll(); return; }
  if(t.dataset.type){ const k = t.dataset.type; state.types.has(k) ? state.types.delete(k) : state.types.add(k); persist(); renderAll(); return; }
  if(t.dataset.toggle){ state[t.dataset.toggle] = !state[t.dataset.toggle]; persist(); renderAll(); return; }
  if(t.id === 'resetBtn'){ state.styles.clear(); state.types.clear(); state.oneoff = false; state.free = false; state.q = ''; $('#q').value = ''; persist(); renderAll(); return; }
  if(t.id === 'locBtn'){ openLoc(); return; }
  if(t.dataset.mode){ locMode = t.dataset.mode; renderLoc(); return; }
  if(t.hasAttribute('data-pick-region')){ setLoc({mode:'region'}); return; }
  if(t.dataset.pickDept){ setLoc({mode:'dept', dept:t.dataset.pickDept}); return; }
  if(t.dataset.pickCity){ const [n, d] = t.dataset.pickCity.split('|'); const c = findCommune(n, d); if(c) setLoc({mode:'city', city:c, radius: state.radiusDraft}); return; }
  if(t.dataset.radius !== undefined){ state.radiusDraft = Number(t.dataset.radius); document.querySelectorAll('#radiusSeg button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.radius) === state.radiusDraft)); if(state.loc.mode === 'city'){ state.loc.radius = state.radiusDraft; persist(); renderHeader(); renderAll(); fitMap(); } return; }
  if(t.dataset.mapcity){ state.mapCity = t.dataset.mapcity; renderMap(); renderCityPanel(); const g = map && map._groups && map._groups.get(state.mapCity); if(g) map.setView([g.lat, g.lng], Math.max(map.getZoom(), 10)); return; }
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeSheets();
  if((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card[data-open]')){ e.preventDefault(); openEvent(e.target.dataset.open, e.target.dataset.date); }
});
document.querySelectorAll('.backdrop').forEach(b => b.addEventListener('click', e => { if(e.target === b) closeSheets(); }));
let qTimer; $('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value.trim(); renderAgenda(); }, 150); });
document.addEventListener('input', e => {
  if(e.target.id !== 'citySearch') return;
  const res = searchCities(e.target.value), box = $('#cityResults'), quick = $('#cityQuick');
  box.hidden = !res.length; quick.hidden = !!e.target.value.trim();
  box.innerHTML = res.map(r => `<button class="opt" data-pick-city="${esc(r[0])}|${r[1]}"><span class="code">${r[1]}</span><span class="nm">${esc(r[0])}<small>${esc(DEPTS[r[1]])}</small></span></button>`).join('');
  if(!res.length && norm(e.target.value).length >= 2){ box.hidden = false; box.innerHTML = '<div class="opt" style="color:var(--muted)">Aucune commune trouvée en Auvergne-Rhône-Alpes.</div>'; }
});
const mq = matchMedia('(prefers-color-scheme: dark)');
const restyle = () => { if(deptLayer){ deptLayer.setStyle(deptStyle); fitMap(); } };
mq.addEventListener ? mq.addEventListener('change', restyle) : mq.addListener(restyle);
new MutationObserver(restyle).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});

/* ---------- données ---------- */
async function getJSON(u){ const r = await fetch(u, {cache:'no-cache'}); if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
async function initData(){
  try{
    const [ev, meta, communes, geo] = await Promise.all([
      getJSON('data/events.json'), getJSON('data/meta.json').catch(() => null),
      getJSON('data/communes.json').catch(() => []), getJSON('data/depts.geo.json').catch(() => null)
    ]);
    EVENTS = (Array.isArray(ev) ? ev : []).filter(e => e && e.id && e.date && e.city);
    META = meta; COMMUNES = Array.isArray(communes) ? communes : []; GEO = geo;
    LOADED = true; NODATA = false;
  }catch(e){ if(!LOADED) NODATA = true; }
  renderAll();
  if(state.tab === 'carte') setTab('carte');
}

/* ---------- à propos ---------- */
function openAbout(){
  const upd = META && META.updated_at ? new Date(META.updated_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) : 'inconnue';
  $('#aboutUpd').textContent = upd;
  $('#aboutCount').textContent = EVENTS.length ? plural(EVENTS.length,'événement','événements') : 'les événements';
  $('#aboutSheet').hidden = false;
}

/* ---------- installation ---------- */
let deferredPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; store('clave.installDismissed', true); renderInstall(); toast('Clave Salsa est installée'); });
function renderInstall(){
  const box = $('#installBanner'); if(!box) return;
  const show = !isStandalone() && !load('clave.installDismissed') && (deferredPrompt || isIOS);
  box.hidden = !show;
  if(!show) return;
  const how = deferredPrompt
    ? `<span>Ajoute Clave Salsa à ton écran d'accueil pour l'ouvrir comme une app, même sans réseau.</span><div class="install-actions"><button class="btn primary" data-install>Installer</button><button class="btn" data-install-dismiss>Plus tard</button></div>`
    : `<span>Dans Safari, touche le bouton Partager puis « Sur l'écran d'accueil ». L'app s'ouvrira comme les autres, même sans réseau.</span><div class="install-actions"><button class="btn" data-install-dismiss>Compris</button></div>`;
  box.innerHTML = `<b>Installer l'app</b>${how}`;
}
async function promptInstall(){
  if(!deferredPrompt){ openAbout(); return; }
  deferredPrompt.prompt();
  try{ const c = await deferredPrompt.userChoice; if(c && c.outcome === 'accepted') store('clave.installDismissed', true); }catch(e){}
  deferredPrompt = null; renderInstall();
}

/* ---------- démarrage ---------- */
if(['agenda','carte','stats','favoris'].includes(location.hash.slice(1))) state.tab = location.hash.slice(1);
renderAll(); setTab(state.tab); renderInstall();
initData();
if('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
