import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = getAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (error) return NextResponse.json({ hasUsers: false }, { status: 500 })
  return NextResponse.json({ hasUsers: data.users.length > 0 })
}
