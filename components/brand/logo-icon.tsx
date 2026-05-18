import { cn } from '@/lib/utils'

interface Props {
  size?: number
  className?: string
}

/**
 * Símbolo da Amazon Jet Aviation: círculo navy com wing prata.
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
