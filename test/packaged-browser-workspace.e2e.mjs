import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {_electron as electron,chromium} from 'playwright-core';
import {mkdtemp,mkdir,readFile,readdir,rm,unlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {migrateOrderDatabase,orderDatabasePath} from '../src/orders/database.mjs';
import {ORDER_MIGRATIONS,CURRENT_ORDER_SCHEMA_VERSION} from '../src/orders/migrations/index.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';
import {automaticBackupDirectory} from '../src/orders/order-data-protection.mjs';

test('打包 App 从隔离安装目录启动并在浏览器显示本地工作区',async()=>{
  assert.ok(process.env.KDOCS_PACKAGED_APP,'KDOCS_PACKAGED_APP 未提供');
  const appPath=path.resolve(process.env.KDOCS_PACKAGED_APP);
  const directory=await mkdtemp(path.join(os.tmpdir(),'kdocs-packaged-browser-')),userData=path.join(directory,'user-data'),urlFile=path.join(directory,'url.txt'),trayBoundsFile=path.join(directory,'tray-bounds.json');
  let application,browser,database;
  try{
    const databaseFile=orderDatabasePath(userData);await mkdir(path.dirname(databaseFile),{recursive:true});database=new DatabaseSync(databaseFile);database.exec('PRAGMA foreign_keys=ON');migrateOrderDatabase(database,ORDER_MIGRATIONS.slice(0,-1));
    new OrderService(new OrderRepository(database)).createOrder({source:'manual',shopplus_order_no:'PACKAGED-FICTIONAL',shopplus_created_at:'2026-09-08T08:00:00.000Z',currency:'AED',order_status:'fictional',delivery_status:'unshipped',payment_method:'COD',customer_first_name:'Browser',customer_last_name:'Fictional',customer_full_name:'Browser Fictional',customer_phone:'+000000009',customer_email:'browser@example.invalid',country:'Example Country',province:'Example Province',city:'Example City',street:'Example Street',residence:'',order_total:'10.00',product_total:'10.00',discount_amount:'0',items:[{sku_code:'YB01',product_name_snapshot:'YB01 Fictional',quantity:1,unit_list_price:'10.00',unit_actual_price:'10.00',unit_cost_snapshot:'2.00',cost_source:'fictional'}]});
    database.close();database=null;
    application=await electron.launch({executablePath:path.join(appPath,'Contents/MacOS',path.basename(appPath,'.app')),args:[`--orders-test-user-data=${userData}`,'--orders-test-browser-workspace',`--orders-test-browser-url-file=${urlFile}`,`--orders-test-tray-bounds-file=${trayBoundsFile}`],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'test'}});
    let url='';for(let i=0;i<180&&!url;i++){await new Promise(resolve=>setTimeout(resolve,100));url=await readFile(urlFile,'utf8').catch(()=> '');}
    assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
    assert.equal(application.windows().length,0);
    const trayBounds=JSON.parse(await readFile(trayBoundsFile,'utf8'));assert.ok(trayBounds.width>0&&trayBounds.width<=48);assert.ok(trayBounds.height>0&&trayBounds.height<=32);
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});await page.goto(url,{waitUntil:'domcontentloaded'});
    assert.equal(await page.title(),'KDocs 库存同步');
    await page.getByRole('button',{name:'订单管理'}).click();await page.getByRole('button',{name:'订单列表'}).click();
    const row=page.locator('#orders-table-body tr').filter({hasText:'PACKAGED-FICTIONAL'});await row.waitFor();
    assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth===element.clientWidth),true);
    await row.click();await page.getByRole('heading',{name:'客户信息'}).waitFor();
    assert.equal(await page.locator('#order-detail-page').isVisible(),true);
    assert.equal(await page.locator('#order-detail-dialog').count(),0);
    assert.equal(await page.locator('#order-detail-content').evaluate(element=>element.scrollWidth===element.clientWidth),true);
    assert.equal(await page.locator('.order-report-card').count(),1);assert.equal(await page.locator('.profit-package-carousel').count(),1);assert.equal(await page.locator('.package-profit-card').count(),0);
    assert.deepEqual(await page.locator('.profit-product-head span').allTextContents(),['商品','数量','价格']);assert.equal(await page.getByText('共 1 个包裹',{exact:true}).count(),1);assert.match(await page.locator('.order-report-checks').innerText(),/报单编号[\s\S]*9\.8-1/);
    assert.equal(await page.evaluate(()=>{const right=document.querySelector('.detail-column-right');return [...right.children].indexOf(document.querySelector('.order-report-card'))<[...right.children].indexOf(document.querySelector('.profit-workbench'));}),true);
    await page.getByRole('button',{name:'返回订单列表'}).click();await row.waitFor();
    await browser.close();browser=null;await application.close();application=null;
    database=new DatabaseSync(databaseFile,{readOnly:true});assert.equal(Number(database.prepare('SELECT MAX(version) version FROM schema_migrations').get().version),CURRENT_ORDER_SCHEMA_VERSION);assert.equal(Number(database.prepare('SELECT COUNT(*) count FROM orders').get().count),1);assert.equal(Number(database.prepare('SELECT COUNT(*) count FROM order_items').get().count),1);assert.equal(database.prepare("SELECT 1 FROM pragma_table_info('packages') WHERE name='reported_at'").get()['1'],1);database.close();database=null;
    const backups=await readdir(automaticBackupDirectory(userData));assert.equal(backups.filter(name=>name.endsWith('.sqlite')).length,1);
    await unlink(urlFile).catch(()=>{});application=await electron.launch({executablePath:path.join(appPath,'Contents/MacOS',path.basename(appPath,'.app')),args:[`--orders-test-user-data=${userData}`,'--orders-test-browser-workspace',`--orders-test-browser-url-file=${urlFile}`,`--orders-test-tray-bounds-file=${trayBoundsFile}`],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'test'}});
    let restartedUrl='';for(let i=0;i<180&&!restartedUrl;i++){await new Promise(resolve=>setTimeout(resolve,100));restartedUrl=await readFile(urlFile,'utf8').catch(()=> '');}assert.match(restartedUrl,/^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
    browser=await chromium.launch({headless:true});const restartedPage=await browser.newPage({viewport:{width:1280,height:800}});await restartedPage.goto(restartedUrl,{waitUntil:'domcontentloaded'});await restartedPage.getByRole('button',{name:'订单管理'}).click();await restartedPage.getByRole('button',{name:'订单列表'}).click();await restartedPage.locator('#orders-table-body tr').filter({hasText:'PACKAGED-FICTIONAL'}).waitFor();
  }finally{if(browser)await browser.close().catch(()=>{});if(application)await application.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
