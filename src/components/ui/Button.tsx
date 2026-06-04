import * as React from "react"
import { Slot } from "./Slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--apple-system-blue)] text-white hover:opacity-90 rounded-[var(--apple-radius-pill)]",
        destructive:
          "bg-[var(--apple-system-red)] text-white hover:opacity-90 rounded-[var(--apple-radius-pill)]",
        outline:
          "border border-[var(--apple-separator)] bg-transparent hover:bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] rounded-[var(--apple-radius-pill)]",
        secondary:
          "bg-[var(--apple-secondary-fill)] text-[var(--apple-label)] hover:bg-[var(--apple-fill)] rounded-[var(--apple-radius-pill)]",
        ghost:
          "hover:bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] rounded-[var(--apple-radius-md)]",
        link: "text-[var(--apple-system-blue)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
