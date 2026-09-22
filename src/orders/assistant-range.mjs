export const rangeError=message=>Object.assign(new Error(message),{code:'WHATSAPP_RANGE',stage:'WhatsApp 只读连接'});
export function normalizeChatRange({from,to,endMode='fixed',now=new Date()}){
  if(!['fixed','latest'].includes(endMode))throw rangeError('读取结束方式无效，请重新选择');
  const current=Number(new Date(now)),start=typeof from==='string'?Date.parse(from):NaN;
  const end=endMode==='latest'?current:typeof to==='string'?Date.parse(to):NaN;
  if(!Number.isFinite(start))throw rangeError('请选择本次订单的聊天开始时间');
  if(!Number.isFinite(end))throw rangeError('请选择有效的聊天结束时间');
  if(start>current)throw rangeError('开始时间晚于当前时间，请选择已经发生的本单聊天');
  if(end>current)throw rangeError('结束时间晚于当前时间，请改为“每次读取到最新”或选择过去的时间');
  if(start>end)throw rangeError('开始时间不能晚于结束时间');
  return {from:new Date(start).toISOString(),to:new Date(end).toISOString(),endMode};
}
