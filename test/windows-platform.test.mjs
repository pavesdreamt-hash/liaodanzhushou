import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import JSZip from 'jszip';
import {chromeCandidates,findChrome} from '../src/core/chrome-path.mjs';
import {promptForApiKey} from '../src/core/native-secret-prompt.mjs';
import {loadAssistantConnectors} from '../src/orders/assistant-connectors.mjs';
import {zipDiagnosticDirectory} from '../src/core/diagnostic-zip.mjs';

test('Windows Chrome discovery respects user/system/x86 priority and explicit overrides',async()=>{
 const options={platform:'win32',env:{LOCALAPPDATA:'C:\\Users\\Fictional\\AppData\\Local',ProgramW6432:'C:\\Program Files',ProgramFiles:'ignored', 'ProgramFiles(x86)':'C:\\Program Files (x86)'}};
 const candidates=chromeCandidates(options);assert.equal(candidates.length,3);assert.match(candidates[0],/Fictional/);assert.match(candidates[1],/^C:\\Program Files\\Google/);assert.match(candidates[2],/\(x86\)/);
 const seen=[];assert.equal(await findChrome(options,async p=>{seen.push(p);return p===candidates[1];}),candidates[1]);assert.deepEqual(seen,candidates.slice(0,2));
 assert.deepEqual(chromeCandidates({...options,explicitPath:'D:\\Tools\\chrome.exe'}),['D:\\Tools\\chrome.exe']);assert.equal(await findChrome({...options,explicitPath:'D:\\missing.exe'},async()=>false),null);
 assert.deepEqual(chromeCandidates({platform:'win32',env:{}}),[]);assert.equal(chromeCandidates({platform:'darwin'})[0],'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
});
test('Windows key entry uses the local window and never calls AppleScript; legacy connectors are skipped',async()=>{
 let calls=0;assert.equal(await promptForApiKey('DeepSeek',{platform:'win32',execute:()=>assert.fail('Mac command on Windows'),localPrompt:async label=>{calls++;assert.equal(label,'DeepSeek');return 'fictional-input';}}),'fictional-input');assert.equal(calls,1);
 assert.equal(await promptForApiKey('OpenAI / GPT',{platform:'win32',localPrompt:async()=>null}),null);await assert.rejects(promptForApiKey('unknown',{platform:'win32',localPrompt:()=>assert.fail()}),/未知/);assert.deepEqual(await loadAssistantConnectors('not-a-real-directory',{platform:'win32'}),{});
});
test('cross-platform diagnostic ZIP preserves selected Unicode files and skips symlinks',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'kdocs-zip-fictional-'));t.after(()=>rm(dir,{recursive:true,force:true}));const bundle=path.join(dir,'diagnostic'),zipFile=path.join(dir,'report.zip');await mkdir(path.join(bundle,'logs'),{recursive:true});await writeFile(path.join(bundle,'logs','中文.jsonl'),'fictional-log');await writeFile(path.join(bundle,'说明.txt'),'fictional-notes');await writeFile(path.join(dir,'excluded-session'),'must-not-export');if(process.platform!=='win32')await symlink(path.join(dir,'excluded-session'),path.join(bundle,'linked-session'));
 await zipDiagnosticDirectory(bundle,zipFile);const zip=await JSZip.loadAsync(await readFile(zipFile));assert.equal(await zip.file('diagnostic/logs/中文.jsonl').async('string'),'fictional-log');assert.equal(await zip.file('diagnostic/说明.txt').async('string'),'fictional-notes');assert.equal(zip.file('diagnostic/linked-session'),null);
});
