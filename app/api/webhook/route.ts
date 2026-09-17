import { NextRequest, NextResponse } from 'next/server'
import { loadInboxByChatwootId } from '@/lib/inboxes'
import { upsertContact } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { getAdminClient } from '@/lib/supabase/admin'
import { type ChatwootAttachment } from '@/lib/media/process'
import { insertPending, completePending, releasePending } from '@/lib/debounce'
import { isQStashEnabled, scheduleDrain } from '@/lib/qstash'
import { processIncomingMessage, drainAndBuildContent, type IncomingContext } from '@/lib/process-incoming'
import { isEchoOfOwnMessage } from '@/lib/human-handoff'
import { isReactivationCommand, reactivateAI } from '@/lib/ia-reactivation'

// Webhook fica curto: recebe, enfileira, retorna. Processamento pesado vai
// pro worker (/api/process-pending) via QStash. maxDuration baixo é suficiente.
export const maxDuration = 30

interface ChatwootSender {
  id?: number
  identifier?: string
  name?: string
  phone_number?: string | null
  type?: string
}

interface ChatwootMessage {
  id?: number
  content?: string | null
  message_type?: number | string
  conversation_id?: number
  sender_type?: 'Contact' | 'User' | 'AgentBot'
  private?: boolean
  sender?: ChatwootSender
}

interface ChatwootConversation {
  id?: number
  inbox_id?: number
  labels?: string[]
  meta?: { sender?: ChatwootSender }
}

interface RawPayload {
  body?: RawPayload
  event?: string
  id?: number
  inbox_id?: number
  // Formato do webhook da CONTA (message_created): a mensagem vem no topo.
  content?: string | null
  private?: boolean
  sender?: ChatwootSender
  inbox?: { id?: number }
  messages?: ChatwootMessage[]
  conversation?: ChatwootConversation
  labels?: string[]
  meta?: { sender?: ChatwootSender }
}

/**
 * Notas privadas só chegam pelo webhook da CONTA (evento message_created, mensagem no
 * topo do payload). A automação "msg-nova" nunca manda nota: o messages[0] dela é sempre
 * a última mensagem PÚBLICA. Converte a nota pro formato da automação pra seguir o fluxo
 * normal (dedup, sessão) até o tratamento de nota privada. Os demais eventos desse
 * formato continuam ignorados (não têm inbox_id no topo), como sempre foram.
 */
function adaptPrivateNoteEvent(d: RawPayload): RawPayload {
  if (d.event !== 'message_created' || d.private !== true) return d
  return {
    inbox_id: d.inbox?.id ?? d.conversation?.inbox_id,
    id: d.conversation?.id,
    labels: d.conversation?.labels,
    meta: d.conversation?.meta,
    messages: [{
      id: d.id,
      content: d.content,
      private: true,
      sender_type: 'User',
      sender: d.sender,
      conversation_id: d.conversation?.id,
    }],
  }
}

function extractChatId(identifier?: string, phoneNumber?: string | null): string | null {
  if (identifier) {
    const digits = identifier.split('@')[0].replace(/\D/g, '')
    if (digits) return digits
  }
  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits) return digits
  }
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw: RawPayload = await req.json()
  const data: RawPayload = adaptPrivateNoteEvent(raw.body ?? raw)

  console.log(`[webhook] RAW: ${JSON.stringify(raw).slice(0, 800)}`)

  const chatwootInboxId = data.inbox_id
  if (!chatwootInboxId) {
    console.warn(`[webhook] SKIP: no inbox_id`)
    return NextResponse.json({ ok: true })
  }

  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox || !inbox.enabled) {
    console.warn(`[webhook] SKIP: inbox not found or disabled`)
    return NextResponse.json({ ok: true })
  }

  const message = data.messages?.[0]
  if (!message) {
    console.warn(`[webhook] SKIP: no message`)
    return NextResponse.json({ ok: true })
  }

  // AgentBot is our own reply — already in our memory, ignore entirely
  if (message.sender_type === 'AgentBot') {
    console.log(`[webhook] SKIP: AgentBot (our own reply)`)
    return NextResponse.json({ ok: true })
  }

  // Dedup: Chatwoot may fire the same message_created event twice (inbox webhook + automation).
  // Use an atomic insert with unique constraint to ensure each message is processed once.
  if (message.id) {
    const supabaseAdmin = getAdminClient()
    const { error: dupErr } = await supabaseAdmin
      .from('processed_webhook_messages')
      .insert({ chatwoot_message_id: message.id })
    if (dupErr) {
      // 23505 = unique_violation in Postgres
      if ((dupErr as { code?: string }).code === '23505') {
        console.log(`[webhook] SKIP: duplicate message ${message.id}`)
        return NextResponse.json({ ok: true })
      }
      console.warn(`[webhook] dedup insert error (continuing):`, dupErr)
    }
  }

  const conversationId = data.id ?? message.conversation_id
  if (!conversationId) return NextResponse.json({ ok: true })

  const senderIdent = data.meta?.sender?.identifier ?? message.sender?.identifier
  const senderPhone = data.meta?.sender?.phone_number ?? message.sender?.phone_number
  const senderName = data.meta?.sender?.name ?? message.sender?.name
  const chatId = extractChatId(senderIdent, senderPhone)

  // Session: prefer the stable sender identifier (WhatsApp JID, email),
  // fall back to a per-conversation key (Website widget visitors often have
  // no identifier/phone at all until they provide email).
  const sessionId = senderIdent ?? `chatwoot-conv-${conversationId}`

  // chatId only matters for QuePasa (WhatsApp). For Website/email channels
  // we reply via Chatwoot API which uses conversationId — chatId can be empty.

  // Bot NUNCA responde em grupos do WhatsApp. Mensagens cujo identificador
  // do remetente contém "@g.us" são de grupo — só leitura, sem reply.
  if (sessionId.includes('@g.us') || (chatId && chatId.includes('@g.us'))) {
    console.log(`[webhook] SKIP: group message (no replies in groups) sessionId=${sessionId}`)
    return NextResponse.json({ ok: true })
  }

  const labels = data.conversation?.labels ?? data.labels ?? []

  // --- Nota privada: nunca entra na memória da IA nem gera resposta. ---
  // Única exceção: "#ia" = atendente devolvendo a conversa pra IA antes das 24h de pausa.
  if (message.private) {
    if (!isReactivationCommand(message.content)) {
      console.log(`[webhook] SKIP: nota privada conv=${conversationId}`)
      return NextResponse.json({ ok: true, skipped: 'private_note' })
    }
    try {
      await reactivateAI({
        sessionId, conversationId, labels,
        chatwootCfg: {
          baseUrl: inbox.chatwoot_base_url,
          accountId: inbox.chatwoot_account_id,
          userToken: inbox.chatwoot_user_token,
        },
        by: message.sender?.name ?? null,
      })
      console.log(`[webhook] IA reativada via nota privada #ia session=${sessionId} conv=${conversationId}`)
      return NextResponse.json({ ok: true, reactivated: true })
    } catch (err) {
      console.error(`[webhook] reativação #ia falhou session=${sessionId}:`, err)
      return NextResponse.json({ ok: false, error: 'reactivation failed' })
    }
  }

  // Anexos NÃO são extraídos aqui — guardamos a referência e o worker
  // (process-pending, 60s) baixa+extrai depois do debounce, em paralelo.
  // Isso evita timeout do webhook com PDFs pesados e agrupa múltiplos PDFs.
  const attachments = ((message as unknown) as { attachments?: ChatwootAttachment[] }).attachments ?? []
  const textContent = message.content ?? ''

  // Pula só se NÃO tem texto E NÃO tem anexo
  if (!textContent.trim() && attachments.length === 0) {
    console.warn(`[webhook] SKIP: sem texto e sem anexo`)
    return NextResponse.json({ ok: true })
  }

  const isHuman = message.sender_type === 'User'
  const isContact = message.sender_type === 'Contact'

  // --- Human (vendedor) message: salva na memória com prefixo, sem responder ---
  if (isHuman) {
    await upsertContact({
      inbox_id: inbox.id,
      chatwoot_conversation_id: conversationId,
      chatwoot_contact_id: message.sender?.id ?? null,
      name: senderName ?? null,
      phone_number: senderPhone ?? null,
      whatsapp_identifier: senderIdent ?? null,
      current_labels: labels,
      last_message: textContent || '[anexo]',
      last_message_at: new Date().toISOString(),
    })
    // Eco de mensagem que o PRÓPRIO sistema enviou pela API do Chatwoot (contato proativo
    // com o cliente do consultor, respostas do Site/Instagram): volta como "User", mas não
    // é atendente. Salvar como [atendente] tiraria a IA da conversa por 24h à toa.
    if (await isEchoOfOwnMessage(sessionId, textContent)) {
      console.log(`[webhook] SKIP: eco de mensagem do próprio sistema session=${sessionId}`)
      return NextResponse.json({ ok: true, skipped: 'system_echo' })
    }
    await saveMessage(sessionId, 'user', `[atendente]: ${textContent}`)
    console.log(`[webhook] DONE: atendente message saved, no reply`)
    return NextResponse.json({ ok: true })
  }

  // --- Apenas mensagens de Contact disparam resposta ---
  if (!isContact) {
    return NextResponse.json({ ok: true })
  }

  // Contexto carregado pela fila pro worker processar sem o request original
  const ctx: IncomingContext = {
    chatwootInboxId,
    conversationId,
    sessionId,
    senderName: senderName ?? null,
    senderPhone: senderPhone ?? null,
    senderIdent: senderIdent ?? null,
    chatId,
    chatwootContactId: message.sender?.id ?? null,
    labels,
    attachments: attachments.length > 0 ? attachments : undefined,
  }

  // Insere na fila (content = só texto; anexos vão no context pro worker extrair).
  // null = MESMA message.id já enfileirada (webhook entregue 2x) → ignora e sai:
  // sem isso, a entrega dupla virava dois processamentos e resposta duplicada.
  const inserted = await insertPending(sessionId, textContent, message.id, ctx)
  if (!inserted) {
    console.log(`[webhook] SKIP: duplicate delivery msg=${message.id} session=${sessionId}`)
    return NextResponse.json({ ok: true, skipped: 'duplicate' })
  }
  console.log(`[webhook] pending ${inserted.id} session=${sessionId} anexos=${attachments.length}`)

  // Debounce: janela pra agrupar texto + documento/imagem que chegam em tempos
  // diferentes (o cliente manda "quero cotar" e o PDF/foto logo depois). Janela
  // maior = merge mais confiável; o merge pega a ÚLTIMA mensagem (hasNewerPending),
  // então a janela vale entre uma mensagem e a próxima.
  const longDelay = parseInt(process.env.DEBOUNCE_DELAY_SEC ?? '30', 10)
  const attachDelay = parseInt(process.env.DEBOUNCE_DELAY_ATTACH_SEC ?? '30', 10)
  const delaySec = attachments.length > 0 ? attachDelay : longDelay

  if (isQStashEnabled()) {
    try {
      await scheduleDrain(sessionId, inserted.received_at, delaySec)
      console.log(`[webhook] scheduled drain via QStash in ${delaySec}s`)
      return NextResponse.json({ ok: true, queued: true })
    } catch (err) {
      console.warn(`[webhook] QStash falhou, processando inline:`, err)
    }
  }

  // FALLBACK (sem QStash): drena + extrai anexos + processa na hora.
  // Falhou antes da resposta → devolve pra fila (a próxima mensagem da sessão reprocessa).
  try {
    const { content, context, ids, attempt } = await drainAndBuildContent(sessionId)
    let replied = false
    if (content.trim() && context) {
      try {
        await processIncomingMessage(inbox, context, content, {
          reprocessing: attempt > 1,
          onReplySent: async () => { replied = true; await completePending(ids) },
        })
      } catch (err) {
        if (!replied) await releasePending(ids).catch(() => {})
        throw err
      }
    }
    if (!replied) await completePending(ids)
  } catch (err) {
    console.error(`[webhook] inline process error:`, err)
  }
  return NextResponse.json({ ok: true })
}
