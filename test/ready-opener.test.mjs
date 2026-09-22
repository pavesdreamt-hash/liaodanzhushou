import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadyOpener} from '../src/core/ready-opener.mjs';
test('startup activation and repeated launches wait, coalesce, then allow reopening', async () => {
  let resolve, starts=0, opens=0;
  const ready=new Promise(r=>{resolve=r;});
  const open=createReadyOpener(()=>{starts++;return ready;},()=>{opens++;});
  const first=open();assert.equal(open(),first);await Promise.resolve();
  assert.equal(opens,0);resolve();await first;
  assert.equal(opens,1);await open();assert.equal(opens,2);assert.equal(starts,1);
});
test('startup failure preserves its cause and never opens an unready page', async () => {
  const cause=new Error('startup failed');let opens=0;
  const open=createReadyOpener(()=>{throw cause;},()=>{opens++;});
  await assert.rejects(open(),error=>error===cause);assert.equal(opens,0);
});
test('browser open failure can be retried without restarting services', async () => {
  let starts=0,opens=0;
  const open=createReadyOpener(()=>{starts++;},()=>{if(++opens===1)throw new Error('browser failed');});
  await assert.rejects(open(),/browser failed/);await open();assert.equal(starts,1);assert.equal(opens,2);
});
