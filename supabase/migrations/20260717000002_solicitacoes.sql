-- Ciclo de vida da cotação, com ID sequencial legível e chave pelo cliente final.
create sequence if not exists solicitacoes_numero_seq;

create table if not exists solicitacoes (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint not null unique default nextval('solicitacoes_numero_seq'),
  client_phone      text not null,                 -- CHAVE de dedup (cliente final, normalizado)
  client_name       text,
  state             text not null default 'aberta',-- aberta | enviada | fechada
  part_numbers      text[] not null default '{}',
  lead_ids          uuid[] not null default '{}',
  via_reseller      boolean not null default false,
  reseller_name     text,
  reseller_phone    text,
  origin_session_id text not null,                 -- sessão por onde a mensagem chegou
  sent_to_group_at  timestamptz,                   -- null = ainda não disparou no grupo
  opened_at         timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  closed_at         timestamptz
);

-- No máximo 1 solicitação aberta por cliente.
create unique index if not exists uq_solicitacao_aberta on solicitacoes(client_phone) where closed_at is null;

-- quote_sessions foi um precursor não usado em produção (código nunca deployado); substituído por solicitacoes.
drop table if exists quote_sessions;
