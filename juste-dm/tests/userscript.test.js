// Vérifie que le script pour Safari est à jour et bien formé.
// Lancer avec : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const { build, outputPath } = require(path.join(root, 'scripts/build_userscript.js'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'JusteDM/Resources/services.json'), 'utf8'));

test('le script publié correspond à ses sources', () => {
  assert.equal(
    fs.readFileSync(outputPath, 'utf8'),
    build(),
    'relancer node scripts/build_userscript.js après avoir modifié guard.js, standalone.js ou services.json'
  );
});

test('l\'en-tête cible chaque domaine des réseaux et démarre avant la page', () => {
  const source = fs.readFileSync(outputPath, 'utf8');
  const header = source.slice(0, source.indexOf('// ==/UserScript=='));
  for (const service of catalog.services) {
    for (const host of service.hosts) {
      assert.ok(header.includes(`// @match        *://${host}/*`), host);
    }
  }
  assert.ok(header.includes('// @run-at       document-start'));
  assert.ok(header.startsWith('// ==UserScript=='));
});

test('le script est du JavaScript valide', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(outputPath, 'utf8'), { filename: 'justedm.user.js' }));
});
