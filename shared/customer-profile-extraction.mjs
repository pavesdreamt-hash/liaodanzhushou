// Only explicit customer text is extracted. Recognition never saves an order.
const labels=[['fullName','full\\s*name|name|客户姓名|姓名'],['phone','mobile|mob|phone|telephone|tel|whatsapp|联系电话|手机|电话'],['country','country(?:\\s*[/／]\\s*region)?|国家(?:[/／]地区)?'],['province','province|state|emirate|省(?:[/／]州)?'],['city','city|城市'],['street','location|address|street|收货地址|地址|街道'],['residence','residence|building|villa|flat|apartment|详细地址|楼栋|单元|nearest\\s+landmarks?|landmarks?|nearest\\s+metro(?:\\s+station)?']];
const header=new RegExp('^\\s*(?:[-•]\\s*)?('+labels.map(([,s])=>s).join('|')+')\\s*(?:[:：]\\s*(.*)|$)','i');
const fieldFor=value=>labels.find(([,s])=>new RegExp('^(?:'+s+')$','i').test(value))?.[0];
const payment=/^\s*\(?\s*(?:cash\s+on\s+delivery|cod|payment|货到付款|付款)/i;
const systemTypes=new Set(['notification_template','e2e_notification','revoked','call_log']);
export function extractCustomerProfile(messages){
 const choices=new Map(),issues=[];
 const add=(field,value,message)=>{value=value.trim();if(!value)return;if(value.length>500){issues.push({field,reason:'资料过长，请人工核对'});return;}if(field==='phone'&&!/^\+?[\d\s().-]{7,30}$/.test(value)||field==='phone'&&(value.replace(/\D/g,'').length<7||value.replace(/\D/g,'').length>15)){issues.push({field,reason:'联系电话格式待核对'});return;}if(!choices.has(field))choices.set(field,new Map());const map=choices.get(field);if(!map.has(value))map.set(value,{value,evidence:[]});map.get(value).evidence.push({id:message.id,sentAt:message.sentAt});};
 for(const message of (messages||[]).slice(-100)){
  if(message.direction!=='customer'||systemTypes.has(message.metadata?.messageType)||typeof message.text!=='string'||!message.id)continue;
  const blocks=[];let current;
  for(const line of message.text.slice(0,16000).split(/\r?\n/)){
   const match=header.exec(line);
   if(match){current={field:fieldFor(match[1]),lines:match[2]?[match[2]]:[]};blocks.push(current);}
   else if(payment.test(line))current=undefined;
   else if(current&&['street','residence'].includes(current.field)&&line.trim())current.lines.push(line.trim());
  }
  const grouped=new Map();for(const block of blocks){const value=block.lines.join('\n').trim();if(!value)continue;if(block.field==='residence')grouped.set(block.field,[grouped.get(block.field),value].filter(Boolean).join('\n'));else add(block.field,value,message);}
  for(const [field,value]of grouped)add(field,value,message);
  // The city is present in the customer's location itself; no country or
  // province is inferred from it. Ambiguous locations stay in the full street.
  if(!blocks.some(b=>b.field==='city'))for(const b of blocks.filter(b=>b.field==='street')){
   const city=/(?:^|[,，–—-]\s*)(Dubai|Abu Dhabi|Sharjah|Ajman|Fujairah|Ras Al Khaimah|Umm Al Quwain)\s*$/i.exec(b.lines.join(' '));if(city)add('city',city[1],message);
  }
 }
 const fields={};for(const [field,values]of choices){if(values.size===1)fields[field]=[...values.values()][0];else issues.push({field,reason:'客户原文存在多个不同值，请选择对应消息提取或人工填写'});}
 return {fields,issues};
}
