'use client';

import React, { useState, useEffect, Suspense, useRef, startTransition, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DocNode, Audience, Category } from '@/lib/docs/types';
import { Sidebar } from './Sidebar';
import { AudienceFilter } from './AudienceFilter';
import { DocSearch } from './DocSearch';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DocsLayoutProps {
  doc?: DocNode;
  children?: React.ReactNode;
  visibility: 'public' | 'internal';
  initialAudience?: Audience;
  initialCategory?: Category;
  initialSearch?: string;
}

function DocsLayoutContent({ 
  doc, 
  children, 
  visibility,
  initialAudience,
  initialCategory,
  initialSearch
}: DocsLayoutProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedAudience, setSelectedAudience] = useState<Audience | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const referrerRef = useRef<string | null>(null);

  const syncQueryToUrl = useCallback(
    (aud?: Audience, cat?: Category, search?: string) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      if (aud) params.set('audience', aud);
      else params.delete('audience');
      if (cat) params.set('category', cat);
      else params.delete('category');
      if (search) params.set('search', search);
      else params.delete('search');
      const qs = params.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        router.replace(target, { scroll: false });
      });
    },
    [pathname, router]
  );

  // Store referrer on mount for back navigation
  useEffect(() => {
    if (typeof window !== 'undefined' && !referrerRef.current) {
      // Check if there's a referrer in sessionStorage (set by navigation)
      const storedReferrer = sessionStorage.getItem('docsReferrer');
      if (storedReferrer && storedReferrer !== pathname) {
        referrerRef.current = storedReferrer;
      } else if (document.referrer) {
        // Extract path from document.referrer if it's from our domain
        try {
          const referrerUrl = new URL(document.referrer);
          if (referrerUrl.origin === window.location.origin && referrerUrl.pathname !== pathname) {
            referrerRef.current = referrerUrl.pathname + referrerUrl.search;
          } else {
            referrerRef.current = '/dashboard';
          }
        } catch {
          referrerRef.current = '/dashboard';
        }
      } else {
        // Default to dashboard
        referrerRef.current = '/dashboard';
      }
    }
  }, [pathname]);

  // Initialize state from URL params or initial props
  useEffect(() => {
    const audience = searchParams.get('audience') as Audience || initialAudience;
    const category = searchParams.get('category') as Category || initialCategory;
    const search = searchParams.get('search') || initialSearch || '';
    
    setSelectedAudience(audience);
    setSelectedCategory(category);
    setSearchQuery(search);
  }, [searchParams, initialAudience, initialCategory, initialSearch]);

  // Push audience/category/search changes into URL so filters affect results
  useEffect(() => {
    syncQueryToUrl(selectedAudience, selectedCategory, searchQuery);
  }, [selectedAudience, selectedCategory, searchQuery, syncQueryToUrl]);

  // Handle back navigation with smooth transition
  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Use stored referrer or try browser history, fallback to dashboard
    const backUrl = referrerRef.current || '/dashboard';
    
    // Use startTransition for smooth, non-blocking navigation
    startTransition(() => {
      setIsNavigating(true);
      
      // Try browser back first if available, otherwise use stored referrer
      if (typeof window !== 'undefined' && window.history.length > 1 && !referrerRef.current) {
        router.back();
      } else {
        router.push(backUrl);
      }
      
      // Scroll to top instantly for smooth experience
      window.scrollTo({ top: 0, behavior: 'instant' });
      
      // Reset navigation state quickly
      setTimeout(() => setIsNavigating(false), 150);
    });
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-background border-r shadow-lg transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0 lg:flex-shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar 
          visibility={visibility}
          selectedAudience={selectedAudience}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onAudienceChange={setSelectedAudience}
          onCategoryChange={setSelectedCategory}
          onSearchChange={setSearchQuery}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-background border-b">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  disabled={isNavigating}
                  className="flex-shrink-0 transition-all duration-200 hover:bg-muted/80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isNavigating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowLeft className="h-4 w-4 mr-2" />
                  )}
                  <span>Back</span>
                </Button>
                <h1 className="text-xl font-semibold text-foreground">
                  {visibility === 'internal' ? 'Internal Documentation' : 'Documentation'}
                </h1>
              </div>
              
              <div className="flex items-center space-x-4">
                <AudienceFilter
                  selectedAudience={selectedAudience}
                  onAudienceChange={setSelectedAudience}
                  visibility={visibility}
                />
                <DocSearch
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  visibility={visibility}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {doc ? (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Doc header */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground mb-2">{doc.title}</h1>
                <p className="text-lg text-muted-foreground mb-4">{doc.summary}</p>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {doc.category.replace('-', ' ')}
                  </span>
                  <span>Updated {new Date(doc.updated).toISOString().split('T')[0]}</span>
                  <div className="flex space-x-1">
                    {doc.audiences.map(audience => (
                      <span 
                        key={audience}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground"
                      >
                        {audience.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table of contents */}
              {doc.headings.length > 0 && (
                <div className="mb-8 p-4 bg-muted/50 rounded-lg">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Table of Contents</h3>
                  <nav className="space-y-1">
                    {doc.headings.map((heading, index) => (
                      <a
                        key={index}
                        href={`#${heading.id}`}
                        className={`block text-sm text-muted-foreground hover:text-primary ${
                          heading.level === 1 ? 'font-medium' : 
                          heading.level === 2 ? 'ml-2' : 
                          heading.level === 3 ? 'ml-4' : 'ml-6'
                        }`}
                      >
                        {heading.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}

              {/* Doc content */}
              <MarkdownRenderer doc={doc} />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export function DocsLayout(props: DocsLayoutProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 rounded bg-primary/20 animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading documentation...</p>
        </div>
      </div>
    }>
      <DocsLayoutContent {...props} />
    </Suspense>
  );
}

export default DocsLayout;
