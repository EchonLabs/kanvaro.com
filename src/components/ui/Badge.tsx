import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center border-0 px-2.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-[var(--apple-radius-pill)]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--apple-system-blue)]/15 text-[var(--apple-system-blue)]",
        secondary:
          "bg-[var(--apple-secondary-fill)] text-[var(--apple-label)]",
        destructive:
          "bg-[var(--apple-system-red)]/15 text-[var(--apple-system-red)]",
        outline:
          "border border-[var(--apple-separator)] text-[var(--apple-secondary-label)] bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    )
  }
)

Badge.displayName = "Badge"

export { Badge, badgeVariants }
