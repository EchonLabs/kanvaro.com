import { NextResponse } from 'next/server'

// Importing the spec bundles it into the server build, so Swagger UI works
// even in deployments where `public/openapi.json` isn't served at `GET /openapi.json`.
import openapiSpec from '../../../../public/openapi.json'

export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(openapiSpec)
}
