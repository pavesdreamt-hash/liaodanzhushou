import {readFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const execute=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),assets=path.join(root,'assets'),iconset=path.join(assets,'app-icon.iconset');
await mkdir(iconset,{recursive:true});const svg=await readFile(path.join(assets,'app-icon.svg'),'utf8'),browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});await page.setContent(`<style>html,body{margin:0;width:1024px;height:1024px;background:transparent}</style>${svg}`);await page.screenshot({path:path.join(assets,'app-icon-1024.png'),omitBackground:true});}finally{await browser.close();}
const targets=[[16,'icon_16x16.png'],[32,'icon_16x16@2x.png'],[32,'icon_32x32.png'],[64,'icon_32x32@2x.png'],[128,'icon_128x128.png'],[256,'icon_128x128@2x.png'],[256,'icon_256x256.png'],[512,'icon_256x256@2x.png'],[512,'icon_512x512.png'],[1024,'icon_512x512@2x.png']];
for(const [size,name] of targets)await execute('/usr/bin/sips',['-z',String(size),String(size),path.join(assets,'app-icon-1024.png'),'--out',path.join(iconset,name)]);
await execute('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(assets,'app-icon.icns')]);console.log('Application icon generated.');
