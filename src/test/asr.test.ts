import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { endpointFor, parseDeepgramSegments, transcribe } from '../main/asr.js';

test('custom ASR endpoints require HTTPS', () => {
  assert.throws(() => endpointFor('custom', 'http://example.com/transcriptions'), /HTTPS/);
  assert.equal(endpointFor('groq', ''), 'https://api.groq.com/openai/v1/audio/transcriptions');
});

test('ASR request uploads only the provided audio chunk and reads timestamps', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'asr-test-'));
  const audio = join(folder, 'chunk.wav');
  await writeFile(audio, Buffer.from('RIFFdemo'));
  const originalFetch = globalThis.fetch;
  let uploadedName = '';
  let uploadedContent = '';
  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://api.groq.com/openai/v1/audio/transcriptions');
    const body = init?.body as FormData;
    const file = body.get('file') as File;
    uploadedName = file.name;
    uploadedContent = Buffer.from(await file.arrayBuffer()).toString();
    assert.equal(body.get('response_format'), 'verbose_json');
    return new Response(JSON.stringify({ segments: [{ start: 0.25, end: 1.5, text: ' 测试 ' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const segments = await transcribe({ file: audio, provider: 'groq', model: 'whisper-large-v3-turbo', language: '', customEndpoint: '', key: 'test-key', signal: new AbortController().signal });
    assert.equal(uploadedName, 'chunk.wav');
    assert.equal(uploadedContent, 'RIFFdemo');
    assert.deepEqual(segments, [{ start: 0.25, end: 1.5, text: '测试' }]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(folder, { recursive: true, force: true });
  }
});

test('Deepgram uses Token auth, raw WAV and utterance timestamps', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'deepgram-test-'));
  const audio = join(folder, 'chunk.wav');
  await writeFile(audio, Buffer.from('RIFFdemo'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://api.deepgram.com/v1/listen');
    assert.equal(url.searchParams.get('model'), 'nova-3');
    assert.equal(url.searchParams.get('utterances'), 'true');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Token test-key');
    assert.equal(Buffer.from(init?.body as Uint8Array).toString(), 'RIFFdemo');
    return new Response(JSON.stringify({ results: { utterances: [{ start: 1, end: 2.5, transcript: ' hello ' }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const segments = await transcribe({ file: audio, provider: 'deepgram', model: 'nova-3', language: '', customEndpoint: '', key: 'test-key', signal: new AbortController().signal });
    assert.deepEqual(segments, [{ start: 1, end: 2.5, text: 'hello' }]);
  } finally { globalThis.fetch = originalFetch; await rm(folder, { recursive: true, force: true }); }
});

test('Deepgram falls back to timestamped words when utterances are empty', () => {
  assert.deepEqual(parseDeepgramSegments({ results: { utterances: [], channels: [{ alternatives: [{ transcript: '这是测试。下一句', words: [
    { start: 0.2, end: 0.8, word: '这是', punctuated_word: '这是' },
    { start: 0.8, end: 1.3, word: '测试', punctuated_word: '测试。' },
    { start: 2, end: 2.6, word: '下一句', punctuated_word: '下一句' },
  ] }] }] } }), [
    { start: 0.2, end: 1.3, text: '这是测试。' },
    { start: 2, end: 2.6, text: '下一句' },
  ]);
});

test('Deepgram falls back to full transcript if word timings are unavailable', () => {
  assert.deepEqual(parseDeepgramSegments({ metadata: { duration: 6 }, results: { utterances: [], channels: [{ alternatives: [{ transcript: '识别结果' }] }] } }), [{ start: 0, end: 6, text: '识别结果' }]);
  assert.deepEqual(parseDeepgramSegments({ results: { utterances: [], channels: [{ alternatives: [{ transcript: '' }] }] } }), []);
});
