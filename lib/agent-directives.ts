import { formatNumero } from '@/lib/solicitacoes'

/** Diretiva quando a mensagem vem de um CONSULTOR/REVENDEDOR encaminhando cotação de cliente. */
export function buildResellerDirective(resellerName: string): string {
  return `\n\n---\n\n## 🤝 ORIGEM: CONSULTOR/REVENDEDOR (${resellerName})\n\nEsta conversa é com um CONSULTOR (${resellerName}) que está REPASSANDO a cotação de um CLIENTE dele — não é o cliente final.\n\n**Antes de enviar a cotação ao grupo, você DEVE:**\n1. Processar/ler os Part Numbers normalmente.\n2. PEDIR e CONFIRMAR o **nome** e o **número** do CLIENTE FINAL: "Me confirma o nome e o número do cliente pra eu registrar a cotação?"\n3. Só chame \`envia_pn\` DEPOIS de ter o número do cliente, passando \`client_name\` e \`client_phone\`.\n4. SEM o número do cliente a cotação NÃO é enviada ao grupo. Se você chamar \`envia_pn\` sem o número e vier \`status: 'faltou_cliente'\`, ou se ainda não tem o número: NUNCA diga que foi enviada. Responda pedindo o número, exatamente assim: "Pra enviar a cotação no grupo de cotações, preciso do número do cliente. Me passa, por favor?"\n5. Só depois que o consultor mandar o número, chame \`envia_pn\` de novo com \`client_name\` e \`client_phone\` — aí sim a cotação vai pro grupo.\n\nNUNCA envie a cotação ao grupo com os dados do consultor no lugar do cliente. NUNCA diga "enviado" / "cotação enviada" sem ter o número do cliente.`
}

/** Diretiva com o estado da solicitação aberta do cliente (pra IA atender com contexto). */
export function buildQuoteContextDirective(input: { numero: number; resellerName: string | null; partNumbers: string[] }): string {
  const origem = input.resellerName
    ? `Este lead foi encaminhado pelo consultor ${input.resellerName}.`
    : `Este cliente já tem uma solicitação em aberto.`
  const pns = input.partNumbers.length ? input.partNumbers.join(', ') : '(nenhum ainda)'
  return `\n\n---\n\n## 🧾 SOLICITAÇÃO EM ANDAMENTO ${formatNumero(input.numero)}\n\n${origem} Cotação ${formatNumero(input.numero)} já recebida: ${pns}.\n\nAtenda com esse contexto: NÃO peça de novo o que já temos; reconheça a cotação e toque pro orçamento. Se o cliente mandar itens NOVOS, passe a lista COMPLETA e atual no \`envia_pn\`.\n\nSe \`envia_pn\` retornar \`status: 'possivel_duplicata'\`, PERGUNTE ao cliente: "é uma nova cotação ou a mesma de antes?" — se ele disser NOVA, chame \`envia_pn\` de novo com \`forcar_nova: true\`; se disser a MESMA, tranquilize ("sua cotação ${formatNumero(input.numero)} já está com o time") e não faça nada.`
}
