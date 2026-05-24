import { cn } from '@/lib/utils'

interface SectionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  actions?: React.ReactNode
  padded?: boolean
  children?: React.ReactNode
}

/**
 * Standard surface card used across the dashboard. Provides an optional
 * header row with title/description on the left and actions on the right.
 * Set `padded={false}` for tables and lists that should hug the edges.
 */
export function SectionCard({
  title,
  description,
  actions,
  padded = true,
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-surface shadow-xs',
        className,
      )}
      {...props}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="space-y-0.5">
            {title && (
              <h2 className="text-sm font-semibold leading-none text-foreground">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(padded ? 'p-5' : '')}>{children}</div>
    </section>
  )
}
