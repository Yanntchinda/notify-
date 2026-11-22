'use strict';

// Experimental single-user storage layer. This is intentionally not a Supabase
// compatibility layer; the current wacrm UI is not wired to it yet.
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;

function requiredText(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new TypeError(`${label} doit contenir entre 1 et ${max} caractères.`);
  }
  return value.trim();
}
function optionalText(value, label, max) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) throw new TypeError(`${label} invalide.`);
  return value.trim() || null;
}

function openLocalStore(filename) {
  if (typeof filename !== 'string' || !filename || filename === ':memory:') {
    throw new TypeError('Un chemin de fichier persistant est requis.');
  }
  const absolutePath = path.resolve(filename);
  mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(absolutePath);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > SCHEMA_VERSION) throw new Error('La base a été créée par une version plus récente : mise à jour requise.');
    if (version < 1) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE contacts (
          id TEXT PRIMARY KEY NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          name TEXT,
          email TEXT,
          company TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        PRAGMA user_version = 1;
        COMMIT;`);
    }
    const get = db.prepare('SELECT id, phone, name, email, company, created_at, updated_at FROM contacts WHERE id = ?');
    const list = db.prepare('SELECT id, phone, name, email, company, created_at, updated_at FROM contacts ORDER BY created_at, id');
    const insert = db.prepare('INSERT INTO contacts (id, phone, name, email, company, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const update = db.prepare('UPDATE contacts SET phone = ?, name = ?, email = ?, company = ?, updated_at = ? WHERE id = ?');
    const remove = db.prepare('DELETE FROM contacts WHERE id = ?');
    function values(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Contact invalide.');
      return [requiredText(input.phone, 'Téléphone', 64), optionalText(input.name, 'Nom', 200),
        optionalText(input.email, 'Adresse e-mail', 320), optionalText(input.company, 'Entreprise', 200)];
    }
    return {
      createContact(input) {
        const fields = values(input);
        const id = randomUUID();
        const now = new Date().toISOString();
        insert.run(id, ...fields, now, now);
        return get.get(id);
      },
      listContacts() { return list.all(); },
      getContact(id) { return get.get(requiredText(id, 'Identifiant', 64)) || null; },
      updateContact(id, input) {
        id = requiredText(id, 'Identifiant', 64);
        const result = update.run(...values(input), new Date().toISOString(), id);
        return result.changes ? get.get(id) : null;
      },
      deleteContact(id) { return remove.run(requiredText(id, 'Identifiant', 64)).changes > 0; },
      close() { db.close(); },
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* No transaction active. */ }
    db.close();
    throw error;
  }
}
module.exports = { openLocalStore, SCHEMA_VERSION };
