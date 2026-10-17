import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {QuickReplies} from '../src/quick-replies.mjs';

test('常用话术按原顺序保存、编辑、删除，重启服务保留完整原文',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'quick-replies-'));try{
  let service=new QuickReplies(dir);assert.deepEqual((await service.list()).items,[]);
  let state=await service.save({revision:0,title:'虚构确认',text:'请确认虚构订单。\n<strong>原文</strong> 😊'});const id=state.items[0].id;
  state=await service.save({revision:state.revision,title:'虚构配送',text:'请提供完整虚构地址。'});
  state=await service.save({revision:state.revision,id,title:'修改后的确认',text:'新的虚构原文\n120 AED'});
  service=new QuickReplies(dir);assert.deepEqual(await service.list(),state);assert.equal(state.items[0].id,id);assert.equal(state.items[0].text,'新的虚构原文\n120 AED');
  await assert.rejects(service.save({revision:state.revision,title:'修改后的确认',text:'重复名称'}),/同名/);
  state=await service.remove({revision:state.revision,id});assert.equal(state.items.length,1);assert.equal(state.items[0].title,'虚构配送');assert.deepEqual(await new QuickReplies(dir).list(),state);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('陈旧或并发保存、无效输入和损坏文件不能覆盖原话术',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'quick-replies-guards-'));try{
  const service=new QuickReplies(dir);const results=await Promise.allSettled([service.save({revision:0,title:'A',text:'虚构A'}),service.save({revision:0,title:'B',text:'虚构B'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const state=await service.list(),original=await readFile(service.file,'utf8');await assert.rejects(service.remove({revision:0,id:state.items[0].id}),/已变化/);
  for(const value of [{revision:1,title:'',text:'虚构'},{revision:1,title:'长'.repeat(81),text:'虚构'},{revision:1,title:'标题',text:'长'.repeat(6001)},{revision:1,title:'标题',text:'虚构',file:'../other'},{revision:1,title:'标题',text:'虚构',id:'../other'}])await assert.rejects(service.save(value));assert.equal(await readFile(service.file,'utf8'),original);
  await writeFile(service.file,'{broken original');await assert.rejects(service.list(),/原文件已保留/);await assert.rejects(service.save({revision:0,title:'不能覆盖',text:'虚构'}),/原文件已保留/);assert.equal(await readFile(service.file,'utf8'),'{broken original');
  await rm(service.file);await rm(path.dirname(service.file),{recursive:true});await writeFile(path.dirname(service.file),'blocked configuration directory');await assert.rejects(service.save({revision:0,title:'失败保留',text:'虚构'}),/无法读取|保存失败/);assert.equal(await readFile(path.dirname(service.file),'utf8'),'blocked configuration directory');
 }finally{await rm(dir,{recursive:true,force:true});}
});
