import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, AsrProvider, AudioTrack, DesktopApi, Job, MediaInfo, OAuthPrompt, PiModelView, PiProviderView, SettingsView } from '../shared/types';
import './style.css';

declare global { interface Window { desktop: DesktopApi } }

type PendingMedia = MediaInfo & { selectedTrack: number };
const defaults: AppSettings = { provider: 'groq', model: 'whisper-large-v3-turbo', language: '', customEndpoint: '', conflictMode: 'ask' };
const models: Record<AsrProvider, string[]> = { groq: ['whisper-large-v3-turbo', 'whisper-large-v3'], openai: ['whisper-1'], custom: [] };
const labels: Record<string, string> = { queued: '等待中', preparing: '提取音频', transcribing: '识别中', exporting: '导出中', completed: '已完成', failed: '失败', cancelled: '已取消', skipped: '已跳过' };

function fileName(path: string): string { return path.split(/[\\/]/).pop() ?? path; }
function seconds(value: number): string { const total = Math.round(value); return `${Math.floor(total / 60)}分${total % 60}秒`; }
function trackLabel(track: AudioTrack): string { return `#${track.index} · ${track.language} · ${track.title || track.codec} · ${track.channels}声道`; }

function App() {
  const [tab, setTab] = useState<'jobs' | 'settings'>('jobs');
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [view, setView] = useState<SettingsView | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [recursive, setRecursive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [piProviders, setPiProviders] = useState<PiProviderView[]>([]);
  const [piProvider, setPiProvider] = useState('openai-codex');
  const [piModels, setPiModels] = useState<PiModelView[]>([]);
  const [piModel, setPiModel] = useState('');
  const [prompt, setPrompt] = useState<OAuthPrompt | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void Promise.all([window.desktop.getSettings(), window.desktop.listJobs(), window.desktop.listPiProviders()])
      .then(([saved, loadedJobs, providers]) => { setSettings(saved); setView(saved); setJobs(loadedJobs); setPiProviders(providers); })
      .catch(error => setMessage((error as Error).message));
    const offJobs = window.desktop.onJobsChanged(setJobs);
    const offPrompt = window.desktop.onOAuthPrompt(value => { setPrompt(value); setPromptValue(''); });
    const offNotice = window.desktop.onOAuthNotice(setNotice);
    return () => { offJobs(); offPrompt(); offNotice(); };
  }, []);

  useEffect(() => {
    if (!piProviders.some(item => item.id === piProvider && item.connected)) { setPiModels([]); setPiModel(''); return; }
    void window.desktop.listPiModels(piProvider).then(found => { setPiModels(found); setPiModel(found[0]?.id ?? ''); }).catch(error => setMessage((error as Error).message));
  }, [piProvider, piProviders]);

  function changeProvider(provider: AsrProvider) {
    setSettings(current => ({ ...current, provider, model: models[provider][0] ?? '' }));
    setApiKey('');
  }

  async function importPaths(paths: string[]) {
    if (!paths.length) return;
    setBusy(true); setMessage('');
    const results: PendingMedia[] = [];
    const errors: string[] = [];
    const seen = new Set(pending.map(item => item.path.toLowerCase()));
    for (const path of paths) {
      if (seen.has(path.toLowerCase())) continue;
      seen.add(path.toLowerCase());
      try {
        const info = await window.desktop.inspectMedia(path);
        results.push({ ...info, selectedTrack: info.tracks[0].index });
      } catch (error) { errors.push(`${fileName(path)}：${(error as Error).message}`); }
    }
    setPending(current => [...current, ...results]);
    setMessage(errors.length ? errors.join('；') : `${results.length} 个文件已加入待处理列表`);
    setBusy(false);
  }

  async function addToQueue() {
    if (!pending.length) return;
    setBusy(true); setMessage('');
    try {
      const added = await window.desktop.enqueue(pending.map(item => ({ path: item.path, trackIndex: item.selectedTrack })));
      setPending([]);
      setMessage(`已加入 ${added.length} 个任务`);
      await window.desktop.startQueue();
    } catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function saveSettings() {
    setBusy(true); setMessage('');
    try {
      const saved = await window.desktop.saveSettings(settings, apiKey || undefined);
      setView(saved); setSettings(saved); setApiKey(''); setMessage('模型设置已保存');
    } catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function login(provider: string) {
    setBusy(true); setNotice(''); setMessage('');
    try { await window.desktop.loginPi(provider); setPiProviders(await window.desktop.listPiProviders()); setMessage('订阅账号已连接'); }
    catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function format(jobId: string) {
    if (!piModel) return;
    setBusy(true); setMessage('');
    try { const path = await window.desktop.formatTranscript(jobId, piProvider, piModel); setMessage(`排版结果已保存：${path}`); }
    catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function answer(value: string | null) {
    if (!prompt) return;
    await window.desktop.answerOAuthPrompt(prompt.id, value);
    setPrompt(null);
  }

  const counts = { total: jobs.length, completed: jobs.filter(job => job.state === 'completed').length, active: jobs.filter(job => ['preparing', 'transcribing', 'exporting'].includes(job.state)).length };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">◎</div><div><strong>音频转文本</strong><small>LOCAL TRANSCRIBE</small></div></div>
      <nav><button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>▤ <span>转写任务</span></button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙ <span>模型设置</span></button></nav>
      <div className="side-note"><div className="note-dot" />本地管理视频<br /><span>仅音频片段发送至所选服务</span></div>
    </aside>

    <main>
      <header className="topbar"><div>WINDOWS DESKTOP / {tab === 'jobs' ? 'TASKS' : 'SETTINGS'}</div><div className="top-status"><span />{view?.keyConfigured[settings.provider] ? '转写服务已配置' : '请配置转写服务'}</div></header>
      {tab === 'jobs' ? <div className="content">
        <div className="heading"><div><div className="eyebrow">WORKSPACE / 01</div><h1>让视频内容<br /><em>成为可检索的文字。</em></h1><p>选择本地媒体、确认音轨，批量生成逐段文本与字幕文件。</p></div><div className="overview"><div><strong>{counts.total}</strong><span>全部任务</span></div><div><strong>{counts.completed}</strong><span>已完成</span></div><div><strong>{counts.active}</strong><span>处理中</span></div></div></div>
        <section className="panel import-panel"><div className="section-head"><div><div className="eyebrow">01 / IMPORT</div><h2>导入视频或音频</h2></div><span className="hint">支持 MP4、MOV、MKV、WebM、MP3、WAV 等</span></div><div className="import-actions"><button className="primary" disabled={busy} onClick={() => void window.desktop.chooseFiles().then(importPaths)}>＋ 选择文件</button><button className="secondary" disabled={busy} onClick={() => void window.desktop.chooseFolder(recursive).then(importPaths)}>选择文件夹</button><label className="checkbox"><input type="checkbox" checked={recursive} onChange={event => setRecursive(event.target.checked)} />包含子文件夹</label></div><p className="muted">源文件留在原位置；应用提取音轨后发送给所选语音服务商。</p></section>
        {pending.length > 0 && <section className="panel"><div className="section-head"><div><div className="eyebrow">02 / AUDIO TRACK</div><h2>确认待处理媒体</h2></div><button className="text-button" onClick={() => setPending([])}>清空</button></div><div className="pending-list">{pending.map(item => <div className="pending-row" key={item.path}><div className="file-symbol">▶</div><div className="file-info"><strong>{fileName(item.path)}</strong><small>{seconds(item.duration)} · {item.tracks.length} 条音轨</small></div><select value={item.selectedTrack} onChange={event => setPending(current => current.map(row => row.path === item.path ? { ...row, selectedTrack: Number(event.target.value) } : row))}>{item.tracks.map(track => <option value={track.index} key={track.index}>{trackLabel(track)}</option>)}</select><button className="icon-button" title="移除" onClick={() => setPending(current => current.filter(row => row.path !== item.path))}>×</button></div>)}</div><div className="panel-footer"><button className="primary" disabled={busy || !view?.keyConfigured[settings.provider]} onClick={() => void addToQueue()}>加入队列并开始 →</button>{!view?.keyConfigured[settings.provider] && <span className="muted">请先在模型设置中填写 API Key</span>}</div></section>}
        <section className="panel tasks-panel"><div className="section-head"><div><div className="eyebrow">03 / QUEUE</div><h2>任务队列</h2></div><button className="secondary compact" onClick={() => void window.desktop.startQueue()}>继续队列</button></div>{jobs.length === 0 ? <div className="empty">尚无转写任务。选择文件开始。</div> : <div className="job-list">{jobs.map(job => <div className="job-row" key={job.id}><div className="file-symbol small">≡</div><div className="job-main"><div className="job-top"><strong>{fileName(job.path)}</strong><span className={`badge state-${job.state}`}>{labels[job.state]}</span></div><div className="job-meta">{job.provider} / {job.model} · 片段 {job.completedChunks}/{job.totalChunks}</div>{job.error && <div className="job-error">{job.error}</div>}{job.outputs && <div className="job-output">输出：{job.outputs.map(fileName).join(' · ')}</div>}</div><div className="job-actions">{['queued', 'preparing', 'transcribing', 'exporting'].includes(job.state) && <button onClick={() => void window.desktop.cancelJob(job.id)}>取消</button>}{['failed', 'cancelled', 'skipped'].includes(job.state) && <button onClick={() => void window.desktop.retryJob(job.id).then(() => window.desktop.startQueue())}>重试</button>}{job.state === 'completed' && piModel && <button disabled={busy} onClick={() => void format(job.id)}>文本排版</button>}{!['preparing', 'transcribing', 'exporting'].includes(job.state) && <button onClick={() => void window.desktop.removeJob(job.id)}>移除</button>}</div></div>)}</div>}</section>
      </div> : <div className="content settings-content"><div className="eyebrow">PREFERENCES / 02</div><h1>模型设置<span className="period">.</span></h1><p className="settings-intro">语音识别与 Pi AI 文本排版分别配置。订阅登录仅用于可选的文本排版。</p>
        <section className="panel"><div className="section-head"><div><div className="eyebrow">ASR / CLOUD</div><h2>语音识别</h2></div><span className="hint">默认 Groq Whisper Large V3 Turbo</span></div><div className="form-grid"><label>服务商<select value={settings.provider} onChange={event => changeProvider(event.target.value as AsrProvider)}><option value="groq">Groq</option><option value="openai">OpenAI</option><option value="custom">自定义兼容 API</option></select></label><label>模型{settings.provider === 'custom' ? <input value={settings.model} onChange={event => setSettings({ ...settings, model: event.target.value })} placeholder="模型 ID" /> : <select value={settings.model} onChange={event => setSettings({ ...settings, model: event.target.value })}>{models[settings.provider].map(model => <option key={model}>{model}</option>)}</select>}</label>{settings.provider === 'custom' && <label className="wide">完整转写端点 URL<input value={settings.customEndpoint} onChange={event => setSettings({ ...settings, customEndpoint: event.target.value })} placeholder="https://example.com/v1/audio/transcriptions" /></label>}<label>API Key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={view?.keyConfigured[settings.provider] ? '已配置；留空则保持不变' : '输入 API Key'} /></label><label>语音语言<input value={settings.language} onChange={event => setSettings({ ...settings, language: event.target.value })} placeholder="留空自动识别；如 zh / en" /></label><label>输出同名文件<select value={settings.conflictMode} onChange={event => setSettings({ ...settings, conflictMode: event.target.value as AppSettings['conflictMode'] })}><option value="ask">每次询问</option><option value="rename">自动另存</option><option value="overwrite">覆盖</option><option value="skip">跳过</option></select></label></div><div className="panel-footer"><button className="primary" disabled={busy} onClick={() => void saveSettings()}>保存设置</button>{view?.keyConfigured[settings.provider] && <button className="text-button" onClick={() => void window.desktop.deleteKey(settings.provider).then(setView)}>删除当前服务商密钥</button>}</div></section>
        <section className="panel"><div className="section-head"><div><div className="eyebrow">PI AI / OPTIONAL</div><h2>订阅模型排版</h2></div><span className="hint">默认关闭 · 只发送文本</span></div><p className="muted">连接后可对已完成的识别稿添加标点与分段。排版稿单独保存，原稿与字幕保持原样。</p><div className="provider-cards">{piProviders.map(provider => <div className="provider-card" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.connected ? '已连接' : '未连接'}</small></div>{provider.connected ? <button className="secondary compact" onClick={() => void window.desktop.logoutPi(provider.id).then(async () => setPiProviders(await window.desktop.listPiProviders()))}>断开</button> : <button className="secondary compact" disabled={busy} onClick={() => void login(provider.id)}>订阅登录</button>}</div>)}</div><div className="form-grid pi-select"><label>排版服务商<select value={piProvider} onChange={event => setPiProvider(event.target.value)}>{piProviders.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label><label>排版模型<select value={piModel} onChange={event => setPiModel(event.target.value)} disabled={!piModels.length}>{piModels.length ? piModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>) : <option value="">登录后选择</option>}</select></label></div>{notice && <p className="notice">{notice}</p>}</section>
      </div>}
      {message && <div className="toast" role="status"><span>{message}</span><button onClick={() => setMessage('')}>×</button></div>}
    </main>
    {prompt && <div className="modal-backdrop"><div className="modal"><div className="eyebrow">SUBSCRIPTION LOGIN</div><h2>完成授权</h2><p>{prompt.message}</p>{prompt.type === 'select' ? <select value={promptValue} onChange={event => setPromptValue(event.target.value)}><option value="">请选择</option>{prompt.options?.map(option => { const [id, label] = option.split('|'); return <option key={id} value={id}>{label}</option>; })}</select> : <input autoFocus type={prompt.type === 'secret' ? 'password' : 'text'} value={promptValue} onChange={event => setPromptValue(event.target.value)} placeholder={prompt.defaultValue ?? ''} />}<div className="modal-actions"><button className="secondary" onClick={() => void answer(null)}>取消</button><button className="primary" onClick={() => void answer(promptValue)} disabled={!promptValue}>继续</button></div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
