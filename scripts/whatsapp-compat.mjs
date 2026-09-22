import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Narrow read-only compatibility fix, derived from upstream PR #201848.
// https://github.com/wwebjs/whatsapp-web.js/pull/201848
// Do not silently patch a different library release or change send/edit behaviour.
export const upstreamHash='0d0f88565f481dbfeb9493b04b24033a2cb60f5fd2fd0e84e543b461d98878fe';
export function patchReadCompatibility(source){
 const marker='// KDocs read compatibility: upstream #201848';
 if(source.includes(marker)){if(createHash('sha256').update(source).digest('hex')!=='b7846980d9f3222a3b5b537cd769686260981a1934db86922e5344b94b426ba7')throw Error('Reviewed WhatsApp compatibility source changed');return source;}
 if(createHash('sha256').update(source).digest('hex')!==upstreamHash)throw Error('WhatsApp library source changed; compatibility must be reviewed before building');
 let next=source.replace('    window.WWebJS.getChatModel = async',`${marker}\n    window.WWebJS.getMsgKeyId = key => key?._serialized ?? key?.$1;\n    window.WWebJS.getChatModel = async`);
 next=next.replace('        delete msg.pendingAckUpdate;',`        if (msg.id && msg.id._serialized == null) {\n            const id = window.WWebJS.getMsgKeyId(msg.id);\n            if (id) msg.id = Object.assign({}, msg.id, {_serialized: id});\n        }\n        delete msg.pendingAckUpdate;`);
 next=next.replace('            const lastMessage = chat.lastReceivedKey','            const lastReceivedKeyId = window.WWebJS.getMsgKeyId(chat.lastReceivedKey);\n            const lastMessage = lastReceivedKeyId');
 next=next.replaceAll('chat.lastReceivedKey._serialized','lastReceivedKeyId');
 return next;
}
export async function applyCompatibility(){
 const root=new URL('../',import.meta.url),pkg=JSON.parse(await readFile(new URL('node_modules/whatsapp-web.js/package.json',root),'utf8'));
 if(pkg.version!=='1.34.7')throw Error('Only reviewed whatsapp-web.js 1.34.7 is supported');
 const file=new URL('node_modules/whatsapp-web.js/src/util/Injected/Utils.js',root),old=await readFile(file,'utf8'),next=patchReadCompatibility(old);
 if(next!==old)await writeFile(file,next);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await applyCompatibility();console.log('WhatsApp read compatibility verified (1.34.7, upstream #201848).');}
