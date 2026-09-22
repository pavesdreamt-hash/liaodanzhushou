import test from 'node:test';import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';import electronPath from 'electron';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('first empty draft is visible immediately on return, without restarting or importing a website order',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'draft-return-list-'));let app;
 try{const executable=process.env.KDOCS_TEST_EXECUTABLE;app=await electron.launch({executablePath:executable||electronPath,args:[...(executable?[]:['.']),`--orders-test-user-data=${dir}`],env:{...process.env,NODE_ENV:'test'}});const page=await app.firstWindow();
 await page.getByRole('button',{name:'订单管理',exact:true}).click();await page.getByRole('heading',{name:'尚未导入订单',exact:true}).waitFor();
 await page.getByRole('button',{name:'新建订单',exact:true}).click();await page.getByRole('heading',{name:'草稿 #1',exact:true}).waitFor();
 await page.getByRole('button',{name:'返回订单列表',exact:true}).click();await page.locator('#orders-table-body').getByText('草稿 #1',{exact:true}).waitFor({state:'visible'});assert.equal(await page.locator('#sum-total').innerText(),'1');assert.equal(await page.locator('#orders-empty').isVisible(),false);
 await page.getByRole('button',{name:'新建订单',exact:true}).click();await page.getByRole('heading',{name:'草稿 #2',exact:true}).waitFor();await page.getByRole('button',{name:'返回订单列表',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#sum-total').textContent==='2');
 const rows=await page.evaluate(async()=>{const result=await window.inventoryApp.orders.list({});return result.data;});assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);
 const out=process.env.KDOCS_TEST_ARTIFACT_DIRECTORY;if(out){await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'first-drafts-return-list.png'),fullPage:true});}
 }finally{await app?.close();await rm(dir,{recursive:true,force:true});}
});
