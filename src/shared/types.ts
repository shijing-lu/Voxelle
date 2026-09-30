export type AsrProvider = 'groq' | 'openai' | 'deepgram' | 'custom';
export type JobState = 'queued' | 'preparing' | 'transcribing' | 'exporting' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type ConflictMode = 'ask' | 'overwrite' | 'rename' | 'skip';
export type OutputFormat = 'txt' | 'srt' | 'vtt';

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
  outputDirectory: string;
}

export interface AsrProfile {
  id: string;
  name: string;
  provider: AsrProvider;
  model: string;
  language: string;
  customEndpoint: string;
}

export interface AsrProfileView extends AsrProfile { keyConfigured: boolean }

export interface SettingsView extends AppSettings {
  keyConfigured: Record<AsrProvider, boolean>;
  activeProfileId: string;
  profiles: AsrProfileView[];
}

export interface Job {
  id: string;
  path: string;
  sourceType?: 'file' | 'url';
  platform?: 'youtube' | 'bilibili';
  videoId?: string;
  title?: string;
  extractionMethod?: 'subtitle' | 'auto-caption' | 'asr';
  outputDirectory?: string;
  trackIndex: number;
  provider: AsrProvider;
  model: string;
  language: string;
  customEndpoint: string;
  profileId?: string;
  state: JobState;
  completedChunks: number;
  totalChunks: number;
  error?: string;
  outputs?: string[];
  outputFormats?: OutputFormat[];
  batchId?: string;
  progress?: number | null;
  progressStage?: string;
  warning?: string;
  errorCode?: 'untimed-no-txt';
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
  chooseOutputFolder(): Promise<string | null>;
  inspectMedia(path: string): Promise<MediaInfo>;
  getSettings(): Promise<SettingsView>;
  saveSettings(settings: AppSettings, key?: string, profileId?: string | null, profileName?: string): Promise<SettingsView>;
  activateProfile(id: string): Promise<SettingsView>;
  deleteProfile(id: string): Promise<SettingsView>;
  deleteKey(provider: AsrProvider): Promise<SettingsView>;
  listJobs(): Promise<Job[]>;
  enqueue(inputs: JobInput[], formats: OutputFormat[]): Promise<Job[]>;
  enqueueLinks(urls: string[], formats: OutputFormat[]): Promise<Job[]>;
  startQueue(): Promise<void>;
  cancelJob(id: string): Promise<void>;
  retryJob(id: string, formats?: OutputFormat[]): Promise<void>;
  removeJob(id: string): Promise<void>;
  readJobTranscript(id: string): Promise<string>;
  copyJobTranscript(id: string): Promise<void>;
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
