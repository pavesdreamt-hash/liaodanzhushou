import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root='/Users/apple/.codex/visualizations/2026/09/19/01a0b98f-b889-7ad0-9b3b-2878d5a5ee09';
const older='/Users/apple/.codex/visualizations/2026/09/16/01a0aa45-dc19-7020-8109-05dbb426253f';
const out=path.resolve('artifacts/confirmed-baselines');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:900}});const files=[['workbench',path.join(older,'chat-workbench-aligned.html')],['inventory',path.join(root,'ui-016-inventory-compact.html')],['settings',path.join(root,'ui-036-settings-final-review.html')],['orders',path.join(root,'ui-040-order-management.html')],['profit',path.join(root,'ui-034-profit-fixed-aed.html')],['assistant',path.join(root,'ui-041-assistant-settings-final.html')]];for(const [name,file] of files){await page.goto(pathToFileURL(file).href,{waitUntil:'domcontentloaded'});await page.waitForTimeout(500);const rootNode=page.locator('body > div').first();await rootNode.screenshot({path:path.join(out,`${name}.png`)});}console.log(out);}finally{await browser.close();}
