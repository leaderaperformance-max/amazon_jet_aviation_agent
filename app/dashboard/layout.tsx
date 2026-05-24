import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <div className="md:pl-[224px] flex flex-col min-h-dvh">
        <Topbar userEmail={user.email ?? null} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-10">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
