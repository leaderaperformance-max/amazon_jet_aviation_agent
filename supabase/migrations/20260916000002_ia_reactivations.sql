-- Reativação manual da IA por conversa.
-- Regra: quando um atendente humano fala com o cliente, a IA fica FORA daquela conversa
-- por 24h (mesmo com a etiqueta atendimento_ia). Pra trazer a IA de volta antes, o
-- atendente escreve uma NOTA PRIVADA "#ia" no Chatwoot → o webhook grava aqui.
create table if not exists ia_reactivations (
  session_id       text primary key,          -- mesma chave da memória (JID do WhatsApp)
  reactivated_at   timestamptz not null default now(),
  reactivated_by   text,                      -- atendente que escreveu #ia
  conversation_id  bigint                     -- conversa do Chatwoot (display id)
);

alter table ia_reactivations enable row level security;
