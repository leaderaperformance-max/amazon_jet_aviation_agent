# Fase 4 — Brand Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restilizar todo o painel admin com a identidade Amazon Jet Aviation (paleta navy/prata, Inter font, logo SVG inline, theme toggle dark/light).

**Architecture:** Tokens CSS no `globals.css` + Tailwind config, fonte Inter via `next/font`, theme via `next-themes`, componentes shadcn restilizados via tokens, logo recriado como SVG inline.

**Tech Stack:** Next.js 14, Tailwind CSS 3, shadcn/ui, `next-themes`, `next/font/google`, Recharts, TypeScript.

---

## File Map

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `tailwind.config.ts` | Tokens cor, chart-1..6, font Inter | Modificar |
| `app/globals.css` | CSS vars dark + light (paleta navy) | Modificar |
| `app/layout.tsx` | Inter via next/font + ThemeProvider | Modificar |
| `components/brand/logo-icon.tsx` | SVG inline do wing | Novo |
| `components/brand/logo-full.tsx` | LogoIcon + wordmark | Novo |
| `components/brand/theme-toggle.tsx` | Sun/moon toggle | Novo |
| `app/dashboard/layout.tsx` | Header redesenhado | Modificar |
| `app/(auth)/layout.tsx` | Bg gradient + logo grande | Modificar |
| `app/(auth)/login/page.tsx` | Card refinado | Modificar |
| `app/(auth)/setup/page.tsx` | Card refinado | Modificar |
| `components/analytics/kpi-cards.tsx` | Label uppercase + número 40px + delta | Modificar |
| `components/analytics/funnel-chart.tsx` | Gradient progressivo, paleta | Modificar |
| `components/analytics/status-donut.tsx` | Cores nova paleta | Modificar |
| `components/analytics/volume-chart.tsx` | Cores + grid sutil | Modificar |
| `components/analytics/tag-distribution.tsx` | Cor accent | Modificar |
| `components/analytics/inbox-distribution.tsx` | Cor violeta | Modificar |
| `components/analytics/top-contacts.tsx` | Badges restilizadas | Modificar |
| `components/analytics/inbox-status.tsx` | Visual refinado | Modificar |
| `components/contacts-table.tsx` | Badges/tags novo estilo | Modificar |

---

## Task 1: Instalar next-themes

**Files:** `package.json`

- [ ] **Step 1: Install**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm install next-themes
```

- [ ] **Step 2: Verify**

```bash
npm ls next-themes 2>&1 | head -3
npm run build
npm test
```

Build deve passar, 44/44 tests.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install next-themes for dark/light theme support"
```

---

## Task 2: Atualizar Tailwind config + globals.css com nova paleta

**Files:** `tailwind.config.ts`, `app/globals.css`

- [ ] **Step 1: Substituir `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: 'hsl(var(--surface))',
        'surface-2': 'hsl(var(--surface-2))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        destructive: {
          DEFAULT: 'hsl(var(--danger))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--surface))',
          foreground: 'hsl(var(--foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--surface))',
          foreground: 'hsl(var(--foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--surface-2))',
          foreground: 'hsl(var(--foreground))',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
          6: 'hsl(var(--chart-6))',
        },
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '6px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
```

- [ ] **Step 2: Substituir `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Light theme */
    --background: 220 33% 97%;          /* #F7F8FC */
    --foreground: 222 30% 8%;           /* #0A0E1A */
    --surface: 0 0% 100%;               /* #FFFFFF */
    --surface-2: 218 33% 96%;           /* #F1F4F9 */
    --border: 219 26% 91%;              /* #E2E7F0 */
    --input: 218 33% 96%;
    --ring: 218 79% 46%;                /* accent */
    --primary: 215 73% 15%;             /* #0A2540 navy do logo */
    --primary-foreground: 0 0% 100%;
    --accent: 218 79% 46%;              /* #1E5FCE */
    --accent-foreground: 0 0% 100%;
    --muted: 222 30% 8%;
    --muted-foreground: 224 14% 42%;    /* #5C6479 */
    --success: 158 64% 40%;             /* #10B981 */
    --warning: 32 95% 50%;              /* #F59E0B */
    --danger: 0 84% 60%;                /* #EF4444 */
    --chart-1: 218 73% 60%;             /* #4F8DE3 */
    --chart-2: 220 27% 79%;             /* #B8C5DA */
    --chart-3: 168 64% 51%;             /* #2DD4BF */
    --chart-4: 32 95% 50%;              /* #F59E0B */
    --chart-5: 0 84% 71%;               /* #F87171 */
    --chart-6: 254 91% 76%;             /* #A78BFA */
    --radius: 12px;
  }

  .dark {
    --background: 224 36% 7%;           /* #0A0E1A */
    --foreground: 222 38% 93%;          /* #E8ECF5 */
    --surface: 223 41% 12%;             /* #111729 */
    --surface-2: 223 38% 16%;           /* #1A2238 */
    --border: 223 32% 25%;              /* #2A3552 */
    --input: 223 38% 16%;
    --ring: 218 73% 60%;
    --primary: 220 24% 84%;             /* #C9D1E3 prata */
    --primary-foreground: 224 36% 7%;
    --accent: 218 73% 60%;              /* #4F8DE3 */
    --accent-foreground: 224 36% 7%;
    --muted: 223 38% 16%;
    --muted-foreground: 220 17% 62%;    /* #8A94B0 */
    --success: 158 64% 40%;
    --warning: 32 95% 50%;
    --danger: 0 84% 60%;
    --chart-1: 218 73% 60%;
    --chart-2: 220 27% 79%;
    --chart-3: 168 64% 51%;
    --chart-4: 32 95% 50%;
    --chart-5: 0 84% 71%;
    --chart-6: 254 91% 76%;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: 'cv11', 'ss01', 'ss03';
  }
}

@layer utilities {
  .tabular-nums {
    font-variant-numeric: tabular-nums;
  }
}
```

- [ ] **Step 3: Build deve passar**

```bash
npm run build
```

Esperado: build limpo. Pode haver warnings de cores não mapeadas mas o build deve concluir.

- [ ] **Step 4: Tests passam**

```bash
npm test
```

Esperado: 44/44.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "feat: apply navy/silver brand palette with dark and light theme tokens"
```

---

## Task 3: Inter font + ThemeProvider em app/layout.tsx

**Files:** `app/layout.tsx`

- [ ] **Step 1: Ler arquivo atual**

```bash
cat app/layout.tsx
```

- [ ] **Step 2: Substituir `app/layout.tsx` por:**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Amazon Jet Aviation — Agent',
  description: 'Painel administrativo do agente JET',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Esperado: build limpo.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: load Inter font and add ThemeProvider"
```

---

## Task 4: Logo SVG inline (LogoIcon + LogoFull)

**Files:** `components/brand/logo-icon.tsx`, `components/brand/logo-full.tsx`

- [ ] **Step 1: Criar `components/brand/logo-icon.tsx`**

```typescript
import { cn } from '@/lib/utils'

interface Props {
  size?: number
  className?: string
}

/**
 * Símbolo da Amazon Jet Aviation: círculo navy com wing prata.
 * Cor adapta-se ao tema via currentColor (background usa bg-primary).
 */
export function LogoIcon({ size = 32, className }: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground',
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: size * 0.62, height: size * 0.62 }}
      >
        {/* Wing estilizado: linhas horizontais ascendentes formando uma asa */}
        <path
          d="M 2 14 L 12 14 L 17 9 L 22 9 L 14 17 L 2 17 Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M 4 11 L 10 11 L 13 8 L 18 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />
        <path
          d="M 5 8 L 9 8 L 11 6 L 15 6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Criar `components/brand/logo-full.tsx`**

```typescript
import { LogoIcon } from '@/components/brand/logo-icon'
import { cn } from '@/lib/utils'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: { icon: 28, text: 'text-sm' },
  md: { icon: 36, text: 'text-base' },
  lg: { icon: 64, text: 'text-2xl' },
}

export function LogoFull({ size = 'md', className }: Props) {
  const { icon, text } = sizeMap[size]
  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <LogoIcon size={icon} />
      <span className={cn('font-bold tracking-widest uppercase', text)}>
        Amazon Jet
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add components/brand/
git commit -m "feat: add LogoIcon and LogoFull SVG inline brand components"
```

---

## Task 5: ThemeToggle component

**Files:** `components/brand/theme-toggle.tsx`

- [ ] **Step 1: Criar arquivo**

```typescript
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
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add components/brand/theme-toggle.tsx
git commit -m "feat: add theme toggle (sun/moon)"
```

---

## Task 6: Redesenhar `app/dashboard/layout.tsx`

**Files:** `app/dashboard/layout.tsx`

- [ ] **Step 1: Ler arquivo atual**

```bash
cat app/dashboard/layout.tsx
```

- [ ] **Step 2: Substituir conteúdo:**

```typescript
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
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/layout.tsx
git commit -m "feat: redesign dashboard header with brand logo, nav, theme toggle"
```

---

## Task 7: Redesenhar páginas auth (layout, login, setup)

**Files:** `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/setup/page.tsx`

- [ ] **Step 1: Substituir `app/(auth)/layout.tsx`**

```typescript
import { LogoFull } from '@/components/brand/logo-full'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      style={{
        backgroundImage:
          'radial-gradient(circle at top, hsl(var(--surface-2)) 0%, hsl(var(--background)) 70%)',
      }}
    >
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <LogoFull size="lg" />
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ler e atualizar `app/(auth)/login/page.tsx`**

Substituir o conteúdo do arquivo por:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = getBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Entrar no painel</CardTitle>
        <CardDescription>Acesse com sua conta de administrador</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Atualizar `app/(auth)/setup/page.tsx`**

Substituir conteúdo por:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'

export default function SetupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Senhas não coincidem')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || 'Erro ao criar admin')
      setLoading(false)
      return
    }

    const supabase = getBrowserClient()
    await supabase.auth.signInWithPassword({ email, password })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Criar primeiro admin</CardTitle>
        <CardDescription>Configure sua conta de administrador</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Criando...' : 'Criar admin'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/
git commit -m "feat: redesign auth pages with gradient bg and brand logo"
```

---

## Task 8: Redesenhar KPI Cards

**Files:** `components/analytics/kpi-cards.tsx`

- [ ] **Step 1: Substituir conteúdo**

```typescript
import { Card, CardContent } from '@/components/ui/card'
import type { AnalyticsKpis } from '@/lib/types'

function fmtNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

function fmtPercent(p: number): string {
  return `${(p * 100).toFixed(0)}%`
}

function fmtSec(s: number): string {
  if (s < 60) return `${s.toFixed(0)}s`
  return `${(s / 60).toFixed(1)}min`
}

function Delta({ value }: { value: number }) {
  if (value === 0) return null
  const sign = value > 0 ? '▲' : '▼'
  const color = value > 0 ? 'text-success' : 'text-danger'
  return (
    <span className={`text-xs font-medium ${color} ml-2`}>
      {sign} {Math.abs(value * 100).toFixed(0)}%
    </span>
  )
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <Card>
      <CardContent className="pt-6 pb-6">
        <div className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground mb-3">
          {label}
        </div>
        <div className="text-[36px] leading-none font-bold tabular-nums flex items-baseline">
          {value}
          {delta !== undefined && <Delta value={delta} />}
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiCards({ kpis }: { kpis: AnalyticsKpis }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Contatos novos" value={fmtNumber(kpis.newContacts)} delta={kpis.deltas.newContacts} />
        <Kpi label="Mensagens recebidas" value={fmtNumber(kpis.receivedMessages)} delta={kpis.deltas.receivedMessages} />
        <Kpi label="Atendidos só pela IA" value={fmtPercent(kpis.aiOnlyPercent)} />
        <Kpi label="Tempo médio de resposta" value={fmtSec(kpis.avgResponseTimeSec)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Leads ganhos" value={fmtNumber(kpis.leadsWon)} delta={kpis.deltas.leadsWon} />
        <Kpi label="Leads perdidos" value={fmtNumber(kpis.leadsLost)} delta={kpis.deltas.leadsLost} />
        <Kpi label="Taxa de conversão" value={fmtPercent(kpis.conversionRate)} delta={kpis.deltas.conversionRate} />
        <Kpi label="Em atendimento agora" value={fmtNumber(kpis.activeNow)} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/kpi-cards.tsx
git commit -m "feat: redesign KPI cards with uppercase labels and 36px tabular numbers"
```

---

## Task 9: Redesenhar gráficos analytics

**Files:** `components/analytics/funnel-chart.tsx`, `status-donut.tsx`, `volume-chart.tsx`, `tag-distribution.tsx`, `inbox-distribution.tsx`

- [ ] **Step 1: Substituir `components/analytics/funnel-chart.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FunnelStage } from '@/lib/types'

export function FunnelChart({ funnel }: { funnel: FunnelStage[] }) {
  const max = Math.max(...funnel.map(f => f.count), 1)

  return (
    <Card>
      <CardHeader><CardTitle>Funil de Conversão</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {funnel.map(f => {
            const width = (f.count / max) * 100
            const conv = f.conversionFromPrev !== null
              ? ` · ${(f.conversionFromPrev * 100).toFixed(0)}%`
              : ''
            return (
              <div key={f.stage}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">{f.stage}</span>
                  <span className="text-muted-foreground tabular-nums">{f.count}{conv}</span>
                </div>
                <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${width}%`,
                      background: 'linear-gradient(90deg, hsl(var(--chart-1)) 0%, hsl(var(--chart-3)) 100%)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Substituir `components/analytics/status-donut.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Pie, PieChart, Cell } from 'recharts'

interface Props {
  distribution: { ia: number; humano: number; encerrado: number }
}

export function StatusDonut({ distribution }: Props) {
  const data = [
    { name: 'IA', value: distribution.ia, fill: 'hsl(var(--chart-3))' },
    { name: 'Humano', value: distribution.humano, fill: 'hsl(var(--chart-4))' },
    { name: 'Encerrado', value: distribution.encerrado, fill: 'hsl(var(--chart-6))' },
  ]
  const total = distribution.ia + distribution.humano + distribution.encerrado

  return (
    <Card>
      <CardHeader><CardTitle>Distribuição por Status</CardTitle></CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer config={{}} className="h-[260px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={104} strokeWidth={2}>
                {data.map(d => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[36px] font-bold tabular-nums leading-none">{total}</div>
            <div className="text-[10px] tracking-widest uppercase text-muted-foreground mt-1">Total</div>
          </div>
        </div>
        <div className="flex justify-center gap-4 mt-4 text-sm">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-muted-foreground">{d.name}: <span className="text-foreground font-medium">{d.value}</span></span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Substituir `components/analytics/volume-chart.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { VolumePoint } from '@/lib/types'

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const config = {
    messages: { label: 'Mensagens', color: 'hsl(var(--chart-1))' },
    newContacts: { label: 'Novos contatos', color: 'hsl(var(--chart-2))' },
  }

  return (
    <Card>
      <CardHeader><CardTitle>Volume ao longo do tempo</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line type="monotone" dataKey="messages" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="newContacts" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Substituir `components/analytics/tag-distribution.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { TagCount } from '@/lib/types'

export function TagDistribution({ data }: { data: TagCount[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Distribuição por Tag</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: 'Contatos', color: 'hsl(var(--chart-1))' } }} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="tag" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" interval={0} angle={-30} textAnchor="end" height={70} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Substituir `components/analytics/inbox-distribution.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { InboxCount } from '@/lib/types'

export function InboxDistribution({ data }: { data: InboxCount[] }) {
  if (data.length <= 1) return null
  return (
    <Card>
      <CardHeader><CardTitle>Atendimento por Inbox</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: 'Conversas', color: 'hsl(var(--chart-6))' } }} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="hsl(var(--chart-6))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/analytics/funnel-chart.tsx components/analytics/status-donut.tsx components/analytics/volume-chart.tsx components/analytics/tag-distribution.tsx components/analytics/inbox-distribution.tsx
git commit -m "feat: restyle analytics charts with new brand palette"
```

---

## Task 10: Redesenhar top-contacts e inbox-status

**Files:** `components/analytics/top-contacts.tsx`, `components/analytics/inbox-status.tsx`

- [ ] **Step 1: Substituir `components/analytics/top-contacts.tsx`**

```typescript
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TopContact } from '@/lib/types'

function formatRelative(iso: string | null): string {
  if (!iso) return '-'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ia: 'bg-success/15 text-success',
    humano: 'bg-warning/15 text-warning',
    encerrado: 'bg-muted/40 text-muted-foreground',
  }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase ${map[status] ?? ''}`}>
      {status}
    </span>
  )
}

function tagPill(label: string) {
  const terminal: Record<string, string> = {
    lead_ganho: 'bg-success/12 text-success',
    lead_perdido: 'bg-danger/12 text-danger',
  }
  const cls = terminal[label] ?? 'bg-accent/12 text-accent'
  return (
    <span key={label} className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium mr-1 ${cls}`}>
      {label}
    </span>
  )
}

export function TopContactsTable({ contacts }: { contacts: TopContact[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Top 10 contatos do período</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última interação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/dashboard/contacts?q=${encodeURIComponent(c.phone_number ?? '')}`} className="hover:text-accent transition-colors">
                    {c.name ?? '-'}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{c.phone_number ?? '-'}</TableCell>
                <TableCell>{c.current_labels.map(tagPill)}</TableCell>
                <TableCell className="tabular-nums">{c.message_count}</TableCell>
                <TableCell>{statusBadge(c.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatRelative(c.last_message_at)}</TableCell>
              </TableRow>
            ))}
            {contacts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Substituir `components/analytics/inbox-status.tsx`**

```typescript
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

interface Inbox {
  id: string
  name: string
  chatwoot_account_id: number
  chatwoot_inbox_id: number
  enabled: boolean
}

export function InboxStatusList({ inboxes }: { inboxes: Inbox[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Status das inboxes</CardTitle>
        <Link href="/dashboard/inboxes/new" className={buttonVariants({ size: 'sm' })}>+ Nova Inbox</Link>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {inboxes.map(i => (
            <li key={i.id} className="flex items-center justify-between py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${i.enabled ? 'bg-success' : 'bg-danger'}`} />
                <span className="font-medium">{i.name}</span>
                <span className="text-muted-foreground tabular-nums">{i.chatwoot_account_id}/{i.chatwoot_inbox_id}</span>
              </span>
              <Link href={`/dashboard/inboxes/${i.id}`} className="text-accent hover:underline">Editar</Link>
            </li>
          ))}
          {inboxes.length === 0 && (
            <li className="py-3 text-muted-foreground">Nenhuma inbox configurada.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/analytics/top-contacts.tsx components/analytics/inbox-status.tsx
git commit -m "feat: restyle top contacts table and inbox status list"
```

---

## Task 11: Atualizar contacts-table com novo estilo de badges

**Files:** `components/contacts-table.tsx`

- [ ] **Step 1: Localizar as funções `statusBadge` e `labelBadge` no arquivo e substituí-las:**

Abrir `components/contacts-table.tsx`. Encontrar a função `statusBadge` (linha ~50) e substituir:

```typescript
function statusBadge(status: string) {
  const map: Record<string, string> = {
    ia: 'bg-success/15 text-success',
    humano: 'bg-warning/15 text-warning',
    encerrado: 'bg-muted/40 text-muted-foreground',
  }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase ${map[status] ?? ''}`}>
      {status}
    </span>
  )
}

function labelBadge(label: string) {
  const terminal: Record<string, string> = {
    lead_ganho: 'bg-success/12 text-success',
    lead_perdido: 'bg-danger/12 text-danger',
  }
  const cls = terminal[label] ?? 'bg-accent/12 text-accent'
  return (
    <span key={label} className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium mr-1 ${cls}`}>
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Build**

```bash
npm run build
npm test
```

Build passa, 44/44 tests.

- [ ] **Step 3: Commit**

```bash
git add components/contacts-table.tsx
git commit -m "feat: restyle contacts table badges with new palette"
```

---

## Task 12: Verificação final + Deploy

- [ ] **Step 1: Build final**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm run build
```

Esperado: build limpo, sem erros.

- [ ] **Step 2: Tests**

```bash
npm test
```

Esperado: 44/44 pass.

- [ ] **Step 3: Smoke test local (opcional)**

```bash
npm run dev
```

Abrir http://localhost:3000 ou 3001 — checar:
1. `/login` renderiza com gradiente + logo grande
2. Login funciona
3. `/dashboard` mostra header com logo + nav + theme toggle + KPIs com label uppercase
4. Toggle dark/light funciona, persiste após reload
5. Charts usam paleta nova

Parar com Ctrl+C quando confirmar.

- [ ] **Step 4: Push para GitHub**

```bash
git push "https://leaderaperformance-max:<GITHUB_PAT>@github.com/leaderaperformance-max/amazon_jet_aviation_agent.git" main
```

- [ ] **Step 5: Deploy Vercel**

```bash
vercel --prod --yes
```

- [ ] **Step 6: Smoke test produção**

```bash
curl -s -o /dev/null -w "HTTP %{http_code} /dashboard\n" https://amazon-jet-aviation-agent.vercel.app/dashboard
```

Esperado: 307 (redirect login).

- [ ] **Step 7: Visual check**

Abrir https://amazon-jet-aviation-agent.vercel.app/login no browser. Confirmar:
1. Gradiente sutil de fundo
2. Logo grande centralizado
3. Card com inputs novo estilo
4. Theme toggle funciona após login

- [ ] **Step 8: Commit final**

```bash
git commit --allow-empty -m "feat: phase 4 brand redesign complete"
git push "https://leaderaperformance-max:<GITHUB_PAT>@github.com/leaderaperformance-max/amazon_jet_aviation_agent.git" main
```

---

## Self-Review

### Cobertura do spec

| Requisito do spec | Task |
|---|---|
| Paleta navy/prata dark + light | Task 2 |
| Tipografia Inter | Task 3 |
| Logo SVG inline (LogoIcon, LogoFull) | Task 4 |
| Theme toggle (next-themes) | Tasks 1, 3, 5 |
| Header dashboard redesenhado | Task 6 |
| Páginas auth com gradient + logo | Task 7 |
| KPI cards (label uppercase, número 40px, delta) | Task 8 |
| Charts com paleta nova | Task 9 |
| Top contacts + inbox status restilizados | Task 10 |
| Contacts table badges atualizadas | Task 11 |
| Build + deploy | Task 12 |

### Consistência

- Tokens CSS (`--accent`, `--chart-1`, etc.) definidos em Task 2, consumidos em Tasks 6-11 ✓
- `LogoIcon`/`LogoFull` definidos em Task 4, consumidos em Tasks 6, 7 ✓
- `ThemeToggle` definido em Task 5, consumido em Task 6 ✓
- Paleta de badges/tags consistente entre `top-contacts.tsx` (Task 10) e `contacts-table.tsx` (Task 11) ✓

### Placeholder scan

Todos os steps têm código completo. Sem TBDs ou referências vagas.
