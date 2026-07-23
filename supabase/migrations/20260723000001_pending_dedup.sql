-- O webhook do Chatwoot entrega a mesma mensagem mais de uma vez; sem trava, cada
-- entrega virava um processamento (resposta duplicada, race nas solicitações).
-- Unicidade por chatwoot_message_id: a 2ª entrega é ignorada na origem.

-- Limpa duplicatas históricas antes do índice único (mantém a mais antiga).
delete from pending_messages p
using pending_messages dup
where p.chatwoot_message_id is not null
  and dup.chatwoot_message_id = p.chatwoot_message_id
  and dup.id < p.id;

create unique index if not exists uq_pending_chatwoot_msg
  on pending_messages(chatwoot_message_id)
  where chatwoot_message_id is not null;
