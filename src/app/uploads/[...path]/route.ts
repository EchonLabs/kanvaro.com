import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getUploadDirectory, normalizeUploadUrl } from '@/lib/file-utils'

/**
 * Route handler for legacy /uploads/... paths
 * This ensures backward compatibility with existing URLs in the database
 * If UPLOADS_DIR is set (files stored outside public), serves files directly
 * Otherwise, redirects to API route or serves from public directory
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
        { error: 'Invalid path' },
        { status: 400 }
      )
    }

    const [type, ...filenameParts] = params.path
    const filename = filenameParts.join('/')

    // Validate type
    const allowedTypes = ['logos', 'avatars', 'attachments', 'documents']
    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid upload type' },
        { status: 400 }
      )
    }

    // Check if UPLOADS_DIR is set (files stored outside public)
    const baseUploadDir = process.env.UPLOADS_DIR || process.env.UPLOAD_DIR || process.env.UPLOAD_PATH
    
    if (baseUploadDir) {
      // Files are stored outside public directory, serve them directly
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

      // Determine content type
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
      
      // Return file with appropriate headers
      return new NextResponse(uint8Array, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // If UPLOADS_DIR is not set, redirect to API route (for consistency)
    // This handles cases where files might be in public but we want to use the API route
    return NextResponse.redirect(new URL(`/api/uploads/${type}/${filename}`, request.url), 307)
  } catch (error) {
    console.error('Error serving uploaded file from legacy path:', error)
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    )
  }
}

