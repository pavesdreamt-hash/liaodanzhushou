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
const order={source:'manual',shopplus_order_no:'DETAIL-CLEAN-001',shopplus_created_at:'2026-09-24T08:00:00.000Z',currency:'AED',order_status:'fictional',delivery_status:'unshipped',payment_method:'COD',customer_first_name:'Detail',customer_last_name:'Audit',customer_full_name:'Detail Audit',customer_phone:'+000 000 008',customer_email:'detail@example.invalid',country:'Example Country',province:'Example Province',city:'Example City',street:'8 Fictional Street',residence:'Unit 8',items:[{sku_code:'CLEAN08',product_name_snapshot:'Fictional detail product',quantity:2,unit_list_price:'80',unit_actual_price:'80',unit_cost_snapshot:'30',cost_source:'fictional'}]};

test('订单详情恢复确认稿业务卡，同时保持快捷回复和客户聊天完全移除',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'order-detail-restored-')),userData=path.join(directory,'data'),artifacts=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||`artifacts/order-detail-${packageInfo.version}`);let application,database;
  try{
    await mkdir(artifacts,{recursive:true});database=await openOrderDatabase({userDataPath:userData});new OrderService(new OrderRepository(database)).createOrder(order);database.close();database=null;
    const executable=process.env.KDOCS_TEST_EXECUTABLE;application=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${userData}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow();page.setDefaultTimeout(15000);await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,820));const frame=page.frameLocator('iframe.confirmed-frame');
    await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('.ob-rows tr').filter({hasText:'DETAIL-CLEAN-001'}).getByRole('button',{name:'订单详情',exact:true}).click();const root=frame.locator('#ui008-order-detail');await root.waitFor();await root.locator('.od-heading-copy h1').filter({hasText:'DETAIL-CLEAN-001'}).waitFor();await root.locator('.od-stage-card').waitFor();

    assert.equal(await root.locator('.reply-rail,.reply-chat-workspace,.od-chat-column,.od-phone,.manual-composer').count(),0,'已删除的两个区域及聊天输入没有返回订单详情 DOM');
    assert.equal(await root.getByRole('button',{name:'关联真实聊天',exact:true}).count(),0,'没有恢复聊天关联入口');
    assert.equal(await root.evaluate(element=>element.classList.contains('ol-details-only')),true,'订单详情继续使用纯业务资料布局');
    assert.equal(await root.locator('.od-layout').evaluate(element=>getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length),1,'订单正文使用单列宽度');
    assert.equal(await root.locator('.od-stage-card').count(),1,'恢复原确认稿订单阶段卡');
    assert.equal(await root.locator('.od-stage').count(),4,'订单阶段卡保持四个推进步骤');
    assert.equal(await root.locator('.od-two-cards').count(),1,'恢复原确认稿客户和商品双卡布局');
    for(const title of ['客户信息','商品与金额','配送与包裹']){
      const heading=root.getByRole('heading',{name:title,exact:true});assert.equal(await heading.count(),1,`${title} 已恢复`);assert.equal(await heading.locator('svg').count(),1,`${title} 使用确认稿语义图标`);
    }
    assert.equal(await root.locator('.od-product-image').count(),1,'恢复商品视觉占位');
    assert.equal(await root.locator('.od-total').count(),1,'恢复订单合计行');
    assert.equal(await root.locator('.od-map').count(),1,'恢复配送地图视觉');
    assert.match(await root.locator('.od-status-actions').innerText(),/待发货/,'真实英文履约状态映射为中文');
    assert.doesNotMatch(await root.locator('.od-status-actions').innerText(),/unshipped|fictional/,'界面不显示原始英文状态');
    const text=await root.locator('.od-content').innerText();
    for(const actual of ['Detail Audit','+000 000 008','Example Country','Example City','8 Fictional Street','CLEAN08','Fictional detail product','AED 160.00'])assert.ok(text.includes(actual),`显示当前真实订单字段：${actual}`);
    assert.doesNotMatch(text,/Avery Example|KY02|Villa 12/,'原确认稿演示资料没有混入真实订单');
    assert.equal(await root.getByRole('button',{name:/^(?:折叠|展开)导航栏$/}).count(),1,'导航折叠入口保留');
    assert.equal(await root.getByRole('button',{name:'布局设置',exact:true}).count(),1,'布局设置入口保留');
    assert.equal(await root.locator('.od-preview-label').innerText(),'UI-028 · 订单详情','移除已删除聊天区留下的过时稿件说明');

    const assertCardsSideBySide=async(label)=>{const customer=await root.getByRole('heading',{name:'客户信息',exact:true}).locator('..').locator('..').boundingBox(),product=await root.getByRole('heading',{name:'商品与金额',exact:true}).locator('..').locator('..').boundingBox();assert.ok(customer&&product,`${label} 可取得双卡尺寸`);assert.ok(product.x>customer.x+customer.width-2,`${label} 客户与商品卡保持同一行`);assert.ok(customer.width>260&&product.width>240,`${label} 双卡宽度足够阅读`);};
    await assertCardsSideBySide('1280×820');await page.mouse.move(6,6);await page.waitForTimeout(350);await page.screenshot({path:path.join(artifacts,'order-detail-1280x820.png')});
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000));await page.mouse.move(6,6);await page.waitForTimeout(350);await assertCardsSideBySide('1440×1000');await page.screenshot({path:path.join(artifacts,'order-detail-1440x1000.png')});

    await frame.getByRole('button',{name:'聊单工作台',exact:true}).click();await frame.locator('#chat-workbench-desktop').waitFor();assert.equal(await frame.locator('.cwb-chat').count(),1,'工作台聊天区不受影响');assert.equal(await frame.locator('.cwb-composer').count(),1,'工作台输入区不受影响');assert.equal(await frame.locator('.cwb-quick').count(),1,'工作台快捷回复入口不受影响');
  }finally{if(database)database.close();if(application){await Promise.race([application.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(application.process().exitCode===null)application.process().kill('SIGKILL');}await rm(directory,{recursive:true,force:true});}
});
