import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { Organization } from '@/models/Organization'

export async function GET() {
  try {
    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      return NextResponse.json({
        provider: 'smtp',
        smtp: {
          host: process.env.SMTP_HOST || '',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true' || false,
          username: process.env.SMTP_USERNAME || '',
          password: process.env.SMTP_PASSWORD || '',
          fromEmail: process.env.SMTP_FROM_EMAIL || '',
          fromName: process.env.SMTP_FROM_NAME || ''
        },
        azure: {
          clientId: process.env.AZURE_CLIENT_ID || '',
          clientSecret: process.env.AZURE_CLIENT_SECRET || '',
          tenantId: process.env.AZURE_TENANT_ID || '',
          fromEmail: process.env.AZURE_FROM_EMAIL || '',
          fromName: process.env.AZURE_FROM_NAME || ''
        }
      })
    }
    
    await connectDB()
    
    // Get the organization's email configuration
    const organization = await Organization.findOne({})
    
    if (!organization || !organization.emailConfig) {
      return NextResponse.json({
        provider: 'smtp',
        smtp: {
          host: '',
          port: 587,
          secure: false,
          username: '',
          password: '',
          fromEmail: '',
          fromName: ''
        },
        azure: {
          clientId: '',
          clientSecret: '',
          tenantId: '',
          fromEmail: '',
          fromName: ''
        }
      })
    }
    
    return NextResponse.json(organization.emailConfig)
  } catch (error) {
    console.error('Email settings retrieval failed:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve email settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const emailConfig = await request.json()
    
    // Check if database is configured
    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      return NextResponse.json(
        { message: 'Email settings updated successfully (demo mode)' },
        { status: 200 }
      )
    }
    
    await connectDB()
    
    // Update the organization's email configuration
    const organization = await Organization.findOneAndUpdate(
      {},
      {
        emailConfig: {
          provider: emailConfig.provider,
          smtp: emailConfig.smtp,
          azure: emailConfig.azure
        }
      },
      { new: true, upsert: true }
    )
    
    if (!organization) {
      return NextResponse.json(
        { error: 'Failed to update email settings' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      message: 'Email settings updated successfully',
      emailConfig: organization.emailConfig
    })
  } catch (error) {
    console.error('Email settings update failed:', error)
    return NextResponse.json(
      { error: 'Failed to update email settings' },
      { status: 500 }
    )
  }
}
