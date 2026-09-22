import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LocalWebServer} from '../src/local-web-server.mjs';

test('1.0.5 UI shell embeds the confirmed pages and fixed visual structure',async()=>{
  const [html,script,css]=await Promise.all([
    readFile(new URL('../renderer/index.html',import.meta.url),'utf8'),
    readFile(new URL('../renderer/app.js',import.meta.url),'utf8'),
    readFile(new URL('../renderer/app.css',import.meta.url),'utf8')
  ]);
  assert.match(html,/src="\.\/app\.js"/);assert.match(html,/href="\.\/app\.css"/);
  for(const label of ['聊单工作台','订单管理','商品库存','利润核算','助手配置','连接与设置','产品详情','订单详情','利润详情'])assert.match(script,new RegExp(label));
  assert.match(script,/liaodan-assistant-next-ui/);assert.match(script,/liaodan.order-detail.layout.v1/);assert.match(script,/ol-phone-height/);assert.match(script,/#7c3aed/);assert.match(css,/confirmed-frame/);
});

test('local dashboard serves only token-authorized compressed product media',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'v100-media-'));t.after(()=>import('node:fs/promises').then(({rm})=>rm(directory,{recursive:true,force:true})));
  const filename='product-123e4567-e89b-12d3-a456-426614174000.jpg',payload=Buffer.from([0xff,0xd8,0xff,0xd9]);await writeFile(path.join(directory,filename),payload);
  const server=new LocalWebServer({rendererDirectory:directory,sourceDirectory:directory,productMediaDirectory:directory,dispatch:async()=>({ok:true})});server.token='fictional-token';server.origin='http://127.0.0.1:43875';
  const response={status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  await server.handle({method:'GET',url:`/product-media/${filename}?token=fictional-token`,headers:{}},response);
  assert.equal(response.status,200);assert.equal(response.headers['content-type'],'image/jpeg');assert.deepEqual(response.body,payload);
  const denied={status:null,writeHead(status){this.status=status;},end(){}};await server.handle({method:'GET',url:`/product-media/${filename}`,headers:{}},denied);assert.equal(denied.status,403);
});
