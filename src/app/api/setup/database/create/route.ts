import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Currency } from '@/models/Currency'
import { saveDatabaseConfig } from '@/lib/config'
import connectDB from '@/lib/db-config'

// Currency data for seeding
const currencyData = [
  // Major Global Currencies
  { code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States', isMajor: true },
  { code: 'EUR', name: 'Euro', symbol: '€', country: 'European Union', isMajor: true },
  { code: 'GBP', name: 'British Pound Sterling', symbol: '£', country: 'United Kingdom', isMajor: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', country: 'Japan', isMajor: true },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', country: 'Switzerland', isMajor: true },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', country: 'Canada', isMajor: true },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', country: 'Australia', isMajor: true },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', country: 'New Zealand', isMajor: true },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', country: 'China', isMajor: true },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'India', isMajor: true },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', country: 'Brazil', isMajor: true },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', country: 'Hong Kong', isMajor: true },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', country: 'Singapore', isMajor: true },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', country: 'South Korea', isMajor: true },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', country: 'Thailand', isMajor: true },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', country: 'Malaysia', isMajor: true },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', country: 'Indonesia', isMajor: true },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', country: 'Philippines', isMajor: true },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', country: 'Vietnam', isMajor: true },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', country: 'Turkey', isMajor: true },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', country: 'Russia', isMajor: true },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa', isMajor: true },
  { code: 'EGP', name: 'Egyptian Pound', symbol: '£', country: 'Egypt', isMajor: true },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', country: 'Mexico', isMajor: true },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', country: 'Argentina', isMajor: true },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', country: 'Chile', isMajor: true },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', country: 'Colombia', isMajor: true },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', country: 'Peru', isMajor: true },
  { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U', country: 'Uruguay', isMajor: true },
  { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs', country: 'Bolivia', isMajor: true },
  { code: 'PYG', name: 'Paraguayan Guarani', symbol: '₲', country: 'Paraguay', isMajor: true },
  { code: 'VES', name: 'Venezuelan Bolivar', symbol: 'Bs.S', country: 'Venezuela', isMajor: true },
  { code: 'GYD', name: 'Guyanese Dollar', symbol: 'G$', country: 'Guyana', isMajor: true },
  { code: 'SRD', name: 'Surinamese Dollar', symbol: '$', country: 'Suriname', isMajor: true },
  { code: 'TTD', name: 'Trinidad and Tobago Dollar', symbol: 'TT$', country: 'Trinidad and Tobago', isMajor: true },
  { code: 'JMD', name: 'Jamaican Dollar', symbol: 'J$', country: 'Jamaica', isMajor: true },
  { code: 'BBD', name: 'Barbadian Dollar', symbol: 'Bds$', country: 'Barbados', isMajor: true },
  { code: 'BZD', name: 'Belize Dollar', symbol: 'BZ$', country: 'Belize', isMajor: true },
  { code: 'XCD', name: 'East Caribbean Dollar', symbol: 'EC$', country: 'Eastern Caribbean', isMajor: true },
  { code: 'AWG', name: 'Aruban Florin', symbol: 'ƒ', country: 'Aruba', isMajor: true },
  { code: 'BMD', name: 'Bermudian Dollar', symbol: 'BD$', country: 'Bermuda', isMajor: true },
  { code: 'KYD', name: 'Cayman Islands Dollar', symbol: 'CI$', country: 'Cayman Islands', isMajor: true },
  { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$', country: 'Fiji', isMajor: true },
  { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K', country: 'Papua New Guinea', isMajor: false },
  { code: 'SBD', name: 'Solomon Islands Dollar', symbol: 'SI$', country: 'Solomon Islands', isMajor: false },
  { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'Vt', country: 'Vanuatu', isMajor: false },
  { code: 'WST', name: 'Samoan Tala', symbol: 'WS$', country: 'Samoa', isMajor: false },
  { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$', country: 'Tonga', isMajor: false },
  { code: 'KID', name: 'Kiribati Dollar', symbol: '$', country: 'Kiribati', isMajor: false }
]

async function seedCurrencies() {
  try {
    console.log('Seeding currencies...')
    await Currency.insertMany(currencyData)
    console.log(`Successfully seeded ${currencyData.length} currencies`)
  } catch (error) {
    console.error('Error seeding currencies:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const config = await request.json()
    
    // For MongoDB, we don't actually "create" a database in the traditional sense
    // MongoDB creates databases automatically when you first write to them
    // What we're doing here is testing the connection and ensuring we can access the database
    
    // Build MongoDB URI with authentication
    // Always convert localhost to mongodb service name since we always run in Docker
    let host = config.host
    if (config.host === 'localhost') {
   //   host = 'mongodb'
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
    
    console.log('=== DATABASE CONNECTION DEBUG ===')
    console.log('Original config:', config)
    console.log('Host conversion - original:', config.host, 'converted:', host)
    console.log('Final URI:', uri)
    console.log('=== END DEBUG ===')
    
    // Save database configuration first so connectDB can use it
    console.log('Saving database configuration to config file...')
    saveDatabaseConfig({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      authSource: config.authSource,
      ssl: config.ssl,
      uri: uri
    })
    console.log('Database configuration saved successfully')
    
    // Now use the unified connection system
    const db = await connectDB()
    console.log('Connected using unified connection system')
    
    // Test basic operations to ensure database is accessible
    if (db.connection.db) {
      await db.connection.db.admin().ping()
      
      // Create a simple test collection to "initialize" the database
      const testCollection = db.connection.db.collection('_setup_test')
      await testCollection.insertOne({ 
        test: true, 
        createdAt: new Date() 
      })
      
      // Clean up test document
      await testCollection.deleteOne({ test: true })
      
      // Seed currencies if not already seeded
      console.log('Checking if currencies need to be seeded...')
      const existingCurrencies = await Currency.countDocuments()
      if (existingCurrencies === 0) {
        console.log('Seeding currencies...')
        await seedCurrencies()
        console.log('Currencies seeded successfully')
      } else {
        console.log(`Currencies already exist (${existingCurrencies} found)`)
      }
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Database is ready for use'
    })
  } catch (error) {
    console.error('Database creation failed:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // Provide more specific error messages
    let errorMessage = 'Database setup failed. Please check your connection settings.'
    let details = error instanceof Error ? error.message : 'Unknown error'
    
    if (details.includes('EAI_AGAIN') || details.includes('getaddrinfo')) {
      errorMessage = 'Cannot resolve database hostname. Please check your host and port settings.'
    } else if (details.includes('authentication failed') || details.includes('auth')) {
      errorMessage = 'Authentication failed. Please check your username and password.'
    } else if (details.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused. Please check if MongoDB is running and accessible.'
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: details
      },
      { status: 400 }
    )
  }
}
