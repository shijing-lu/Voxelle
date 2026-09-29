import { app } from 'electron';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppSettings, AsrProvider, SettingsView } from '../shared/types.js';
import { endpointFor } from './asr.js';
import { Vault } from './vault.js';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'groq', model: 'whisper-large-v3-turbo', language: '', customEndpoint: '', conflictMode: 'ask',
};

export class SettingsStore {
  private data: AppSettings = { ...DEFAULT_SETTINGS };
  private readonly file = join(app.getPath('userData'), 'settings.json');
  constructor(private readonly vault: Vault) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<AppSettings>;
      this.data = { ...DEFAULT_SETTINGS, ...parsed };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  get(): AppSettings { return { ...this.data }; }

  view(): SettingsView {
    return { ...this.get(), keyConfigured: { groq: this.vault.has('asr:groq'), openai: this.vault.has('asr:openai'), custom: this.vault.has('asr:custom') } };
  }

  async save(input: AppSettings, key?: string): Promise<SettingsView> {
    if (!['groq', 'openai', 'custom'].includes(input.provider)) throw new Error('无效服务商');
    if (!input.model.trim()) throw new Error('请输入转写模型');
    if (!['ask', 'overwrite', 'rename', 'skip'].includes(input.conflictMode)) throw new Error('无效冲突处理方式');
    if (input.provider === 'custom') endpointFor('custom', input.customEndpoint);
    if (input.language && !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/i.test(input.language)) throw new Error('语言代码格式无效');
    this.data = { provider: input.provider, model: input.model.trim(), language: input.language.trim(), customEndpoint: input.customEndpoint.trim(), conflictMode: input.conflictMode };
    await mkdir(app.getPath('userData'), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(this.data, null, 2), 'utf8');
    await rename(temp, this.file);
    if (key?.trim()) await this.vault.set(`asr:${input.provider}`, key.trim());
    return this.view();
  }

  async deleteKey(provider: AsrProvider): Promise<SettingsView> {
    if (!['groq', 'openai', 'custom'].includes(provider)) throw new Error('无效服务商');
    await this.vault.delete(`asr:${provider}`);
    return this.view();
  }
}
