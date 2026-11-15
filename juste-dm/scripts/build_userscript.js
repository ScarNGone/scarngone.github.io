// Assemble le script pour Safari à partir de services.json, guard.js et standalone.js.
//
//   node scripts/build_userscript.js           écrit userscript/justedm.user.js
//   node scripts/build_userscript.js --check   échoue si ce fichier n'est plus à jour
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outputPath = path.join(root, 'userscript/justedm.user.js');
const VERSION = '1.0.0';

function build() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'JusteDM/Resources/services.json'), 'utf8'));
  const guard = fs.readFileSync(path.join(root, 'JusteDM/Resources/guard.js'), 'utf8').trimEnd();
  const standalone = fs.readFileSync(path.join(root, 'userscript/standalone.js'), 'utf8').trimEnd();

  const names = catalog.services.map((service) => service.name).join(', ');
  const matches = catalog.services.flatMap((service) =>
    service.hosts.map((host) => `// @match        *://${host}/*`)
  );

  const header = [
    '// ==UserScript==',
    '// @name         JusteDM',
    `// @description  ${names} : la messagerie, et rien d'autre. Le fil, la recherche, les reels et les profils sont bloqués.`,
    `// @version      ${VERSION}`,
    ...matches,
    '// @run-at       document-start',
    '// @inject-into  content',
    '// @noframes',
    '// ==/UserScript==',
  ].join('\n');

  return `${header}

// Fichier produit par scripts/build_userscript.js. Les sources sont services.json,
// guard.js et standalone.js : c'est elles qu'il faut modifier.

(function () {
"use strict";
if (window.top !== window) return;

var SERVICES = ${JSON.stringify(catalog.services, null, 2)};
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

${guard}

// ----- standalone.js -----

${standalone}

standalone = installStandalone(window, CONFIG, createPolicy);
})();
`;
}

module.exports = { build, outputPath };

if (require.main === module) {
  const built = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (current !== built) {
      console.error('userscript/justedm.user.js n\'est plus à jour : relancer node scripts/build_userscript.js');
      process.exit(1);
    }
    console.log('userscript/justedm.user.js est à jour.');
  } else {
    fs.writeFileSync(outputPath, built);
    console.log(`Script écrit : ${path.relative(root, outputPath)} (${built.length} caractères)`);
  }
}
