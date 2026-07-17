-- Consultores/revendedores parceiros. Uma linha por número (mesma pessoa pode ter vários).
create table if not exists resellers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null unique,   -- normalizado: só dígitos, com DDI/DDD
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_resellers_phone_active on resellers(phone) where active;
