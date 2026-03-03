import connectDB from '@/lib/db-config'
import { getOrgConnection, getModelOnConnection } from '@/lib/db-connection-manager'
import { getOrgConfigs } from '@/lib/config'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'

export interface AuthUser {
  id: string
  organization: string
  email: string
  role: string
  orgId: string
}

export async function withAuth(request: any, handler: (user: AuthUser) => Promise<any>) {
  const authResult = await authenticateUser()
  
  if ('error' in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), { 
      status: authResult.status,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return handler(authResult.user)
}

export async function authenticateUser(): Promise<{ user: AuthUser } | { error: string; status: number }> {
  try {
    const cookieStore = cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const refreshToken = cookieStore.get('refreshToken')?.value

    if (!accessToken && !refreshToken) {
      return { error: 'No authentication tokens', status: 401 }
    }

    // Helper: given a decoded JWT payload, connect to the right org DB and find the user
    // Returns { user, orgId } so callers know which org was resolved.
    async function resolveUser(decoded: any): Promise<{ user: any; resolvedOrgId: string } | null> {
      const orgId: string | undefined = decoded.orgId

      if (orgId) {
        try {
          await connectDB(orgId)
          const conn = await getOrgConnection(orgId)
          const UserModel = getModelOnConnection<any>('User', conn)
          const user = await UserModel.findById(decoded.userId)
          if (user) {
            console.log(`[auth] Resolved user ${decoded.userId} in org ${orgId} (db: ${conn.name})`)
            return { user, resolvedOrgId: orgId }
          }
        } catch (err) {
          console.warn('Could not find user in specified org, falling back to all orgs:', err)
        }
      }

      // Fallback: scan all configured orgs (handles legacy tokens without orgId)
      const orgs = getOrgConfigs()
      for (const org of orgs) {
        try {
          await connectDB(org.id)
          const conn = await getOrgConnection(org.id)
          const UserModel = getModelOnConnection<any>('User', conn)
          const user = await UserModel.findById(decoded.userId)
          if (user) {
            console.log(`[auth] Resolved user ${decoded.userId} in org ${org.id} (db: ${conn.name}) via fallback scan`)
            return { user, resolvedOrgId: org.id }
          }
        } catch {
          // skip unreachable org
        }
      }
      return null
    }

    let userData = null

    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as any
        const result = await resolveUser(decoded)
        if (result && result.user.isActive) {
          // Re-set the org context so downstream code uses the right DB
          await connectDB(result.resolvedOrgId)
          userData = {
            id: result.user._id,
            organization: result.user.organization,
            email: result.user.email,
            role: result.user.role,
            orgId: result.resolvedOrgId,
          }
        }
      } catch {
        // Try refresh token
        if (refreshToken) {
          try {
            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any
            const result = await resolveUser(decoded)
            if (result && result.user.isActive) {
              await connectDB(result.resolvedOrgId)
              const newAccessToken = jwt.sign(
                { userId: result.user._id, email: result.user.email, role: result.user.role, orgId: result.resolvedOrgId },
                JWT_SECRET,
                { expiresIn: '15m' }
              )
              cookieStore.set('accessToken', newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 15 * 60
              })
              userData = {
                id: result.user._id,
                organization: result.user.organization,
                email: result.user.email,
                role: result.user.role,
                orgId: result.resolvedOrgId,
              }
            }
          } catch {
            return { error: 'Invalid authentication tokens', status: 401 }
          }
        } else {
          return { error: 'Invalid access token', status: 401 }
        }
      }
    } else if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any
        const result = await resolveUser(decoded)
        if (result && result.user.isActive) {
          await connectDB(result.resolvedOrgId)
          const newAccessToken = jwt.sign(
            { userId: result.user._id, email: result.user.email, role: result.user.role, orgId: result.resolvedOrgId },
            JWT_SECRET,
            { expiresIn: '15m' }
          )
          cookieStore.set('accessToken', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60
          })
          userData = {
            id: result.user._id,
            organization: result.user.organization,
            email: result.user.email,
            role: result.user.role,
            orgId: result.resolvedOrgId,
          }
        }
      } catch {
        return { error: 'Invalid refresh token', status: 401 }
      }
    }

    if (!userData) {
      return { error: 'User not found or inactive', status: 401 }
    }

    return { user: userData }
  } catch (error) {
    console.error('Authentication error:', error)
    return { error: 'Internal server error', status: 500 }
  }
}

