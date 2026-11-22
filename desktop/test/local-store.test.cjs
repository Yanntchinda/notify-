'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openLocalStore, SCHEMA_VERSION } = require('../src/local-store.cjs');

function tempStore(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wacrm-local-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'nested', 'wacrm.sqlite');
}

test('contacts persist after closing and reopening the local file', (t) => {
  const file = tempStore(t);
  let store = openLocalStore(file);
  const created = store.createContact({ phone: '+237600000000', name: ' Alice ', email: 'alice@example.test' });
  assert.equal(created.name, 'Alice');
  assert.equal(store.listContacts().length, 1);
  store.close();
  store = openLocalStore(file);
  const saved = store.getContact(created.id);
  assert.equal(saved.phone, '+237600000000');
  assert.equal(saved.name, 'Alice');
  assert.equal(store.updateContact(created.id, { phone: '+237600000001', name: 'Alice B' }).name, 'Alice B');
  assert.equal(store.deleteContact(created.id), true);
  assert.equal(store.deleteContact(created.id), false);
  store.close();
  store = openLocalStore(file);
  assert.equal(store.listContacts().length, 0);
  store.close();
});

test('invalid data and duplicate numbers are rejected without altering saved contacts', (t) => {
  const store = openLocalStore(tempStore(t));
  try {
    const contact = store.createContact({ phone: '+123', name: 'Premier' });
    assert.throws(() => store.createContact({ phone: '  ' }));
    assert.throws(() => store.createContact({ phone: '+123', name: 'Doublon' }));
    assert.throws(() => store.updateContact(contact.id, { phone: ' ', name: 'Erreur' }));
    assert.equal(store.getContact(contact.id).name, 'Premier');
    assert.equal(store.listContacts().length, 1);
    assert.equal(store.updateContact('absent', { phone: '+456' }), null);
  } finally { store.close(); }
});

test('refuses a newer schema without altering the file', (t) => {
  const file = tempStore(t);
  const store = openLocalStore(file);
  store.createContact({ phone: '+456' });
  store.close();
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  db.close();
  assert.throws(() => openLocalStore(file), /version plus récente/);
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('SELECT COUNT(*) AS count FROM contacts').get().count, 1);
  check.close();
});

test('notes persist and are removed with the corresponding contact', (t) => {
  const file = tempStore(t);
  let store = openLocalStore(file);
  const contact = store.createContact({ phone: '+237111' });
  const other = store.createContact({ phone: '+237222' });
  const note = store.addNote(contact.id, 'Client à rappeler');
  assert.throws(() => store.addNote(contact.id, '   '));
  assert.throws(() => store.addNote('missing', 'Invalid contact'));
  assert.equal(store.deleteNote(other.id, note.id), false);
  store.close();
  store = openLocalStore(file);
  assert.equal(store.listNotes(contact.id)[0].content, 'Client à rappeler');
  store.deleteContact(contact.id);
  assert.equal(store.listNotes(contact.id).length, 0);
  store.close();
});

test('existing version 1 databases upgrade without losing contacts', (t) => {
  const file = tempStore(t);
  require('node:fs').mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE contacts (id TEXT PRIMARY KEY NOT NULL, phone TEXT NOT NULL UNIQUE, name TEXT, email TEXT, company TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO contacts VALUES ('old', '+123', 'Ancien', NULL, NULL, '2026', '2026'); PRAGMA user_version = 1;`);
  db.close();
  const store = openLocalStore(file);
  assert.equal(store.getContact('old').name, 'Ancien');
  store.addNote('old', 'Après migration');
  assert.equal(store.listNotes('old').length, 1);
  store.close();
});

test('backup is a consistent database and never replaces an existing file', (t) => {
  const { readFileSync, writeFileSync } = require('node:fs');
  const file = tempStore(t);
  const backup = path.join(path.dirname(file), 'copie.sqlite');
  const store = openLocalStore(file);
  try {
    const contact = store.createContact({ phone: '+237333', name: 'Client' });
    store.addNote(contact.id, 'Note sauvegardée');
    store.exportBackup(backup);
    const restored = openLocalStore(backup);
    try {
      assert.equal(restored.getContact(contact.id).name, 'Client');
      assert.equal(restored.listNotes(contact.id)[0].content, 'Note sauvegardée');
    } finally { restored.close(); }
    const existing = path.join(path.dirname(file), 'existant.sqlite');
    writeFileSync(existing, 'ne pas écraser');
    assert.throws(() => store.exportBackup(existing));
    assert.equal(readFileSync(existing, 'utf8'), 'ne pas écraser');
    assert.throws(() => store.exportBackup(file));
    assert.equal(store.getContact(contact.id).name, 'Client');
  } finally { store.close(); }
});
