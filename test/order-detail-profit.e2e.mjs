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
import {OrderAppService} from '../src/orders/order-app-service.mjs';

const packageInfo=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const input=orderNo=>({source:'manual',shopplus_order_no:orderNo,shopplus_created_at:'2026-09-25T08:00:00.000Z',currency:'AED',order_status:'fictional',delivery_status:'unshipped',payment_method:'COD',customer_first_name:'Profit',customer_last_name:'Audit',customer_full_name:'Profit Audit',customer_phone:'+000 000 098',customer_email:'profit@example.invalid',country:'Example Country',province:'Example Province',city:'Example City',street:'98 Fictional Street',residence:'Unit 98',items:[{sku_code:'PROFIT98',product_name_snapshot:'Fictional profit detail product',quantity:1,unit_list_price:'100',unit_actual_price:'100',unit_cost_snapshot:'20',cost_source:'fictional'}]});

test('订单详情以真实详情字段只读显示已结算与待确认利润核算',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'order-detail-profit-')),userData=path.join(directory,'data'),artifacts=path.resolve(process.env.KDOCS_TEST_ARTIFACT_DIRECTORY||`artifacts/order-detail-profit-${packageInfo.version}`);let application,database;
  try{
    await mkdir(artifacts,{recursive:true});database=await openOrderDatabase({userDataPath:userData});const service=new OrderService(new OrderRepository(database)),app=new OrderAppService({database,userDataPath:userData});
    const final=service.createOrder(input('DETAIL-PROFIT-FINAL-001')),waiting=service.createOrder(input('DETAIL-PROFIT-WAIT-001'));
    app.confirmOrder({orderId:final.id,note:'fictional final order confirmation'});app.updatePackageStatus({packageId:final.packages[0].id,status:'shipped_pending'});app.updatePackageStatus({packageId:final.packages[0].id,status:'signed'});app.confirmPackageFee({packageId:final.packages[0].id,amountAed:'5.00',reason:'fictional confirmed transport fee'});const finalDetail=app.recordRemittance({orderId:final.id,amountCny:'320.00',registeredAt:'2026-09-25'});
    app.confirmOrder({orderId:waiting.id,note:'fictional waiting order confirmation'});app.updatePackageStatus({packageId:waiting.packages[0].id,status:'shipped_pending'});app.updatePackageStatus({packageId:waiting.packages[0].id,status:'signed'});
    assert.equal(finalDetail.totalProfitFils,7500,'虚构已结算订单后端利润为 AED 75.00');assert.equal(finalDetail.remittance.amountFils,32000,'虚构净回款按 CNY 分保存');
    database.close();database=null;
    const executable=process.env.KDOCS_TEST_EXECUTABLE;application=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${userData}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,820));const frame=page.frameLocator('iframe.confirmed-frame');
    const open=(orderNo)=>frame.getByRole('button',{name:'订单管理',exact:true}).click().then(async()=>{await frame.locator('.ob-rows tr').filter({hasText:orderNo}).getByRole('button',{name:'订单详情',exact:true}).click();await frame.locator('#ui008-order-detail .od-heading-copy h1').filter({hasText:orderNo}).waitFor();});
    await open('DETAIL-PROFIT-FINAL-001');const root=frame.locator('#ui008-order-detail'),card=root.locator('[data-order-profit-card="true"]');await card.waitFor();
    assert.equal(await card.getByRole('heading',{name:'履约与回款／利润核算',exact:true}).count(),1,'利润核算卡已恢复');assert.deepEqual(await card.locator('[data-profit-metric]').evaluateAll(items=>items.map(item=>item.dataset.profitMetric)),['revenue','cost','shipping','profit']);
    assert.equal(await card.locator('[data-profit-metric="revenue"] strong').innerText(),'AED 100.00');assert.equal(await card.locator('[data-profit-metric="cost"] strong').innerText(),'AED 20.00');assert.equal(await card.locator('[data-profit-metric="shipping"] strong').innerText(),'AED 5.00');assert.equal(await card.locator('[data-profit-metric="profit"] strong').innerText(),'AED 75.00');
    const finalText=await card.innerText();for(const actual of ['已签收','已登记净回款（CNY）','CNY ¥320.00','2026-09-25','已完成核算'])assert.ok(finalText.includes(actual),`显示真实已结算字段：${actual}`);assert.doesNotMatch(finalText,/AED 12\.00|AED 150\.00|Avery Example/,'不混入确认稿的静态履约演示数据');assert.equal(await card.locator('input,button,textarea,select').count(),0,'利润核算卡仅展示，不新增写入或模拟状态控件');
    assert.equal(await root.locator('.reply-rail,.reply-chat-workspace,.od-chat-column,.od-phone,.manual-composer').count(),0,'D-104 已删除聊天区域保持为零');assert.equal(await root.locator('.od-stage-card,.od-two-cards,.od-product-image,.od-total,.od-map').count(),5,'D-104 既有业务卡结构仍存在');await card.scrollIntoViewIfNeeded();await page.waitForTimeout(200);await page.screenshot({path:path.join(artifacts,'order-detail-profit-final-1280x820.png')});
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000));await page.waitForTimeout(250);await card.scrollIntoViewIfNeeded();await page.waitForTimeout(200);const cardBox=await card.boundingBox();assert.ok(cardBox&&cardBox.width>500,'1440×1000 下利润卡保持可读宽度');await page.screenshot({path:path.join(artifacts,'order-detail-profit-final-1440x1000.png')});
    await open('DETAIL-PROFIT-WAIT-001');const waitingCard=root.locator('[data-order-profit-card="true"]');await waitingCard.waitFor();assert.equal(await waitingCard.locator('[data-profit-metric="shipping"] strong').innerText(),'待确认');assert.equal(await waitingCard.locator('[data-profit-metric="profit"] strong').innerText(),'待确认');const waitingText=await waitingCard.innerText();assert.ok(waitingText.includes('待确认物流费'),'未确认实际物流费明确待确认');assert.doesNotMatch(waitingText,/AED 0\.00|已完成核算/,'待确认订单不伪造成零利润或已完成');
    await frame.getByRole('button',{name:'聊单工作台',exact:true}).click();await frame.locator('#chat-workbench-desktop').waitFor();assert.equal(await frame.locator('.cwb-chat,.cwb-composer,.cwb-quick').count(),3,'工作台聊天、输入和快捷回复未受订单详情修复影响');assert.deepEqual(errors,[],'订单详情相关导航和渲染没有页面错误');
  }finally{
    if(database)database.close();if(application){await application.close().catch(()=>{});try{if(application.process().exitCode===null)application.process().kill('SIGKILL');}catch{}}
    await rm(directory,{recursive:true,force:true});
  }
});
