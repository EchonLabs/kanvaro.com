'use client'

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Search, X, Filter, ChevronDown, Clock, User, Folder, CheckSquare, Target, Users, Calendar, ArrowRight, Command } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Separator } from '@/components/ui/Separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import {
  Command as CommandPrimitive,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/Command'
import { useGlobalSearch, SearchResult, SearchFilters } from '@/hooks/useGlobalSearch'
import { KeyboardShortcuts } from './KeyboardShortcuts'

interface GlobalSearchProps {
  className?: string
  placeholder?: string
}

const typeIcons = {
  project: Folder,
  task: CheckSquare,
  story: Target,
  epic: Target,
  sprint: Calendar,
  user: User,
}

const typeColors = {
  project: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  task: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  story: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  epic: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  sprint: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  user: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
}

const statusColors = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
}

const priorityColors = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}

export function GlobalSearch({ className, placeholder = "Search projects, tasks, users..." }: GlobalSearchProps) {
  const {
    query,
    results,
    isLoading,
    error,
    total,
    aggregations,
    suggestions,
    filters,
    isOpen,
    selectedIndex,
    setQuery,
    setFilters,
    clearSearch,
    openSearch,
    closeSearch,
    selectNext,
    selectPrevious,
    selectResult,
    navigateToResult,
  } = useGlobalSearch()

  const [showFilters, setShowFilters] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          selectNext()
          break
        case 'ArrowUp':
          e.preventDefault()
          selectPrevious()
          break
        case 'Enter':
          e.preventDefault()
          if (selectedIndex >= 0 && results[selectedIndex]) {
            navigateToResult(results[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          closeSearch()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown as any)
    return () => document.removeEventListener('keydown', handleKeyDown as any)
  }, [isOpen, selectedIndex, results, selectNext, selectPrevious, navigateToResult, closeSearch])

  // Global keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) {
          closeSearch()
        } else {
          openSearch()
          inputRef.current?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown as any)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown as any)
  }, [isOpen, openSearch, closeSearch])

  const handleInputChange = (value: string) => {
    setQuery(value)
    setShowSuggestions(value.length > 0)
  }

  const handleInputFocus = () => {
    openSearch()
    setShowSuggestions(query.length > 0)
  }

  const handleInputBlur = () => {
    // Delay closing to allow clicking on results
    setTimeout(() => {
      setShowSuggestions(false)
    }, 200)
  }

  const handleInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const q = query.trim()
    const isProjectNumber = /^\d+$/.test(q)
    const isTaskDisplayId = /^\d+\.\d+$/.test(q)
    if (!isProjectNumber && !isTaskDisplayId) return
    e.preventDefault()
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=1`)
      if (!resp.ok) return
      const data = await resp.json()
      if (data?.results?.length) {
        const first = data.results[0]
        window.location.href = first.url
        closeSearch()
      }
    } catch {
      // no-op
    }
  }

  const handleFilterChange = (filterType: keyof SearchFilters, value: string) => {
    const currentFilters = { ...filters }
    const currentValues = currentFilters[filterType] || []
    
    if (Array.isArray(currentValues) && currentValues.includes(value)) {
      (currentFilters as any)[filterType] = currentValues.filter(v => v !== value)
    } else if (Array.isArray(currentValues)) {
      (currentFilters as any)[filterType] = [...currentValues, value]
    }
    
    setFilters(currentFilters)
  }

  const clearFilters = () => {
    setFilters({})
  }

  const getActiveFiltersCount = () => {
    return Object.values(filters).reduce((count, values) => count + (values?.length || 0), 0)
  }

  const renderResult = (result: SearchResult, index: number) => {
    const Icon = typeIcons[result.type]
    const typeColor = typeColors[result.type]
    const isSelected = index === selectedIndex

    return (
      <div
        key={result.id}
        className={`flex items-center space-x-3 rounded-lg p-3 cursor-pointer transition-colors ${
          isSelected ? 'bg-accent' : 'hover:bg-accent'
        }`}
        onClick={() => navigateToResult(result)}
        onMouseEnter={() => selectResult(index)}
        role="option"
        aria-selected={isSelected}
        tabIndex={-1}
      >
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${typeColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h4 className="font-medium truncate">{result.title}</h4>
            <Badge variant="secondary" className={typeColor}>
              {result.type}
            </Badge>
            {result.metadata.status && (
              <Badge variant="outline" className={statusColors[result.metadata.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}>
                {result.metadata.status}
              </Badge>
            )}
            {result.metadata.priority && (
              <Badge variant="outline" className={priorityColors[result.metadata.priority as keyof typeof priorityColors] || 'bg-gray-100 text-gray-800'}>
                {result.metadata.priority}
              </Badge>
            )}
          </div>
          
          {result.description && (
            <p className="text-sm text-muted-foreground truncate mt-1">
              {result.description}
            </p>
          )}
          
          {result.metadata.assignee && (
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-muted-foreground">
                Assignee: {result.metadata.assignee}
              </span>
            </div>
          )}
        </div>
        
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }

  const renderSuggestions = () => {
    if (suggestions.length === 0) return null

    return (
      <div className="p-2">
        <div className="text-xs font-medium text-muted-foreground mb-2">Suggestions</div>
        {suggestions.map((suggestion, index) => (
          <div
            key={index}
            className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-accent cursor-pointer"
            onClick={() => {
              setQuery(suggestion)
              setShowSuggestions(false)
            }}
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{suggestion}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderFilters = () => {
    if (!showFilters) return null

    return (
      <div className="p-4 border-t">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filters</h4>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
          
          {/* Type filters */}
          {Object.keys(aggregations.types).length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">Type</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(aggregations.types).map(([type, count]) => (
                  <Button
                    key={type}
                    variant={filters.type?.includes(type) ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleFilterChange('type', type)}
                    className="text-xs"
                  >
                    {type} ({count})
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          {/* Status filters */}
          {Object.keys(aggregations.statuses).length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(aggregations.statuses).map(([status, count]) => (
                  <Button
                    key={status}
                    variant={filters.status?.includes(status) ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleFilterChange('status', status)}
                    className="text-xs"
                  >
                    {status} ({count})
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          {/* Priority filters */}
          {Object.keys(aggregations.priorities).length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">Priority</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(aggregations.priorities).map(([priority, count]) => (
                  <Button
                    key={priority}
                    variant={filters.priority?.includes(priority) ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleFilterChange('priority', priority)}
                    className="text-xs"
                  >
                    {priority} ({count})
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          className="pl-10 pr-20"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-describedby="search-help"
        />
        
        {/* Keyboard shortcut hint */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1 text-xs text-muted-foreground">
          <Command className="h-3 w-3" />
          <span>K</span>
        </div>
      </div>

      {/* Hidden help text for screen readers */}
      <div id="search-help" className="sr-only">
        Use arrow keys to navigate results, Enter to select, Escape to close. Press Cmd+K or Ctrl+K to focus search.
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-background shadow-lg max-h-96 overflow-hidden"
          role="listbox"
          aria-label="Search results"
        >
          {/* Header with filters and clear button */}
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs"
              >
                <Filter className="h-3 w-3 mr-1" />
                Filters
                {getActiveFiltersCount() > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 w-4 rounded-full p-0 text-xs">
                    {getActiveFiltersCount()}
                  </Badge>
                )}
              </Button>
              
              {total > 0 && (
                <span className="text-xs text-muted-foreground">
                  {total} results
                </span>
              )}
            </div>
            
            <Button variant="ghost" size="sm" onClick={closeSearch}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Searching...</p>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-destructive">
                <p className="text-sm">{error}</p>
              </div>
            ) : results.length > 0 ? (
              <div className="p-2">
                {results.map((result, index) => renderResult(result, index))}
              </div>
            ) : query.length >= 2 ? (
              <div className="p-4 text-center text-muted-foreground">
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">Try different keywords or check your filters</p>
              </div>
            ) : showSuggestions ? (
              renderSuggestions()
            ) : null}
          </div>

          {/* Filters Panel */}
          {renderFilters()}

          {/* Footer with keyboard shortcuts */}
          <div className="p-3 border-t bg-muted/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center space-x-4">
                <span>↑↓ Navigate</span>
                <span>Enter Select</span>
                <span>Esc Close</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <Command className="h-3 w-3" />
                  <span>K to focus</span>
                </div>
                <KeyboardShortcuts />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
