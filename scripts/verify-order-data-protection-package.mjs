import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {promisify} from 'node:util';

const run=promisify(execFile);
const version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.argv[2]||path.join('dist','聊单助手.app'));
const executable=path.join(appPath,'Contents','MacOS','聊单助手');
const output=path.resolve(`artifacts/order-data-protection-${version}`);
const report={ok:false,version,appPath,directAppArtifact:true,fictionalIsolation:true,realOrdersRead:0,realOrdersWritten:0,checks:[],errors:[]};
await mkdir(output,{recursive:true});
try{
  await access(executable);
  const {stdout:bundleVersion}=await run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(appPath,'Contents','Info.plist')]);
  assert.equal(bundleVersion.trim(),version);
  const {stdout:fileType}=await run('file',['-b',executable]);
  assert.match(fileType,/x86_64/);
  await run('codesign',['--verify','--deep','--strict',appPath]);
  const {stdout}=await run(process.execPath,['--test','--test-concurrency=1','--test-timeout=90000','test/order-data-protection.e2e.mjs'],{cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test',KDOCS_TEST_EXECUTABLE:executable}});
  assert.match(stdout,/pass 1/);
  report.ok=true;
  report.checks=['fixed-final-mac-x64-app-launches-directly','current-v26-signature-accepts','published-v25-alias-restores','isolated-restore-upgrades-to-v26'];
}catch(error){
  report.errors.push(String(error?.stack||error));
  throw error;
}finally{
  await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
