/**
 * The analytics page's view of the API payload. Type-only re-exports from the
 * pure payload module, so nothing here reaches into Mongoose.
 */
export type {
  AggregateAnalyticsPayload,
  AnalyticsHeadline,
  AnalyticsPayload,
  AnalyticsView,
  FullAnalyticsPayload
} from '@/lib/standup/analytics-payload'

/** Where in the app this sprint lives — every stand-up-day link needs both ids. */
export interface SprintLinkContext {
  projectId: string
  sprintId: string
}
