'use client'

import React, { useRef, useCallback, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  maxLength?: number
  showCharCount?: boolean
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  className,
  disabled = false,
  maxLength,
  showCharCount = false
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isActive, setIsActive] = useState<Record<string, boolean>>({})

  const execCommand = useCallback((command: string, value: string = '') => {
    if (disabled) return
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    updateActiveStates()
  }, [disabled])

  const updateActiveStates = useCallback(() => {
    if (!editorRef.current) return

    const commands = ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight']
    const newStates: Record<string, boolean> = {}

    commands.forEach(command => {
      newStates[command] = document.queryCommandState(command)
    })

    setIsActive(newStates)
  }, [])

  const stripHtml = useCallback((html: string): string => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }, [])

  const getCharCount = useCallback((html: string): number => {
    return stripHtml(html).length
  }, [stripHtml])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      let html = editorRef.current.innerHTML

      // Enforce maxLength if provided
      if (maxLength) {
        const textContent = stripHtml(html)
        if (textContent.length > maxLength) {
          // Truncate the text content
          const truncatedText = textContent.substring(0, maxLength)
          // Convert back to HTML (simple approach - may not preserve all formatting)
          html = truncatedText.replace(/\n/g, '<br>')
          editorRef.current.innerHTML = html
        }
      }

      onChange(html)
      updateActiveStates()
    }
  }, [onChange, updateActiveStates, maxLength, stripHtml])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      execCommand('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;')
    }
  }, [execCommand])

  const insertUnorderedList = useCallback((listType: string = 'disc') => {
    if (disabled || !editorRef.current) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    editorRef.current.focus()

  // Clone selected content as HTML
  const container = document.createElement('div')
  container.appendChild(range.cloneContents())

  // Extract lines properly (div, p, br)
  let lines: string[] = []

  container.childNodes.forEach((node) => {
    if (node.nodeName === 'DIV' || node.nodeName === 'P') {
      lines.push((node as HTMLElement).innerText.trim())
    } else if (node.nodeName === 'BR') {
      // ignore empty lines
    } else {
      const text = node.textContent?.trim()
      if (text) lines.push(text)
    }
  })

  if (lines.length > 0) {
    const listItems = lines
      .filter(l => l)
      .map(line => `<li>${line}</li>`)
      .join('')

    const listHTML = `<ul style="list-style-type: ${listType}; padding-left: 1.5rem;">${listItems}</ul>`
    document.execCommand('insertHTML', false, listHTML)
  } else {
    const listHTML = `<ul style="list-style-type: ${listType}; padding-left: 1.5rem;"><li><br></li></ul>`
    document.execCommand('insertHTML', false, listHTML)
    }

    handleInput()
  }, [disabled, handleInput])

  const insertOrderedList = useCallback((listType: string = 'decimal') => {
    if (disabled || !editorRef.current) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    editorRef.current.focus()

  const container = document.createElement('div')
  container.appendChild(range.cloneContents())

  let lines: string[] = []

  container.childNodes.forEach((node) => {
    if (node.nodeName === 'DIV' || node.nodeName === 'P') {
      lines.push((node as HTMLElement).innerText.trim())
    } else if (node.nodeName === 'BR') {
      // ignore
    } else {
      const text = node.textContent?.trim()
      if (text) lines.push(text)
    }
  })

  if (lines.length > 0) {
    const listItems = lines
      .filter(l => l)
      .map(line => `<li>${line}</li>`)
      .join('')

      const listHTML = `<ol style="list-style-type: ${listType}; padding-left: 1.5rem;">${listItems}</ol>`
      document.execCommand('insertHTML', false, listHTML)
  } else {
    const listHTML = `<ol style="list-style-type: ${listType}; padding-left: 1.5rem;"><li><br></li></ol>`
    document.execCommand('insertHTML', false, listHTML)
    }

    handleInput()
  }, [disabled, handleInput])

  const fontSizes = [
    { label: '8pt', value: '1' },
    { label: '10pt', value: '2' },
    { label: '12pt', value: '3' },
    { label: '14pt', value: '4' },
    { label: '16pt', value: '5' },
    { label: '18pt', value: '6' },
    { label: '20pt', value: '7' },
    { label: '24pt', value: '8' },
    { label: '28pt', value: '9' },
    { label: '32pt', value: '10' },
    { label: '36pt', value: '11' },
    { label: '48pt', value: '12' }
  ]

  const fontFamilies = [
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
    { label: 'Courier New', value: '"Courier New", monospace' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
    { label: 'Helvetica', value: 'Helvetica, sans-serif' },
    { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
    { label: 'Impact', value: 'Impact, sans-serif' }
  ]

  const [selectedFontSize, setSelectedFontSize] = useState<string>('5') // Default to 16pt
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>('Arial, sans-serif') // Default to Arial

  const increaseFontSize = useCallback(() => {
    if (disabled) return

    const currentIndex = fontSizes.findIndex(size => size.value === selectedFontSize)
    const newIndex = Math.min(currentIndex + 1, fontSizes.length - 1)
    const newSize = fontSizes[newIndex].value
    setSelectedFontSize(newSize)
    execCommand('fontSize', newSize)
  }, [execCommand, disabled, selectedFontSize, fontSizes])

  const decreaseFontSize = useCallback(() => {
    if (disabled) return

    const currentIndex = fontSizes.findIndex(size => size.value === selectedFontSize)
    const newIndex = Math.max(currentIndex - 1, 0)
    const newSize = fontSizes[newIndex].value
    setSelectedFontSize(newSize)
    execCommand('fontSize', newSize)
  }, [execCommand, disabled, selectedFontSize, fontSizes])

  const applyFontSize = useCallback((size: string) => {
    if (disabled) return
    setSelectedFontSize(size)
    execCommand('fontSize', size)
  }, [execCommand, disabled])

  const applyFontFamily = useCallback((fontFamily: string) => {
    if (disabled) return
    setSelectedFontFamily(fontFamily)
    execCommand('fontName', fontFamily)
  }, [execCommand, disabled])

  const formatAsHeading = useCallback(() => {
    if (disabled) return
    execCommand('formatBlock', 'h3')
  }, [execCommand, disabled])

  // Initialize content when value changes
  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  return (
    <div className={cn('border rounded-md', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand('bold')}
          className={cn('h-8 w-8 p-0', isActive.bold && 'bg-accent')}
          disabled={disabled}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand('italic')}
          className={cn('h-8 w-8 p-0', isActive.italic && 'bg-accent')}
          disabled={disabled}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand('underline')}
          className={cn('h-8 w-8 p-0', isActive.underline && 'bg-accent')}
          disabled={disabled}
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand('justifyLeft')}
          className={cn('h-8 w-8 p-0', isActive.justifyLeft && 'bg-accent')}
          disabled={disabled}
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand('justifyCenter')}
          className={cn('h-8 w-8 p-0', isActive.justifyCenter && 'bg-accent')}
          disabled={disabled}
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => execCommand('justifyRight')}
          className={cn('h-8 w-8 p-0', isActive.justifyRight && 'bg-accent')}
          disabled={disabled}
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Select value={selectedFontFamily} onValueChange={applyFontFamily} disabled={disabled}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[10050]">
            {fontFamilies.map((font) => (
              <SelectItem key={font.value} value={font.value}>
                <span style={{ fontFamily: font.value }}>{font.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedFontSize} onValueChange={applyFontSize} disabled={disabled}>
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[10050]">
            {fontSizes.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={increaseFontSize}
          disabled={disabled}
          className="h-8 w-8 p-0"
          title="Increase Font Size"
        >
          <Type className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={decreaseFontSize}
          disabled={disabled}
          className="h-8 w-8 p-0"
          title="Decrease Font Size"
        >
          <Type className="h-3 w-3" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={disabled}
              title="Bullet List Options"
            >
              <List className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[10050]">
            <DropdownMenuItem onClick={() => insertUnorderedList('disc')}>
              <span className="w-4 h-4 rounded-full bg-current mr-2" style={{ listStyleType: 'disc' }}></span>
              Filled Circle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertUnorderedList('circle')}>
              <span className="w-4 h-4 rounded-full border border-current mr-2" style={{ listStyleType: 'circle' }}></span>
              Empty Circle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertUnorderedList('square')}>
              <span className="w-4 h-4 bg-current mr-2" style={{ listStyleType: 'square', width: '6px', height: '6px' }}></span>
              Square
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={disabled}
              title="Numbered List Options"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[10050]">
            <DropdownMenuItem onClick={() => insertOrderedList('decimal')}>
              <span className="w-6 text-center mr-2">1.</span>
              Numbers (1, 2, 3...)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertOrderedList('lower-alpha')}>
              <span className="w-6 text-center mr-2">a.</span>
              Lowercase Letters (a, b, c...)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertOrderedList('upper-alpha')}>
              <span className="w-6 text-center mr-2">A.</span>
              Uppercase Letters (A, B, C...)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertOrderedList('lower-roman')}>
              <span className="w-6 text-center mr-2">i.</span>
              Lowercase Roman (i, ii, iii...)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertOrderedList('upper-roman')}>
              <span className="w-6 text-center mr-2">I.</span>
              Uppercase Roman (I, II, III...)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseUp={updateActiveStates}
        onKeyUp={updateActiveStates}
        className={cn(
          'rich-text-editor min-h-[120px] p-3 focus:outline-none prose prose-sm max-w-none',
          'prose-headings:font-semibold prose-headings:text-foreground',
          'prose-p:text-foreground prose-p:leading-relaxed',
          'prose-strong:font-semibold prose-strong:text-foreground',
          'prose-em:text-foreground',
          'prose-ul:text-foreground prose-ol:text-foreground',
          'prose-li:text-foreground',
          'prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        style={{
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word'
        }}
        data-placeholder={placeholder}
      />

      {/* Character Count */}
      {showCharCount && maxLength && (
        <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between items-center">
          <span className="text-xs">
            Characters: {getCharCount(value)} / {maxLength}
          </span>
          <span className={cn(
            'text-xs font-medium',
            getCharCount(value) > maxLength * 0.9 ? 'text-destructive' :
            getCharCount(value) > maxLength * 0.8 ? 'text-yellow-600' : 'text-muted-foreground'
          )}>
            {maxLength - getCharCount(value)} remaining
          </span>
        </div>
      )}
    </div>
  )
}