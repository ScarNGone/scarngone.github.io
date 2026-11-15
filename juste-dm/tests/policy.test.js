// Vérifie les règles de navigation de guard.js avec les cas partagés avec les tests Swift.
// Lancer avec : node --test tests/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'JusteDM/Resources/services.json'), 'utf8'));
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'policy-vectors.json'), 'utf8'));
const { createPolicy } = require(path.join(root, 'JusteDM/Resources/guard.js'));

const service = catalog.services.find((candidate) => candidate.id === vectors.service);

test('le réseau des cas de test existe dans services.json', () => {
  assert.ok(service, `réseau ${vectors.service} introuvable`);
});

test('chaque réseau a une messagerie et une page de connexion autorisées', () => {
  for (const candidate of catalog.services) {
    const policy = createPolicy(candidate, { allowShared: true });
    assert.deepEqual(policy.decide(candidate.home, null), { action: 'allow', kind: 'messaging' }, candidate.id);
    assert.deepEqual(policy.decide(candidate.login, null), { action: 'allow', kind: 'auth' }, candidate.id);
    assert.equal(policy.isMessaging(candidate.home), true, candidate.id);
  }
});

for (const vector of vectors.cases) {
  test(`règle : ${vector.name}`, () => {
    const policy = createPolicy(service, { allowShared: vector.allowShared !== false });
    assert.deepEqual(policy.decide(vector.url, vector.from), vector.expect);
  });
}

test('la barre d\'outils s\'efface dans une conversation et pas ailleurs', () => {
  const policy = createPolicy(service, { allowShared: true });
  assert.equal(policy.isImmersive(vectors.thread), true);
  assert.equal(policy.isImmersive(vectors.inbox), false);
  assert.equal(policy.isImmersive('https://example.org/direct/t/1/'), false);
});
