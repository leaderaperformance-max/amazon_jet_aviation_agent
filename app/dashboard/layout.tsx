import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { LogoFull } from '@/components/brand/logo-full'
import { ThemeToggle } from '@/components/brand/theme-toggle'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="hover:opacity-80 transition-opacity">
              <LogoFull size="sm" />
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link href="/dashboard" className="px-3 py-1.5 rounded-md hover:bg-surface-2 transition-colors">
                Análise
              </Link>
              <Link href="/dashboard/contacts" className="px-3 py-1.5 rounded-md hover:bg-surface-2 transition-colors">
                Contatos
              </Link>
              <Link href="/dashboard/leads" className="px-3 py-1.5 rounded-md hover:bg-surface-2 transition-colors">
                Leads
              </Link>
              <Link href="/dashboard/email" className="px-3 py-1.5 rounded-md hover:bg-surface-2 transition-colors">
                Email
              </Link>
              <Link href="/dashboard/settings/openai" className="px-3 py-1.5 rounded-md hover:bg-surface-2 transition-colors">
                OpenAI
              </Link>
              <Link href="/dashboard/settings/users" className="px-3 py-1.5 rounded-md hover:bg-surface-2 transition-colors">
                Usuários
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
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
