import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,copyFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {shopPlusExtension} from '../src/orders/shopplus-file.mjs';

const excelFile=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw new Error('请提供真实ShopPlus .xlsx、.xls 或 .csv 文件路径');
shopPlusExtension(excelFile);
await access(excelFile);
const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-real-ui-readonly-')),userData=path.join(directory,'user-data'),state=path.join(userData,'state'),formalBaseline=path.join(os.homedir(),'Library','Application Support','KDocs Inventory Sync','state','baseline.json');
let app;
try{
  await mkdir(state,{recursive:true});await copyFile(formalBaseline,path.join(state,'baseline.json'));
  app=await electron.launch({executablePath:electronPath,args:['.',`--orders-test-user-data=${userData}`,`--orders-test-excel=${excelFile}`],cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
  const page=await app.firstWindow();await page.getByRole('button',{name:'订单管理'}).click();await page.getByRole('button',{name:'导入ShopPlus Excel'}).first().click();await page.locator('#preview-orders .preview-card').first().waitFor();
  const metrics=await page.evaluate(()=>({orders:Number(document.querySelector('#pv-orders')?.textContent),items:Number(document.querySelector('#pv-items')?.textContent),multi:Number(document.querySelector('#pv-multi')?.textContent),blocked:Number(document.querySelector('#pv-blocked')?.textContent),recognized:[...document.querySelectorAll('.preview-items tbody tr')].filter(row=>{const cell=row.querySelector('td'),value=cell?.querySelector('input')?.value||cell?.textContent?.trim();return value&&value!=='待核对';}).length,matchedCosts:[...document.querySelectorAll('.preview-items tbody tr')].filter(row=>{const cells=row.querySelectorAll('td');return cells[4]?.textContent?.includes('AED')||Boolean(cells[4]?.querySelector('input')?.value);}).length,maskedPhones:[...document.querySelectorAll('.preview-meta')].every(node=>!node.textContent.includes('+971')||node.textContent.includes('*'))}));
  await app.close();app=null;const database=new DatabaseSync(path.join(userData,'orders','orders.sqlite'),{readOnly:true});const stored=Number(database.prepare('SELECT count(*) count FROM orders').get().count);database.close();if(stored!==0)throw new Error('只读验收意外写入了订单');if(metrics.orders!==10||metrics.items!==11||metrics.multi!==1||metrics.blocked!==0||metrics.recognized!==11||metrics.matchedCosts!==11||!metrics.maskedPhones)throw new Error(`真实界面预览统计不符合预期：${JSON.stringify(metrics)}`);
  console.log(JSON.stringify({...metrics,storedOrders:stored,readOnly:true},null,2));
}finally{if(app)await app.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
