import { NextResponse } from 'next/server';
import { loadRunReport } from '@/lib/ci-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/report/:runId
 * One QA run (any QA workflow): phase, PR context, totals and every failure with its cause
 * and evidence paths, read from the run's qa-summary.json. Finished runs never change, so the
 * CDN keeps them; unfinished runs are re-read every 15 s.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  if (!/^\d{5,20}$/.test(runId)) return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  try {
    const report = await loadRunReport(Number(runId));
    if (!report) return NextResponse.json({ error: 'not-found', message: 'Not a QA run in this repository.' }, { status: 404 });
    const done = report.status === 'completed';
    return NextResponse.json(report, { headers: { 'Cache-Control': done ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=15' } });
  } catch (err) {
    console.error(`[report ${runId}] ${(err as Error).message}`);
    return NextResponse.json({ error: 'report-unavailable', message: 'Could not read this run from GitHub.' }, { status: 502 });
  }
}
