import { NextResponse } from 'next/server';
import { quota, keysFor } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/quota — runs used today, limit, cooldown remaining. Not secret; the UI shows it. */
export async function GET(req: Request) {
  const ns = process.env.ALLOW_TEST_NAMESPACE === '1' ? req.headers.get('x-trigger-namespace') ?? undefined : undefined;
  try {
    return NextResponse.json(await quota(keysFor('quota', ns)), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'status-unavailable', message: 'Could not read quota.' }, { status: 502 });
  }
}
