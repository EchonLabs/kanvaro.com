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
  Type
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  className,
  disabled = false
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

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      onChange(html)
      updateActiveStates()
    }
  }, [onChange, updateActiveStates])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      execCommand('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;')
    }
  }, [execCommand])

  const insertUnorderedList = useCallback(() => {
    if (disabled || !editorRef.current) return
    const selection = window.getSelection()
    if (!selection) return

    editorRef.current.focus()
    const range = selection.getRangeAt(0)
    const selectedText = range.toString()

    if (selectedText) {
      // Wrap selected text in list
      const listHTML = `<ul><li>${selectedText.replace(/\n/g, '</li><li>')}</li></ul>`
      document.execCommand('insertHTML', false, listHTML)
    } else {
      // Insert new list
      const listHTML = '<ul><li><br></li></ul>'
      document.execCommand('insertHTML', false, listHTML)
      // Move cursor into the list item
      const newRange = document.createRange()
      const listItems = editorRef.current.querySelectorAll('ul li')
      if (listItems.length > 0) {
        const lastLi = listItems[listItems.length - 1]
        newRange.setStart(lastLi, 0)
        newRange.setEnd(lastLi, 0)
        selection.removeAllRanges()
        selection.addRange(newRange)
      }
    }
    handleInput()
  }, [disabled, handleInput])

  const insertOrderedList = useCallback(() => {
    if (disabled || !editorRef.current) return
    const selection = window.getSelection()
    if (!selection) return

    editorRef.current.focus()
    const range = selection.getRangeAt(0)
    const selectedText = range.toString()

    if (selectedText) {
      // Wrap selected text in list
      const listHTML = `<ol><li>${selectedText.replace(/\n/g, '</li><li>')}</li></ol>`
      document.execCommand('insertHTML', false, listHTML)
    } else {
      // Insert new list
      const listHTML = '<ol><li><br></li></ol>'
      document.execCommand('insertHTML', false, listHTML)
      // Move cursor into the list item
      const newRange = document.createRange()
      const listItems = editorRef.current.querySelectorAll('ol li')
      if (listItems.length > 0) {
        const lastLi = listItems[listItems.length - 1]
        newRange.setStart(lastLi, 0)
        newRange.setEnd(lastLi, 0)
        selection.removeAllRanges()
        selection.addRange(newRange)
      }
    }
    handleInput()
  }, [disabled, handleInput])

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

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={insertUnorderedList}
          className="h-8 w-8 p-0"
          disabled={disabled}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={insertOrderedList}
          className="h-8 w-8 p-0"
          disabled={disabled}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={formatAsHeading}
          disabled={disabled}
          title="Heading"
        >
          <Type className="h-4 w-4" />
        </Button>
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
          'min-h-[120px] p-3 focus:outline-none prose prose-sm max-w-none',
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
    </div>
  )
}