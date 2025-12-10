import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { Currency } from '@/models/Currency'
import bcrypt from 'bcryptjs'
import { saveDatabaseConfig, markSetupCompleted } from '@/lib/config'
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
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$', country: 'Taiwan', isMajor: true },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', country: 'Pakistan', isMajor: true },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', country: 'Bangladesh', isMajor: true },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: '₨', country: 'Sri Lanka', isMajor: true },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨', country: 'Nepal', isMajor: true },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', country: 'Myanmar', isMajor: true },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', country: 'Cambodia', isMajor: true },
  { code: 'LAK', name: 'Lao Kip', symbol: '₭', country: 'Laos', isMajor: true },
  { code: 'BND', name: 'Brunei Dollar', symbol: 'B$', country: 'Brunei', isMajor: true },

  // European Currencies
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', country: 'Sweden', isMajor: false },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', country: 'Norway', isMajor: false },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', country: 'Denmark', isMajor: false },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', country: 'Poland', isMajor: false },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', country: 'Czech Republic', isMajor: false },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', country: 'Hungary', isMajor: false },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', country: 'Romania', isMajor: false },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', country: 'Bulgaria', isMajor: false },
  { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', country: 'Croatia', isMajor: false },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин', country: 'Serbia', isMajor: false },
  { code: 'BAM', name: 'Bosnia and Herzegovina Mark', symbol: 'КМ', country: 'Bosnia and Herzegovina', isMajor: false },
  { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден', country: 'North Macedonia', isMajor: false },
  { code: 'ALL', name: 'Albanian Lek', symbol: 'L', country: 'Albania', isMajor: false },
  { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr', country: 'Iceland', isMajor: false },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', country: 'Ukraine', isMajor: false },
  { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br', country: 'Belarus', isMajor: false },
  { code: 'MDL', name: 'Moldovan Leu', symbol: 'L', country: 'Moldova', isMajor: false },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾', country: 'Georgia', isMajor: false },
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏', country: 'Armenia', isMajor: false },
  { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼', country: 'Azerbaijan', isMajor: false },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸', country: 'Kazakhstan', isMajor: false },
  { code: 'KGS', name: 'Kyrgyzstani Som', symbol: 'с', country: 'Kyrgyzstan', isMajor: false },
  { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'SM', country: 'Tajikistan', isMajor: false },
  { code: 'TMT', name: 'Turkmenistani Manat', symbol: 'T', country: 'Turkmenistan', isMajor: false },
  { code: 'UZS', name: 'Uzbekistani Som', symbol: 'сўм', country: 'Uzbekistan', isMajor: false },

  // Middle Eastern & African Currencies
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', country: 'United Arab Emirates', isMajor: false },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', country: 'Saudi Arabia', isMajor: false },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', country: 'Qatar', isMajor: false },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', country: 'Kuwait', isMajor: false },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'د.ب', country: 'Bahrain', isMajor: false },
  { code: 'OMR', name: 'Omani Rial', symbol: '﷼', country: 'Oman', isMajor: false },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا', country: 'Jordan', isMajor: false },
  { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل', country: 'Lebanon', isMajor: false },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', country: 'Israel', isMajor: false },
  { code: 'EGP', name: 'Egyptian Pound', symbol: '£', country: 'Egypt', isMajor: false },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', country: 'Turkey', isMajor: false },
  { code: 'IRR', name: 'Iranian Rial', symbol: '﷼', country: 'Iran', isMajor: false },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'د.ع', country: 'Iraq', isMajor: false },
  { code: 'AFN', name: 'Afghan Afghani', symbol: '؋', country: 'Afghanistan', isMajor: false },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa', isMajor: false },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', country: 'Nigeria', isMajor: false },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', country: 'Kenya', isMajor: false },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', country: 'Ghana', isMajor: false },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', country: 'Ethiopia', isMajor: false },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', country: 'Uganda', isMajor: false },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', country: 'Tanzania', isMajor: false },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'RF', country: 'Rwanda', isMajor: false },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', country: 'Burundi', isMajor: false },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj', country: 'Djibouti', isMajor: false },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'S', country: 'Somalia', isMajor: false },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk', country: 'Eritrea', isMajor: false },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س', country: 'Sudan', isMajor: false },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: '£', country: 'South Sudan', isMajor: false },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د', country: 'Libya', isMajor: false },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', country: 'Tunisia', isMajor: false },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج', country: 'Algeria', isMajor: false },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', country: 'Morocco', isMajor: false },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨', country: 'Mauritius', isMajor: false },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨', country: 'Seychelles', isMajor: false },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF', country: 'Comoros', isMajor: false },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar', country: 'Madagascar', isMajor: false },
  { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf', country: 'Maldives', isMajor: false },
  { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.', country: 'Bhutan', isMajor: false },
  { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$', country: 'Macau', isMajor: false },

  // American Currencies
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', country: 'Argentina', isMajor: false },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', country: 'Chile', isMajor: false },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', country: 'Colombia', isMajor: false },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', country: 'Peru', isMajor: false },
  { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U', country: 'Uruguay', isMajor: false },
  { code: 'PYG', name: 'Paraguayan Guarani', symbol: '₲', country: 'Paraguay', isMajor: false },
  { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs', country: 'Bolivia', isMajor: false },
  { code: 'VES', name: 'Venezuelan Bolívar', symbol: 'Bs.S', country: 'Venezuela', isMajor: false },
  { code: 'GYD', name: 'Guyanese Dollar', symbol: 'G$', country: 'Guyana', isMajor: false },
  { code: 'SRD', name: 'Surinamese Dollar', symbol: '$', country: 'Suriname', isMajor: false },
  { code: 'TTD', name: 'Trinidad and Tobago Dollar', symbol: 'TT$', country: 'Trinidad and Tobago', isMajor: false },
  { code: 'BBD', name: 'Barbadian Dollar', symbol: 'Bds$', country: 'Barbados', isMajor: false },
  { code: 'JMD', name: 'Jamaican Dollar', symbol: 'J$', country: 'Jamaica', isMajor: false },
  { code: 'BZD', name: 'Belize Dollar', symbol: 'BZ$', country: 'Belize', isMajor: false },
  { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q', country: 'Guatemala', isMajor: false },
  { code: 'HNL', name: 'Honduran Lempira', symbol: 'L', country: 'Honduras', isMajor: false },
  { code: 'NIO', name: 'Nicaraguan Córdoba', symbol: 'C$', country: 'Nicaragua', isMajor: false },
  { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡', country: 'Costa Rica', isMajor: false },
  { code: 'PAB', name: 'Panamanian Balboa', symbol: 'B/.', country: 'Panama', isMajor: false },
  { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$', country: 'Dominican Republic', isMajor: false },
  { code: 'HTG', name: 'Haitian Gourde', symbol: 'G', country: 'Haiti', isMajor: false },
  { code: 'CUP', name: 'Cuban Peso', symbol: '$', country: 'Cuba', isMajor: false },
  { code: 'XCD', name: 'East Caribbean Dollar', symbol: '$', country: 'Eastern Caribbean', isMajor: false },

  // Oceanian Currencies
  { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$', country: 'Fiji', isMajor: false },
  { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K', country: 'Papua New Guinea', isMajor: false },
  { code: 'SBD', name: 'Solomon Islands Dollar', symbol: 'SI$', country: 'Solomon Islands', isMajor: false },
  { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'Vt', country: 'Vanuatu', isMajor: false },
  { code: 'WST', name: 'Samoan Tala', symbol: 'WS$', country: 'Samoa', isMajor: false },
  { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$', country: 'Tonga', isMajor: false },
  { code: 'KID', name: 'Kiribati Dollar', symbol: '$', country: 'Kiribati', isMajor: false },

  // Cryptocurrencies
  { code: 'BTC', name: 'Bitcoin', symbol: '₿', country: 'Global', isMajor: false },
  { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', country: 'Global', isMajor: false },
  { code: 'LTC', name: 'Litecoin', symbol: 'Ł', country: 'Global', isMajor: false },
  { code: 'XRP', name: 'Ripple', symbol: 'XRP', country: 'Global', isMajor: false },
  { code: 'ADA', name: 'Cardano', symbol: '₳', country: 'Global', isMajor: false },
  { code: 'DOT', name: 'Polkadot', symbol: '●', country: 'Global', isMajor: false },
  { code: 'LINK', name: 'Chainlink', symbol: 'LINK', country: 'Global', isMajor: false },
  { code: 'UNI', name: 'Uniswap', symbol: 'UNI', country: 'Global', isMajor: false },
  { code: 'AAVE', name: 'Aave', symbol: 'AAVE', country: 'Global', isMajor: false },
  { code: 'SOL', name: 'Solana', symbol: '◎', country: 'Global', isMajor: false }
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
    const setupData = await request.json()
    console.log('Setup data received:', JSON.stringify(setupData, null, 2))
    
    // Validate required setup data
    if (!setupData.database) {
      throw new Error('Database configuration is missing')
    }
    if (!setupData.organization) {
      throw new Error('Organization configuration is missing')
    }
    if (!setupData.admin) {
      throw new Error('Admin user configuration is missing')
    }
    
    // Connect using unified connection system
    await connectDB()
    
    console.log('Successfully connected to MongoDB')
    
    // Create or update organization
    console.log('Creating/updating organization with data:', setupData.organization)
    const organizationData = {
      name: setupData.organization.name,
      domain: setupData.organization.domain,
      logo: setupData.organization.logo,
      darkLogo: setupData.organization.darkLogo,
      logoMode: setupData.organization.logoMode === 'dual' ? 'both' : setupData.organization.logoMode,
      timezone: setupData.organization.timezone,
      currency: setupData.organization.currency,
      language: setupData.organization.language,
      industry: setupData.organization.industry,
      size: setupData.organization.size,
      settings: {
        allowSelfRegistration: false,
        requireEmailVerification: true,
        defaultUserRole: 'team_member',
        projectTemplates: []
      },
      billing: {
        plan: 'free',
        maxUsers: 5,
        maxProjects: 3,
        features: ['basic_project_management', 'time_tracking', 'basic_reporting']
      },
      emailConfig: setupData.email ? {
        provider: setupData.email.provider,
        smtp: setupData.email.smtp,
        azure: setupData.email.azure
      } : undefined
    }
    
    console.log('Upserting organization...')
    const organization = await Organization.findOneAndUpdate(
      { name: setupData.organization.name }, // Find by name
      organizationData,
      { upsert: true, new: true, runValidators: true }
    )
    console.log('Organization upserted successfully:', organization._id)
    
    // Create or update admin user
    console.log('Creating/updating admin user with data:', setupData.admin)
    const hashedPassword = await bcrypt.hash(setupData.admin.password, 12)
    
    const adminUserData = {
      firstName: setupData.admin.firstName,
      lastName: setupData.admin.lastName,
      email: setupData.admin.email,
      password: hashedPassword,
      role: 'admin',
      organization: organization._id,
      isActive: true,
      emailVerified: true,
      timezone: setupData.organization.timezone,
      language: setupData.organization.language,
      currency: setupData.organization.currency,
      preferences: {
        theme: 'system',
        sidebarCollapsed: false,
        notifications: {
          email: true,
          inApp: true,
          push: false
        }
      }
    }
    
    console.log('Upserting admin user...')
    const adminUser = await User.findOneAndUpdate(
      { email: setupData.admin.email }, // Find by email
      adminUserData,
      { upsert: true, new: true, runValidators: true }
    )
    console.log('Admin user upserted successfully:', adminUser._id)

    // Generate and save avatar image if user doesn't have one
    if (!adminUser.avatar) {
      try {
        const { generateAvatarImage } = await import('@/lib/avatar-generator')
        const avatarUrl = await generateAvatarImage(
          adminUser._id.toString(),
          adminUser.firstName,
          adminUser.lastName
        )
        adminUser.avatar = avatarUrl
        await adminUser.save()
        console.log('Avatar generated for admin user')
      } catch (avatarError) {
        console.error('Failed to generate avatar for admin user (non-blocking):', avatarError)
        // Don't fail setup if avatar generation fails
      }
    }
    
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
    
    // Database configuration was already saved in the database step
    
    // Mark setup as completed
    markSetupCompleted(organization._id.toString())
    
    console.log('Setup completed successfully!')
    return NextResponse.json({ 
      success: true,
      message: 'Setup completed successfully',
      redirectTo: '/dashboard'
    })
  } catch (error) {
    console.error('Setup completion failed:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    
    return NextResponse.json(
      { 
        error: 'Setup completion failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
