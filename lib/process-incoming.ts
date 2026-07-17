import { tool } from 'ai'
import { z } from 'zod'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { sendChatwootReply } from '@/lib/chatwoot-send'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { upsertContact, updateContactLabels } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { addLabel, removeLabel } from '@/lib/tags'
import { getAdminClient } from '@/lib/supabase/admin'
import { BUSINESS_LABELS, SYSTEM_LABEL } from '@/lib/types'
import { validatePartNumber, extractPartNumbersFromText } from '@/lib/part-number'
import { createLead } from '@/lib/leads'
import { createPartsSheet } from '@/lib/google/sheets'
import { drainPending } from '@/lib/debounce'
import { processAttachment, type ChatwootAttachment } from '@/lib/media/process'
import type { InboxConfig } from '@/lib/types'
import { isQStashEnabled, scheduleSlaTakeover } from '@/lib/qstash'
import { normalizePhone } from '@/lib/phone'
import { findReseller } from '@/lib/resellers'
import {
  decideDispatch, getOpenSolicitacao, openSolicitacao, closeSolicitacao,
  addToSolicitacao, markSent,
} from '@/lib/solicitacoes'
import { buildGroupMessage } from '@/lib/quote-messages'
import { buildResellerDirective, buildQuoteContextDirective } from '@/lib/agent-directives'
import { reachOutToClient } from '@/lib/proactive-client'

/**
 * Context captured at webhook time and carried through the debounce queue,
 * so the worker can fully process a (possibly combined) message without the
 * original HTTP request.
 */
export interface IncomingContext {
  chatwootInboxId: number
  conversationId: number
  sessionId: string
  senderName: string | null
  senderPhone: string | null
  senderIdent: string | null
  chatId: string | null
  chatwootContactId: number | null
  labels: string[]
  // Anexos (PDF/imagem/áudio/planilha) NÃO extraídos ainda — o worker extrai
  // depois do debounce (em paralelo) pra não estourar o tempo do webhook.
  attachments?: ChatwootAttachment[]
}

/**
 * Drena todas as mensagens pendentes da sessão e, se houver anexos, extrai
 * o texto de TODOS em paralelo (PDF/imagem/áudio/planilha) e concatena.
 * Roda no worker (60s) — fora do webhook — pra aguentar PDFs pesados.
 */
export async function drainAndBuildContent(sessionId: string): Promise<{
  content: string
  context: IncomingContext | null
  count: number
}> {
  const { combinedContent, context, attachments, ids } = await drainPending(sessionId)
  let content = combinedContent
  const atts = (attachments as ChatwootAttachment[] | undefined) ?? []

  if (atts.length > 0) {
    // Limita a 8 anexos pra evitar abuso; extrai em PARALELO (tempo = mais lento, não soma)
    const results = await Promise.all(
      atts.slice(0, 8).map(att =>
        processAttachment(att).catch(err => {
          console.warn('[drain] attachment extract error:', err)
          return null
        })
      )
    )
    const extracted = results.filter((t): t is string => !!t)
    if (extracted.length > 0) {
      content = content ? `${content}\n\n${extracted.join('\n\n')}` : extracted.join('\n\n')
    }
    console.log(`[drain] ${sessionId}: extraídos ${extracted.length}/${atts.length} anexos`)
  }

  return { content, context: (context as IncomingContext | null), count: ids.length }
}

/**
 * Builds the agent tool-set for a conversation, encapsulating label mutation.
 * Extracted so the same tools can be reused outside processIncomingMessage
 * (e.g. during a takeover flow) without duplicating logic.
 */
export function buildAgentTools(params: {
  inbox: InboxConfig
  conversationId: number
  contactId: string
  senderName: string | null
  senderPhone: string | null
  chatwootCfg: { baseUrl: string; accountId: number; userToken: string }
  initialLabels: string[]
  sessionId: string
  reseller: { name: string } | null
}): { tools: Record<string, unknown>; getLabels: () => string[] } {
  const { inbox, conversationId, contactId, senderName, senderPhone, chatwootCfg, sessionId, reseller } = params
  let labelsState = [...params.initialLabels]
  const labelEnum = z.enum(BUSINESS_LABELS)

  const tools = {
    add_label: tool({
      description: 'Adiciona uma etiqueta de negócio à conversa atual.',
      inputSchema: z.object({ label: labelEnum }),
      execute: async ({ label }: { label: typeof BUSINESS_LABELS[number] }) => {
        labelsState = await addLabel(chatwootCfg, conversationId, labelsState, label)
        await updateContactLabels(contactId, labelsState)
        return { ok: true, labels: labelsState }
      },
    }),
    remove_label: tool({
      description: 'Remove uma etiqueta de negócio da conversa atual.',
      inputSchema: z.object({ label: labelEnum }),
      execute: async ({ label }: { label: typeof BUSINESS_LABELS[number] }) => {
        labelsState = await removeLabel(chatwootCfg, conversationId, labelsState, label)
        await updateContactLabels(contactId, labelsState)
        return { ok: true, labels: labelsState }
      },
    }),
    validate_part_number: tool({
      description: 'Valida se o texto é um Part Number aeronáutico legítimo. ' +
                   'Cobre MIL-SPEC (AN/MS/NAS/M-series), NSN, ATA e fabricantes ' +
                   '(Cessna, Garmin, Beechcraft, Piper, Honeywell, headsets Bose/Lightspeed/David Clark, etc.). ' +
                   'Retorna formato, fabricante, confidence e PN normalizado.',
      inputSchema: z.object({
        candidate: z.string().describe('O texto fornecido pelo cliente, possível PN'),
      }),
      execute: async ({ candidate }: { candidate: string }) => {
        const result = await validatePartNumber(candidate)
        console.log(`[validate_pn] "${candidate}" → valid=${result.valid} format=${result.format}`)
        return result
      },
    }),
    extract_part_numbers: tool({
      description: 'Extrai uma lista de Part Numbers candidatos de um blob de texto (útil quando cliente manda planilha, PDF ou lista com múltiplos PNs). Retorna array de candidatos com contexto e quantidade se identificável.',
      inputSchema: z.object({
        text: z.string().describe('O texto completo de onde extrair PNs (ex: conteúdo de planilha ou PDF)'),
      }),
      execute: async ({ text }: { text: string }) => {
        const result = await extractPartNumbersFromText(text)
        console.log(`[extract_pn] found ${result.length} candidates`)
        return { items: result }
      },
    }),
    envia_pn: tool({
      description: 'Envia lead qualificado ao grupo do vendedor. Aceita 1+ items (Part Number + quantidade). CHAME quando tiver todos os dados. Sempre passe a lista COMPLETA e atual de PNs. Se a origem for consultor/revendedor, passe client_name e client_phone do cliente final. Use forcar_nova=true só quando o cliente confirmar que é uma NOVA cotação após um possivel_duplicata.',
      inputSchema: z.object({
        items: z.array(z.object({
          part_number: z.string(),
          quantity: z.string(),
          notes: z.string().optional(),
        })).min(1),
        urgency: z.enum(['AOG', 'rotina']),
        general_notes: z.string().optional().describe('Contexto adicional: aeronave (ex. "Aeronave: Cessna 172"), urgência operacional, frequência de uso, etc.'),
        client_name: z.string().optional().describe('Nome do cliente final (obrigatório quando a origem é consultor/revendedor).'),
        client_phone: z.string().optional().describe('Número do cliente final (obrigatório quando a origem é consultor/revendedor).'),
        forcar_nova: z.boolean().optional().describe('true só quando o cliente confirmou que é uma NOVA cotação após um possivel_duplicata.'),
      }),
      execute: async (args) => {
        // 1. Cliente final.
        //    clientPhone = telefone real (pode ser null em canais sem telefone: site/email).
        //    clientKey  = chave de dedup da solicitação: telefone real, senão a própria sessão.
        const clientPhone = normalizePhone(args.client_phone) || normalizePhone(senderPhone) || null
        const clientKey = clientPhone ?? sessionId
        const clientName = (args.client_name && args.client_name.trim())
          || (senderName && senderName.trim()) || null

        // Revendedor SEMPRE precisa do telefone do cliente final (é a chave + destino do proativo).
        if (reseller && !normalizePhone(args.client_phone)) {
          console.log('[envia_pn] revendedor sem client_phone → faltou_cliente')
          return { status: 'faltou_cliente' as const }
        }

        console.log(`[envia_pn] firing items=${args.items.length} urg=${args.urgency} client=${clientName} key=${clientKey} reseller=${reseller?.name ?? '-'} forcarNova=${!!args.forcar_nova}`)

        // 2. Solicitação (fecha a aberta se forçar nova)
        if (args.forcar_nova) {
          const aberta = await getOpenSolicitacao(clientKey)
          if (aberta) await closeSolicitacao(aberta.id)
        }
        const sol = (await getOpenSolicitacao(clientKey)) ?? (await openSolicitacao({
          clientPhone: clientKey, clientName, originSessionId: sessionId,
          viaReseller: !!reseller, resellerName: reseller?.name ?? null,
          resellerPhone: reseller ? normalizePhone(senderPhone) : null,
        }))

        // 3. Decisão de disparo (trava determinística anti-duplicação)
        const decision = decideDispatch(sol, args.items)
        if (decision.action === 'possivel_duplicata') {
          console.log(`[envia_pn] possivel_duplicata sol=${sol.numero} — não dispara`)
          return { status: 'possivel_duplicata' as const, numero: sol.numero }
        }

        // 4. Cria leads só pros items novos
        const leadIds: string[] = []
        for (const item of decision.novos) {
          const lead = await createLead({
            contact_id: contactId,
            part_number: item.part_number,
            quantity: item.quantity,
            urgency: args.urgency,
            customer_name: clientName,
            customer_phone: clientPhone,
            notes: item.notes ?? args.general_notes ?? null,
          })
          leadIds.push(lead.id)
        }
        await addToSolicitacao(sol.id, decision.novos.map(i => i.part_number), leadIds)

        let sheetUrl: string | null = null
        try {
          const sheet = await createPartsSheet({
            customerName: clientName,
            customerPhone: clientPhone,
            items: args.items.map(i => ({ part_number: i.part_number, quantity: i.quantity })),
            urgency: args.urgency,
          })
          sheetUrl = sheet.url
          console.log(`[envia_pn] sheet created: ${sheet.url}`)
          if (leadIds.length) {
            const admin = getAdminClient()
            await admin.from('leads').update({ sheet_url: sheetUrl }).in('id', leadIds)
          }
        } catch (err) {
          const errMsg = (err as Error).message ?? String(err)
          console.warn(`[envia_pn] sheet creation failed (non-fatal): ${errMsg.slice(0, 500)}`)
          if (leadIds.length) {
            try {
              const admin = getAdminClient()
              await admin.from('leads').update({ notes: `[sheet_error] ${errMsg.slice(0, 400)}` }).in('id', leadIds)
            } catch {}
          }
        }

        // Seller notification — QuePasa from THIS inbox or fallback to any inbox with QuePasa
        const sellerPhone = (inbox as unknown as { seller_phone?: string | null }).seller_phone
        let quepasaCfg: { host: string; token: string } | null = null
        if (inbox.quepasa_host && inbox.quepasa_token) {
          quepasaCfg = { host: inbox.quepasa_host, token: inbox.quepasa_token }
        } else {
          const admin = getAdminClient()
          const { data: gw } = await admin
            .from('inboxes')
            .select('quepasa_host, quepasa_token')
            .not('quepasa_host', 'is', null)
            .not('quepasa_token', 'is', null)
            .eq('enabled', true)
            .limit(1)
            .maybeSingle()
          if (gw?.quepasa_host && gw?.quepasa_token) {
            quepasaCfg = { host: gw.quepasa_host, token: gw.quepasa_token }
          }
        }

        const channelLabel = (() => {
          if (inbox.quepasa_host) return 'WhatsApp'
          const lower = inbox.name.toLowerCase()
          const hasIG = lower.includes('instagram') || lower.includes('direct') || /\big\b/.test(lower)
          const hasMSG = lower.includes('messenger') || /\bmsg\b/.test(lower) || /\bfb\b/.test(lower) || lower.includes('facebook')
          if (hasIG && hasMSG) return `Instagram/Messenger (${inbox.name})`
          if (hasIG) return `Instagram (${inbox.name})`
          if (hasMSG) return `Messenger (${inbox.name})`
          if (lower.includes('site') || lower.includes('web') || lower.includes('widget')) return `Site (${inbox.name})`
          if (lower.includes('email') || lower.includes('mail')) return `Email (${inbox.name})`
          return inbox.name
        })()

        if (sellerPhone && quepasaCfg) {
          const chatwootUrl = `${inbox.chatwoot_base_url}/app/accounts/${inbox.chatwoot_account_id}/conversations/${conversationId}`
          const sellerMsg = buildGroupMessage({
            action: decision.action, numero: sol.numero, channelLabel,
            clientName, clientPhone, urgency: args.urgency, items: args.items,
            generalNotes: args.general_notes ?? null, resellerName: reseller?.name ?? null,
            sheetUrl, chatwootUrl,
          })
          await sendMessage(quepasaCfg, sellerPhone, sellerMsg)
        } else {
          console.warn(`[envia_pn] seller_phone or QuePasa fallback not available for inbox ${inbox.id}`)
        }

        // Primeira vez: marca enviada + etiqueta orçamento_pendente (NUNCA orcamento_enviado).
        if (decision.action === 'enviada') {
          await markSent(sol.id)
          labelsState = await addLabel(chatwootCfg, conversationId, labelsState, 'orçamento_pendente')
          await updateContactLabels(contactId, labelsState)
        }

        // Fase B: alcance proativo ao cliente — só na 1ª vez e quando veio via revendedor.
        if (decision.action === 'enviada' && reseller && clientPhone && clientName) {
          try {
            await reachOutToClient({
              chatwootCfg, inboxId: inbox.chatwoot_inbox_id,
              clientPhone, clientName, resellerName: reseller.name,
              items: args.items.map(i => ({ part_number: i.part_number, quantity: i.quantity })),
              quepasaCfg,
            })
          } catch (err) {
            console.warn(`[envia_pn] proativo falhou (não fatal): ${(err as Error).message?.slice(0, 200)}`)
          }
        }

        // sheet_url NÃO volta pro modelo de propósito: o link da planilha é interno
        // (vai só pro grupo do vendedor). Se voltasse, a IA mandava pro cliente.
        return { status: decision.action, numero: sol.numero, lead_ids: leadIds, count: decision.novos.length }
      },
    }),
  }

  return { tools, getLabels: () => labelsState }
}

/**
 * Full processing pipeline for a Contact message (or combined batch).
 * Extracted from the webhook so it can run either inline OR from the
 * QStash-backed debounce worker (/api/process-pending).
 */
export async function processIncomingMessage(
  inbox: InboxConfig,
  ctx: IncomingContext,
  content: string,
): Promise<void> {
  const {
    conversationId, sessionId, senderName, senderPhone, senderIdent,
    chatId, chatwootContactId, labels,
  } = ctx

  // Upsert contact
  const { contact, wasNew } = await upsertContact({
    inbox_id: inbox.id,
    chatwoot_conversation_id: conversationId,
    chatwoot_contact_id: chatwootContactId,
    name: senderName ?? null,
    phone_number: senderPhone ?? null,
    whatsapp_identifier: senderIdent ?? null,
    current_labels: labels,
    last_message: content,
    last_message_at: new Date().toISOString(),
  })

  // Save the (combined) customer message to memory
  await saveMessage(sessionId, 'user', content)

  // Decide if bot should respond: skip if a human took over and it's not new
  const hasAtendimentoIA = labels.includes(SYSTEM_LABEL)
  if (!hasAtendimentoIA && !wasNew) {
    console.log(`[process] handoff: humano assumiu conversation=${conversationId}`)
    // SLA: se ninguém responder em N min, a IA assume (Parte B do spec)
    const slaEnabled = (process.env.SLA_TAKEOVER_ENABLED ?? 'true') === 'true'
    if (slaEnabled && isQStashEnabled() && !!inbox.quepasa_host && !!inbox.quepasa_token) {
      const min = parseInt(process.env.SLA_TAKEOVER_MIN ?? '15', 10)
      try {
        await scheduleSlaTakeover(sessionId, new Date().toISOString(), min * 60, { conversationId, chatwootInboxId: ctx.chatwootInboxId })
      } catch (err) {
        console.warn(`[process] scheduleSlaTakeover falhou:`, err)
      }
    }
    return
  }

  const useQuepasa = !!(inbox.quepasa_host && inbox.quepasa_token)
  console.log(`[process] inbox=${inbox.id} conv=${conversationId} wasNew=${wasNew} hasIA=${hasAtendimentoIA} outbound=${useQuepasa ? 'quepasa' : 'chatwoot'}`)

  const chatwootCfg = {
    baseUrl: inbox.chatwoot_base_url,
    accountId: inbox.chatwoot_account_id,
    userToken: inbox.chatwoot_user_token,
  }

  const reseller = await findReseller(senderPhone)

  const { tools, getLabels } = buildAgentTools({
    inbox, conversationId, contactId: contact.id,
    senderName, senderPhone, chatwootCfg, initialLabels: labels,
    sessionId, reseller,
  })

  // Contexto extra pro agente: origem revendedor + estado da solicitação aberta do cliente.
  // A solicitação é keyada por telefone NORMALIZADO (não por sessionId) → robusto ao formato
  // do identificador. Este é o mecanismo confiável de "o agente lembra do contexto".
  const ctxKey = normalizePhone(senderPhone) || sessionId
  const openSol = await getOpenSolicitacao(ctxKey)
  const extraContext = [
    reseller ? buildResellerDirective(reseller.name) : '',
    openSol ? buildQuoteContextDirective({ numero: openSol.numero, resellerName: openSol.reseller_name, partNumbers: openSol.part_numbers }) : '',
  ].join('')

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId, content, inbox.system_prompt,
    openai.apiKey, openai.model, tools, getLabels(),
    { extraContext },
  )
  console.log(`[process] replyLen=${reply.length}`)

  if (useQuepasa) {
    if (!chatId) {
      console.warn(`[process] QuePasa precisa de chatId mas nenhum foi extraido — pulando reply`)
      return
    }
    await sendMessage({ host: inbox.quepasa_host!, token: inbox.quepasa_token! }, chatId, reply)
  } else {
    await sendChatwootReply(chatwootCfg, conversationId, reply)
  }

  if (!hasAtendimentoIA) {
    const finalLabels = await addLabel(chatwootCfg, conversationId, getLabels(), SYSTEM_LABEL)
    await updateContactLabels(contact.id, finalLabels)
  }
}
