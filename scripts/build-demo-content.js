'use strict';

/*
 * Génère public/data/demo-content.json — contenu de démonstration embarqué.
 *
 * Sert de solution de secours quand aucune base n'est configurée : l'application
 * installée (APK / iOS) reste présentable sans Supabase, et bascule
 * automatiquement sur les vraies données dès que public/js/config.js est rempli.
 *
 * Usage : npm run build:demo-content
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const data = require(path.join(ROOT, 'server', 'db')).load();

const today = new Date().toISOString().slice(0, 10);
const sortDate = (a, b) => new Date(a.departureDate) - new Date(b.departureDate);

const content = {
  sliders: data.sliders.slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
  departures: data.departures
    .filter((d) => d.departureDate >= today && d.status !== 'departed')
    .sort(sortDate),
  ports: data.ports,
  containers: data.containers.filter((c) => c.active !== false),
  services: data.services.filter((s) => s.active !== false),
};

const target = path.join(ROOT, 'public', 'data', 'demo-content.json');
fs.writeFileSync(target, `${JSON.stringify(content, null, 2)}\n`);

console.log(
  `✓ demo-content.json — ${content.ports.length} ports, ${content.departures.length} départs, ` +
    `${content.containers.length} conteneurs, ${content.sliders.length} slides, ${content.services.length} services`
);
