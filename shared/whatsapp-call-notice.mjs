// A call log is a platform notice, never an attachment. Keep only the call
// state needed for display; participant identities and call tokens stay native.
export function whatsappCallNotice(message){
 const type=String(message?.metadata?.messageType??message?.type??'').toLowerCase();
 if(type!=='call_log')return null;
 const raw=message?._data||message||{},saved=message?.metadata?.callLog||message?.callLog||{};
 const outcome=saved.outcome??raw.callOutcome,isVideo=saved.isVideo??raw.isVideoCall;
 const callLog={};
 if(typeof outcome==='string'&&outcome.length<=80)callLog.outcome=outcome;
 if(typeof isVideo==='boolean')callLog.isVideo=isVideo;
 const body=String(message?.text??message?.body??''),original=body.trim();
 const placeholder=!original||/^\[(?:未知类型消息|非文字消息[^\]]*|通话记录)\]$/.test(original)||original==='未知类型消息'||/^(?:未接(?:语音|视频)?通话|(?:语音|视频)?通话记录)。$/.test(original);
 const kind=isVideo===true?'视频通话':isVideo===false?'语音通话':'通话';
 // Only Missed was verified against the native schema. Other outcomes remain
 // neutral; a call_log alone does not prove that the phone deleted the record.
 const text=placeholder?(outcome==='Missed'?`未接${kind}。`:`${kind}记录。`):body;
 return {text,callLog};
}

export function normalizeCallNotice(message){
 const notice=whatsappCallNotice(message);
 return notice?{...message,text:notice.text,metadata:{...message.metadata,messageType:'call_log',callLog:notice.callLog,media:[],incomplete:false,note:null}}:message;
}
