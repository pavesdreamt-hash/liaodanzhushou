import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {LocalInventoryStore} from '../src/inventory/local-store.mjs';

test('本地库存保存采集结果、当前库存和受控历史',async()=>{
  const base=await mkdtemp(path.join(os.tmpdir(),'kdocs-local-inventory-'));
  try{
    const paths={state:path.join(base,'state'),snapshots:path.join(base,'snapshots')};await mkdir(paths.state,{recursive:true});await mkdir(paths.snapshots,{recursive:true});
    const store=new LocalInventoryStore(paths),snapshot={capturedAt:'2026-09-11T10:00:00.000Z',sourceUrl:'https://example.invalid',sheet:'库存',range:'A1:F3',quality:{passed:true,namedProducts:2},products:[{sourceName:'YB11',cost:'100',suggestedPrice:'180',stock:'3',additionalInfo:'',sourceRow:2},{sourceName:'YB57',cost:'120',suggestedPrice:'230',stock:'4',additionalInfo:'',sourceRow:3}]};
    await store.recordCollection(snapshot);
    const plan={formalChanged:true,summary:{total:2,cost:1,price:1,stock:1},detail:[{businessId:'YB11',sourceName:'YB11',changes:[{label:'成本',before:'',after:'100'}]}],products:[{businessId:'YB11',sourceName:'YB11',cost:'100',suggestedPrice:'180',stock:'3',additionalInfo:'',sourceRow:2}],inventoryAfter:[['商品编号','来源商品名称','成本变化','建议售价变化','库存变化','附加信息变化','2026-09-11 成本','2026-09-11 建议售价','2026-09-11 库存','2026-09-11 附加信息'],['YB11','YB11','100','180','3','', '100','180','3','']],mappingAfter:[['商品编号','来源匹配标识','来源商品名称','状态','备注'],['YB11','YB11','YB11','已确认','']]};
    const view=await store.commit({source:snapshot,mappingState:{rows:plan.mappingAfter.slice(1)},plan});
    assert.equal(view.current.products[0].businessId,'YB11');assert.equal(view.history.length,1);assert.equal(view.retention.historyCount,1);
    const workbook=await store.workbook();assert.equal(workbook.inventory[0].length,10);assert.equal(workbook.mapping[1][0],'YB11');
  }finally{await rm(base,{recursive:true,force:true});}
});
