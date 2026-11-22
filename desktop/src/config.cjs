'use strict';

const { readFileSync } = require('node:fs');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const APP_PORT = 38741;

// The UI connects to Supabase directly. Only accept the explicitly local
// endpoint: this experimental desktop build must not leak data to the cloud.
function parseConfig(contents) {
  let config;
  try { config = JSON.parse(contents); } catch { throw new Error('Configuration JSON invalide.'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration invalide.');
  if (config.supabaseUrl !== SUPABASE_URL) throw new Error(`L’URL Supabase doit être ${SUPABASE_URL}.`);
  for (const field of ['anonKey', 'serviceRoleKey', 'encryptionKey']) {
    if (typeof config[field] !== 'string' || !config[field].trim()) throw new Error(`Le champ ${field} est requis.`);
  }
  if (!/^[a-fA-F0-9]{64}$/.test(config.encryptionKey)) throw new Error('encryptionKey doit contenir 64 caractères hexadécimaux.');
  return config;
}

function loadConfig(path) { return parseConfig(readFileSync(path, 'utf8')); }

function childEnvironment(config, inherited = process.env) {
  // Do not forward the user's shell environment or unrelated cloud credentials.
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (inherited[key]) env[key] = inherited[key];
  }
  return {
    ...env,
    ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(APP_PORT),
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey, ENCRYPTION_KEY: config.encryptionKey,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${APP_PORT}`,
  };
}
module.exports = { SUPABASE_URL, APP_PORT, parseConfig, loadConfig, childEnvironment };
