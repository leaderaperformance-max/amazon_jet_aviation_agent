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
