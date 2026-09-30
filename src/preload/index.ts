import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, AsrProvider, DesktopApi, Job, JobInput, MediaInfo, OAuthPrompt, OutputFormat, PiModelView, PiProviderView, SettingsView } from '../shared/types.js';

const api: DesktopApi = {
  chooseFiles: () => ipcRenderer.invoke('dialog:files'),
  chooseFolder: recursive => ipcRenderer.invoke('dialog:folder', recursive),
  chooseOutputFolder: () => ipcRenderer.invoke('dialog:output-folder'),
  inspectMedia: (path: string): Promise<MediaInfo> => ipcRenderer.invoke('media:inspect', path),
  getSettings: (): Promise<SettingsView> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings, key?: string, profileId?: string | null, profileName?: string): Promise<SettingsView> => ipcRenderer.invoke('settings:save', settings, key, profileId, profileName),
  activateProfile: (id: string): Promise<SettingsView> => ipcRenderer.invoke('settings:activate-profile', id),
  deleteProfile: (id: string): Promise<SettingsView> => ipcRenderer.invoke('settings:delete-profile', id),
  deleteKey: (provider: AsrProvider): Promise<SettingsView> => ipcRenderer.invoke('settings:delete-key', provider),
  listJobs: (): Promise<Job[]> => ipcRenderer.invoke('jobs:list'),
  enqueue: (inputs: JobInput[], formats: OutputFormat[]): Promise<Job[]> => ipcRenderer.invoke('jobs:enqueue', inputs, formats),
  enqueueLinks: (urls: string[], formats: OutputFormat[]): Promise<Job[]> => ipcRenderer.invoke('jobs:enqueue-links', urls, formats),
  startQueue: () => ipcRenderer.invoke('jobs:start'),
  cancelJob: (id: string) => ipcRenderer.invoke('jobs:cancel', id),
  retryJob: (id: string, formats?: OutputFormat[]) => ipcRenderer.invoke('jobs:retry', id, formats),
  removeJob: (id: string) => ipcRenderer.invoke('jobs:remove', id),
  readJobTranscript: (id: string) => ipcRenderer.invoke('jobs:transcript', id),
  copyJobTranscript: (id: string) => ipcRenderer.invoke('jobs:copy-transcript', id),
  listPiProviders: (): Promise<PiProviderView[]> => ipcRenderer.invoke('pi:providers'),
  listPiModels: (provider: string): Promise<PiModelView[]> => ipcRenderer.invoke('pi:models', provider),
  loginPi: (provider: string) => ipcRenderer.invoke('pi:login', provider),
  logoutPi: (provider: string) => ipcRenderer.invoke('pi:logout', provider),
  formatTranscript: (jobId: string, provider: string, model: string) => ipcRenderer.invoke('pi:format', jobId, provider, model),
  answerOAuthPrompt: (id: string, value: string | null) => ipcRenderer.invoke('auth:answer', id, value),
  onJobsChanged: callback => { const listener = (_event: Electron.IpcRendererEvent, jobs: Job[]) => callback(jobs); ipcRenderer.on('jobs:changed', listener); return () => ipcRenderer.removeListener('jobs:changed', listener); },
  onOAuthPrompt: callback => { const listener = (_event: Electron.IpcRendererEvent, prompt: OAuthPrompt) => callback(prompt); ipcRenderer.on('auth:prompt', listener); return () => ipcRenderer.removeListener('auth:prompt', listener); },
  onOAuthNotice: callback => { const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message); ipcRenderer.on('auth:notice', listener); return () => ipcRenderer.removeListener('auth:notice', listener); },
};

contextBridge.exposeInMainWorld('desktop', api);
