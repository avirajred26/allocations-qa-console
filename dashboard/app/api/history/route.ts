import { NextResponse } from 'next/server';
import { loadHistory } from '@/lib/ci-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// First load of an uncached failing run downloads its full report (~11 MB); cached afterwards.
export const maxDuration = 60;

/**
 * GET /api/history
 * Every qa-run.yml run on main (dispatched and scheduled), newest first, with totals read
 * from each run's own report artifact. Completed-run totals are cached in Redis; the CDN
 * caches the response for a minute so page views do not fan out to GitHub.
 */
export async function GET() {
  try {
    const runs = await loadHistory(30);
    return NextResponse.json(
      { runs, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (err) {
    console.error(`[history] ${(err as Error).message}`);
    return NextResponse.json({ error: 'history-unavailable', message: 'Could not read workflow history.' }, { status: 502 });
  }
}
