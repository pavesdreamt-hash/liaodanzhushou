import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceSweepState} from '../src/source/collector.mjs';

const layout=({rows=[],completeRows=[],scrollPosition={top:0}}={})=>({rows:rows.map(row=>({row})),completeRows,scrollPosition});

test('KDocs来源扫描在已确认末行进入画布时停止，不等待无限滚动',()=>{
  const state=sourceSweepState({layout:layout({rows:[196,197,198,199,200],completeRows:[196,197,198,199],scrollPosition:{top:6400}}),endRow:200,endColumn:'S',previousPosition:'{"top":5980}',highestRow:199,noNewRows:0});
  assert.equal(state.atEnd,true,'末行即使只部分绘制，也会交由后续关键字段补扫，不再继续滚动');
  assert.equal(state.last,200);
  assert.equal(state.noNewRows,0);
});

test('KDocs来源扫描连续没有新行时触发一次安全末行定位，而不是继续下滚',()=>{
  const previous='{"top":4200}',first=sourceSweepState({layout:layout({rows:[126,127,128],completeRows:[126,127,128],scrollPosition:{top:4200}}),endRow:200,endColumn:'S',previousPosition:previous,highestRow:128,noNewRows:0}),second=sourceSweepState({layout:layout({rows:[126,127,128],completeRows:[126,127,128],scrollPosition:{top:4200}}),endRow:200,endColumn:'S',previousPosition:first.position,highestRow:128,noNewRows:first.noNewRows}),third=sourceSweepState({layout:layout({rows:[126,127,128],completeRows:[126,127,128],scrollPosition:{top:4200}}),endRow:200,endColumn:'S',previousPosition:second.position,highestRow:128,noNewRows:second.noNewRows});
  assert.deepEqual([first.noNewRows,second.noNewRows,third.noNewRows],[1,2,3]);
  assert.equal(third.atEnd,false);
  assert.equal(third.stalled,1,'采集器据此只允许一次直接末行验证，验证失败即停止且不覆盖旧快照');
});
