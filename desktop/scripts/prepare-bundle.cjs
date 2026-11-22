'use strict';
// Called immediately after a Windows build with the same NEXT_PUBLIC_* env.
const fs = require('node:fs');
const path = require('node:path');
const { SUPABASE_URL } = require('../src/config.cjs');
const source = process.argv[2] && path.resolve(process.argv[2]);
const destination = path.resolve(__dirname, '..', 'resources', 'standalone');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!source || process.env.NEXT_PUBLIC_SUPABASE_URL !== SUPABASE_URL || !anonKey) {
  throw new Error(`Indiquer le dossier wacrm, NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL} et NEXT_PUBLIC_SUPABASE_ANON_KEY.`);
}
const standalone = path.join(source, '.next', 'standalone');
const staticDir = path.join(source, '.next', 'static');
const publicDir = path.join(source, 'public');
for (const file of [path.join(standalone, 'server.js'), staticDir, publicDir]) {
  if (!fs.existsSync(file)) throw new Error(`Fichier de compilation absent : ${file}`);
}
// Refuse accidental deletion when source and destination overlap.
const relative = path.relative(source, destination);
if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
  throw new Error('Le dossier de sortie ne doit pas être dans le projet source.');
}
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(standalone, destination, { recursive: true });
fs.cpSync(staticDir, path.join(destination, '.next', 'static'), { recursive: true });
fs.cpSync(publicDir, path.join(destination, 'public'), { recursive: true });
fs.writeFileSync(path.join(destination, 'desktop-build.json'), JSON.stringify({ supabaseUrl: SUPABASE_URL, anonKey }, null, 2) + '\n');
console.log('Bundle local préparé. Les clés privées ne doivent pas être intégrées au bundle.');
