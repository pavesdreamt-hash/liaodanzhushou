import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWizardAnswers,mappingValues,parseMappingRows,reconcileMappings} from '../src/mapping/mapping.mjs';
import {mappingHeaders} from './helpers.mjs';

const wizard=()=>({firstRun:false,rows:[
  {businessId:'SITE-020',sourceKey:'NAME:020|OCC:1',sourceName:'020',status:'待确认',note:'系统建议'},
  {businessId:'',sourceKey:'NAME:022|OCC:1',sourceName:'022',status:'待编号',note:''}
]});

test('待确认系统建议不占用网站商品，人工选择可保存为唯一确认关系',()=>{
  const result=applyWizardAnswers(wizard(),[{sourceKey:'NAME:022|OCC:1',businessId:'SITE-020',action:'confirm'}]);
  assert.equal(result.rows[0].status,'待确认');
  assert.equal(result.rows[0].businessId,'SITE-020');
  assert.equal(result.rows[1].status,'正常');
  assert.equal(result.rows[1].businessId,'SITE-020');
  assert.equal(result.needsConfirmation,1);
  assert.doesNotThrow(()=>parseMappingRows(mappingValues(result.rows)));
});

test('两个已确认关系仍不能占用同一网站商品',()=>{
  const state={firstRun:false,rows:[
    {businessId:'SITE-020',sourceKey:'NAME:020|OCC:1',sourceName:'020',status:'正常',note:''},
    {businessId:'',sourceKey:'NAME:022|OCC:1',sourceName:'022',status:'待编号',note:''}
  ]};
  assert.throws(()=>applyWizardAnswers(state,[{sourceKey:'NAME:022|OCC:1',businessId:'SITE-020',action:'confirm'}]),error=>error.code==='DUPLICATE_BUSINESS_ID');
});

test('本机忽略重复项只改变映射状态，可在后续来源同步后恢复',()=>{
  const ignored=applyWizardAnswers(wizard(),[{sourceKey:'NAME:022|OCC:1',businessId:'',action:'ignore'}]);
  assert.deepEqual(ignored.rows[1]&&{businessId:ignored.rows[1].businessId,status:ignored.rows[1].status},{businessId:'',status:'本机已忽略'});
  assert.equal(ignored.ignored,1);
  const stored=parseMappingRows(mappingValues(ignored.rows));
  const reconciled=reconcileMappings([{sourceRow:2,sourceName:'020'},{sourceRow:3,sourceName:'022'}],stored);
  assert.equal(reconciled.rows.find(row=>row.sourceName==='022')?.status,'本机已忽略');
  const ignoredRow=reconciled.rows.find(row=>row.sourceName==='022');
  const restored=applyWizardAnswers(reconciled,[{sourceKey:ignoredRow.sourceKey,businessId:'',action:'restore'}]);
  assert.equal(restored.rows.find(row=>row.sourceName==='022')?.status,'待编号');
  assert.deepEqual(mappingHeaders,['商品编号','来源匹配标识','来源商品名称','状态','备注']);
});
