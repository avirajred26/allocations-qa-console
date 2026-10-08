import { NextResponse } from 'next/server';
import { downloadArtifact } from '@/lib/github';
import { extractZipEntry } from '@/lib/zip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webm: 'video/webm', mp4: 'video/mp4', zip: 'application/zip', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8' };
/** Only Playwright evidence inside the run's own report; no traversal, no other file types. */
const SAFE_PATH = /^(test-results|playwright-report)\/[A-Za-z0-9._\-/]+\.(png|jpg|webm|mp4|zip|md|txt)$/;
/** Vercel function responses are capped at ~4.5 MB. */
const MAX_BYTES = 4_400_000;

/**
 * GET /api/evidence/:runId/test-results/<test>/<file>
 * Serves one screenshot, recording, trace or error log out of a qa run's report artifact,
 * so Slack/Teams can show it inline and trace.playwright.dev can open it (CORS).
 * Files are immutable per run, so the CDN keeps them after the first request.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string; path: string[] }> }) {
  const { runId, path } = await ctx.params;
  const rel = path.map(decodeURIComponent).join('/');
  if (!/^\d{5,20}$/.test(runId) || !SAFE_PATH.test(rel) || rel.split('/').some((seg) => seg === '..' || seg === '.')) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }
  try {
    const art = await downloadArtifact(Number(runId), ['playwright-report-']);
    if (!art) return NextResponse.json({ error: 'not-found', message: 'Report artifact missing or expired (kept 14 days).' }, { status: 404 });
    const file = extractZipEntry(art.zip, rel);
    if (!file) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    if (file.length > MAX_BYTES) return NextResponse.json({ error: 'too-large', message: 'Open the GitHub artifact for this file.' }, { status: 413 });
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': TYPES[rel.split('.').pop()!],
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': rel.endsWith('.zip') ? `attachment; filename="trace.zip"` : 'inline',
      },
    });
  } catch (err) {
    console.error(`[evidence ${runId}] ${(err as Error).message}`);
    return NextResponse.json({ error: 'evidence-unavailable' }, { status: 502 });
  }
}
