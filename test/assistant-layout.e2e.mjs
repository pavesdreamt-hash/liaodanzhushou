import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openOrderDatabase} from '../src/orders/database.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';

const evidence=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||'artifacts/assistant-ui-s1');

function fictionalOrder(){
  return {
    source:'manual',
    shopplus_order_no:'ASSISTANT-LAYOUT-FICTIONAL',
    shopplus_created_at:'2026-09-12T08:00:00.000Z',
    currency:'AED',
    order_status:'fictional',
    delivery_status:'unshipped',
    payment_method:'COD',
    customer_first_name:'Layout',
    customer_last_name:'Fictional',
    customer_full_name:'Layout Fictional',
    customer_phone:'+000 000 085',
    customer_email:'layout@example.invalid',
    country:'Example Country',
    province:'Example Province',
    city:'Example City',
    street:'Fictional Street 85',
    residence:'Unit 8',
    items:[{
      sku_code:'KY02',
      product_name_snapshot:'KY02 Fictional Product',
      quantity:1,
      unit_list_price:'50',
      unit_actual_price:'50',
      unit_cost_snapshot:'10',
      cost_source:'fictional'
    }]
  };
}

test('订单助手占据原右栏，原右栏内容移动到左栏下方',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'assistant-layout-'));
  const userData=path.join(directory,'user-data');
  const packagedExecutable=process.env.KDOCS_TEST_EXECUTABLE;
  let database,application;
  try{
    database=await openOrderDatabase({userDataPath:userData});
    new OrderService(new OrderRepository(database)).createOrder(fictionalOrder());
    database.close();database=null;
    await mkdir(evidence,{recursive:true});
    application=await electron.launch({
      executablePath:packagedExecutable||electronPath,
      args:[...(packagedExecutable?[]:['.']),`--orders-test-user-data=${userData}`],
      cwd:path.resolve('.'),
      env:{...process.env,NODE_ENV:'test'}
    });
    const page=await application.firstWindow();
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
    await page.getByRole('button',{name:'订单管理',exact:true}).click();
    await page.getByRole('button',{name:'订单列表',exact:true}).click();
    await page.locator('#orders-table-body tr').filter({hasText:'ASSISTANT-LAYOUT-FICTIONAL'}).click();
    await page.getByRole('heading',{name:'客户信息',exact:true}).waitFor();

    const closed=await page.evaluate(()=>{
      const left=document.querySelector('.detail-column-left').getBoundingClientRect();
      const right=document.querySelector('.detail-column-right').getBoundingClientRect();
      return {leftWidth:left.width,rightWidth:right.width,leftTop:left.top,rightTop:right.top};
    });
    assert.ok(Math.abs(closed.leftWidth-closed.rightWidth)<=2);
    assert.ok(Math.abs(closed.leftTop-closed.rightTop)<=2);

    await page.getByRole('button',{name:'订单助手',exact:true}).click();
    await page.locator('.order-assistant').waitFor();
    const opened=await page.evaluate(()=>{
      const workspace=document.querySelector('.detail-workspace').getBoundingClientRect();
      const assistantElement=document.querySelector('.order-assistant');
      const assistant=assistantElement.getBoundingClientRect();
      const left=document.querySelector('.detail-column-left').getBoundingClientRect();
      const right=document.querySelector('.detail-column-right').getBoundingClientRect();
      const head=document.querySelector('.order-detail-page-head');
      const nav=document.querySelector('.app-nav');
      return {
        workspaceWidth:workspace.width,
        assistantWidth:assistant.width,
        workspaceTop:workspace.top,
        assistantTop:assistant.top,
        workspaceRight:workspace.right,
        assistantLeft:assistant.left,
        leftBottom:left.bottom,
        rightTop:right.top,
        headHeight:head.offsetHeight,
        headTop:head.getBoundingClientRect().top,
        headBottom:head.getBoundingClientRect().bottom,
        navHeight:nav.offsetHeight,
        assistantStickyTop:getComputedStyle(assistantElement).top,
        noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth
      };
    });
    assert.ok(Math.abs(opened.workspaceWidth-opened.assistantWidth)<=2,JSON.stringify(opened));
    assert.ok(Math.abs(opened.workspaceTop-opened.assistantTop)<=2,JSON.stringify(opened));
    assert.ok(opened.assistantLeft>opened.workspaceRight,JSON.stringify(opened));
    assert.ok(opened.rightTop>opened.leftBottom,JSON.stringify(opened));
    assert.equal(opened.noHorizontalScroll,true);
    await page.screenshot({path:path.join(evidence,'05-assistant-half-column-1440x900.png'),fullPage:true});

    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(900,700));
    const narrow=await page.evaluate(()=>{
      const content=document.querySelector('.order-detail-page-content').getBoundingClientRect();
      const workspace=document.querySelector('.detail-workspace').getBoundingClientRect();
      const assistant=document.querySelector('.order-assistant').getBoundingClientRect();
      return {
        contentWidth:content.width,
        workspaceWidth:workspace.width,
        assistantWidth:assistant.width,
        assistantTop:assistant.top,
        workspaceBottom:workspace.bottom,
        noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth
      };
    });
    assert.ok(Math.abs(narrow.contentWidth-narrow.workspaceWidth)<=2,JSON.stringify(narrow));
    assert.ok(Math.abs(narrow.contentWidth-narrow.assistantWidth)<=2,JSON.stringify(narrow));
    assert.ok(narrow.assistantTop>narrow.workspaceBottom,JSON.stringify(narrow));
    assert.equal(narrow.noHorizontalScroll,true);
  }finally{
    if(database)database.close();
    await application?.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true});
  }
});
