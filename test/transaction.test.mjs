import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readdir} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {executeTransaction} from '../src/google/transaction.mjs';
import {buildSyncPlan} from '../src/sync/plan.mjs';
import {buildFirstMappingWizard,applyWizardAnswers} from '../src/mapping/mapping.mjs';
import {oldEvidence,metadata,inventoryHeaders,mappingHeaders} from './helpers.mjs';
async function setup(){const root=await mkdtemp(path.join(os.tmpdir(),'kdocs-transaction-')),paths={backups:path.join(root,'backups')};const {snapshot}=await oldEvidence(),w=buildFirstMappingWizard(snapshot.products),mapping=applyWizardAnswers(w,w.rows.map((r,i)=>({sourceKey:r.sourceKey,businessId:String(i+1).padStart(3,'0')}))),meta=metadata();const plan=buildSyncPlan({sourceSnapshot:snapshot,mappingState:mapping,inventoryValues:[inventoryHeaders],mappingValuesBefore:[mappingHeaders],metadata:meta,now:new Date('2026-08-29T01:00:00Z')});return {root,paths,meta,plan};}
class FakeClient{
  constructor(meta,pairs){this.meta=meta;this.pairs=pairs;this.read=0;this.writes=[];}
  async metadata(){return structuredClone(this.meta);}
  async batchGet(){const pair=this.pairs[Math.min(this.read++,this.pairs.length-1)];return pair.map(values=>({values:structuredClone(values)}));}
  async batchUpdate(_id,requests){this.writes.push(structuredClone(requests));return {};}
}
test('事务写入先校验、备份、批量写入并回读一致',async()=>{const {paths,meta,plan}=await setup(),client=new FakeClient(meta,[[plan.inventoryBefore,plan.mappingBefore],[plan.inventoryAfter,plan.mappingAfter]]);const result=await executeTransaction({client,spreadsheetId:meta.spreadsheetId,paths,plan});assert.equal(result.written,true);assert.equal(result.verified,true);assert.equal(client.writes.length,1);assert.ok((await readdir(paths.backups)).length===1);assert.doesNotMatch(JSON.stringify(client.writes),/"sheetId":1/);});
test('Google内容在计划后变化时零写入',async()=>{const {paths,meta,plan}=await setup(),changed=structuredClone(plan.inventoryBefore);changed.push(['999','外部改动']);const client=new FakeClient(meta,[[changed,plan.mappingBefore]]);await assert.rejects(()=>executeTransaction({client,spreadsheetId:meta.spreadsheetId,paths,plan}),error=>error.code==='GOOGLE_PREFLIGHT_CHANGED');assert.equal(client.writes.length,0);});
test('回读出现外部改动时不执行破坏性自动回滚',async()=>{const {paths,meta,plan}=await setup(),unexpected=structuredClone(plan.inventoryAfter);unexpected[1][1]='其他编辑者的内容';const client=new FakeClient(meta,[[plan.inventoryBefore,plan.mappingBefore],[unexpected,plan.mappingAfter]]);await assert.rejects(()=>executeTransaction({client,spreadsheetId:meta.spreadsheetId,paths,plan}),error=>error.code==='GOOGLE_EXTERNAL_CHANGE_GUARD');assert.equal(client.writes.length,1);});
