import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {posterCandidates,posterManifest,decodePosterExport,readPosterTemplate} from '../src/inventory/product-poster.mjs';

const image={file:'shopplus-abcdabcdabcdabcd.jpg',kind:'website-cache',sha256:'abc'};
const localImage={file:'abc.jpg',kind:'local',localId:'a'};
test('商品合集只选来源明确有货且本机有图，不看网站上架或网站库存',()=>{
  const view={sourceCapturedAt:'2026-10-24T00:00:00.000Z',sourceQuality:true,rows:[
    {key:'a',code:'001',sourceStock:'有货',images:[image],publishStatus:0,stockQuantity:0},
    {key:'b',code:'002',sourceStock:'有货',images:[localImage],publishStatus:null,stockQuantity:null},
    {key:'c',code:'003',sourceStock:'无货',images:[image],publishStatus:1,stockQuantity:10},
    {key:'d',code:'004',sourceStock:'有货',images:[],publishStatus:1,stockQuantity:10},
    {key:'e',code:'005',sourceStock:null,images:[image],publishStatus:1,stockQuantity:10}
  ]};
  const plan=posterCandidates(view);
  assert.deepEqual(plan.eligible.map(p=>p.code),['001','002']);
  assert.equal(plan.sourceInStock,3);
  assert.deepEqual(plan.missingImage.map(p=>p.code),['004']);
  assert.equal(plan.unresolved,1);
  assert.equal(plan.sourceCapturedAt,view.sourceCapturedAt);
});

test('没有来源快照或图片时不能凭网站资料入图',()=>{
  const plan=posterCandidates({rows:[{key:'web',code:'YB56',sourceStock:null,images:[image],publishStatus:1}],sourceCapturedAt:null});
  assert.equal(plan.eligible.length,0);
  assert.equal(plan.unresolved,1);
});

test('导出前再次核对来源时间和本机图片清单，拒绝旧清单及错误图片',()=>{
  const current={sourceCapturedAt:'2026-10-24T01:00:00.000Z',eligible:[{key:'a',image:{file:'a.jpg',sha256:'hash'}}]},manifest=posterManifest(current.eligible),bytes=Buffer.alloc(120,0);bytes[0]=bytes[bytes.length-2]=0xff;bytes[1]=0xd8;bytes[bytes.length-1]=0xd9;
  const payload={sourceCapturedAt:current.sourceCapturedAt,manifest,pages:['data:image/jpeg;base64,'+bytes.toString('base64')]};
  assert.deepEqual(decodePosterExport(payload,current),[bytes]);
  assert.throws(()=>decodePosterExport({...payload,sourceCapturedAt:'旧时间'},current),/已有变化/);
  assert.throws(()=>decodePosterExport({...payload,manifest:'旧图片'},current),/已有变化/);
  assert.throws(()=>decodePosterExport({...payload,pages:['data:image/png;base64,AAAA']},current),/格式或大小无效/);
});


test('默认宣传素材读取本机资源，缺失或损坏明确失败',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'poster-template-')),file=path.join(dir,'footer.jpg');
  try{
    await assert.rejects(readPosterTemplate(file),/图片缺失/);
    await fs.writeFile(file,'not a JPEG');await assert.rejects(readPosterTemplate(file),/图片损坏/);
    const bytes=Buffer.alloc(120);bytes[0]=bytes[118]=255;bytes[1]=216;bytes[119]=217;await fs.writeFile(file,bytes);
    assert.deepEqual(await readPosterTemplate(file),{footer:'data:image/jpeg;base64,'+bytes.toString('base64')});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
