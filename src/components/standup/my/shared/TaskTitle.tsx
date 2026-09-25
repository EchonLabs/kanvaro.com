import { cn } from '@/lib/utils'

export interface TaskTitleProps {
  taskKey?: string
  title?: string
  className?: string
}

/**
 * The design's "[ARD-293] Integrate core model…" line. The key sits in its own
 * element so it stays findable on its own (tests, and anyone scanning keys).
 */
export function TaskTitle({ taskKey, title, className }: TaskTitleProps) {
  return (
    <p className={cn('min-w-0 truncate text-[14px] font-medium text-[var(--my-text)]', className)}>
      {taskKey ? (
        <>
          [<span>{taskKey}</span>]{title ? ' ' : ''}
        </>
      ) : null}
      {title}
    </p>
  )
}
