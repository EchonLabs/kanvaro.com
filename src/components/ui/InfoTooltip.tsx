"use client"

import { Info } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface InfoTooltipProps {
  id?: string          // used for a permanent sr-only span's id, for aria-describedby targets
  content: string
  className?: string
  iconClassName?: string
}

export function InfoTooltip({ id, content, className, iconClassName }: InfoTooltipProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={content} className={className}>
            <Info className={iconClassName ?? 'h-3.5 w-3.5 text-[var(--apple-tertiary-label)]'} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
      {id ? (
        <span id={id} className="sr-only">
          {content}
        </span>
      ) : null}
    </>
  )
}
