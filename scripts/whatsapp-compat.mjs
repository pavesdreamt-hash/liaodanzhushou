import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Narrow read and media-send compatibility fixes for the reviewed 1.34.7 source.
// https://github.com/wwebjs/whatsapp-web.js/pull/201848
// https://github.com/wwebjs/whatsapp-web.js/issues/201922
// Do not silently patch a different library release or unrelated send/edit behaviour.
export const upstreamHash='0d0f88565f481dbfeb9493b04b24033a2cb60f5fd2fd0e84e543b461d98878fe';
export function patchReadCompatibility(source){
 const readMarker='// KDocs read compatibility: upstream #201848',sendMarker='// KDocs media send compatibility: upstream issue #201922',receiptMarker='// KDocs send receipt lookup compatibility: use the reviewed message-key reader.',hash=createHash('sha256').update(source).digest('hex');
 if(source.includes(receiptMarker)){if(hash!=='369e88d123c92edefe291d22358bd2aeb343f4bf10301619417be8b54438f655')throw Error('Reviewed WhatsApp compatibility source changed');return source;}
 let next=source;
 if(source.includes(sendMarker)){if(hash!=='0b0ea611b746e7fd17643c15bbe183921eb4f78f133857b98c17b73aebd16afa')throw Error('Reviewed WhatsApp compatibility source changed');}
 else if(source.includes(readMarker)){if(hash!=='b7846980d9f3222a3b5b537cd769686260981a1934db86922e5344b94b426ba7')throw Error('Reviewed WhatsApp compatibility source changed');}
 else{
  if(hash!==upstreamHash)throw Error('WhatsApp library source changed; compatibility must be reviewed before building');
  next=next.replace('    window.WWebJS.getChatModel = async',`${readMarker}\n    window.WWebJS.getMsgKeyId = key => key?._serialized ?? key?.$1;\n    window.WWebJS.getChatModel = async`);
  next=next.replace('        delete msg.pendingAckUpdate;',`        if (msg.id && msg.id._serialized == null) {\n            const id = window.WWebJS.getMsgKeyId(msg.id);\n            if (id) msg.id = Object.assign({}, msg.id, {_serialized: id});\n        }\n        delete msg.pendingAckUpdate;`);
  next=next.replace('            const lastMessage = chat.lastReceivedKey','            const lastReceivedKeyId = window.WWebJS.getMsgKeyId(chat.lastReceivedKey);\n            const lastMessage = lastReceivedKeyId');
  next=next.replaceAll('chat.lastReceivedKey._serialized','lastReceivedKeyId');
 }
 if(!next.includes(sendMarker))next=next.replace("        };\n\n        // Bot's won't reply if canonicalUrl is set (linking)",`        };\n\n        ${sendMarker}\n        // MediaData private model IDs must never overwrite the outgoing MsgKey.\n        delete message.__x_id;\n\n        // Bot's won't reply if canonicalUrl is set (linking)`);
 if(!next.includes(sendMarker))throw Error('WhatsApp media send compatibility insertion point changed');
 next=next.replace("        return window\n            .require('WAWebCollections')\n            .Msg.get(newMsgKey._serialized);",`        ${receiptMarker}\n        return window\n            .require('WAWebCollections')\n            .Msg.get(window.WWebJS.getMsgKeyId(newMsgKey));`);
 if(!next.includes(receiptMarker))throw Error('WhatsApp send receipt compatibility insertion point changed');
 return next;
}
export async function applyCompatibility(){
 const root=new URL('../',import.meta.url),pkg=JSON.parse(await readFile(new URL('node_modules/whatsapp-web.js/package.json',root),'utf8'));
 if(pkg.version!=='1.34.7')throw Error('Only reviewed whatsapp-web.js 1.34.7 is supported');
 const file=new URL('node_modules/whatsapp-web.js/src/util/Injected/Utils.js',root),old=await readFile(file,'utf8'),next=patchReadCompatibility(old);
 if(next!==old)await writeFile(file,next);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await applyCompatibility();console.log('WhatsApp read, media-send and send-receipt compatibility verified (1.34.7, upstream #201848 / issue #201922).');}
