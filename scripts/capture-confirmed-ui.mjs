import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve('references/confirmed-ui');
const out=path.resolve('artifacts/confirmed-ui');
await mkdir(out,{recursive:true});
const files=['workbench.html','ui-040-order-management.html','ui-016-inventory-compact.html','ui-034-profit-fixed-aed.html','ui-041-assistant-settings-final.html','ui-036-settings-final-review.html','ui-032-product-detail-final.html','ui-028-order-fixed-chat-folding.html','ui-035-daily-profit-fixed-aed.html'];
const browser=await chromium.launch({headless:true});
for(const file of files){
 const page=await browser.newPage({viewport:{width:1424,height:912},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'load'});
 await page.screenshot({path:path.join(out,file.replace('.html','.png')),fullPage:true});
 await page.close();
}
await browser.close();
console.log(out);
