import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth-utils';
import { Permission } from '@/lib/permissions/permission-definitions';
import { PermissionService } from '@/lib/permissions/permission-service';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const DOCS_PATH = path.join(process.cwd(), 'docs');

export async function PUT(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    // Authenticate user
    const auth = await authenticateUser();
    if ('error' in auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check if user has permission to update documentation
    const hasPermission = await PermissionService.hasPermission(auth.user.id, Permission.DOCUMENTATION_UPDATE);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied to update documentation' }, { status: 403 });
    }

    const { slug } = params;
    const body = await request.json();
    const { title, summary, content, visibility, audiences, category, order } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Check if article exists
    const filePath = path.join(DOCS_PATH, `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // Read existing file to preserve any additional frontmatter
    const existingContent = fs.readFileSync(filePath, 'utf8');
    const { data: existingFrontmatter } = matter(existingContent);

    // Update frontmatter
    const updatedFrontmatter = {
      ...existingFrontmatter,
      title,
      summary: summary || existingFrontmatter.summary || '',
      visibility: visibility || existingFrontmatter.visibility || 'public',
      audiences: audiences || existingFrontmatter.audiences || [],
      category: category || existingFrontmatter.category || 'concepts',
      order: order || existingFrontmatter.order || 1,
      updated: new Date().toISOString().split('T')[0]
    };

    // Create updated markdown content
    const markdownContent = matter.stringify(content || existingContent.split('---').slice(2).join('---').trim(), updatedFrontmatter);

    // Write updated file
    fs.writeFileSync(filePath, markdownContent, 'utf8');

    return NextResponse.json({
      success: true,
      message: 'Article updated successfully',
      article: updatedFrontmatter
    });

  } catch (error) {
    console.error('Update article error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    // Authenticate user
    const auth = await authenticateUser();
    if ('error' in auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check if user has permission to delete documentation
    const hasPermission = await PermissionService.hasPermission(auth.user.id, Permission.DOCUMENTATION_DELETE);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission denied to delete documentation' }, { status: 403 });
    }

    const { slug } = params;

    // Check if article exists
    const filePath = path.join(DOCS_PATH, `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // Delete file
    fs.unlinkSync(filePath);

    return NextResponse.json({
      success: true,
      message: 'Article deleted successfully'
    });

  } catch (error) {
    console.error('Delete article error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
