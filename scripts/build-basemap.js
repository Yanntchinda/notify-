'use strict';

/* Régénère le plan embarqué servi par l'application (public/data/) à partir
   des données Natural Earth du paquet world-atlas (domaine public).
   Les noms de pays sont traduits en français via world-countries.
   Usage : npm run build:map */

const fs = require('fs');
const path = require('path');
const atlasCountries = require('world-countries');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'data');
const ATLAS = path.join(ROOT, 'node_modules', 'world-atlas');

fs.mkdirSync(OUT, { recursive: true });

const byNumericCode = new Map();
for (const country of atlasCountries) {
  if (country.ccn3) byNumericCode.set(String(Number(country.ccn3)), country);
}

const FALLBACK_NAMES = {
  'N. Cyprus': 'Chypre du Nord',
  Somaliland: 'Somaliland',
  Kosovo: 'Kosovo',
};

function frenchName(feature) {
  const code = feature.id != null ? String(Number(feature.id)) : null;
  const country = code ? byNumericCode.get(code) : null;
  if (!country) return FALLBACK_NAMES[feature.properties && feature.properties.name] || null;
  return (country.translations && country.translations.fra && country.translations.fra.common) || country.name.common;
}

/* Pays : frontières + nom français */
const countriesPath = path.join(ATLAS, 'countries-110m.json');
if (fs.existsSync(countriesPath)) {
  const raw = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
  let translated = 0;
  for (const feature of raw.objects.countries.geometries) {
    const name = frenchName(feature);
    if (name) {
      feature.properties = feature.properties || {};
      feature.properties.nameFr = name;
      translated += 1;
    }
  }
  const target = path.join(OUT, 'basemap-countries.json');
  fs.writeFileSync(target, JSON.stringify(raw));
  console.log(`✓ basemap-countries.json (${translated} pays traduits)`);
} else {
  console.error("⚠️  world-atlas introuvable — lancez d'abord « npm install ».");
  process.exitCode = 1;
}

/* Terres : contours des continents */
const landPath = path.join(ATLAS, 'land-110m.json');
if (fs.existsSync(landPath)) {
  const target = path.join(OUT, 'basemap-land.json');
  fs.copyFileSync(landPath, target);
  console.log(`✓ basemap-land.json (${(fs.statSync(target).size / 1024).toFixed(0)} Ko)`);
}
