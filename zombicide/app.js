/* Carnet de survie Zombicide : suivi d'une partie de Zombicide 2e édition. */
(function(){
"use strict";
const D = window.ZDATA || {characters:[], skills:{}, equipment:[], doorTools:[], startingGear:""};
const IS_PWA = !!document.querySelector('link[rel="manifest"]');
const KEY = "zombicide-carnet-v2";
const OLD_KEY = "zombicide-carnet-v1";
const PREF_KEY = "zombicide-carnet-prefs";
const YELLOW_SKILL = "+1 Action";
const LEVELS = [
  {name:"Bleu", low:"bleu", key:"blue", min:0},
  {name:"Jaune", low:"jaune", key:"yellow", min:7},
  {name:"Orange", low:"orange", key:"orange", min:19},
  {name:"Rouge", low:"rouge", key:"red", min:43}
];
const PHASES = [
  {id:"joueurs", name:"Joueurs", log:"Phase des joueurs"},
  {id:"activation", name:"Zombies", log:"Phase des zombies : activation"},
  {id:"apparition", name:"Apparition", log:"Phase des zombies : apparition"},
  {id:"fin", name:"Fin", log:"Fin du tour"}
];
const KILLS = {
  marcheur:{label:"Marcheur", art:"un marcheur", xp:1},
  coureur:{label:"Coureur", art:"un coureur", xp:1},
  brute:{label:"Brute", art:"une brute", xp:1},
  abo:{label:"Abomination", art:"une abomination", xp:5}
};
const SLOTS = ["Main gauche", "Main droite", "Sac", "Sac", "Sac"];
const ACTIONS = [
  {id:"move", name:"Se déplacer", short:"Passer dans une zone voisine.",
    rules:["1 action par zone. Une porte se traverse seulement si elle est ouverte.","Quitter une zone qui contient des zombies coûte 1 action supplémentaire par zombie.","Pas de diagonale, pas de passage à travers les murs."]},
  {id:"search", name:"Fouiller", short:"Piocher une carte Équipement.",
    rules:["Une seule fouille par tour et par survivant.","Seulement dans une zone de bâtiment, sans zombie.","Carte « Aaahh!! » : un marcheur apparaît dans ta zone et la fouille s'arrête.","Après la fouille, tu réorganises ton inventaire gratuitement."]},
  {id:"door", name:"Ouvrir une porte", short:"Avec un équipement portant le symbole porte.",
    rules:["L'outil ou l'arme doit être en main : pied-de-biche, hache, tronçonneuse…","Si l'outil est bruyant, pose un jeton Bruit dans ta zone.","Première porte ouverte d'un bâtiment : pioche une carte Zombie pour chacune de ses pièces."]},
  {id:"melee", name:"Attaquer au corps à corps", short:"Frapper les zombies de ta zone.",
    rules:["Lance autant de dés que l'arme en indique.","Chaque dé égal ou supérieur à la précision fait une touche.","Dégâts requis : 1 pour marcheur et coureur, 2 pour une brute, 3 pour une abomination.","Tu répartis les touches comme tu veux."]},
  {id:"ranged", name:"Tirer à distance", short:"Viser une zone en ligne de vue, à portée de l'arme.",
    rules:["Mêmes dés, précision et dégâts qu'au corps à corps.","Ordre des touches imposé : brutes et abominations, puis marcheurs, puis coureurs.","Les dés ratés touchent les autres survivants présents dans la zone visée.","Deux armes identiques à symbole double : une seule action pour tirer avec les deux."]},
  {id:"objective", name:"Prendre un objectif", short:"Ramasser un jeton Objectif de ta zone : +5 XP.",
    rules:["Le jeton doit se trouver dans ta zone.","Certains objectifs de couleur ouvrent une porte ou déclenchent un effet : lis la fiche mission."]},
  {id:"trade", name:"Réorganiser ou échanger", short:"Ranger ton inventaire ou échanger avec un survivant de ta zone.",
    rules:["Inventaire : 2 emplacements en main, 3 dans le sac.","Seules les cartes en main servent à attaquer ou à ouvrir.","Lors d'un échange, l'autre survivant réorganise aussi, sans dépenser d'action."]},
  {id:"noise", name:"Faire du bruit", short:"Poser un jeton Bruit dans ta zone.",
    rules:["Sert à attirer les zombies loin d'un allié.","Les jetons Bruit sont retirés à la fin du tour."]}
];
const FREE_FOR = {move:["move"], search:["search"], melee:["melee","combat"], ranged:["ranged","combat"]};
const FREE_LABEL = {move:"déplacement", search:"fouille", melee:"corps à corps", ranged:"tir", combat:"combat"};
const CHAR = {};
D.characters.forEach(c => { CHAR[c.id] = c; });

/* Données de partie */
const DMG = {marcheur:1, coureur:1, brute:2, abo:3};
function blankStats(){ return {kills:{}, melee:0, ranged:0, missM:0, missR:0, ff:0, ffTaken:0, search:0, found:0, aaah:0, doors:0, obj:0, moves:0, noise:0, hurt:0, lost:0, free:0, slip:0}; }
let seq = 0;
function uid(){ return "s" + Date.now().toString(36) + (seq++); }
function newSurvivor(item){
  return {id:uid(), charId:item.charId || null, name:item.name, blue:item.charId ? "" : (item.blue || ""), kid:!!item.kid,
    xp:0, wounds:0, used:0, searched:false, done:false, dead:false, inB:false, z:0,
    skills:{orange:null, red:null}, inv:["","","","",""], free:{}, st:blankStats()};
}
function emptyState(draft){
  return {v:2, setup:true, started:false, draft:draft || [], round:1, phase:"joueurs", firstId:null, active:null,
    survivors:[], objectives:0, kills:{}, log:[], last:null, checks:{}, ended:null};
}
function migrate(s){
  if(!s || !Array.isArray(s.survivors)) return null;
  if(s.v === 1){
    s.v = 2; s.setup = false; s.started = true; s.draft = [];
    s.survivors.forEach(x => {
      const c = D.characters.find(ch => ch.name.toLowerCase() === String(x.name).toLowerCase());
      x.charId = c ? c.id : null; x.blue = ""; x.skills = {orange:null, red:null}; x.inv = ["","","","",""]; x.free = {};
    });
    delete s.example;
  }
  if(s.v !== 2) return null;
  s.survivors.forEach(x => {
    if(!x.skills) x.skills = {orange:null, red:null};
    if(!Array.isArray(x.inv) || x.inv.length !== 5) x.inv = ["","","","",""];
    if(!x.free) x.free = {};
    x.st = Object.assign(blankStats(), x.st || {});
    if(!x.st.kills) x.st.kills = {};
  });
  if(!Array.isArray(s.draft)) s.draft = [];
  if(s.ended === undefined) s.ended = null;
  return s;
}
function load(){
  try{
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    if(raw) return migrate(JSON.parse(raw));
  }catch(e){}
  return null;
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
function prefGet(k){ try{ return (JSON.parse(localStorage.getItem(PREF_KEY) || "{}"))[k]; }catch(e){ return undefined; } }
function prefSet(k, v){ try{ const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); p[k] = v; localStorage.setItem(PREF_KEY, JSON.stringify(p)); }catch(e){} }

let state = load() || emptyState();
let hist = [];
let confirmNew = false;
let wantScroll = false;
const openDetails = new Set();
const editing = new Set();
let viewStats = false;
let confirmEnd = false;

/* Outils */
const $ = id => document.getElementById(id);
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function pl(n, a, b){ return n > 1 ? b : a; }
function get(id){ return state.survivors.find(s => s.id === id) || null; }
function lvl(xp){ let i = 0; LEVELS.forEach((l, j) => { if(xp >= l.min) i = j; }); return i; }
function skillInfo(name){ return name ? (D.skills[name] || null) : null; }
function blueOf(s){ const c = CHAR[s.charId]; return s.blue || (c && c.blue) || ""; }
function isKid(s){ const c = CHAR[s.charId]; return c ? !!c.kid : !!s.kid; }
function maxW(s){ return isKid(s) ? 2 : 3; }
function activeSkills(s){
  const L = lvl(s.xp), out = [];
  const b = blueOf(s); if(b) out.push(b);
  if(L >= 1) out.push(YELLOW_SKILL);
  if(L >= 2 && s.skills.orange) out.push(s.skills.orange);
  if(L >= 3 && s.skills.red) out.push(s.skills.red);
  return out;
}
function maxAct(s){
  return 3 + activeSkills(s).filter(n => n === YELLOW_SKILL || (skillInfo(n) && skillInfo(n).extraAction)).length;
}
function rem(s){ return Math.max(0, maxAct(s) - s.used); }
function freeCounts(s){
  const c = {};
  activeSkills(s).forEach(n => { const i = skillInfo(n); if(i && i.free) c[i.free] = (c[i.free] || 0) + 1; });
  return c;
}
function freeKindFor(s, actId){
  const kinds = FREE_FOR[actId]; if(!kinds) return null;
  const c = freeCounts(s);
  return kinds.find(k => (c[k] || 0) > (s.free[k] || 0)) || null;
}
function pendingLevel(s){
  const L = lvl(s.xp);
  if(L >= 2 && !s.skills.orange) return "orange";
  if(L >= 3 && !s.skills.red) return "red";
  return null;
}
function danger(){
  return state.survivors.filter(s => !s.dead).reduce((m, s) => Math.max(m, lvl(s.xp)), 0);
}
function dangerTo(d){ return d === 2 ? "à l'orange" : "au " + LEVELS[d].low; }
function order(){
  const a = state.survivors;
  let i = a.findIndex(s => s.id === state.firstId);
  if(i < 0) i = 0;
  return a.slice(i).concat(a.slice(0, i));
}
function nextActive(){
  const o = order().filter(s => !s.dead && !s.done);
  state.active = o[0] ? o[0].id : null;
}
function nextFirst(){
  const a = state.survivors, n = a.length;
  const i = Math.max(0, a.findIndex(s => s.id === state.firstId));
  for(let k = 1; k <= n; k++){ const c = a[(i + k) % n]; if(c && !c.dead) return c.id; }
  return state.firstId;
}
function hasDoorTool(s){
  const hands = s.inv.slice(0, 2).join(" ").toLowerCase();
  return D.doorTools.some(t => hands.includes(t));
}
function invUsed(s){ return s.inv.some(x => x && x.trim()); }
function log(text){
  state.log.unshift({r:state.round, p:state.setup ? "setup" : state.phase, t:text});
  if(state.log.length > 300) state.log.length = 300;
}
let toastTimer = null;
function toast(msg){
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
}
function commit(fn){
  hist.push(JSON.stringify(state));
  if(hist.length > 80) hist.shift();
  fn(); save(); render();
}

/* Règles des actions */
function actState(s, id){
  const r = rem(s);
  const freeKind = freeKindFor(s, id);
  let base = freeKind ? 0 : 1;
  let cost = base, why = "", soft = "";
  let slip = false;
  if(id === "move"){
    slip = s.z > 0 && (activeSkills(s).includes("Insaisissable") || (isKid(s) && !s.free.kidSlip));
    cost = base + (slip ? 0 : s.z);
    if(r < cost) why = r === 0 ? "Plus d'action ce tour." : `Il faut ${cost} actions pour quitter ta zone, il t'en reste ${r}.`;
  }else if(id === "search"){
    if(s.searched) why = "Déjà fait ce tour.";
    else if(!s.inB) why = "Seulement dans une zone de bâtiment.";
    else if(s.z > 0) why = "Impossible avec des zombies dans ta zone.";
    else if(r < cost) why = "Plus d'action ce tour.";
  }else if(id === "melee"){
    if(s.z === 0) why = "Aucun zombie dans ta zone.";
    else if(r < cost) why = "Plus d'action ce tour.";
  }else if(r < cost){
    why = "Plus d'action ce tour.";
  }
  if(id === "door" && !why && invUsed(s) && !hasDoorTool(s)) soft = "Aucun outil d'ouverture en main d'après ton inventaire.";
  return {cost:cost, ok:!why, why:why, soft:soft, freeKind:freeKind, slip:slip};
}

function addXP(s, n){
  const oldL = lvl(s.xp), oldD = danger();
  s.xp += n;
  const L = lvl(s.xp);
  if(L > oldL){
    log(`${s.name} passe au niveau ${LEVELS[L].name}`);
    let msg = `${s.name} passe au niveau ${LEVELS[L].name}. `;
    if(L === 1) msg += "La compétence +1 action s'applique tout de suite.";
    else msg += `Choisis sa compétence ${LEVELS[L].low} sur sa fiche.`;
    const Dg = danger();
    if(Dg > oldD) msg += ` Le niveau de danger passe ${dangerTo(Dg)}.`;
    toast(msg);
    if(L >= 2) openDetails.add("sk-" + s.id);
  }
}

function doAction(s, id){
  if(!s) return;
  const st = actState(s, id);
  if(!st.ok) return;
  s.used += st.cost;
  if(st.freeKind){ s.free[st.freeKind] = (s.free[st.freeKind] || 0) + 1; s.st.free++; }
  const n = s.name;
  const S = s.st;
  const freeTxt = st.freeKind ? " (action gratuite)" : "";
  switch(id){
    case "move":
      S.moves++;
      if(st.slip) S.slip++;
      if(st.slip && !activeSkills(s).includes("Insaisissable")) s.free.kidSlip = true;
      if(st.slip){ log(`${n} se faufile entre ${s.z} ${pl(s.z,"zombie","zombies")} (Insaisissable)${freeTxt}`); s.z = 0; break; }
      log(s.z > 0 ? `${n} se dégage de ${s.z} ${pl(s.z,"zombie","zombies")} et change de zone (${st.cost} ${pl(st.cost,"action","actions")})${freeTxt}` : `${n} se déplace d'une zone${freeTxt}`);
      s.z = 0;
      break;
    case "search": s.searched = true; S.search++; log(`${n} fouille la zone${freeTxt}`); break;
    case "door": S.doors++; log(`${n} ouvre une porte`); break;
    case "melee": S.melee++; log(`${n} attaque au corps à corps${freeTxt}`); break;
    case "ranged": S.ranged++; log(`${n} tire à distance${freeTxt}`); break;
    case "objective": state.objectives++; S.obj++; log(`${n} prend un objectif (+5 XP)`); addXP(s, 5); break;
    case "trade": log(`${n} réorganise son inventaire`); openDetails.add("inv-" + s.id); break;
    case "noise": S.noise++; log(`${n} fait du bruit`); break;
  }
  state.last = {sid:s.id, act:id};
}

function kill(s, type){
  const k = KILLS[type];
  if(!s || !k) return;
  state.kills[type] = (state.kills[type] || 0) + 1;
  s.st.kills[type] = (s.st.kills[type] || 0) + 1;
  if(state.last && state.last.act === "melee" && s.z > 0) s.z--;
  log(`${s.name} élimine ${k.art} (+${k.xp} XP)`);
  addXP(s, k.xp);
}

function wound(t, d){
  if(!t) return;
  const before = t.wounds;
  const mw = maxW(t);
  t.wounds = Math.min(mw, Math.max(0, t.wounds + d));
  if(t.wounds === before) return;
  if(d > 0){
    t.st.hurt++;
    log(`${t.name} reçoit une blessure (${t.wounds}/${mw})`);
    if(t.wounds >= mw && !t.dead){
      t.dead = true;
      log(`${t.name} quitte la partie (${mw} blessures)`);
      toast(`${t.name} a reçu ${mw} blessures et quitte la partie. Vérifie les conditions de défaite de la mission.`);
      if(state.active === t.id) nextActive();
      if(state.survivors.every(x => x.dead)) toast("Tous les survivants sont hors jeu. Le bilan de la partie t'attend.");
    }
  }else{
    t.st.hurt = Math.max(0, t.st.hurt - 1);
    log(`${t.name} perd une blessure (${t.wounds}/${mw})`);
    if(t.dead && t.wounds < mw){ t.dead = false; log(`${t.name} revient en jeu`); }
  }
}

function endTurn(s){
  if(!s) return;
  const r = rem(s);
  s.done = true;
  s.st.lost += r;
  log(r > 0 ? `${s.name} termine son tour (${r} ${pl(r,"action perdue","actions perdues")})` : `${s.name} termine son tour`);
  state.last = null;
  nextActive();
  wantScroll = true;
  if(!state.active) toast("Tous les survivants ont joué. Place aux zombies.");
}

function startPlayers(){
  state.survivors.forEach(s => { s.used = 0; s.searched = false; s.done = false; s.free = {}; });
  state.last = null;
  nextActive();
}

function setPhase(to){
  if(to === state.phase) return;
  const p = PHASES.find(x => x.id === to);
  if(!p) return;
  state.phase = to;
  log(p.log);
  wantScroll = true;
}

function nextRound(){
  const nf = nextFirst();
  state.round++;
  state.firstId = nf;
  state.phase = "joueurs";
  state.checks = {};
  startPlayers();
  const f = get(nf);
  log(`Début du tour ${state.round}. Premier joueur : ${f ? f.name : "?"}`);
  wantScroll = true;
}

function removeSurv(id){
  const t = get(id);
  if(!t) return;
  if(state.firstId === id){ const nf = nextFirst(); state.firstId = nf !== id ? nf : null; }
  state.survivors = state.survivors.filter(s => s.id !== id);
  if(!state.firstId && state.survivors[0]) state.firstId = state.survivors[0].id;
  if(state.active === id) nextActive();
  if(state.last && state.last.sid === id) state.last = null;
  log(`${t.name} quitte l'équipe`);
}

function putInInventory(s, card){
  const i = s.inv.findIndex(x => !x || !x.trim());
  if(i < 0) return false;
  s.inv[i] = card;
  return true;
}

/* Choix des survivants */
function draftKey(item){ return item.charId ? item.charId : "c:" + item.name.toLowerCase(); }
function toggleChar(id){
  const c = CHAR[id]; if(!c) return;
  const i = state.draft.findIndex(d => d.charId === id);
  if(i >= 0) state.draft.splice(i, 1);
  else if(state.draft.length < 12) state.draft.push({charId:id, name:c.name});
}
function startFromDraft(){
  if(!state.draft.length) return;
  if(!state.started){
    state.survivors = state.draft.map(newSurvivor);
    state.firstId = state.survivors[0].id;
    state.round = 1; state.phase = "joueurs"; state.started = true; state.setup = false;
    startPlayers();
    log(`Début de la partie avec ${state.survivors.map(s => s.name).join(", ")}`);
  }else{
    const keep = [];
    state.draft.forEach(d => {
      const found = state.survivors.find(s => draftKey(s) === draftKey(d));
      if(found) keep.push(found);
      else { const ns = newSurvivor(d); if(state.phase === "joueurs") ns.done = false; keep.push(ns); log(`${ns.name} rejoint l'équipe`); }
    });
    state.survivors.filter(s => !keep.includes(s)).forEach(s => log(`${s.name} quitte l'équipe`));
    state.survivors = keep;
    if(!get(state.firstId)) state.firstId = keep[0].id;
    if(!get(state.active) || get(state.active).done) nextActive();
    if(state.last && !get(state.last.sid)) state.last = null;
    state.setup = false;
  }
  state.draft = [];
  wantScroll = true;
}
function openSetup(){
  state.draft = state.survivors.map(s => ({charId:s.charId, name:s.name, blue:s.blue, kid:s.kid}));
  state.setup = true;
  wantScroll = true;
}

/* Rendu */
function pips(total, filled, cls){
  let h = "";
  for(let i = 0; i < total; i++) h += `<span class="pip ${i < filled ? "on" : ""}"></span>`;
  return `<span class="pips ${cls}" aria-hidden="true">${h}</span>`;
}

function renderHeader(){
  const setup = state.setup, ended = !!state.ended && !setup;
  $("roundLabel").textContent = setup ? "Mise en place" : ended ? "Partie terminée" : "Tour";
  $("roundNum").textContent = setup || ended ? "" : state.round;
  $("phases").hidden = setup || ended;
  $("dangerPill").hidden = setup || ended;
  if(setup || ended) return;
  const cur = PHASES.findIndex(p => p.id === state.phase);
  $("phases").innerHTML = PHASES.map((p, i) =>
    `<li><button class="phase-btn ${i < cur ? "is-past" : ""}" data-act="phase" data-to="${p.id}" ${i === cur ? 'aria-current="step"' : ""}><span class="pn">${i + 1}</span>${p.name}</button></li>`
  ).join("");
  const Dg = danger();
  const pill = $("dangerPill");
  pill.className = "danger-pill lv" + Dg;
  pill.textContent = "Danger " + LEVELS[Dg].low;
}

function skillLine(name){
  const i = skillInfo(name);
  return i && i.desc ? `<span class="skill-desc">${esc(i.desc)}</span>` : "";
}

function skillsBlock(s, opts){
  const L = lvl(s.xp), c = CHAR[s.charId];
  const px = (opts && opts.prefix) || "sk-";
  const rows = [];
  const b = blueOf(s);
  const editBlue = !b || editing.has(s.id + ":blue");
  rows.push(!editBlue
    ? `<div class="skill"><span class="sw lv0"></span><span class="skill-name">${esc(b)} <button class="linkbtn" data-act="skill-edit" data-sid="${s.id}" data-level="blue">Corriger</button></span>${skillLine(b)}</div>`
    : `<div class="skill"><span class="sw lv0"></span><span class="skill-name">Compétence bleue</span><div class="skill-choice"><input id="skin-${px}blue-${s.id}" value="${esc(b)}" placeholder="Recopie-la depuis son tableau de bord" aria-label="Compétence bleue"><button data-act="skill-custom" data-sid="${s.id}" data-level="blue" data-px="${px}">Valider</button></div></div>`);
  if(isKid(s)) rows.push(`<div class="skill"><span class="sw" style="background:var(--muted)"></span><span class="skill-name">Enfant</span><span class="skill-desc">2 blessures au maximum. Une fois par tour, un déplacement se fait en Insaisissable : pas d'action en plus pour quitter une zone avec des zombies.</span></div>`);
  rows.push(`<div class="skill ${L < 1 ? "is-locked" : ""}"><span class="sw lv1"></span><span class="skill-name">${YELLOW_SKILL}${L < 1 ? " · à 7 XP" : ""}</span>${skillLine(YELLOW_SKILL)}</div>`);
  [["orange", 2, 19], ["red", 3, 43]].forEach(([key, li, min]) => {
    const chosen = s.skills[key];
    const opts2 = c ? (key === "orange" ? c.orange : c.red) : [];
    let inner;
    if(chosen){
      inner = `<span class="skill-name">${esc(chosen)} <button class="linkbtn" data-act="skill-reset" data-sid="${s.id}" data-level="${key}">Changer</button></span>${skillLine(chosen)}`;
    }else if(L >= li){
      const choice = opts2.length
        ? opts2.map(o => `<button data-act="skill" data-sid="${s.id}" data-level="${key}" data-name="${esc(o)}">${esc(o)}</button>`).join("")
        : `<input id="skin-${px}${key}-${s.id}" placeholder="Nom de la compétence" aria-label="Compétence ${LEVELS[li].low} choisie"><button data-act="skill-custom" data-sid="${s.id}" data-level="${key}" data-px="${px}">Valider</button>`;
      inner = `<span class="skill-name">Choisis ta compétence ${LEVELS[li].low}</span><div class="skill-choice">${choice}</div>`;
      if(opts2.length) inner += opts2.map(o => skillInfo(o) ? `<span class="skill-desc"><b>${esc(o)}</b> : ${esc(skillInfo(o).desc)}</span>` : "").join("");
    }else{
      inner = `<span class="skill-name">${opts2.length ? opts2.map(esc).join(" ou ") : "Au choix"} · à ${min} XP</span>`;
    }
    rows.push(`<div class="skill ${!chosen && L < li ? "is-locked" : ""}"><span class="sw lv${li}"></span>${inner}</div>`);
  });
  const pend = pendingLevel(s);
  const id = px + s.id;
  const open = pend || editBlue || openDetails.has(id);
  const summary = !b ? "Compétence bleue à recopier" : pend ? `Compétence ${pend === "orange" ? "orange" : "rouge"} à choisir` : `${activeSkills(s).length} ${pl(activeSkills(s).length,"active","actives")}`;
  return `<details class="block" id="${id}" ${open ? "open" : ""}><summary class="block-title"><h4>Compétences</h4><span class="chev">${esc(summary)} <span class="closed">▸</span><span class="opened">▾</span></span></summary><div class="block-body skills">${rows.join("")}</div></details>`;
}

function invBlock(s, prefix){
  const id = (prefix || "inv-") + s.id;
  const open = openDetails.has(id);
  const hands = s.inv.slice(0, 2).filter(x => x && x.trim());
  const summary = hands.length ? "En main : " + hands.map(esc).join(", ") : "Mains vides";
  const slots = s.inv.map((v, i) =>
    (i === 2 ? `<span class="inv-sep" aria-hidden="true"></span>` : "") +
    `<label class="slot ${i < 2 ? "hand" : ""}"><span>${SLOTS[i]}</span><input id="${id}-${i}" value="${esc(v)}" list="equipList" data-change="inv" data-sid="${s.id}" data-slot="${i}" maxlength="40" placeholder="Vide"></label>`
  ).join("");
  return `<details class="block" id="${id}" ${open ? "open" : ""}><summary class="block-title"><h4>Inventaire</h4><span class="chev">${summary} <span class="closed">▸</span><span class="opened">▾</span></span></summary><div class="block-body"><div class="inv">${slots}</div></div></details>`;
}

function strip(){
  return `<ul class="strip" aria-label="Ordre de jeu">` + order().map(s => {
    const L = lvl(s.xp);
    let cls = "", label = "attend", dis = "";
    if(s.dead){ cls = "is-dead"; label = "hors jeu"; dis = "disabled"; }
    else if(s.done){ cls = "is-done"; label = "a joué"; dis = "disabled"; }
    else if(s.id === state.active){ cls = "is-active"; label = "joue"; }
    return `<li><button class="chip ${cls}" data-act="pick" data-sid="${s.id}" ${dis} aria-label="${esc(s.name)}, ${label}"><span class="dot lv${L}"></span><span class="chip-name">${esc(s.name)}</span>${s.id === state.firstId ? '<span class="badge">1er</span>' : ""}<span class="chip-state">${label}</span></button></li>`;
  }).join("") + `</ul>`;
}

function xpTrack(s){
  const SCALE = 55, xp = s.xp, L = lvl(xp);
  const pos = Math.min(xp, SCALE) / SCALE * 100;
  const nx = LEVELS[L + 1];
  const txt = nx ? `Niveau ${nx.low} dans ${nx.min - xp} XP` : "Niveau maximal atteint";
  const grow = [7, 12, 24, 12];
  const segs = grow.map((g, i) => `<span class="seg lv${i} ${i > L ? "is-dim" : ""}" style="flex-grow:${g}"></span>`).join("");
  const ticks = [0, 7, 19, 43].map(v => `<span style="left:${(v / SCALE * 100).toFixed(2)}%">${v}</span>`).join("");
  return `<div class="xp">
    <div class="xp-top"><span class="xp-val"><b>${xp}</b> XP</span><span class="xp-next">${txt}</span></div>
    <div class="xp-bar" role="img" aria-label="${xp} XP, niveau ${LEVELS[L].low}">${segs}<span class="xp-mark" style="left:${pos.toFixed(2)}%"></span></div>
    <div class="xp-ticks" aria-hidden="true">${ticks}</div>
  </div>`;
}

function hints(s){
  const out = [];
  const r = rem(s);
  if(s.z > 0) out.push(`<li class="warn">${s.z} ${pl(s.z,"zombie","zombies")} dans ta zone. Fuir coûte ${actState(s,"move").cost} ${pl(actState(s,"move").cost,"action","actions")}. Sans riposte, chacun t'infligera 1 blessure à la phase des zombies.</li>`);
  const fc = freeCounts(s);
  const freeLeft = Object.keys(fc).filter(k => fc[k] > (s.free[k] || 0)).map(k => FREE_LABEL[k]);
  if(freeLeft.length) out.push(`<li>Action gratuite disponible : ${freeLeft.join(", ")}.</li>`);
  if(r === 0 && !freeLeft.length) out.push(`<li>Plus d'action pour ce tour. Note tes éliminations si besoin, puis termine le tour.</li>`);
  else if(s.inB && s.z === 0 && !s.searched) out.push(`<li>Zone de bâtiment dégagée : tu peux fouiller.</li>`);
  if(state.round === 1 && !invUsed(s)) out.push(`<li>Note ton équipement de départ dans l'inventaire ci-dessous.</li>`);
  return out.length ? `<ul class="hints">${out.join("")}</ul>` : "";
}

function killButtons(){
  return `<div class="follow-btns">` + Object.keys(KILLS).map(k =>
    `<button class="kill" data-act="kill" data-type="${k}">${KILLS[k].label}<span class="num">+${KILLS[k].xp} XP</span></button>`
  ).join("") + `</div>`;
}

function attackExtras(s, kind){
  const L = state.last || {};
  const allies = state.survivors.filter(x => x.id !== s.id && !x.dead);
  let h = `<p class="follow-sub">Zombies éliminés</p>` + killButtons();
  h += `<p class="follow-sub">Dés ratés${L.miss ? ` : ${L.miss}` : ""}</p><div class="follow-btns"><button class="kill" data-act="miss" data-kind="${kind}">+1 dé raté</button></div>`;
  if(kind === "ranged" && allies.length){
    h += `<p class="follow-sub">Allié touché par erreur${L.ff ? ` : ${L.ff} ${pl(L.ff,"blessure","blessures")}` : ""}</p><div class="follow-btns">${allies.map(a => `<button class="kill" data-act="ff" data-target="${a.id}">${esc(a.name)}<span class="num">+1 blessure</span></button>`).join("")}</div>`;
  }
  return h;
}

function followUp(s){
  const L = state.last;
  if(!L || L.sid !== s.id) return "";
  let title = "", body = "", extra = "";
  switch(L.act){
    case "move": title = "Nouvelle zone"; body = "Mets à jour « Ta zone » ci-dessus : bâtiment ou rue, et zombies présents."; break;
    case "search":
      title = "Fouille faite";
      body = "Garde la carte ou défausse-la, puis réorganise ton inventaire gratuitement.";
      extra = L.found ? `<p>« ${esc(L.found)} » rangé dans l'inventaire.</p>` :
        `<div class="found"><input id="found-${s.id}" list="equipList" placeholder="Carte trouvée" aria-label="Carte trouvée" maxlength="40"><button class="kill" data-act="found" data-sid="${s.id}">Ranger dans l'inventaire</button></div>`;
      extra += L.aaah ? `<p>Un marcheur a été ajouté à ta zone.</p>` : `<div class="follow-btns"><button class="kill" data-act="aaah">J'ai pioché « Aaahh!! »</button></div>`;
      break;
    case "door": title = "Porte ouverte"; body = "Premier accès à ce bâtiment ? Pioche une carte Zombie pour chacune de ses pièces. Outil bruyant : pose un jeton Bruit."; break;
    case "melee": title = "Résultat de l'attaque"; body = "Note les zombies éliminés et les dés ratés : ils comptent pour le bilan de fin de partie."; extra = attackExtras(s, "melee"); break;
    case "ranged": title = "Résultat du tir"; body = "Note les zombies éliminés, les dés ratés et les alliés touchés par erreur."; extra = attackExtras(s, "ranged"); break;
    case "objective": title = "Objectif pris"; body = `+5 XP. Objectifs pris pendant la partie : ${state.objectives}.`; break;
    case "trade": title = "Inventaire"; body = "Modifie l'inventaire ci-dessous. Seules les cartes en main servent en combat."; break;
    case "noise": title = "Bruit"; body = "Pose un jeton Bruit dans ta zone. Il attire les zombies qui ne voient aucun survivant."; break;
  }
  return `<div class="follow" role="status"><p class="follow-title">${title}</p><p>${body}</p>${extra}</div>`;
}

function dashboard(s){
  const L = lvl(s.xp), r = rem(s), m = maxAct(s);
  const rows = ACTIONS.map(a => {
    const st = actState(s, a.id);
    const costTxt = st.cost === 0 ? "Gratuite" : `${st.cost} ${pl(st.cost,"action","actions")}`;
    const did = "r-" + a.id;
    const why = (r === 0 && st.why === "Plus d'action ce tour.") ? "" : st.why;
    return `<li class="act ${st.ok ? "" : "is-off"}">
      <div class="act-main">
        <div class="act-text"><h5>${a.name}${st.freeKind && st.ok ? '<span class="free">GRATUITE</span>' : ""}</h5><p>${a.short}</p>${why ? `<p class="why">${why}</p>` : ""}${st.soft ? `<p class="why">${st.soft}</p>` : ""}</div>
        <div class="act-side"><span class="cost">${costTxt}</span><button class="btn-do" data-act="do" data-id="${a.id}" ${st.ok ? "" : "disabled"} aria-label="${a.name}">Faire</button></div>
      </div>
      <details id="${did}" ${openDetails.has(did) ? "open" : ""}><summary>Règles</summary><ul>${a.rules.map(x => `<li>${x}</li>`).join("")}</ul></details>
    </li>`;
  }).join("");
  return `<article class="dash" id="dash">
    <div class="dash-head">
      <div><p class="eyebrow">Au tour de</p><h3 class="dash-name">${esc(s.name)}</h3></div>
      <span class="lvl-pill lv${L}">Niveau ${LEVELS[L].low}</span>
    </div>
    <div class="meters">
      <div class="meter"><span class="m-label">Actions</span>${pips(m, r, "act")}<span class="m-val">${r}/${m}</span></div>
      <div class="meter"><span class="m-label">Blessures</span>${pips(maxW(s), s.wounds, "wound")}<span class="m-val">${s.wounds}/${maxW(s)}</span></div>
    </div>
    ${xpTrack(s)}
    ${skillsBlock(s)}
    ${invBlock(s)}
    <fieldset class="zone">
      <legend>Ta zone</legend>
      <label class="switch"><input type="checkbox" id="inb-${s.id}" data-change="inb" data-sid="${s.id}" ${s.inB ? "checked" : ""}><span>Zone de bâtiment</span></label>
      <div class="stepper"><span id="zl-${s.id}">Zombies présents</span>
        <button data-act="z-" data-sid="${s.id}" ${s.z === 0 ? "disabled" : ""} aria-label="Retirer un zombie de ta zone">−</button>
        <output aria-labelledby="zl-${s.id}">${s.z}</output>
        <button data-act="z+" data-sid="${s.id}" aria-label="Ajouter un zombie dans ta zone">+</button>
      </div>
    </fieldset>
    ${hints(s)}
    ${followUp(s)}
    <div class="acts-head"><h4>Actions possibles</h4><span class="eyebrow">${r} ${pl(r,"restante","restantes")}</span></div>
    <ul class="acts">${rows}</ul>
    <button class="btn-primary" data-act="endturn" data-sid="${s.id}">Terminer le tour de ${esc(s.name)}${r > 0 ? ` (${r} ${pl(r,"action perdue","actions perdues")})` : ""}</button>
  </article>`;
}

function panelSetup(){
  const sel = state.draft;
  const pos = id => sel.findIndex(d => d.charId === id);
  const cards = D.characters.map(c => {
    const p = pos(c.id);
    return `<li><button class="pcard" data-act="pick-char" data-char="${c.id}" aria-pressed="${p >= 0}">
      ${p >= 0 ? `<span class="pcard-order">${p === 0 ? "1er" : p + 1}</span>` : ""}
      <span class="pcard-tag">${c.kid ? "Enfant · 2 blessures" : "Adulte · 3 blessures"}</span>
      <span class="pcard-name">${esc(c.name)}</span>
      ${c.blue ? `<span class="pcard-skill"><b>Bleu :</b> ${esc(c.blue)}</span>` : `<span class="pcard-skill">Compétences à recopier depuis son tableau de bord</span>`}
      ${c.orange && c.orange.length ? `<span class="pcard-skill"><b>Orange :</b> ${c.orange.map(esc).join(" ou ")}</span>` : ""}
    </button></li>`;
  }).join("");
  const customs = sel.filter(d => !d.charId).map(d => {
    const p = sel.indexOf(d);
    return `<li><button class="pcard" data-act="unpick-custom" data-key="${esc(draftKey(d))}" aria-pressed="true">
      <span class="pcard-order">${p === 0 ? "1er" : p + 1}</span>
      <span class="pcard-tag">Personnage ajouté${d.kid ? " · enfant" : ""}</span>
      <span class="pcard-name">${esc(d.name)}</span>
      <span class="pcard-skill">${d.blue ? `<b>Bleu :</b> ${esc(d.blue)}` : "Touche pour le retirer"}</span>
    </button></li>`;
  }).join("");
  const n = sel.length;
  return `<div><h2 class="panel-title">${state.started ? "Changer les survivants" : "Choisis tes survivants"}</h2>
    <p class="lede">Touche les personnages qui jouent cette partie. L'ordre de sélection donne l'ordre de jeu : le premier choisi commence. ${esc(D.startingGear || "")}</p></div>
    ${installSlot()}
    <ul class="picker">${cards}${customs}</ul>
    <form class="custom-form" id="customForm">
      <p class="follow-title">Un autre personnage ?</p>
      <div class="field"><label for="cust-name">Nom</label><input id="cust-name" maxlength="24" placeholder="Nom du survivant" autocomplete="off"></div>
      <div class="field"><label for="cust-blue">Compétence bleue</label><input id="cust-blue" maxlength="60" placeholder="Facultatif" autocomplete="off"><small>Recopie-la depuis son tableau de bord.</small></div>
      <label class="switch"><input type="checkbox" id="cust-kid"><span>Enfant (2 blessures)</span></label>
      <div class="addform"><button class="btn-ghost" type="submit">Ajouter ce personnage</button></div>
    </form>
    <div class="setup-bar">
      <button class="btn-primary" data-act="start" ${n ? "" : "disabled"}>${n ? (state.started ? `Valider l'équipe (${n})` : `Commencer avec ${n} ${pl(n,"survivant","survivants")}`) : "Choisis au moins un survivant"}</button>
      ${state.started ? `<button class="btn-ghost" data-act="setup-cancel">Annuler</button>` : ""}
    </div>`;
}

function panelJoueurs(){
  let h = `<div><h2 class="panel-title">Phase des joueurs</h2><p class="lede">Chaque survivant joue à son tour en partant du premier joueur. Touche un nom pour changer de survivant.</p></div>`;
  h += installSlot();
  if(!state.survivors.length) return h + `<p class="lede">Aucun survivant en jeu.</p><button class="btn-primary" data-act="setup">Choisir les survivants</button>`;
  h += strip();
  const s = get(state.active);
  if(s && !s.dead && !s.done) h += dashboard(s);
  else h += `<div class="dash"><p class="follow-title">Tous les survivants ont joué ce tour.</p><p class="lede">Les zombies passent à l'attaque.</p><button class="btn-primary" data-act="phase" data-to="activation">Passer à la phase des zombies</button></div>`;
  return h;
}

function woundList(){
  return `<ul class="wlist">` + state.survivors.map(s => {
    const L = lvl(s.xp);
    return `<li class="wrow ${s.dead ? "is-dead" : ""}"><span class="dot lv${L}"></span><span class="wname">${esc(s.name)}${s.dead ? " · hors jeu" : ""}${isKid(s) ? " · enfant" : ""}</span>${pips(maxW(s), s.wounds, "wound")}
      <span class="wbtns"><button class="btn-ghost" data-act="wound-" data-sid="${s.id}" ${s.wounds === 0 ? "disabled" : ""} aria-label="Retirer une blessure à ${esc(s.name)}">−1</button><button class="btn-wound" data-act="wound+" data-sid="${s.id}" ${s.dead ? "disabled" : ""} aria-label="Ajouter une blessure à ${esc(s.name)}">+1 blessure</button></span></li>`;
  }).join("") + `</ul>`;
}

function panelActivation(){
  return `<div><h2 class="panel-title">Phase des zombies : activation</h2><p class="lede">Chaque zombie fait une seule chose : attaquer s'il le peut, sinon avancer.</p></div>
  <ol class="steps">
    <li><b>Attaque.</b> Chaque zombie qui partage la zone d'un survivant attaque : 1 blessure par zombie. Les survivants de la zone se répartissent les blessures.</li>
    <li><b>Déplacement.</b> Les autres zombies avancent d'une zone vers les survivants qu'ils voient. S'ils ne voient personne, ils vont vers la zone la plus bruyante.</li>
    <li><b>Coureurs.</b> Une fois tous les zombies activés, les coureurs recommencent : attaque ou déplacement.</li>
  </ol>
  <p class="note">Chaque survivant compte comme un jeton Bruit. Si deux chemins sont aussi courts, le groupe de zombies se divise.</p>
  <h3 class="sub">Blessures reçues</h3>
  ${woundList()}
  <button class="btn-primary" data-act="phase" data-to="apparition">Passer à l'apparition</button>`;
}

function panelApparition(){
  const Dg = danger();
  const leaders = state.survivors.filter(s => !s.dead && lvl(s.xp) === Dg).map(s => esc(s.name));
  return `<div><h2 class="panel-title">Phase des zombies : apparition</h2><p class="lede">De nouveaux zombies arrivent sur chaque zone d'apparition.</p></div>
  <div class="danger-block lv${Dg}">
    <p class="eyebrow">Niveau de danger</p>
    <p class="danger-name">${LEVELS[Dg].name}</p>
    <p>Lis la ligne ${LEVELS[Dg].low} de chaque carte Zombie.</p>
  </div>
  ${leaders.length ? `<p class="note">Fixé par ${leaders.join(", ")}, ${pl(leaders.length,"le survivant le plus avancé","les survivants les plus avancés")}.</p>` : ""}
  <ol class="steps">
    <li>Pioche une carte Zombie pour chaque zone d'apparition. Commence par la zone de départ, puis tourne dans le sens horaire.</li>
    <li>Place les zombies indiqués sur la ligne ${LEVELS[Dg].low}.</li>
    <li>Carte « Activation supplémentaire » : aucun zombie n'apparaît, tous les zombies du type indiqué font une activation tout de suite.</li>
    <li>Plus assez de figurines d'un type : place celles qui restent, puis tous les zombies de ce type font une activation supplémentaire.</li>
  </ol>
  <button class="btn-primary" data-act="phase" data-to="fin">Passer à la fin du tour</button>`;
}

function panelFin(){
  const nf = get(nextFirst());
  const items = [
    {id:"bruit", t:"Retire tous les jetons Bruit du plateau."},
    {id:"premier", t:`Le jeton Premier joueur passe à gauche : ${nf ? esc(nf.name) : "?"} commence le prochain tour.`},
    {id:"mission", t:"Vérifie les conditions de victoire et de défaite de la mission."}
  ];
  return `<div><h2 class="panel-title">Fin du tour ${state.round}</h2><p class="lede">Trois vérifications avant de relancer.</p></div>
  <ul class="checks">${items.map(i => `<li><label><input type="checkbox" id="chk-${i.id}" data-change="chk" data-key="${i.id}" ${state.checks[i.id] ? "checked" : ""}><span>${i.t}</span></label></li>`).join("")}</ul>
  <button class="btn-primary" data-act="next">Commencer le tour ${state.round + 1}</button>
  <div class="endbox"><p class="follow-title">La mission est terminée ?</p><p class="note">Le bilan affiche le tableau des statistiques et les titres de chaque survivant.</p><div class="row-btns"><button class="btn-ghost" data-act="end-game" data-result="victoire">Mission accomplie</button><button class="btn-ghost" data-act="end-game" data-result="defaite">Mission échouée</button></div></div>`;
}

/* Bilan et statistiques */
const STAT_ROWS = [
  {k:"xp", label:"XP"},
  {k:"dmg", label:"Dégâts aux zombies"},
  {k:"kills", label:"Zombies éliminés"},
  {k:"big", label:"Brutes et abominations"},
  {k:"ff", label:"Dégâts collatéraux"},
  {k:"missR", label:"Tirs ratés"},
  {k:"missM", label:"Coups ratés"},
  {k:"loot", label:"Cartes piochées"},
  {k:"aaah", label:"« Aaahh!! » piochés"},
  {k:"doors", label:"Portes ouvertes"},
  {k:"obj", label:"Objectifs"},
  {k:"moves", label:"Déplacements"},
  {k:"noise", label:"Bruit volontaire"},
  {k:"hurt", label:"Blessures reçues"},
  {k:"lost", label:"Actions perdues"}
];
const AWARDS = [
  {k:"dmg", title:"Faucheur", what:"le plus de dégâts aux zombies", unit:["point de dégâts","points de dégâts"]},
  {k:"big", title:"Gros gibier", what:"le plus de brutes et d'abominations", unit:["grosse prise","grosses prises"]},
  {k:"ff", title:"Danger public", what:"le plus de dégâts collatéraux", unit:["blessure infligée à un allié","blessures infligées aux alliés"]},
  {k:"missR", title:"Tireur du dimanche", what:"le plus de tirs ratés", unit:["dé raté","dés ratés"]},
  {k:"missM", title:"Moulinet dans le vide", what:"le plus de coups ratés", unit:["dé raté","dés ratés"]},
  {k:"loot", title:"Pilleur", what:"le plus de cartes piochées en fouille", unit:["carte","cartes"]},
  {k:"aaah", title:"Aimant à zombies", what:"le plus de « Aaahh!! »", unit:["mauvaise surprise","mauvaises surprises"]},
  {k:"hurt", title:"Sac de frappe", what:"le plus de blessures reçues", unit:["blessure","blessures"]},
  {k:"moves", title:"Marathonien", what:"le plus de déplacements", unit:["déplacement","déplacements"]},
  {k:"doors", title:"Serrurier", what:"le plus de portes ouvertes", unit:["porte","portes"]},
  {k:"obj", title:"Chasseur de trésors", what:"le plus d'objectifs ramassés", unit:["objectif","objectifs"]},
  {k:"noise", title:"Fanfare", what:"le plus de bruit volontaire", unit:["jeton Bruit","jetons Bruit"]},
  {k:"lost", title:"Tête en l'air", what:"le plus d'actions perdues", unit:["action perdue","actions perdues"]}
];
function statVal(s, k){
  const S = s.st || blankStats(), K = S.kills || {};
  switch(k){
    case "xp": return s.xp;
    case "dmg": return Object.keys(DMG).reduce((a, t) => a + (K[t] || 0) * DMG[t], 0);
    case "kills": return Object.keys(KILLS).reduce((a, t) => a + (K[t] || 0), 0);
    case "big": return (K.brute || 0) + (K.abo || 0);
    case "loot": return Math.max(0, S.search - S.aaah);
    default: return S[k] || 0;
  }
}
function leaders(k){
  const vals = state.survivors.map(s => ({s:s, v:statVal(s, k)}));
  const max = vals.reduce((m, x) => Math.max(m, x.v), 0);
  return {max:max, who:max > 0 ? vals.filter(x => x.v === max).map(x => x.s) : []};
}
function nameList(list){
  const n = list.map(x => esc(x.name));
  return n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " et " + n[n.length - 1];
}
function endGame(result){
  state.ended = {result:result, round:state.round};
  log(result === "victoire" ? `Mission accomplie au tour ${state.round}` : result === "defaite" ? `Mission échouée au tour ${state.round}` : `Partie terminée au tour ${state.round}`);
  viewStats = false;
  wantScroll = true;
}
function allDownNotice(){
  if(!state.started || !state.survivors.length || !state.survivors.every(x => x.dead)) return "";
  return `<div class="notice"><p>Tous les survivants sont hors jeu.</p><button class="btn-ghost" data-act="end-game" data-result="defaite">Voir le bilan</button></div>`;
}
function panelBilan(){
  const E = state.ended;
  const rounds = E ? E.round : state.round;
  const title = E ? (E.result === "victoire" ? "Mission accomplie" : E.result === "defaite" ? "Mission échouée" : "Partie terminée") : "Statistiques en cours";
  const totalKills = Object.keys(KILLS).reduce((a, t) => a + (state.kills[t] || 0), 0);
  const alive = state.survivors.filter(x => !x.dead).length;
  const n = state.survivors.length;
  const sub = `${rounds} ${pl(rounds,"tour","tours")} · ${totalKills} ${pl(totalKills,"zombie éliminé","zombies éliminés")} · ${state.objectives} ${pl(state.objectives,"objectif","objectifs")} · ${alive}/${n} ${pl(alive,"survivant debout","survivants debout")}`;
  const mvp = leaders("xp");
  let mvpHtml = "";
  if(mvp.who.length){
    const L = lvl(mvp.max);
    mvpHtml = `<div class="mvp lv${L}"><p class="eyebrow">Meilleur survivant</p><p class="mvp-name">${nameList(mvp.who)}</p><p>${mvp.max} XP, niveau ${LEVELS[L].low}</p></div>`;
  }
  const cards = AWARDS.map(a => {
    const l = leaders(a.k);
    if(!l.who.length) return "";
    return `<li class="award"><span class="award-title">${a.title}</span><span class="award-who">${nameList(l.who)}</span><span class="award-what">${a.what} : ${l.max} ${pl(l.max, a.unit[0], a.unit[1])}</span></li>`;
  }).join("");
  const head = state.survivors.map(x => `<th scope="col" class="n ${x.dead ? "is-out" : ""}">${esc(x.name)}</th>`).join("");
  const body = STAT_ROWS.map(row => {
    const l = leaders(row.k);
    const cells = state.survivors.map(x => { const v = statVal(x, row.k); return `<td class="n ${l.max > 0 && v === l.max ? "best" : ""}">${v}</td>`; }).join("");
    return `<tr><th scope="row">${row.label}</th>${cells}</tr>`;
  }).join("");
  const buttons = E
    ? `<div class="row-btns"><button class="btn-primary" data-act="new-yes">Nouvelle partie</button><button class="btn-ghost" data-act="resume">Reprendre cette partie</button></div>`
    : `<div class="row-btns"><button class="btn-primary" data-act="stats-close">Revenir à la partie</button></div>
       <div class="endbox"><p class="follow-title">La mission est terminée ?</p><div class="row-btns"><button class="btn-ghost" data-act="end-game" data-result="victoire">Mission accomplie</button><button class="btn-ghost" data-act="end-game" data-result="defaite">Mission échouée</button></div></div>`;
  return `<div><p class="eyebrow">${E ? "Fin de partie" : "Partie en cours"}</p><h2 class="panel-title">${title}</h2><p class="lede">${sub}</p></div>
    ${mvpHtml}
    ${cards ? `<h3 class="sub">Les titres</h3><ul class="awards">${cards}</ul>` : `<p class="note">Pas encore assez d'actions notées pour décerner des titres.</p>`}
    <h3 class="sub">Tableau des statistiques</h3>
    <div class="tbl-wrap"><table class="stats-tbl"><thead><tr><th scope="col">Statistique</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="note">En gras, le meilleur score de chaque ligne. Dégâts aux zombies : 1 par marcheur ou coureur éliminé, 2 par brute, 3 par abomination. Cartes piochées : fouilles sans « Aaahh!! ». Les dés ratés et les alliés touchés se notent juste après chaque attaque.</p>
    ${buttons}`;
}

function renderPanel(){
  const p = state.phase;
  $("phasePanel").innerHTML = state.setup ? panelSetup() :
    (state.ended || viewStats) ? panelBilan() :
    allDownNotice() + (p === "joueurs" ? panelJoueurs() :
    p === "activation" ? panelActivation() :
    p === "apparition" ? panelApparition() : panelFin());
}

function renderBilan(){
  const k = state.kills;
  const total = Object.keys(KILLS).reduce((a, t) => a + (k[t] || 0), 0);
  const alive = state.survivors.filter(s => !s.dead).length;
  const detail = Object.keys(KILLS).filter(t => k[t]).map(t => `${KILLS[t].label.toLowerCase()} ${k[t]}`).join(" · ");
  $("bilan").innerHTML = `<div class="stats">
    <div class="stat"><span class="stat-n">${state.round}</span><span class="stat-l">tour</span></div>
    <div class="stat"><span class="stat-n">${state.objectives}</span><span class="stat-l">${pl(state.objectives,"objectif","objectifs")}</span></div>
    <div class="stat"><span class="stat-n">${total}</span><span class="stat-l">zombies éliminés</span></div>
    <div class="stat"><span class="stat-n">${alive}/${state.survivors.length}</span><span class="stat-l">en jeu</span></div>
  </div>${detail ? `<p class="kills-line">${detail}</p>` : ""}${state.ended || viewStats ? "" : `<div class="row-btns"><button class="btn-ghost" data-act="stats-open">Voir les statistiques</button></div>`}`;
}

function renderTeam(){
  const rows = state.survivors.map(s => {
    const isFirst = s.id === state.firstId;
    const L = lvl(s.xp);
    const nameEl = s.charId
      ? `<span class="chip-name">${esc(s.name)}</span>`
      : `<input id="name-${s.id}" value="${esc(s.name)}" data-change="rename" data-sid="${s.id}" aria-label="Nom du survivant" maxlength="24">`;
    return `<li class="trow">
      ${nameEl}
      <span class="lvl-pill lv${L}">${LEVELS[L].name}</span>
      <div class="trow-ctrl">
        <span class="mini">XP <button data-act="xp-" data-sid="${s.id}" ${s.xp === 0 ? "disabled" : ""} aria-label="Retirer 1 XP à ${esc(s.name)}">−</button><output>${s.xp}</output><button data-act="xp+" data-sid="${s.id}" aria-label="Ajouter 1 XP à ${esc(s.name)}">+</button></span>
        <span class="mini">Blessures <button data-act="wound-" data-sid="${s.id}" ${s.wounds === 0 ? "disabled" : ""} aria-label="Retirer une blessure à ${esc(s.name)}">−</button><output>${s.wounds}</output><button data-act="wound+" data-sid="${s.id}" ${s.dead ? "disabled" : ""} aria-label="Ajouter une blessure à ${esc(s.name)}">+</button></span>
        <span class="push">
          <button class="btn-ghost" data-act="first" data-sid="${s.id}" ${isFirst ? "disabled" : ""}>${isFirst ? "1er joueur" : "Mettre 1er"}</button>
          <button class="btn-ghost" data-act="remove" data-sid="${s.id}" aria-label="Retirer ${esc(s.name)} de l'équipe">Retirer</button>
        </span>
      </div>
      <div style="grid-column:1 / -1;display:grid;gap:8px">${skillsBlock(s, {prefix:"tsk-"})}${invBlock(s, "tinv-")}</div>
    </li>`;
  }).join("");
  const conf = confirmNew
    ? `<div class="confirm"><p>Nouvelle partie ? Le tour, l'XP, les blessures, l'inventaire et le journal repartent à zéro. Tu choisis ensuite les survivants.</p><div class="row-btns"><button class="btn-wound" data-act="new-yes">Oui, nouvelle partie</button><button class="btn-ghost" data-act="new-cancel">Annuler</button></div></div>`
    : `<div class="row-btns"><button class="btn-ghost" data-act="setup">Changer les survivants</button><button class="btn-ghost" data-act="new">Nouvelle partie</button></div>`;
  $("team").innerHTML = `<ul class="team">${rows}</ul>${conf}`;
}

function renderJournal(){
  const ph = id => id === "setup" ? "Prép" : ((PHASES.find(p => p.id === id) || {}).name || "").slice(0, 4);
  $("journal").innerHTML = state.log.length
    ? `<ol class="log">${state.log.slice(0, 150).map(e => `<li><span class="when">T${e.r} · ${ph(e.p)}</span><span>${esc(e.t)}</span></li>`).join("")}</ol>`
    : `<p class="log-empty">Les actions apparaîtront ici au fil de la partie.</p>`;
  $("undoBtn").disabled = hist.length === 0;
}

function render(){
  renderHeader();
  renderPanel();
  const started = state.started;
  $("bilanSec").hidden = !started;
  $("teamSec").hidden = !started;
  if(started){ renderBilan(); renderTeam(); }
  renderJournal();
  renderInstall();
  if(wantScroll){
    const target = $("phasePanel");
    if(target && target.getBoundingClientRect().top < 0) target.scrollIntoView({block:"start"});
    wantScroll = false;
  }
}

/* Installation sur téléphone */
let deferredPrompt = null;
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; renderInstall(); renderPanel(); });
window.addEventListener("appinstalled", () => { deferredPrompt = null; prefSet("installDismissed", true); render(); toast("Le Carnet de survie est installé."); });
function installHow(withLater){
  const later = withLater ? `<button class="btn-ghost" data-act="install-later">Plus tard</button>` : "";
  const otherIOS = isIOS && /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  if(deferredPrompt) return `<p>Ajoute le Carnet de survie à ton écran d'accueil pour l'ouvrir comme une app, même sans réseau.</p><div class="install-actions"><button class="btn-do" data-act="install">Installer</button>${later}</div>`;
  if(otherIOS) return `<p>Touche le bouton Partager, puis « Ajouter à l'écran d'accueil ».</p><div class="install-actions">${later}</div>`;
  if(isIOS) return `<p>Sur iPhone, l'ajout se fait depuis Safari : touche Partager puis « Sur l'écran d'accueil », en laissant « Ouvrir comme app web » activé. Brave ne propose pas cette option : copie le lien et colle-le dans Safari.</p><div class="install-actions"><button class="btn-do" data-act="copy-link">Copier le lien</button>${later}</div>`;
  return `<p>Sur Android, ouvre le menu de Chrome puis « Installer l'application » ou « Ajouter à l'écran d'accueil ». Sur iPhone, passe par Safari : Partager puis « Sur l'écran d'accueil ».</p><div class="install-actions"><button class="btn-do" data-act="copy-link">Copier le lien</button>${later}</div>`;
}
function installSlot(){
  if(!IS_PWA || isStandalone() || prefGet("installDismissed") || !(deferredPrompt || isIOS)) return "";
  return `<div class="install"><b>Installer l'app</b>${installHow(true)}</div>`;
}
function renderInstall(){
  const sec = $("appSec");
  if(!sec) return;
  if(!IS_PWA || isStandalone()){ sec.hidden = true; return; }
  sec.hidden = false;
  $("appBody").innerHTML = `<div class="install">${installHow(false)}</div><p class="copyline"><code>${esc(location.origin + location.pathname)}</code></p><p class="footer-note">La partie est enregistrée sur cet appareil. Une fois installée, l'app fonctionne sans réseau.</p>`;
}
async function promptInstall(){
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  try{ const c = await deferredPrompt.userChoice; if(c && c.outcome === "accepted") prefSet("installDismissed", true); }catch(e){}
  deferredPrompt = null; render();
}
function copyLink(){
  const url = location.origin + location.pathname;
  const p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(url) : Promise.reject();
  p.then(() => toast("Lien copié : colle-le dans Safari."), () => toast(url));
}

/* Événements */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if(!b || b.disabled) return;
  const act = b.dataset.act;
  const sid = b.dataset.sid;
  const s = sid ? get(sid) : get(state.active);
  switch(act){
    case "phase": commit(() => setPhase(b.dataset.to)); break;
    case "pick": {
      const t = get(sid);
      if(state.phase === "joueurs" && t && !t.dead && !t.done && state.active !== sid){ state.active = sid; save(); render(); }
      break;
    }
    case "do": commit(() => doAction(s, b.dataset.id)); break;
    case "kill": commit(() => kill(s, b.dataset.type)); break;
    case "aaah": commit(() => {
      if(!s) return;
      s.z++; s.st.aaah++;
      if(state.last) state.last.aaah = true;
      log(`Aaahh!! Un marcheur apparaît dans la zone de ${s.name}`);
    }); break;
    case "miss": commit(() => {
      if(!s) return;
      const ranged = b.dataset.kind === "ranged";
      if(ranged) s.st.missR++; else s.st.missM++;
      if(state.last) state.last.miss = (state.last.miss || 0) + 1;
      log(`${s.name} rate un dé ${ranged ? "au tir" : "au corps à corps"}`);
    }); break;
    case "ff": commit(() => {
      const t = get(b.dataset.target);
      if(!s || !t) return;
      s.st.ff++; t.st.ffTaken++;
      if(state.last) state.last.ff = (state.last.ff || 0) + 1;
      log(`${s.name} blesse ${t.name} par erreur`);
      wound(t, 1);
    }); break;
    case "end-game": commit(() => endGame(b.dataset.result)); break;
    case "resume": commit(() => { state.ended = null; log("Reprise de la partie"); wantScroll = true; }); break;
    case "stats-open": viewStats = true; wantScroll = true; render(); break;
    case "stats-close": viewStats = false; wantScroll = true; render(); break;
    case "found": {
      const inp = $("found-" + sid);
      const v = inp ? inp.value.trim() : "";
      if(!v || !s){ if(inp) inp.focus(); break; }
      if(!s.inv.some(x => !x || !x.trim())){ openDetails.add("inv-" + s.id); toast("Inventaire plein : remplace ou défausse une carte."); render(); break; }
      commit(() => { putInInventory(s, v); s.st.found++; if(state.last) state.last.found = v; log(`${s.name} trouve : ${v}`); });
      break;
    }
    case "endturn": commit(() => endTurn(s)); break;
    case "z+": if(s){ s.z = Math.min(40, s.z + 1); save(); render(); } break;
    case "z-": if(s){ s.z = Math.max(0, s.z - 1); save(); render(); } break;
    case "wound+": commit(() => wound(get(sid), 1)); break;
    case "wound-": commit(() => wound(get(sid), -1)); break;
    case "xp+": commit(() => { const t = get(sid); if(t) addXP(t, 1); }); break;
    case "xp-": commit(() => { const t = get(sid); if(t) t.xp = Math.max(0, t.xp - 1); }); break;
    case "skill": commit(() => {
      const t = get(sid); const lv = b.dataset.level;
      if(t && (lv === "orange" || lv === "red")){ t.skills[lv] = b.dataset.name; log(`${t.name} choisit la compétence ${lv === "orange" ? "orange" : "rouge"} : ${b.dataset.name}`); }
    }); break;
    case "skill-custom": {
      const lv = b.dataset.level; const inp = $(`skin-${b.dataset.px || "sk-"}${lv}-${sid}`);
      const v = inp ? inp.value.trim() : "";
      if(!v){ if(inp) inp.focus(); break; }
      commit(() => {
        const t = get(sid); if(!t) return;
        if(lv === "blue"){ t.blue = v; editing.delete(sid + ":blue"); log(`${t.name} : compétence bleue ${v}`); }
        else { t.skills[lv] = v; log(`${t.name} choisit la compétence ${lv === "orange" ? "orange" : "rouge"} : ${v}`); }
      });
      break;
    }
    case "skill-edit": editing.add(sid + ":" + b.dataset.level); render(); break;
    case "skill-reset": commit(() => { const t = get(sid); const lv = b.dataset.level; if(t && t.skills[lv]){ log(`${t.name} change sa compétence ${lv === "orange" ? "orange" : "rouge"}`); t.skills[lv] = null; } }); break;
    case "first": commit(() => { const t = get(sid); if(t){ state.firstId = sid; log(`${t.name} devient premier joueur`); } }); break;
    case "remove": commit(() => removeSurv(sid)); break;
    case "next": commit(nextRound); break;
    case "undo":
      if(!hist.length){ toast("Rien à annuler."); break; }
      state = JSON.parse(hist.pop()); save(); render(); toast("Dernière action annulée.");
      break;
    case "pick-char": toggleChar(b.dataset.char); save(); renderPanel(); break;
    case "unpick-custom": state.draft = state.draft.filter(d => draftKey(d) !== b.dataset.key); save(); renderPanel(); break;
    case "start": commit(startFromDraft); break;
    case "setup": commit(openSetup); break;
    case "setup-cancel": commit(() => { state.setup = false; state.draft = []; }); break;
    case "new": confirmNew = true; renderTeam(); break;
    case "new-cancel": confirmNew = false; renderTeam(); break;
    case "new-yes": {
      const draft = state.survivors.map(x => ({charId:x.charId, name:x.name, blue:x.blue, kid:x.kid}));
      confirmNew = false;
      commit(() => { state = emptyState(draft); log("Nouvelle partie : choix des survivants"); });
      wantScroll = true; render();
      break;
    }
    case "install": promptInstall(); break;
    case "install-later": prefSet("installDismissed", true); render(); break;
    case "copy-link": copyLink(); break;
  }
});

document.addEventListener("change", e => {
  const el = e.target.closest("[data-change]");
  if(!el) return;
  const kind = el.dataset.change;
  const s = el.dataset.sid ? get(el.dataset.sid) : null;
  if(kind === "inb"){
    if(s){ s.inB = el.checked; save(); render(); }
  }else if(kind === "chk"){
    state.checks[el.dataset.key] = el.checked; save();
  }else if(kind === "rename"){
    const v = el.value.trim();
    if(s && v && v !== s.name) commit(() => { log(`${s.name} s'appelle désormais ${v}`); s.name = v; });
    else if(s) el.value = s.name;
  }else if(kind === "inv"){
    if(!s) return;
    const i = +el.dataset.slot, v = el.value.trim();
    if(s.inv[i] === v) return;
    commit(() => { s.inv[i] = v; log(v ? `${s.name} range « ${v} » (${SLOTS[i].toLowerCase()})` : `${s.name} vide un emplacement (${SLOTS[i].toLowerCase()})`); });
  }
});

document.addEventListener("submit", e => {
  if(e.target.id !== "customForm") return;
  e.preventDefault();
  const nameIn = $("cust-name"), blueIn = $("cust-blue");
  const name = nameIn.value.trim(), blue = blueIn.value.trim();
  if(!name){ nameIn.focus(); return; }
  if(state.draft.length >= 12){ toast("12 survivants au maximum."); return; }
  if(state.draft.some(d => draftKey(d) === "c:" + name.toLowerCase()) || D.characters.some(c => c.name.toLowerCase() === name.toLowerCase())){
    toast("Ce personnage est déjà dans la liste."); return;
  }
  state.draft.push({charId:null, name:name, blue:blue, kid:$("cust-kid").checked});
  save(); renderPanel();
  const ni = $("cust-name"); if(ni) ni.focus();
});

document.addEventListener("toggle", e => {
  const d = e.target;
  if(!d || d.tagName !== "DETAILS" || !d.id) return;
  if(d.open) openDetails.add(d.id); else openDetails.delete(d.id);
}, true);

/* Démarrage */
const list = $("equipList");
if(list) list.innerHTML = D.equipment.map(x => `<option value="${esc(x)}"></option>`).join("");
function start(data){
  if(data && data.state){ const m = migrate(data.state); if(m) state = m; }
  render();
}
try{ if(window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({state:state})); }catch(e){}
const hot = window.claude && window.claude.hot;
if(hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
if(IS_PWA && "serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
