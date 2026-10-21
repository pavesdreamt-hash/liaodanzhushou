import {spawn} from 'node:child_process';
import electronPath from 'electron';

const requested=process.argv.slice(2);
if(!requested.includes('--visible')){
  console.error('日常开发默认在后台验证，不打开桌面窗口。请运行 node scripts/check-background.mjs。确需可见桌面验证时，安排好后使用 npm run start -- --visible。');
  process.exit(1);
}
const restartOnCrash=requested.includes('--restart-on-crash');
const argumentsForElectron=requested.filter(arg=>!['--visible','--restart-on-crash'].includes(arg));
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
    if(!restartOnCrash){
      console.error(`[desktop-supervisor] Electron 异常退出（${signal||`退出码 ${code}`}）；已停止，不自动重开窗口。`);
      process.exitCode=code||1;return;
    }
    const delay=Math.min(1000*2**restarts,15000);restarts=Math.min(restarts+1,4);
    console.error(`[desktop-supervisor] Electron 异常退出（${signal||`退出码 ${code}`}），${delay/1000} 秒后自动重启。按 Ctrl+C 可停止。`);
    restartTimer=setTimeout(launch,delay);
  });
}

launch();
