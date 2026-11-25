import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import '@/models/registry'
import { Lesson } from '@/models/Lesson'
import { authenticateUser } from '@/lib/auth-utils'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid lesson ID' }, { status: 400 })
    }
    const existing = await Lesson.findOne({
      _id: id,
      organization: authResult.user.organization
    })
      .select('project')
      .lean() as { project?: unknown } | null

    if (!existing) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const canManage = await PermissionService.hasPermission(
      authResult.user.id,
      Permission.PROJECT_UPDATE,
      String(existing.project)
    )
    if (!canManage) {
      return NextResponse.json(
        { error: 'Only project managers and admins can edit lessons' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { category, impactLevel, context, rootCause, actionRecommendation } = body

    if (
      (category !== undefined && !String(category).trim()) ||
      (context !== undefined && !String(context).trim()) ||
      (actionRecommendation !== undefined && !String(actionRecommendation).trim())
    ) {
      return NextResponse.json({ error: 'Required fields cannot be empty' }, { status: 400 })
    }

    const updateData: any = {
      modifiedBy: authResult.user.id
    }
    if (category !== undefined) updateData.category = category
    if (impactLevel !== undefined) updateData.impactLevel = impactLevel
    if (context !== undefined) updateData.context = context
    if (rootCause !== undefined) updateData.rootCause = rootCause
    if (actionRecommendation !== undefined) updateData.actionRecommendation = actionRecommendation

    const updated = await Lesson.findOneAndUpdate(
      { _id: id, organization: authResult.user.organization },
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('modifiedBy', 'firstName lastName email avatar role')
      .lean()

    if (!updated) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    return NextResponse.json({ lesson: updated })
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error updating lesson:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB()
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid lesson ID' }, { status: 400 })
    }
    const existing = await Lesson.findOne({
      _id: id,
      organization: authResult.user.organization
    })
      .select('project')
      .lean() as { project?: unknown } | null

    if (!existing) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const canManage = await PermissionService.hasPermission(
      authResult.user.id,
      Permission.PROJECT_UPDATE,
      String(existing.project)
    )
    if (!canManage) {
      return NextResponse.json(
        { error: 'Only project managers and admins can delete lessons' },
        { status: 403 }
      )
    }

    const deleted = await Lesson.findOneAndDelete({
      _id: id,
      organization: authResult.user.organization
    })

    if (!deleted) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting lesson:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
