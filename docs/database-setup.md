---
slug: "self-hosting/database-setup"
title: "Database Setup & Seeding"
summary: "Database initialization, schema creation, and data seeding process for Kanvaro setup wizard with MongoDB support."
visibility: "public"
audiences: ["admin", "self_host_admin"]
category: "self-hosting"
order: 20
updated: "2025-01-04"
---

# Kanvaro - Database Setup & Seeding

## Overview

This document outlines the database initialization, schema creation, and data seeding process for Kanvaro's initial setup wizard. The system supports MongoDB with comprehensive schema design for project management, user management, and financial tracking.

## Database Initialization Process

### 1. Connection Testing
```typescript
// lib/database/connection.ts
import mongoose from 'mongoose';

export async function testDatabaseConnection(config: DatabaseConfig): Promise<boolean> {
  try {
    const uri = `mongodb://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;
    await mongoose.connect(uri, {
      authSource: config.authSource,
      ssl: config.ssl
    });
    
    // Test basic operations
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
```

### 2. Database Creation
```typescript
// lib/database/init.ts
export async function initializeDatabase(config: DatabaseConfig): Promise<void> {
  try {
    // Connect to MongoDB
    await connectToDatabase(config);
    
    // Create database if it doesn't exist
    await createDatabase(config.database);
    
    // Create collections
    await createCollections();
    
    // Create indexes
    await createIndexes();
    
    // Set up initial schema
    await setupInitialSchema();
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}
```

## Database Schema Design

### Core Collections

#### Users Collection
```typescript
// models/User.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'admin' | 'project_manager' | 'team_member' | 'client' | 'viewer';
  organization: mongoose.Types.ObjectId;
  isActive: boolean;
  avatar?: string;
  timezone: string;
  language: string;
  billingRate?: number;
  currency: string;
  lastLogin?: Date;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'project_manager', 'team_member', 'client', 'viewer'],
    default: 'team_member'
  },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  isActive: { type: Boolean, default: true },
  avatar: String,
  timezone: { type: String, default: 'UTC' },
  language: { type: String, default: 'en' },
  billingRate: Number,
  currency: { type: String, default: 'USD' },
  lastLogin: Date,
  emailVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ organization: 1, role: 1 });
UserSchema.index({ isActive: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
```

#### Organizations Collection
```typescript
// models/Organization.ts
export interface IOrganization extends Document {
  name: string;
  domain?: string;
  logo?: string;
  timezone: string;
  currency: string;
  language: string;
  industry?: string;
  size: 'startup' | 'small' | 'medium' | 'enterprise';
  settings: {
    allowSelfRegistration: boolean;
    requireEmailVerification: boolean;
    defaultUserRole: string;
    projectTemplates: mongoose.Types.ObjectId[];
  };
  billing: {
    plan: 'free' | 'starter' | 'professional' | 'enterprise';
    maxUsers: number;
    maxProjects: number;
    features: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true },
  domain: String,
  logo: String,
  timezone: { type: String, default: 'UTC' },
  currency: { type: String, default: 'USD' },
  language: { type: String, default: 'en' },
  industry: String,
  size: { 
    type: String, 
    enum: ['startup', 'small', 'medium', 'enterprise'],
    default: 'small'
  },
  settings: {
    allowSelfRegistration: { type: Boolean, default: false },
    requireEmailVerification: { type: Boolean, default: true },
    defaultUserRole: { type: String, default: 'team_member' },
    projectTemplates: [{ type: Schema.Types.ObjectId, ref: 'ProjectTemplate' }]
  },
  billing: {
    plan: { 
      type: String, 
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free'
    },
    maxUsers: { type: Number, default: 5 },
    maxProjects: { type: Number, default: 3 },
    features: [String]
  }
}, {
  timestamps: true
});

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
```

#### Projects Collection
```typescript
// models/Project.ts
export interface IProject extends Document {
  name: string;
  description: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  organization: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  teamMembers: mongoose.Types.ObjectId[];
  client?: mongoose.Types.ObjectId;
  startDate: Date;
  endDate?: Date;
  budget?: {
    total: number;
    spent: number;
    currency: string;
    categories: {
      materials: number;
      overhead: number;
    };
  };
  settings: {
    allowTimeTracking: boolean;
    allowExpenseTracking: boolean;
    requireApproval: boolean;
    notifications: {
      taskUpdates: boolean;
      budgetAlerts: boolean;
      deadlineReminders: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>({
  name: { type: String, required: true, trim: true },
  description: String,
  status: { 
    type: String, 
    enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
    default: 'planning'
  },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  client: { type: Schema.Types.ObjectId, ref: 'User' },
  startDate: { type: Date, required: true },
  endDate: Date,
  budget: {
    total: Number,
    spent: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    categories: {
      materials: { type: Number, default: 0 },
      overhead: { type: Number, default: 0 }
    }
  },
  settings: {
    allowTimeTracking: { type: Boolean, default: true },
    allowExpenseTracking: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: false },
    notifications: {
      taskUpdates: { type: Boolean, default: true },
      budgetAlerts: { type: Boolean, default: true },
      deadlineReminders: { type: Boolean, default: true }
    }
  }
}, {
  timestamps: true
});

// Indexes
ProjectSchema.index({ organization: 1, status: 1 });
ProjectSchema.index({ createdBy: 1 });
ProjectSchema.index({ teamMembers: 1 });
ProjectSchema.index({ startDate: 1, endDate: 1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
```

#### Tasks Collection
```typescript
// models/Task.ts
export interface ITask extends Document {
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  project: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  epic?: mongoose.Types.ObjectId;
  storyPoints?: number;
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  tags: string[];
  dependencies: mongoose.Types.ObjectId[];
  attachments: {
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
  }[];
  comments: {
    user: mongoose.Types.ObjectId;
    content: string;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>({
  title: { type: String, required: true, trim: true },
  description: String,
  status: { 
    type: String, 
    enum: ['todo', 'in_progress', 'review', 'done', 'cancelled'],
    default: 'todo'
  },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  epic: { type: Schema.Types.ObjectId, ref: 'Epic' },
  storyPoints: Number,
  dueDate: Date,
  estimatedHours: Number,
  actualHours: { type: Number, default: 0 },
  tags: [String],
  dependencies: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String
  }],
  comments: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    content: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Indexes
TaskSchema.index({ project: 1, status: 1 });
TaskSchema.index({ assignedTo: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ dueDate: 1 });
TaskSchema.index({ tags: 1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
```

## Data Seeding Process

### 1. Initial Admin User Creation
```typescript
// lib/database/seed.ts
export async function createAdminUser(userData: AdminUserData, organizationId: string): Promise<IUser> {
  const hashedPassword = await bcrypt.hash(userData.password, 12);
  
  const adminUser = new User({
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    password: hashedPassword,
    role: 'admin',
    organization: organizationId,
    isActive: true,
    emailVerified: true,
    timezone: userData.timezone || 'UTC',
    language: userData.language || 'en',
    currency: userData.currency || 'USD'
  });
  
  await adminUser.save();
  return adminUser;
}
```

### 2. Organization Setup
```typescript
export async function createOrganization(orgData: OrganizationData): Promise<IOrganization> {
  const organization = new Organization({
    name: orgData.name,
    domain: orgData.domain,
    logo: orgData.logo,
    timezone: orgData.timezone,
    currency: orgData.currency,
    language: orgData.language,
    industry: orgData.industry,
    size: orgData.size,
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
    }
  });
  
  await organization.save();
  return organization;
}
```

### 3. Default Data Seeding
```typescript
export async function seedDefaultData(organizationId: string): Promise<void> {
  // Create default project categories
  await createDefaultCategories(organizationId);
  
  // Create project templates
  await createProjectTemplates(organizationId);
  
  // Create notification templates
  await createNotificationTemplates(organizationId);
  
  // Create system settings
  await createSystemSettings(organizationId);
  
  // Create default workflows
  await createDefaultWorkflows(organizationId);
}
```

### 4. Project Categories
```typescript
// models/ProjectCategory.ts
export interface IProjectCategory extends Document {
  name: string;
  description: string;
  organization: mongoose.Types.ObjectId;
  color: string;
  isDefault: boolean;
  createdAt: Date;
}

const ProjectCategorySchema = new Schema<IProjectCategory>({
  name: { type: String, required: true },
  description: String,
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  color: { type: String, default: '#3B82F6' },
  isDefault: { type: Boolean, default: false }
}, {
  timestamps: true
});

export const ProjectCategory = mongoose.model<IProjectCategory>('ProjectCategory', ProjectCategorySchema);

async function createDefaultCategories(organizationId: string): Promise<void> {
  const defaultCategories = [
    { name: 'Web Development', description: 'Web development projects', color: '#3B82F6' },
    { name: 'Mobile App', description: 'Mobile application projects', color: '#10B981' },
    { name: 'Design', description: 'Design and creative projects', color: '#F59E0B' },
    { name: 'Marketing', description: 'Marketing and promotional projects', color: '#EF4444' },
    { name: 'Research', description: 'Research and analysis projects', color: '#8B5CF6' }
  ];
  
  for (const category of defaultCategories) {
    await ProjectCategory.create({
      ...category,
      organization: organizationId,
      isDefault: true
    });
  }
}
```

### 5. Project Templates
```typescript
// models/ProjectTemplate.ts
export interface IProjectTemplate extends Document {
  name: string;
  description: string;
  organization: mongoose.Types.ObjectId;
  tasks: {
    title: string;
    description: string;
    estimatedHours: number;
    priority: string;
    tags: string[];
  }[];
  settings: {
    allowTimeTracking: boolean;
    allowExpenseTracking: boolean;
    requireApproval: boolean;
  };
  isDefault: boolean;
  createdAt: Date;
}

const ProjectTemplateSchema = new Schema<IProjectTemplate>({
  name: { type: String, required: true },
  description: String,
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  tasks: [{
    title: String,
    description: String,
    estimatedHours: Number,
    priority: String,
    tags: [String]
  }],
  settings: {
    allowTimeTracking: { type: Boolean, default: true },
    allowExpenseTracking: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: false }
  },
  isDefault: { type: Boolean, default: false }
}, {
  timestamps: true
});

export const ProjectTemplate = mongoose.model<IProjectTemplate>('ProjectTemplate', ProjectTemplateSchema);

async function createProjectTemplates(organizationId: string): Promise<void> {
  const templates = [
    {
      name: 'Web Development Project',
      description: 'Standard web development project template',
      tasks: [
        { title: 'Project Setup', description: 'Initialize project structure', estimatedHours: 4, priority: 'high', tags: ['setup'] },
        { title: 'Design Review', description: 'Review and approve designs', estimatedHours: 2, priority: 'medium', tags: ['design'] },
        { title: 'Frontend Development', description: 'Develop frontend components', estimatedHours: 16, priority: 'high', tags: ['frontend'] },
        { title: 'Backend Development', description: 'Develop backend APIs', estimatedHours: 20, priority: 'high', tags: ['backend'] },
        { title: 'Testing', description: 'Test application functionality', estimatedHours: 8, priority: 'medium', tags: ['testing'] },
        { title: 'Deployment', description: 'Deploy to production', estimatedHours: 4, priority: 'high', tags: ['deployment'] }
      ]
    },
    {
      name: 'Mobile App Project',
      description: 'Mobile application development template',
      tasks: [
        { title: 'App Design', description: 'Create app wireframes and designs', estimatedHours: 12, priority: 'high', tags: ['design'] },
        { title: 'UI Development', description: 'Develop user interface', estimatedHours: 24, priority: 'high', tags: ['frontend'] },
        { title: 'API Integration', description: 'Integrate with backend APIs', estimatedHours: 16, priority: 'high', tags: ['backend'] },
        { title: 'Testing', description: 'Test app functionality', estimatedHours: 12, priority: 'medium', tags: ['testing'] },
        { title: 'App Store Submission', description: 'Submit to app stores', estimatedHours: 4, priority: 'high', tags: ['deployment'] }
      ]
    }
  ];
  
  for (const template of templates) {
    await ProjectTemplate.create({
      ...template,
      organization: organizationId,
      isDefault: true
    });
  }
}
```

## Database Indexes

### Performance Indexes
```typescript
// lib/database/indexes.ts
export async function createIndexes(): Promise<void> {
  // User indexes
  await User.collection.createIndex({ email: 1 }, { unique: true });
  await User.collection.createIndex({ organization: 1, role: 1 });
  await User.collection.createIndex({ isActive: 1 });
  
  // Project indexes
  await Project.collection.createIndex({ organization: 1, status: 1 });
  await Project.collection.createIndex({ createdBy: 1 });
  await Project.collection.createIndex({ teamMembers: 1 });
  await Project.collection.createIndex({ startDate: 1, endDate: 1 });
  
  // Task indexes
  await Task.collection.createIndex({ project: 1, status: 1 });
  await Task.collection.createIndex({ assignedTo: 1 });
  await Task.collection.createIndex({ createdBy: 1 });
  await Task.collection.createIndex({ dueDate: 1 });
  await Task.collection.createIndex({ tags: 1 });
  
  // Time tracking indexes
  await TimeEntry.collection.createIndex({ user: 1, date: 1 });
  await TimeEntry.collection.createIndex({ project: 1, date: 1 });
  await TimeEntry.collection.createIndex({ task: 1 });
  
  // Financial indexes
  await Expense.collection.createIndex({ project: 1, date: 1 });
  await Expense.collection.createIndex({ organization: 1, category: 1 });
  await Invoice.collection.createIndex({ organization: 1, status: 1 });
  await Invoice.collection.createIndex({ client: 1, createdAt: 1 });
}
```

## Database Validation

### Schema Validation
```typescript
// lib/database/validation.ts
export function validateDatabaseConnection(config: DatabaseConfig): ValidationResult {
  const errors: string[] = [];
  
  if (!config.host) errors.push('Database host is required');
  if (!config.port || config.port < 1 || config.port > 65535) errors.push('Valid database port is required');
  if (!config.database) errors.push('Database name is required');
  if (!config.username) errors.push('Database username is required');
  if (!config.password) errors.push('Database password is required');
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateAdminUser(userData: AdminUserData): ValidationResult {
  const errors: string[] = [];
  
  if (!userData.firstName?.trim()) errors.push('First name is required');
  if (!userData.lastName?.trim()) errors.push('Last name is required');
  if (!userData.email?.trim()) errors.push('Email is required');
  if (!isValidEmail(userData.email)) errors.push('Valid email is required');
  if (!userData.password) errors.push('Password is required');
  if (userData.password.length < 8) errors.push('Password must be at least 8 characters');
  if (userData.password !== userData.confirmPassword) errors.push('Passwords do not match');
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
```

## Error Handling & Recovery

### Database Setup Errors
```typescript
// lib/database/error-handling.ts
export class DatabaseSetupError extends Error {
  constructor(
    message: string,
    public step: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DatabaseSetupError';
  }
}

export async function handleDatabaseSetupError(error: Error, step: string): Promise<void> {
  console.error(`Database setup failed at step: ${step}`, error);
  
  // Log error for debugging
  await logSetupError(step, error.message);
  
  // Clean up partial setup if needed
  if (step === 'create_collections') {
    await cleanupPartialSetup();
  }
  
  throw new DatabaseSetupError(
    `Database setup failed: ${error.message}`,
    step,
    error
  );
}
```

---

*This database setup documentation will be updated as the schema evolves and new requirements are identified.*
