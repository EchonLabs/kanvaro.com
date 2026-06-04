import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
  color?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, color, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

    return (
      <div
        ref={ref}
        className={cn(
          "relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]",
          className
        )}
        {...props}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            transform: `translateX(-${100 - percentage}%)`,
            backgroundColor: color || 'var(--apple-system-blue)',
          }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
