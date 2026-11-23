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

fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);

fs.rmSync(WWW_DIR, { recursive: true, force: true });
copyDir(PUBLIC_DIR, WWW_DIR);

/* Injection de la configuration Supabase dans l'application embarquée. */
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();
const appUrl = (process.env.PUBLIC_APP_URL || '').trim();
fs.writeFileSync(
  path.join(WWW_DIR, 'js', 'config.js'),
  `'use strict';\nwindow.APP_CONFIG = ${JSON.stringify(
    { supabaseUrl, supabaseAnonKey: supabaseKey, appUrl },
    null,
    2
  )};\n`
);

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_ANON_KEY non définis : l’application ne pourra pas se connecter à la base.');
  console.warn('   Exemple : SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... npm run build:' + platform);
} else {
  console.log(`✓ Supabase configuré (${supabaseUrl})`);
}

execSync(`npx cap sync ${platform}`, { cwd: ROOT, stdio: 'inherit' });
console.log(`✓ Projet ${platform} synchronisé`);
