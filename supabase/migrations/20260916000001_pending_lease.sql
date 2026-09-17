-- Fila sem perda de mensagem.
-- Antes: o worker marcava processed=true ANTES de processar. Se o processamento falhava
-- (erro ou estouro de tempo da função), o retry do QStash não achava mais nada e a
-- mensagem do cliente sumia sem resposta (2 casos em 14 dias, set/2026).
-- Agora o claim é um ALUGUEL (lease): processed=true só depois da resposta da IA.
-- Falhou → o worker devolve as linhas; estourou o tempo → o aluguel vence e o retry reprocessa.

alter table pending_messages add column if not exists claimed_at timestamptz;
alter table pending_messages add column if not exists attempts integer not null default 0;

create index if not exists idx_pending_session_open
  on pending_messages(session_id) where processed = false;

-- Reivindica ATOMICAMENTE as pendentes da sessão que estão livres (nunca pegas ou com
-- aluguel vencido). Dois workers concorrentes nunca pegam a mesma linha: o UPDATE
-- reavalia o WHERE depois do lock. Linhas com mais de 24h não ressuscitam.
create or replace function claim_pending_messages(p_session_id text, p_lease_seconds integer default 70)
returns table (id uuid, content text, received_at timestamptz, context jsonb, attempts integer)
language sql
as $$
  update pending_messages p
     set claimed_at = now(),
         attempts   = p.attempts + 1
   where p.session_id = p_session_id
     and p.processed = false
     and p.received_at > now() - interval '24 hours'
     and (p.claimed_at is null or p.claimed_at < now() - make_interval(secs => p_lease_seconds))
  returning p.id, p.content, p.received_at, p.context, p.attempts;
$$;

-- Só o backend (service_role) mexe na fila.
revoke execute on function claim_pending_messages(text, integer) from public, anon, authenticated;
grant execute on function claim_pending_messages(text, integer) to service_role;
