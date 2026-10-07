import {test,expect} from '@playwright/test';
import {sampleExecutionRecords,recordedExecutions} from '../lib/execution-records';
import {scenarios} from '../lib/fixture';
import ci from '../fixtures/recorded-ci-results.json';

test('sample groups preserve every existing fixture entry exactly once',()=>{
  const groups=sampleExecutionRecords();
  expect(groups).toHaveLength(7);
  expect(new Set(groups.map(r=>r.id)).size).toBe(groups.length);
  expect(groups.reduce((n,r)=>n+Object.values(r.counts).reduce((a,b)=>a+b,0),0)).toBe(scenarios.reduce((n,s)=>n+s.history.length,0));
  expect(groups.every(r=>r.source==='fixture'||r.source==='mock')).toBe(true);
});
test('recorded CI detail totals match the actual report',()=>{
  expect(ci.tests).toHaveLength(14);
  expect(ci.tests.filter(t=>t.status==='passed')).toHaveLength(13);
  expect(ci.tests.filter(t=>t.status==='failed')).toHaveLength(0);
  expect(ci.tests.filter(t=>t.status==='skipped')).toHaveLength(1);
  const record=recordedExecutions.find(r=>r.source==='recorded-ci')!;
  expect(record.date).toBe(ci.startTime);
  expect(record.counts).toEqual({pass:13,fail:0,flaky:0,skipped:1});
  expect(ci.tests.filter(t=>t.error).every(t=>(t.attachments as string[]).includes('trace'))).toBe(true);
});
