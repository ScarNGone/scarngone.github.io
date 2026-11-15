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
    // La page acceptée en dernier, rechargée ou rouverte telle quelle.
    if (context === win.location.href) return true;
    // Un rechargement ou un retour dans l'historique. Les navigateurs ne renseignent pas
    // tous la même mesure aussi tôt dans la vie de la page : on consulte les deux.
    try {
      var entries = win.performance.getEntriesByType('navigation');
      var type = entries.length ? entries[0].type : '';
      if (type === 'reload' || type === 'back_forward') return true;
    } catch (error) {
      // Mesure indisponible.
    }
    try {
      var legacy = win.performance.navigation.type;
      if (legacy === 1 || legacy === 2) return true;
    } catch (error) {
      // Mesure indisponible.
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
