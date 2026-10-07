import { scenarios, FLOW_LABEL, DEVICE_LABEL, type ScenarioStatus } from '@/lib/fixture';
import { CI_EVIDENCE, LOCAL_EVIDENCE } from '@/lib/local-evidence';
import ciReport from '@/fixtures/recorded-ci-results.json';

export interface ExecutionRecord {
  id:string; title:string; ref:string; source:'recorded-ci'|'recorded-local'|'fixture'|'mock';
  environment:string; device:string; status:ScenarioStatus; date:string;
  counts:Record<ScenarioStatus,number>; note:string; scenarioIds:string[]; url?:string;
}
const weights:Record<ScenarioStatus,number>={pass:0,skipped:1,flaky:2,fail:3};
/** Groups existing fixture records; never invents a workflow or a timestamp. */
export function sampleExecutionRecords():ExecutionRecord[]{
  const groups=new Map<string,ExecutionRecord>();
  for(const scenario of scenarios) for(const entry of scenario.history){
    const id=[entry.run_ref,scenario.flow,entry.device].join(':');
    let group=groups.get(id);
    if(!group){group={id,title:FLOW_LABEL[scenario.flow],ref:entry.run_ref,source:scenario.source==='mock'?'mock':'fixture',environment:entry.env,device:DEVICE_LABEL[entry.device],status:entry.status,date:entry.at,counts:{pass:0,fail:0,flaky:0,skipped:0},scenarioIds:[],note:scenario.source==='mock'?'Mocked authenticated flow. Credentials are required to execute it.':'Seeded pre-auth results, not imported from a test run.'};groups.set(id,group);}
    group.counts[entry.status]++;
    if(weights[entry.status]>weights[group.status])group.status=entry.status;
    if(!group.scenarioIds.includes(scenario.id))group.scenarioIds.push(scenario.id);
  }
  return [...groups.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
export const recordedExecutions:ExecutionRecord[]=[
  {id:`ci-${ciReport.runId}`,title:'Pre-auth smoke · GitHub Actions',ref:CI_EVIDENCE.runRef,source:'recorded-ci',environment:'prod-public',device:'Desktop + mobile',status:CI_EVIDENCE.failed>0?'fail':'pass',date:ciReport.startTime,counts:{pass:CI_EVIDENCE.passed,fail:CI_EVIDENCE.failed,flaky:0,skipped:CI_EVIDENCE.skipped},note:CI_EVIDENCE.note,scenarioIds:[],url:CI_EVIDENCE.url},
  {id:'local-20261007',title:'Pre-auth smoke · local verification',ref:'Recorded local execution',source:'recorded-local',environment:'prod-public',device:'Desktop + mobile',status:LOCAL_EVIDENCE.failed>0?'fail':'pass',date:LOCAL_EVIDENCE.isoDate,counts:{pass:LOCAL_EVIDENCE.passed,fail:LOCAL_EVIDENCE.failed,flaky:0,skipped:LOCAL_EVIDENCE.skipped},note:LOCAL_EVIDENCE.findings.join(' '),scenarioIds:[]},
];
export const SOURCE_LABEL:Record<ExecutionRecord['source'],string>={'recorded-ci':'RECORDED CI','recorded-local':'RECORDED LOCAL',fixture:'FIXTURE',mock:'MOCK'};
