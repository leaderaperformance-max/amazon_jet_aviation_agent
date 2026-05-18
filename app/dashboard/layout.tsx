import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold">Amazon Jet Agent</Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="hover:underline">Inboxes</Link>
              <Link href="/dashboard/contacts" className="hover:underline">Contatos</Link>
              <Link href="/dashboard/settings/openai" className="hover:underline">OpenAI</Link>
              <Link href="/dashboard/settings/users" className="hover:underline">Usuários</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <form action="/api/auth/logout" method="POST">
              <Button type="submit" variant="outline" size="sm">Sair</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="container mx-auto py-8 flex-1">{children}</main>
    </div>
  )
}
