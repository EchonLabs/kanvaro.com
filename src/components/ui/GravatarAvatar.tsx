import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/lib/utils"
import { getAvatarData, GravatarOptions } from "@/lib/gravatar"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border-0 outline-none",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full border-0 outline-none ring-0", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

interface GravatarAvatarProps {
  user: {
    avatar?: string
    firstName?: string
    lastName?: string
    email?: string
  } | null | undefined
  size?: number
  className?: string
  gravatarOptions?: GravatarOptions
}

/**
 * Enhanced Avatar component with Gravatar support
 * Falls back to Gravatar if no custom avatar is set
 */
export function GravatarAvatar({ 
  user, 
  size = 40, 
  className,
  gravatarOptions = {}
}: GravatarAvatarProps) {
  const { avatarUrl, fallbackInitials } = getAvatarData(user, {
    size,
    ...gravatarOptions
  })

  return (
    <Avatar className={cn("h-10 w-10", className)} style={{ height: size, width: size }}>
      {avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'User avatar'}
        />
      )}
      <AvatarFallback className="text-sm font-medium">
        {fallbackInitials}
      </AvatarFallback>
    </Avatar>
  )
}

export { Avatar, AvatarImage, AvatarFallback }
