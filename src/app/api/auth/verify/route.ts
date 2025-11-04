import { NextRequest, NextResponse } from 'next/server';

const CORRECT_PATTERN = 'L';

export async function POST(request: NextRequest) {
  try {
    const { pattern } = await request.json();

    if (!pattern || typeof pattern !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      );
    }

    const isValid = pattern.toUpperCase() === CORRECT_PATTERN;

    return NextResponse.json({ success: isValid });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
