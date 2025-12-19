import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db-config';
import { authenticateUser } from '@/lib/auth-utils';
import { User } from '@/models/User';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const authResult = await authenticateUser();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = params.id;

    // Check if the user is in the same organization
    const user = await User.findOne({
      _id: userId,
      organization: authResult.user.organization,
      isActive: true
    })
    .select('_id firstName lastName email role avatar')
    .lean();

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
