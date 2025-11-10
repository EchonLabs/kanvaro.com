const mongoose = require('mongoose')

// Connect to MongoDB using the same config as the app
const connectDB = async () => {
  try {
    // Use the same MongoDB URI pattern as the app
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kanvaro'
    await mongoose.connect(mongoUri)
    console.log('MongoDB connected')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

// Project schema (simplified for migration)
const ProjectSchema = new mongoose.Schema({
  name: String,
  description: String,
  status: String,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  isDraft: Boolean,
  organization: mongoose.Schema.Types.ObjectId,
  createdBy: mongoose.Schema.Types.ObjectId,
  projectNumber: Number,
  teamMembers: [mongoose.Schema.Types.ObjectId],
  client: mongoose.Schema.Types.ObjectId,
  startDate: Date,
  endDate: Date,
  budget: {
    total: Number,
    spent: Number,
    currency: String,
    categories: {
      labor: Number,
      materials: Number,
      overhead: Number,
      external: Number
    },
    lastUpdated: Date,
    updatedBy: mongoose.Schema.Types.ObjectId
  },
  accountManager: mongoose.Schema.Types.ObjectId,
  settings: {
    allowTimeTracking: Boolean,
    allowManualTimeSubmission: Boolean,
    allowExpenseTracking: Boolean,
    requireApproval: Boolean,
    notifications: {
      taskUpdates: Boolean,
      budgetAlerts: Boolean,
      deadlineReminders: Boolean
    },
    kanbanStatuses: [{
      key: String,
      title: String,
      color: String,
      order: Number
    }]
  },
  tags: [String],
  customFields: mongoose.Schema.Types.Mixed,
  attachments: [{
    name: String,
    url: String,
    size: Number,
    type: String,
    uploadedBy: mongoose.Schema.Types.ObjectId,
    uploadedAt: Date
  }],
  versions: [{
    name: String,
    version: String,
    description: String,
    releaseDate: Date,
    isReleased: Boolean,
    createdBy: mongoose.Schema.Types.ObjectId,
    createdAt: Date
  }],
  archived: Boolean,
  createdAt: Date,
  updatedAt: Date
}, {
  timestamps: true
})

const Project = mongoose.model('Project', ProjectSchema)

const migrateProjectPriority = async () => {
  try {
    await connectDB()
    
    // Find all projects that don't have a priority field
    const projectsWithoutPriority = await Project.find({
      priority: { $exists: false }
    })
    
    console.log(`Found ${projectsWithoutPriority.length} projects without priority field`)
    
    if (projectsWithoutPriority.length === 0) {
      console.log('No projects need migration')
      return
    }
    
    // Update all projects to have default priority
    const result = await Project.updateMany(
      { priority: { $exists: false } },
      { $set: { priority: 'medium' } }
    )
    
    console.log(`Successfully updated ${result.modifiedCount} projects with default priority`)
    
  } catch (error) {
    console.error('Migration error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('Migration completed')
  }
}

// Run migration
migrateProjectPriority()
