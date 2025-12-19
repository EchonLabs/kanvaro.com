import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db-config';
import { authenticateUser } from '@/lib/auth-utils';
import { User } from '@/models/User';

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const authResult = await authenticateUser();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids'); // Comma-separated user IDs

    if (ids) {
      // Fetch specific users by IDs
      const userIds = ids.split(',').filter(id => id.trim());
      const users = await User.find({
        _id: { $in: userIds },
        organization: authResult.user.organization,
        isActive: true
      })
      .select('_id firstName lastName email role avatar')
      .lean();

      // Return as an object keyed by user ID for easy lookup
      const userMap: Record<string, any> = {};
      users.forEach((user: any) => {
        userMap[user._id.toString()] = user;
      });

      return NextResponse.json(userMap);
    } else {
      // Get all users from the same organization (original behavior)
      const users = await User.find({
        organization: authResult.user.organization,
        isActive: true
      })
      .select('_id firstName lastName email role')
      .lean();

      return NextResponse.json(users);
    }
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
