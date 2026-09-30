import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Job, JobInput, OutputFormat, Segment } from '../shared/types.js';
import { SettingsStore } from './settings.js';
import { clearTemp, extractChunk, inspectMedia } from './media.js';
import { chunkCount, mergeChunkSegments } from './timeline.js';
import { transcribeWithRetry } from './asr.js';
import { outputBase, outputBaseNamed, writeOutputs, writeTextOnly } from './export.js';
import { ALL_OUTPUT_FORMATS, UntimedCaptionError, captionOutputPlan, checkedFormats } from './output-policy.js';
import { downloadAudio, fetchCaptions, inspectVideo, parseVideoLink } from './platform.js';

function formatsFor(job: Job): OutputFormat[] { return job.outputFormats?.length ? checkedFormats(job.outputFormats) : ALL_OUTPUT_FORMATS; }
function chunkProgress(done: number, total: number): number { return total > 0 ? Math.min(94, Math.round(5 + done / total * 90)) : 5; }
function noSpeechMessage(job: Job): string {
  return job.provider === 'deepgram'
    ? `Deepgram 已处理 ${job.totalChunks} 个音频片段，但没有返回文字。请在模型设置中明确填写语音语言（普通话填 zh），保存后重新导入；若仍为空，请检查原视频的实际语音内容。`
    : '语音服务没有返回可用文字，请检查所选音轨和语音语言设置';
}

export class JobQueue {
  private jobs: Job[] = [];
  private running = false;
  private activeId: string | null = null;
  private activeController: AbortController | null = null;
  private readonly file = join(app.getPath('userData'), 'jobs.json');
  private pendingSave = Promise.resolve();

  constructor(private readonly settings: SettingsStore, private readonly changed: (jobs: Job[]) => void) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Job[];
      if (!Array.isArray(parsed)) throw new Error('任务记录格式错误');
      this.jobs = parsed.map(job => {
        const interrupted = ['preparing', 'transcribing', 'exporting'].includes(job.state);
        return { ...job, batchId: job.batchId ?? 'legacy', outputFormats: job.outputFormats?.length ? checkedFormats(job.outputFormats) : [...ALL_OUTPUT_FORMATS], state: interrupted ? 'queued' : job.state, completedChunks: interrupted ? 0 : job.completedChunks, progress: interrupted || job.state === 'queued' ? 0 : job.state === 'completed' ? 100 : job.progress ?? 0, progressStage: interrupted ? '等待重新处理' : job.progressStage ?? '' };
      });
      await this.save();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.emit();
  }

  list(): Job[] { return this.jobs.map(job => ({ ...job, outputs: job.outputs?.slice(), outputFormats: job.outputFormats?.slice() })); }
  get(id: string): Job | undefined { return this.jobs.find(job => job.id === id); }

  async add(inputs: JobInput[], requestedFormats: OutputFormat[]): Promise<Job[]> {
    const current = this.settings.get();
    const outputFormats = checkedFormats(requestedFormats);
    const batchId = randomUUID();
    const added: Job[] = [];
    const seen = new Set<string>();
    for (const input of inputs) {
      const path = resolve(input.path);
      const key = `${path.toLowerCase()}:${input.trackIndex}`;
      if (seen.has(key) || this.jobs.some(j => `${j.path.toLowerCase()}:${j.trackIndex}` === key && ['queued', 'preparing', 'transcribing', 'exporting'].includes(j.state))) continue;
      seen.add(key);
      const media = await inspectMedia(path);
      if (!media.tracks.some(track => track.index === input.trackIndex)) throw new Error(`${path}：音轨索引无效`);
      const now = Date.now();
      const job: Job = { id: randomUUID(), batchId, path, trackIndex: input.trackIndex, provider: current.provider, model: current.model, language: current.language, customEndpoint: current.customEndpoint, profileId: this.settings.getActiveProfileId(), outputFormats: [...outputFormats], state: 'queued', progress: 0, progressStage: '等待处理', completedChunks: 0, totalChunks: chunkCount(media.duration), createdAt: now, updatedAt: now };
      this.jobs.push(job);
      added.push(job);
    }
    await this.save();
    this.emit();
    return added;
  }

  async addLinks(urls: string[], requestedFormats: OutputFormat[]): Promise<Job[]> {
    const current = this.settings.get();
    const outputFormats = checkedFormats(requestedFormats);
    const batchId = randomUUID();
    const added: Job[] = [];
    const seen = new Set<string>();
    for (const input of urls) {
      const link = parseVideoLink(input);
      const identity = `${link.platform}:${link.videoId.toLowerCase()}`;
      if (seen.has(identity) || this.jobs.some(job => job.sourceType === 'url' && `${job.platform}:${job.videoId?.toLowerCase()}` === identity && ['queued', 'preparing', 'transcribing', 'exporting'].includes(job.state))) continue;
      seen.add(identity);
      const now = Date.now();
      const job: Job = { id: randomUUID(), batchId, path: link.url, sourceType: 'url', platform: link.platform, videoId: link.videoId, trackIndex: 0, provider: current.provider, model: current.model, language: current.language, customEndpoint: current.customEndpoint, profileId: this.settings.getActiveProfileId(), outputDirectory: current.outputDirectory, outputFormats: [...outputFormats], state: 'queued', progress: 0, progressStage: '等待处理', completedChunks: 0, totalChunks: 0, createdAt: now, updatedAt: now };
      this.jobs.push(job); added.push(job);
    }
    await this.save(); this.emit(); return added;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.work().catch(error => {
      // A storage failure cannot be recorded in the same storage file.
      console.error('任务队列已停止：', (error as Error).message);
    }).finally(() => { this.running = false; this.activeId = null; this.activeController = null; });
  }

  shutdown(): void { this.activeController?.abort(); }

  async cancel(id: string): Promise<void> {
    const job = this.get(id);
    if (!job) return;
    if (this.activeId === id) this.activeController?.abort();
    else if (job.state === 'queued') await this.update(job, { state: 'cancelled', error: '用户已取消', progressStage: '已取消' });
  }

  async retry(id: string, formats?: OutputFormat[]): Promise<void> {
    const job = this.get(id);
    if (!job || !['failed', 'cancelled', 'skipped'].includes(job.state)) return;
    await this.update(job, { state: 'queued', error: undefined, errorCode: undefined, warning: undefined, outputFormats: formats ? checkedFormats(formats) : formatsFor(job), progress: 0, progressStage: '等待处理', completedChunks: 0, outputs: undefined });
  }

  async remove(id: string): Promise<void> {
    if (this.activeId === id) throw new Error('请先取消正在处理的任务');
    this.jobs = this.jobs.filter(job => job.id !== id);
    await this.save();
    this.emit();
  }

  private async work(): Promise<void> {
    while (true) {
      const job = this.jobs.find(item => item.state === 'queued');
      if (!job) return;
      const controller = new AbortController();
      this.activeId = job.id;
      this.activeController = controller;
      try { await this.process(job, controller.signal); }
      catch (error) {
        await this.update(job, { state: controller.signal.aborted ? 'cancelled' : 'failed', error: controller.signal.aborted ? '用户已取消' : (error as Error).message, errorCode: error instanceof UntimedCaptionError ? 'untimed-no-txt' : undefined, progressStage: controller.signal.aborted ? '已取消' : '处理失败' });
      } finally {
        await clearTemp(job.id);
        this.activeId = null;
        this.activeController = null;
      }
    }
  }

  private async process(job: Job, signal: AbortSignal): Promise<void> {
    if (job.sourceType === 'url') return this.processLink(job, signal);
    const formats = formatsFor(job);
    const key = this.settings.keyFor(job.profileId, job.provider);
    if (!key) throw new Error(`请先配置 ${job.provider} API Key`);
    await this.update(job, { state: 'preparing', progress: null, progressStage: '检查媒体' });
    const media = await inspectMedia(job.path);
    if (!media.tracks.some(track => track.index === job.trackIndex)) throw new Error('所选音轨已不存在');
    const base = await outputBase(job.path, this.settings.get().conflictMode, formats);
    if (base === null) { await this.update(job, { state: 'skipped', error: '输出已存在', progressStage: '已跳过' }); return; }
    await this.update(job, { state: 'preparing', totalChunks: chunkCount(media.duration), completedChunks: 0, progress: 5, progressStage: '准备音频' });
    let all: Segment[] = [];
    for (let i = 0; i < job.totalChunks; i++) {
      if (signal.aborted) throw new Error('任务已取消');
      await this.update(job, { state: 'preparing', progress: chunkProgress(i, job.totalChunks), progressStage: `提取音频 ${i + 1}/${job.totalChunks}` });
      const chunk = await extractChunk(job.path, job.trackIndex, job.id, i, media.duration, signal);
      await this.update(job, { state: 'transcribing', progressStage: `识别音频 ${i + 1}/${job.totalChunks}` });
      const segments = await transcribeWithRetry({ file: chunk.file, provider: job.provider, model: job.model, language: job.language, customEndpoint: job.customEndpoint, key, signal });
      all = mergeChunkSegments(all, segments, chunk.start, chunk.nominalStart);
      await this.update(job, { completedChunks: i + 1, progress: chunkProgress(i + 1, job.totalChunks) });
    }
    if (signal.aborted) throw new Error('任务已取消');
    if (all.length === 0) throw new Error(noSpeechMessage(job));
    await this.update(job, { state: 'exporting', progress: 95, progressStage: '写入输出文件' });
    const outputs = await writeOutputs(base, all, formats);
    await this.update(job, { state: 'completed', outputs, error: undefined, progress: 100, progressStage: '已完成' });
  }

  private async processLink(job: Job, signal: AbortSignal): Promise<void> {
    const formats = formatsFor(job);
    const link = parseVideoLink(job.path);
    await this.update(job, { state: 'preparing', progress: null, progressStage: '读取视频信息' });
    let details;
    try { details = await inspectVideo(link, signal); }
    catch (error) { throw new Error(`平台链接提取失败：${(error as Error).message}。可改用本地文件导入。`); }
    await this.update(job, { title: details.title, videoId: details.videoId });
    const duplicate = this.jobs.some(other => other.id !== job.id && other.sourceType === 'url' && other.platform === link.platform && other.videoId?.toLowerCase() === details.videoId.toLowerCase() && other.createdAt <= job.createdAt && ['queued', 'preparing', 'transcribing', 'exporting', 'completed'].includes(other.state));
    if (duplicate) { await this.update(job, { state: 'skipped', error: '同一视频已在队列中', progressStage: '已跳过' }); return; }
    await this.update(job, { progressStage: '查找可用字幕' });
    const caption = await fetchCaptions(link, details, job.id, job.language, signal);
    const stem = `${link.platform}-${safeName(details.videoId)}-${safeName(details.title)}`.slice(0, 180);
    const folder = job.outputDirectory || this.settings.get().outputDirectory;
    if (caption) {
      await this.update(job, { extractionMethod: caption.method });
      const { available, warning } = captionOutputPlan(formats, caption.timed);
      const base = await outputBaseNamed(folder, stem, this.settings.get().conflictMode, available);
      if (base === null) { await this.update(job, { state: 'skipped', error: '输出已存在', progressStage: '已跳过' }); return; }
      await this.update(job, { state: 'exporting', progress: 95, progressStage: '写入字幕文件' });
      const outputs = caption.timed ? await writeOutputs(base, caption.segments, available) : await writeTextOnly(base, caption.text);
      await this.update(job, { state: 'completed', outputs, warning, error: undefined, progress: 100, progressStage: '已完成' });
      return;
    }
    const key = this.settings.keyFor(job.profileId, job.provider);
    if (!key) throw new Error(`视频没有可用字幕。请先配置 ${job.provider} API Key，以便进行云端音频转写。`);
    await this.update(job, { extractionMethod: 'asr', progress: null, progressStage: '下载音频' });
    const audio = await downloadAudio(link, job.id, signal);
    await this.update(job, { progressStage: '检查音频' });
    const media = await inspectMedia(audio);
    const base = await outputBaseNamed(folder, stem, this.settings.get().conflictMode, formats);
    if (base === null) { await this.update(job, { state: 'skipped', error: '输出已存在', progressStage: '已跳过' }); return; }
    await this.update(job, { totalChunks: chunkCount(media.duration), completedChunks: 0, progress: 5, progressStage: '准备音频' });
    let all: Segment[] = [];
    for (let i = 0; i < job.totalChunks; i++) {
      if (signal.aborted) throw new Error('任务已取消');
      await this.update(job, { state: 'preparing', progress: chunkProgress(i, job.totalChunks), progressStage: `提取音频 ${i + 1}/${job.totalChunks}` });
      const chunk = await extractChunk(audio, media.tracks[0].index, job.id, i, media.duration, signal);
      await this.update(job, { state: 'transcribing', progressStage: `识别音频 ${i + 1}/${job.totalChunks}` });
      const segments = await transcribeWithRetry({ file: chunk.file, provider: job.provider, model: job.model, language: job.language, customEndpoint: job.customEndpoint, key, signal });
      all = mergeChunkSegments(all, segments, chunk.start, chunk.nominalStart);
      await this.update(job, { completedChunks: i + 1, progress: chunkProgress(i + 1, job.totalChunks) });
    }
    if (signal.aborted) throw new Error('任务已取消');
    if (!all.length) throw new Error(noSpeechMessage(job));
    await this.update(job, { state: 'exporting', progress: 95, progressStage: '写入输出文件' });
    const outputs = await writeOutputs(base, all, formats);
    await this.update(job, { state: 'completed', outputs, error: undefined, progress: 100, progressStage: '已完成' });
  }

  private async update(job: Job, data: Partial<Job>): Promise<void> {
    Object.assign(job, data, { updatedAt: Date.now() });
    await this.save();
    this.emit();
  }

  private emit(): void { this.changed(this.list()); }

  private async save(): Promise<void> {
    const operation = this.pendingSave.then(async () => {
      await mkdir(app.getPath('userData'), { recursive: true });
      const temp = `${this.file}.tmp`;
      await writeFile(temp, JSON.stringify(this.jobs, null, 2), 'utf8');
      await rename(temp, this.file);
    });
    this.pendingSave = operation.catch(() => undefined);
    await operation;
  }
}

function safeName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 90) || 'untitled';
}
