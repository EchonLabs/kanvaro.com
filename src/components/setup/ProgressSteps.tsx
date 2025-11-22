'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  id: string
  title: string
  icon: any
}

interface ProgressStepsProps {
  steps: Step[]
  currentStep: string
}

export const ProgressSteps = ({ steps, currentStep }: ProgressStepsProps) => {
  const currentIndex = steps.findIndex(step => step.id === currentStep)

  return (
    <nav aria-label="Setup progress" className="w-full">
      {/* Desktop Vertical Layout */}
      <ol className="hidden lg:flex flex-col space-y-4">
        {steps.map((step, stepIdx) => {
          const Icon = step.icon
          const isCompleted = stepIdx < currentIndex
          const isCurrent = step.id === currentStep
          const isUpcoming = stepIdx > currentIndex

          return (
            <li key={step.id} className="flex items-center space-x-4 relative">
              {/* Step Circle */}
              <div className="relative z-10 flex-shrink-0">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-200',
                    {
                      'border-primary bg-primary text-primary-foreground shadow-lg': isCompleted,
                      'border-primary bg-background text-primary shadow-lg ring-4 ring-primary/20': isCurrent,
                      'border-muted-foreground/30 bg-background text-muted-foreground': isUpcoming,
                    }
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                
                {/* Step Number */}
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border-2 border-current flex items-center justify-center text-xs font-semibold">
                  {stepIdx + 1}
                </div>
              </div>

              {/* Step Title */}
              <div className="flex-1">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors duration-200',
                    {
                      'text-primary': isCurrent,
                      'text-muted-foreground': isUpcoming,
                      'text-foreground': isCompleted,
                    }
                  )}
                >
                  {step.title}
                </span>
              </div>

              {/* Connector Line - Only show if not the last step */}
              {stepIdx < steps.length - 1 && (
                <div 
                  className={cn(
                    'absolute left-5 w-0.5 transition-colors duration-200 z-0',
                    {
                      'bg-primary': isCompleted,
                      'bg-muted-foreground/30': !isCompleted,
                    }
                  )}
                  style={{ 
                    top: '2.5rem',
                    height: '2.5rem'
                  }}
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* Mobile Horizontal Layout */}
      <ol className="lg:hidden grid grid-cols-2 sm:grid-cols-3 gap-3">
        {steps.map((step, stepIdx) => {
          const Icon = step.icon
          const isCompleted = stepIdx < currentIndex
          const isCurrent = step.id === currentStep
          const isUpcoming = stepIdx > currentIndex

          return (
            <li key={step.id} className="flex flex-col items-center space-y-2 rounded-lg border p-3 bg-background">
              {/* Step Circle */}
              <div className="relative flex items-center justify-center">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-200',
                    {
                      'border-primary bg-primary text-primary-foreground shadow-lg': isCompleted,
                      'border-primary bg-background text-primary shadow-lg ring-4 ring-primary/20': isCurrent,
                      'border-muted-foreground/30 bg-background text-muted-foreground': isUpcoming,
                    }
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                
                {/* Step Number */}
                <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background border border-current flex items-center justify-center text-[10px] font-semibold">
                  {stepIdx + 1}
                </div>
              </div>

              {/* Step Title */}
              <div className="text-center w-full">
                <span
                  className={cn(
                    'text-xs font-medium transition-colors duration-200 block leading-tight break-words',
                    {
                      'text-primary': isCurrent,
                      'text-muted-foreground': isUpcoming,
                      'text-foreground': isCompleted,
                    }
                  )}
                >
                  {step.title}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
