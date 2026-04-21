'use client'

import dynamic from 'next/dynamic'

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false })

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold text-foreground">Kanvaro API Docs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Swagger UI for testing Kanvaro API endpoints.
        </p>
      </div>

      <div className="px-2 pb-8">
        <div className="max-w-6xl mx-auto">
          <SwaggerUI
            url="/api/openapi"
            requestInterceptor={(req: any) => {
              // Kanvaro auth uses HttpOnly cookies; include them so Swagger UI can
              // call /api/auth/login and then test authenticated endpoints.
              req.credentials = 'include'
              return req
            }}
          />
        </div>
      </div>
    </div>
  )
}
