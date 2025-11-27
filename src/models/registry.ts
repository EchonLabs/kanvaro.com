/**
 * Models Registry
 * 
 * This file ensures all Mongoose models are registered before they're used.
 * Import this file in API routes to prevent MissingSchemaError when using populate().
 * 
 * Usage:
 *   import '@/models/registry'
 */

// Import all models to ensure they're registered with Mongoose
import './User'
import './Project'
import './Task'
import './Story'
import './Epic'
import './Sprint'
import './Organization'
import './CustomRole'
import './UserInvitation'
import './TimeEntry'
import './ActiveTimer'
import './TimeTrackingSettings'
import './Currency'
import './BudgetEntry'
import './BurnRate'
import './SprintEvent'
import './ProjectTemplate'
import './TaskTemplate'
import './Expense'
import './Invoice'
import './TestSuite'
import './TestCase'
import './TestPlan'
import './TestExecution'
import './ProjectVersion'
import './Counter'
import './Notification'

// Export all models for convenience
export * from './index'

