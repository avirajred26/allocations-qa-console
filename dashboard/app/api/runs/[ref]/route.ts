import { NextResponse } from 'next/server';
import { findRun, isValidRunRef } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/runs/:ref
 * Browser polls this (every 10–15s). The server calls GitHub only when asked —
 * no background polling. Unknown refs return found:false (GitHub can lag a few
 * seconds after dispatch before the run appears).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  if (!isValidRunRef(ref)) {
    return NextResponse.json({ error: 'bad-request', message: 'Invalid run ref.' }, { status: 400 });
  }
  try {
    const status = await findRun(ref);
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`[runs ${ref}] ${(err as Error).message}`);
    return NextResponse.json({ error: 'status-unavailable', message: 'Could not read run status.' }, { status: 502 });
  }
}
