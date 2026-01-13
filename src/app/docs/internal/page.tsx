import { redirect } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { authenticateUser } from '@/lib/auth-utils';
import { DocsLoader } from '@/lib/docs/loader';
import { DocsLayout } from '@/components/docs/DocsLayout';
import { DocCard } from '@/components/docs/DocCard';
import { Category, Audience } from '@/lib/docs/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Permission } from '@/lib/permissions/permission-definitions';
import { PermissionService } from '@/lib/permissions/permission-service';

interface PageProps {
  searchParams: {
    audience?: string;
    category?: string;
    search?: string;
  };
}

const categoryLabels: Record<Category, string> = {
  concepts: 'Concepts',
  'how-to': 'How-to Guides',
  tutorial: 'Tutorials',
  reference: 'Reference',
  operations: 'Operations',
  'self-hosting': 'Self-hosting'
};

const audienceLabels: Record<Audience, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  team_member: 'Team Member',
  client: 'Client',
  viewer: 'Viewer',
  self_host_admin: 'Self-host Admin'
};

// Add a simple synchronous log at module load time

export default async function InternalDocsIndex({ searchParams }: PageProps) {

  // TEMPORARY: Skip auth for testing

  // Mock user data for testing
  const mockAuth = {
    user: {
      id: 'test-user',
      email: 'test@example.com',
      role: 'admin',
      organization: 'test-org'
    }
  }

  // const auth = await authenticateUser();

  // if ('error' in auth) {
  //   console.log('Internal Docs: Authentication failed:', auth.error, 'Status:', auth.status)
  //   console.log('Internal Docs: Full auth result:', JSON.stringify(auth, null, 2))
  //   redirect('/login?redirect=/docs/internal');
  // }

  // console.log('Internal Docs: User authenticated successfully')
  // console.log('Internal Docs: User data:', {
  //   id: auth.user.id,
  //   email: auth.user.email,
  //   role: auth.user.role,
  //   organization: auth.user.organization,
  //   fullUser: auth.user
  // })

  // TEMPORARY: Skip permission checks for testing
  const hasViewPermission = true;
  const hasSearchPermission = true;

  // // Check user permissions for documentation access
  // console.log('Internal Docs: Starting permission checks for user:', auth.user.id)

  // let hasViewPermission = false;
  // let hasSearchPermission = false;

  // try {
  //   [hasViewPermission, hasSearchPermission] = await Promise.all([
  //     PermissionService.hasPermission(auth.user.id, Permission.DOCUMENTATION_VIEW),
  //     PermissionService.hasPermission(auth.user.id, Permission.DOCUMENTATION_SEARCH)
  //   ]);

  //   console.log('Internal Docs: Permission check results:', {
  //     hasViewPermission,
  //     hasSearchPermission,
  //     DOCUMENTATION_VIEW: Permission.DOCUMENTATION_VIEW,
  //     DOCUMENTATION_SEARCH: Permission.DOCUMENTATION_SEARCH
  //   })

  //   // If user doesn't have view permission, redirect to login
  //   if (!hasViewPermission) {
  //     console.log('Internal Docs: User does not have DOCUMENTATION_VIEW permission, redirecting to login')
  //     console.log('Internal Docs: User role:', auth.user.role, '- checking if this role has DOCUMENTATION_VIEW')

  //     // Let's also check what permissions this user actually has
  //     const userPermissions = await PermissionService.getUserPermissions(auth.user.id);
  //     console.log('Internal Docs: User actual permissions:', {
  //       globalPermissions: userPermissions.globalPermissions,
  //       userRole: userPermissions.userRole,
  //       hasDocumentationView: userPermissions.globalPermissions.includes(Permission.DOCUMENTATION_VIEW)
  //     })

  //     redirect('/login?redirect=/docs/internal');
  //   }

  //   console.log('Internal Docs: All checks passed, proceeding to render docs')
  // } catch (permissionError) {
  //   console.error('Internal Docs: Permission check failed with error:', permissionError)
  //   console.log('Internal Docs: Redirecting to login due to permission error')
  //   redirect('/login?redirect=/docs/internal');
  // }

  const userRole = mockAuth.user.role || 'viewer'; // Default to viewer if no role

  const { audience, category, search } = searchParams;

  // Get all docs (both internal and public) for authenticated users, then filter based on user permissions
  const allDocs = await DocsLoader.getIndex();
  const allInternalDocs = allDocs.nodes.filter(doc => doc.visibility === 'internal' || doc.visibility === 'public');

  // Filter docs based on user's role/audience access
  let accessibleDocs = allInternalDocs;
  if (audience) {
    // If audience filter is applied, use it
    accessibleDocs = allInternalDocs.filter(doc => doc.audiences.includes(audience as Audience));
  } else {
    // Otherwise, show docs that are accessible to the user's role or are general
    const roleAudienceMap: Record<string, Audience[]> = {
      'super_admin': ['admin', 'project_manager', 'team_member', 'client', 'viewer', 'self_host_admin'],
      'admin': ['admin', 'project_manager', 'team_member', 'client', 'viewer'],
      'project_manager': ['admin', 'project_manager', 'team_member', 'client', 'viewer'],
      'team_member': ['team_member', 'client', 'viewer'],
      'client': ['client', 'viewer'],
      'viewer': ['viewer'],
      'qa_engineer': ['admin', 'project_manager', 'team_member', 'client', 'viewer'],
      'tester': ['team_member', 'client', 'viewer'],
      'human_resource': ['admin', 'project_manager', 'team_member', 'client', 'viewer']
    };

    const allowedAudiences = roleAudienceMap[userRole] || ['viewer'];
    accessibleDocs = allInternalDocs.filter(doc =>
      doc.audiences.some(audience => allowedAudiences.includes(audience)) ||
      doc.audiences.length === 0 // Include docs with no audience restrictions
    );
  }

  // Apply category and search filters
  let docs = accessibleDocs;
  if (category) {
    docs = docs.filter(doc => doc.category === category);
  }

  if (search && hasSearchPermission) {
    // Use enhanced search from DocsLoader
    const searchTerms = (DocsLoader as any).expandSearchTerms(search);
    docs = docs.filter(doc => {
      const searchableText = [
        doc.title,
        doc.summary,
        ...doc.headings.map(h => h.text),
        doc.content
      ].join(' ').toLowerCase();

      return searchTerms.some((term: string) => searchableText.includes(term));
    });
  }

  const categories = await DocsLoader.getCategories('internal');
  const audiences = await DocsLoader.getAudiences('internal');

  // Also get public categories and audiences and merge them
  const publicCategories = await DocsLoader.getCategories('public');
  const publicAudiences = await DocsLoader.getAudiences('public');

  // Merge categories and audiences
  Object.entries(publicCategories).forEach(([category, docs]) => {
    if (!categories[category as Category]) {
      categories[category as Category] = [];
    }
    categories[category as Category].push(...docs.filter(doc => doc.visibility === 'public'));
  });

  Object.entries(publicAudiences).forEach(([audience, docs]) => {
    if (!audiences[audience as Audience]) {
      audiences[audience as Audience] = [];
    }
    audiences[audience as Audience].push(...docs.filter(doc => doc.visibility === 'public'));
  });

  return (
    <DocsLayout
      visibility="internal"
      initialAudience={audience as Audience}
      initialCategory={category as Category}
      initialSearch={search}
      searchEnabled={hasSearchPermission}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-2 sm:mb-4 truncate">
            Internal Documentation
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground mb-4 sm:mb-6">
            Advanced guides, operations runbooks, and configuration matrices for administrators and technical teams.
          </p>
          
          {/* Quick stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 sm:mb-8">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold text-destructive break-words">{docs.length}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Internal Documents</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold text-orange-600 break-words">{Object.keys(categories).length}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Categories</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold text-purple-600 break-words">{Object.keys(audiences).length}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Audiences</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Categories */}
        {Object.entries(categories).map(([categoryKey, categoryDocs]) => {
          if (categoryDocs.length === 0) return null;

          return (
            <div key={categoryKey} className="mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-3 sm:mb-4 truncate">
                {categoryLabels[categoryKey as Category]}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {categoryDocs.map((doc) => (
                  <DocCard
                    key={doc.slug}
                    href={`/docs/internal/${doc.slug}`}
                    title={doc.title}
                    summary={doc.summary}
                  >
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-base sm:text-lg break-words">{doc.title}</CardTitle>
                      <CardDescription className="line-clamp-3 text-xs sm:text-sm">
                        {doc.summary}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                          {doc.audiences.slice(0, 2).map(audience => (
                            <Badge key={audience} variant="secondary" className="text-xs flex-shrink-0">
                              {audienceLabels[audience]}
                            </Badge>
                          ))}
                          {doc.audiences.length > 2 && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                              +{doc.audiences.length - 2} more
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                          {new Date(doc.updated).toISOString().split('T')[0]}
                        </span>
                      </div>
                    </CardContent>
                  </DocCard>
                ))}
              </div>
            </div>
          );
        })}

        {/* No results */}
        {docs.length === 0 && (
          <div className="text-center py-8 sm:py-12 px-4">
            <div className="text-muted-foreground mb-4">
              <svg className="mx-auto h-12 w-12 sm:h-16 sm:w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">No internal documentation found</h3>
            <p className="text-sm sm:text-base text-muted-foreground mb-4">
              Try adjusting your filters or search query to find what you're looking for.
            </p>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/docs/internal">
                View All Internal Documentation
              </Link>
            </Button>
          </div>
        )}

        {/* Operations Quick Access */}
        <Card className="mt-12 sm:mt-16 bg-destructive/5 border-destructive/20">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl text-foreground truncate">
              Operations Quick Access
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Critical operational guides for system administrators and technical teams.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DocCard href="/docs/internal/operations/deployment" title="" summary="">
                <CardContent className="flex items-center p-3 sm:p-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-3 sm:ml-4 flex-1 min-w-0">
                    <h3 className="text-xs sm:text-sm font-medium text-foreground truncate">Deployment Guide</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground break-words">Production deployment procedures</p>
                  </div>
                </CardContent>
              </DocCard>
              
              <DocCard href="/docs/internal/operations/monitoring" title="" summary="">
                <CardContent className="flex items-center p-3 sm:p-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-3 sm:ml-4 flex-1 min-w-0">
                      <h3 className="text-xs sm:text-sm font-medium text-foreground truncate">System Monitoring</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground break-words">Health checks and monitoring setup</p>
                    </div>
                  </CardContent>
                </DocCard>
              </div>
            </CardContent>
          </Card>
        </div>
      </DocsLayout>
    );
  }
  
  export const metadata = {
  title: 'Internal Documentation - Kanvaro',
  description: 'Advanced guides, operations runbooks, and configuration matrices for administrators and technical teams.',
  openGraph: {
    title: 'Kanvaro Internal Documentation',
    description: 'Advanced guides, operations runbooks, and configuration matrices for administrators and technical teams.',
    type: 'website',
  },
};