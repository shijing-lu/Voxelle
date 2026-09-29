import { spawn } from 'node:child_process';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const executable = resolve(process.argv[2] ?? join('release', 'win-unpacked', '音频转文本.exe'));
const sandbox = await mkdtemp(join(tmpdir(), 'transcriber-smoke-'));
const media = join(sandbox, 'two-tracks.mkv');
const keyFile = join(sandbox, 'key.pem');
const certFile = join(sandbox, 'cert.pem');
await new Promise((resolve, reject) => {
  const certificate = spawn('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-subj', '/CN=localhost', '-days', '1'], { windowsHide: true, stdio: 'ignore' });
  certificate.on('error', reject);
  certificate.on('close', code => code === 0 ? resolve() : reject(new Error(`测试证书生成失败：${code}`)));
});
let uploads = 0;
const server = createServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, (request, response) => {
  const data = [];
  request.on('data', chunk => data.push(chunk));
  request.on('end', () => {
    const bytes = Buffer.concat(data);
    if (request.url !== '/v1/audio/transcriptions' || !bytes.includes(Buffer.from('chunk.wav')) || !bytes.includes(Buffer.from('RIFF'))) {
      response.writeHead(400).end('expected a WAV audio chunk');
      return;
    }
    uploads++;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ segments: [{ start: 0.25, end: 1.5, text: '完整流程测试' }] }));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const mockPort = server.address().port;
const ffmpeg = join(dirname(executable), 'resources', 'bin', 'ffmpeg.exe');
await new Promise((resolve, reject) => {
  const generator = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-map', '0:a', '-map', '1:a', '-c:a', 'pcm_s16le', '-y', media], { windowsHide: true });
  generator.on('error', reject);
  generator.on('close', code => code === 0 ? resolve() : reject(new Error(`测试媒体生成失败：${code}`)));
});
let port = 22000 + Math.floor(Math.random() * 10000);
function launch() { return spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${sandbox}`], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' } }); }
let child = launch();
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk.toString().slice(0, 500); });

async function waitForPage() {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`应用提前退出：${stderr}`);
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) }).then(response => response.json());
      const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* Electron is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`等待应用页面超时：${stderr}`);
}

async function evaluate(url, expression) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('页面响应超时')), 12000);
      socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.id !== 1) return;
        clearTimeout(timer);
        if (data.result?.exceptionDetails) reject(new Error(data.result.exceptionDetails.text));
        else resolve(data.result?.result?.value);
      };
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression,
        awaitPromise: true, returnByValue: true,
      } }));
    });
  } finally { socket.close(); }
}

try {
  const page = await waitForPage();
  const result = await evaluate(page.webSocketDebuggerUrl, '(async () => ({ title: document.title, text: document.body.innerText.slice(0, 500), settings: await window.desktop.getSettings(), jobs: await window.desktop.listJobs(), providers: await window.desktop.listPiProviders() }))()');
  if (result.title !== '音频转文本' || !result.text.includes('转写任务') || !Array.isArray(result.jobs) || result.providers.length !== 3) {
    throw new Error(`启动检查失败：${JSON.stringify(result)}`);
  }
  const mediaResult = await evaluate(page.webSocketDebuggerUrl, `(async () => {
    const path = ${JSON.stringify(media)};
    const info = await window.desktop.inspectMedia(path);
    const settings = await window.desktop.saveSettings({provider:'groq',model:'whisper-large-v3-turbo',language:'',customEndpoint:'',conflictMode:'ask'}, 'smoke-test-key');
    const added = await window.desktop.enqueue([{path, trackIndex:info.tracks[1].index}]);
    await window.desktop.cancelJob(added[0].id);
    const cancelled = await window.desktop.listJobs();
    await window.desktop.retryJob(added[0].id);
    const retried = await window.desktop.listJobs();
    await window.desktop.removeJob(added[0].id);
    const cleared = await window.desktop.listJobs();
    await window.desktop.deleteKey('groq');
    return {tracks:info.tracks.length,keyStored:settings.keyConfigured.groq,cancelled:cancelled[0].state,retried:retried[0].state,cleared:cleared.length};
  })()`);
  if (mediaResult.tracks !== 2 || !mediaResult.keyStored || mediaResult.cancelled !== 'cancelled' || mediaResult.retried !== 'queued' || mediaResult.cleared !== 0) {
    throw new Error(`媒体与队列检查失败：${JSON.stringify(mediaResult)}`);
  }
  const jobId = await evaluate(page.webSocketDebuggerUrl, `(async () => {
    const path = ${JSON.stringify(media)};
    await window.desktop.saveSettings({provider:'custom',model:'mock-timed-asr',language:'',customEndpoint:'https://127.0.0.1:${mockPort}/v1/audio/transcriptions',conflictMode:'ask'}, 'smoke-test-key');
    const info = await window.desktop.inspectMedia(path);
    const added = await window.desktop.enqueue([{path, trackIndex:info.tracks[1].index}]);
    await window.desktop.startQueue();
    return added[0].id;
  })()`);
  let finalJob;
  for (let i = 0; i < 40; i++) {
    finalJob = await evaluate(page.webSocketDebuggerUrl, `(async () => (await window.desktop.listJobs()).find(job => job.id === ${JSON.stringify(jobId)}))()`);
    if (['completed', 'failed'].includes(finalJob?.state)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (finalJob?.state !== 'completed') throw new Error(`完整转写演练失败：${JSON.stringify(finalJob)}`);
  const outputText = await readFile(finalJob.outputs.find(path => path.endsWith('.txt')), 'utf8');
  const outputSrt = await readFile(finalJob.outputs.find(path => path.endsWith('.srt')), 'utf8');
  const outputVtt = await readFile(finalJob.outputs.find(path => path.endsWith('.vtt')), 'utf8');
  if (uploads !== 1 || !outputText.includes('完整流程测试') || !outputSrt.includes('00:00:00,250') || !outputVtt.includes('WEBVTT')) {
    throw new Error('完整转写演练输出不符合预期');
  }
  const queuedId = await evaluate(page.webSocketDebuggerUrl, `(async () => {
    await window.desktop.saveSettings({provider:'custom',model:'mock-timed-asr',language:'',customEndpoint:'https://127.0.0.1:${mockPort}/v1/audio/transcriptions',conflictMode:'rename'});
    const added = await window.desktop.enqueue([{path:${JSON.stringify(media)}, trackIndex:0}]);
    return added[0].id;
  })()`);
  child.kill();
  if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
  port = 22000 + Math.floor(Math.random() * 10000);
  child = launch();
  child.stderr.on('data', chunk => { stderr += chunk.toString().slice(0, 500); });
  const restartedPage = await waitForPage();
  const resumedSettings = await evaluate(restartedPage.webSocketDebuggerUrl, '(async () => window.desktop.getSettings())()');
  if (!resumedSettings.keyConfigured.custom) throw new Error(`重启后凭据丢失：${JSON.stringify(resumedSettings)}`);
  let resumedJob;
  for (let i = 0; i < 40; i++) {
    resumedJob = await evaluate(restartedPage.webSocketDebuggerUrl, `(async () => (await window.desktop.listJobs()).find(job => job.id === ${JSON.stringify(queuedId)}))()`);
    if (['completed', 'failed'].includes(resumedJob?.state)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (resumedJob?.state !== 'completed' || uploads !== 2) throw new Error(`重启续跑失败：${JSON.stringify(resumedJob)}, uploads=${uploads}`);
  console.log(JSON.stringify({ title: result.title, provider: result.settings.provider, piProviders: result.providers.map(item => item.id), ...mediaResult, uploads, resumeState: resumedJob.state, outputFiles: finalJob.outputs.map(path => path.slice(path.lastIndexOf('\\') + 1)) }));
} finally {
  child.kill();
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(sandbox, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
