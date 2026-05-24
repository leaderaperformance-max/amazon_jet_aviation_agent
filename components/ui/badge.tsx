import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'outline'

const VARIANT_CLASSES: Record<Variant, string> = {
  neutral: 'bg-surface-2 text-foreground/80 ring-border',
  brand: 'bg-brand-soft text-brand ring-brand/20',
  success: 'bg-success-soft text-success ring-success/20',
  warning: 'bg-warning-soft text-warning ring-warning/30',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  outline: 'bg-transparent text-muted-foreground ring-border',
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
  dot?: boolean
}

export function Badge({
  variant = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}
