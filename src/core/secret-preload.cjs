const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('nativeSecret',{submit:value=>ipcRenderer.invoke('native-secret:submit',{value}),cancel:()=>ipcRenderer.invoke('native-secret:submit',{cancel:true})});
