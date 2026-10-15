'use server'

import { Readable } from 'stream'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { authenticateUser } from '@/lib/auth-utils'
import { connectDB } from '@/lib/db-config'
import { DocumentTemplate } from '@/models/DocumentTemplate'
import { getGridFSBucket } from '@/lib/gridfs'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await authenticateUser()

    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json(
        { error: 'Invalid document template ID' },
        { status: 400 }
      )
    }

    await connectDB()

    const document: any = await DocumentTemplate.findOne({
      _id: params.id,
      organization: authResult.user.organization,
    }).lean()

    if (!document) {
      return NextResponse.json(
        { error: 'Document template not found' },
        { status: 404 }
      )
    }

    const downloadStream = getGridFSBucket().openDownloadStream(document.fileId)
    const fileStream = Readable.toWeb(downloadStream) as ReadableStream
    const encodedFileName = encodeURIComponent(document.fileName)

    return new NextResponse(fileStream, {
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Length': String(document.size || 0),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFileName}`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('Document template download error:', error)

    return NextResponse.json(
      { error: 'Failed to download document template' },
      { status: 500 }
    )
  }
}
