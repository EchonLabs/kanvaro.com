'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface DocCardProps {
  href: string;
  title: string;
  summary: string;
  audiences?: string[];
  category?: string;
  children?: React.ReactNode;
}

export function DocCard({ href, title, summary, audiences, category, children }: DocCardProps) {
  const handleClick = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('docsReferrer', window.location.pathname);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <Link href={href} onClick={handleClick}>
        {children || (
          <>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg break-words">{title}</CardTitle>
              <CardDescription className="line-clamp-3 text-xs sm:text-sm">
                {summary}
              </CardDescription>
            </CardHeader>
            {(audiences || category) && (
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                  {audiences && audiences.length > 0 && (
                    <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                      {audiences.slice(0, 2).map(audience => (
                        <Badge key={audience} variant="secondary" className="text-xs flex-shrink-0">
                          {audience.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {category && (
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {category}
                    </Badge>
                  )}
                </div>
              </CardContent>
            )}
          </>
        )}
      </Link>
    </Card>
  );
}
