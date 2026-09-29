export type AsrProvider = 'groq' | 'openai' | 'custom';
export type JobState = 'queued' | 'preparing' | 'transcribing' | 'exporting' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type ConflictMode = 'ask' | 'overwrite' | 'rename' | 'skip';

export interface AudioTrack {
  index: number;
  codec: string;
  language: string;
  title: string;
  channels: number;
}

export interface MediaInfo {
  path: string;
  duration: number;
  tracks: AudioTrack[];
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface AppSettings {
  provider: AsrProvider;
  model: string;
  language: string;
  customEndpoint: string;
  conflictMode: ConflictMode;
}

export interface SettingsView extends AppSettings {
  keyConfigured: Record<AsrProvider, boolean>;
}

export interface Job {
  id: string;
  path: string;
  trackIndex: number;
  provider: AsrProvider;
  model: string;
  language: string;
  customEndpoint: string;
  state: JobState;
  completedChunks: number;
  totalChunks: number;
  error?: string;
  outputs?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface JobInput { path: string; trackIndex: number }
export interface OAuthPrompt { id: string; type: string; message: string; options?: string[]; defaultValue?: string }
export interface PiProviderView { id: string; name: string; connected: boolean }
export interface PiModelView { provider: string; id: string; name: string }

export interface DesktopApi {
  chooseFiles(): Promise<string[]>;
  chooseFolder(recursive: boolean): Promise<string[]>;
  inspectMedia(path: string): Promise<MediaInfo>;
  getSettings(): Promise<SettingsView>;
  saveSettings(settings: AppSettings, key?: string): Promise<SettingsView>;
  deleteKey(provider: AsrProvider): Promise<SettingsView>;
  listJobs(): Promise<Job[]>;
  enqueue(inputs: JobInput[]): Promise<Job[]>;
  startQueue(): Promise<void>;
  cancelJob(id: string): Promise<void>;
  retryJob(id: string): Promise<void>;
  removeJob(id: string): Promise<void>;
  listPiProviders(): Promise<PiProviderView[]>;
  listPiModels(provider: string): Promise<PiModelView[]>;
  loginPi(provider: string): Promise<void>;
  logoutPi(provider: string): Promise<void>;
  formatTranscript(jobId: string, provider: string, model: string): Promise<string>;
  answerOAuthPrompt(id: string, value: string | null): Promise<void>;
  onJobsChanged(callback: (jobs: Job[]) => void): () => void;
  onOAuthPrompt(callback: (prompt: OAuthPrompt) => void): () => void;
  onOAuthNotice(callback: (message: string) => void): () => void;
}
