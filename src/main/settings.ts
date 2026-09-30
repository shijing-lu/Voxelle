import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppSettings, AsrProfile, AsrProvider, SettingsView } from '../shared/types.js';
import { endpointFor } from './asr.js';
import { Vault } from './vault.js';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'groq', model: 'whisper-large-v3-turbo', language: '', customEndpoint: '', conflictMode: 'ask', outputDirectory: app.getPath('documents'),
};

type StoredSettings = AppSettings & { activeProfileId?: string; profiles?: AsrProfile[] };
const providers: AsrProvider[] = ['groq', 'openai', 'deepgram', 'custom'];
const profileKey = (id: string): string => `asr-profile:${id}`;
const legacyModels: Record<AsrProvider, string> = { groq: 'whisper-large-v3-turbo', openai: 'whisper-1', deepgram: 'nova-3', custom: '' };

function validate(input: AppSettings): void {
  if (!providers.includes(input.provider)) throw new Error('无效服务商');
  if (!input.model.trim()) throw new Error('请输入转写模型');
  if (!['ask', 'overwrite', 'rename', 'skip'].includes(input.conflictMode)) throw new Error('无效冲突处理方式');
  if (input.provider === 'custom') endpointFor('custom', input.customEndpoint);
  if (input.language && !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/i.test(input.language)) throw new Error('语言代码格式无效');
  if (!input.outputDirectory?.trim()) throw new Error('请选择链接输出目录');
}

export class SettingsStore {
  private data: AppSettings = { ...DEFAULT_SETTINGS };
  private profiles: AsrProfile[] = [];
  private activeProfileId = '';
  private readonly file = join(app.getPath('userData'), 'settings.json');
  constructor(private readonly vault: Vault) {}

  async load(): Promise<void> {
    let parsed: Partial<StoredSettings> = {};
    try { parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<StoredSettings>; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    this.data = {
      provider: parsed.provider ?? DEFAULT_SETTINGS.provider,
      model: parsed.model ?? DEFAULT_SETTINGS.model,
      language: parsed.language ?? DEFAULT_SETTINGS.language,
      customEndpoint: parsed.customEndpoint ?? DEFAULT_SETTINGS.customEndpoint,
      conflictMode: parsed.conflictMode ?? DEFAULT_SETTINGS.conflictMode,
      outputDirectory: parsed.outputDirectory ?? DEFAULT_SETTINGS.outputDirectory,
    };
    if (Array.isArray(parsed.profiles) && parsed.profiles.length) {
      this.profiles = parsed.profiles;
      this.activeProfileId = this.profiles.some(item => item.id === parsed.activeProfileId) ? parsed.activeProfileId! : this.profiles[0].id;
      this.applyActiveProfile();
    } else {
      const legacy: AsrProfile = { id: 'legacy', name: `${this.data.provider} · ${this.data.model}`, provider: this.data.provider, model: this.data.model, language: this.data.language, customEndpoint: this.data.customEndpoint };
      this.profiles = [legacy];
      this.activeProfileId = legacy.id;
      for (const provider of providers) {
        const oldKey = this.vault.get(`asr:${provider}`);
        if (!oldKey) continue;
        const id = provider === legacy.provider ? legacy.id : `legacy-${provider}`;
        if (id !== legacy.id) this.profiles.push({ id, name: provider === 'custom' ? '原有自定义配置（请补全）' : `原有 ${provider} 配置`, provider, model: legacyModels[provider], language: '', customEndpoint: '' });
        if (!this.vault.has(profileKey(id))) await this.vault.set(profileKey(id), oldKey);
      }
      await this.persist();
    }
  }

  get(): AppSettings { return { ...this.data }; }
  getActiveProfileId(): string { return this.activeProfileId; }
  keyFor(profileId: string | undefined, provider: AsrProvider): string | undefined {
    return profileId ? this.vault.get(profileKey(profileId)) : this.vault.get(`asr:${provider}`);
  }
  hasKey(profileId: string | undefined, provider: AsrProvider): boolean { return Boolean(this.keyFor(profileId, provider)); }

  view(): SettingsView {
    const keyConfigured = Object.fromEntries(providers.map(provider => [provider, provider === this.data.provider && this.hasKey(this.activeProfileId, provider)])) as Record<AsrProvider, boolean>;
    return { ...this.get(), activeProfileId: this.activeProfileId, profiles: this.profiles.map(profile => ({ ...profile, keyConfigured: this.vault.has(profileKey(profile.id)) })), keyConfigured };
  }

  async save(input: AppSettings, key?: string, profileId?: string | null, profileName?: string): Promise<SettingsView> {
    validate(input);
    const id = profileId === null ? randomUUID() : profileId ?? this.activeProfileId;
    const old = this.profiles.find(item => item.id === id);
    if (profileId !== null && !old) throw new Error('模型配置不存在');
    const name = (profileName ?? old?.name ?? `${input.provider} · ${input.model}`).trim();
    if (!name || name.length > 60) throw new Error('配置名称须为 1–60 个字符');
    const profile: AsrProfile = { id, name, provider: input.provider, model: input.model.trim(), language: input.language.trim(), customEndpoint: input.customEndpoint.trim() };
    if (key?.trim()) await this.vault.set(profileKey(id), key.trim());
    this.profiles = old ? this.profiles.map(item => item.id === id ? profile : item) : [...this.profiles, profile];
    this.activeProfileId = id;
    this.data = { provider: profile.provider, model: profile.model, language: profile.language, customEndpoint: profile.customEndpoint, conflictMode: input.conflictMode, outputDirectory: input.outputDirectory.trim() };
    await this.persist();
    return this.view();
  }

  async activate(id: string): Promise<SettingsView> {
    if (!this.profiles.some(item => item.id === id)) throw new Error('模型配置不存在');
    this.activeProfileId = id;
    this.applyActiveProfile();
    await this.persist();
    return this.view();
  }

  async deleteProfile(id: string): Promise<SettingsView> {
    if (!this.profiles.some(item => item.id === id)) throw new Error('模型配置不存在');
    if (this.profiles.length === 1) throw new Error('至少保留一个模型配置');
    this.profiles = this.profiles.filter(item => item.id !== id);
    if (this.activeProfileId === id) { this.activeProfileId = this.profiles[0].id; this.applyActiveProfile(); }
    await this.persist();
    await this.vault.delete(profileKey(id));
    return this.view();
  }

  async deleteKey(provider: AsrProvider): Promise<SettingsView> {
    if (provider !== this.data.provider) throw new Error('只能删除当前模型配置的密钥');
    await this.vault.delete(profileKey(this.activeProfileId));
    return this.view();
  }

  private applyActiveProfile(): void {
    const profile = this.profiles.find(item => item.id === this.activeProfileId)!;
    this.data = { ...this.data, provider: profile.provider, model: profile.model, language: profile.language, customEndpoint: profile.customEndpoint };
  }

  private async persist(): Promise<void> {
    await mkdir(app.getPath('userData'), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify({ ...this.data, profiles: this.profiles, activeProfileId: this.activeProfileId }, null, 2), 'utf8');
    await rename(temp, this.file);
  }
}
