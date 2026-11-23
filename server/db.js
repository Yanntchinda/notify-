'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const COLLECTIONS = [
  'users',
  'sessions',
  'departures',
  'ports',
  'containers',
  'sliders',
  'services',
  'quotes',
  'notifications',
];

let cache = null;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDirs();
  if (fs.existsSync(DB_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
      console.error('⚠️  Base illisible, une nouvelle base est créée.', err.message);
      cache = null;
    }
  }
  if (!cache || typeof cache !== 'object') cache = {};
  for (const name of COLLECTIONS) {
    if (!Array.isArray(cache[name])) cache[name] = [];
  }
  if (!cache.counters || typeof cache.counters !== 'object') {
    cache.counters = { roro: 0, container: 0, service: 0 };
  }
  if (!cache.meta) cache.meta = { createdAt: new Date().toISOString() };
  return cache;
}

function save() {
  ensureDirs();
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function nextNumber(type) {
  const db = load();
  const prefixes = { roro: 'RR', container: 'CT', service: 'SV' };
  const prefix = prefixes[type] || 'QT';
  db.counters[type] = (db.counters[type] || 0) + 1;
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(db.counters[type]).padStart(4, '0')}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  try {
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '');
}

function cleanValue(value, depth = 0) {
  if (depth > 5) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => cleanValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value).slice(0, 60)) {
      out[key] = cleanValue(val, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.trim().slice(0, 2000);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean' || value === null) return value;
  return null;
}

function cleanObject(obj) {
  return cleanValue(obj && typeof obj === 'object' ? obj : {}) || {};
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email || '',
    phone: user.phone || '',
    role: user.role,
    active: user.active,
    language: user.language || 'fr',
    vehicles: user.vehicles || [],
    containers: user.containers || [],
    createdAt: user.createdAt,
  };
}

module.exports = {
  load,
  save,
  uid,
  nextNumber,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  normalizePhone,
  cleanObject,
  publicUser,
  DB_PATH,
};
