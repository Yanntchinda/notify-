'use strict';

/* Régénère le plan embarqué servi par l'application (public/data/) à partir
   des données Natural Earth du paquet world-atlas (domaine public).
   Usage : npm run build:map */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'data');
const ATLAS = path.join(ROOT, 'node_modules', 'world-atlas');

const FILES = [
  ['countries-110m.json', 'basemap-countries.json'],
  ['land-110m.json', 'basemap-land.json'],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [source, target] of FILES) {
  const from = path.join(ATLAS, source);
  if (!fs.existsSync(from)) {
    console.error(`⚠️  ${source} introuvable — lancez d'abord « npm install ».`);
    process.exitCode = 1;
    continue;
  }
  const to = path.join(OUT, target);
  fs.copyFileSync(from, to);
  console.log(`✓ ${target} (${(fs.statSync(to).size / 1024).toFixed(0)} Ko)`);
}
