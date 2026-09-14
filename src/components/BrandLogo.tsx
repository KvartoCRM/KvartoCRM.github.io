import { useId } from 'react'
import clsx from 'clsx'

interface BrandLogoProps {
  className?: string
  markClassName?: string
  compact?: boolean
  inverse?: boolean
}

const BrandLogo = ({ className, markClassName, compact = false, inverse = false }: BrandLogoProps) => {
  const gradientId = `kvarto-gradient-${useId().replace(/:/g, '')}`

  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)} aria-label="KvartoCRM">
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-hidden="true"
        className={clsx('h-9 w-9 shrink-0 drop-shadow-[0_8px_18px_rgb(var(--lumi-accent-rgb)/0.25)]', markClassName)}
      >
        <defs>
          <linearGradient id={gradientId} x1="8" y1="6" x2="57" y2="59" gradientUnits="userSpaceOnUse">
            <stop stopColor="#168BFF" />
            <stop offset="0.52" stopColor="#4161F5" />
            <stop offset="1" stopColor="#8738F3" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${gradientId})`} />
        <path d="M21 16v32M24 32h7M31 32l14-15M31 32l15 16" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M43.5 16.5h4v8" fill="none" stroke="#7DE8FF" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className={clsx('whitespace-nowrap text-[1.32rem] font-semibold tracking-[-0.035em]', inverse ? 'text-white' : 'lumi-text')}>
          Kvarto<span className={clsx('font-light', inverse ? 'text-white/70' : 'lumi-muted-strong')}>CRM</span>
        </span>
      )}
    </span>
  )
}

export default BrandLogo
