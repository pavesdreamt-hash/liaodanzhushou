import {readFile,mkdtemp,cp,writeFile,rm,rename} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const execute=promisify(execFile),root=path.resolve('.'),pkg=JSON.parse(await readFile('package.json','utf8')),appName=`聊单助手 ${pkg.version}`,label=`聊单助手${pkg.version}`,stage=await mkdtemp(path.join(os.tmpdir(),'liaodan-direct-app-')),folder=path.join(stage,label),zip=path.join(root,'dist',`${label}-x64.zip`),temporaryZip=zip+'.pending';
try{
 // ditto preserves macOS framework symlinks and signatures; fs.cp's default link rewriting does not.
 await execute('/usr/bin/ditto',[process.env.PACKAGE_APP_PATH||path.join(root,'dist','mac',`${appName}.app`),path.join(folder,`${appName}.app`)]);
 await writeFile(path.join(folder,'先读我.txt'),`解压后直接双击“${appName}.app”使用，不再需要 .command 启动器。\n首次如被 macOS 阻止，请在 Finder 中右键 App 选择“打开”并确认，不要关闭系统安全设置。\n本版使用 ~/Library/Application Support/Liaodan Assistant Live 资料目录，可导入你自己的 ShopPlus 订单文件，不读取 1.0.12 或旧版 KDocs 的资料。首次连接 WhatsApp 需扫码并核对指定订单聊天。\n可将 App 拖入“应用程序”，也可在解压目录直接使用。\n详见 USER-GUIDE.md 和 VERSION-ROLLBACK.md。\n`);
 for(const file of ['USER-GUIDE.md','RELEASE-NOTES.md','VERSION-ROLLBACK.md'])await cp(file,path.join(folder,file));
 await execute('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',folder,temporaryZip]);await rename(temporaryZip,zip);console.log(zip);
}finally{await rm(stage,{recursive:true});}
