import { NextRequest, NextResponse } from 'next/server';

const VALID_L_PATTERNS = [
  [0, 3, 6, 7, 8],
  [2, 5, 8, 7, 6],
  [0, 1, 2, 5, 8],
  [6, 7, 8, 5, 2],
];

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

export async function POST(request: NextRequest) {
  try {
    const { pattern } = await request.json();

    if (!pattern || !Array.isArray(pattern)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      );
    }

    const isValid = VALID_L_PATTERNS.some(validPattern =>
      arraysEqual(pattern, validPattern)
    );

    return NextResponse.json({ success: isValid });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
