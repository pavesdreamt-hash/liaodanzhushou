import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSourceConflicts} from '../src/source/conflict-repair.mjs';

const layout=(label,text)=>({label,timestamp:'2026-11-18T00:00:00Z',rows:[{row:2,height:24}],columns:[{column:'E',width:70}],completeRows:[2],completeColumns:['E'],cells:[{address:'E2',row:2,column:'E',text,evidence:{capture:label}}],merges:[],images:[],incompleteCells:[],duplicateDraws:0,dropped:0});
test('two independent stable reads resolve a transient Canvas conflict with audit evidence',async()=>{
 const frames=[layout('sweep-1','221100'),layout('sweep-2','210')],manifest={};
 const result=await reconcileSourceConflicts({layouts:frames,endpoint:'E2',manifest,read:async(_address,index)=>layout(`verify-${index}`,'210')});
 assert.equal(result.rows[1].cells.E,'210');assert.equal(result.coverage.conflicts.length,0);assert.equal(manifest.conflictChecks[0].passed,true);
 assert.deepEqual(manifest.conflictChecks[0].variants.map(v=>v.text),['221100','210']);
});
test('changing rereads leave a disputed core cell blocked',async()=>{
 const frames=[layout('sweep-1','221100'),layout('sweep-2','210')],manifest={};
 const result=await reconcileSourceConflicts({layouts:frames,endpoint:'E2',manifest,read:async(_address,index)=>layout(`verify-${index}`,index===1?'210':'211')});
 assert.equal(manifest.conflictChecks[0].passed,false);assert.equal(result.coverage.conflicts.length,1);
});
