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

test('restore validates and replaces contacts and notes, keeping an automatic safety copy', (t) => {
  const file = tempStore(t);
  const backup = path.join(path.dirname(file), 'backup.sqlite');
  const store = openLocalStore(file);
  try {
    const before = store.createContact({ phone: '+11', name: 'À restaurer' });
    store.addNote(before.id, 'Note sauvegardée');
    store.exportBackup(backup);
    store.updateContact(before.id, { phone: '+11', name: 'Modifié' });
    store.addNote(before.id, 'Ajout après sauvegarde');
    store.createContact({ phone: '+22', name: 'Autre contact' });
    const result = store.restoreBackup(backup);
    assert.equal(result.contactCount, 1);
    assert.equal(store.getContact(before.id).name, 'À restaurer');
    assert.equal(store.listNotes(before.id).length, 1);
    const safety = openLocalStore(result.safetyPath);
    try {
      assert.equal(safety.getContact(before.id).name, 'Modifié');
      assert.equal(safety.listNotes(before.id).length, 2);
      assert.equal(safety.listContacts().length, 2);
    } finally { safety.close(); }
  } finally { store.close(); }
  const reopened = openLocalStore(file);
  assert.equal(reopened.listContacts()[0].name, 'À restaurer');
  reopened.close();
});

test('restore rejects corrupted and incompatible backups without replacing data', (t) => {
  const { writeFileSync } = require('node:fs');
  const file = tempStore(t);
  const store = openLocalStore(file);
  try {
    const c = store.createContact({ phone: '+1', name: 'À conserver' });
    const bad = path.join(path.dirname(file), 'bad.sqlite');
    writeFileSync(bad, 'ceci ne représente pas une sauvegarde SQLite');
    assert.throws(() => store.restoreBackup(bad));
    assert.equal(store.getContact(c.id).name, 'À conserver');
    const newVersion = path.join(path.dirname(file), 'new.sqlite');
    store.exportBackup(newVersion);
    const db = new DatabaseSync(newVersion);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`); db.close();
    assert.throws(() => store.restoreBackup(newVersion));
    assert.equal(store.listContacts().length, 1);
  } finally { store.close(); }
});

test('restore rolls back fully if backup violates relationships', (t) => {
  const file = tempStore(t);
  const store = openLocalStore(file);
  try {
    const c = store.createContact({ phone: '+1', name: 'Avant restauration' });
    const bad = path.join(path.dirname(file), 'bad-relations.sqlite');
    store.exportBackup(bad);
    const altered = new DatabaseSync(bad);
    altered.exec("PRAGMA foreign_keys=OFF; INSERT INTO contact_notes VALUES ('orphan', 'missing', 'Note', '2026');");
    altered.close();
    assert.throws(() => store.restoreBackup(bad));
    assert.equal(store.getContact(c.id).name, 'Avant restauration');
    assert.equal(store.listContacts().length, 1);
    assert.equal(store.listNotes(c.id).length, 0);
  } finally { store.close(); }
});

test('local conversations keep drafts across restarts without sending messages', (t) => {
  const file = tempStore(t);
  let store = openLocalStore(file);
  const contact = store.createContact({ phone: '+237444', name: 'Client local' });
  const thread = store.openConversation(contact.id);
  assert.equal(store.openConversation(contact.id).id, thread.id);
  assert.equal(store.listConversations().length, 1);
  assert.equal(store.listConversations()[0].contact_name, 'Client local');
  assert.equal(store.saveDraft(thread.id, 'Bonjour, je vous réponds bientôt.').draft, 'Bonjour, je vous réponds bientôt.');
  assert.throws(() => store.saveDraft(thread.id, 'x'.repeat(10001)));
  assert.throws(() => store.setConversationStatus(thread.id, 'sent'));
  assert.equal(store.setConversationStatus(thread.id, 'closed').status, 'closed');
  assert.throws(() => store.openConversation('missing'));
  store.close();
  store = openLocalStore(file);
  assert.equal(store.listConversations()[0].draft, 'Bonjour, je vous réponds bientôt.');
  assert.equal(store.listConversations()[0].status, 'closed');
  store.deleteContact(contact.id);
  assert.equal(store.listConversations().length, 0);
  store.close();
});

test('backup and restore preserve local conversation drafts and support version 2 backups', (t) => {
  const file = tempStore(t);
  const store = openLocalStore(file);
  try {
    const contact = store.createContact({ phone: '+237555', name: 'Client' });
    const thread = store.openConversation(contact.id);
    store.saveDraft(thread.id, 'Brouillon dans la sauvegarde');
    const backup = path.join(path.dirname(file), 'v3.sqlite');
    store.exportBackup(backup);
    store.saveDraft(thread.id, 'Brouillon modifié');
    store.restoreBackup(backup);
    assert.equal(store.listConversations()[0].draft, 'Brouillon dans la sauvegarde');
    const legacy = path.join(path.dirname(file), 'v2.sqlite');
    store.exportBackup(legacy);
    const old = new DatabaseSync(legacy);
    old.exec('DROP TABLE conversations; PRAGMA user_version = 2'); old.close();
    store.restoreBackup(legacy);
    assert.equal(store.getContact(contact.id).name, 'Client');
    assert.equal(store.listConversations().length, 0);
  } finally { store.close(); }
});

test('dashboard aggregates declared amounts once per report and products separately by unit', (t) => {
  const file = tempStore(t);
  let store = openLocalStore(file);
  const a = store.createContact({ phone: '+1', name: 'Alain' });
  const b = store.createContact({ phone: '+2', name: 'Béatrice' });
  store.createDeliveryReport({ contactId: a.id, date: '2026-11-22', collected: '80000', paid: '70000', lines: [
    { product: 'Riz', quantity: '2,5', unit: 'sac' }, { product: 'Huile', quantity: '3', unit: 'carton' },
  ] });
  store.createDeliveryReport({ contactId: b.id, date: '2026-11-23', collected: '', paid: '0', lines: [
    { product: 'riz', quantity: '1.25', unit: 'sac' }, { product: 'Riz', quantity: '4', unit: 'kg' },
  ] });
  const all = store.deliveryStatistics();
  assert.equal(all.summary.report_count, 2);
  assert.equal(all.summary.collected_total, 80000);
  assert.equal(all.summary.collected_count, 1);
  assert.equal(all.summary.paid_total, 70000);
  assert.equal(all.summary.paid_count, 2);
  assert.equal(all.products.find((p) => p.unit === 'sac').quantity_milli, 3750);
  assert.equal(all.products.find((p) => p.unit === 'kg').quantity_milli, 4000);
  assert.equal(all.drivers.length, 2);
  assert.equal(store.deliveryStatistics({ from: '2026-11-23' }).summary.report_count, 1);
  assert.equal(store.deliveryStatistics({ contactId: a.id }).summary.report_count, 1);
  assert.throws(() => store.deleteContact(a.id));
  store.close();
  store = openLocalStore(file);
  assert.equal(store.deliveryStatistics().summary.report_count, 2);
  store.close();
});

test('invalid report data fails without saving partial reports', (t) => {
  const store = openLocalStore(tempStore(t));
  try {
    const c = store.createContact({ phone: '+55' });
    const good = { contactId: c.id, date: '2026-11-22', lines: [{ product: 'Riz', unit: 'sac', quantity: '1' }] };
    assert.throws(() => store.createDeliveryReport({ ...good, date: '2026-02-30' }));
    assert.throws(() => store.createDeliveryReport({ ...good, collected: '-5' }));
    assert.throws(() => store.createDeliveryReport({ ...good, paid: '1.5' }));
    assert.throws(() => store.createDeliveryReport({ ...good, lines: [] }));
    assert.throws(() => store.createDeliveryReport({ ...good, lines: [...good.lines, { product: 'Huile', quantity: '-2', unit: 'litre' }] }));
    assert.throws(() => store.createDeliveryReport({ ...good, contactId: 'missing' }));
    assert.throws(() => store.deliveryStatistics({ from: '2026-12-01', to: '2026-11-01' }));
    assert.equal(store.deliveryStatistics().summary.report_count, 0);
  } finally { store.close(); }
});

test('backup restores reports and product lines atomically and old backups remain usable', (t) => {
  const file = tempStore(t);
  const store = openLocalStore(file);
  try {
    const c = store.createContact({ phone: '+77', name: 'Livreur' });
    const report = store.createDeliveryReport({ contactId: c.id, date: '2026-11-22', collected: '10', paid: '5', lines: [{ product: 'Riz', unit: 'sac', quantity: '2' }] });
    const backup = path.join(path.dirname(file), 'livraisons.sqlite');
    store.exportBackup(backup);
    store.deleteDeliveryReport(report.id);
    assert.equal(store.deliveryStatistics().summary.report_count, 0);
    store.restoreBackup(backup);
    assert.equal(store.deliveryStatistics().products[0].product, 'Riz');
    assert.equal(store.deliveryStatistics().summary.paid_total, 5);
    const legacy = path.join(path.dirname(file), 'v3.sqlite');
    store.exportBackup(legacy);
    const old = new DatabaseSync(legacy);
    old.exec('DROP TABLE delivery_lines; DROP TABLE delivery_reports; PRAGMA user_version = 3'); old.close();
    store.restoreBackup(legacy);
    assert.equal(store.listContacts().length, 1);
    assert.equal(store.deliveryStatistics().summary.report_count, 0);
  } finally { store.close(); }
});

test('restoration streams more than 100000 contacts without a fixed row cap', (t) => {
  const file = tempStore(t);
  const source = path.join(path.dirname(file), 'large.sqlite');
  const makeSource = openLocalStore(source); makeSource.close();
  const raw = new DatabaseSync(source);
  raw.exec('BEGIN');
  const insert = raw.prepare('INSERT INTO contacts(id, phone, name, email, company, created_at, updated_at) VALUES(?, ?, ?, NULL, NULL, ?, ?)');
  for (let i = 0; i < 100001; i++) insert.run(`id-${i}`, `+${i}`, 'Livreur', '2026', '2026');
  raw.exec('COMMIT'); raw.close();
  const target = openLocalStore(file);
  try { assert.equal(target.restoreBackup(source).contactCount, 100001); }
  finally { target.close(); }
  const check = new DatabaseSync(file);
  try { assert.equal(check.prepare('SELECT COUNT(*) AS n FROM contacts').get().n, 100001); }
  finally { check.close(); }
});
