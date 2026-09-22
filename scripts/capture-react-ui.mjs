import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const base=process.env.UI_URL||'http://127.0.0.1:5173/';
const output=path.resolve('artifacts/react-ui');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1424,height:912},deviceScaleFactor:1});
for(const name of ['workbench','orders','inventory','profit','assistant','settings','product','order','profit-detail']){
  await page.goto(`${base}?page=${name}`,{waitUntil:'networkidle'});
  await page.waitForTimeout(120);
  const file=name==='product'?'product-detail':name==='order'?'order-detail':name;
  await page.screenshot({path:path.join(output,`${file}.png`),fullPage:false});
}
await browser.close();
console.log(output);
