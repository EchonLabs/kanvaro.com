"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/Command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover"
import { timezoneOptions } from "@/lib/timezones"
import { cn } from "@/lib/utils"

interface TimezoneComboboxProps {
  id?: string
  value: string | null | undefined
  onChange: (timezone: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * A searchable timezone picker. The full IANA list is ~420 zones — too many to
 * scroll through in a plain select — so this filters as you type. Spaces match
 * underscores ("new york" finds America/New_York).
 *
 * The options come from `timezoneOptions`, the same list every timezone field
 * in the app uses, and a saved value outside that list still shows as selected.
 */
export function TimezoneCombobox({
  id,
  value,
  onChange,
  placeholder = "Select a timezone",
  disabled,
  className,
}: TimezoneComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()
  const zones = React.useMemo(() => timezoneOptions(value), [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          disabled={disabled}
          className={cn(
            // Mirrors SelectTrigger so the field sits naturally beside selects.
            "flex h-8 w-full items-center justify-between whitespace-nowrap",
            "rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)]",
            "bg-[var(--apple-tertiary-fill)] px-3 py-1.5 text-sm text-[var(--apple-label)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]/40 focus:border-[var(--apple-system-blue)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-all duration-150 ease-apple",
            className
          )}
        >
          <span
            className={cn(
              "truncate",
              !value && "text-[var(--apple-tertiary-label)]"
            )}
          >
            {value || placeholder}
          </span>
          <ChevronDownIcon className="ml-2 h-3.5 w-3.5 flex-shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={listId}
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0"
      >
        <Command>
          <CommandInput placeholder="Search timezones…" aria-label="Search timezones" />
          <CommandList className="max-h-64">
            <CommandEmpty>No timezone found.</CommandEmpty>
            {zones.map((zone) => (
              <CommandItem
                key={zone}
                value={zone}
                keywords={[zone.replace(/_/g, " ")]}
                onSelect={() => {
                  onChange(zone)
                  setOpen(false)
                }}
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4 flex-shrink-0",
                    zone === value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{zone}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
