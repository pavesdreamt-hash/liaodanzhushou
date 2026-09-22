import test from 'node:test';
import assert from 'node:assert/strict';
import {kdocsBrowserContextOptions} from '../src/source/browser.mjs';

test('KDocs工作区使用独立的普通可缩放浏览器窗口',()=>{
  const options=kdocsBrowserContextOptions();
  assert.equal(options.headless,false);
  assert.equal(options.viewport,null);
  assert.equal(options.acceptDownloads,false);
  assert.ok(options.args.includes('--start-maximized'));
  assert.equal(options.args.some(value=>value.startsWith('--app=')||value==='--kiosk'),false);
});

test('KDocs采集窗口保持普通浏览器形态并关闭翻译干扰',()=>{
  const options=kdocsBrowserContextOptions({capture:true});
  assert.equal(options.viewport,null);
  assert.ok(options.args.includes('--disable-features=Translate'));
  assert.equal(options.args.some(value=>value.startsWith('--app=')||value==='--kiosk'),false);
});
