import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const isoToday=()=>new Date().toLocaleDateString('sv-SE');
const shiftDay=(value,offset)=>{const [year,month,day]=value.split('-').map(Number),next=new Date(year,month-1,day+offset);return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;};

test('利润核算连续显示未登记自然日，补录入口不写入成本',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'profit-calendar-days-')),userData=path.join(directory,'data'),artifacts=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||`artifacts/profit-calendar-days`),today=isoToday(),savedDay=shiftDay(today,-3),emptyDays=[shiftDay(today,-2),shiftDay(today,-1),today];let application;
  try{
    await mkdir(artifacts,{recursive:true});
    const executable=process.env.KDOCS_TEST_EXECUTABLE;application=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${userData}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow();page.setDefaultTimeout(12000);await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,820));
    const saved=await page.evaluate(day=>window.inventoryApp.orders.saveDailyCosts({day,adUsd:'0',usdCnyRate:'7',accountCostCny:'0'}),savedDay);assert.equal(saved.ok,true);
    const frame=page.frameLocator('iframe.confirmed-frame');await frame.getByRole('button',{name:'利润核算',exact:true}).click();const savedRow=frame.locator('#ui034 tbody tr').filter({hasText:savedDay});await savedRow.waitFor();assert.equal(await savedRow.getByRole('button',{name:'查看详情',exact:true}).count(),1,'已有成本的日期保留详情入口');
    for(const day of emptyDays){const row=frame.locator('#ui034 tbody tr').filter({hasText:`${day} · 未登记`});await row.waitFor();assert.equal(await row.getByRole('button',{name:'登记成本',exact:true}).count(),1,`${day} 显示补录入口`);}
    await page.screenshot({path:path.join(artifacts,'profit-calendar-days.png')});await frame.locator('#ui034 tbody tr').filter({hasText:`${emptyDays[0]} · 未登记`}).getByRole('button',{name:'登记成本',exact:true}).click();assert.equal(await frame.locator('#u34-date').inputValue(),emptyDays[0],'补录入口只选择对应成本日期');const afterOpen=await page.evaluate(()=>window.inventoryApp.orders.profitDashboard({}));assert.equal(afterOpen.data.rows.some(row=>row.day===emptyDays[0]),false,'打开补录入口不生成每日成本记录');
  }finally{if(application){await application.close().catch(()=>{});try{if(application.process().exitCode===null)application.process().kill('SIGKILL');}catch{}}await rm(directory,{recursive:true,force:true});}
});
