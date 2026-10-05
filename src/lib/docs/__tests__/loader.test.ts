import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { DocsLoader } from '../loader';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DocsLoader', () => {
  const mockDocContent = `---
slug: "test/doc"
title: "Test Document"
summary: "A test document for unit testing"
visibility: "public"
audiences: ["admin", "team_member"]
category: "concepts"
order: 10
updated: "2025-01-04"
---

# Test Document

This is a test document content.

## Section 1

Some content here.

## Section 2

More content here.
`;

  beforeEach(() => {
    jest.clearAllMocks();
    // DocsLoader memoises its index; without this, each test observes the
    // previous test's build and the fs mocks appear to do nothing.
    DocsLoader.clearCache();
    
    // Mock file system
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['test-doc.md'] as any);
    mockedFs.readFileSync.mockReturnValue(mockDocContent);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getIndex', () => {
    it('should load and parse documents correctly', async () => {
      const index = await DocsLoader.getIndex();
      
      expect(index.nodes).toHaveLength(1);
      expect(index.nodes[0].slug).toBe('test/doc');
      expect(index.nodes[0].title).toBe('Test Document');
      expect(index.nodes[0].visibility).toBe('public');
      expect(index.nodes[0].audiences).toEqual(['admin', 'team_member']);
      expect(index.nodes[0].category).toBe('concepts');
    });

    it('should build categories correctly', async () => {
      const index = await DocsLoader.getIndex();
      
      expect(index.categories.concepts).toHaveLength(1);
      expect(index.categories.concepts[0].slug).toBe('test/doc');
    });

    it('should build audience index correctly', async () => {
      const index = await DocsLoader.getIndex();
      
      expect(index.byAudience.admin).toHaveLength(1);
      expect(index.byAudience.team_member).toHaveLength(1);
      expect(index.byAudience.client).toHaveLength(0);
    });

    it('should extract headings correctly', async () => {
      const index = await DocsLoader.getIndex();
      const doc = index.nodes[0];
      
      expect(doc.headings).toHaveLength(3);
      expect(doc.headings[0]).toEqual({ id: 'test-document', level: 1, text: 'Test Document' });
      expect(doc.headings[1]).toEqual({ id: 'section-1', level: 2, text: 'Section 1' });
      expect(doc.headings[2]).toEqual({ id: 'section-2', level: 2, text: 'Section 2' });
    });
  });

  describe('getDocBySlug', () => {
    it('should return document by slug', async () => {
      const doc = await DocsLoader.getDocBySlug('test/doc');
      
      expect(doc).toBeTruthy();
      expect(doc?.slug).toBe('test/doc');
      expect(doc?.title).toBe('Test Document');
    });

    it('should return null for non-existent slug', async () => {
      const doc = await DocsLoader.getDocBySlug('non-existent');
      
      expect(doc).toBeNull();
    });

    it('should filter by visibility', async () => {
      const publicDoc = await DocsLoader.getDocBySlug('test/doc', 'public');
      const internalDoc = await DocsLoader.getDocBySlug('test/doc', 'internal');
      
      expect(publicDoc).toBeTruthy();
      expect(internalDoc).toBeNull();
    });
  });

  describe('getDocsByFilter', () => {
    it('should filter by visibility', async () => {
      const publicDocs = await DocsLoader.getDocsByFilter({ visibility: 'public' });
      const internalDocs = await DocsLoader.getDocsByFilter({ visibility: 'internal' });
      
      expect(publicDocs).toHaveLength(1);
      expect(internalDocs).toHaveLength(0);
    });

    it('should filter by audience', async () => {
      const adminDocs = await DocsLoader.getDocsByFilter({ audience: 'admin' });
      const clientDocs = await DocsLoader.getDocsByFilter({ audience: 'client' });
      
      expect(adminDocs).toHaveLength(1);
      expect(clientDocs).toHaveLength(0);
    });

    it('should filter by category', async () => {
      const conceptDocs = await DocsLoader.getDocsByFilter({ category: 'concepts' });
      const howToDocs = await DocsLoader.getDocsByFilter({ category: 'how-to' });
      
      expect(conceptDocs).toHaveLength(1);
      expect(howToDocs).toHaveLength(0);
    });

    it('should filter by search query', async () => {
      const testDocs = await DocsLoader.getDocsByFilter({ search: 'test' });
      const nonExistentDocs = await DocsLoader.getDocsByFilter({ search: 'non-existent' });
      
      expect(testDocs).toHaveLength(1);
      expect(nonExistentDocs).toHaveLength(0);
    });

    it('should combine multiple filters', async () => {
      const filteredDocs = await DocsLoader.getDocsByFilter({
        visibility: 'public',
        audience: 'admin',
        category: 'concepts',
        search: 'test'
      });
      
      expect(filteredDocs).toHaveLength(1);
    });
  });

  describe('searchDocs', () => {
    it('should search in title and content', async () => {
      const results = await DocsLoader.searchDocs('test');
      
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('test/doc');
    });

    it('should search in headings', async () => {
      const results = await DocsLoader.searchDocs('section');
      
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('test/doc');
    });

    it('should return empty array for no matches', async () => {
      const results = await DocsLoader.searchDocs('non-existent');
      
      expect(results).toHaveLength(0);
    });

    it('should filter by visibility', async () => {
      const publicResults = await DocsLoader.searchDocs('test', 'public');
      const internalResults = await DocsLoader.searchDocs('test', 'internal');
      
      expect(publicResults).toHaveLength(1);
      expect(internalResults).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle missing docs directory', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      
      const index = await DocsLoader.getIndex();
      
      expect(index.nodes).toHaveLength(0);
    });

    it('should handle invalid frontmatter', async () => {
      const invalidContent = `---
invalid: frontmatter
---

# Content
`;

      mockedFs.readFileSync.mockReturnValue(invalidContent);
      
      const index = await DocsLoader.getIndex();
      
      expect(index.nodes).toHaveLength(0);
    });

    it('should handle file read errors', async () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      const index = await DocsLoader.getIndex();
      
      expect(index.nodes).toHaveLength(0);
    });
  });

  describe('caching', () => {
    it('should use cache for subsequent calls', async () => {
      const index1 = await DocsLoader.getIndex();
      const index2 = await DocsLoader.getIndex();
      
      expect(index1).toBe(index2);
      expect(mockedFs.readdirSync).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when requested', async () => {
      await DocsLoader.getIndex();
      expect(mockedFs.readdirSync).toHaveBeenCalledTimes(1);

      DocsLoader.clearCache();
      await DocsLoader.getIndex();

      // A second readdirSync proves the index was rebuilt rather than served
      // from the memoised copy.
      expect(mockedFs.readdirSync).toHaveBeenCalledTimes(2);
    });
  });
});
