import { app, safeStorage } from 'electron';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const header = Buffer.from('DPAPI1\n');

function protect(data: Buffer, operation: 'Protect' | 'Unprotect'): Promise<Buffer> {
  const script = `Add-Type -AssemblyName System.Security;$ErrorActionPreference='Stop';$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd());$result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($result))`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { error += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) reject(new Error(`Windows 凭据加密失败：${error.slice(0, 300) || code}`));
      else {
        try { resolve(Buffer.from(output.trim(), 'base64')); }
        catch { reject(new Error('Windows 凭据加密返回了无效数据')); }
      }
    });
    child.stdin.on('error', reject);
    child.stdin.end(data.toString('base64'));
  });
}

export class Vault {
  private values: Record<string, string> = {};
  private pending = Promise.resolve();
  private readonly file = join(app.getPath('userData'), 'secrets.dat');
  warning = '';

  async load(): Promise<void> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    try {
      if (encrypted.subarray(0, header.length).equals(header)) {
        this.values = JSON.parse((await protect(encrypted.subarray(header.length), 'Unprotect')).toString('utf8'));
      } else {
        if (await safeStorage.isAsyncEncryptionAvailable()) {
          const result = await safeStorage.decryptStringAsync(encrypted);
          this.values = JSON.parse(result.result);
        } else {
          this.values = JSON.parse(safeStorage.decryptString(encrypted));
        }
        await this.persist();
      }
    } catch {
      try {
        this.values = JSON.parse(safeStorage.decryptString(encrypted));
        await this.persist();
      } catch {
        const backup = `${this.file}.unreadable-${Date.now()}`;
        await rename(this.file, backup);
        this.values = {};
        this.warning = `旧凭据无法解密，已保留在 ${backup}。请重新配置 API Key 或订阅登录。`;
      }
    }
  }

  get(key: string): string | undefined { return this.values[key]; }
  has(key: string): boolean { return Boolean(this.values[key]); }

  async set(key: string, value: string): Promise<void> {
    await this.mutate(() => { this.values[key] = value; });
  }

  async delete(key: string): Promise<void> {
    await this.mutate(() => { delete this.values[key]; });
  }

  async modify<T>(key: string, fn: (current: string | undefined) => Promise<[string | undefined, T]>): Promise<T> {
    let result!: T;
    await this.mutate(async () => {
      const [next, value] = await fn(this.values[key]);
      if (next === undefined) delete this.values[key]; else this.values[key] = next;
      result = value;
    });
    return result;
  }

  private async mutate(fn: () => void | Promise<void>): Promise<void> {
    const operation = this.pending.then(async () => {
      await fn();
      await this.persist();
    });
    this.pending = operation.catch(() => undefined);
    await operation;
  }

  private async persist(): Promise<void> {
    await mkdir(app.getPath('userData'), { recursive: true });
    const temp = `${this.file}.tmp`;
    const ciphertext = await protect(Buffer.from(JSON.stringify(this.values), 'utf8'), 'Protect');
    await writeFile(temp, Buffer.concat([header, ciphertext]));
    await rename(temp, this.file);
  }
}
