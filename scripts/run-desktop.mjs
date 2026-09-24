import {spawn} from 'node:child_process';
import electronPath from 'electron';

const argumentsForElectron=process.argv.slice(2);
let child,stopping=false,restarts=0,restartTimer;
const stop=signal=>{
  stopping=true;
  clearTimeout(restartTimer);
  if(child&&!child.killed)child.kill(signal);
};
process.once('SIGINT',()=>stop('SIGINT'));
process.once('SIGTERM',()=>stop('SIGTERM'));

function launch(){
  child=spawn(electronPath,['.',...argumentsForElectron],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
  child.once('error',error=>{
    console.error(`[desktop-supervisor] 无法启动 Electron：${error.message}`);
  });
  child.once('exit',(code,signal)=>{
    child=undefined;
    if(stopping){process.exitCode=code||0;return;}
    if(code===0&&!signal){process.exitCode=0;return;}
    const delay=Math.min(1000*2**restarts,15000);restarts=Math.min(restarts+1,4);
    console.error(`[desktop-supervisor] Electron 异常退出（${signal||`退出码 ${code}`}），${delay/1000} 秒后自动重启。按 Ctrl+C 可停止。`);
    restartTimer=setTimeout(launch,delay);
  });
}

launch();
