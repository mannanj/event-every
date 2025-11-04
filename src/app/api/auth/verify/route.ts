import { NextRequest, NextResponse } from 'next/server';

const VALID_L_PATTERNS = [
  [0, 3, 6, 7, 8],
  [2, 5, 8, 7, 6],
  [0, 1, 2, 5, 8],
  [6, 7, 8, 5, 2],
];

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  attempts: number;
  lockedUntil: number | null;
  failedAttempts: number[];
}

const attemptStore = new Map<string, AttemptRecord>();

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return 'unknown';
}

function getOrCreateRecord(ip: string): AttemptRecord {
  if (!attemptStore.has(ip)) {
    attemptStore.set(ip, {
      attempts: 0,
      lockedUntil: null,
      failedAttempts: [],
    });
  }
  return attemptStore.get(ip)!;
}

function cleanupOldRecords() {
  const now = Date.now();
  for (const [ip, record] of attemptStore.entries()) {
    if (record.lockedUntil && record.lockedUntil < now) {
      attemptStore.delete(ip);
    }
  }
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

export async function POST(request: NextRequest) {
  try {
    cleanupOldRecords();

    const { pattern } = await request.json();

    if (!pattern || !Array.isArray(pattern)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      );
    }

    const clientIP = getClientIP(request);
    const record = getOrCreateRecord(clientIP);
    const now = Date.now();

    if (record.lockedUntil && record.lockedUntil > now) {
      const remainingTime = Math.ceil((record.lockedUntil - now) / 1000 / 60);
      return NextResponse.json(
        {
          success: false,
          error: 'Too many failed attempts',
          attemptsLeft: 0,
          lockedOut: true,
          lockoutMinutes: remainingTime
        },
        { status: 429 }
      );
    }

    if (record.lockedUntil && record.lockedUntil <= now) {
      record.attempts = 0;
      record.lockedUntil = null;
      record.failedAttempts = [];
    }

    const isValid = VALID_L_PATTERNS.some(validPattern =>
      arraysEqual(pattern, validPattern)
    );

    if (isValid) {
      attemptStore.delete(clientIP);
      return NextResponse.json({
        success: true,
        attemptsLeft: MAX_ATTEMPTS
      });
    }

    record.attempts += 1;
    record.failedAttempts.push(now);

    if (record.attempts >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_DURATION_MS;
      return NextResponse.json(
        {
          success: false,
          error: 'Too many failed attempts',
          attemptsLeft: 0,
          lockedOut: true,
          lockoutMinutes: 15
        },
        { status: 429 }
      );
    }

    const attemptsLeft = MAX_ATTEMPTS - record.attempts;
    return NextResponse.json({
      success: false,
      attemptsLeft,
      lockedOut: false
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
