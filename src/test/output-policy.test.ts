import test from 'node:test';
import assert from 'node:assert/strict';
import { UntimedCaptionError, captionOutputPlan, checkedFormats } from '../main/output-policy.js';

test('selected output formats are validated and kept in stable order', () => {
  assert.deepEqual(checkedFormats(['vtt', 'txt']), ['txt', 'vtt']);
  assert.throws(() => checkedFormats([]), /至少选择/);
  assert.deepEqual(captionOutputPlan(['srt', 'vtt'], true), { available: ['srt', 'vtt'] });
});

test('untimed captions only permit a selected TXT output', () => {
  assert.deepEqual(captionOutputPlan(['txt', 'srt'], false), { available: ['txt'], warning: '字幕没有时间轴，仅生成 TXT；SRT/VTT 未生成。' });
  assert.throws(() => captionOutputPlan(['vtt'], false), UntimedCaptionError);
});
