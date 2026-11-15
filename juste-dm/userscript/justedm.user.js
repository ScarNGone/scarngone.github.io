// ==UserScript==
// @name         JusteDM
// @description  Instagram : la messagerie, et rien d'autre. Le fil, la recherche, les reels et les profils sont bloqués.
// @version      1.0.0
// @match        *://www.instagram.com/*
// @match        *://instagram.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// ==/UserScript==

// Fichier produit par scripts/build_userscript.js. Les sources sont services.json,
// guard.js et standalone.js : c'est elles qu'il faut modifier.

(function () {
"use strict";
if (window.top !== window) return;

var SERVICES = [
  {
    "id": "instagram",
    "name": "Instagram",
    "home": "https://www.instagram.com/direct/inbox/",
    "login": "https://www.instagram.com/accounts/login/?next=%2Fdirect%2Finbox%2F",
    "sessionCookie": {
      "name": "sessionid",
      "domain": "instagram.com"
    },
    "hosts": [
      "www.instagram.com",
      "instagram.com"
    ],
    "deny": [
      "^/accounts/activity(/|$)"
    ],
    "messaging": [
      "^/direct(/|$)",
      "^/call(/|$)"
    ],
    "auth": [
      "^/accounts(/|$)",
      "^/challenge(/|$)",
      "^/auth_platform(/|$)",
      "^/two_factor(/|$)",
      "^/checkpoint(/|$)",
      "^/consent(/|$)",
      "^/privacy/checks(/|$)",
      "^/legal(/|$)",
      "^/terms(/|$)",
      "^/oauth(/|$)",
      "^/fxcal(/|$)"
    ],
    "shared": [
      "^/(?:[^/]+/)?(?:p|reel|reels|tv)/([^/?#]+)",
      "^/stories/([^/?#]+)",
      "^/share/([^?#]+)"
    ],
    "extraHosts": [
      {
        "hosts": [
          "accountscenter.instagram.com"
        ],
        "allow": [
          "^/"
        ]
      },
      {
        "hosts": [
          "www.facebook.com",
          "m.facebook.com"
        ],
        "allow": [
          "^/login",
          "^/dialog/",
          "^/v[0-9.]+/dialog/",
          "^/oauth",
          "^/checkpoint",
          "^/two_step_verification",
          "^/two_factor",
          "^/privacy/consent",
          "^/cookie/consent",
          "^/recover",
          "^/auth_platform"
        ]
      }
    ],
    "redirectors": [
      {
        "host": "l.instagram.com",
        "param": "u"
      }
    ],
    "blockedHosts": [
      "apps.apple.com",
      "itunes.apple.com",
      "threads.net",
      "www.threads.net",
      "threads.com",
      "www.threads.com"
    ],
    "immersive": [
      "^/direct/t/"
    ],
    "hide": [
      "a[href='/']",
      "a[href='/explore/']",
      "a[href='/reels/']",
      "a[href^='/accounts/activity']",
      "a[href*='apps.apple.com']",
      "a[href*='itunes.apple.com']",
      "a[href^='instagram://']",
      "a[href*='threads.net']",
      "a[href*='threads.com']"
    ],
    "navLinks": [
      "a[href='/']",
      "a[href='/explore/']",
      "a[href='/reels/']"
    ]
  }
];
var OPTIONS = { allowShared: true, cosmetics: true };

var currentHost = window.location.hostname.toLowerCase();
var service = null;
for (var index = 0; index < SERVICES.length; index++) {
  var serviceHosts = SERVICES[index].hosts.map(function (name) { return name.toLowerCase(); });
  if (serviceHosts.indexOf(currentHost) !== -1) {
    service = SERVICES[index];
    break;
  }
}
if (!service) return;

var standalone = null;
var CONFIG = {
  service: service,
  options: OPTIONS,
  handler: "justeDM",
  onMessage: function (message) {
    if (standalone) standalone.onMessage(message);
  }
};

// ----- guard.js -----

/*
 * Garde de navigation de JusteDM.
 *
 * L'app injecte ce fichier au tout début de chaque page, précédé d'une variable CONFIG
 * (le réseau décrit dans services.json, les réglages et le nom du canal vers l'app).
 * Les tests le chargent tel quel sous Node grâce à module.exports.
 *
 * Il fait deux choses :
 *   1. refuser les clics sur les liens qui mènent hors de la messagerie ;
 *   2. cacher les menus qui y conduisent.
 *
 * createPolicy reproduit NavigationPolicy.swift. Les deux versions sont vérifiées
 * avec les mêmes cas, dans tests/policy-vectors.json.
 */

var EXTERNAL_SCHEMES = ['mailto', 'tel', 'sms', 'facetime', 'facetime-audio'];
var BLOCK = { action: 'block' };

function createPolicy(service, options) {
  var allowShared = !!(options && options.allowShared);

  function compile(list) {
    return (list || []).map(function (pattern) { return new RegExp(pattern); });
  }

  function lower(list) {
    return (list || []).map(function (value) { return String(value).toLowerCase(); });
  }

  var hosts = new Set(lower(service.hosts));
  var deny = compile(service.deny);
  var messaging = compile(service.messaging);
  var auth = compile(service.auth);
  var shared = compile(service.shared);
  var immersive = compile(service.immersive);
  var blockedHosts = new Set(lower(service.blockedHosts));

  var extraHosts = new Map();
  (service.extraHosts || []).forEach(function (group) {
    var patterns = compile(group.allow);
    lower(group.hosts).forEach(function (host) { extraHosts.set(host, patterns); });
  });

  var redirectors = new Map();
  (service.redirectors || []).forEach(function (redirector) {
    redirectors.set(String(redirector.host).toLowerCase(), redirector.param);
  });

  function parse(value) {
    if (typeof value !== 'string' || value === '') return null;
    try {
      return new URL(value);
    } catch (error) {
      return null;
    }
  }

  function schemeOf(url) {
    return url.protocol.slice(0, -1).toLowerCase();
  }

  function pathOf(url) {
    return url.pathname || '/';
  }

  function any(list, path) {
    return list.some(function (regex) { return regex.test(path); });
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return null;
    }
  }

  // Lecture d'un paramètre de requête sans transformer les « + » en espaces,
  // pour donner le même résultat que URLComponents côté Swift.
  function queryValue(url, name) {
    var parts = url.search.replace(/^\?/, '').split('&');
    for (var i = 0; i < parts.length; i++) {
      var equals = parts[i].indexOf('=');
      var key = equals === -1 ? parts[i] : parts[i].slice(0, equals);
      if (safeDecode(key) !== name) continue;
      return equals === -1 ? null : safeDecode(parts[i].slice(equals + 1));
    }
    return null;
  }

  function sharedKey(path) {
    for (var i = 0; i < shared.length; i++) {
      var match = shared[i].exec(path);
      if (match) return match[1] || '';
    }
    return null;
  }

  function isServiceURL(url) {
    return !!url && (schemeOf(url) === 'http' || schemeOf(url) === 'https') && hosts.has(url.hostname.toLowerCase());
  }

  function isMessagingURL(url) {
    if (!isServiceURL(url)) return false;
    var path = pathOf(url);
    return !any(deny, path) && any(messaging, path);
  }

  function decideURL(url, original, from, depth, viaRedirector) {
    if (!url) return BLOCK;

    var scheme = schemeOf(url);
    if (scheme === 'about') return { action: 'allow', kind: 'neutral' };
    if (EXTERNAL_SCHEMES.indexOf(scheme) !== -1) return { action: 'external', url: original };
    if (scheme !== 'http' && scheme !== 'https') return BLOCK;

    var host = url.hostname.toLowerCase();
    if (!host) return BLOCK;
    var path = pathOf(url);

    if (hosts.has(host)) {
      if (any(deny, path)) return BLOCK;
      if (any(messaging, path)) return { action: 'allow', kind: 'messaging' };
      if (any(auth, path)) return { action: 'allow', kind: 'auth' };
      if (allowShared && from) {
        var key = sharedKey(path);
        if (key !== null) {
          if (isMessagingURL(from)) return { action: 'allow', kind: 'shared' };
          if (isServiceURL(from) && sharedKey(pathOf(from)) === key) return { action: 'allow', kind: 'shared' };
        }
      }
      return BLOCK;
    }

    if (extraHosts.has(host)) {
      return any(extraHosts.get(host), path) ? { action: 'allow', kind: 'auth' } : BLOCK;
    }

    if (redirectors.has(host)) {
      if (depth >= 3) return BLOCK;
      var value = queryValue(url, redirectors.get(host));
      var target = parse(value);
      if (!target) return BLOCK;
      var targetScheme = schemeOf(target);
      if (targetScheme !== 'http' && targetScheme !== 'https') return BLOCK;
      return decideURL(target, value, from, depth + 1, true);
    }

    if (blockedHosts.has(host) && !viaRedirector) return BLOCK;
    return { action: 'external', url: original };
  }

  return {
    // Décide du sort de `url` quand la page affichée est `from` (deux chaînes).
    decide: function (url, from) {
      return decideURL(parse(url), url, parse(from), 0, false);
    },
    isMessaging: function (url) {
      return isMessagingURL(parse(url));
    },
    isImmersive: function (url) {
      var parsed = parse(url);
      return isServiceURL(parsed) && any(immersive, pathOf(parsed));
    }
  };
}

function install(win, config) {
  var doc = win.document;
  var service = config.service;
  var options = config.options || {};
  var policy = createPolicy(service, options);
  var MARK = 'data-justedm-hidden';
  // Épaisseur maximale d'une barre de menu, en points.
  var MAX_BAR_THICKNESS = 96;

  function notify(message) {
    try {
      win.webkit.messageHandlers[config.handler].postMessage(message);
    } catch (error) {
      // Hors de l'app : pas de canal vers du code natif.
    }
    // Dans Safari, c'est le script lui-même qui affiche le message (voir userscript/standalone.js).
    if (typeof config.onMessage === 'function') config.onMessage(message);
  }

  // 1. Clics

  function anchorOf(event) {
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (node && node.nodeType === 1 && node.localName === 'a' && node.hasAttribute('href')) return node;
    }
    var target = event.target;
    return target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
  }

  function absoluteHref(anchor) {
    if (typeof anchor.href === 'string') return anchor.href;
    try {
      return new URL(anchor.getAttribute('href'), doc.baseURI).href;
    } catch (error) {
      return null;
    }
  }

  function onClick(event) {
    var anchor = anchorOf(event);
    if (!anchor) return;
    var href = absoluteHref(anchor);
    // Un lien « javascript: » est un bouton déguisé, pas une navigation.
    if (!href || /^javascript:/i.test(href)) return;
    if (policy.decide(href, win.location.href).action !== 'block') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify({ type: 'blocked', url: href });
  }

  win.addEventListener('click', onClick, true);
  win.addEventListener('auxclick', onClick, true);

  // 2. Masquage des menus

  var onServiceHost = (service.hosts || []).some(function (host) {
    return String(host).toLowerCase() === win.location.hostname.toLowerCase();
  });
  if (!options.cosmetics || !onServiceHost) return;

  function isValidSelector(selector) {
    try {
      doc.createDocumentFragment().querySelector(selector);
      return true;
    } catch (error) {
      return false;
    }
  }

  var hideSelectors = (service.hide || []).filter(isValidSelector);
  var navSelectors = (service.navLinks || []).filter(isValidSelector);
  var css = hideSelectors.concat('[' + MARK + ']').join(',\n') + ' { display: none !important; }';

  function addStyle() {
    try {
      if (typeof win.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in doc) {
        var sheet = new win.CSSStyleSheet();
        sheet.replaceSync(css);
        doc.adoptedStyleSheets = Array.from(doc.adoptedStyleSheets).concat(sheet);
        return;
      }
    } catch (error) {
      // On retombe sur une balise <style>.
    }
    var style = doc.createElement('style');
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function hideElement(element) {
    if (element.hasAttribute(MARK) && element.style.getPropertyValue('display') === 'none') return;
    // Écrit directement dans le style de l'élément : cela tient même si la feuille de style est refusée.
    element.style.setProperty('display', 'none', 'important');
    element.setAttribute(MARK, '');
  }

  // Une barre de menu est le plus grand ancêtre mince qui réunit au moins deux
  // liens de navigation différents (accueil, recherche, reels).
  function navContainer(link) {
    var best = null;
    for (var node = link.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
      var rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (Math.min(rect.width, rect.height) > MAX_BAR_THICKNESS) break;
      var kinds = 0;
      for (var i = 0; i < navSelectors.length; i++) {
        if (node.querySelector(navSelectors[i])) kinds += 1;
      }
      if (kinds >= 2) best = node;
    }
    return best;
  }

  function sweep() {
    if (navSelectors.length) {
      var links = doc.querySelectorAll(navSelectors.join(','));
      for (var i = 0; i < links.length; i++) {
        var parent = links[i].parentElement;
        if (!parent || parent.closest('[' + MARK + ']')) continue;
        var container = navContainer(links[i]);
        if (container) hideElement(container);
      }
    }
    for (var j = 0; j < hideSelectors.length; j++) {
      var found = doc.querySelectorAll(hideSelectors[j]);
      for (var k = 0; k < found.length; k++) hideElement(found[k]);
    }
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    win.setTimeout(function () {
      scheduled = false;
      sweep();
    }, 120);
  }

  function start() {
    addStyle();
    sweep();
    new win.MutationObserver(schedule).observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
    win.addEventListener('resize', schedule);
    win.addEventListener('load', schedule);
  }

  // Selon le navigateur, le script peut démarrer avant que la page ait sa balise <html>.
  if (doc.documentElement) {
    start();
  } else {
    var rootObserver = new win.MutationObserver(function () {
      if (!doc.documentElement) return;
      rootObserver.disconnect();
      start();
    });
    rootObserver.observe(doc, { childList: true });
  }
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { createPolicy: createPolicy, install: install };
} else if (typeof CONFIG === 'object' && CONFIG) {
  install(window, CONFIG);
}

// ----- standalone.js -----

/*
 * Complément de guard.js pour Safari, quand aucune app n'encadre la page.
 *
 * Dans l'app iPhone, le code Swift filtre chaque chargement et surveille l'adresse.
 * Dans Safari, ce fichier fait ce travail : toute page refusée, qu'elle arrive par un
 * chargement ou par un changement d'adresse sans rechargement, ramène à la messagerie.
 *
 * scripts/build_userscript.js l'assemble avec guard.js et services.json.
 */

function installStandalone(win, config, createPolicy) {
  var doc = win.document;
  var service = config.service;
  var policy = createPolicy(service, config.options || {});
  var hosts = (service.hosts || []).map(function (host) { return String(host).toLowerCase(); });

  var KEYS = {
    context: 'justedm:context',
    returns: 'justedm:returns',
    exceptions: 'justedm:exceptions',
    notify: 'justedm:notify'
  };
  // Trois retours forcés en trente secondes : le site tourne en rond, on s'arrête.
  var MAX_RETURNS = 3;
  var RETURN_WINDOW = 30000;
  var BLOCKED = 'Hors messagerie : page bloquée';
  var TOP_LAYER = '2147483647';
  var FONT = '-apple-system, system-ui, sans-serif';

  // L'état est gardé par onglet : il survit aux rechargements, pas à la fermeture de l'onglet.
  var memory = {};
  function read(key, fallback) {
    try {
      var raw = win.sessionStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch (error) {
      // Stockage indisponible : on se contente de la mémoire de la page.
    }
    return key in memory ? memory[key] : fallback;
  }
  function write(key, value) {
    memory[key] = value;
    try {
      win.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Voir read().
    }
  }

  // Dernière page acceptée : un contenu partagé ne s'ouvre que depuis une conversation.
  var context = read(KEYS.context, null);
  // Chemins que l'utilisateur a choisi d'afficher malgré les règles, pour cet onglet.
  var exceptions = read(KEYS.exceptions, []);
  var lengthAtLoad = win.history.length;

  // Le souvenir de la page précédente ne vaut que si l'on vient du réseau lui-même.
  // Une adresse tapée, un favori ou un lien venu d'ailleurs repartent de zéro.
  function arrivedFromService() {
    try {
      var entries = win.performance.getEntriesByType('navigation');
      var type = entries.length ? entries[0].type : 'navigate';
      if (type === 'reload' || type === 'back_forward') return true;
    } catch (error) {
      // Mesure indisponible : on s'en remet à la page d'origine.
    }
    var referrer = parse(doc.referrer);
    return !!referrer && hosts.indexOf(referrer.hostname.toLowerCase()) !== -1;
  }
  if (context !== null && !arrivedFromService()) {
    context = null;
    write(KEYS.context, null);
  }

  var lastSeen = null;
  var leaving = null;
  var concealed = false;
  // Message d'arrêt affiché, ou PENDING tant que la page n'est pas prête à le recevoir.
  var PENDING = {};
  var notice = null;

  function parse(value) {
    try {
      return new URL(value);
    } catch (error) {
      return null;
    }
  }

  function decide(url) {
    var parsed = parse(url);
    if (parsed && hosts.indexOf(parsed.hostname.toLowerCase()) !== -1 && exceptions.indexOf(parsed.pathname) !== -1) {
      return { action: 'allow', kind: 'auth' };
    }
    return policy.decide(url, context);
  }

  // Selon le navigateur, le script peut démarrer avant que la page ait sa balise <html>.
  // Tout ce qui touche à la page attend donc qu'elle existe.
  function whenRootReady(action) {
    if (doc.documentElement) {
      action();
      return;
    }
    var observer = new win.MutationObserver(function () {
      if (!doc.documentElement) return;
      observer.disconnect();
      action();
    });
    observer.observe(doc, { childList: true });
  }

  // Une page refusée est rendue invisible le temps de la quitter.
  function conceal() {
    if (concealed) return;
    concealed = true;
    whenRootReady(function () {
      if (concealed) doc.documentElement.style.setProperty('visibility', 'hidden', 'important');
    });
  }

  function reveal() {
    if (!concealed) return;
    concealed = false;
    if (doc.documentElement) doc.documentElement.style.removeProperty('visibility');
  }

  function evaluate() {
    var url = win.location.href;
    // Le site peut retirer de la page ce qu'il n'y a pas mis lui-même.
    if (notice && notice !== PENDING && !notice.isConnected && doc.documentElement) {
      doc.documentElement.appendChild(notice);
    }
    if (url === lastSeen) return;
    lastSeen = url;
    if (leaving !== url) leaving = null;

    var decision = decide(url);
    if (decision.action === 'block') {
      leave(url);
      return;
    }
    if (decision.action === 'allow' && decision.kind !== 'neutral') {
      context = url;
      write(KEYS.context, url);
    }
    if (!notice) reveal();
  }

  function leave(url) {
    if (leaving === url) return;
    leaving = url;
    conceal();
    toast(BLOCKED);

    // Si le site a ajouté des pages à l'historique depuis le chargement, un pas en arrière
    // ramène à la page précédente sans rien recharger. On vérifie ensuite que c'est bien le cas.
    if (context !== null && win.history.length > lengthAtLoad) {
      win.history.back();
      win.setTimeout(function () {
        if (decide(win.location.href).action === 'block') redirect(win.location.href);
      }, 800);
      return;
    }
    redirect(url);
  }

  function redirect(refused) {
    var now = Date.now();
    var returns = read(KEYS.returns, []).filter(function (time) { return now - time < RETURN_WINDOW; });
    if (returns.length >= MAX_RETURNS) {
      write(KEYS.returns, []);
      showNotice(refused);
      return;
    }
    returns.push(now);
    write(KEYS.returns, returns);
    // La page d'arrivée affichera le message : celle-ci disparaît trop vite pour le montrer.
    write(KEYS.notify, true);
    win.location.replace(context !== null && policy.isMessaging(context) ? context : service.home);
  }

  // Messages

  function dark() {
    try {
      return win.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (error) {
      return false;
    }
  }

  var toastElement = null;
  var toastTimer = null;
  function toast(text) {
    whenRootReady(function () {
      showToast(text);
    });
  }

  function showToast(text) {
    if (!toastElement) {
      toastElement = doc.createElement('div');
      toastElement.setAttribute('role', 'status');
      toastElement.setAttribute('data-justedm-toast', '');
      toastElement.style.cssText =
        'position:fixed;top:calc(env(safe-area-inset-top, 0px) + 12px);left:50%;transform:translateX(-50%);' +
        'z-index:' + TOP_LAYER + ';max-width:80vw;padding:9px 16px;border-radius:18px;' +
        'background:rgba(20,20,20,.92);color:#fff;font:600 13px/1.3 ' + FONT + ';text-align:center;' +
        'pointer-events:none;visibility:visible !important;transition:opacity .25s;';
    }
    toastElement.textContent = text;
    toastElement.style.opacity = '1';
    if (!toastElement.isConnected) doc.documentElement.appendChild(toastElement);
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(function () {
      toastElement.style.opacity = '0';
    }, 1800);
  }

  function button(label, primary, action) {
    var element = doc.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.style.cssText =
      'display:block;width:100%;margin:10px 0 0;padding:13px 16px;border:0;border-radius:12px;cursor:pointer;' +
      'font:600 16px/1.2 ' + FONT + ';' +
      (primary ? 'background:#0F7AA8;color:#fff;' : dark() ? 'background:#2c2c2e;color:#fff;' : 'background:#e9e9eb;color:#111;');
    element.addEventListener('click', action);
    return element;
  }

  function paragraph(text, style) {
    var element = doc.createElement('p');
    element.textContent = text;
    element.style.cssText = 'margin:0 0 10px;text-align:center;' + style;
    return element;
  }

  // Le site renvoie sans cesse vers une page refusée : on s'arrête et on laisse choisir.
  function showNotice(refused) {
    if (notice) return;
    notice = PENDING;
    whenRootReady(function () {
      buildNotice(refused);
    });
  }

  function buildNotice(refused) {
    var parsed = parse(refused);
    var page = parsed ? parsed.hostname + parsed.pathname : refused;

    notice = doc.createElement('div');
    notice.setAttribute('role', 'alertdialog');
    notice.setAttribute('data-justedm-notice', '');
    notice.style.cssText =
      'position:fixed;top:0;right:0;bottom:0;left:0;z-index:' + TOP_LAYER + ';box-sizing:border-box;padding:28px;' +
      'display:flex;flex-direction:column;justify-content:center;visibility:visible !important;' +
      (dark() ? 'background:#000;color:#fff;' : 'background:#fff;color:#111;');

    notice.appendChild(paragraph(service.name + ' renvoie vers une autre page', 'font:600 17px/1.3 ' + FONT + ';'));
    notice.appendChild(paragraph(
      'Le site insiste pour afficher ' + page + ', qui ne fait pas partie de la messagerie.',
      'font:15px/1.4 ' + FONT + ';opacity:.7;margin-bottom:14px;'
    ));
    notice.appendChild(button('Réessayer', true, function () {
      win.location.replace(service.home);
    }));
    notice.appendChild(button('Ouvrir la page de connexion', false, function () {
      win.location.replace(service.login);
    }));
    notice.appendChild(button('Afficher quand même cette page', false, function () {
      if (parsed && exceptions.indexOf(parsed.pathname) === -1) {
        exceptions.push(parsed.pathname);
        write(KEYS.exceptions, exceptions);
      }
      notice.remove();
      notice = null;
      leaving = null;
      lastSeen = null;
      evaluate();
    }));
    doc.documentElement.appendChild(notice);
  }

  // Démarrage : la page en cours, puis chaque changement d'adresse.

  // Le message laissé par la page précédente se lit avant d'examiner celle-ci,
  // qui peut à son tour en laisser un pour la suivante.
  var returned = read(KEYS.notify, false);
  if (returned) write(KEYS.notify, false);
  evaluate();
  if (returned && !leaving) toast(BLOCKED);
  win.addEventListener('popstate', evaluate);
  win.addEventListener('hashchange', evaluate);
  win.addEventListener('pageshow', function () {
    lastSeen = null;
    evaluate();
  });
  // Un site monopage change d'adresse sans prévenir. Il modifie alors la page, ce que
  // l'observateur voit aussitôt ; la minuterie rattrape le reste.
  whenRootReady(function () {
    new win.MutationObserver(evaluate).observe(doc.documentElement, { childList: true, subtree: true });
  });
  win.setInterval(evaluate, 250);

  return {
    onMessage: function (message) {
      if (message && message.type === 'blocked') toast(BLOCKED);
    }
  };
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { installStandalone: installStandalone };
}

standalone = installStandalone(window, CONFIG, createPolicy);
})();
