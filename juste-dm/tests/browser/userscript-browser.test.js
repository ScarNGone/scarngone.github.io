// Fait tourner le script pour Safari (userscript/justedm.user.js) dans un vrai navigateur,
// sur la maquette de messagerie. Rien ne sort sur le réseau.
// Demande Playwright ; sans lui, le test est ignoré.
// Lancer avec : node --test tests/browser/userscript-browser.test.js
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
const userscript = fs.readFileSync(path.join(root, 'userscript/justedm.user.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock-spa.html'), 'utf8');
const ORIGIN = 'https://www.instagram.com';

// `loop` simule un site qui renvoie sans cesse la messagerie vers le fil.
async function open(browser, { loop = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      return route.fulfill({ contentType: 'text/html', body: '<title>ailleurs</title><p id="elsewhere">Autre site</p>' });
    }
    if (loop && url.pathname.startsWith('/direct/')) {
      // Une vraie redirection HTTP sortirait de l'interception : la page se redirige elle-même.
      return route.fulfill({ contentType: 'text/html', body: '<script>location.replace("/")</script>' });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: mock });
  });
  await context.addInitScript({ content: userscript });
  return { context, page: await context.newPage() };
}

// Le script peut interrompre le chargement demandé pour en lancer un autre.
async function visit(page, pathname, expected) {
  await page.goto(ORIGIN + pathname).catch(() => {});
  await page.waitForURL(ORIGIN + expected, { timeout: 5000 });
  await page.waitForTimeout(400);
}

const pathOf = (page) => new URL(page.url()).pathname + new URL(page.url()).search;
const isShown = (page, selector) => page.locator(selector).first().isVisible();

test(`script pour Safari dans un navigateur (${engine})`, { skip: browserType ? false : 'Playwright absent' }, async (t) => {
  const browser = await browserType.launch();
  t.after(() => browser.close());

  await t.test('une adresse refusée ouverte directement ramène à la messagerie', async () => {
    // Deux onglets : au-delà de trois retours forcés en trente secondes, le script s'arrête.
    for (const group of [['/explore/', '/', '/reels/'], ['/unprofil/', '/p/ABC/']]) {
      const { context, page } = await open(browser);
      for (const refused of group) {
        await visit(page, refused, '/direct/inbox/');
        assert.equal(await isShown(page, '#thread-1'), true, refused);
        assert.equal(await page.locator('#feed').count(), 0, refused);
      }
      assert.equal(await page.locator('[data-justedm-toast]').innerText(), 'Hors messagerie : page bloquée');
      await context.close();
    }
  });

  await t.test('la messagerie et les contenus reçus restent utilisables', async () => {
    const { context, page } = await open(browser);
    await visit(page, '/direct/inbox/', '/direct/inbox/');
    assert.equal(await isShown(page, 'nav#tabs'), false, 'barre du bas cachée');
    assert.equal(await isShown(page, '#new'), true);

    await page.click('#thread-1');
    assert.equal(pathOf(page), '/direct/t/1/');
    await page.click('#profile');
    assert.equal(pathOf(page), '/direct/t/1/', 'profil refusé');
    assert.equal(await page.locator('[data-justedm-toast]').innerText(), 'Hors messagerie : page bloquée');

    await page.click('#post');
    assert.equal(pathOf(page), '/p/ABC/');
    assert.equal(await isShown(page, '#post-body'), true, 'publication reçue visible');

    await page.reload();
    await page.waitForTimeout(400);
    assert.equal(pathOf(page), '/p/ABC/', 'un rechargement garde la publication reçue');
    assert.equal(await isShown(page, '#post-body'), true);

    await page.click('#more');
    assert.equal(pathOf(page), '/p/ABC/', 'pas d\'autre publication');
    await context.close();
  });

  await t.test('un contenu reçu ouvert par un chargement complet s\'affiche, pas le suivant', async () => {
    const { context, page } = await open(browser);
    await visit(page, '/direct/t/1/', '/direct/t/1/');
    await page.evaluate(() => { location.href = '/p/ABC/'; });
    await page.waitForURL(ORIGIN + '/p/ABC/');
    await page.waitForTimeout(400);
    assert.equal(await isShown(page, '#post-body'), true);

    await page.evaluate(() => { location.href = '/p/DEF/'; });
    await page.waitForURL(ORIGIN + '/direct/inbox/', { timeout: 5000 });
    assert.equal(await isShown(page, '#thread-1'), true);
    await context.close();
  });

  await t.test('une navigation interne vers une page refusée est annulée', async () => {
    const { context, page } = await open(browser);
    await visit(page, '/direct/inbox/', '/direct/inbox/');
    await page.click('#thread-1');

    // Le site ajoute une page à l'historique sans passer par un lien.
    await page.evaluate(() => { history.pushState({}, '', '/explore/'); window.render(); });
    await page.waitForURL(ORIGIN + '/direct/t/1/', { timeout: 5000 });
    await page.waitForTimeout(300);
    assert.equal(await isShown(page, '#composer'), true, 'retour dans la conversation');
    assert.equal(await page.locator('#feed').count(), 0);

    // Le site remplace l'adresse courante.
    await page.evaluate(() => { history.replaceState({}, '', '/reels/'); window.render(); });
    await page.waitForFunction(() => document.querySelector('#feed') === null && !!document.querySelector('#composer, #thread-1'), null, { timeout: 5000 });
    assert.notEqual(pathOf(page), '/reels/');
    assert.match(pathOf(page), /^\/direct\//);
    await context.close();
  });

  await t.test('un site qui tourne en rond s\'arrête sur un message, avec une sortie', async () => {
    const { context, page } = await open(browser, { loop: true });
    await page.goto(ORIGIN + '/direct/inbox/').catch(() => {});
    const notice = page.locator('[data-justedm-notice]');
    await notice.waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await notice.innerText(), /renvoie vers une autre page/);
    assert.match(await notice.innerText(), /www\.instagram\.com\//);
    assert.equal(pathOf(page), '/');
    assert.equal(await isShown(page, '#feed'), false, 'page refusée invisible derrière le message');

    await notice.getByText('Afficher quand même cette page').click();
    assert.equal(await notice.count(), 0);
    assert.equal(await isShown(page, '#feed'), true, 'page affichée sur demande');
    assert.equal(pathOf(page), '/');
    await context.close();
  });

  await t.test('le script ne touche pas aux autres sites', async () => {
    const { context, page } = await open(browser);
    await page.goto('https://example.com/quelquepart');
    await page.waitForTimeout(400);
    assert.equal(page.url(), 'https://example.com/quelquepart');
    assert.equal(await isShown(page, '#elsewhere'), true);
    await context.close();
  });
});
