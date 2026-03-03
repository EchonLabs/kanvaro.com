import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'

async function checkExistingData(db: any) {
  const existingData: any = {
    databaseExists: false,
    hasUsers: false,
    hasOrganization: false,
    hasEmailConfig: false,
    adminUser: null,
    organization: null,
    organizationId: null,
    emailConfig: null
  }

  try {
    // Check if the database actually has any collections (i.e. it really exists)
    const collections = await db.listCollections().toArray()
    existingData.databaseExists = collections.length > 0

    if (!existingData.databaseExists) {
      return existingData
    }

    // Check for users collection and admin user
    const usersCollection = db.collection('users')
    const userCount = await usersCollection.countDocuments()
    if (userCount > 0) {
      existingData.hasUsers = true
      // Find admin user
      const adminUser = await usersCollection.findOne({ role: 'admin' })
      if (adminUser) {
        existingData.adminUser = {
          firstName: adminUser.firstName || '',
          lastName: adminUser.lastName || '',
          email: adminUser.email || '',
          // Don't include password for security
        }
      }
    }

    // Check for organizations collection
    const organizationsCollection = db.collection('organizations')
    const orgCount = await organizationsCollection.countDocuments()
    if (orgCount > 0) {
      existingData.hasOrganization = true
      const organization = await organizationsCollection.findOne()
      if (organization) {
        existingData.organizationId = organization._id?.toString() || null
        existingData.organization = {
          name: organization.name || '',
          domain: organization.domain || '',
          timezone: organization.timezone || 'UTC',
          currency: organization.currency || 'USD',
          language: organization.language || 'en',
          industry: organization.industry || '',
          size: organization.size || 'small',
          logoPreview: organization.logo || null,
          darkLogoPreview: organization.darkLogo || null,
          logoMode: organization.logoMode === 'both' || organization.logoMode === 'auto' ? 'dual' : 'single'
        }

        // Check for email configuration within the organization
        if (organization.emailConfig) {
          existingData.hasEmailConfig = true
          existingData.emailConfig = {
            provider: organization.emailConfig.provider || 'smtp',
            smtp: organization.emailConfig.smtp || null,
            azure: organization.emailConfig.azure || null
          }
        }
      }
    }

  } catch (error) {
    console.error('Error checking existing data:', error)
  }

  console.log('Existing data detected:', JSON.stringify(existingData, null, 2))
  return existingData
}

export async function POST(request: NextRequest) {
  let conn: mongoose.Connection | null = null

  try {
    const config = await request.json()

    // Use the host as provided by the user.
    // On local dev: "localhost" stays "localhost" (MongoDB runs locally).
    // In Docker: user should enter the service name (e.g. "mongodb") themselves.
    const host = config.host
    const port = config.port

    // Build URI — with or without authentication
    let uri: string
    if (config.username && config.password) {
      uri = `mongodb://${config.username}:${config.password}@${host}:${port}/${config.database}?authSource=${config.authSource || 'admin'}`
    } else {
      uri = `mongodb://${host}:${port}/${config.database}`
    }

    console.log('Testing DB connection to:', uri.replace(/\/\/.*:.*@/, '//<credentials>@'))

    // Use createConnection (NOT global mongoose.connect) so we don't
    // clobber the app's existing connection
    conn = await mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 8000,
    }).asPromise()

    // Test basic operations
    if (conn.db) {
      await conn.db.admin().ping()

      // Check for existing data to pre-fill setup steps
      const existingData = await checkExistingData(conn.db)

      // Close test connection
      await conn.close()
      conn = null

      return NextResponse.json({
        success: true,
        existingData
      })
    }

    // Close connection
    await conn.close()
    conn = null

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Database connection test failed:', error)

    // Clean up
    if (conn) {
      try { await conn.close() } catch {}
    }

    // Provide specific, helpful error messages
    const msg = error?.message || ''
    let errorMessage = 'Database connection failed. Please check your connection settings.'

    if (msg.includes('Authentication failed') || msg.includes('auth') || error?.codeName === 'AuthenticationFailed') {
      errorMessage = 'Authentication failed. The username or password is incorrect.'
    } else if (msg.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused. Make sure MongoDB is running on the specified host and port.'
    } else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      errorMessage = 'Cannot resolve hostname. Please check the host address.'
    } else if (msg.includes('timed out') || msg.includes('serverSelection')) {
      errorMessage = 'Connection timed out. MongoDB is not responding at the given host/port.'
    } else if (msg.includes('SSL') || msg.includes('TLS')) {
      errorMessage = 'SSL/TLS error. Check your SSL settings.'
    }

    return NextResponse.json(
      { error: errorMessage, details: msg },
      { status: 400 }
    )
  }
}
