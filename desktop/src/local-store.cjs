'use strict';

// Experimental single-user storage layer. This is intentionally not a Supabase
// compatibility layer; the current wacrm UI is not wired to it yet.
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { mkdirSync, openSync, closeSync, unlinkSync, statSync } = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 2;

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

// Read only the schema versions produced by this prototype. Never execute SQL
// from a backup, and bound its size/record count before putting it in memory.
function readBackup(filename) {
  if (typeof filename !== 'string' || !filename.trim()) throw new TypeError('Chemin de sauvegarde invalide.');
  const stat = statSync(filename);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('Fichier de sauvegarde invalide ou trop volumineux.');
  const source = new DatabaseSync(filename, { readOnly: true });
  try {
    source.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
    if (source.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok') throw new Error('Sauvegarde endommagée.');
    const version = source.prepare('PRAGMA user_version').get().user_version;
    if (version !== 1 && version !== 2) throw new Error('Version de sauvegarde incompatible.');
    const tables = source.prepare("SELECT name, type FROM sqlite_schema WHERE name IN ('contacts', 'contact_notes')").all();
    if (!tables.some((t) => t.name === 'contacts' && t.type === 'table') ||
        (version === 2 && !tables.some((t) => t.name === 'contact_notes' && t.type === 'table'))) {
      throw new Error('Sauvegarde incompatible.');
    }
    const contacts = source.prepare('SELECT id, phone, name, email, company, created_at, updated_at FROM contacts LIMIT 100001').all();
    const notes = version === 2 ? source.prepare('SELECT id, contact_id, content, created_at FROM contact_notes LIMIT 200001').all() : [];
    if (contacts.length > 100000 || notes.length > 200000) throw new Error('Sauvegarde trop volumineuse.');
    for (const c of contacts) {
      requiredText(c.id, 'Identifiant', 64); requiredText(c.phone, 'Téléphone', 64);
      optionalText(c.name, 'Nom', 200); optionalText(c.email, 'Adresse e-mail', 320); optionalText(c.company, 'Entreprise', 200);
      requiredText(c.created_at, 'Date', 64); requiredText(c.updated_at, 'Date', 64);
    }
    for (const n of notes) {
      requiredText(n.id, 'Identifiant', 64); requiredText(n.contact_id, 'Identifiant du contact', 64);
      requiredText(n.content, 'Note', 10000); requiredText(n.created_at, 'Date', 64);
    }
    return { contacts, notes };
  } finally { source.close(); }
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
    if (version < 2) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE contact_notes (
          id TEXT PRIMARY KEY NOT NULL,
          contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_contact_notes_contact ON contact_notes(contact_id, created_at);
        PRAGMA user_version = 2;
        COMMIT;`);
    }
    const get = db.prepare('SELECT id, phone, name, email, company, created_at, updated_at FROM contacts WHERE id = ?');
    const list = db.prepare('SELECT id, phone, name, email, company, created_at, updated_at FROM contacts ORDER BY created_at, id');
    const insert = db.prepare('INSERT INTO contacts (id, phone, name, email, company, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const update = db.prepare('UPDATE contacts SET phone = ?, name = ?, email = ?, company = ?, updated_at = ? WHERE id = ?');
    const remove = db.prepare('DELETE FROM contacts WHERE id = ?');
    const getNote = db.prepare('SELECT id, contact_id, content, created_at FROM contact_notes WHERE id = ?');
    const listNotes = db.prepare('SELECT id, contact_id, content, created_at FROM contact_notes WHERE contact_id = ? ORDER BY created_at DESC, id DESC');
    const insertNote = db.prepare('INSERT INTO contact_notes (id, contact_id, content, created_at) VALUES (?, ?, ?, ?)');
    const removeNote = db.prepare('DELETE FROM contact_notes WHERE id = ? AND contact_id = ?');
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
      listNotes(contactId) { return listNotes.all(requiredText(contactId, 'Identifiant du contact', 64)); },
      addNote(contactId, content) {
        const id = randomUUID();
        insertNote.run(id, requiredText(contactId, 'Identifiant du contact', 64),
          requiredText(content, 'Note', 10000), new Date().toISOString());
        return getNote.get(id);
      },
      deleteNote(contactId, id) {
        return removeNote.run(requiredText(id, 'Identifiant', 64), requiredText(contactId, 'Identifiant du contact', 64)).changes > 0;
      },
      exportBackup(destination) {
        if (typeof destination !== 'string' || !destination.trim()) throw new TypeError('Chemin de sauvegarde invalide.');
        // Reserve a new destination exclusively: never replace an existing file.
        const dest = path.resolve(destination);
        const fd = openSync(dest, 'wx', 0o600);
        closeSync(fd);
        try { db.prepare('VACUUM INTO ?').run(dest); }
        catch (error) { try { unlinkSync(dest); } catch {} throw error; }
      },
      restoreBackup(sourcePath) {
        // Validate before touching the current database, then always keep a
        // private safety copy. An import failure is rolled back atomically.
        const backup = readBackup(sourcePath);
        const safetyDir = path.join(path.dirname(absolutePath), 'backups');
        mkdirSync(safetyDir, { recursive: true, mode: 0o700 });
        const safetyPath = path.join(safetyDir, `avant-restauration-${randomUUID()}.sqlite`);
        this.exportBackup(safetyPath);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.exec('DELETE FROM contacts');
          for (const c of backup.contacts) insert.run(c.id, c.phone, c.name, c.email, c.company, c.created_at, c.updated_at);
          for (const n of backup.notes) insertNote.run(n.id, n.contact_id, n.content, n.created_at);
          db.exec('COMMIT');
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          throw error;
        }
        return { contactCount: backup.contacts.length, safetyPath };
      },
      close() { db.close(); },
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* No transaction active. */ }
    db.close();
    throw error;
  }
}
module.exports = { openLocalStore, SCHEMA_VERSION };
