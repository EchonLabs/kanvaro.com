"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons"

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

/* ── Trigger ─────────────────────────────────────────────────────────────── */
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base
      "flex h-8 w-full items-center justify-between whitespace-nowrap",
      // Apple HIG: sm radius, separator border, tertiary fill bg
      "rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)]",
      "bg-[var(--apple-tertiary-fill)] px-3 py-1.5 text-sm text-[var(--apple-label)]",
      // Placeholder
      "data-[placeholder]:text-[var(--apple-tertiary-label)]",
      // Focus
      "focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]/40 focus:border-[var(--apple-system-blue)]",
      // Disabled
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Smooth
      "transition-all duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
      "[&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="h-3.5 w-3.5 opacity-50 flex-shrink-0 ml-2" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

/* ── Scroll buttons ──────────────────────────────────────────────────────── */
const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUpIcon className="h-4 w-4 text-[var(--apple-secondary-label)]" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDownIcon className="h-4 w-4 text-[var(--apple-secondary-label)]" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

/* ── Content (dropdown panel) ────────────────────────────────────────────── */
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        // Radix manages internal scroll via ScrollUp/DownButton.
        // We omit overflow-y-auto so the panel never grows its own scrollbar —
        // each usage adds a scrollable inner list div if needed (one scrollbar total).
        "relative z-50 min-w-[8rem] overflow-hidden",
        // Apple HIG surface
        "rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)]",
        "bg-[var(--apple-system-background)] dark:bg-[#2C2C2E]",
        "text-[var(--apple-label)]",
        // Layered shadow
        "shadow-[0_4px_24px_rgba(0,0,0,0.10),0_1px_6px_rgba(0,0,0,0.06)]",
        "dark:shadow-[0_4px_32px_rgba(0,0,0,0.45),0_1px_8px_rgba(0,0,0,0.30)]",
        // Radix open/close transitions — snappy 150 ms
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
        "data-[side=left]:slide-in-from-right-2  data-[side=right]:slide-in-from-left-2",
        "duration-150",
        "origin-[--radix-select-content-transform-origin]",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

/* ── Label ───────────────────────────────────────────────────────────────── */
const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-xs font-semibold text-[var(--apple-secondary-label)] uppercase tracking-wide", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

/* ── Item ────────────────────────────────────────────────────────────────── */
const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center",
      "rounded-[var(--apple-radius-sm)] py-2 pl-3 pr-8 text-sm text-[var(--apple-label)]",
      "outline-none transition-colors duration-100",
      // Hover / keyboard focus
      "focus:bg-[var(--apple-system-blue)]/10 focus:text-[var(--apple-system-blue)]",
      "data-[highlighted]:bg-[var(--apple-system-blue)]/10 data-[highlighted]:text-[var(--apple-system-blue)]",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    {/* Selected checkmark — right-aligned */}
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="h-4 w-4 text-[var(--apple-system-blue)]" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

/* ── Separator ───────────────────────────────────────────────────────────── */
const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-[var(--apple-separator)]", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
