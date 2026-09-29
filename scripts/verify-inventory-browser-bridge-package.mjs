import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {_electron as electron} from 'playwright-core';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.INVENTORY_BROWSER_APP_PATH||path.join('dist',`聊单助手${version}-x64`,'mac',`聊单助手 ${version}.app`));
const output=path.resolve(`artifacts/inventory-product-${version}`);
await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'liaodan-inventory-browser-bridge-'));const data=path.join(temporary,'data');let application;
try{
  application=await electron.launch({executablePath:path.join(appPath,'Contents','MacOS',`聊单助手 ${version}`),args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`,'--orders-test-browser-workspace'],cwd:path.dirname(appPath),env:{...process.env,NODE_ENV:'production'}});
  const page=await application.firstWindow({timeout:60000});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForURL(/http:\/\/127\.0\.0\.1:/,{waitUntil:'load'});
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),arch:process.arch}));assert.deepEqual(identity,{packaged:true,version,arch:'x64'});
  const frame=page.frameLocator('iframe.confirmed-frame');await frame.getByRole('button',{name:'商品库存',exact:true}).click();await frame.locator('#ui011-inventory').waitFor();await page.waitForTimeout(400);
  const bridge=await frame.locator('#ui011-inventory').evaluate(()=>({hasPilot:typeof window.parent?.shopPlusProductPilot?.catalog==='function',hasInventory:typeof window.parent?.inventoryApp?.status==='function'}));assert.deepEqual(bridge,{hasPilot:true,hasInventory:true});assert.equal(await frame.locator('#ui011-connection-label').textContent(),'ShopPlus 商品读取待验证');assert.match(await frame.locator('#ui011-empty').textContent()||'',/尚未采集有库存商品/);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'inventory-browser-bridge-empty.png')});const report={ok:true,version,appPath,identity,fictionalIsolatedData:true,realShopPlusCalls:0,realMessagesSent:0,checks:['packaged browser-workspace started directly','browser bridge exposes product pilot inside inventory iframe','initial isolated catalog is empty and product-read state is honestly unverified','no real ShopPlus or WhatsApp action'],errors};await writeFile(path.join(output,'browser-bridge-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{try{application?.process().kill('SIGKILL');}catch{}await application?.close().catch(()=>{});await rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});}
