'use strict';

/* Prépare un projet mobile (Capacitor) pour Android ou iOS :
   1. écrit capacitor.config.json avec l'URL de l'application déployée,
   2. copie l'interface web dans www/ (coquille de secours),
   3. synchronise la plateforme demandée.

   Usage :
     PUBLIC_APP_URL=https://transit.example.com npm run build:android
     PUBLIC_APP_URL=https://transit.example.com npm run build:ios          */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const WWW_DIR = path.join(ROOT, 'www');
const CONFIG_PATH = path.join(ROOT, 'capacitor.config.json');

const platform = (process.argv[2] || 'android').toLowerCase();
const appUrl = (process.env.PUBLIC_APP_URL || '').trim();

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

const config = {
  appId: 'cm.transit.app',
  appName: 'Transit Ro-Ro',
  webDir: 'www',
  androidScheme: 'https',
};

if (appUrl) {
  config.server = { url: appUrl, cleartext: false };
}

fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);

if (!appUrl) {
  console.warn('⚠️  PUBLIC_APP_URL non défini : l’application affichera la coquille locale, sans API.');
  console.warn('   Exemple : PUBLIC_APP_URL=https://transit.example.com npm run build:' + platform);
}

fs.rmSync(WWW_DIR, { recursive: true, force: true });
copyDir(PUBLIC_DIR, WWW_DIR);
console.log(`✓ www/ préparé depuis public/ (${appUrl ? `API sur ${appUrl}` : 'sans serveur'})`);

execSync(`npx cap sync ${platform}`, { cwd: ROOT, stdio: 'inherit' });
console.log(`✓ Projet ${platform} synchronisé`);
