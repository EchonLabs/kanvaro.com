'use server'

import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { authenticateUser } from '@/lib/auth-utils'
import { connectDB } from '@/lib/db-config'
import { DocumentTemplate } from '@/models/DocumentTemplate'
import { getGridFSBucket } from '@/lib/gridfs'

export async function GET() {
  try {
    const authResult = await authenticateUser()

    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    await connectDB()

    const documents = await DocumentTemplate.find({
      organization: authResult.user.organization,
    })
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({
      success: true,
      documents: documents.map((document: any) => ({
        _id: document._id.toString(),
        name: document.name,
        description: document.description || '',
        fileName: document.fileName,
        fileId: document.fileId?.toString(),
        fileUrl: `/api/document-templates/${document._id}/download`,
        size: document.size || 0,
        mimeType: document.mimeType || 'application/octet-stream',
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })),
    })
  } catch (error) {
    console.error('Document template list error:', error)

    return NextResponse.json(
      { error: 'Failed to load document templates' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  let uploadedFileId: mongoose.Types.ObjectId | null = null

  try {
    const authResult = await authenticateUser()

    if ('error' in authResult) {

      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const userRole = String(authResult.user.role || '').toLowerCase()

    if (!['admin', 'super_admin'].includes(userRole)) {

      return NextResponse.json(
        { error: 'Only admins can add document templates' },
        { status: 403 }
      )
    }

    const formData = await request.formData()

    const name = String(formData.get('name') || '').trim()
    const description = String(formData.get('description') || '').trim()
    const file = formData.get('file')

    if (!name) {

      return NextResponse.json(
        { error: 'Document name is required' },
        { status: 400 }
      )
    }

    if (!(file instanceof File)) {

      return NextResponse.json(
        { error: 'Document file is required' },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      console.log('[DocumentTemplate] File is empty')

      return NextResponse.json(
        { error: 'The selected file is empty' },
        { status: 400 }
      )
    }

    await connectDB()

    const bucket = getGridFSBucket()

    const fileBuffer = Buffer.from(await file.arrayBuffer())

    uploadedFileId = await new Promise<mongoose.Types.ObjectId>(
      (resolve, reject) => {

        const uploadStream = bucket.openUploadStream(file.name, {
          contentType:
            file.type || 'application/octet-stream',

          metadata: {
            organization: authResult.user.organization,
            uploadedBy: authResult.user.id,
            documentType: 'document-template',
          },
        })


        let settled = false
        const uploadTimeout = setTimeout(() => {
          uploadStream.destroy(
            new Error('GridFS upload timed out after 30 seconds')
          )
        }, 30_000)

        const resolveUpload = () => {
          if (settled) return
          settled = true
          clearTimeout(uploadTimeout)
          resolve(uploadStream.id as mongoose.Types.ObjectId)
        }

        uploadStream.once('finish', resolveUpload)
        uploadStream.once('close', resolveUpload)

        uploadStream.once('error', (error) => {
          if (settled) return
          settled = true
          clearTimeout(uploadTimeout)

          reject(error)
        })

        uploadStream.end(fileBuffer)

      }
    )

    const document = await DocumentTemplate.create({
      name,
      description,
      fileName: file.name,
      fileId: uploadedFileId,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      organization: authResult.user.organization,
      uploadedBy: authResult.user.id,
    })

    return NextResponse.json(
      {
        success: true,
        document: {
          _id: document._id.toString(),
          name: document.name,
          description: document.description || '',
          fileName: document.fileName,
          fileId: document.fileId.toString(),
          fileUrl: `/api/document-templates/${document._id}/download`,
          size: document.size,
          mimeType: document.mimeType,
          createdAt: document.createdAt,
        },
      },
      { status: 201 }
    )

  } catch (error) {
    console.error(
      '[DocumentTemplate] ERROR:',
      error
    )

    if (uploadedFileId) {
      console.log(
        '[DocumentTemplate] Attempting GridFS cleanup:',
        uploadedFileId.toString()
      )

      try {
        const bucket = getGridFSBucket()

        await bucket.delete(uploadedFileId)

      } catch (cleanupError) {
        console.error(
          '[DocumentTemplate] GridFS cleanup FAILED:',
          cleanupError
        )
      }
    }

    return NextResponse.json(
      { error: 'Failed to create document template' },
      { status: 500 }
    )
  }
}