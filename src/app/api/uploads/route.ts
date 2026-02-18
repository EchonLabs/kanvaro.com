import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import slugify from 'slugify'
import { connectDB } from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ALLOWED_TYPES = [
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

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const entityType = formData.get('entityType') as string
    const entityId = formData.get('entityId') as string
    const organizationId = formData.get('organizationId') as string

    if (!file || !entityType || !entityId || !organizationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 25MB' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    // Validate entity types
    const validEntityTypes = ['projects', 'epics', 'sprints', 'stories', 'tasks']
    if (!validEntityTypes.includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadsDir = process.env.UPLOADS_DIR || path.resolve('./uploads')
    const destDir = path.join(uploadsDir, organizationId, entityType, entityId)
    
    await fs.mkdir(destDir, { recursive: true })
    
    const filename = slugify(file.name, { lower: true, strict: true })
    const fullPath = path.join(destDir, filename)
    
    await fs.writeFile(fullPath, buffer)

    const attachment = {
      name: file.name,
      url: `/api/uploads/${organizationId}/${entityType}/${entityId}/${filename}`,
      size: file.size,
      type: file.type,
      uploadedBy: authResult.user.id,
      uploadedAt: new Date()
    }

    return NextResponse.json(attachment)
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
