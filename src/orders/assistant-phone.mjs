// National numbers require a known country. Never match only the trailing digits.
const regions=[
 ['971',9,9,['united arab emirates','uae','ae','阿联酋']],
 ['86',11,11,['china','cn','中国']],
 ['62',8,12,['indonesia','id','印度尼西亚','印尼']],
 ['966',9,9,['saudi arabia','sa','沙特阿拉伯','沙特']],
 ['968',8,8,['oman','om','阿曼']],['974',8,8,['qatar','qa','卡塔尔']],
 ['965',8,8,['kuwait','kw','科威特']],['973',8,8,['bahrain','bh','巴林']],
 ['1',10,10,['united states','usa','us','美国','canada','ca','加拿大']],
 ['44',10,10,['united kingdom','uk','gb','英国']],
 ['91',10,10,['india','in','印度']],['92',10,10,['pakistan','pk','巴基斯坦']],
 ['880',10,10,['bangladesh','bd','孟加拉国']]
];
export function normalizeAssistantPhone(value,country=''){
 if(typeof value!=='string')return null;const raw=value.normalize('NFKC').trim();
 if(!/^(?:\+|00)?\d[\d\s().-]*$/.test(raw))return null;
 let digits=raw.replace(/\D/g,'');const valid=n=>/^[1-9]\d{6,14}$/.test(n);
 if(raw.startsWith('+'))return valid(digits)?digits:null;
 if(raw.startsWith('00')){digits=digits.slice(2);return valid(digits)?digits:null;}
 const region=regions.find(r=>r[3].includes(String(country).trim().toLowerCase()));
 if(!region)return null;const [code,min,max]=region;
 if(digits.startsWith(code)&&digits.length-code.length>=min&&digits.length-code.length<=max)return digits;
 const national=digits.replace(/^0/,'');return national.length>=min&&national.length<=max&&valid(code+national)?code+national:null;
}
export function assistantPhoneCheck(customer,chatId){
 if(!/^wa-phone:[1-9]\d{6,14}$/.test(chatId||''))return {required:false,matches:true,status:'not-applicable',normalizedPhone:normalizeAssistantPhone(customer?.phone,customer?.country)?'+'+normalizeAssistantPhone(customer.phone,customer.country):null};
 const chatPhone=chatId.slice(9),customerPhone=customer?.phone||'',normalized=normalizeAssistantPhone(customerPhone,customer?.country);
 const digitsOnly=typeof customerPhone==='string'&&/^[1-9][\d\s().-]*$/.test(customerPhone.trim())?customerPhone.replace(/\D/g,''):null;
 const matches=normalized===chatPhone||digitsOnly===chatPhone;
 const status=matches?'matched':!customerPhone.trim()?'missing':!normalized?'unverified':'mismatch';
 return {required:true,matches,status,customerPhone,normalizedPhone:normalized?'+'+normalized:null,chatPhone:'+'+chatPhone,
  message:matches?'订单电话与聊天号码一致':status==='missing'?'客户电话未填写，请人工核对。':status==='unverified'?'电话格式或区号待人工核对。':'客户电话与聊天号码不一致，请人工核对。'};
}
