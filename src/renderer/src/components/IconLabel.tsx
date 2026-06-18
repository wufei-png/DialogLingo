import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type Props = {
  icon: LucideIcon
  children: ReactNode
  className?: string
  iconClassName?: string
}

export function IconLabel(props: Props) {
  const Icon = props.icon

  return (
    <span className={['icon-label', props.className].filter(Boolean).join(' ')}>
      <Icon
        aria-hidden="true"
        className={['icon-label-glyph', props.iconClassName].filter(Boolean).join(' ')}
        size={16}
        strokeWidth={1.9}
      />
      <span className="icon-label-text">{props.children}</span>
    </span>
  )
}
