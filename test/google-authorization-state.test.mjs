import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp} from 'node:fs/promises';
import {ensureDirectories,readJSON,writeJSON} from '../src/core/files.mjs';
import {Orchestrator,isGoogleAuthorizationError} from '../src/services/orchestrator.mjs';

async function fixture(latest){
  const base=await mkdtemp(path.join(os.tmpdir(),'kdocs-google-state-')),paths=await ensureDirectories(base);
  await writeJSON(path.join(paths.state,'app-state.json'),{lastSuccessfulSync:null,lastCheck:null,productCount:0,kdocsLoggedIn:false,latest});
  const oauth={connect:async()=>({connected:true}),status:async()=>({configured:true,connected:true}),reportStatus:()=>{}};
  const sheets={metadata:async()=>({spreadsheetId:'1VMkplU-fcuF2-2BimrduNpmgCKJiUeNoMduGlqxHC4c',properties:{title:'商品库存'},sheets:[{properties:{title:'库存情况'}},{properties:{title:'商品映射'}}]})};
  return {paths,orchestrator:new Orchestrator({paths,oauth,sheets})};
}

test('旧invalid_grant状态显示授权失效而不是绿色已连接',async()=>{
  const {orchestrator}=await fixture({ok:false,at:'2026-09-05T13:21:31.638Z',error:{stage:'读取Google表格',code:'GOOGLE_API_FAILED',message:'读取Google表格失败：invalid_grant'}});
  const status=await orchestrator.status();assert.equal(status.google.connected,false);assert.equal(status.google.needsReconnect,true);
});

test('重新连接真实读取成功后清除旧授权错误并保存验证时间',async()=>{
  const {paths,orchestrator}=await fixture({ok:false,at:'2026-09-05T13:21:31.638Z',error:{stage:'读取Google表格',code:'GOOGLE_API_FAILED',message:'读取Google表格失败：invalid_grant'}});
  const result=await orchestrator.connectGoogle();assert.equal(result.connected,true);
  const state=await readJSON(path.join(paths.state,'app-state.json'));assert.equal(state.latest,null);assert.equal(state.googleAuthorization.status,'verified');assert.ok(state.googleAuthorization.verifiedAt);
  const status=await orchestrator.status();assert.equal(status.google.connected,true);assert.equal(status.google.needsReconnect,false);
});

test('授权错误分类不会把普通网络超时误判为需要重新授权',()=>{
  assert.equal(isGoogleAuthorizationError({code:'GOOGLE_AUTH_EXPIRED'}),true);
  assert.equal(isGoogleAuthorizationError({code:'GOOGLE_API_FAILED',message:'invalid_grant'}),true);
  assert.equal(isGoogleAuthorizationError({code:'GOOGLE_TIMEOUT',message:'网络超时'}),false);
});
