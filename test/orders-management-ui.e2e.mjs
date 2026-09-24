import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openOrderDatabase} from '../src/orders/database.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';

const packageInfo=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const fictionalOrder=(number,items=[{sku_code:'YB17',product_name_snapshot:'Fictional YB17',quantity:1,unit_list_price:'50',unit_actual_price:'50',unit_cost_snapshot:'20',cost_source:'fictional'}])=>({source:'manual',shopplus_order_no:number,shopplus_created_at:'2026-09-01T08:00:00.000Z',currency:'AED',order_status:'fictional',delivery_status:'unshipped',payment_method:'COD',customer_first_name:'Fictional',customer_last_name:'Person',customer_full_name:'Fictional Person',customer_phone:'+000 000 002',customer_email:'fictional@example.invalid',country:'Example Country',province:'Example Province',city:'Example City',street:'Fictional Street',residence:'Fictional Residence',items});

test('订单管理使用真实列表，小窗口列不重叠且多商品没有内部横线',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'orders-management-ui-')),userData=path.join(directory,'data'),artifacts=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||`artifacts/orders-management-${packageInfo.version}`);let app,database;
 try{
  await mkdir(artifacts,{recursive:true});
  database=await openOrderDatabase({userDataPath:userData});const service=new OrderService(new OrderRepository(database));
  for(let index=1;index<=11;index++)service.createOrder(fictionalOrder(`PAGE-${index}`));
  service.createOrder(fictionalOrder('MULTI-PRODUCT',[{sku_code:'YB17',product_name_snapshot:'Fictional YB17',quantity:1,unit_list_price:'50',unit_actual_price:'50',unit_cost_snapshot:'20',cost_source:'fictional'},{sku_code:'KY02',product_name_snapshot:'Fictional KY02',quantity:2,unit_list_price:'50',unit_actual_price:'50',unit_cost_snapshot:'20',cost_source:'fictional'},{sku_code:'PACK03',product_name_snapshot:'Fictional Pack',quantity:3,unit_list_price:'25',unit_actual_price:'25',unit_cost_snapshot:'10',cost_source:'fictional'}]));
  database.close();database=null;
  const executable=process.env.KDOCS_TEST_EXECUTABLE;app=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${userData}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(820,640));const frame=page.frameLocator('iframe.confirmed-frame');
  await frame.locator('aside').getByRole('button',{name:'订单管理',exact:true}).click();
  await frame.locator('#ui040').waitFor();
  assert.equal(await frame.getByRole('button',{name:'新增订单',exact:true}).count(),0);
  assert.equal(await frame.getByRole('button',{name:'同步最新订单',exact:true}).count(),1);
  assert.equal(await frame.getByText('API 已连接',{exact:true}).count(),0);
  await frame.getByRole('button',{name:'同步最新订单',exact:true}).click();
  const syncDialog=frame.getByRole('dialog');await syncDialog.getByRole('heading',{name:'同步 ShopPlus 订单',exact:true}).waitFor();
  assert.equal(await syncDialog.getByText('尚未配置 ShopPlus API',{exact:true}).count(),1);
  assert.equal(await syncDialog.getByRole('button',{name:'配置 ShopPlus API',exact:true}).count(),1);
  assert.equal(await syncDialog.getByRole('button',{name:'同步最新订单',exact:true}).isDisabled(),true);
  await syncDialog.getByRole('button',{name:'关闭',exact:true}).click();
  assert.equal(await frame.getByText('UI-040',{exact:false}).count(),0);
  await frame.getByRole('button',{name:'订单管理说明与布局设置'}).click();
  await frame.getByRole('dialog').getByText('导入、查找和管理订单，以及维护聊单用户档案。可在此调整并应用本屏幕的导航与内容布局。').waitFor();
  await frame.getByRole('button',{name:'应用',exact:true}).click();
  assert.equal(await frame.locator('.ob-rows tr').count(),10);
  assert.equal(await frame.locator('.ob-orders th').allTextContents().then(values=>values.includes('序号')&&values.includes('订单总金额')),true);
  await frame.getByRole('button',{name:'下一页',exact:true}).click();
  await frame.getByText('第 2 / 2 页',{exact:true}).waitFor();
  await frame.getByLabel('开始日期').fill('2026-09-02');
  assert.match(await frame.locator('.ob-rows').innerText(),/没有符合条件的订单/);
  await frame.getByLabel('开始日期').fill('');
  await frame.locator('.ob-search').fill('MULTI-PRODUCT');
  const multi=frame.locator('.ob-rows tr').filter({hasText:'MULTI-PRODUCT'});
  await multi.waitFor();
  assert.equal(await multi.locator('.ob-products > span').count(),3);
  assert.equal(await multi.evaluate(element=>getComputedStyle(element).getPropertyValue('--ob-product-count').trim()),'3');
  assert.equal(await multi.locator('.ob-products > span').evaluateAll(lines=>lines.every(line=>getComputedStyle(line).borderTopWidth==='0px')),true,'多商品内部没有横线');
  assert.equal(await multi.locator('td').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).borderBottomWidth==='1px')),true,'订单行底部保留单条分隔线');
  const tableMetrics=await frame.locator('.ob-orders .table-wrap').evaluate(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));
  assert.ok(tableMetrics.scrollWidth>tableMetrics.clientWidth,'小窗口使用表格横向滚动，列宽不被继续压缩');
  const cellGeometry=await multi.locator('td').evaluateAll(cells=>cells.map(cell=>{const rect=cell.getBoundingClientRect();return {left:rect.left,right:rect.right,width:rect.width,overflow:getComputedStyle(cell).overflowX};}));
  assert.equal(cellGeometry.every((cell,index)=>cell.width>=49&&cell.overflow==='hidden'&&(index===0||cell.left>=cellGeometry[index-1].right-1)),true,'各列保持独立宽度且内容不会溢出到相邻列');
  for(const [buttonName,candidate] of [['ShopPlus 状态',frame.locator('.ob-api-status')],['同步最新订单',frame.getByRole('button',{name:'同步最新订单',exact:true})],['从文件导入',frame.getByRole('button',{name:'从文件导入',exact:true})]]){const box=await candidate.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=820,`小窗口可完整看到${buttonName}`);}
  await page.mouse.move(5,5);await page.screenshot({path:path.join(artifacts,'orders-820x640.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,820));await page.waitForTimeout(300);const regularMetrics=await frame.locator('.ob-orders .table-wrap').evaluate(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));assert.ok(regularMetrics.scrollWidth<=regularMetrics.clientWidth+1,`常用窗口完整显示全部订单列：${JSON.stringify(regularMetrics)}`);const detailBox=await multi.getByRole('button',{name:'订单详情',exact:true}).boundingBox();assert.ok(detailBox&&detailBox.x+detailBox.width<=1280,'常用窗口可直接看到订单详情入口');await page.mouse.move(5,5);await page.screenshot({path:path.join(artifacts,'orders-1280x820.png')});
  const collapsedInitially=await frame.locator('#ui040').evaluate(element=>element.classList.contains('up-nav-collapsed'));
  await frame.getByRole('button',{name:collapsedInitially?'展开导航栏':'折叠导航栏'}).click();
  assert.equal(await frame.locator('#ui040').evaluate(element=>element.classList.contains('up-nav-collapsed')),true);
  assert.equal(await frame.locator('.up-version').textContent(),`v${packageInfo.version}`);
  assert.equal(await frame.locator('.connection,.wa,.up-status').count(),0);
  for(const label of ['商品库存','利润核算','助手配置','连接与设置']){
    await frame.getByRole('button',{name:label,exact:true}).click();
    await frame.locator('.unified-page').waitFor();
    assert.equal(await frame.locator('.unified-page').evaluate(element=>element.classList.contains('up-nav-collapsed')),true,`${label} 保留全站折叠状态`);
    assert.equal(await frame.locator('.up-version').textContent(),`v${packageInfo.version}`,`${label} 统一显示版本`);
    assert.equal(await frame.locator('.connection,.wa,.up-status').count(),0,`${label} 不保留旧底部状态信息`);
    assert.equal(await frame.getByRole('button',{name:'展开导航栏',exact:true}).count(),1,`${label} 折叠后仍显示展开按钮`);
  }
  await frame.getByRole('button',{name:'聊单工作台',exact:true}).click();
  await frame.locator('#chat-workbench-desktop').waitFor();
  assert.equal(await frame.locator('#chat-workbench-desktop').evaluate(element=>element.classList.contains('is-nav-open')),false,'工作台同步采用全站折叠状态');
  assert.equal(await frame.locator('.cwb-version').textContent(),`v${packageInfo.version}`);
 }finally{if(database)database.close();if(app){await Promise.race([app.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(app.process().exitCode===null)app.process().kill('SIGKILL');}await rm(directory,{recursive:true,force:true});}
});
