-- Dedup das automações do funil (pontos 5/7/9). Já aplicada em prod manualmente;
-- este arquivo versiona o schema pra novos ambientes.
create table if not exists funnel_automations_sent (
  id uuid primary key default gen_random_uuid(),
  funnel_item_id   bigint not null,
  conversation_id  bigint,
  automation_type  text not null,
  start_in_step    bigint not null,
  sent_at          timestamptz not null default now(),
  message          text
);
create index if not exists idx_funnel_autom_dedup
  on funnel_automations_sent (funnel_item_id, automation_type, start_in_step);
create index if not exists idx_funnel_autom_recurring
  on funnel_automations_sent (funnel_item_id, automation_type, sent_at desc);
-- One-shot (leads_novos/orcamento_enviado): no máximo 1 envio por entrada na etapa.
-- venda_fechada é recorrente (vários envios c/ mesmo start_in_step) → excluído do unique.
create unique index if not exists uq_funnel_autom_oneshot
  on funnel_automations_sent (funnel_item_id, automation_type, start_in_step)
  where automation_type <> 'venda_fechada';
