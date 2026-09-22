import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const navIcons=[['聊单工作台','messages-square'],['订单管理','archive'],['商品库存','boxes'],['利润核算','chart-no-axes-combined'],['助手配置','bot'],['连接与设置','settings']];
const pages=['订单管理','商品库存','利润核算','助手配置','连接与设置'];

test('订单、库存、利润、助手和设置页使用与工作台相同的导航样式和图标',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'unified-navigation-'));let application;
 try{
  application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:[...(process.env.KDOCS_TEST_EXECUTABLE?[]:['.']),`--orders-test-user-data=${directory}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow(),frame=page.frameLocator('iframe.confirmed-frame');
  for(const destination of pages){
   await frame.locator('aside').first().getByRole('button',{name:destination,exact:true}).click();
   await frame.getByRole('heading',{name:destination,exact:true}).first().waitFor();
   const sidebar=frame.locator('aside').first(),first=sidebar.getByRole('button',{name:'聊单工作台',exact:true});
   assert.deepEqual(await first.evaluate(element=>{const style=getComputedStyle(element);return {height:style.height,fontSize:style.fontSize,paddingLeft:style.paddingLeft,gap:style.gap};}),{height:'44px',fontSize:'15px',paddingLeft:'12px',gap:'10px'});
   assert.equal(await sidebar.locator('.nav-label').first().evaluate(element=>getComputedStyle(element).marginBottom),'9px');
   for(const [label,icon] of navIcons)assert.match(await sidebar.getByRole('button',{name:label,exact:true}).locator('svg').getAttribute('class')||'',new RegExp(`lucide-${icon}`));
  }
 }finally{await application?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
