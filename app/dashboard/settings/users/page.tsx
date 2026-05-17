import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UsersManager } from '@/components/users-manager'

export default async function UsersPage() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getAdminClient()
  const { data } = await admin.auth.admin.listUsers()
  const users = data?.users.map(u => ({ id: u.id, email: u.email ?? '', created_at: u.created_at })) ?? []

  return (
    <Card>
      <CardHeader><CardTitle>Usuários Administradores</CardTitle></CardHeader>
      <CardContent>
        <UsersManager users={users} currentUserId={user!.id} />
      </CardContent>
    </Card>
  )
}
