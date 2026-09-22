// Only platform-native corrections are allowed. An edited existing body is
// still a conflict; neither a different direction nor a different minute can be rewritten.
export function structuredUpgrade(old,m){
 const previous=JSON.parse(old.metadata||'{}'),next=m.metadata||{};
 const native=['whatsapp-structured','whatsapp-wwebjs'].includes(next.source)&&next.timePrecision==='second'&&/^(true|false)_[^_]+_.+/.test(m.id);
 const sameMinute=Math.floor(Date.parse(old.sent_at)/60000)===Math.floor(Date.parse(m.sentAt)/60000);
 const sameDirection=old.direction===m.direction;
 const recovered=native&&sameMinute&&sameDirection&&['whatsapp-structured','whatsapp-wwebjs'].includes(previous.source)&&previous.messageType==='ciphertext'&&previous.incomplete&&next.messageType==='chat'&&m.text.trim();
 const decrypted=recovered&&!next.incomplete;
 const imageLabel=native&&sameMinute&&sameDirection&&previous.source==='whatsapp-web'&&previous.incomplete&&previous.media?.some(i=>i.type==='image')&&old.body===''&&next.messageType==='image'&&m.text==='[图片]';
 const body=old.body===m.text||Boolean(recovered)||Boolean(imageLabel);
 const time=old.sent_at===m.sentAt||native&&sameMinute&&sameDirection&&previous.source==='whatsapp-web'&&previous.timePrecision==='minute';
 return {allowed:body&&time&&sameDirection,decrypted:Boolean(decrypted),changed:old.body!==m.text||old.sent_at!==m.sentAt};
}
