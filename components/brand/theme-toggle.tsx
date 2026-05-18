'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <Button variant="ghost" size="sm" className="w-9 h-9 p-0" aria-label="Tema" />
  }

  const current = theme === 'system' ? resolvedTheme : theme
  const toggle = () => setTheme(current === 'dark' ? 'light' : 'dark')

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-9 h-9 p-0"
      onClick={toggle}
      aria-label="Alternar tema"
    >
      {current === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  )
}
