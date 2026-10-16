// Read only the selected, already retained messages for this verified binding.
// Do not fetch another WhatsApp page when the user requests extraction.
export async function cachedCustomerProfileMessages({history,binding,messageIds}){
 if(!Array.isArray(messageIds)||!messageIds.length||messageIds.length>100||messageIds.some(id=>typeof id!=='string'||!id||id.length>200))throw new Error('请先读取并选择当前会话消息，再提取客户资料');
 const rows=[];for(const id of new Set(messageIds)){const row=await history.message(binding.accountId,binding.chatId,id);if(!row)throw new Error('所选消息尚未保存到当前会话，请刷新聊天后重试');if(row.direction==='customer'&&typeof row.text==='string'&&row.text.trim()&&!['notification_template','e2e_notification','revoked','call_log'].includes(row.metadata?.messageType))rows.push({id:row.id,direction:row.direction,text:row.text,sentAt:row.sentAt});}
 if(!rows.length)throw new Error('所选范围没有可识别的客户文字消息');return rows;
}
