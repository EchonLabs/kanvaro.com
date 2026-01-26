import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { TimeEntry } from '@/models/TimeEntry'
import { TimeTrackingSettings } from '@/models/TimeTrackingSettings'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    
    const timeEntry = await TimeEntry.findById(params.id)
      .populate('user', 'firstName lastName email')
      .populate('project', 'name')
      .populate('task', 'title')
      .populate('approvedBy', 'firstName lastName')

    if (!timeEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    return NextResponse.json({ timeEntry })
  } catch (error) {
    console.error('Error fetching time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    
    const body = await request.json()
    const { description, startTime, endTime, duration, isBillable, hourlyRate, category, tags, notes } = body

    const timeEntry = await TimeEntry.findById(params.id)

    if (!timeEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    // Check if time entry is already approved
    if (timeEntry.isApproved) {
      return NextResponse.json({ error: 'Cannot modify approved time entry' }, { status: 400 })
    }

    // Check time-based editing restrictions
    const settings = await TimeTrackingSettings.findOne({
      organization: timeEntry.organization,
      $or: [
        { project: timeEntry.project },
        { project: null }
      ]
    }).sort({ project: -1 }) // Prefer project-specific settings

    if (settings?.timeLogEditMode) {
      const now = new Date()
      const entryDate = new Date(timeEntry.createdAt || timeEntry.startTime)

      if (settings.timeLogEditMode === 'days') {
        const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
        const maxDays = settings.timeLogEditDays || 30
        if (daysDiff > maxDays) {
          return NextResponse.json({ 
            error: `Cannot modify time entry. Editing is only allowed within ${maxDays} days of creation.` 
          }, { status: 400 })
        }
      } else if (settings.timeLogEditMode === 'dayOfMonth') {
        const maxDayOfMonth = settings.timeLogEditDayOfMonth || 15
        const entryDayOfMonth = entryDate.getDate()
        if (entryDayOfMonth <= maxDayOfMonth) {
          return NextResponse.json({ 
            error: `Cannot modify time entry. Editing is only allowed for entries created after day ${maxDayOfMonth} of each month.` 
          }, { status: 400 })
        }
      }
    }

    // Update fields
    if (description) timeEntry.description = description
    if (startTime) timeEntry.startTime = new Date(startTime)
    if (endTime) timeEntry.endTime = new Date(endTime)
    if (duration !== undefined) timeEntry.duration = duration
    if (isBillable !== undefined) timeEntry.isBillable = isBillable
    if (hourlyRate !== undefined) timeEntry.hourlyRate = hourlyRate
    if (category) timeEntry.category = category
    if (tags) timeEntry.tags = tags
    if (notes) timeEntry.notes = notes

    // Recalculate duration if start/end times changed
    if (startTime || endTime) {
      const start = timeEntry.startTime
      const end = timeEntry.endTime || new Date()
      timeEntry.duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60))
    }

    await timeEntry.save()

    return NextResponse.json({
      message: 'Time entry updated successfully',
      timeEntry: timeEntry.toObject()
    })
  } catch (error) {
    console.error('Error updating time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()
    
    const timeEntry = await TimeEntry.findById(params.id)

    if (!timeEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    // Check if time entry is already approved
    if (timeEntry.isApproved) {
      return NextResponse.json({ error: 'Cannot delete approved time entry' }, { status: 400 })
    }

    // Check time-based editing restrictions
    const settings = await TimeTrackingSettings.findOne({
      organization: timeEntry.organization,
      $or: [
        { project: timeEntry.project },
        { project: null }
      ]
    }).sort({ project: -1 }) // Prefer project-specific settings

    if (settings?.timeLogEditMode) {
      const now = new Date()
      const entryDate = new Date(timeEntry.createdAt || timeEntry.startTime)

      if (settings.timeLogEditMode === 'days') {
        const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
        const maxDays = settings.timeLogEditDays || 30
        if (daysDiff > maxDays) {
          return NextResponse.json({ 
            error: `Cannot delete time entry. Deletion is only allowed within ${maxDays} days of creation.` 
          }, { status: 400 })
        }
      } else if (settings.timeLogEditMode === 'dayOfMonth') {
        const maxDayOfMonth = settings.timeLogEditDayOfMonth || 15
        const entryDayOfMonth = entryDate.getDate()
        if (entryDayOfMonth <= maxDayOfMonth) {
          return NextResponse.json({ 
            error: `Cannot delete time entry. Deletion is only allowed for entries created after day ${maxDayOfMonth} of each month.` 
          }, { status: 400 })
        }
      }
    }

    await TimeEntry.findByIdAndDelete(params.id)

    return NextResponse.json({ message: 'Time entry deleted successfully' })
  } catch (error) {
    console.error('Error deleting time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
