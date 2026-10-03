import test from 'node:test';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright-core';
import electronPath from 'electron';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const launchArguments=directory=>process.env.KDOCS_TEST_EXECUTABLE?[`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`]:['.',`--isolated-user-data=${directory}`,`--orders-test-user-data=${directory}`];
const visualArtifactDirectory=process.env.KDOCS_NAV_SHELL_ARTIFACT_DIR?path.resolve(process.env.KDOCS_NAV_SHELL_ARTIFACT_DIR):null;

async function close(application,directory){
  try{const process=application?.process();await Promise.race([application?.close().catch(()=>{}),sleep(3000)]);if(process?.exitCode===null)process.kill('SIGKILL');}catch{}
  await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}

const metrics=async(frame,rootSelector,selectors)=>frame.locator(rootSelector).evaluate((root,selectors)=>{
  const find=selector=>root.querySelector(selector);
  const top=find(selectors.top),nav=find(selectors.nav),heading=find(selectors.heading),toggle=find(selectors.toggle),active=find(selectors.active),first=find(selectors.first);
  if(!top||!nav||!heading||!toggle||!active||!first)throw new Error(`缺少统一导航元素：${JSON.stringify(selectors)}`);
  const value=element=>getComputedStyle(element),round=value=>Math.round(Number.parseFloat(value));
  const navStyle=value(nav),headingStyle=value(heading),toggleStyle=value(toggle),activeStyle=value(active);
  const navBox=nav.getBoundingClientRect(),activeBox=active.getBoundingClientRect(),firstBox=first.getBoundingClientRect(),toggleBox=toggle.getBoundingClientRect(),activeIcon=active.querySelector('svg'),activeLabel=active.querySelector(':scope > span'),toggleIcon=toggle.querySelector('svg');
  const relative=box=>({left:Math.round(box.left-navBox.left),top:Math.round(box.top-navBox.top),width:Math.round(box.width),height:Math.round(box.height)});
  const normalizeZero=value=>Object.is(value,-0)?0:value;
  const centerOffset=element=>{if(!element)return -1;const box=element.getBoundingClientRect();return normalizeZero(Math.round(box.top+box.height/2-(activeBox.top+activeBox.height/2)));};
  const textCenterOffset=element=>{if(!element?.firstChild)return -1;const range=document.createRange();range.selectNodeContents(element);const box=range.getBoundingClientRect();return normalizeZero(Math.round(box.top+box.height/2-(activeBox.top+activeBox.height/2)));};
  const group=heading.parentElement;
  return {
    topHeight:round(value(top).height),topPaddingLeft:round(value(top).paddingLeft),navWidth:Math.round(nav.getBoundingClientRect().width),
    navPaddingTop:round(navStyle.paddingTop),navPaddingRight:round(navStyle.paddingRight),navPaddingBottom:round(navStyle.paddingBottom),
    headingHeight:Math.round(heading.getBoundingClientRect().height),headingMarginBottom:round(headingStyle.marginBottom),
    toggleWidth:round(toggleStyle.width),toggleHeight:round(toggleStyle.height),
    itemOffsets:[...group.querySelectorAll(':scope > button')].slice(0,5).map(button=>Math.round(button.getBoundingClientRect().top-nav.getBoundingClientRect().top)),
    itemHeight:round(activeStyle.height),itemPaddingLeft:round(activeStyle.paddingLeft),itemGap:round(activeStyle.gap),itemRadius:round(activeStyle.borderRadius),activeBackground:activeStyle.backgroundColor,
    activeRect:relative(activeBox),firstRect:relative(firstBox),toggleRect:relative(toggleBox),
    activeIconLeft:activeIcon?Math.round(activeIcon.getBoundingClientRect().left-activeBox.left):-1,
    activeIconCenterOffset:centerOffset(activeIcon),activeLabelTextCenterOffset:textCenterOffset(activeLabel),
    toggleBorder:toggleStyle.borderColor,toggleBackground:toggleStyle.backgroundColor,
    toggleIcon:toggleIcon?{width:Math.round(toggleIcon.getBoundingClientRect().width),height:Math.round(toggleIcon.getBoundingClientRect().height),display:value(toggleIcon).display,visibility:value(toggleIcon).visibility}:{width:0,height:0,display:'none',visibility:'hidden'}
  };
},selectors);

const selectors={
  workbench:{top:'.cwb-topbar',nav:'.cwb-nav',heading:'.cwb-nav-heading',toggle:'.cwb-nav-toggle',active:'.cwb-nav button[aria-current="page"]',first:'.cwb-nav-section > button:not(.cwb-nav-toggle)'},
  fb:{top:'.fb-topbar',nav:'.fb-nav',heading:'.fb-nav-heading',toggle:'.fb-nav-toggle',active:'.fb-nav-item[aria-current="page"]',first:'.fb-nav-section > button:not(.fb-nav-toggle)'},
  order:{top:'.od-topbar',nav:'.od-sidebar',heading:'.ol-nav-heading',toggle:'.ol-nav-toggle',active:'.od-nav-item[aria-current="page"]',first:'.od-nav-group > button'},
  generic:{top:'.up-top',nav:'.up-sidebar',heading:'.up-nav-heading',toggle:'.up-nav-toggle',active:'.up-nav:is(.on,.active,[aria-current="page"])',first:'.up-nav'}
};

const assertActiveContentVerticallyCentered=(actual,label)=>{
  assert.ok(Math.abs(actual.activeIconCenterOffset)<=1,`${label} 的选中图标必须垂直居中于紫色底纹：${JSON.stringify({activeIconCenterOffset:actual.activeIconCenterOffset,activeRect:actual.activeRect})}`);
  assert.ok(Math.abs(actual.activeLabelTextCenterOffset)<=1,`${label} 的选中文字必须垂直居中于紫色底纹：${JSON.stringify({activeLabelTextCenterOffset:actual.activeLabelTextCenterOffset,activeRect:actual.activeRect})}`);
};

const assertSharedShell=(actual,baseline,label)=>{
  const {itemOffsets,activeRect:{top:_activeTop,...actualActiveRect},firstRect:{top:_firstTop,...actualFirstRect},toggleRect:{top:_toggleTop,...actualToggleRect},activeIconCenterOffset:_activeIconCenterOffset,activeLabelTextCenterOffset:_activeLabelTextCenterOffset,...actualShell}=actual;
  const {itemOffsets:baselineOffsets,activeRect:{top:_baselineActiveTop,...baselineActiveRect},firstRect:{top:_baselineFirstTop,...baselineFirstRect},toggleRect:{top:_baselineToggleTop,...baselineToggleRect},activeIconCenterOffset:_baselineIconCenterOffset,activeLabelTextCenterOffset:_baselineLabelTextCenterOffset,...baselineShell}=baseline;
  actualShell.activeRect=actualActiveRect;actualShell.firstRect=actualFirstRect;actualShell.toggleRect=actualToggleRect;
  baselineShell.activeRect=baselineActiveRect;baselineShell.firstRect=baselineFirstRect;baselineShell.toggleRect=baselineToggleRect;
  assert.deepEqual(actualShell,baselineShell,label);
  assert.equal(itemOffsets.length,5,`${label} 必须保留前五个主导航项`);
  assert.equal(itemOffsets.every((offset,index)=>Math.abs(offset-baselineOffsets[index])<=1),true,`${label} 的前五项垂直节奏必须与订单管理页相同`);
  assert.equal(Math.abs(actual.firstRect.top-baseline.firstRect.top)<=1,true,`${label} 的折叠按钮至首项间距必须与订单管理页相同：${JSON.stringify({actual:actual.firstRect.top,baseline:baseline.firstRect.top})}`);
  assert.equal(Math.abs(actual.toggleRect.top-baseline.toggleRect.top)<=1,true,`${label} 的折叠按钮纵向位置必须与订单管理页相同：${JSON.stringify({actual:actual.toggleRect.top,baseline:baseline.toggleRect.top})}`);
};

test('订单管理是桌面各主导航页的唯一外壳基准',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'navigation-shell-parity-'));let application;
  try{
    application=await electron.launch({executablePath:process.env.KDOCS_TEST_EXECUTABLE||electronPath,args:launchArguments(directory),cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'test'}});
    const page=await application.firstWindow();page.setDefaultTimeout(12000);await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.setContentSize(1280,820));
    const frame=page.frameLocator('iframe.confirmed-frame');
    const open=async(label,root)=>{await frame.getByRole('button',{name:label,exact:true}).click();await frame.locator(root).waitFor({state:'visible'});await page.waitForTimeout(120);};

    await open('订单管理','#ui040');
    const baseline=await metrics(frame,'#ui040',selectors.generic);
    const {itemOffsets:baselineOffsets,activeRect:_baselineActiveRect,firstRect:_baselineFirstRect,toggleRect:_baselineToggleRect,activeIconLeft:_baselineActiveIconLeft,activeIconCenterOffset:_baselineActiveIconCenterOffset,activeLabelTextCenterOffset:_baselineActiveLabelTextCenterOffset,toggleBorder:_baselineToggleBorder,toggleBackground:_baselineToggleBackground,toggleIcon:_baselineToggleIcon,...baselineShell}=baseline;
    assert.deepEqual({...baselineShell,navWidth:208},{topHeight:56,topPaddingLeft:104,navWidth:208,navPaddingTop:22,navPaddingRight:12,navPaddingBottom:12,headingHeight:36,headingMarginBottom:9,toggleWidth:32,toggleHeight:32,itemHeight:44,itemPaddingLeft:12,itemGap:10,itemRadius:9,activeBackground:'rgb(244, 239, 255)'});
    assert.equal(await frame.locator('.up-divider').count(),0,'统一页面不再提供侧栏调宽分隔条');
    assert.equal(baselineOffsets.length,5);
    assertActiveContentVerticallyCentered(baseline,'订单管理');
    if(visualArtifactDirectory){await mkdir(visualArtifactDirectory,{recursive:true});await page.screenshot({path:path.join(visualArtifactDirectory,'orders-shell-1280x820.png')});}

    await open('聊单工作台','#chat-workbench-desktop');
    assertSharedShell(await metrics(frame,'#chat-workbench-desktop',selectors.workbench),baseline,'聊天工作台必须直接采用订单管理外壳数据');
    if(visualArtifactDirectory)await page.screenshot({path:path.join(visualArtifactDirectory,'workbench-shell-1280x820.png')});
    await open('FB 聊天','#fb-chat-page');
    const expandedFb=await metrics(frame,'#fb-chat-page',selectors.fb);
    assertSharedShell(expandedFb,baseline,'FB 聊天必须直接采用订单管理外壳数据');
    assertActiveContentVerticallyCentered(expandedFb,'FB 聊天展开态');
    if(visualArtifactDirectory)await page.screenshot({path:path.join(visualArtifactDirectory,'fb-shell-1280x820.png')});
    for(const [label,root] of [['商品库存','#ui011-inventory'],['利润核算','#ui034'],['助手配置','#ui041'],['连接与设置','#ui036']]){
      await open(label,root);
      assertSharedShell(await metrics(frame,root,selectors.generic),baseline,`${label} 必须直接采用订单管理外壳数据`);
    }
    await open('商品库存','#ui011-inventory');await frame.locator('#ui011-source-library').click();await frame.locator('#ui-source-library').waitFor({state:'visible'});await page.waitForTimeout(120);
    assertSharedShell(await metrics(frame,'#ui-source-library',selectors.generic),baseline,'来源资料必须直接采用订单管理外壳数据');
    if(visualArtifactDirectory)await page.screenshot({path:path.join(visualArtifactDirectory,'source-shell-1280x820.png')});

    await open('订单管理','#ui040');await frame.getByRole('button',{name:'折叠导航栏',exact:true}).click();await page.waitForTimeout(180);
    const collapsedBaseline=await metrics(frame,'#ui040',selectors.generic);
    await open('聊单工作台','#chat-workbench-desktop');
    assert.equal(await frame.locator('#chat-workbench-desktop').evaluate(root=>root.classList.contains('is-nav-open')),false);
    assertSharedShell(await metrics(frame,'#chat-workbench-desktop',selectors.workbench),collapsedBaseline,'聊天工作台折叠态必须直接采用订单管理外壳数据');
    if(visualArtifactDirectory)await page.screenshot({path:path.join(visualArtifactDirectory,'workbench-shell-collapsed-1280x820.png')});
    await open('FB 聊天','#fb-chat-page');
    assert.equal(await frame.locator('#fb-chat-page').evaluate(root=>root.classList.contains('up-nav-collapsed')),true);
    assertSharedShell(await metrics(frame,'#fb-chat-page',selectors.fb),collapsedBaseline,'FB 聊天折叠态必须直接采用订单管理外壳数据');
    assert.equal(await frame.locator('#fb-chat-page .fb-nav-label.nav-label').evaluate(label=>getComputedStyle(label).display),'none','FB 折叠态不得显示并挤压“助手管理”分组文字');
    if(visualArtifactDirectory)await page.screenshot({path:path.join(visualArtifactDirectory,'fb-shell-collapsed-1280x820.png')});
    await open('订单管理','#ui040');
    assert.equal((await metrics(frame,'#ui040',selectors.generic)).navWidth,64);

    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.maximize());await page.waitForTimeout(220);
    await open('FB 聊天','#fb-chat-page');
    const maximizedFb=await metrics(frame,'#fb-chat-page',selectors.fb);
    assert.ok(maximizedFb.toggleIcon.width>=16&&maximizedFb.toggleIcon.height>=16&&maximizedFb.toggleIcon.display!=='none'&&maximizedFb.toggleIcon.visibility!=='hidden',`FB 最大化后折叠按钮图标必须可见：${JSON.stringify(maximizedFb.toggleIcon)}`);
    const brandGeometry=await frame.locator('#fb-chat-page').evaluate(root=>{const topbar=root.querySelector('.fb-topbar'),brand=root.querySelector('.fb-brand'),title=root.querySelector('.fb-top-title'),main=root.querySelector('.fb-main');if(!topbar||!brand||!title||!main)throw new Error('FB 顶栏结构不完整');const topbarBox=topbar.getBoundingClientRect(),brandBox=brand.getBoundingClientRect(),titleBox=title.getBoundingClientRect(),mainBox=main.getBoundingClientRect();return {topbarBottom:Math.round(topbarBox.bottom),brandLeft:Math.round(brandBox.left),brandRight:Math.round(brandBox.right),brandHeight:Math.round(brandBox.height),titleTop:Math.round(titleBox.top),mainTop:Math.round(mainBox.top),brandWhiteSpace:getComputedStyle(brand).whiteSpace};});
    assert.ok(brandGeometry.brandLeft>=100&&brandGeometry.brandRight<=1280&&brandGeometry.brandHeight<=34&&brandGeometry.brandWhiteSpace==='nowrap'&&brandGeometry.mainTop>=brandGeometry.topbarBottom,`FB 折叠／最大化后品牌必须横向留在顶栏内：${JSON.stringify(brandGeometry)}`);
    if(visualArtifactDirectory)await page.screenshot({path:path.join(visualArtifactDirectory,'fb-shell-collapsed-maximized.png')});
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.unmaximize());await page.waitForTimeout(160);

    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.setContentSize(960,820));await page.waitForTimeout(180);
    for(const [label,root,kind] of [['聊单工作台','#chat-workbench-desktop','workbench'],['FB 聊天','#fb-chat-page','fb'],['订单管理','#ui040','generic']]){
      await open(label,root);
      assert.equal((await metrics(frame,root,selectors[kind])).navWidth,64,`${label} 在紧凑窗口保持 64px 图标导航`);
    }
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.setContentSize(1440,1000));await page.waitForTimeout(180);
    await open('订单管理','#ui040');await frame.getByRole('button',{name:'展开导航栏',exact:true}).click();await page.waitForTimeout(80);
    const wideBaseline=await metrics(frame,'#ui040',selectors.generic);
    for(const [label,root,kind] of [['聊单工作台','#chat-workbench-desktop','workbench'],['FB 聊天','#fb-chat-page','fb'],['商品库存','#ui011-inventory','generic'],['利润核算','#ui034','generic'],['助手配置','#ui041','generic'],['连接与设置','#ui036','generic']]){
      await open(label,root);assertSharedShell(await metrics(frame,root,selectors[kind]),wideBaseline,`${label} 在 1440px 宽窗口也必须采用订单管理外壳数据`);
    }
    await open('商品库存','#ui011-inventory');await frame.locator('#ui011-source-library').click();await frame.locator('#ui-source-library').waitFor({state:'visible'});
    assertSharedShell(await metrics(frame,'#ui-source-library',selectors.generic),wideBaseline,'来源资料在 1440px 宽窗口也必须采用订单管理外壳数据');
  }finally{await close(application,directory);}
});
