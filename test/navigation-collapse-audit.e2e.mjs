import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import packageInfo from '../package.json' with {type:'json'};
import {openOrderDatabase} from '../src/orders/database.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';
const {version}=packageInfo;

const order={source:'manual',shopplus_order_no:'NAV-AUDIT-001',shopplus_created_at:'2026-09-24T08:00:00.000Z',currency:'AED',order_status:'fictional',delivery_status:'unshipped',payment_method:'COD',customer_first_name:'Navigation',customer_last_name:'Audit',customer_full_name:'Navigation Audit',customer_phone:'+000 000 007',customer_email:'navigation@example.invalid',country:'Example Country',province:'Example Province',city:'Example City',street:'7 Fictional Street',residence:'Unit 7',items:[{sku_code:'NAV07',product_name_snapshot:'Fictional navigation product',quantity:1,unit_list_price:'70',unit_actual_price:'70',unit_cost_snapshot:'20',cost_source:'fictional'}]};
test('九个可进入页面都有唯一导航折叠入口，订单详情与全站共享状态',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'navigation-collapse-audit-')),userData=path.join(directory,'data'),artifacts=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||`artifacts/navigation-collapse-${version}`);let application,database;
  try{
    await mkdir(artifacts,{recursive:true});database=await openOrderDatabase({userDataPath:userData});new OrderService(new OrderRepository(database)).createOrder(order);database.close();database=null;
    const executable=process.env.KDOCS_TEST_EXECUTABLE;application=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${userData}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow();page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(10000);await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
    const day='2026-09-23';const saved=await page.evaluate(async day=>({profile:await window.inventoryApp.orders.saveProductProfile({businessId:'NAV07',displayName:'Fictional navigation product',actualPrice:'70.00',category:'fictional'}),cost:await window.inventoryApp.orders.saveDailyCosts({day,adUsd:'0',usdCnyRate:'7',accountCostCny:'0'})}),day);assert.equal(saved.profile.ok,true);assert.equal(saved.cost.ok,true);
    const frame=page.frameLocator('iframe.confirmed-frame');
    const assertCollapsed=async(label,rootSelector,className)=>{
      await frame.locator(rootSelector).waitFor();const toggles=frame.locator('.cwb-nav-toggle,.ol-nav-toggle,.up-nav-toggle');assert.equal(await toggles.count(),1,`${label} 只有一个折叠入口`);assert.equal(await toggles.isVisible(),true,`${label} 折叠入口可见`);assert.match(await toggles.getAttribute('aria-label')||'',/^展开导航(?:栏)?$/,`${label} 展开语义正确`);if(className)assert.equal(await frame.locator(rootSelector).evaluate((element,name)=>element.classList.contains(name),className),true,`${label} 保留全站折叠状态`);
    };
    await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('#ui040').waitFor();
    await frame.locator('.ob-rows tr').filter({hasText:'NAV-AUDIT-001'}).getByRole('button',{name:'订单详情',exact:true}).click();await frame.locator('#ui008-order-detail').waitFor();
    assert.equal(await frame.getByRole('button',{name:'折叠导航栏',exact:true}).count(),1,'订单详情显示唯一折叠按钮');
    assert.equal(await frame.locator('.ol-version').textContent(),`v${version}`);
    assert.equal(await frame.locator('.od-connection').count(),0,'订单详情移除旧连接尾部');
    await page.screenshot({path:path.join(artifacts,'order-detail-expanded.png')});
    await frame.getByRole('button',{name:'折叠导航栏',exact:true}).click();
    assert.equal(await frame.locator('#ui008-order-detail').evaluate(element=>element.classList.contains('ol-nav-collapsed')),true);
    assert.equal(await frame.getByRole('button',{name:'展开导航栏',exact:true}).count(),1,'折叠后入口仍可用');
    assert.equal(await frame.locator('.od-sidebar').evaluate(element=>Math.round(element.getBoundingClientRect().width)),64);
    await page.screenshot({path:path.join(artifacts,'order-detail-collapsed.png')});

    await assertCollapsed('订单详情','#ui008-order-detail','ol-nav-collapsed');
    await frame.getByRole('button',{name:'聊单工作台',exact:true}).click();await assertCollapsed('聊单工作台','#chat-workbench-desktop','');assert.equal(await frame.locator('#chat-workbench-desktop').evaluate(element=>element.classList.contains('is-nav-open')),false,'聊单工作台保留全站折叠状态');
    await frame.getByRole('button',{name:'订单管理',exact:true}).click();await assertCollapsed('订单管理','#ui040','up-nav-collapsed');
    await frame.getByRole('button',{name:'商品库存',exact:true}).click();await frame.locator('#ui011-rows').getByText('Fictional navigation product').waitFor();await assertCollapsed('商品库存','#ui011-inventory','up-nav-collapsed');
    await frame.locator('#ui011-full-details').click();await assertCollapsed('商品详情','#ui032','up-nav-collapsed');
    await frame.getByRole('button',{name:'利润核算',exact:true}).click();await frame.locator('#ui034 tbody tr').filter({hasText:day}).waitFor();await assertCollapsed('利润核算','#ui034','up-nav-collapsed');
    await frame.locator('#ui034 tbody tr').filter({hasText:day}).getByRole('button',{name:'查看详情',exact:true}).click();await assertCollapsed('利润详情','#ui035','up-nav-collapsed');
    await frame.getByRole('button',{name:'助手配置',exact:true}).click();await assertCollapsed('助手配置','#ui041','up-nav-collapsed');
    await frame.getByRole('button',{name:'连接与设置',exact:true}).click();await assertCollapsed('连接与设置','#ui036','up-nav-collapsed');
  }finally{if(database)database.close();if(application){await Promise.race([application.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(application.process().exitCode===null)application.process().kill('SIGKILL');}await rm(directory,{recursive:true,force:true});}
});
