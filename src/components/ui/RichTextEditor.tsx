'use client'

import React, { useRef, useCallback, useState, useEffect } from 'react'
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
  ChevronDown,
  Trash2
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return ''

  return paragraphs
    .map(p => {
      const lines = p.split(/\n/).map(line => escapeHtml(line))
      return `<p>${lines.join('<br>')}</p>`
    })
    .join('')
}

function sanitizePastedHtml(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html

  // Remove comments to prevent fragment markers (like StartFragment/EndFragment) from entering the editor
  const commentWalker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  let currentCommentNode = commentWalker.nextNode()
  while (currentCommentNode) {
    comments.push(currentCommentNode)
    currentCommentNode = commentWalker.nextNode()
  }
  comments.forEach(c => c.parentNode?.removeChild(c))

  // Remove dangerous/non-content elements early
  container.querySelectorAll('script,style,meta,link,iframe,object,embed').forEach(node => node.remove())

  const allowedTags = new Set([
    'P',
    'BR',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'UL',
    'OL',
    'LI',
    'A',
    'IMG',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'DIV',
    'SPAN',
    'FONT'
  ])

  const elements = Array.from(container.querySelectorAll('*')).reverse()
  for (const el of elements) {
    const tag = el.tagName.toUpperCase()

    // Strip attributes we don't want (styles/classes from external sources cause spacing issues)
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name === 'href' && tag === 'A') continue
      if (name === 'src' && tag === 'IMG') continue
      if ((name === 'alt' || name === 'title' || name === 'width' || name === 'height') && tag === 'IMG') continue
      if ((name === 'target' || name === 'rel') && tag === 'A') continue
      el.removeAttribute(attr.name)
    }

    if (!allowedTags.has(tag)) {
      // Unknown tag: unwrap it but keep its content
      const parent = el.parentNode
      if (!parent) continue
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
      continue
    }

    // Normalize common inline tags
    if (tag === 'B') {
      const strong = document.createElement('strong')
      while (el.firstChild) strong.appendChild(el.firstChild)
      el.replaceWith(strong)
      continue
    }
    if (tag === 'I') {
      const em = document.createElement('em')
      while (el.firstChild) em.appendChild(el.firstChild)
      el.replaceWith(em)
      continue
    }

    // Convert div wrappers into paragraphs to preserve structure on render
    if (tag === 'DIV') {
      const p = document.createElement('p')
      while (el.firstChild) p.appendChild(el.firstChild)
      el.replaceWith(p)
      continue
    }

    // Unwrap span/font (keep text but avoid inline style artifacts)
    if (tag === 'SPAN' || tag === 'FONT') {
      const parent = el.parentNode
      if (!parent) continue
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
      continue
    }

    if (tag === 'A') {
      const href = (el.getAttribute('href') || '').trim()
      // Avoid javascript: and other odd protocols
      if (href && /^(https?:|mailto:|tel:|\/)/i.test(href)) {
        el.setAttribute('href', href)
      } else {
        el.removeAttribute('href')
      }

      if (el.getAttribute('target') === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer')
      } else {
        el.removeAttribute('target')
        el.removeAttribute('rel')
      }
    }

    if (tag === 'IMG') {
      const src = (el.getAttribute('src') || '').trim()
      // Only keep reasonably safe/expected image sources
      if (!src || !/^(https?:|\/)/i.test(src)) {
        el.remove()
        continue
      }
      el.setAttribute('src', src)
    }
  }

  // Normalize NBSP and excessive whitespace in text nodes
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
  for (const node of textNodes) {
    node.nodeValue = (node.nodeValue || '').replace(/\u00a0/g, ' ')
  }

  // Remove empty blocks like <p><br></p> and collapse excessive <br>
  container.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li').forEach(block => {
    const hasImage = !!block.querySelector('img')
    const text = (block.textContent || '').replace(/\u00a0/g, ' ').trim()
    const brOnly = block.querySelectorAll('*').length === 1 && block.querySelector('br')
    if (!hasImage && (!text || brOnly) && block.querySelectorAll('br').length > 0) {
      block.remove()
    } else if (!hasImage && !text && block.querySelectorAll('br').length === 0) {
      block.remove()
    }
  })

  // Collapse 3+ consecutive <br> into 2
  const brs = Array.from(container.querySelectorAll('br'))
  for (const br of brs) {
    let count = 1
    let next = br.nextSibling
    while (next && (next.nodeType === Node.TEXT_NODE ? !(next.textContent || '').trim() : next.nodeName === 'BR')) {
      if (next.nodeName === 'BR') {
        count++
      }
      const toCheck = next
      next = next.nextSibling
      if (toCheck.nodeName === 'BR' && count > 2) {
        toCheck.parentNode?.removeChild(toCheck)
      }
    }
  }

  return container.innerHTML.trim()
}

async function uploadImageToAttachmentsApi(file: Blob, filename: string): Promise<{ url: string; name?: string } | null> {
  // Validate file size (25MB max)
  if (file.size > 25 * 1024 * 1024) return null

  const formData = new FormData()
  formData.append('attachment', file, filename)

  const response = await fetch('/api/uploads/attachments', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) return null

  const result = await response.json().catch(() => null)
  if (!result?.success || !result?.data?.url) return null
  return { url: result.data.url, name: result.data.name }
}

async function replaceDataUrlImagesWithUploads(html: string): Promise<string> {
  const container = document.createElement('div')
  container.innerHTML = html

  const images = Array.from(container.querySelectorAll('img'))
  for (const img of images) {
    const src = (img.getAttribute('src') || '').trim()
    if (!src.toLowerCase().startsWith('data:image/')) continue

    try {
      const blob = await fetch(src).then(r => r.blob())
      const ext = blob.type?.split('/')?.[1] || 'png'
      const uploaded = await uploadImageToAttachmentsApi(blob, `pasted-image.${ext}`)
      if (uploaded?.url) {
        img.setAttribute('src', uploaded.url)
        if (uploaded.name && !img.getAttribute('alt')) img.setAttribute('alt', uploaded.name)
      } else {
        // If upload fails, remove the image to avoid inserting unusable data URLs
        img.remove()
      }
    } catch {
      img.remove()
    }
  }

  return container.innerHTML
}

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  maxLength?: number
  showCharCount?: boolean
  onImageClick?: (image: HTMLImageElement | null) => void
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  className,
  disabled = false,
  maxLength,
  showCharCount = false,
  onImageClick
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [isActive, setIsActive] = useState<Record<string, boolean>>({})
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null)
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0, visible: false })
  const imageToolbarRef = useRef<HTMLDivElement>(null)

  // Dismiss image toolbar when clicking outside
  const dismissImageToolbar = useCallback(() => {
    if (selectedImage) {
      selectedImage.style.border = 'none'
      selectedImage.style.outline = 'none'
    }
    setSelectedImage(null)
    setToolbarPos(prev => ({ ...prev, visible: false }))
  }, [selectedImage])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!toolbarPos.visible) return
      const target = e.target as HTMLElement
      // If clicking on the toolbar itself, do nothing
      if (imageToolbarRef.current?.contains(target)) return
      // If clicking on the currently selected image, do nothing
      if (selectedImage && target === selectedImage) return
      // Otherwise dismiss
      dismissImageToolbar()
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [toolbarPos.visible, selectedImage, dismissImageToolbar])

  // Update toolbar position when image moves or window resizes
  useEffect(() => {
    if (!toolbarPos.visible || !selectedImage) return

    const updateToolbarPos = () => {
      const rect = selectedImage.getBoundingClientRect()
      setToolbarPos({
        top: rect.bottom + 5,
        left: rect.left,
        visible: true
      })
    }

    window.addEventListener('scroll', updateToolbarPos, true)
    window.addEventListener('resize', updateToolbarPos)

    return () => {
      window.removeEventListener('scroll', updateToolbarPos, true)
      window.removeEventListener('resize', updateToolbarPos)
    }
  }, [toolbarPos.visible, selectedImage])

  const saveSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && editorRef.current) {
      const range = selection.getRangeAt(0)
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange()
      }
    }
  }, [])

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current
    if (range && editorRef.current) {
      editorRef.current.focus()
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
  }, [])

  const updateActiveStates = useCallback(() => {
    if (!editorRef.current) return

    const commands = ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight']
    const newStates: Record<string, boolean> = {}

    commands.forEach(command => {
      newStates[command] = document.queryCommandState(command)
    })

    saveSelection()
    setIsActive(newStates)
  }, [saveSelection])

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

  const execCommand = useCallback((command: string, value: string = '') => {
    if (disabled) return

    // Save the current selection
    const selection = window.getSelection()
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    editorRef.current?.focus()
    document.execCommand(command, false, value)

    // Restore selection if it existed
    if (range && selection) {
      try {
        selection.removeAllRanges()
        selection.addRange(range)
      } catch (e) {
        // Selection restoration failed, ignore
      }
    }

    updateActiveStates()
    handleInput()
  }, [disabled, handleInput, updateActiveStates])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      execCommand('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;')
    }
  }, [execCommand])

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement
      setSelectedImage(img)
      // Add visual feedback
      if (selectedImage && selectedImage !== img) {
        selectedImage.style.border = 'none'
        selectedImage.style.outline = 'none'
      }
      img.style.border = '2px solid rgb(59, 130, 246)'
      img.style.outline = '2px solid rgb(191, 219, 254)'
      img.style.outlineOffset = '2px'

      // Position toolbar below image using window coordinates for fixed positioning
      const rect = img.getBoundingClientRect()
      setToolbarPos({
        top: rect.bottom + 5,
        left: rect.left,
        visible: true
      })

      onImageClick?.(img)
      e.preventDefault()
      e.stopPropagation()
    }
  }, [selectedImage, onImageClick])

  const insertUnorderedList = useCallback((listType: string = 'disc') => {
    if (disabled || !editorRef.current) return

    // Restore saved selection first (dropdown click may have cleared it)
    restoreSelection()

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    editorRef.current.focus()

    // Check if we're inside a list (UL or OL)
    let listElement: HTMLElement | null = null
    let currentNode: Node | null = range.commonAncestorContainer

    // Traverse up to find if we're in a list
    while (currentNode && currentNode !== editorRef.current) {
      if (currentNode.nodeName === 'UL' || currentNode.nodeName === 'OL') {
        listElement = currentNode as HTMLElement
        break
      }
      currentNode = currentNode.parentNode
    }

    // If we found a list, toggle off if same type/style, or convert it
    if (listElement) {
      const isSameType = listElement.nodeName === 'UL'
      const isSameStyle = listElement.style.listStyleType === listType

      // Toggle off: remove list formatting if clicking the same style
      if (isSameType && isSameStyle) {
        const listItems = Array.from(listElement.querySelectorAll('li'))
        const fragment = document.createDocumentFragment()
        listItems.forEach(li => {
          const div = document.createElement('div')
          div.innerHTML = li.innerHTML
          fragment.appendChild(div)
        })
        listElement.parentNode?.replaceChild(fragment, listElement)
        handleInput()
        return
      }

      const listItems = Array.from(listElement.querySelectorAll('li'))
      const newList = document.createElement('ul')
      newList.style.listStyleType = listType
      newList.style.paddingLeft = '1.5rem'

      listItems.forEach(li => {
        const newLi = document.createElement('li')
        newLi.innerHTML = li.innerHTML
        newList.appendChild(newLi)
      })

      listElement.parentNode?.replaceChild(newList, listElement)
      handleInput()
      return
    }

    // Clone selected content as HTML
    const container = document.createElement('div')
    container.appendChild(range.cloneContents())

    // Extract lines properly - handles div, p, br, li, and mixed inline content
    let lines: string[] = []
    let currentLine = ''

    const flushLine = () => {
      const trimmed = currentLine.trim()
      if (trimmed) lines.push(trimmed)
      currentLine = ''
    }

    const extractText = (node: Node) => {
      if (node.nodeType === 8) return // Skip COMMENT_NODE (8)
      if (node.nodeName === 'LI') {
        flushLine()
        const text = (node as HTMLElement).innerHTML
        if (text) lines.push(text)
      } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
        flushLine()
        const el = node as HTMLElement
        // Check if the block element itself contains BR-separated content
        if (el.querySelector('br')) {
          el.childNodes.forEach(child => extractText(child))
        } else {
          const text = el.innerText.trim()
          if (text) lines.push(text)
        }
        flushLine()
      } else if (node.nodeName === 'BR') {
        flushLine()
      } else if (node.nodeName === 'UL' || node.nodeName === 'OL') {
        flushLine()
        node.childNodes.forEach(child => extractText(child))
      } else {
        // Inline text node or inline element
        const text = node.textContent || ''
        currentLine += text
      }
    }

    container.childNodes.forEach(node => extractText(node))
    flushLine()

    // Fallback: if we got a single line that contains newlines, split it
    if (lines.length === 1 && lines[0].includes('\n')) {
      lines = lines[0].split('\n').map(l => l.trim()).filter(l => l)
    }

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
  }, [disabled, handleInput, restoreSelection])

  const insertOrderedList = useCallback((listType: string = 'decimal') => {
    if (disabled || !editorRef.current) return

    // Restore saved selection first (dropdown click may have cleared it)
    restoreSelection()

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    editorRef.current.focus()

    // Check if we're inside a list (UL or OL)
    let listElement: HTMLElement | null = null
    let currentNode: Node | null = range.commonAncestorContainer

    // Traverse up to find if we're in a list
    while (currentNode && currentNode !== editorRef.current) {
      if (currentNode.nodeName === 'UL' || currentNode.nodeName === 'OL') {
        listElement = currentNode as HTMLElement
        break
      }
      currentNode = currentNode.parentNode
    }

    // If we found a list, toggle off if same type/style, or convert it
    if (listElement) {
      const isSameType = listElement.nodeName === 'OL'
      const isSameStyle = listElement.style.listStyleType === listType

      // Toggle off: remove list formatting if clicking the same style
      if (isSameType && isSameStyle) {
        const listItems = Array.from(listElement.querySelectorAll('li'))
        const fragment = document.createDocumentFragment()
        listItems.forEach(li => {
          const div = document.createElement('div')
          div.innerHTML = li.innerHTML
          fragment.appendChild(div)
        })
        listElement.parentNode?.replaceChild(fragment, listElement)
        handleInput()
        return
      }

      const listItems = Array.from(listElement.querySelectorAll('li'))
      const newList = document.createElement('ol')
      newList.style.listStyleType = listType
      newList.style.paddingLeft = '1.5rem'

      listItems.forEach(li => {
        const newLi = document.createElement('li')
        newLi.innerHTML = li.innerHTML
        newList.appendChild(newLi)
      })

      listElement.parentNode?.replaceChild(newList, listElement)
      handleInput()
      return
    }

    // Clone selected content as HTML
    const container = document.createElement('div')
    container.appendChild(range.cloneContents())

    // Extract lines properly - handles div, p, br, li, and mixed inline content
    let lines: string[] = []
    let currentLine = ''

    const flushLine = () => {
      const trimmed = currentLine.trim()
      if (trimmed) lines.push(trimmed)
      currentLine = ''
    }

    const extractText = (node: Node) => {
      if (node.nodeType === 8) return // Skip COMMENT_NODE (8)
      if (node.nodeName === 'LI') {
        flushLine()
        const text = (node as HTMLElement).innerHTML
        if (text) lines.push(text)
      } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
        flushLine()
        const el = node as HTMLElement
        if (el.querySelector('br')) {
          el.childNodes.forEach(child => extractText(child))
        } else {
          const text = el.innerText.trim()
          if (text) lines.push(text)
        }
        flushLine()
      } else if (node.nodeName === 'BR') {
        flushLine()
      } else if (node.nodeName === 'UL' || node.nodeName === 'OL') {
        flushLine()
        node.childNodes.forEach(child => extractText(child))
      } else {
        const text = node.textContent || ''
        currentLine += text
      }
    }

    container.childNodes.forEach(node => extractText(node))
    flushLine()

    // Fallback: if we got a single line that contains newlines, split it
    if (lines.length === 1 && lines[0].includes('\n')) {
      lines = lines[0].split('\n').map(l => l.trim()).filter(l => l)
    }

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
  }, [disabled, handleInput, restoreSelection])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (disabled || !editorRef.current) return

    const clipboardData = e.clipboardData
    if (!clipboardData) return

    // Check if clipboard has image files
    const items = Array.from(clipboardData.items)
    const imageItem = items.find(item => item.type.startsWith('image/'))

    if (imageItem) {
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (!file) return

      // Validate file size (25MB max)
      if (file.size > 25 * 1024 * 1024) {
        return
      }

      setIsUploadingImage(true)

      try {
        const formData = new FormData()
        formData.append('attachment', file)

        const response = await fetch('/api/uploads/attachments', {
          method: 'POST',
          body: formData,
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data?.url) {
            const imgHTML = `<img src="${result.data.url}" alt="${result.data.name || 'Pasted image'}" style="max-width: 100%; max-height: 300px; height: auto; object-fit: contain; display: block;" />`
            editorRef.current?.focus()
            document.execCommand('insertHTML', false, imgHTML)
            handleInput()
          }
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error('Upload failed:', errorData.error || response.statusText)
        }
      } catch (error) {
        console.error('Failed to upload pasted image:', error)
      } finally {
        setIsUploadingImage(false)
      }
    } else {
      // Handle text paste - sanitize HTML/plain text to prevent extra spacing and preserve structure
      e.preventDefault()

      const html = clipboardData.getData('text/html')
      const plainText = clipboardData.getData('text/plain')

      let pasteContent = ''
      if (html && html.trim()) {
        // Word/Office often embeds images as data URLs inside HTML; upload them first.
        setIsUploadingImage(true)
        try {
          const htmlWithUploadedImages = await replaceDataUrlImagesWithUploads(html)
          pasteContent = sanitizePastedHtml(htmlWithUploadedImages)
        } finally {
          setIsUploadingImage(false)
        }
      } else if (plainText && plainText.trim()) {
        pasteContent = plainTextToHtml(plainText)
      }

      if (pasteContent) {
        document.execCommand('insertHTML', false, pasteContent)
        handleInput()
      }
    }
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

  // Helper function to set image size with proper CSS override
  const setImageSize = useCallback((img: HTMLImageElement, width: string) => {
    // Use setAttribute to set inline styles with !important to override Tailwind's !max-w-full
    const currentStyle = img.getAttribute('style') || ''
    // Remove any existing width and max-width styles
    const cleanedStyle = currentStyle
      .replace(/width\s*:\s*[^;]*!important/i, '')
      .replace(/width\s*:\s*[^;]*/i, '')
      .replace(/max-width\s*:\s*[^;]*!important/i, '')
      .replace(/max-width\s*:\s*[^;]*/i, '')
      .trim()
    
    const newStyle = `${cleanedStyle}; width: ${width} !important; max-width: none !important`
    img.setAttribute('style', newStyle)
    handleInput()
  }, [handleInput])

  const setImageAlignment = useCallback((img: HTMLImageElement, alignment: 'left' | 'center' | 'right') => {
    img.style.display = 'block'
    
    switch (alignment) {
      case 'left':
        img.style.marginLeft = '0'
        img.style.marginRight = 'auto'
        break
      case 'center':
        img.style.margin = '0 auto'
        break
      case 'right':
        img.style.marginLeft = 'auto'
        img.style.marginRight = '0'
        break
    }
    
    handleInput()
  }, [handleInput])

  // Initialize content when value changes
  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  return (
    <div className={cn('border rounded-md overflow-visible relative', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/50">
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

      {/* Upload indicator */}
      {isUploadingImage && (
        <div className="px-3 py-1 text-xs text-muted-foreground bg-muted/30 border-b">
          Uploading image...
        </div>
      )}

      {/* Image Toolbar - Below Image */}
      {toolbarPos.visible && selectedImage && (
        <div
          ref={imageToolbarRef}
          className="fixed bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg flex items-center justify-center gap-1 p-2 z-[60]"
          style={{
            top: `${toolbarPos.top}px`,
            left: `${toolbarPos.left}px`,
            pointerEvents: 'auto',
            flexWrap: 'wrap',
            maxWidth: '250px'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Size Presets */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs font-medium"
            onClick={() => {
              if (selectedImage) setImageSize(selectedImage, '100%')
            }}
            title="Set image to 100% width"
          >
            100%
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs font-medium"
            onClick={() => {
              if (selectedImage) setImageSize(selectedImage, '50%')
            }}
            title="Set image to 50% width"
          >
            50%
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs font-medium"
            onClick={() => {
              if (selectedImage) setImageSize(selectedImage, '25%')
            }}
            title="Set image to 25% width"
          >
            25%
          </Button>

          <div className="h-5 border-l border-gray-300 dark:border-gray-600 mx-0.5" />

          {/* Alignment Buttons */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 flex items-center justify-center"
            onClick={() => {
              if (selectedImage) setImageAlignment(selectedImage, 'left')
            }}
            title="Align image left"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 flex items-center justify-center"
            onClick={() => {
              if (selectedImage) setImageAlignment(selectedImage, 'center')
            }}
            title="Align image center"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 flex items-center justify-center"
            onClick={() => {
              if (selectedImage) setImageAlignment(selectedImage, 'right')
            }}
            title="Align image right"
          >
            <AlignRight className="h-4 w-4" />
          </Button>

          <div className="h-5 border-l border-gray-300 dark:border-gray-600 mx-0.5" />

          {/* Delete Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900 hover:border-red-300 dark:hover:border-red-600"
            onClick={() => {
              if (selectedImage) {
                selectedImage.remove()
                setSelectedImage(null)
                setToolbarPos({ ...toolbarPos, visible: false })
                handleInput()
              }
            }}
            title="Delete image"
          >
            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
          </Button>
        </div>
      )}

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleImageClick}
        onMouseUp={updateActiveStates}
        onKeyUp={updateActiveStates}
        onPaste={handlePaste}
        className={cn(

          'rich-text-editor w-full min-h-[120px] max-h-[400px] p-3 focus:outline-none overflow-x-hidden overflow-y-auto text-foreground',
          '[&_img]:!max-w-full [&_img]:!max-h-[300px] [&_img]:!h-auto [&_img]:!object-contain [&_img]:block [&_img]:cursor-pointer',
          '[&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h4]:text-foreground [&_h5]:text-foreground [&_h6]:text-foreground',
          '[&_p]:text-foreground [&_p]:leading-relaxed',
          '[&_strong]:text-foreground [&_strong]:font-semibold',
          '[&_em]:text-foreground',
          '[&_ul]:text-foreground [&_ol]:text-foreground',
          '[&_li]:text-foreground',
          '[&_a]:text-blue-600 [&_a]:no-underline [&_a:hover]:underline',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        style={{
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          wordBreak: 'break-word',
          overflowWrap: 'break-word'
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