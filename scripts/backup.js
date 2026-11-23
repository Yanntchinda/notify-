'use strict';

/* Sauvegarde horodatée de la base JSON. À planifier avec cron ou un planificateur. */
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'data', 'db.json');
const backupDir = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(source)) {
  console.error('Aucune base à sauvegarder :', source);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `db-${stamp}.json`);
fs.copyFileSync(source, target);
console.log(`✓ Sauvegarde créée : ${target}`);
