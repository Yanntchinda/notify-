'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, childEnvironment, SUPABASE_URL, APP_PORT } = require('../src/config.cjs');
const valid = { supabaseUrl: SUPABASE_URL, anonKey: 'public-key', serviceRoleKey: 'secret-key', encryptionKey: 'ab'.repeat(32) };
test('accepts a local config', () => assert.deepEqual(parseConfig(JSON.stringify(valid)), valid));
test('rejects remote URLs and missing or malformed secrets', () => {
  for (const input of [null, {}, { ...valid, supabaseUrl: 'https://example.supabase.co' }, { ...valid, serviceRoleKey: '' }, { ...valid, encryptionKey: 'x' }]) {
    assert.throws(() => parseConfig(JSON.stringify(input)));
  }
  assert.throws(() => parseConfig('{'));
});
test('binds server to loopback and does not forward unrelated credentials', () => {
  const env = childEnvironment(valid, { PATH: '/bin', AWS_SECRET_ACCESS_KEY: 'do-not-copy', META_APP_SECRET: 'do-not-copy' });
  assert.equal(env.HOSTNAME, '127.0.0.1');
  assert.equal(env.PORT, String(APP_PORT));
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'secret-key');
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.META_APP_SECRET, undefined);
});
