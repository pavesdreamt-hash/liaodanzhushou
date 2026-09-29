import {access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';

const app=path.resolve(process.argv[2]||'dist/聊单助手.app'),executable=path.join(app,'Contents','MacOS','聊单助手');
await access(executable);
const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-timeout=90000','test/order-sync-attention.e2e.mjs'],{cwd:path.resolve('.'),env:{...process.env,KDOCS_TEST_EXECUTABLE:executable},stdio:'inherit'});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
if(code!==0)process.exitCode=code||1;
