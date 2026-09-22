import {createHash} from 'node:crypto';
const waiting=()=>Object.assign(new Error('系统安全存储仍在等待授权；请完成系统窗口中的操作后点击“重新检查安全存储”。当前请求不会重复发起'),{code:'AI_SECURE_STORAGE_PENDING'});
// A UI timeout cannot cancel the native Keychain operation. Reuse it until it
// settles so reopening settings cannot stack native authorization dialogs.
export function asyncSecretStorage(safeStorage,{timeoutMs=20000}={}){
  let pending=null,available=false,lastDecrypt=null;
  const fingerprint=value=>createHash('sha256').update(value).digest('hex');
  const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(waiting()),timeoutMs);})]);}finally{clearTimeout(timer);}};
  function perform(key,operation){
    if(pending)return pending.key===key?bounded(pending.promise):Promise.reject(waiting());
    const current={key,promise:Promise.resolve().then(operation)};pending=current;
    current.promise.then(()=>{if(pending===current)pending=null;},()=>{if(pending===current)pending=null;});
    return bounded(current.promise);
  }
  return {
    isEncryptionAvailable:()=>available?Promise.resolve(true):perform('available',async()=>{available=Boolean(await safeStorage.isAsyncEncryptionAvailable());return available;}),
    encryptString:value=>perform('encrypt:'+fingerprint(value),()=>safeStorage.encryptStringAsync(value)),
    decryptString:value=>{
      const key=fingerprint(value);if(lastDecrypt?.key===key)return Promise.resolve(lastDecrypt.value);
      return perform('decrypt:'+key,async()=>{const decrypted=(await safeStorage.decryptStringAsync(value)).result;lastDecrypt={key,value:decrypted};return decrypted;});
    }
  };
}
