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
