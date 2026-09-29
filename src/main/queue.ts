import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Job, JobInput, Segment } from '../shared/types.js';
import { SettingsStore } from './settings.js';
import { Vault } from './vault.js';
import { clearTemp, extractChunk, inspectMedia } from './media.js';
import { chunkCount, mergeChunkSegments } from './timeline.js';
import { transcribeWithRetry } from './asr.js';
import { outputBase, writeOutputs } from './export.js';

export class JobQueue {
  private jobs: Job[] = [];
  private running = false;
  private activeId: string | null = null;
  private activeController: AbortController | null = null;
  private readonly file = join(app.getPath('userData'), 'jobs.json');
  private pendingSave = Promise.resolve();

  constructor(private readonly settings: SettingsStore, private readonly vault: Vault, private readonly changed: (jobs: Job[]) => void) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Job[];
      if (!Array.isArray(parsed)) throw new Error('任务记录格式错误');
      this.jobs = parsed.map(job => ['preparing', 'transcribing', 'exporting'].includes(job.state) ? { ...job, state: 'queued', completedChunks: 0 } : job);
      await this.save();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.emit();
  }

  list(): Job[] { return this.jobs.map(job => ({ ...job, outputs: job.outputs?.slice() })); }
  get(id: string): Job | undefined { return this.jobs.find(job => job.id === id); }

  async add(inputs: JobInput[]): Promise<Job[]> {
    const current = this.settings.get();
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
      const job: Job = { id: randomUUID(), path, trackIndex: input.trackIndex, provider: current.provider, model: current.model, language: current.language, customEndpoint: current.customEndpoint, state: 'queued', completedChunks: 0, totalChunks: chunkCount(media.duration), createdAt: now, updatedAt: now };
      this.jobs.push(job);
      added.push(job);
    }
    await this.save();
    this.emit();
    return added;
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
    else if (job.state === 'queued') await this.update(job, { state: 'cancelled', error: '用户已取消' });
  }

  async retry(id: string): Promise<void> {
    const job = this.get(id);
    if (!job || !['failed', 'cancelled', 'skipped'].includes(job.state)) return;
    await this.update(job, { state: 'queued', error: undefined, completedChunks: 0, outputs: undefined });
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
        await this.update(job, { state: controller.signal.aborted ? 'cancelled' : 'failed', error: controller.signal.aborted ? '用户已取消' : (error as Error).message });
      } finally {
        await clearTemp(job.id);
        this.activeId = null;
        this.activeController = null;
      }
    }
  }

  private async process(job: Job, signal: AbortSignal): Promise<void> {
    const key = this.vault.get(`asr:${job.provider}`);
    if (!key) throw new Error(`请先配置 ${job.provider} API Key`);
    const media = await inspectMedia(job.path);
    if (!media.tracks.some(track => track.index === job.trackIndex)) throw new Error('所选音轨已不存在');
    const base = await outputBase(job.path, this.settings.get().conflictMode);
    if (base === null) { await this.update(job, { state: 'skipped', error: '输出已存在' }); return; }
    await this.update(job, { state: 'preparing', totalChunks: chunkCount(media.duration), completedChunks: 0 });
    let all: Segment[] = [];
    for (let i = 0; i < job.totalChunks; i++) {
      if (signal.aborted) throw new Error('任务已取消');
      const chunk = await extractChunk(job.path, job.trackIndex, job.id, i, media.duration, signal);
      await this.update(job, { state: 'transcribing' });
      const segments = await transcribeWithRetry({ file: chunk.file, provider: job.provider, model: job.model, language: job.language, customEndpoint: job.customEndpoint, key, signal });
      all = mergeChunkSegments(all, segments, chunk.start, chunk.nominalStart);
      await this.update(job, { completedChunks: i + 1 });
    }
    if (signal.aborted) throw new Error('任务已取消');
    if (all.length === 0) throw new Error('没有识别到语音');
    await this.update(job, { state: 'exporting' });
    const outputs = await writeOutputs(base, all);
    await this.update(job, { state: 'completed', outputs, error: undefined });
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
