import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getUploadDirectory } from '@/lib/file-utils'

/**
 * API route to serve uploaded files when they're stored outside the public directory
 * This is necessary for containerized environments where /app/public may not be writable
 * 
 * Usage: /api/uploads/{type}/{filename}
 * Example: /api/uploads/logos/my-logo.png
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Extract type and filename from path
    // path = ['logos', 'filename.png'] or ['avatars', 'filename.jpg']
    if (params.path.length < 2) {
      return NextResponse.json(
        { error: 'Invalid path. Expected format: /api/uploads/{type}/{filename}' },
        { status: 400 }
      )
    }

    const [type, ...filenameParts] = params.path
    const filename = filenameParts.join('/') // Handle nested paths if needed

    // Validate type (only allow known upload types)
    const allowedTypes = ['logos', 'avatars', 'attachments', 'documents']
    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid upload type' },
        { status: 400 }
      )
    }

    // Get the file path using the same logic as file uploads
    const uploadDir = getUploadDirectory(type)
    const filePath = join(uploadDir, filename)

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Read file
    const fileBuffer = await readFile(filePath)

    // Determine content type based on file extension
    const extension = filename.split('.').pop()?.toLowerCase()
    const contentTypeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }

    const contentType = contentTypeMap[extension || ''] || 'application/octet-stream'

    // Convert Buffer to Uint8Array for proper TypeScript compatibility
    // This ensures the buffer is compatible with NextResponse's BodyInit type
    const uint8Array = new Uint8Array(fileBuffer)
    
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      },
    })
  } catch (error) {
    console.error('Error serving uploaded file:', error)
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    )
  }
}

