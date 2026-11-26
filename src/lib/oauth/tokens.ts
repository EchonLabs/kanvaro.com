import crypto from 'crypto'
import fs from 'fs'
import jwt, { JwtPayload } from 'jsonwebtoken'
import {
  ACCESS_TOKEN_TTL,
  OAuthConfigError,
  SCOPE,
  getIssuer,
  getMcpResource,
} from './config'

export function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

export function randomToken(): string {
  return base64url(crypto.randomBytes(32))
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0 || a.length % 2 !== 0) {
    return false
  }
  if (!/^[0-9a-fA-F]+$/.test(a) || !/^[0-9a-fA-F]+$/.test(b)) {
    return false
  }
  const bufA = Buffer.from(a.toLowerCase(), 'hex')
  const bufB = Buffer.from(b.toLowerCase(), 'hex')
  if (bufA.length !== bufB.length) {
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) {
    return false
  }
  if (!/^[A-Za-z0-9\-_]{43,128}$/.test(challenge)) {
    return false
  }
  const computed = base64url(crypto.createHash('sha256').update(verifier, 'ascii').digest())
  const bufComputed = Buffer.from(computed, 'utf8')
  const bufChallenge = Buffer.from(challenge, 'utf8')
  if (bufComputed.length !== bufChallenge.length) {
    return false
  }
  return crypto.timingSafeEqual(bufComputed, bufChallenge)
}

export interface PublicJwk {
  kty: string
  crv: string
  x: string
  y: string
  kid: string
  use: 'sig'
  alg: 'ES256'
}

export interface McpAccessTokenPayload extends JwtPayload {
  sub: string
  client_id: string
  scope: string
  sid?: string
  jti: string
  iss: string
  aud: string
  exp: number
  iat: number
}

interface CachedSigningKey {
  rawPem: string
  privateKey: crypto.KeyObject
  publicKey: crypto.KeyObject
  publicJwk: PublicJwk
  kid: string
}

let cachedKey: CachedSigningKey | null = null

function loadRawPem(): string {
  const filePath = process.env.OAUTH_SIGNING_PRIVATE_KEY_FILE
  if (filePath && filePath.trim()) {
    try {
      return fs.readFileSync(filePath.trim(), 'utf8')
    } catch {
      throw new OAuthConfigError('OAuth signing key invalid')
    }
  }

  const inlinePem = process.env.OAUTH_SIGNING_PRIVATE_KEY
  if (inlinePem && inlinePem.trim()) {
    return inlinePem.replace(/\\n/g, '\n')
  }

  throw new OAuthConfigError('OAuth signing key is not configured')
}

export function getSigningKey(): CachedSigningKey {
  const rawPem = loadRawPem()
  if (cachedKey && cachedKey.rawPem === rawPem) {
    return cachedKey
  }

  let privateKey: crypto.KeyObject
  try {
    privateKey = crypto.createPrivateKey(rawPem)
  } catch {
    throw new OAuthConfigError('OAuth signing key invalid')
  }

  if (
    privateKey.asymmetricKeyType !== 'ec' ||
    privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
  ) {
    throw new OAuthConfigError('OAuth signing key invalid')
  }

  const publicKey = crypto.createPublicKey(privateKey)
  const jwk = publicKey.export({ format: 'jwk' }) as {
    kty?: string
    crv?: string
    x?: string
    y?: string
  }

  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new OAuthConfigError('OAuth signing key invalid')
  }

  // RFC 7638 JWK thumbprint for EC key: keys in exact lexicographical order with no whitespace
  const thumbprintInput = `{"crv":"P-256","kty":"EC","x":"${jwk.x}","y":"${jwk.y}"}`
  const kid = base64url(crypto.createHash('sha256').update(thumbprintInput, 'utf8').digest())

  const publicJwk: PublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
    kid,
    use: 'sig',
    alg: 'ES256',
  }

  cachedKey = { rawPem, privateKey, publicKey, publicJwk, kid }
  return cachedKey
}

export function getPublicJwks(): { keys: [PublicJwk] } {
  const { publicJwk } = getSigningKey()
  return { keys: [publicJwk] }
}

export function signMcpAccessToken(params: {
  userId: string
  clientId: string
  resource: string
  familyId: string
}): { token: string; expiresIn: number } {
  const { privateKey, kid } = getSigningKey()
  const issuer = getIssuer()

  const token = jwt.sign(
    {
      sub: params.userId,
      client_id: params.clientId,
      scope: SCOPE,
      sid: params.familyId,
    },
    privateKey,
    {
      algorithm: 'ES256',
      keyid: kid,
      issuer,
      audience: params.resource,
      expiresIn: ACCESS_TOKEN_TTL,
      jwtid: crypto.randomUUID(),
    }
  )

  return { token, expiresIn: ACCESS_TOKEN_TTL }
}

export function verifyMcpAccessToken(
  token: string,
  options?: { ignoreExpiration?: boolean }
): McpAccessTokenPayload {
  const { publicKey, kid } = getSigningKey()
  const issuer = getIssuer()
  const resource = getMcpResource()

  const decoded = jwt.decode(token, { complete: true })
  if (!decoded || typeof decoded !== 'object' || !decoded.header || decoded.header.kid !== kid) {
    throw new Error('Invalid token kid')
  }

  const verified = jwt.verify(token, publicKey, {
    algorithms: ['ES256'],
    issuer,
    audience: resource,
    clockTolerance: 30,
    ignoreExpiration: options?.ignoreExpiration ?? false,
  })

  if (!verified || typeof verified !== 'object') {
    throw new Error('Invalid token payload')
  }

  return verified as McpAccessTokenPayload
}
