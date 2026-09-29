import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {_electron as electron} from 'playwright-core';

const run=promisify(execFile);
const root=path.resolve('.');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const appPath=path.join(root,'dist','聊单助手.app');
const executable=path.join(appPath,'Contents','MacOS','聊单助手');
const output=path.join(root,'artifacts',`keychain-continuity-${pkg.version}`);
const isolated=await mkdtemp(path.join(os.tmpdir(),'liaodan-keychain-continuity-'));
const data=path.join(isolated,'fictional-data');
const settings=path.join(isolated,'fictional-settings.json');
let application;

await mkdir(output,{recursive:true});
try{
  const {stdout}=await run('/usr/bin/plutil',['-convert','json','-o','-',path.join(appPath,'Contents','Info.plist')]);
  const plist=JSON.parse(stdout);
  assert.equal(plist.CFBundleIdentifier,'com.liaodan.assistant.live');
  assert.equal(plist.CFBundleName,'聊单助手');
  assert.equal(plist.CFBundleDisplayName,'聊单助手');
  assert.equal(plist.CFBundleExecutable,'聊单助手');
  assert.equal(plist.CFBundleShortVersionString,pkg.version);
  assert.equal(path.basename(appPath),'聊单助手.app');
  assert.equal(path.basename(executable),'聊单助手');
  const {stdout:fileType}=await run('/usr/bin/file',['-b',executable]);
  assert.match(fileType,/Mach-O 64-bit executable x86_64/);
  await run('/usr/bin/codesign',['--verify','--deep','--strict',appPath]);

  // The final app itself is launched. The matching isolated fixture prevents
  // access to the user's keychain and uses no real credentials or services.
  await writeFile(settings,JSON.stringify({key:'fictional-key-for-package-only'}));
  application=await electron.launch({
    executablePath:executable,
    args:[`--isolated-user-data=${data}`,`--orders-test-user-data=${data}`,`--orders-test-settings=${settings}`],
    cwd:path.dirname(appPath),
    env:{...process.env,NODE_ENV:'test'}
  });
  const page=await application.firstWindow({timeout:60000});
  const identity=await application.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),name:app.getName(),path:app.getAppPath(),arch:process.arch}));
  assert.deepEqual({...identity,path:path.basename(identity.path)},{packaged:true,version:pkg.version,name:'Liaodan Assistant Live',path:'app.asar',arch:'x64'});
  await page.screenshot({path:path.join(output,'stable-final-app-startup.png')});
  const report={ok:true,version:pkg.version,appPath,executable,plist:{identifier:plist.CFBundleIdentifier,name:plist.CFBundleName,displayName:plist.CFBundleDisplayName,executable:plist.CFBundleExecutable},packagedIdentity:identity,fictionalIsolation:true,realKeychainAccess:false,realShopPlusCalls:0,realMessagesSent:0,checks:['stable app bundle and executable names','stable bundle identifier','version retained in Info.plist','Mac x64 code signature verification','final stable app launched directly with fictional isolated settings']};
  await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{
  await application?.close().catch(()=>{});
  await rm(isolated,{recursive:true,force:true});
}
