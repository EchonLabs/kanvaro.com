'use client'

import React from 'react'

interface ProjectBudgetConsumptionCardProps {
  totalBudget: number
  actualSpend: number
  formatCurrency: (amount: number) => string
}

export function ProjectBudgetConsumptionCard({
  totalBudget,
  actualSpend,
  formatCurrency
}: ProjectBudgetConsumptionCardProps) {
  const remaining = Math.max(0, totalBudget - actualSpend)
  const utilizationPercent = totalBudget > 0 ? Math.min(100, Math.max(0, (actualSpend / totalBudget) * 100)) : 0
  const availablePercent = totalBudget > 0 ? Math.max(0, 100 - utilizationPercent) : 0

  return (
    <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            Project Budget Consumption
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time based on logged hours
          </p>
        </div>

        {/* Stats 3 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-1">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Budget</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
              {formatCurrency(totalBudget)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Actual Spend</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-500 dark:text-amber-400 mt-1">
              {formatCurrency(actualSpend)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Remaining</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

        {/* Progress Bar & Legend */}
        <div className="space-y-3 pt-1">
          <div className="h-3 sm:h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-600 shrink-0" />
              <span className="font-medium text-foreground">
                Budget Utilized: {formatCurrency(actualSpend)} ({utilizationPercent.toFixed(1)}%)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-200 dark:bg-slate-700 shrink-0" />
              <span className="font-medium text-muted-foreground">
                Available: {formatCurrency(remaining)} ({availablePercent.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Formula calculation note */}
        <div className="text-xs sm:text-sm text-muted-foreground pt-4 border-t border-border/60">
          {formatCurrency(totalBudget)} - {formatCurrency(actualSpend)} Actual Spend = {formatCurrency(remaining)} Remaining
        </div>
      </div>
    </div>
  )
}
