'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Users,
  ListChecks,
  Mail,
  Settings,
  UserCog,
  Plane,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Análise', href: '/dashboard', icon: BarChart3, exact: true },
  { label: 'Contatos', href: '/dashboard/contacts', icon: Users },
  { label: 'Leads', href: '/dashboard/leads', icon: ListChecks },
  { label: 'Email', href: '/dashboard/email', icon: Mail },
]

const SETTINGS_NAV: NavItem[] = [
  { label: 'OpenAI', href: '/dashboard/settings/openai', icon: Settings },
  { label: 'Usuários', href: '/dashboard/settings/users', icon: UserCog },
]

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'group/nav flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        active
          ? 'bg-brand-soft text-brand font-medium'
          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          active ? 'text-brand' : 'text-muted-foreground group-hover/nav:text-foreground',
        )}
      />
      <span>{item.label}</span>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 md:w-[224px] flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <Plane className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Amazon Jet</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Aviation Agent</span>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        <div className="space-y-0.5">
          {PRIMARY_NAV.map(item => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </div>

        <div className="mt-6 mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Configurações
        </div>
        <div className="space-y-0.5">
          {SETTINGS_NAV.map(item => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </div>
      </nav>
    </aside>
  )
}
