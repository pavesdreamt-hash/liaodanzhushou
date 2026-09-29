import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';
import {openOrderDatabase} from '../src/orders/database.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';
import {OrderAppService} from '../src/orders/order-app-service.mjs';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.ORDER_DETAIL_PROFIT_APP_PATH||path.join('dist',`聊单助手${version}-x64`,'mac',`聊单助手 ${version}.app`));
const executableName=path.basename(appPath,'.app');
const output=path.resolve(`artifacts/order-detail-profit-package-${version}`);
const input=orderNo=>({source:'manual',shopplus_order_no:orderNo,shopplus_created_at:'2026-09-25T08:00:00.000Z',currency:'AED',order_status:'fictional',delivery_status:'unshipped',payment_method:'COD',customer_first_name:'Package',customer_last_name:'Audit',customer_full_name:'Package Audit',customer_phone:'+000 000 198',customer_email:'package-profit@example.invalid',country:'Example Country',province:'Example Province',city:'Example City',street:'198 Fictional Street',residence:'Unit 198',items:[{sku_code:'PKG-PROFIT-98',product_name_snapshot:'Fictional packaged profit product',quantity:1,unit_list_price:'100',unit_actual_price:'100',unit_cost_snapshot:'20',cost_source:'fictional'}]});

await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-order-profit-package-')),data=path.join(temporary,'data');let application;
try{
  const database=await openOrderDatabase({userDataPath:data});try{
    const service=new OrderService(new OrderRepository(database)),orders=new OrderAppService({database,userDataPath:data}),final=service.createOrder(input('PACKAGE-PROFIT-FINAL-001')),waiting=service.createOrder(input('PACKAGE-PROFIT-WAIT-001'));
    orders.confirmOrder({orderId:final.id,note:'fictional package acceptance confirmation'});orders.updatePackageStatus({packageId:final.packages[0].id,status:'shipped_pending'});orders.updatePackageStatus({packageId:final.packages[0].id,status:'signed'});orders.confirmPackageFee({packageId:final.packages[0].id,amountAed:'5.00',reason:'fictional package acceptance fee'});const finalDetail=orders.recordRemittance({orderId:final.id,amountCny:'320.00',registeredAt:'2026-09-25'});
    orders.confirmOrder({orderId:waiting.id,note:'fictional package waiting confirmation'});orders.updatePackageStatus({packageId:waiting.packages[0].id,status:'shipped_pending'});orders.updatePackageStatus({packageId:waiting.packages[0].id,status:'signed'});
    assert.equal(finalDetail.totalProfitFils,7500);assert.equal(finalDetail.remittance.amountFils,32000);
  }finally{database.close();}
  application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',executableName),args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'test'}});
  const page=await application.firstWindow({timeout:60000});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),arch:process.arch,path:app.getAppPath()}));assert.equal(identity.packaged,true);assert.equal(identity.version,version);assert.equal(identity.arch,'x64');assert.equal(identity.path.startsWith(appPath),true);
  const frame=page.frameLocator('iframe.confirmed-frame');const open=async orderNo=>{await frame.getByRole('button',{name:'订单管理',exact:true}).click();await frame.locator('.ob-rows tr').filter({hasText:orderNo}).getByRole('button',{name:'订单详情',exact:true}).click();await frame.locator('#ui008-order-detail .od-heading-copy h1').filter({hasText:orderNo}).waitFor();};
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1280,820));await open('PACKAGE-PROFIT-FINAL-001');const root=frame.locator('#ui008-order-detail'),card=root.locator('[data-order-profit-card="true"]');await card.waitFor();
  assert.equal(await card.getByRole('heading',{name:'履约与回款／利润核算',exact:true}).count(),1);assert.deepEqual(await card.locator('[data-profit-metric]').evaluateAll(items=>items.map(item=>[item.dataset.profitMetric,item.querySelector('strong')?.textContent])),[['revenue','AED 100.00'],['cost','AED 20.00'],['shipping','AED 5.00'],['profit','AED 75.00']]);
  assert.deepEqual(await card.evaluate(element=>{const size=selector=>getComputedStyle(element.querySelector(selector)).fontSize;return {detail:size('.ob-profit-detail-row'),metricLabel:size('.ob-profit-metric span'),metricValue:size('.ob-profit-metric strong'),notice:size('.ob-profit-notice'),noticeDetail:size('.ob-profit-notice p')}}),{detail:'14px',metricLabel:'13px',metricValue:'15px',notice:'14px',noticeDetail:'13px'});
  const finalText=await card.innerText();for(const expected of ['CNY ¥320.00','2026-09-25','已完成核算'])assert.ok(finalText.includes(expected),expected);assert.equal(await card.locator('input,button,textarea,select').count(),0);assert.doesNotMatch(finalText,/AED 12\.00|AED 150\.00|Avery Example/);
  assert.equal(await root.locator('.reply-rail,.reply-chat-workspace,.od-chat-column,.od-phone,.manual-composer').count(),0);assert.equal(await root.locator('.od-stage-card,.od-two-cards,.od-product-image,.od-total,.od-map').count(),5);await card.scrollIntoViewIfNeeded();await page.waitForTimeout(200);await page.screenshot({path:path.join(output,'order-detail-profit-1280x820.png')});
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.isVisible())?.setContentSize(1440,1000));await page.waitForTimeout(250);await card.scrollIntoViewIfNeeded();await page.waitForTimeout(200);const box=await card.boundingBox();assert.ok(box&&box.width>500);await page.screenshot({path:path.join(output,'order-detail-profit-1440x1000.png')});
  await open('PACKAGE-PROFIT-WAIT-001');const waitingCard=root.locator('[data-order-profit-card="true"]');await waitingCard.waitFor();assert.equal(await waitingCard.locator('[data-profit-metric="shipping"] strong').innerText(),'待确认');assert.equal(await waitingCard.locator('[data-profit-metric="profit"] strong').innerText(),'待确认');assert.match(await waitingCard.innerText(),/待确认物流费/);assert.doesNotMatch(await waitingCard.innerText(),/AED 0\.00|已完成核算/);await waitingCard.scrollIntoViewIfNeeded();await page.waitForTimeout(200);await page.screenshot({path:path.join(output,'order-detail-profit-pending-1440x1000.png')});
  await frame.getByRole('button',{name:'聊单工作台',exact:true}).click();await frame.locator('#chat-workbench-desktop').waitFor();assert.equal(await frame.locator('.cwb-chat,.cwb-composer,.cwb-quick').count(),3);assert.deepEqual(errors,[]);
  const report={ok:true,version,appPath,identity,directAppArtifact:true,fictionalOrders:true,realShopPlusCalls:0,realMessagesSent:0,checks:['final Mac x64 app launched directly','packaged app identity','1280x820 and 1440x1000 screenshots','profit card body typography is 13px to 15px while its structure remains read-only','final AED profit and CNY remittance use actual fictional detail fields','pending shipping and profit stay pending rather than zero','profit card has no write controls','D-104 no-chat DOM and retained business cards','workbench chat remains available'],errors};await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
  let process;try{process=application?.process();}catch{}await application?.close().catch(()=>{});try{if(process?.exitCode===null)process.kill('SIGKILL');}catch{}
  await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}
