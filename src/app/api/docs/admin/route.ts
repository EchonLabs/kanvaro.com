import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth-utils';
import { Permission } from '@/lib/permissions/permission-definitions';
import { PermissionService } from '@/lib/permissions/permission-service';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { DocFrontmatter } from '@/lib/docs/types';

const DOCS_PATH = path.join(process.cwd(), 'docs');

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const auth = await authenticateUser();
    if ('error' in auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check if user has permission to create documentation
    const hasPermission = await PermissionService.hasPermission(auth.user.id, Permission.DOCUMENTATION_CREATE);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied to create documentation' }, { status: 403 });
    }

    const body = await request.json();
    const { title, summary, slug, content, visibility, audiences, category, order } = body;

    if (!title || !slug) {
      return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, { status: 400 });
    }

    // Check if article already exists
    const filePath = path.join(DOCS_PATH, `${slug}.md`);
    if (fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Article with this slug already exists' }, { status: 400 });
    }

    // Create frontmatter
    const frontmatter: DocFrontmatter = {
      slug,
      title,
      summary: summary || '',
      visibility: visibility || 'public',
      audiences: audiences || [],
      category: category || 'concepts',
      order: order || 1,
      updated: new Date().toISOString().split('T')[0]
    };

    // Create markdown content
    const markdownContent = matter.stringify(content || '', frontmatter);

    // Ensure docs directory exists
    if (!fs.existsSync(DOCS_PATH)) {
      fs.mkdirSync(DOCS_PATH, { recursive: true });
    }

    // Write file
    fs.writeFileSync(filePath, markdownContent, 'utf8');

    return NextResponse.json({
      success: true,
      message: 'Article created successfully',
      article: frontmatter
    });

  } catch (error) {
    console.error('Create article error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
