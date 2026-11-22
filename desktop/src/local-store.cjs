'use strict';

// Experimental single-user storage layer. This is intentionally not a Supabase
// compatibility layer; the current wacrm UI is not wired to it yet.
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { mkdirSync, openSync, closeSync, unlinkSync, statSync } = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 4;

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Date invalide.');
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new TypeError('Date invalide.');
  return value;
}
function amount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new TypeError('Montant invalide.');
  const s = String(value).trim();
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s))) throw new TypeError('Le montant doit être un nombre entier positif en FCFA.');
  return Number(s);
}
function quantity(value) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new TypeError('Quantité invalide.');
  const s = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(s)) throw new TypeError('Quantité invalide : utilisez au plus trois décimales.');
  const [whole, fraction = ''] = s.split('.');
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new TypeError('La quantité doit être positive.');
  return result;
}

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

// Verify the schema before import. Rows are streamed during a single transaction,
// avoiding a fixed count/size cap and keeping memory use bounded by one row.
function openBackup(filename) {
  if (typeof filename !== 'string' || !filename.trim()) throw new TypeError('Chemin de sauvegarde invalide.');
  if (!statSync(filename).isFile()) throw new Error('Fichier de sauvegarde invalide.');
  const source = new DatabaseSync(filename, { readOnly: true });
  try {
    source.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
    if (source.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok') throw new Error('Sauvegarde endommagée.');
    const version = source.prepare('PRAGMA user_version').get().user_version;
    if (![1, 2, 3, 4].includes(version)) throw new Error('Version de sauvegarde incompatible.');
    const tables = source.prepare("SELECT name, type FROM sqlite_schema WHERE name IN ('contacts', 'contact_notes', 'conversations', 'delivery_reports', 'delivery_lines')").all();
    if (!tables.some((t) => t.name === 'contacts' && t.type === 'table') ||
        (version >= 2 && !tables.some((t) => t.name === 'contact_notes' && t.type === 'table')) ||
        (version >= 3 && !tables.some((t) => t.name === 'conversations' && t.type === 'table')) ||
        (version >= 4 && !['delivery_reports', 'delivery_lines'].every((name) => tables.some((t) => t.name === name && t.type === 'table')))) {
      throw new Error('Sauvegarde incompatible.');
    }
    return { source, version };
  } catch (error) { source.close(); throw error; }
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
    if (version < 3) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY NOT NULL,
          contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
          draft TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
        PRAGMA user_version = 3;
        COMMIT;`);
    }
    if (version < 4) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE delivery_reports (
          id TEXT PRIMARY KEY NOT NULL,
          contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
          report_date TEXT NOT NULL,
          collected INTEGER CHECK(collected IS NULL OR collected >= 0),
          paid INTEGER CHECK(paid IS NULL OR paid >= 0),
          created_at TEXT NOT NULL
        );
        CREATE TABLE delivery_lines (
          id TEXT PRIMARY KEY NOT NULL,
          report_id TEXT NOT NULL REFERENCES delivery_reports(id) ON DELETE CASCADE,
          product TEXT NOT NULL,
          unit TEXT NOT NULL,
          quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0)
        );
        CREATE INDEX idx_reports_date_driver ON delivery_reports(report_date, contact_id);
        CREATE INDEX idx_lines_report ON delivery_lines(report_id);
        PRAGMA user_version = 4;
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
    const listConversations = db.prepare(`SELECT v.id, v.contact_id, v.status, v.draft, v.created_at, v.updated_at,
      c.name AS contact_name, c.phone AS contact_phone FROM conversations v JOIN contacts c ON c.id = v.contact_id ORDER BY v.updated_at DESC, v.id`);
    const getConversation = db.prepare('SELECT id, contact_id, status, draft, created_at, updated_at FROM conversations WHERE id = ?');
    const conversationForContact = db.prepare('SELECT id, contact_id, status, draft, created_at, updated_at FROM conversations WHERE contact_id = ?');
    const insertConversation = db.prepare('INSERT INTO conversations (id, contact_id, status, draft, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const updateDraft = db.prepare('UPDATE conversations SET draft = ?, updated_at = ? WHERE id = ?');
    const updateStatus = db.prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?');
    const insertReport = db.prepare('INSERT INTO delivery_reports (id, contact_id, report_date, collected, paid, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const insertDeliveryLine = db.prepare('INSERT INTO delivery_lines (id, report_id, product, unit, quantity_milli) VALUES (?, ?, ?, ?, ?)');
    const deleteReport = db.prepare('DELETE FROM delivery_reports WHERE id = ?');
    const reportLines = db.prepare('SELECT id, report_id, product, unit, quantity_milli FROM delivery_lines WHERE report_id = ? ORDER BY rowid');
    const filter = "r.report_date >= ? AND r.report_date <= ? AND (? = '' OR r.contact_id = ?)";
    const reportStats = db.prepare(`SELECT COUNT(*) AS report_count, COUNT(r.collected) AS collected_count,
      COALESCE(SUM(r.collected), 0) AS collected_total, COUNT(r.paid) AS paid_count,
      COALESCE(SUM(r.paid), 0) AS paid_total FROM delivery_reports r WHERE ${filter}`);
    const productStats = db.prepare(`SELECT MIN(l.product) AS product, MIN(l.unit) AS unit, SUM(l.quantity_milli) AS quantity_milli
      FROM delivery_lines l JOIN delivery_reports r ON r.id = l.report_id WHERE ${filter}
      GROUP BY l.product COLLATE NOCASE, l.unit COLLATE NOCASE ORDER BY product, unit`);
    const reportList = db.prepare(`SELECT r.id, r.contact_id, r.report_date, r.collected, r.paid, r.created_at,
      c.name AS driver_name, c.phone AS driver_phone FROM delivery_reports r JOIN contacts c ON c.id = r.contact_id
      WHERE ${filter} ORDER BY r.report_date DESC, r.created_at DESC`);
    const driverStats = db.prepare(`SELECT c.id, c.name, c.phone, COUNT(*) AS report_count,
      COUNT(r.collected) AS collected_count, COALESCE(SUM(r.collected), 0) AS collected_total,
      COUNT(r.paid) AS paid_count, COALESCE(SUM(r.paid), 0) AS paid_total
      FROM delivery_reports r JOIN contacts c ON c.id = r.contact_id WHERE ${filter}
      GROUP BY c.id ORDER BY c.name, c.phone`);
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
      listConversations() { return listConversations.all(); },
      openConversation(contactId) {
        contactId = requiredText(contactId, 'Identifiant du contact', 64);
        let conversation = conversationForContact.get(contactId);
        if (!conversation) {
          const now = new Date().toISOString();
          insertConversation.run(randomUUID(), contactId, 'open', '', now, now);
          conversation = conversationForContact.get(contactId);
        }
        return conversation;
      },
      saveDraft(id, text) {
        id = requiredText(id, 'Identifiant', 64);
        if (typeof text !== 'string' || text.length > 10000) throw new TypeError('Brouillon invalide.');
        if (!updateDraft.run(text, new Date().toISOString(), id).changes) return null;
        return getConversation.get(id);
      },
      setConversationStatus(id, status) {
        id = requiredText(id, 'Identifiant', 64);
        if (!['open', 'closed'].includes(status)) throw new TypeError('Statut invalide.');
        if (!updateStatus.run(status, new Date().toISOString(), id).changes) return null;
        return getConversation.get(id);
      },
      createDeliveryReport(input) {
        if (!input || typeof input !== 'object' || !Array.isArray(input.lines) || !input.lines.length) throw new TypeError('Ajoutez au moins un produit.');
        const driver = requiredText(input.contactId, 'Livreur', 64);
        const date = isoDate(input.date);
        const collected = amount(input.collected);
        const paid = amount(input.paid);
        const lines = input.lines.map((line) => {
          if (!line || typeof line !== 'object') throw new TypeError('Produit invalide.');
          return [requiredText(line.product, 'Produit', 200), requiredText(line.unit, 'Unité', 50), quantity(line.quantity)];
        });
        const id = randomUUID();
        db.exec('BEGIN IMMEDIATE');
        try {
          insertReport.run(id, driver, date, collected, paid, new Date().toISOString());
          for (const line of lines) insertDeliveryLine.run(randomUUID(), id, ...line);
          db.exec('COMMIT');
        } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
        return { id };
      },
      deleteDeliveryReport(id) { return deleteReport.run(requiredText(id, 'Identifiant', 64)).changes > 0; },
      deliveryReportLines(id) { return reportLines.all(requiredText(id, 'Identifiant', 64)); },
      deliveryStatistics(filters = {}) {
        if (!filters || typeof filters !== 'object') throw new TypeError('Filtres invalides.');
        const from = filters.from ? isoDate(filters.from) : '0000-01-01';
        const to = filters.to ? isoDate(filters.to) : '9999-12-31';
        if (from > to) throw new TypeError('La date de début doit précéder la date de fin.');
        const driver = filters.contactId ? requiredText(filters.contactId, 'Livreur', 64) : '';
        const args = [from, to, driver, driver];
        return { summary: reportStats.get(...args), products: productStats.all(...args), reports: reportList.all(...args), drivers: driverStats.all(...args) };
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
        // Validate each row and stream it through a single transaction. A safety
        // backup is mandatory and any failure rolls back all changes.
        const backup = openBackup(sourcePath);
        try {
          const safetyDir = path.join(path.dirname(absolutePath), 'backups');
          mkdirSync(safetyDir, { recursive: true, mode: 0o700 });
          const safetyPath = path.join(safetyDir, `avant-restauration-${randomUUID()}.sqlite`);
          this.exportBackup(safetyPath);
          let contactCount = 0;
          db.exec('BEGIN IMMEDIATE');
          try {
            db.exec('DELETE FROM delivery_reports; DELETE FROM contacts');
            for (const c of backup.source.prepare('SELECT id, phone, name, email, company, created_at, updated_at FROM contacts').iterate()) {
              requiredText(c.id, 'Identifiant', 64); requiredText(c.phone, 'Téléphone', 64);
              optionalText(c.name, 'Nom', 200); optionalText(c.email, 'Adresse e-mail', 320); optionalText(c.company, 'Entreprise', 200);
              requiredText(c.created_at, 'Date', 64); requiredText(c.updated_at, 'Date', 64);
              insert.run(c.id, c.phone, c.name, c.email, c.company, c.created_at, c.updated_at); contactCount++;
            }
            if (backup.version >= 2) for (const n of backup.source.prepare('SELECT id, contact_id, content, created_at FROM contact_notes').iterate()) {
              requiredText(n.id, 'Identifiant', 64); requiredText(n.contact_id, 'Identifiant du contact', 64);
              requiredText(n.content, 'Note', 10000); requiredText(n.created_at, 'Date', 64);
              insertNote.run(n.id, n.contact_id, n.content, n.created_at);
            }
            if (backup.version >= 3) for (const c of backup.source.prepare('SELECT id, contact_id, status, draft, created_at, updated_at FROM conversations').iterate()) {
              requiredText(c.id, 'Identifiant', 64); requiredText(c.contact_id, 'Identifiant du contact', 64);
              if (!['open', 'closed'].includes(c.status) || typeof c.draft !== 'string' || c.draft.length > 10000) throw new Error('Conversation invalide.');
              requiredText(c.created_at, 'Date', 64); requiredText(c.updated_at, 'Date', 64);
              insertConversation.run(c.id, c.contact_id, c.status, c.draft, c.created_at, c.updated_at);
            }
            if (backup.version >= 4) {
              for (const r of backup.source.prepare('SELECT id, contact_id, report_date, collected, paid, created_at FROM delivery_reports').iterate()) {
                requiredText(r.id, 'Identifiant', 64); requiredText(r.contact_id, 'Livreur', 64); isoDate(r.report_date);
                amount(r.collected); amount(r.paid); requiredText(r.created_at, 'Date', 64);
                insertReport.run(r.id, r.contact_id, r.report_date, r.collected, r.paid, r.created_at);
              }
              for (const l of backup.source.prepare('SELECT id, report_id, product, unit, quantity_milli FROM delivery_lines').iterate()) {
                requiredText(l.id, 'Identifiant', 64); requiredText(l.report_id, 'Compte rendu', 64);
                requiredText(l.product, 'Produit', 200); requiredText(l.unit, 'Unité', 50);
                if (!Number.isSafeInteger(l.quantity_milli) || l.quantity_milli <= 0) throw new Error('Quantité invalide.');
                insertDeliveryLine.run(l.id, l.report_id, l.product, l.unit, l.quantity_milli);
              }
            }
            db.exec('COMMIT');
          } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
          return { contactCount, safetyPath };
        } finally { backup.source.close(); }
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
