'use server'

import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import crypto from 'crypto'
import { authenticateUser } from '@/lib/auth-utils'
import { ensureDirectoryExists, getUploadDirectory, getUploadUrl } from '@/lib/file-utils'

const DEFAULT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
      return NextResponse.json(
        { error: 'Unsupported file type.' },
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

