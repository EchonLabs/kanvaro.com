import { NextRequest, NextResponse } from 'next/server'
import { emailService } from '@/lib/email/EmailService'

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

    // Log the feedback
    console.log('Feedback submission:', {
      category,
      title,
      description,
      email: email || 'Not provided',
      timestamp: new Date().toISOString()
    })

    // Try to send email to feedback@kanvaro.com
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">New Feedback Submission</h1>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">Category:</div>
              <div class="value">${category}</div>
            </div>
            <div class="field">
              <div class="label">Title:</div>
              <div class="value">${title}</div>
            </div>
            <div class="field">
              <div class="label">Description:</div>
              <div class="value">${description.replace(/\n/g, '<br>')}</div>
            </div>
            ${email ? `
            <div class="field">
              <div class="label">Email:</div>
              <div class="value">${email}</div>
            </div>
            ` : ''}
          </div>
        </div>
      </body>
      </html>
    `

    try {
      await emailService.sendEmail({
        to: 'feedback@kanvaro.com',
        subject: `Feedback [${category}]: ${title}`,
        html: emailHtml
      })
    } catch (emailError) {
      // Email sending failed, but we still log the submission
      console.error('Failed to send feedback email:', emailError)
      // Continue anyway - the feedback submission is still logged
    }

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

