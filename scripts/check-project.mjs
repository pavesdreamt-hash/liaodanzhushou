import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),rootPath=fileURLToPath(new URL('.',root)),pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw new Error('Application version must use semantic numeric form');
for(const path of ['src/main.mjs','src/preload.cjs','renderer/index.html','renderer/app.js','renderer/app.css','ui/src/main.tsx','ui/src/styles.css','resources/google-oauth.json','USER-GUIDE.md'])
  if(!(await stat(new URL(path,root))).isFile())throw new Error(`Missing ${path}`);
const oauthResource=join(rootPath,'resources/google-oauth.json'),oauthText=await readFile(oauthResource,'utf8'),oauth=JSON.parse(oauthText);
if(!oauth.installed?.client_id?.endsWith('.apps.googleusercontent.com')||typeof oauth.installed?.client_secret!=='string')throw new Error('Bundled Desktop OAuth resource is invalid');
if(!pkg.build.extraResources?.some(x=>x.from==='resources/google-oauth.json'&&x.to==='google-oauth.json'))throw new Error('OAuth resource is not mapped to App Resources');
const renderer=await readFile(new URL('renderer/index.html',root),'utf8');if(/导入\s*Desktop\s*OAuth|import-google/i.test(renderer))throw new Error('Obsolete OAuth file picker is still visible');
const forbidden=/(?:ya29\.[A-Za-z0-9._~-]{12,}|Bearer\s+[A-Za-z0-9._~-]{12,}|-----BEGIN (?:RSA )?PRIVATE KEY-----|"(?:access_token|refresh_token|client_secret)"\s*:\s*"[^"\r\n]{8,}")/i;
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){if(['node_modules','dist'].includes(entry.name))continue;const p=join(directory,entry.name);if(entry.isDirectory())await walk(p);else if(/\.(?:mjs|js|cjs|json|md|html|css)$/.test(entry.name)&&p!==oauthResource){const text=await readFile(p,'utf8');
// Extraction verification retains the exact, already-approved bundled OAuth resource.
const verifiedBundleCopy=p.startsWith(join(rootPath,'artifacts')+'/')&&p.endsWith('.app/Contents/Resources/google-oauth.json')&&text===oauthText;
if(forbidden.test(text)&&entry.name!=='check-project.mjs'&&!verifiedBundleCopy)throw new Error(`Possible credential in ${p}`);}}}
await walk(rootPath);
const manifest=JSON.stringify(pkg.build);
console.log(`Project checks passed (${createHash('sha256').update(manifest).digest('hex').slice(0,12)}).`);
