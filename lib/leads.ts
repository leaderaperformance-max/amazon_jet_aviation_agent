import { getAdminClient } from '@/lib/supabase/admin'

export interface LeadInput {
  contact_id: string
  part_number: string
  quantity: string
  urgency: string
  customer_name?: string | null
  customer_phone?: string | null
  notes?: string | null
}

export interface Lead {
  id: string
  contact_id: string
  part_number: string
  quantity: string
  urgency: string
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  sent_to_seller_at: string
  status: 'pendente' | 'em_atendimento' | 'fechado_ganho' | 'fechado_perdido'
}

export async function createLead(input: LeadInput): Promise<Lead> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('leads')
    .insert({
      contact_id: input.contact_id,
      part_number: input.part_number,
      quantity: input.quantity,
      urgency: input.urgency,
      customer_name: input.customer_name ?? null,
      customer_phone: input.customer_phone ?? null,
      notes: input.notes ?? null,
      sent_to_seller_at: new Date().toISOString(),
      status: 'pendente',
    })
    .select()
    .single()

  if (error) throw error
  return data as Lead
}

export async function updateLeadStatus(id: string, status: Lead['status']): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', id)

  if (error) throw error
}
