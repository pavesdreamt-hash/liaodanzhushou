import {combineLayouts} from '../../shared/reconstruct.mjs';
import {AppError} from '../core/errors.mjs';

const required=address=>/^[ADEFG]\d+$/.test(address);
export const missingSourceCells=(layouts,endpoint)=>combineLayouts(layouts,endpoint).coverage.missing.filter(required);

// The budget follows missing coverage, not an arbitrary 80 reads. Each cell
// still has a small retry limit and the entire repair has a fixed time bound.
export async function repairSourceCoverage({layouts,endpoint,read,onProgress=()=>{},manifest={},now=()=>Date.now(),maxAttemptsPerCell=3,maxDurationMs=600000}){
 const initial=missingSourceCells(layouts,endpoint),attempts=new Map(),started=now();
 const repair=manifest.coverageRepair={initialMissing:initial.length,remaining:initial.length,reads:0,maxReads:initial.length*maxAttemptsPerCell,maxAttemptsPerCell,maxDurationMs,checks:[]};
 let missing=initial;
 const stop=(address,reason)=>{throw new AppError(`${reason}：${address}，仍缺 ${missing.length} 个关键单元格；已保留上次有效资料`,{stage:'KDocs采集',code:'SOURCE_COVERAGE_INCOMPLETE',details:{address,remaining:missing.length,reads:repair.reads,reason}});};
 while(missing.length){
  const address=missing[0],attempt=(attempts.get(address)||0)+1;
  if(attempt>maxAttemptsPerCell)stop(address,`连续 ${maxAttemptsPerCell} 次未完整绘制`);
  if(now()-started>=maxDurationMs||repair.reads>=repair.maxReads)stop(address,'关键字段补扫达到安全预算');
  attempts.set(address,attempt);
  onProgress({stage:'KDocs采集',message:`正在补扫关键单元格 ${address}；剩余 ${missing.length} 格（本格第 ${attempt}/${maxAttemptsPerCell} 次）`,address,remainingCells:missing.length,repairAttempt:attempt});
  const before=missing.length,layout=await read(address,repair.reads);layouts.push(layout);repair.reads++;
  missing=missingSourceCells(layouts,endpoint);repair.remaining=missing.length;
  repair.checks.push({address,attempt,before,remaining:missing.length,passed:!missing.includes(address)});
 }
 return repair;
}
