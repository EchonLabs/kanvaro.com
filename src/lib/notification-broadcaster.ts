/**
 * Notification Broadcaster Module
 * 
 * Manages SSE connections and broadcasting notifications to connected clients.
 * This module provides a centralized way to push real-time notifications
 * without requiring constant polling from clients.
 */

// Store active connections for each user
const userConnections = new Map<string, Set<ReadableStreamDefaultController>>()

// Encoder for SSE messages
const encoder = new TextEncoder()

interface NotificationMessage {
  type: 'connected' | 'heartbeat' | 'notification' | 'task_update'
  data?: any
  timestamp: number
  userId?: string
}

/**
 * Register a new SSE connection for a user
 */
export function registerConnection(userId: string, controller: ReadableStreamDefaultController): void {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set())
  }
  userConnections.get(userId)!.add(controller)
}

/**
 * Unregister an SSE connection for a user
 */
export function unregisterConnection(userId: string, controller: ReadableStreamDefaultController): void {
  const connections = userConnections.get(userId)
  if (connections) {
    connections.delete(controller)
    if (connections.size === 0) {
      userConnections.delete(userId)
    }
  }
}

/**
 * Send a message to a specific controller
 */
function sendToController(controller: ReadableStreamDefaultController, message: NotificationMessage): boolean {
  try {
    const data = `data: ${JSON.stringify(message)}\n\n`
    controller.enqueue(encoder.encode(data))
    return true
  } catch (error) {
    return false
  }
}

/**
 * Broadcast a notification to all connected clients for a specific user
 */
export function broadcastNotification(userId: string, notification: any): boolean {
  const connections = userConnections.get(userId)
  if (!connections || connections.size === 0) {
    return false
  }

  const message: NotificationMessage = {
    type: 'notification',
    data: notification,
    timestamp: Date.now()
  }

  let sent = false
  const deadConnections: ReadableStreamDefaultController[] = []

  connections.forEach((controller) => {
    if (sendToController(controller, message)) {
      sent = true
    } else {
      deadConnections.push(controller)
    }
  })

  // Remove dead connections
  deadConnections.forEach((controller) => connections.delete(controller))

  // Cleanup empty user entries
  if (connections.size === 0) {
    userConnections.delete(userId)
  }

  return sent
}

/**
 * Broadcast to multiple users at once
 */
export function broadcastToUsers(userIds: string[], notification: any): number {
  let successCount = 0
  for (const userId of userIds) {
    if (broadcastNotification(userId, notification)) {
      successCount++
    }
  }
  return successCount
}

/**
 * Broadcast a task update to a specific user
 */
export function broadcastTaskUpdate(userId: string, taskUpdate: any): boolean {
  const connections = userConnections.get(userId)
  if (!connections || connections.size === 0) {
    return false
  }

  const message: NotificationMessage = {
    type: 'task_update',
    data: taskUpdate,
    timestamp: Date.now()
  }

  let sent = false
  const deadConnections: ReadableStreamDefaultController[] = []

  connections.forEach((controller) => {
    if (sendToController(controller, message)) {
      sent = true
    } else {
      deadConnections.push(controller)
    }
  })

  // Remove dead connections
  deadConnections.forEach((controller) => connections.delete(controller))

  if (connections.size === 0) {
    userConnections.delete(userId)
  }

  return sent
}

/**
 * Send heartbeat to a specific user's connections
 */
export function sendHeartbeat(userId: string): void {
  const connections = userConnections.get(userId)
  if (!connections) return

  const message: NotificationMessage = {
    type: 'heartbeat',
    timestamp: Date.now()
  }

  const deadConnections: ReadableStreamDefaultController[] = []

  connections.forEach((controller) => {
    if (!sendToController(controller, message)) {
      deadConnections.push(controller)
    }
  })

  // Remove dead connections
  deadConnections.forEach((controller) => connections.delete(controller))

  if (connections.size === 0) {
    userConnections.delete(userId)
  }
}

/**
 * Get connection count for a specific user
 */
export function getConnectionCount(userId: string): number {
  return userConnections.get(userId)?.size || 0
}

/**
 * Get total active connections across all users
 */
export function getTotalConnections(): number {
  let total = 0
  userConnections.forEach((connections) => {
    total += connections.size
  })
  return total
}

/**
 * Check if a user has any active connections
 */
export function hasActiveConnection(userId: string): boolean {
  const connections = userConnections.get(userId)
  return connections !== undefined && connections.size > 0
}

/**
 * Get all connected user IDs
 */
export function getConnectedUserIds(): string[] {
  return Array.from(userConnections.keys())
}
