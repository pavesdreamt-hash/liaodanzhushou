import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthView} from '../src/ui/oauth-view.mjs';

test('renderer收到OAuth成功会显示已连接且结束授权阶段',()=>{
  const view=oauthView({event:'oauth-sheets-test-succeeded',message:'Google Sheets真实读取成功',metrics:{title:'商品库存'}});assert.equal(view.connected,true);assert.equal(view.stage,'Google Sheets');assert.equal(view.buttonText,'重新连接');assert.equal(view.error,null);
});

test('renderer收到OAuth失败会显示明确错误与重新授权按钮',()=>{
  const view=oauthView({event:'oauth-error',message:'连接Google令牌服务超时',metrics:{code:'GOOGLE_TOKEN_TIMEOUT'}});assert.equal(view.connected,false);assert.equal(view.buttonText,'重新授权');assert.equal(view.error.code,'GOOGLE_TOKEN_TIMEOUT');
});
