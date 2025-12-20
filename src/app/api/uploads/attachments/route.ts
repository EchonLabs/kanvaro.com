'use server'

import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import crypto from 'crypto'
import { authenticateUser } from '@/lib/auth-utils'
import { ensureDirectoryExists, getUploadDirectory, getUploadUrl } from '@/lib/file-utils'

const DEFAULT_ALLOWED_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  // Microsoft Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed'
]

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024 // 25MB

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const formData = await request.formData()
    const file = formData.get('attachment') as File
    if (!file) {
      return NextResponse.json(
        { error: 'No attachment provided' },
        { status: 400 }
      )
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 25MB.' },
        { status: 400 }
      )
    }

    const fileType = file.type || 'application/octet-stream'
    if (!DEFAULT_ALLOWED_TYPES.includes(fileType)) {
      // Provide more specific error message based on file extension
      const fileExtension = file.name.includes('.')
        ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
        : ''

      const supportedExtensions = {
        '.jpg': 'JPEG images',
        '.jpeg': 'JPEG images',
        '.png': 'PNG images',
        '.gif': 'GIF images',
        '.svg': 'SVG images',
        '.webp': 'WebP images',
        '.pdf': 'PDF documents',
        '.txt': 'Text files',
        '.csv': 'CSV files',
        '.md': 'Markdown files',
        '.doc': 'Word documents',
        '.docx': 'Word documents',
        '.xls': 'Excel spreadsheets',
        '.xlsx': 'Excel spreadsheets',
        '.ppt': 'PowerPoint presentations',
        '.pptx': 'PowerPoint presentations',
        '.zip': 'ZIP archives',
        '.rar': 'RAR archives',
        '.7z': '7Z archives'
      }

      const supportedType = supportedExtensions[fileExtension as keyof typeof supportedExtensions] || 'supported file types'

      return NextResponse.json(
        {
          error: `File type "${fileType}" is not supported. Please upload ${supportedType} (file: ${file.name}).`
        },
        { status: 400 }
      )
    }

    const uploadsDir = getUploadDirectory('attachments')
    await ensureDirectoryExists(uploadsDir)

    const extension = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.') + 1) : 'bin'
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`
    const filePath = join(uploadsDir, fileName)

    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    const uploadedAt = new Date().toISOString()
    const uploadedByName = (formData.get('uploadedByName') as string)?.trim()

    const fileUrl = getUploadUrl('attachments', fileName)

    return NextResponse.json({
      success: true,
      data: {
        name: file.name,
        url: fileUrl,
        size: file.size,
        type: fileType,
        uploadedAt,
        uploadedByName: uploadedByName || `${authResult.user.email}`
      }
    })
  } catch (error) {
    console.error('Attachment upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload attachment' },
      { status: 500 }
    )
  }
}

