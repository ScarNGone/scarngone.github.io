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
