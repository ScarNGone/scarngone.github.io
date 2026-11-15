// Fait tourner guard.js dans un vrai navigateur, sur une maquette de messagerie.
// Rien ne sort sur le réseau : toutes les requêtes sont servies localement.
// Demande Playwright (npm i -D playwright) ; sans lui, le test est ignoré.
// Lancer avec : node --test tests/browser/guard-browser.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Moteur de navigateur : chromium par défaut, webkit (le moteur de Safari) avec JUSTEDM_BROWSER=webkit.
const engine = process.env.JUSTEDM_BROWSER || 'chromium';
let browserType = null;
try {
  browserType = require('playwright')[engine] || null;
} catch (error) {
  browserType = null;
}

const root = path.join(__dirname, '..', '..');
const guardSource = fs.readFileSync(path.join(root, 'JusteDM/Resources/guard.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'JusteDM/Resources/services.json'), 'utf8'));
const mock = fs.readFileSync(path.join(__dirname, 'mock-spa.html'), 'utf8');
const service = catalog.services.find((candidate) => candidate.id === 'instagram');
const ORIGIN = 'https://www.instagram.com';

// Même enveloppe que ScriptBuilder.swift.
function wrapped(options) {
  const config = { service, options, handler: 'justeDM' };
  return `(function(){\n"use strict";\nvar CONFIG = ${JSON.stringify(config)};\n${guardSource}\n})();`;
}

const fakeBridge = `
  window.__messages = [];
  window.webkit = { messageHandlers: { justeDM: { postMessage: function (m) { window.__messages.push(m); } } } };
`;

async function open(browser, options, startPath) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: mock });
    return route.fulfill({ contentType: 'text/html', body: '<title>ailleurs</title>' });
  });
  await context.addInitScript({ content: fakeBridge });
  await context.addInitScript({ content: wrapped(options) });
  const page = await context.newPage();
  await page.goto(ORIGIN + startPath);
  // Laisse passer un balayage de masquage (120 ms).
  await page.waitForTimeout(400);
  return { context, page };
}

const pathOf = (page) => new URL(page.url()).pathname + new URL(page.url()).search;
const isShown = (page, selector) => page.locator(selector).first().isVisible();
const blocked = (page) => page.evaluate(() => window.__messages.filter((m) => m.type === 'blocked').map((m) => new URL(m.url).pathname));
const reached = (page) => page.evaluate(() => window.__reached || []);

test(`guard.js dans un navigateur (${engine})`, { skip: browserType ? false : 'Playwright absent' }, async (t) => {
  const browser = await browserType.launch();
  t.after(() => browser.close());

  await t.test('boîte de réception : les menus disparaissent, la messagerie reste', async () => {
    const { context, page } = await open(browser, { allowShared: true, cosmetics: true }, '/direct/inbox/');
    assert.equal(await isShown(page, 'nav#tabs'), false, 'barre du bas');
    assert.equal(await isShown(page, '#back'), false, 'retour vers le fil');
    assert.equal(await isShown(page, '#logo'), false, 'logo vers le fil');
    assert.equal(await isShown(page, 'header'), true, 'en-tête');
    assert.equal(await isShown(page, '#new'), true, 'nouveau message');
    assert.equal(await isShown(page, '#thread-1'), true, 'conversation');
    assert.equal(await page.locator('nav#tabs').getAttribute('data-justedm-hidden'), '', 'barre marquée');
    assert.equal(await page.locator('header').getAttribute('data-justedm-hidden'), null, 'en-tête non marqué');
    await context.close();
  });

  await t.test('conversation : profil refusé, contenus reçus ouverts un par un', async () => {
    const { context, page } = await open(browser, { allowShared: true, cosmetics: true }, '/direct/inbox/');
    await page.click('#thread-1');
    assert.equal(pathOf(page), '/direct/t/1/');
    assert.equal(await isShown(page, 'header'), true);
    assert.equal(await isShown(page, '#composer'), true);

    await page.click('#profile');
    assert.equal(pathOf(page), '/direct/t/1/', 'le profil ne s\'ouvre pas');
    assert.deepEqual(await blocked(page), ['/alice/']);
    assert.deepEqual((await reached(page)).includes('profile'), false, 'le site ne voit pas le clic refusé');

    await page.click('#fake-button');
    assert.equal((await reached(page)).includes('fake-button'), true, 'un bouton déguisé en lien reste utilisable');

    await page.click('#post');
    assert.equal(pathOf(page), '/p/ABC/', 'la publication reçue s\'ouvre');
    await page.waitForTimeout(300);
    assert.equal(await isShown(page, 'nav#tabs'), false, 'barre du bas sur la publication');

    await page.click('#more');
    assert.equal(pathOf(page), '/p/ABC/', 'pas d\'autre publication');
    await page.click('#author');
    assert.equal(pathOf(page), '/p/ABC/', 'pas de profil');
    await page.click('#next-image');
    assert.equal(pathOf(page), '/p/ABC/?img_index=2', 'image suivante de la même publication');
    assert.deepEqual(await blocked(page), ['/alice/', '/p/DEF/', '/alice/']);
    await context.close();
  });

  await t.test('lien externe : laissé à l\'app, qui l\'ouvre dans le navigateur du téléphone', async () => {
    const { context, page } = await open(browser, { allowShared: true, cosmetics: true }, '/direct/t/1/');
    const popup = context.waitForEvent('page');
    await page.click('#ext');
    const opened = await popup;
    assert.equal(new URL(opened.url()).hostname, 'l.instagram.com');
    assert.deepEqual(await blocked(page), []);
    await context.close();
  });

  await t.test('mode strict : aucun contenu reçu ne s\'ouvre', async () => {
    const { context, page } = await open(browser, { allowShared: false, cosmetics: true }, '/direct/t/1/');
    await page.click('#post');
    assert.equal(pathOf(page), '/direct/t/1/');
    await page.click('#reel');
    assert.equal(pathOf(page), '/direct/t/1/');
    assert.deepEqual(await blocked(page), ['/p/ABC/', '/reel/XYZ/']);
    await context.close();
  });

  await t.test('masquage désactivé : les menus se voient mais ne mènent nulle part', async () => {
    const { context, page } = await open(browser, { allowShared: true, cosmetics: false }, '/direct/inbox/');
    assert.equal(await isShown(page, 'nav#tabs'), true);
    await page.click('nav#tabs a[href="/explore/"]');
    assert.equal(pathOf(page), '/direct/inbox/');
    await page.click('nav#tabs a[href="/"]');
    assert.equal(pathOf(page), '/direct/inbox/');
    await page.click('nav#tabs a[href="/monpseudo/"]');
    assert.equal(pathOf(page), '/direct/inbox/');
    await page.click('#thread-2');
    assert.equal(pathOf(page), '/direct/t/2/');
    await context.close();
  });
});
