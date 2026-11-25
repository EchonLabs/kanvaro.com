'use client'

import { Search } from 'lucide-react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { ActiveProject, SheetStatusFilter } from './api'

export interface FilterState {
  q: string
  role: string
  project: string
  status: SheetStatusFilter | ''
}

interface Props {
  value: FilterState
  roles: string[]
  projects: ActiveProject[]
  onChange(next: FilterState): void
}

const ALL = '__all__'

const STATUS_OPTIONS: { value: SheetStatusFilter; label: string }[] = [
  { value: 'full', label: 'Fully Allocated' },
  { value: 'partial', label: 'Partially Allocated' },
  { value: 'unallocated', label: 'Unallocated' },
  { value: 'pending', label: 'Allocation Pending' },
  { value: 'over', label: 'Overallocated' }
]

export function AllocationFilters({ value, roles, projects, onChange }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch })

  return (
    <div className="flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-3 md:flex-row md:items-center">
      <label className="relative flex-1">
        <span className="sr-only">Search resources</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]"
        />
        <input
          type="search"
          value={value.q}
          onChange={(event) => set({ q: event.target.value })}
          placeholder="Search resources..."
          className="h-10 w-full rounded-[var(--apple-radius-pill)] border border-[var(--apple-separator)] bg-transparent pl-9 pr-3 text-[14px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)]"
        />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:flex">
        <Select value={value.role || ALL} onValueChange={(next) => set({ role: next === ALL ? '' : next })}>
          <SelectTrigger aria-label="Filter by role" className="md:w-44">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value.project || ALL} onValueChange={(next) => set({ project: next === ALL ? '' : next })}>
          <SelectTrigger aria-label="Filter by project" className="md:w-44">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project._id} value={project._id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={value.status || ALL}
          onValueChange={(next) => set({ status: next === ALL ? '' : (next as SheetStatusFilter) })}
        >
          <SelectTrigger aria-label="Filter by status" className="md:w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
