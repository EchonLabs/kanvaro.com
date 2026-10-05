'use client';

import React from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeStringify from 'rehype-stringify';
import { DocNode } from '@/lib/docs/types';

interface MarkdownRendererProps {
  doc: DocNode;
  className?: string;
}

export function MarkdownRenderer({ doc, className = '' }: MarkdownRendererProps) {
  const [html, setHtml] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const renderMarkdown = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const processor = unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype)
          .use(rehypeSlug)
          .use(rehypeAutolinkHeadings, { 
            behavior: 'append',
            content: {
              type: 'element',
              tagName: 'span',
              properties: { className: ['anchor-link'] },
              children: [{ type: 'text', value: '#' }]
            }
          })
          .use(rehypeStringify);

        const result = await processor.process(doc.content);
        setHtml(String(result));
      } catch (err) {
        console.error('Markdown rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render markdown');
      } finally {
        setIsLoading(false);
      }
    };

    renderMarkdown();
  }, [doc.content]);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading content...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-8 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <h3 className="text-red-800 font-semibold mb-2">Rendering Error</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className={`prose prose-lg max-w-none ${className}`}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default MarkdownRenderer;
