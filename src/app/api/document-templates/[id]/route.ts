'use server'

import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth-utils'
import { connectDB } from '@/lib/db-config'
import { DocumentTemplate } from '@/models/DocumentTemplate'
import { getGridFSBucket } from '@/lib/gridfs'

export async function DELETE(
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

    const userRole = String(authResult.user.role || '').toLowerCase()
    if (!['admin', 'super_admin'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Only admins can delete document templates' },
        { status: 403 }
      )
    }

    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json(
        { error: 'Invalid document template ID' },
        { status: 400 }
      )
    }

    await connectDB()

    const document = await DocumentTemplate.findOne({
      _id: params.id,
      organization: authResult.user.organization,
    })

    if (!document) {
      return NextResponse.json(
        { error: 'Document template not found' },
        { status: 404 }
      )
    }

    await getGridFSBucket().delete(document.fileId)
    await DocumentTemplate.deleteOne({ _id: document._id })

    return NextResponse.json({
      success: true,
      message: 'Document template deleted successfully',
    })
  } catch (error) {
    console.error('Document template deletion error:', error)

    return NextResponse.json(
      { error: 'Failed to delete document template' },
      { status: 500 }
    )
  }
}
