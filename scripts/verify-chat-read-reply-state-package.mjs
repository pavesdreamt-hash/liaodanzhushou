import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

const run=promisify(execFile),version=JSON.parse(await readFile('package.json','utf8')).version;
const appPath=path.resolve(process.env.CHAT_READ_REPLY_APP_PATH||path.join('dist','聊单助手.app'));
const executable=path.join(appPath,'Contents','MacOS',path.basename(appPath,'.app'));
const output=path.resolve(`artifacts/chat-read-reply-state-${version}`),report={ok:false,version,appPath,directAppArtifact:true,fictionalIsolation:true,realWhatsAppReads:0,realMessagesSent:0,checks:[],errors:[]};
await mkdir(output,{recursive:true});
try{
 const {stdout:bundleVersion}=await run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(appPath,'Contents','Info.plist')]);assert.equal(bundleVersion.trim(),version);
 const {stdout:fileType}=await run('file',['-b',executable]);assert.match(fileType,/x86_64/);
 await run('codesign',['--verify','--deep','--strict',appPath]);
 const {stdout}=await run(process.execPath,['--test','--test-concurrency=1','--test-timeout=60000','test/chat-workbench-read-reply-state.e2e.mjs'],{cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test',KDOCS_TEST_EXECUTABLE:executable}});
 assert.match(stdout,/pass 1/);report.checks.push('fixed-final-mac-x64-app-launches-directly','only-opened-identity-verified-chat-requests-seen','native-unread-remains-until-whatsapp-returns-zero','verified-send-receipt-immediately-updates-left-summary-and-unreplied');report.ok=true;
}catch(error){report.errors.push(String(error?.stack||error));throw error;
}finally{await writeFile(path.join(output,'app-verification.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
