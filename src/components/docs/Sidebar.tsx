'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Audience, Category, DocNode } from '@/lib/docs/types';

interface SidebarProps {
  visibility: 'public' | 'internal';
  selectedAudience?: Audience;
  selectedCategory?: Category;
  searchQuery: string;
  onAudienceChange: (audience?: Audience) => void;
  onCategoryChange: (category?: Category) => void;
  onSearchChange: (query: string) => void;
  onClose: () => void;
}

export function Sidebar({
  visibility,
  selectedAudience,
  selectedCategory,
  searchQuery,
  onAudienceChange,
  onCategoryChange,
  onSearchChange,
  onClose
}: SidebarProps) {
  const [docs, setDocs] = useState<DocNode[]>([]);
  const [categories, setCategories] = useState<Record<Category, DocNode[]>>({} as Record<Category, DocNode[]>);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const loadDocs = async () => {
      try {
        setIsLoading(true);
        
        // Load filtered docs
        const filterParams = new URLSearchParams({
          action: 'filter',
          visibility,
          ...(selectedAudience && { audience: selectedAudience }),
          ...(selectedCategory && { category: selectedCategory }),
          ...(searchQuery && { search: searchQuery })
        });
        
        const filteredResponse = await fetch(`/api/docs?${filterParams}`);
        const filteredDocs = await filteredResponse.json();
        setDocs(filteredDocs);

        // Load categories
        const categoriesParams = new URLSearchParams({
          action: 'categories',
          visibility
        });
        
        const categoriesResponse = await fetch(`/api/docs?${categoriesParams}`);
        const cats = await categoriesResponse.json();
        setCategories(cats);
      } catch (error) {
        console.error('Failed to load docs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDocs();
  }, [visibility, selectedAudience, selectedCategory, searchQuery]);

  const categoryLabels: Record<Category, string> = {
    concepts: 'Concepts',
    'how-to': 'How-to Guides',
    tutorial: 'Tutorials',
    reference: 'Reference',
    operations: 'Operations',
    'self-hosting': 'Self-hosting'
  };

  const isActive = (slug: string) => {
    return pathname.includes(slug);
  };

  return (
    <div className="h-full flex flex-col bg-background border-r">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {visibility === 'internal' ? 'Internal Docs' : 'Documentation'}
          </h2>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md text-muted-foreground hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-4 bg-muted rounded w-5/6"></div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            {/* Categories */}
            {Object.entries(categories).map(([category, categoryDocs]) => {
              if (categoryDocs.length === 0) return null;

              return (
                <div key={category} className="mb-6">
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    {categoryLabels[category as Category]}
                  </h3>
                  <nav className="space-y-1">
                    {categoryDocs.map((doc) => (
                      <Link
                        key={doc.slug}
                        href={`/docs/${visibility}/${doc.slug}`}
                        className={`
                          block px-3 py-2 text-sm rounded-md transition-colors
                          ${isActive(doc.slug)
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }
                        `}
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            sessionStorage.setItem('docsReferrer', pathname);
                          }
                          onClose();
                        }}
                      >
                        <div className="font-medium">{doc.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{doc.summary}</div>
                      </Link>
                    ))}
                  </nav>
                </div>
              );
            })}

            {/* No results */}
            {docs.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <div className="text-muted-foreground mb-2">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No documentation found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Try adjusting your filters or search query
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-muted/50">
        <div className="text-xs text-muted-foreground">
          <p>Last updated: {new Date().toISOString().split('T')[0]}</p>
          <p className="mt-1">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'} found
          </p>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
