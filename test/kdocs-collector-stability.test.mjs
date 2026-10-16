import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {collectKdocs,sourceStartPosition,sourceSweepState} from '../src/source/collector.mjs';
import {repairSourceCoverage} from '../src/source/coverage-repair.mjs';
import {columnLabel} from '../shared/reconstruct.mjs';

const columns=Array.from({length:19},(_,i)=>columnLabel(i+1));
const decoded=(rows,values={})=>({rows:rows.map(row=>({row,top:24,height:50})),columns:columns.map((column,i)=>({column,left:40+i*70})),completeRows:rows,completeColumns:columns,cells:rows.flatMap(row=>Object.entries(values[row]||{}).map(([column,text])=>({address:`${column}${row}`,column,row,text,evidence:{capture:'fixture'}}))),merges:[],images:[],incompleteCells:[],duplicateDraws:0,dropped:0,scrollPosition:{firstRow:1,firstRowY:24}});
test('frozen leading headers select a body cell and body rows expose real scroll movement',()=>{
 const bottom=decoded([1,2,208,209,210,211,212,213,214,215]);
 assert.deepEqual(sourceStartPosition(bottom,'S215'),{address:'A3',row:3,column:'A',frozenRows:[1,2],frozenColumns:[]});
 const first=sourceSweepState({layout:decoded([1,2,3,4,5]),endRow:215});
 const next=sourceSweepState({layout:decoded([1,2,10,11,12]),endRow:215,previousPosition:first.position,highestRow:5});
 assert.equal(next.stalled,0);assert.equal(next.noNewRows,0);assert.equal(next.atEnd,false);
 assert.equal(sourceStartPosition(decoded([208,209,210]),'S215').address,'A1');
 const frozenColumns={...bottom,columns:['A','B','R','S'].map(column=>({column}))};assert.equal(sourceStartPosition(frozenColumns,'S215').address,'C3');
});
test('coverage repair completes more than 80 successful reads without an off-by-one failure',async()=>{
 const layouts=[],seen=[],manifest={};
 const result=await repairSourceCoverage({layouts,endpoint:'S121',manifest,read:async address=>{seen.push(address);return decoded([Number(address.match(/\d+/)[0])]);}});
 assert.equal(seen.length,121);assert.equal(seen[79],'A80');assert.equal(seen.at(-1),'A121');assert.equal(result.remaining,0);assert.equal(result.reads,121);assert.equal(result.checks.at(-1).passed,true);
});
test('a cell that never draws stops after three tries with precise diagnostics; elapsed budget is bounded',async()=>{
 let calls=0;const manifest={};await assert.rejects(repairSourceCoverage({layouts:[],endpoint:'S2',manifest,read:async()=>{calls++;return decoded([]);}}),e=>e.code==='SOURCE_COVERAGE_INCOMPLETE'&&e.details.address==='A1'&&/连续 3 次/.test(e.message));assert.equal(calls,3);assert.equal(manifest.coverageRepair.reads,3);
 let tick=0;calls=0;await assert.rejects(repairSourceCoverage({layouts:[],endpoint:'S2',now:()=>tick,maxDurationMs:10,read:async()=>{calls++;tick=11;return decoded([1]);}}),e=>e.code==='SOURCE_COVERAGE_INCOMPLETE'&&/安全预算/.test(e.message));assert.equal(calls,1);
});

// Raw Canvas events exercise the actual decoder/quality gates. Rows 1 and 2
// remain pinned while selecting A1 leaves the body at the used-range endpoint.
function rawFrame(firstBody,label){
 const events=[],emit=event=>events.push({seq:events.length+1,...event}),rowSpecs=[{row:1,top:24,height:25},{row:2,top:49,height:25},...Array.from({length:11},(_,i)=>({row:firstBody+i,top:74+i*50,height:50}))];
 for(const [i,column] of columns.entries())emit({kind:'text',text:column,font:'12px ET-HEADERS-FONT',x:40+i*70+5,y:18,clipRect:{x:40+i*70,y:0,width:69,height:23}});
 for(const {row,top,height} of rowSpecs){
  emit({kind:'text',text:String(row),font:'12px ET-HEADERS-FONT',x:5,y:top+15,clipRect:{x:0,y:top,width:39,height:height-1}});
  const values=row===1?{A:'名称',D:'成本AED',E:'建议售价AED',F:'库存'}:{A:`Fixture-${row}`,D:'35',E:'190',F:row%2?'有货':'无货'};
  for(const [column,text] of Object.entries(values))emit({kind:'text',text,font:'12px Arial',x:40+columns.indexOf(column)*70+4,y:top+16,ascent:10,descent:2,clipRect:{x:40+columns.indexOf(column)*70,y:top,width:69,height:height-1}});
 }
 return {label,events,dropped:0,timestamp:'2026-10-16T10:00:00.000Z',canvas:{width:1435,height:614}};
}
async function collectionFixture(t,options={}){
 const base=await mkdtemp(path.join(os.tmpdir(),'kdocs-stability-')),paths={failed:path.join(base,'failed'),snapshots:path.join(base,'snapshots')};await Promise.all(Object.values(paths).map(p=>mkdir(p)));t.after(()=>rm(base,{recursive:true,force:true}));
 let body=206,retried=false,sheetReads=0;const navigation=[],progress=[],sheet={isVisible:async()=>true,click:async()=>{}};
 const page={getByText:()=>({all:async()=>++sheetReads<=(options.sheetReadyAfter||0)?[]:[sheet]}),locator:()=>({boundingBox:async()=>({x:0,y:135,width:1435,height:614})}),mouse:{move:async()=>{},wheel:async()=>{body=Math.min(206,body+8);}}};
 const browserOps={openKdocs:async()=>({page}),delay:async()=>{},usedEnd:async()=>{body=206;return options.endAddress||'S215';},goTo:async(_page,address)=>{navigation.push(address);const row=Number(address.match(/\d+/)[0]);if(!options.staleTop&&row>=3&&(row<body||row>body+9))body=Math.max(3,row-9);},captureLayout:async(_page,label)=>{if(options.transientFrame&&label==='sweep-001'&&!retried){retried=true;return {label,events:[],canvas:{width:1435,height:614}};}return rawFrame(body,label);}};
 return {base,paths,browserOps,navigation,progress};
}
test('full collection with frozen rows verifies all 215 rows and 20 independent samples after a transient redraw',async t=>{
 const f=await collectionFixture(t,{transientFrame:true,sheetReadyAfter:2});
 const out=await collectKdocs({profile:'fixture-only',paths:f.paths,browserOps:f.browserOps,onProgress:x=>f.progress.push(x),keepEvidence:true});
 assert.ok(f.progress.some(x=>x.message.includes('来源页面正在加载')));assert.equal(f.navigation[0],'A3');assert.equal(out.collection.manifest.scrollSteps>3,true);assert.equal(out.collection.manifest.directEndChecks,0);assert.equal(out.collection.manifest.captureRetries,1);assert.equal(out.collection.result.coverage.recognizedRows,215);assert.equal(out.collection.manifest.sampleChecks.length,20);assert.equal(out.snapshot.quality.passed,true);assert.equal(out.snapshot.products.length,214);assert.equal(out.collection.manifest.coverageRepair.remaining,0);assert.equal(out.snapshot.products[0].sourceRow,2);assert.equal(out.snapshot.products.find(p=>p.sourceRow===93).sourceName,'Fixture-93');assert.equal(out.snapshot.products.at(-1).sourceRow,215);assert.ok((await readFile(out.file,'utf8')).includes('Fixture-215'));
});
test('a sheet that never becomes ready fails within its budget without writing a source snapshot',async t=>{
 const f=await collectionFixture(t,{sheetReadyAfter:100});await assert.rejects(collectKdocs({profile:'fixture-only',paths:f.paths,browserOps:f.browserOps}),e=>e.code==='WRONG_SHEET');assert.deepEqual(await readdir(f.paths.snapshots),[]);assert.deepEqual(f.navigation,[]);
});
test('failure to verify the scrolling body top retains the previous snapshot and never reports success',async t=>{
 const f=await collectionFixture(t,{staleTop:true}),old=path.join(f.paths.snapshots,'previous.json');await writeFile(old,'previous verified snapshot');
 await assert.rejects(collectKdocs({profile:'fixture-only',paths:f.paths,browserOps:f.browserOps,onProgress:x=>f.progress.push(x)}),e=>e.code==='SOURCE_TOP_UNVERIFIED');assert.equal(await readFile(old,'utf8'),'previous verified snapshot');assert.deepEqual(await readdir(f.paths.snapshots),['previous.json']);assert.equal(f.progress.some(p=>p.message.startsWith('已采集 ')),false);
});
test('a shortcut returning A93 is rejected before scanning or saving because the expected columns were not reached',async t=>{
 const f=await collectionFixture(t,{endAddress:'A93'});await assert.rejects(collectKdocs({profile:'fixture-only',paths:f.paths,browserOps:f.browserOps}),e=>e.code==='ENDPOINT_INVALID');assert.deepEqual(await readdir(f.paths.snapshots),[]);assert.deepEqual(f.navigation,[]);
});
