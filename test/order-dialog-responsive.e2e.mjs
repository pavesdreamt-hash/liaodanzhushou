import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openOrderDatabase} from '../src/orders/database.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';

const longOrderNo=`E2E-RESPONSIVE-${'ORDER'.repeat(28)}`;
const longEmail=`fictional.${'mailbox'.repeat(22)}@example.invalid`;
const longStreet=`${'Fictional-Unbroken-English-Address-'.repeat(12)} شارع اختباري طويل للغاية`;

function fictionalOrder(orderNo=longOrderNo){return {source:'manual',shopplus_order_no:orderNo,shopplus_created_at:'2026-09-02T08:00:00.000Z',currency:'AED',order_status:'fictional',delivery_status:'unshipped',payment_method:'COD',customer_first_name:null,customer_last_name:'اختبار',customer_full_name:'اسم خيالي كامل للاختبار',customer_phone:'+000 000 000 000',customer_email:longEmail,country:'Fictional Country',province:'Fictional Province',city:'Example City',street:longStreet,residence:null,order_total:'210.00',product_total:'210.00',discount_amount:'0',items:[{sku_code:'KY02',product_name_snapshot:`KY02 ${'Very Long Fictional Product Name '.repeat(10)}`,quantity:1,unit_list_price:'100.00',unit_actual_price:'100.00',unit_cost_snapshot:'20.00',cost_source:'fictional'},{sku_code:'YB17',product_name_snapshot:'YB17 Fictional Product',quantity:1,unit_list_price:'60.00',unit_actual_price:'60.00',unit_cost_snapshot:'15.00',cost_source:'fictional'},{sku_code:'Z01',product_name_snapshot:'Z01 Fictional Product',quantity:1,unit_list_price:'50.00',unit_actual_price:'50.00',unit_cost_snapshot:'10.00',cost_source:'fictional'}]};}
async function launch(userData){return electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${userData}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});}
async function openLongOrder(page){await page.locator('#order-search').fill(longOrderNo);const row=page.locator('#orders-table-body tr').filter({hasText:longOrderNo});await row.waitFor();await row.click();await page.getByRole('heading',{name:'客户信息'}).waitFor();return row;}
async function layout(page){return page.evaluate(()=>{const detail=document.querySelector('#order-detail-page'),content=document.querySelector('#order-detail-content'),workspace=document.querySelector('.detail-workspace'),head=document.querySelector('.order-detail-page-head'),footer=document.querySelector('.order-detail-page-footer'),customer=document.querySelector('.compact-recipient'),report=document.querySelector('.order-report-card'),visibleDialogs=[...document.querySelectorAll('dialog')].filter(value=>value.open).length,overflowing=[...detail.querySelectorAll('*')].filter(element=>!element.matches('input,select,textarea')&&element.scrollWidth>element.clientWidth+1&&getComputedStyle(element).overflowX!=='hidden').map(element=>element.className||element.tagName),gridTemplate=getComputedStyle(workspace).gridTemplateColumns;return {page:[document.documentElement.scrollWidth,document.documentElement.clientWidth],detail:[detail.scrollWidth,detail.clientWidth],content:[content.scrollWidth,content.clientWidth],contentLeft:content.scrollLeft,columns:new Set([...workspace.children].map(element=>Math.round(element.getBoundingClientRect().left))).size,gridTemplate,headTop:head.getBoundingClientRect().top,footerBottom:footer.getBoundingClientRect().bottom,topCardHeights:[customer?.getBoundingClientRect().height||0,report?.getBoundingClientRect().height||0],headingFontSizes:[getComputedStyle(customer?.querySelector('h3')).fontSize,getComputedStyle(report?.querySelector('h3')).fontSize],visibleDialogs,overflowing};});}

test('Electron 44订单详情是自适应整页工作区，四种尺寸无横向溢出并正确返回',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'electron-order-page-'));
  const userData=path.join(directory,'user-data');
  let application,database;
  try{
    database=await openOrderDatabase({userDataPath:userData});
    const service=new OrderService(new OrderRepository(database));
    const created=service.createOrder(fictionalOrder());
    service.createOrder(fictionalOrder('E2E-SECOND-ORDER'));
    database.close();database=null;
    application=await launch(userData);
    const page=await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button',{name:'订单管理'}).click();
    await page.getByRole('button',{name:'订单列表'}).click();
    for(const size of [{width:1440,height:900,columns:2},{width:1280,height:800,columns:2},{width:1024,height:768,columns:1},{width:900,height:700,columns:1}]){
      await page.setViewportSize(size);
      assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth===element.clientWidth),true);
      assert.deepEqual(await page.locator('#orders-list-page .order-list-table th').allTextContents(),['序号','日期','订单编号','客户电话','商品','商品数量','状态']);
      assert.equal(await page.locator('#orders-list-page .order-list-table thead').evaluate(element=>getComputedStyle(element).display!=='none'),size.width>=1200);
      if(size.width>=1200){const inset=await page.locator('#orders-table-body tr').first().evaluate(row=>Number.parseFloat(getComputedStyle(row.cells[0]).paddingLeft));assert.ok(inset>=20,`序号列左侧间距不足：${inset}`);}
      const row=await openLongOrder(page);
      assert.deepEqual(await row.locator('td').evaluateAll(cells=>cells.map(cell=>cell.dataset.label)),['序号','日期','订单编号','客户电话','商品','商品数量','状态']);
      assert.equal(await page.locator('#order-detail-dialog').count(),0);
      assert.equal(await page.locator('#order-detail-page').isVisible(),true);
      assert.equal(await page.locator('#order-detail-page').getByText(longOrderNo,{exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'在 Google Maps 中打开'}).count(),1);
      assert.equal(await page.locator('iframe[title="Google Maps 地址预览"]').count(),1);
      assert.equal(await page.getByRole('button',{name:'可配送'}).count(),1);
      assert.equal(await page.getByRole('button',{name:'超出范围'}).count(),1);
      assert.equal(await page.locator('.recipient-table-row').count(),8);
      assert.equal(await page.locator('.detail-history').evaluate(element=>element.open),false);
      const result=await layout(page);
      assert.deepEqual(result.page,[result.page[1],result.page[1]]);
      assert.deepEqual(result.detail,[result.detail[1],result.detail[1]]);
      assert.deepEqual(result.content,[result.content[1],result.content[1]]);
      assert.equal(result.contentLeft,0);
      assert.equal(result.columns,size.columns,result.gridTemplate);
      if(size.columns===2){assert.ok(Math.abs(result.topCardHeights[0]-result.topCardHeights[1])<=1,`客户信息/报单卡片高度不一致：${result.topCardHeights}`);assert.deepEqual(result.headingFontSizes,['19px','19px']);}
      assert.equal(result.visibleDialogs,0);
      assert.deepEqual(result.overflowing,[]);
      await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
      const scrollTop=await page.evaluate(()=>document.documentElement.scrollTop);
      assert.ok((await layout(page)).footerBottom<=size.height+scrollTop+1);
      await page.locator('#order-detail-close').click();
      await page.locator('#orders-table-body tr').first().waitFor();
      await page.waitForFunction(element=>document.activeElement===element,await row.elementHandle());
    }
    await page.setViewportSize({width:900,height:700});
    let row=await openLongOrder(page);
    await page.getByRole('button',{name:'编辑客户信息'}).click();
    await page.getByLabel('选择收件资料字段').selectOption('province');
    await page.getByLabel('省人工值').fill('Unsaved Fictional Province');
    let prompted=false;
    page.once('dialog',async dialog=>{prompted=true;await dialog.dismiss();});
    await page.locator('#order-detail-close').click();
    await page.waitForTimeout(50);
    assert.equal(prompted,true);
    assert.equal(await page.locator('#order-detail-page').isVisible(),true);
    page.once('dialog',dialog=>dialog.accept());
    await page.keyboard.press('Escape');
    await page.locator('#orders-table-body tr').first().waitFor();
    await page.waitForFunction(element=>document.activeElement===element,await row.elementHandle());
    row=await openLongOrder(page);
    await page.evaluate(()=>scrollTo(0,420));
    await page.locator('#order-detail-close').click();
    await page.locator('#order-search').fill('E2E-SECOND-ORDER');
    const second=page.locator('#orders-table-body tr').filter({hasText:'E2E-SECOND-ORDER'});
    await second.click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollLeft),0);
    assert.equal((await layout(page)).contentLeft,0);
    assert.equal(created.shopplus_order_no,longOrderNo);
  }finally{
    if(database)database.close();
    if(application)await application.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true});
  }
});
