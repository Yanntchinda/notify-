'use strict';

/* Prépare le projet Android (Capacitor) :
   1. écrit capacitor.config.json avec l'URL de l'application déployée,
   2. copie l'interface web dans www/ (coquille de secours hors ligne),
   3. synchronise la plateforme Android.

   Usage :
     PUBLIC_APP_URL=https://transit.example.com npm run build:android
   Puis :  cd android && ./gradlew assembleDebug      (ou via GitHub Actions) */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const WWW_DIR = path.join(ROOT, 'www');
const CONFIG_PATH = path.join(ROOT, 'capacitor.config.json');

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
  console.warn('⚠️  PUBLIC_APP_URL non défini : l’APK affichera la coquille locale, sans API.');
  console.warn('   Exemple : PUBLIC_APP_URL=https://transit.example.com npm run build:android');
}

fs.rmSync(WWW_DIR, { recursive: true, force: true });
copyDir(PUBLIC_DIR, WWW_DIR);
console.log(`✓ www/ préparé depuis public/ (${appUrl ? `API sur ${appUrl}` : 'sans serveur'})`);

execSync('npx cap sync android', { cwd: ROOT, stdio: 'inherit' });
console.log('✓ Projet Android synchronisé — lancer « cd android && ./gradlew assembleDebug »');
