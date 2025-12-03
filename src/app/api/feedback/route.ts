import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { category, title, description, email } = body

    // Validate required fields
    if (!category || !title || !description) {
      return NextResponse.json(
        { error: 'Category, title, and description are required' },
        { status: 400 }
      )
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        )
      }
    }

    // In a production environment, you would:
    // 1. Store the feedback in a database
    // 2. Send a notification to the team
    // 3. Create a GitHub issue automatically for bug reports
    
    // For now, we'll just log the feedback and return success
    console.log('Feedback submission:', {
      category,
      title,
      description,
      email: email || 'Not provided',
      timestamp: new Date().toISOString()
    })

    // Simulate a small delay for realistic UX
    await new Promise(resolve => setTimeout(resolve, 500))

    return NextResponse.json({
      success: true,
      message: 'Your feedback has been submitted successfully. Thank you for helping us improve!'
    })
  } catch (error) {
    console.error('Feedback submission error:', error)
    return NextResponse.json(
      { error: 'Failed to submit feedback. Please try again later.' },
      { status: 500 }
    )
  }
}

