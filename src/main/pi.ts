import { app, shell, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { createModels, contentText, type AuthEvent, type AuthPrompt, type Credential, type CredentialStore } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot';
import type { OAuthPrompt, PiModelView, PiProviderView } from '../shared/types.js';
import { Vault } from './vault.js';

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic Claude' },
  { id: 'openai-codex', name: 'OpenAI Codex' },
  { id: 'github-copilot', name: 'GitHub Copilot' },
];

export class PiService {
  private readonly models;
  private pendingPrompts = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>();

  constructor(private readonly vault: Vault, private readonly window: () => BrowserWindow | null) {
    const credentials: CredentialStore = {
      read: async id => this.readCredential(id),
      list: async () => PROVIDERS.filter(item => vault.has(`pi:${item.id}`)).map(item => ({ providerId: item.id, type: 'oauth' as const })),
      modify: async (id, fn) => vault.modify(`pi:${id}`, async current => {
        const existing = current ? JSON.parse(current) as Credential : undefined;
        const next = await fn(existing);
        return [next ? JSON.stringify(next) : current, next ?? existing];
      }),
      delete: async id => { await vault.delete(`pi:${id}`); },
    };
    this.models = createModels({ credentials });
    this.models.setProvider(anthropicProvider());
    this.models.setProvider(openaiCodexProvider());
    this.models.setProvider(githubCopilotProvider());
  }

  private async readCredential(id: string): Promise<Credential | undefined> {
    const raw = this.vault.get(`pi:${id}`);
    return raw ? JSON.parse(raw) as Credential : undefined;
  }

  providers(): PiProviderView[] { return PROVIDERS.map(item => ({ ...item, connected: this.vault.has(`pi:${item.id}`) })); }

  async listModels(provider: string): Promise<PiModelView[]> {
    this.assertProvider(provider);
    const models = await this.models.getAvailable(provider);
    return models.map(model => ({ provider: model.provider, id: model.id, name: model.name }));
  }

  async login(provider: string): Promise<void> {
    this.assertProvider(provider);
    let deviceId = this.vault.get('app:deviceId');
    if (!deviceId) { deviceId = randomUUID(); await this.vault.set('app:deviceId', deviceId); }
    await this.models.login(provider, 'oauth', {
      prompt: input => this.prompt(input),
      notify: event => this.notify(event),
    }, { getDeviceId: () => deviceId! });
  }

  async logout(provider: string): Promise<void> { this.assertProvider(provider); await this.models.logout(provider); }

  answerPrompt(id: string, value: string | null): void {
    const entry = this.pendingPrompts.get(id);
    if (!entry) return;
    this.pendingPrompts.delete(id);
    if (value === null) entry.reject(new Error('登录已取消')); else entry.resolve(value);
  }

  async format(provider: string, modelId: string, transcript: string): Promise<string> {
    this.assertProvider(provider);
    const model = this.models.getModel(provider, modelId);
    if (!model) throw new Error('未找到所选 Pi AI 模型');
    if (!transcript.trim()) throw new Error('原始识别稿为空');
    const chunks = transcript.match(/[\s\S]{1,3000}/g) ?? [];
    const output: string[] = [];
    for (const chunk of chunks) {
      const response = await this.models.completeSimple(model, {
        systemPrompt: '只添加标点、合理分段和排版。严格保留原有词语、数字和顺序；听不清或不确定之处不要猜测或补全。只输出排版后的文本。',
        messages: [{ role: 'user', content: chunk, timestamp: Date.now() }],
      });
      output.push(contentText(response.content).trim());
    }
    return output.join('\n\n') + '\n';
  }

  private assertProvider(provider: string): void {
    if (!PROVIDERS.some(item => item.id === provider)) throw new Error('不支持的 Pi AI 服务商');
  }

  private prompt(input: AuthPrompt): Promise<string> {
    const id = randomUUID();
    const payload: OAuthPrompt = { id, type: input.type, message: input.message,
      options: input.type === 'select' ? input.options.map(item => `${item.id}|${item.label}`) : undefined,
      defaultValue: 'placeholder' in input ? input.placeholder : undefined };
    this.window()?.webContents.send('auth:prompt', payload);
    return new Promise((resolve, reject) => {
      this.pendingPrompts.set(id, { resolve, reject });
      input.signal?.addEventListener('abort', () => {
        this.pendingPrompts.delete(id);
        reject(new Error('登录步骤已取消'));
      }, { once: true });
    });
  }

  private notify(event: AuthEvent): void {
    if (event.type === 'auth_url') {
      const url = new URL(event.url);
      if (url.protocol === 'https:') void shell.openExternal(url.href);
      this.window()?.webContents.send('auth:notice', event.instructions ?? `请在浏览器完成登录：${url.href}`);
    } else if (event.type === 'device_code') {
      this.window()?.webContents.send('auth:notice', `请访问 ${event.verificationUri} 并输入验证码 ${event.userCode}`);
      void shell.openExternal(event.verificationUri);
    } else {
      this.window()?.webContents.send('auth:notice', event.message);
    }
  }
}
