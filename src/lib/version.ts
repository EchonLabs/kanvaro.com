// Utility to expose the app version on the client

import packageJson from '../../package.json'

export function getAppVersion(): string {
  const explicitVersion = (process.env.NEXT_PUBLIC_APP_VERSION || '').trim()
  if (explicitVersion) return explicitVersion

  const packageVersion = (packageJson.version || '').trim()
  if (packageVersion) return packageVersion

  const commitSha = (process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || '').trim()
  if (commitSha) return `sha:${commitSha.slice(0, 7)}`

  return 'dev'
}


