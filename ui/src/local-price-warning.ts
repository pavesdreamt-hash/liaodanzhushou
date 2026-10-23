import {dialog,trapDialogFocus} from './live-dialog';
export async function confirmLocalPrice(doc:Document,value:any,cost:any):Promise<any|false>{
 const price=Number(value);if(value===null||value===undefined||String(value).trim()===''||!Number.isFinite(price)||cost===null||cost===undefined||cost==='')return null;
 const minimum=Math.round((Number(cost)+220)*100)/100;if(Math.round(price*100)>=Math.round(minimum*100))return null;
 return new Promise(resolve=>{const d=dialog(doc,'本机售价偏低提醒'),copy=doc.createElement('p'),bar=doc.createElement('footer'),cancel=doc.createElement('button'),yes=doc.createElement('button'),trigger=doc.activeElement as HTMLElement;let accepted=false;
 copy.textContent=`本次售价 ${price} AED，低于成本 ${Number(cost)} + 220 = ${minimum} AED。是否仍按此价格保存到本机？`;cancel.textContent='返回修改';yes.textContent='仍按此价保存';yes.className='primary';cancel.onclick=()=>d.box.close();yes.onclick=()=>{accepted=true;d.box.close();};bar.append(cancel,yes);d.box.append(copy,bar);d.box.addEventListener('close',()=>{trigger?.isConnected&&trigger.focus({preventScroll:true});resolve(accepted?{price,cost:Number(cost),minimum}:false);},{once:true});trapDialogFocus(d.box);d.box.showModal();cancel.focus();});
}
