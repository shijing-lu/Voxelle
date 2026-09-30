import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppSettings, AsrProvider, JobInput, OutputFormat } from '../shared/types.js';
import { Vault } from './vault.js';
import { SettingsStore } from './settings.js';
import { JobQueue } from './queue.js';
import { inspectMedia } from './media.js';
import { PiService } from './pi.js';
import { readTranscript, writeFormatted } from './export.js';

const extensions = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.mp3', '.m4a', '.wav', '.flac', '.ogg']);
const here = dirname(fileURLToPath(import.meta.url));
app.setName('Voxelle');
const userDataPath = join(app.getPath('appData'), 'local-video-transcriber');
mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
let window: BrowserWindow | null = null;
let queue: JobQueue;

async function folderFiles(folder: string, recursive: boolean): Promise<string[]> {
  const output: string[] = [];
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) output.push(path);
    if (recursive && entry.isDirectory()) output.push(...await folderFiles(path, true));
  }
  return output;
}

function createWindow(): void {
  window = new BrowserWindow({
    title: 'Voxelle', width: 1200, height: 800, minWidth: 900, minHeight: 620,
    backgroundColor: '#f4f2ed',
    webPreferences: {
      preload: join(here, '..', 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.argv.includes('--dev')) void window.loadURL('http://127.0.0.1:5173');
  else void window.loadFile(join(here, '..', 'renderer', 'index.html'));
  window.on('closed', () => { window = null; });
}

function handle<T extends unknown[]>(channel: string, fn: (...args: T) => unknown): void {
  ipcMain.handle(channel, (event, ...args: T) => {
    if (!window || event.sender !== window.webContents) throw new Error('无效请求来源');
    return fn(...args);
  });
}

app.whenReady().then(async () => {
  if (!singleInstance) return;
  await rm(join(app.getPath('userData'), 'tmp'), { recursive: true, force: true });
  const vault = new Vault();
  await vault.load();
  const settings = new SettingsStore(vault);
  await settings.load();
  queue = new JobQueue(settings, jobs => window?.webContents.send('jobs:changed', jobs));
  await queue.load();
  const pi = new PiService(vault, () => window);
  createWindow();
  if (vault.warning) void dialog.showMessageBox(window!, { type: 'warning', title: '需要重新配置凭据', message: vault.warning });
  if (queue.list().some(job => job.state === 'queued' && (job.sourceType === 'url' || settings.hasKey(job.profileId, job.provider)))) queue.start();

  handle('dialog:files', async () => {
    const response = await dialog.showOpenDialog(window!, { properties: ['openFile', 'multiSelections'], filters: [{ name: '音视频', extensions: [...extensions].map(item => item.slice(1)) }] });
    return response.canceled ? [] : response.filePaths;
  });
  handle('dialog:folder', async (recursive: boolean) => {
    const response = await dialog.showOpenDialog(window!, { properties: ['openDirectory'] });
    return response.canceled ? [] : folderFiles(response.filePaths[0], Boolean(recursive));
  });
  handle('dialog:output-folder', async () => {
    const response = await dialog.showOpenDialog(window!, { properties: ['openDirectory'] });
    return response.canceled ? null : response.filePaths[0];
  });
  handle('media:inspect', async (path: string) => inspectMedia(resolve(path)));
  handle('settings:get', () => settings.view());
  handle('settings:save', (input: AppSettings, key?: string, profileId?: string | null, profileName?: string) => settings.save(input, key, profileId, profileName));
  handle('settings:activate-profile', (id: string) => settings.activate(id));
  handle('settings:delete-profile', (id: string) => {
    if (queue.list().some(job => job.profileId === id && ['queued', 'preparing', 'transcribing', 'exporting'].includes(job.state))) throw new Error('该配置仍有待处理任务，完成或取消后才能删除');
    return settings.deleteProfile(id);
  });
  handle('settings:delete-key', (provider: AsrProvider) => settings.deleteKey(provider));
  handle('jobs:list', () => queue.list());
  handle('jobs:enqueue', (inputs: JobInput[], formats: OutputFormat[]) => queue.add(inputs, formats));
  handle('jobs:enqueue-links', (urls: string[], formats: OutputFormat[]) => queue.addLinks(urls, formats));
  handle('jobs:start', () => queue.start());
  handle('jobs:cancel', (id: string) => queue.cancel(id));
  handle('jobs:retry', (id: string, formats?: OutputFormat[]) => queue.retry(id, formats));
  handle('jobs:remove', (id: string) => queue.remove(id));
  const transcriptFor = async (id: string): Promise<string> => {
    const job = queue.get(id);
    const txt = job?.outputs?.find(path => path.toLowerCase().endsWith('.txt'));
    if (!job || job.state !== 'completed' || !txt) throw new Error('该任务没有可用的 TXT 原稿');
    return readTranscript(txt);
  };
  handle('jobs:transcript', (id: string) => transcriptFor(id));
  handle('jobs:copy-transcript', async (id: string) => { clipboard.writeText(await transcriptFor(id)); });
  handle('pi:providers', () => pi.providers());
  handle('pi:models', (provider: string) => pi.listModels(provider));
  handle('pi:login', (provider: string) => pi.login(provider));
  handle('pi:logout', (provider: string) => pi.logout(provider));
  handle('pi:format', async (jobId: string, provider: string, model: string) => {
    const job = queue.get(jobId);
    const txt = job?.outputs?.find(path => path.endsWith('.txt'));
    if (!job || job.state !== 'completed' || !txt || !existsSync(txt)) throw new Error('任务尚未完成或原始文本不存在');
    const result = await pi.format(provider, model, await readTranscript(txt));
    return writeFormatted(txt, result);
  });
  handle('auth:answer', (id: string, value: string | null) => pi.answerPrompt(id, value));

  app.on('before-quit', () => queue.shutdown());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('second-instance', () => { window?.show(); window?.focus(); });
}).catch(error => {
  console.error('启动失败：', error);
  dialog.showErrorBox('启动失败', (error as Error).message);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
