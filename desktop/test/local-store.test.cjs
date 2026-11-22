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
