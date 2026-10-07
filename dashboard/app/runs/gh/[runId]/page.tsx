import { RunReportView } from '@/components/run-report';

export default async function GithubRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunReportView runId={runId} />;
}
