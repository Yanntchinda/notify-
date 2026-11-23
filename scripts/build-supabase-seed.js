'use strict';

/* Génère supabase/seed.sql à partir des données de démonstration (server/seed.js).
   Usage : npm run build:seed-sql */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'server', 'seed')).resetAndSeed();
const data = require(path.join(ROOT, 'server', 'db')).load();

const q = (value) => (value == null ? 'null' : `'${String(value).replace(/'/g, "''")}'`);
const n = (value) => (Number.isFinite(Number(value)) ? Number(value) : 'null');
const b = (value) => (value ? 'true' : 'false');

const out = [];
out.push('-- Données de démonstration — à exécuter après schema.sql');
out.push('begin;');
out.push('truncate table public.ports cascade;');
out.push('truncate table public.departures cascade;');
out.push('truncate table public.containers cascade;');
out.push('truncate table public.sliders cascade;');
out.push('truncate table public.services cascade;');
out.push('');

for (const port of data.ports) {
  out.push(
    `insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ` +
      `(${q(port.id)}, ${q(port.name)}, ${q(port.city)}, ${q(port.country)}, ${q(port.countryCode)}, ${q(port.role)}, ${n(port.lat)}, ${n(port.lng)});`
  );
}
out.push('');

for (const dep of data.departures) {
  out.push(
    `insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ` +
      `(${q(dep.id)}, ${q(dep.ship)}, ${q(dep.fromPortId)}, ${q(dep.toPortId)}, ${q(dep.departureDate)}, ${q(dep.depositDeadline)}, ${q(dep.status)}, ${q(dep.note)}, now());`
  );
}
out.push('');

for (const c of data.containers) {
  out.push(
    `insert into public.containers (id, name, short_name, description, dimensions, volume, image, active) values ` +
      `(${q(c.id)}, ${q(c.name)}, ${q(c.shortName)}, ${q(c.description)}, ${q(c.dimensions)}, ${q(c.volume)}, ${q(c.image)}, ${b(c.active !== false)});`
  );
}
out.push('');

for (const s of data.sliders) {
  out.push(
    `insert into public.sliders (id, src, caption, sub, "order", active) values ` +
      `(${q(s.id)}, ${q(s.src)}, ${q(s.caption)}, ${q(s.sub || '')}, ${n(s.order)}, true);`
  );
}
out.push('');

for (const s of data.services) {
  out.push(
    `insert into public.services (id, name, icon, description, "order", active) values ` +
      `(${q(s.id)}, ${q(s.name)}, ${q(s.icon)}, ${q(s.description)}, ${n(s.order)}, ${b(s.active !== false)});`
  );
}
out.push('');
out.push('commit;');
out.push('');

fs.writeFileSync(path.join(ROOT, 'supabase', 'seed.sql'), `${out.join('\n')}`);
console.log(`✓ supabase/seed.sql — ${data.ports.length} ports, ${data.departures.length} départs, ${data.containers.length} conteneurs, ${data.sliders.length} slides, ${data.services.length} services`);
