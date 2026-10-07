import { NextResponse } from 'next/server';
import { SESSION_COOKIE, readCookie, sessionCookieHeader, verifySession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/session — is this browser remembered? Never reveals the key or the cookie value. */
export async function GET(req: Request) {
  const exp = verifySession(readCookie(req, SESSION_COOKIE));
  return NextResponse.json({ active: exp !== null, expiresAt: exp }, { headers: { 'Cache-Control': 'no-store' } });
}

/** DELETE /api/session — forget this browser. */
export async function DELETE(req: Request) {
  return NextResponse.json({ active: false, expiresAt: null }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookieHeader(req, '', 0) } });
}
