// Isolated marketing fixture. No application IPC, secrets, media or network access.
const { contextBridge } = require('electron');
const profiles = [
  { id: 'demo-groq', name: '日常转写', provider: 'groq', model: 'whisper-large-v3-turbo', language: '', customEndpoint: '', keyConfigured: true },
  { id: 'demo-deepgram', name: '中文课程', provider: 'deepgram', model: 'nova-3', language: 'zh', customEndpoint: '', keyConfigured: true },
  { id: 'demo-openai', name: '英文访谈', provider: 'openai', model: 'whisper-1', language: 'en', customEndpoint: '', keyConfigured: true },
];
const settings = { ...profiles[0], activeProfileId: profiles[0].id, profiles, keyConfigured: { groq: true, deepgram: true, openai: true, custom: false }, conflictMode: 'rename', outputDirectory: 'D:\\Voxelle\\文字稿' };
const base = { trackIndex: 1, provider: 'groq', model: 'whisper-large-v3-turbo', language: '', customEndpoint: '', completedChunks: 0, totalChunks: 0, createdAt: new Date('2026-09-30T09:30:00').getTime(), updatedAt: 0, batchId: 'demo-batch', outputFormats: ['txt', 'srt', 'vtt'] };
const jobs = [
  { ...base, id: 'demo-course', path: 'D:\\演示素材\\设计课程.mp4', sourceType: 'file', state: 'transcribing', completedChunks: 3, totalChunks: 4, progress: 72, progressStage: '正在识别音频片段' },
  { ...base, id: 'demo-link', path: 'https://www.youtube.com/watch?v=demo', sourceType: 'url', platform: 'youtube', videoId: 'demo', title: '创作，让灵感留下来', extractionMethod: 'subtitle', state: 'completed', progress: 100, progressStage: '字幕导出完成', outputs: ['D:\\Voxelle\\文字稿\\创作，让灵感留下来.txt', 'D:\\Voxelle\\文字稿\\创作，让灵感留下来.srt', 'D:\\Voxelle\\文字稿\\创作，让灵感留下来.vtt'] },
  { ...base, id: 'demo-interview', path: 'D:\\演示素材\\访谈记录.mp4', sourceType: 'file', state: 'queued', progress: 0, progressStage: '等待开始', outputFormats: ['txt'] },
];
const transcript = '让灵感留下来。\n\n一段视频，可以是一堂课、一场访谈，或一次值得记录的分享。\n\n把声音整理成文字，让重点更容易查找，让每一次回顾更从容。\n\n在 Voxelle 中，导入文件或公开链接，选择需要的格式，然后查看与复制文本。\n\n这是用于宣传画面采集的演示稿。';
const providers = [{ id: 'anthropic', name: 'Anthropic', connected: false }, { id: 'openai-codex', name: 'OpenAI Codex', connected: false }, { id: 'github-copilot', name: 'GitHub Copilot', connected: false }];
const noop = async () => {};
let jobsCallback;
contextBridge.exposeInMainWorld('desktop', {
  getSettings: async () => settings, listJobs: async () => jobs, listPiProviders: async () => providers,
  listPiModels: async () => [], readJobTranscript: async () => transcript, copyJobTranscript: noop,
  chooseFiles: async () => ['D:\\演示素材\\设计课程.mp4', 'D:\\演示素材\\访谈记录.mp4'],
  inspectMedia: async path => ({ path, duration: 1280, tracks: [{ index: 1, codec: 'aac', language: '中文', title: '原声', channels: 2 }] }),
  onJobsChanged: callback => { jobsCallback = callback; return () => { jobsCallback = undefined; }; }, onOAuthPrompt: () => () => {}, onOAuthNotice: () => () => {},
  demoProgress: async progress => {
    jobs[0] = { ...jobs[0], progress, state: progress===100 ? 'completed' : 'transcribing', completedChunks: Math.min(4,Math.floor(progress/25)), progressStage: progress===100 ? '转写导出完成' : '正在识别音频片段', outputs: progress===100 ? ['D:\\Voxelle\\文字稿\\设计课程.txt','D:\\Voxelle\\文字稿\\设计课程.srt','D:\\Voxelle\\文字稿\\设计课程.vtt'] : undefined };
    jobsCallback?.(JSON.parse(JSON.stringify(jobs)));
  },
  startQueue: noop, cancelJob: noop, retryJob: noop, removeJob: noop,
});
