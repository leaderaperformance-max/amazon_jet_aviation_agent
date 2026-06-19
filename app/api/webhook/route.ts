import { NextRequest, NextResponse } from 'next/server'
import { loadInboxByChatwootId } from '@/lib/inboxes'
import { upsertContact } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { getAdminClient } from '@/lib/supabase/admin'
import { processAttachment, type ChatwootAttachment } from '@/lib/media/process'
import { insertPending, drainPending } from '@/lib/debounce'
import { isQStashEnabled, scheduleDrain } from '@/lib/qstash'
import { processIncomingMessage, type IncomingContext } from '@/lib/process-incoming'

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
  message_type?: number
  conversation_id?: number
  sender_type?: 'Contact' | 'User' | 'AgentBot'
  sender?: ChatwootSender
}

interface ChatwootConversation {
  id?: number
  labels?: string[]
}

interface RawPayload {
  body?: RawPayload
  id?: number
  inbox_id?: number
  messages?: ChatwootMessage[]
  conversation?: ChatwootConversation
  labels?: string[]
  meta?: { sender?: ChatwootSender }
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
  const data: RawPayload = raw.body ?? raw

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

  // Process attachments (audio/image/pdf) — enriches the content
  const attachments = ((message as unknown) as { attachments?: ChatwootAttachment[] }).attachments ?? []
  let enrichedContent = message.content ?? ''

  for (const att of attachments) {
    try {
      const processed = await processAttachment(att)
      if (processed) {
        enrichedContent = enrichedContent
          ? `${enrichedContent}\n\n${processed}`
          : processed
      }
    } catch (err) {
      console.warn('[webhook] attachment processing error:', err)
    }
  }

  if (!enrichedContent.trim()) {
    console.warn(`[webhook] SKIP: no usable content (no text and no processable attachment)`)
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
      last_message: enrichedContent,
      last_message_at: new Date().toISOString(),
    })
    await saveMessage(sessionId, 'user', `[atendente]: ${message.content ?? ''}`)
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
  }

  // Insere na fila de debounce (agrupa mensagens picadas do cliente)
  const inserted = await insertPending(sessionId, enrichedContent, message.id, ctx)
  console.log(`[webhook] pending ${inserted.id} session=${sessionId}`)

  // Janela de debounce: anexo = pedido completo (curto); texto = junta picadas (longo)
  const longDelay = parseInt(process.env.DEBOUNCE_DELAY_SEC ?? '25', 10)
  const shortDelay = parseInt(process.env.DEBOUNCE_DELAY_ATTACH_SEC ?? '5', 10)
  const delaySec = attachments.length > 0 ? shortDelay : longDelay

  if (isQStashEnabled()) {
    // PRODUÇÃO: agenda o processamento via QStash (não bloqueia a função → sem timeout)
    try {
      await scheduleDrain(sessionId, inserted.received_at, delaySec)
      console.log(`[webhook] scheduled drain via QStash in ${delaySec}s`)
      return NextResponse.json({ ok: true, queued: true })
    } catch (err) {
      console.warn(`[webhook] QStash falhou, processando inline:`, err)
      // cai no fallback abaixo
    }
  }

  // FALLBACK (sem QStash): processa imediatamente, sem agrupar.
  // Garante que o cliente sempre recebe resposta (sem o risco do setTimeout longo).
  const { combinedContent } = await drainPending(sessionId)
  if (!combinedContent.trim()) return NextResponse.json({ ok: true })
  try {
    await processIncomingMessage(inbox, ctx, combinedContent)
  } catch (err) {
    console.error(`[webhook] inline process error:`, err)
  }
  return NextResponse.json({ ok: true })
}
