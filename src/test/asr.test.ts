import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { endpointFor, transcribe } from '../main/asr.js';

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
