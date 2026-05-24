import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/brand/theme-toggle'
import { LogOut } from 'lucide-react'

interface TopbarProps {
  userEmail: string | null
}

export function Topbar({ userEmail }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="flex h-full items-center justify-end gap-3 px-4 md:px-6">
        <ThemeToggle />
        {userEmail && (
          <span className="hidden sm:inline-block text-sm text-muted-foreground">{userEmail}</span>
        )}
        <form action="/api/auth/logout" method="POST">
          <Button type="submit" variant="ghost" size="sm">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </form>
      </div>
    </header>
  )
}
