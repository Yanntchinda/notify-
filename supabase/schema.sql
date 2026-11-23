-- ============================================================================
--  Application de transit Ro-Ro — schéma Supabase
--  À exécuter dans Supabase : SQL Editor → coller ce fichier → Run
--  Aucun serveur : toute la logique métier vit dans PostgreSQL et RLS.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Utilitaire : est-ce un administrateur ? (security definer pour éviter la
-- récursion des politiques qui lisent la table profiles)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  role text not null default 'client' check (role in ('client', 'admin')),
  language text not null default 'fr',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  brand text not null default '',
  model text not null default '',
  vin text not null default '',
  type text not null default '',
  year text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.container_refs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default '',
  condition text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.ports (
  id text primary key,
  name text not null default '',
  city text not null default '',
  country text not null default '',
  country_code text not null default '',
  role text not null default 'both' check (role in ('loading', 'discharge', 'both')),
  lat double precision not null default 0,
  lng double precision not null default 0
);

create table if not exists public.departures (
  id text primary key,
  ship text not null default '',
  from_port_id text not null default '' references public.ports(id) on delete cascade,
  to_port_id text not null default '' references public.ports(id) on delete cascade,
  departure_date date not null default current_date,
  deposit_deadline date not null default current_date,
  status text not null default 'open' check (status in ('open', 'full', 'departed')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.containers (
  id text primary key,
  name text not null default '',
  short_name text not null default '',
  description text not null default '',
  dimensions text not null default '',
  volume text not null default '',
  image text not null default '',
  active boolean not null default true
);

create table if not exists public.sliders (
  id text primary key,
  src text not null default '',
  caption text not null default '',
  sub text not null default '',
  "order" integer not null default 0,
  active boolean not null default true
);

create table if not exists public.services (
  id text primary key,
  name text not null default '',
  icon text not null default '',
  description text not null default '',
  "order" integer not null default 0,
  active boolean not null default true
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  type text not null check (type in ('roro', 'container', 'service')),
  status text not null default 'received'
    check (status in ('received', 'processing', 'quoted', 'accepted', 'refused')),
  contact jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  distance jsonb,
  user_id uuid references public.profiles(id) on delete set null,
  admin_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotes_user_idx on public.quotes (user_id);
create index if not exists quotes_created_idx on public.quotes (created_at desc);
create index if not exists quotes_status_idx on public.quotes (status);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  kind text not null default '',
  title text not null default '',
  message text not null default '',
  quote_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id);

-- ---------------------------------------------------------------------------
-- Numérotation des demandes : RR-2026-0001, CT-…, SV-…
-- ---------------------------------------------------------------------------
create table if not exists public.quote_counters (
  type text primary key,
  value integer not null default 0
);

create or replace function public.next_quote_number(p_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_value integer;
begin
  v_prefix := case p_type
    when 'roro' then 'RR'
    when 'container' then 'CT'
    when 'service' then 'SV'
    else 'QT'
  end;

  insert into public.quote_counters (type, value)
  values (p_type, 1)
  on conflict (type) do update
    set value = public.quote_counters.value + 1
  returning value into v_value;

  return v_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_value::text, 4, '0');
end;
$$;


-- ---------------------------------------------------------------------------
-- Soumission d'une demande (visiteur ou client connecté)
-- ---------------------------------------------------------------------------
-- Fonction SECURITY DEFINER : elle valide les données côté base et retourne
-- uniquement la ligne créée. Les visiteurs ne peuvent ainsi pas lire les
-- demandes des autres (aucune politique SELECT anonyme sur public.quotes).
create or replace function public.submit_quote(
  p_type text,
  p_contact jsonb,
  p_payload jsonb,
  p_distance jsonb default null
)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(p_contact->>'name', '');
  v_email text := lower(coalesce(p_contact->>'email', ''));
  v_phone text := coalesce(p_contact->>'phone', '');
  v_row public.quotes;
begin
  if p_type is null or p_type not in ('roro', 'container', 'service') then
    raise exception 'Type de demande invalide';
  end if;
  if btrim(v_name) = '' or length(v_name) > 80 then
    raise exception 'Le nom est obligatoire (80 caractères maximum)';
  end if;
  if btrim(v_email) = '' and btrim(v_phone) = '' then
    raise exception 'Indiquez un e-mail ou un numéro de téléphone';
  end if;
  if v_email <> '' and (position('@' in v_email) = 0 or position('.' in v_email) = 0) then
    raise exception 'Adresse e-mail invalide';
  end if;
  if p_type = 'container' and coalesce(p_payload->>'containerId', '') = '' then
    raise exception 'Sélectionnez un type de conteneur';
  end if;
  if p_type = 'service' and coalesce(p_payload->>'serviceId', '') = '' then
    raise exception 'Sélectionnez un service';
  end if;
  if p_type = 'roro' and coalesce(p_payload->'vehicle'->>'brand', '')
      || coalesce(p_payload->'vehicle'->>'model', '')
      || coalesce(p_payload->'vehicle'->>'vin', '') = '' then
    raise exception 'Renseignez au moins la marque, le modèle ou le châssis du véhicule';
  end if;

  insert into public.quotes (type, contact, payload, distance)
  values (p_type, p_contact, p_payload, p_distance)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.submit_quote(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.submit_quote(text, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
--
-- Profil créé automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'client'
  )
  on conflict (id) do nothing;

  -- Rattache à ce nouveau compte les demandes envoyées en visiteur
  -- avec la même adresse e-mail ou le même numéro de téléphone.
  update public.quotes
     set user_id = new.id
   where user_id is null
     and (
       (coalesce(new.email, '') <> '' and lower(contact->>'email') = lower(new.email))
       or (
         coalesce(new.raw_user_meta_data->>'phone', '') <> ''
         and contact->>'phone' = new.raw_user_meta_data->>'phone'
       )
     );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Une demande est toujours créée « reçue », avec son numéro et son auteur
create or replace function public.set_quote_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.number := coalesce(new.number, public.next_quote_number(new.type));
  new.status := 'received';
  new.admin_response := null;
  new.user_id := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists quotes_set_defaults on public.quotes;
create trigger quotes_set_defaults
  before insert on public.quotes
  for each row execute function public.set_quote_defaults();

create or replace function public.set_quote_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch
  before update on public.quotes
  for each row execute function public.set_quote_updated_at();

-- Notification administrateur à chaque nouvelle demande
create or replace function public.notify_new_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  v_label := case new.type
    when 'roro' then 'Ro-Ro'
    when 'container' then 'Conteneur'
    else 'Autre service'
  end;

  insert into public.notifications (user_id, kind, title, message, quote_id)
  values (
    null,
    'new_quote',
    'Nouvelle demande ' || new.number,
    coalesce(new.contact->>'name', 'Client') || ' — ' || v_label,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists quotes_notify on public.quotes;
create trigger quotes_notify
  after insert on public.quotes
  for each row execute function public.notify_new_quote();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.container_refs enable row level security;
alter table public.ports enable row level security;
alter table public.departures enable row level security;
alter table public.containers enable row level security;
alter table public.sliders enable row level security;
alter table public.services enable row level security;
alter table public.quotes enable row level security;
alter table public.notifications enable row level security;
alter table public.quote_counters enable row level security;

-- Contenu public : lecture pour tous, écriture réservée à l'admin
create policy "ports public read" on public.ports for select using (true);
create policy "ports admin write" on public.ports for all using (public.is_admin()) with check (public.is_admin());

create policy "departures public read" on public.departures for select using (true);
create policy "departures admin write" on public.departures for all using (public.is_admin()) with check (public.is_admin());

create policy "containers public read" on public.containers for select using (true);
create policy "containers admin write" on public.containers for all using (public.is_admin()) with check (public.is_admin());

create policy "sliders public read" on public.sliders for select using (true);
create policy "sliders admin write" on public.sliders for all using (public.is_admin()) with check (public.is_admin());

create policy "services public read" on public.services for select using (true);
create policy "services admin write" on public.services for all using (public.is_admin()) with check (public.is_admin());

-- Compteurs : uniquement via la fonction security definer
create policy "counters no access" on public.quote_counters for all using (false) with check (false);

-- Profils
create policy "profiles select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles update self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles update admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Références enregistrées
create policy "vehicles select" on public.vehicles
  for select using (auth.uid() = user_id or public.is_admin());
create policy "vehicles insert" on public.vehicles
  for insert with check (auth.uid() = user_id);
create policy "vehicles delete" on public.vehicles
  for delete using (auth.uid() = user_id);

create policy "container_refs select" on public.container_refs
  for select using (auth.uid() = user_id or public.is_admin());
create policy "container_refs insert" on public.container_refs
  for insert with check (auth.uid() = user_id);
create policy "container_refs delete" on public.container_refs
  for delete using (auth.uid() = user_id);

-- Demandes de cotation : la création passe par public.submit_quote()
-- (aucun INSERT direct, aucun SELECT anonyme → aucun accès aux coordonnées
-- des autres visiteurs). Chaque client lit ses propres demandes.
create policy "quotes select" on public.quotes
  for select using (auth.uid() = user_id or public.is_admin());
create policy "quotes update admin" on public.quotes
  for update using (public.is_admin()) with check (public.is_admin());

-- Notifications
create policy "notifications select" on public.notifications
  for select using (auth.uid() = user_id or (user_id is null and public.is_admin()));
create policy "notifications insert admin" on public.notifications
  for insert with check (public.is_admin());
create policy "notifications update" on public.notifications
  for update using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- Stockage des images (slider, conteneurs, uploads)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

create policy "uploads public read" on storage.objects
  for select using (bucket_id = 'uploads');
create policy "uploads admin write" on storage.objects
  for insert with check (bucket_id = 'uploads' and public.is_admin());
create policy "uploads admin update" on storage.objects
  for update using (bucket_id = 'uploads' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Premier administrateur
-- ---------------------------------------------------------------------------
-- Créez votre compte dans l'application (avec l'adresse de votre choix), puis :
--   update public.profiles set role = 'admin' where email = 'votre@email.com';
-- Aucun compte n'est administrateur par défaut : c'est volontaire.
