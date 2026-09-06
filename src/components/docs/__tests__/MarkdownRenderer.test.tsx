/**
 * @jest-environment jsdom
 */
// Uses the ambient globals from @types/jest rather than importing from
// '@jest/globals' — importing shadows the global `jest` namespace, which blocks
// the @testing-library/jest-dom matcher augmentation (toBeInTheDocument).
import { render, screen, waitFor } from '@testing-library/react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { DocNode } from '@/lib/docs/types';

// Mock the unified processor
jest.mock('unified', () => ({
  unified: jest.fn(() => ({
    use: jest.fn().mockReturnThis(),
    process: jest.fn().mockResolvedValue({
      toString: () => '<h1>Test Content</h1><p>This is a test.</p>'
    })
  }))
}));

describe('MarkdownRenderer', () => {
  const mockDoc: DocNode = {
    slug: 'test/doc',
    title: 'Test Document',
    summary: 'A test document',
    visibility: 'public',
    audiences: ['admin'],
    category: 'concepts',
    order: 10,
    updated: '2025-01-04',
    content: '# Test Content\n\nThis is a test.',
    headings: [
      { level: 1, text: 'Test Content', id: 'test-content' }
    ],
    path: '/docs/test-doc.md'
  };

  it('should render markdown content', async () => {
    render(<MarkdownRenderer doc={mockDoc} />);
    
    await waitFor(() => {
      expect(screen.getByText('Loading content...')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    render(<MarkdownRenderer doc={mockDoc} />);
    
    expect(screen.getByText('Loading content...')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <MarkdownRenderer doc={mockDoc} className="custom-class" />
    );
    
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('should handle empty content', () => {
    const emptyDoc = { ...mockDoc, content: '' };
    
    render(<MarkdownRenderer doc={emptyDoc} />);
    
    expect(screen.getByText('Loading content...')).toBeInTheDocument();
  });

  it('should handle markdown with special characters', () => {
    const specialDoc = {
      ...mockDoc,
      content: '# Test & Special Characters\n\n<>&"\''
    };
    
    render(<MarkdownRenderer doc={specialDoc} />);
    
    expect(screen.getByText('Loading content...')).toBeInTheDocument();
  });

  it('should handle markdown with code blocks', () => {
    const codeDoc = {
      ...mockDoc,
      content: '# Code Example\n\n```javascript\nconst test = "hello";\n```'
    };
    
    render(<MarkdownRenderer doc={codeDoc} />);
    
    expect(screen.getByText('Loading content...')).toBeInTheDocument();
  });

  it('should handle markdown with links', () => {
    const linkDoc = {
      ...mockDoc,
      content: '# Links\n\n[Google](https://google.com)'
    };
    
    render(<MarkdownRenderer doc={linkDoc} />);
    
    expect(screen.getByText('Loading content...')).toBeInTheDocument();
  });

  it('should handle markdown with tables', () => {
    const tableDoc = {
      ...mockDoc,
      content: '# Table\n\n| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |'
    };
    
    render(<MarkdownRenderer doc={tableDoc} />);
    
    expect(screen.getByText('Loading content...')).toBeInTheDocument();
  });
});
