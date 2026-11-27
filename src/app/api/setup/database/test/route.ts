import { NextRequest, NextResponse } from 'next/server'
import { checkSetupOrPermission } from '@/lib/setup-guard'
import { Permission } from '@/lib/permissions/permission-definitions'
import { SECRET_MASK, SECRET_REENTRY_ERROR, resolveSecret, sameDestination } from '@/lib/settings/secret-mask'
import mongoose from 'mongoose'

/** Where MONGODB_PASSWORD belongs: the values GET /api/settings/database shows. */
function storedDatabaseDestination() {
  return {
    host: process.env.MONGODB_HOST || 'localhost',
    port: process.env.MONGODB_PORT || '27017',
    username: process.env.MONGODB_USERNAME || '',
    authSource: process.env.MONGODB_AUTH_SOURCE || 'admin'
  }
}
const DATABASE_DESTINATION = { host: ['host'], exact: ['port', 'username', 'authSource'] }

async function checkExistingData(db: any) {
  const existingData: any = {
    hasUsers: false,
    hasOrganization: false,
    hasEmailConfig: false,
    adminUser: null,
    organization: null,
    emailConfig: null
  }

  try {
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
  try {
    const { denied, setupCompleted } = await checkSetupOrPermission(Permission.SETTINGS_MANAGE_DATABASE)
    if (denied) return denied

    const config = await request.json()
    // The Settings page shows the stored password as a placeholder; test with
    // the real one (the same source GET /api/settings/database masks), but
    // only against the server and account it belongs to. Otherwise a caller
    // could send the mask plus their own host and capture a login handshake
    // with the real password. Before setup the mask is never issued and this
    // route is open to anyone, so the stored password is never used then.
    const passwordUnchanged = config.password === SECRET_MASK || config.password === undefined
    if (passwordUnchanged && !setupCompleted) {
      if (config.password === SECRET_MASK) {
        return NextResponse.json({ error: SECRET_REENTRY_ERROR }, { status: 400 })
      }
      // Omitted before setup: test without a password, as before.
    } else {
      const resolved = resolveSecret(
        config.password,
        process.env.MONGODB_PASSWORD,
        sameDestination(config, storedDatabaseDestination(), DATABASE_DESTINATION)
      )
      if ('reenter' in resolved) {
        return NextResponse.json({ error: SECRET_REENTRY_ERROR }, { status: 400 })
      }
      config.password = resolved.value
    }
    
    // Test MongoDB connection
    // Always convert localhost to mongodb service name since we always run in Docker
    let host = config.host
    if (config.host === 'localhost') {
      host = 'mongodb'
      console.log('Converting localhost to mongodb service name (Docker deployment)')
    }
    const port = config.port
    
    // Build URI with or without authentication
    let uri
    if (config.username && config.password) {
      uri = `mongodb://${config.username}:${config.password}@${host}:${port}/${config.database}?authSource=${config.authSource}`
    } else {
      uri = `mongodb://${host}:${port}/${config.database}`
    }
    
    await mongoose.connect(uri, {
      authSource: config.authSource,
      ssl: config.ssl,
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000
    })
    
    // Test basic operations
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping()
      
      // Check for existing data to pre-fill setup steps
      const existingData = await checkExistingData(mongoose.connection.db)
      
      // Close connection
      await mongoose.disconnect()
      
      return NextResponse.json({ 
        success: true,
        existingData 
      })
    }
    
    // Close connection
    await mongoose.disconnect()
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Database connection test failed:', error)
    return NextResponse.json(
      { error: 'Database connection failed' },
      { status: 400 }
    )
  }
}
