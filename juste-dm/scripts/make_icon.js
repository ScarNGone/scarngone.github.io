// Convertit scripts/icon.svg en icône d'app (PNG carré de 1024 points, sans transparence).
// Demande Playwright et ImageMagick :
//   node scripts/make_icon.js
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const output = path.join(root, 'JusteDM/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${svg}`);
  await page.screenshot({ path: output, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  await browser.close();

  // L'App Store et certains outils refusent une icône avec un canal de transparence.
  execFileSync('convert', [output, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-strip', `PNG24:${output}`]);
  console.log(`Icône écrite : ${path.relative(root, output)}`);
})();
