import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron,chromium} from 'playwright-core';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const required=name=>{const value=process.env[name];if(!value)throw new Error(`缺少验收参数：${name}`);return value;};
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

async function localUrl(userData){
  for(let attempt=0;attempt<200;attempt++){
    const files=await readdir(path.join(userData,'logs')).catch(()=>[]),entries=[];
    for(const file of files.filter(name=>name.startsWith('startup-')).sort()){
      const text=await readFile(path.join(userData,'logs',file),'utf8').catch(()=>'');
      for(const line of text.split('\n').filter(Boolean))try{entries.push(JSON.parse(line));}catch{}
    }
    const started=entries.filter(entry=>entry.message==='本地管理页面已启动').at(-1);
    if(started){const token=(await readFile(path.join(userData,'local-web-token'),'utf8')).trim(),url=`http://127.0.0.1:${started.metrics.port}/?token=${token}`;try{const response=await fetch(url);if(response.ok)return url;}catch{}}
    await delay(100);
  }
  throw new Error('打包应用没有启动本地管理页面');
}

async function launch(packaged,userData,{directProduction=false}={}){
  const executable=path.join(packaged,'Contents','MacOS',path.basename(packaged,'.app'));
  const application=await electron.launch({executablePath:executable,args:directProduction?[]:[`--isolated-user-data=${userData}`],cwd:path.dirname(packaged),env:{...process.env,NODE_ENV:'production'}});
  return {application,url:await localUrl(userData)};
}

async function openOrders(browser,url){
  const page=await browser.newPage({viewport:{width:1280,height:800}});await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('button',{name:'订单管理',exact:true}).click();return page;
}

async function choose(page,file){
  const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'导入ShopPlus Excel',exact:true}).first().click();const chooser=await chooserPromise;await chooser.setFiles(file);
}

test('打包版使用用户指定ShopPlus文件完成预览、NULL成本确认、导入、重启和重复保护',async()=>{
  const packaged=path.resolve(required('KDOCS_PACKAGED_APP')),file=path.resolve(required('KDOCS_USER_SHOPPLUS_FILE')),expectedOrders=Number(required('KDOCS_EXPECTED_ORDERS')),expectedItems=Number(required('KDOCS_EXPECTED_ITEMS')),explicitUserData=process.env.KDOCS_USER_DATA?path.resolve(process.env.KDOCS_USER_DATA):null,directory=explicitUserData?null:await mkdtemp(path.join(os.tmpdir(),'kdocs-user-shopplus-')),userData=explicitUserData||path.join(directory,'user-data');let application,browser,page;
  try{
    browser=await chromium.launch({headless:true});let launched=await launch(packaged,userData,{directProduction:Boolean(explicitUserData)});application=launched.application;page=await openOrders(browser,launched.url);await choose(page,file);
    await page.waitForFunction(value=>document.querySelector('#pv-orders')?.textContent===String(value),expectedOrders);assert.equal(await page.locator('#preview-filename').textContent(),path.basename(file));assert.equal(await page.locator('#pv-items').textContent(),String(expectedItems));assert.equal(await page.locator('#pv-blocked').textContent(),'0');assert.equal(await page.locator('#pv-review').textContent(),String(expectedOrders));assert.equal(await page.locator('input[data-field="costAed"]').count(),expectedItems);for(const input of await page.locator('input[data-field="costAed"]').all())assert.equal(await input.inputValue(),'');
    while(await page.locator('.review-checks').count()){const count=await page.locator('.review-checks').count(),review=page.locator('.review-checks').first();await review.locator('[data-confirm-review]').check();if(await review.locator('[data-confirm-missing-cost]').count())await review.locator('[data-confirm-missing-cost]').check();if(await review.locator('[data-confirm-discount]').count())await review.locator('[data-confirm-discount]').check();await review.getByRole('button',{name:'保存核对',exact:true}).click();await page.waitForFunction(previous=>document.querySelectorAll('.review-checks').length<previous,count);}
    await page.getByText(`准备导入 ${expectedOrders} 个订单`,{exact:true}).waitFor();await page.getByRole('button',{name:'确认导入',exact:true}).click();await page.locator('#import-confirm-dialog').getByRole('button',{name:'确认导入',exact:true}).click();await page.waitForFunction(value=>document.querySelectorAll('#orders-table-body tr').length===value,expectedOrders);await page.close();page=null;await application.close();application=null;
    let database=new DatabaseSync(path.join(userData,'orders','orders.sqlite'),{readOnly:true}),stats={orders:Number(database.prepare('SELECT count(*) n FROM orders').get().n),items:Number(database.prepare('SELECT count(*) n FROM order_items').get().n),nullCosts:Number(database.prepare('SELECT count(*) n FROM order_items WHERE unit_cost_snapshot IS NULL').get().n),zeroCosts:Number(database.prepare('SELECT count(*) n FROM order_items WHERE unit_cost_snapshot=0').get().n)};database.close();assert.deepEqual(stats,{orders:expectedOrders,items:expectedItems,nullCosts:expectedItems,zeroCosts:0});
    launched=await launch(packaged,userData,{directProduction:Boolean(explicitUserData)});application=launched.application;page=await openOrders(browser,launched.url);await choose(page,file);await page.waitForFunction(value=>document.querySelector('#pv-duplicate')?.textContent===String(value),expectedOrders);assert.equal(await page.locator('#commit-orders').isDisabled(),true);await page.close();page=null;await application.close();application=null;
    database=new DatabaseSync(path.join(userData,'orders','orders.sqlite'),{readOnly:true});assert.equal(Number(database.prepare('SELECT count(*) n FROM orders').get().n),expectedOrders);database.close();console.log(`USER_FILE_ACCEPTANCE=${JSON.stringify(stats)}`);
  }finally{await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await application?.close().catch(()=>{});if(directory)await rm(directory,{recursive:true,force:true});}
});
