/**
 * The header every mutating stand-up request carries (RUN-23).
 *
 * Split out from `route-helpers.ts` so it can be imported from client
 * components without pulling in that module's server-only dependencies
 * (`next/headers`, `next/server`, DB access) into the client bundle.
 */
export const STANDUP_VERSION_HEADER = 'x-standup-version'
