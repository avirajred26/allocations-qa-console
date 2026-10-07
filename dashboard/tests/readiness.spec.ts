import { test, expect } from '@playwright/test';
import { scenarios, type Scenario } from '../lib/fixture';
import { buildSlackUpdate, computeReadiness, computeVerdict, initialTriageMap, observedRuns, statusChanges } from '../lib/readiness';

test('fixture totals stay separate from the recorded harness failures', () => {
  const result=computeReadiness(scenarios,initialTriageMap(scenarios));
  expect(result.verdict).toBe('NO-GO');
  expect(result.passed).toEqual({total:8,fixture:5,mock:3});
  expect(result.blockerFailures.map(s=>s.id)).toEqual(['INV-020']);
  expect(result.retest.pct).toBeNull();
  expect(result.changes).toEqual([]);
  // After the 7 Oct harness correction no fixture pass is contradicted by recorded evidence.
  expect(result.contradicted).toEqual([]);
});

test('Slack copy matches the card and labels provenance and unknown baselines', () => {
  const triage=initialTriageMap(scenarios);
  const text=buildSlackUpdate({readiness:computeReadiness(scenarios,triage),triage,runs:observedRuns([]),consoleUrl:'http://127.0.0.1:3000',now:new Date('2026-10-07T08:00:00Z')});
  expect(text).toContain('*Verdict:* NO-GO');
  expect(text).toContain('8 scenarios passed (5 fixture, 3 mock — seeded, not observed)');
  expect(text).toContain('retest N/A');
  expect(text).toContain('example ticket');
  expect(text).toContain('live workflow runs observed this session: 0');
  for(const label of ['Completed','In-Review','In-Progress','Blockers']) expect(text).toContain(`*${label}:*`);
});

test('triage changes feed tickets and reset does not mutate the source fixture', () => {
  const original=initialTriageMap(scenarios);
  const edited={...original,'INV-020':{...original['INV-020']!,ticket:'LIN-999'}};
  expect(computeReadiness(scenarios,edited).openDefects.some(d=>d.ticket==='LIN-999')).toBe(true);
  expect(initialTriageMap(scenarios)['INV-020']?.ticket).toBe('LIN-412');
});

test('the three verdict states use blocker status and quarantine', () => {
  const allPass: Scenario[]=scenarios.map(s=>({...s,history:s.history.map(h=>({...h,status:'pass'}))}));
  expect(computeVerdict(allPass,{})).toBe('GO');
  const blocker=allPass.find(s=>s.blocker)!;
  expect(computeVerdict(allPass,{[blocker.id]:{class:'flaky',owner:'qa',priority:'P1',ticket:'',quarantined:true,note:''}})).toBe('CONDITIONAL GO');
  expect(computeVerdict(scenarios,{})).toBe('NO-GO');
});

test('concurrent devices are not a previous-run comparison', () => {
  expect(statusChanges([scenarios[0]])).toEqual([]);
});
