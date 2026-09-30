import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, AsrProvider, AudioTrack, DesktopApi, Job, MediaInfo, OAuthPrompt, OutputFormat, PiModelView, PiProviderView, SettingsView } from '../shared/types';
import './style.css';

declare global { interface Window { desktop: DesktopApi } }

type PendingMedia = MediaInfo & { selectedTrack: number };
const defaults: AppSettings = { provider: 'groq', model: 'whisper-large-v3-turbo', language: '', customEndpoint: '', conflictMode: 'ask', outputDirectory: '' };
const models: Record<AsrProvider, string[]> = { groq: ['whisper-large-v3-turbo', 'whisper-large-v3'], openai: ['whisper-1'], deepgram: ['nova-3'], custom: [] };
const labels: Record<string, string> = { queued: '等待中', preparing: '提取音频', transcribing: '识别中', exporting: '导出中', completed: '已完成', failed: '失败', cancelled: '已取消', skipped: '已跳过' };

function fileName(path: string): string { return path.split(/[\\/]/).pop() ?? path; }
function seconds(value: number): string { const total = Math.round(value); return `${Math.floor(total / 60)}分${total % 60}秒`; }
function trackLabel(track: AudioTrack): string { return `#${track.index} · ${track.language} · ${track.title || track.codec} · ${track.channels}声道`; }
const outputChoices: OutputFormat[] = ['txt', 'srt', 'vtt'];
function FormatPicker({ value, onChange }: { value: OutputFormat[]; onChange: (formats: OutputFormat[]) => void }) {
  return <div className="format-picker" role="group" aria-label="输出格式">{outputChoices.map(format => <label className="checkbox" key={format}><input type="checkbox" checked={value.includes(format)} onChange={event => onChange(event.target.checked ? outputChoices.filter(item => item === format || value.includes(item)) : value.filter(item => item !== format))} />{format.toUpperCase()}</label>)}</div>;
}
function jobPercent(job: Job): number { return ['completed', 'failed', 'cancelled', 'skipped'].includes(job.state) ? 100 : job.progress ?? 0; }

function App() {
  const [tab, setTab] = useState<'jobs' | 'settings'>('jobs');
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [view, setView] = useState<SettingsView | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [linkText, setLinkText] = useState('');
  const [localFormats, setLocalFormats] = useState<OutputFormat[]>(['txt']);
  const [linkFormats, setLinkFormats] = useState<OutputFormat[]>(['txt']);
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(null);
  const [retryFormatJob, setRetryFormatJob] = useState<Job | null>(null);
  const [retryFormats, setRetryFormats] = useState<OutputFormat[]>(['txt']);
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
      .then(([saved, loadedJobs, providers]) => { applySettingsView(saved); setJobs(loadedJobs); setPiProviders(providers); })
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

  function applySettingsView(saved: SettingsView) {
    setSettings(saved);
    setView(saved);
    setProfileId(saved.activeProfileId);
    setProfileName(saved.profiles.find(item => item.id === saved.activeProfileId)?.name ?? '');
    setApiKey('');
  }

  function newProfile() {
    setProfileId(null);
    setProfileName('');
    setApiKey('');
    setSettings(current => ({ ...current, provider: 'groq', model: models.groq[0], language: '', customEndpoint: '' }));
    setMessage('填写新配置后保存；现有配置会保留');
  }

  async function selectProfile(id: string) {
    setBusy(true); setMessage('');
    try { applySettingsView(await window.desktop.activateProfile(id)); }
    catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function removeProfile() {
    if (!profileId) return;
    if (!window.confirm(`确定删除“${profileName}”及其 API Key 吗？`)) return;
    setBusy(true); setMessage('');
    try { applySettingsView(await window.desktop.deleteProfile(profileId)); setMessage('模型配置已删除'); }
    catch (error) { setMessage((error as Error).message); }
    setBusy(false);
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
    if (!localFormats.length) { setMessage('请至少选择一种输出格式'); return; }
    setBusy(true); setMessage('');
    try {
      const added = await window.desktop.enqueue(pending.map(item => ({ path: item.path, trackIndex: item.selectedTrack })), localFormats);
      setPending([]);
      setLocalFormats(['txt']);
      setMessage(`已加入 ${added.length} 个任务`);
      await window.desktop.startQueue();
    } catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function addLinks() {
    const urls = linkText.split(/[\s,，]+/).map(item => item.trim()).filter(Boolean);
    if (!urls.length) return;
    if (!linkFormats.length) { setMessage('请至少选择一种输出格式'); return; }
    setBusy(true); setMessage('');
    try {
      const added = await window.desktop.enqueueLinks(urls, linkFormats);
      setLinkFormats(['txt']);
      setLinkText(''); setMessage(`已加入 ${added.length} 个链接任务；优先提取字幕，无字幕时才使用云端语音识别。`);
      await window.desktop.startQueue();
    } catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function saveSettings() {
    setBusy(true); setMessage('');
    try {
      const saved = await window.desktop.saveSettings(settings, apiKey || undefined, profileId, profileName);
      applySettingsView(saved); setMessage('模型配置已保存并启用');
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

  async function openPreview(id: string) {
    setBusy(true); setMessage('');
    try { setPreview({ id, text: await window.desktop.readJobTranscript(id) }); }
    catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function copyTranscript(id: string) {
    try { await window.desktop.copyJobTranscript(id); setMessage('全文已复制到剪贴板'); }
    catch (error) { setMessage((error as Error).message); }
  }

  async function retryWithFormats() {
    if (!retryFormatJob || !retryFormats.length) { setMessage('请至少选择一种输出格式'); return; }
    setBusy(true); setMessage('');
    try { await window.desktop.retryJob(retryFormatJob.id, retryFormats); setRetryFormatJob(null); await window.desktop.startQueue(); }
    catch (error) { setMessage((error as Error).message); }
    setBusy(false);
  }

  async function answer(value: string | null) {
    if (!prompt) return;
    await window.desktop.answerOAuthPrompt(prompt.id, value);
    setPrompt(null);
  }

  const counts = { total: jobs.length, completed: jobs.filter(job => job.state === 'completed').length, active: jobs.filter(job => ['preparing', 'transcribing', 'exporting'].includes(job.state)).length };
  const currentKeyConfigured = profileId !== null && Boolean(view?.profiles.find(item => item.id === profileId)?.keyConfigured);
  const batches = Array.from(jobs.reduce((groups, job) => {
    const id = job.batchId ?? 'legacy';
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(job);
    return groups;
  }, new Map<string, Job[]>()).entries());

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">◎</div><div><strong>Voxelle</strong><small>VIDEO TO TEXT</small></div></div>
      <nav><button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>▤ <span>转写任务</span></button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙ <span>模型设置</span></button></nav>
      <div className="side-note"><div className="note-dot" />本地管理视频<br /><span>仅音频片段发送至所选服务</span></div>
    </aside>

    <main>
      <header className="topbar"><div>VOXELLE / {tab === 'jobs' ? 'TASKS' : 'SETTINGS'}</div><div className="top-status"><span />{currentKeyConfigured ? '转写服务已配置' : '请配置转写服务'}</div></header>
      {tab === 'jobs' ? <div className="content">
        <div className="heading"><div><div className="eyebrow">WORKSPACE / 01</div><h1>让视频内容<br /><em>成为可检索的文字。</em></h1><p>导入本地媒体或公开视频链接，批量生成文本与字幕文件。</p></div><div className="overview"><div><strong>{counts.total}</strong><span>全部任务</span></div><div><strong>{counts.completed}</strong><span>已完成</span></div><div><strong>{counts.active}</strong><span>处理中</span></div></div></div>
        <section className="panel import-panel"><div className="section-head"><div><div className="eyebrow">01 / IMPORT</div><h2>导入视频或音频</h2></div><span className="hint">支持 MP4、MOV、MKV、WebM、MP3、WAV 等</span></div><div className="import-actions"><button className="primary" disabled={busy} onClick={() => void window.desktop.chooseFiles().then(importPaths)}>＋ 选择文件</button><button className="secondary" disabled={busy} onClick={() => void window.desktop.chooseFolder(recursive).then(importPaths)}>选择文件夹</button><label className="checkbox"><input type="checkbox" checked={recursive} onChange={event => setRecursive(event.target.checked)} />包含子文件夹</label></div><p className="muted">源文件留在原位置；应用提取音轨后发送给所选语音服务商。</p></section>
        <section className="panel"><div className="section-head"><div><div className="eyebrow">02 / VIDEO LINKS</div><h2>公开视频链接</h2></div><span className="hint">YouTube · 哔哩哔哩</span></div><textarea className="link-input" value={linkText} onChange={event => setLinkText(event.target.value)} placeholder="每行一个单视频链接，可一次粘贴多个" rows={4} /><div className="format-section"><span>本批输出格式（至少选一种）</span><FormatPicker value={linkFormats} onChange={setLinkFormats} /></div><div className="panel-footer"><button className="primary" disabled={busy || !linkText.trim() || !linkFormats.length || profileId === null} onClick={() => void addLinks()}>加入链接队列 →</button><span className="muted">优先用人工字幕，再用自动字幕；无字幕时下载音频并调用当前 ASR，可能产生费用。仅支持公开单视频。</span></div></section>
        {pending.length > 0 && <section className="panel"><div className="section-head"><div><div className="eyebrow">02 / AUDIO TRACK</div><h2>确认待处理媒体</h2></div><button className="text-button" onClick={() => setPending([])}>清空</button></div><div className="pending-list">{pending.map(item => <div className="pending-row" key={item.path}><div className="file-symbol">▶</div><div className="file-info"><strong>{fileName(item.path)}</strong><small>{seconds(item.duration)} · {item.tracks.length} 条音轨</small></div><select value={item.selectedTrack} onChange={event => setPending(current => current.map(row => row.path === item.path ? { ...row, selectedTrack: Number(event.target.value) } : row))}>{item.tracks.map(track => <option value={track.index} key={track.index}>{trackLabel(track)}</option>)}</select><button className="icon-button" title="移除" onClick={() => setPending(current => current.filter(row => row.path !== item.path))}>×</button></div>)}</div><div className="format-section"><span>本批输出格式（至少选一种）</span><FormatPicker value={localFormats} onChange={setLocalFormats} /></div><div className="panel-footer"><button className="primary" disabled={busy || !currentKeyConfigured || !localFormats.length} onClick={() => void addToQueue()}>加入队列并开始 →</button>{!currentKeyConfigured && <span className="muted">请先在模型设置中填写 API Key</span>}</div></section>}
        <section className="panel tasks-panel">
          <div className="section-head"><div><div className="eyebrow">03 / QUEUE</div><h2>任务队列</h2></div><button className="secondary compact" onClick={() => void window.desktop.startQueue()}>继续队列</button></div>
          {jobs.length === 0 ? <div className="empty">尚无转写任务。选择文件或粘贴链接开始。</div> : <div className="job-list">{batches.map(([batchId, batchJobs]) => {
            const processed = batchJobs.filter(job => ['completed', 'failed', 'cancelled', 'skipped'].includes(job.state)).length;
            const percent = Math.round(batchJobs.reduce((sum, job) => sum + jobPercent(job), 0) / batchJobs.length);
            return <div className="batch-group" key={batchId}>
              <div className="batch-head"><strong>{batchId === 'legacy' ? '历史任务' : `导入批次 · ${new Date(batchJobs[0].createdAt).toLocaleString('zh-CN')}`}</strong><span>已处理 {processed}/{batchJobs.length} · 大概 {percent}%</span></div>
              <div className="progress-track batch-progress" role="progressbar" aria-label="批次处理进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
              {batchJobs.map(job => {
                const txtAvailable = job.state === 'completed' && job.outputs?.some(path => path.toLowerCase().endsWith('.txt'));
                const active = ['preparing', 'transcribing', 'exporting'].includes(job.state);
                const uncertain = active && job.progress === null;
                return <div className="job-row" key={job.id}>
                  <div className="file-symbol small">≡</div>
                  <div className="job-main">
                    <div className="job-top"><strong>{job.sourceType === 'url' ? (job.title || `${job.platform} / ${job.videoId}`) : fileName(job.path)}</strong><span className={`badge state-${job.state}`}>{labels[job.state]}</span></div>
                    <div className="job-meta">{job.sourceType === 'url' ? `${job.platform} · ${job.extractionMethod === 'subtitle' ? '人工字幕' : job.extractionMethod === 'auto-caption' ? '自动字幕' : job.extractionMethod === 'asr' ? `音频识别 ${job.provider} / ${job.model}` : '正在查找字幕'}` : `${job.provider} / ${job.model}`} · 选择格式 {(job.outputFormats ?? outputChoices).map(format => format.toUpperCase()).join('/')}</div>
                    <div className="progress-label"><span>{job.progressStage || labels[job.state]}{job.totalChunks > 0 && active ? ` · 片段 ${job.completedChunks}/${job.totalChunks}` : ''}</span><span>{uncertain ? '估算中' : `${Math.round(job.progress ?? (job.state === 'completed' ? 100 : 0))}%`}</span></div>
                    <div className={`progress-track job-progress ${uncertain ? 'indeterminate' : ''}`} role="progressbar" aria-label="任务进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uncertain ? undefined : job.progress ?? (job.state === 'completed' ? 100 : 0)}><span style={{ width: `${uncertain ? 35 : job.progress ?? (job.state === 'completed' ? 100 : 0)}%` }} /></div>
                    {job.error && <div className="job-error">{job.error}</div>}{job.warning && <div className="job-warning">{job.warning}</div>}{job.outputs && <div className="job-output">输出：{job.outputs.map(fileName).join(' · ')}</div>}
                  </div>
                  <div className="job-actions">
                    {['queued', 'preparing', 'transcribing', 'exporting'].includes(job.state) && <button onClick={() => void window.desktop.cancelJob(job.id)}>取消</button>}
                    {job.errorCode === 'untimed-no-txt' && job.state === 'failed' ? <button onClick={() => { setRetryFormatJob(job); setRetryFormats(job.outputFormats ?? ['txt']); }}>选择格式重试</button> : ['failed', 'cancelled', 'skipped'].includes(job.state) && <button onClick={() => void window.desktop.retryJob(job.id).then(() => window.desktop.startQueue())}>重试</button>}
                    {txtAvailable && <button disabled={busy} onClick={() => void openPreview(job.id)}>查看/复制文本</button>}
                    {txtAvailable && piModel && <button disabled={busy} onClick={() => void format(job.id)}>文本排版</button>}
                    {!active && <button onClick={() => void window.desktop.removeJob(job.id)}>移除</button>}
                  </div>
                </div>;
              })}
            </div>;
          })}</div>}
        </section>
      </div> : <div className="content settings-content"><div className="eyebrow">PREFERENCES / 02</div><h1>模型设置<span className="period">.</span></h1><p className="settings-intro">语音识别与 Pi AI 文本排版分别配置。订阅登录仅用于可选的文本排版。</p>
        <section className="panel">
          <div className="section-head"><div><div className="eyebrow">ASR / CLOUD</div><h2>语音识别配置</h2></div><span className="hint">保存多套配置，随时切换</span></div>
          <div className="profile-toolbar">
            <label>当前配置<select value={profileId ?? ''} disabled={busy} onChange={event => void selectProfile(event.target.value)}>
              <option value="" disabled>新配置（未保存）</option>
              {view?.profiles.map(profile => <option value={profile.id} key={profile.id}>{profile.name} · {profile.provider} / {profile.model}</option>)}
            </select></label>
            <button className="secondary" disabled={busy} onClick={newProfile}>＋ 新建配置</button>
          </div>
          <div className="form-grid">
            <label className="wide">配置名称<input value={profileName} onChange={event => setProfileName(event.target.value)} placeholder="例如：Deepgram 中文课程" maxLength={60} /></label>
            <label>服务商<select value={settings.provider} disabled={profileId !== null} onChange={event => changeProvider(event.target.value as AsrProvider)}><option value="groq">Groq</option><option value="openai">OpenAI</option><option value="deepgram">Deepgram</option><option value="custom">自定义兼容 API</option></select></label>
            <label>模型{settings.provider === 'custom' ? <input value={settings.model} onChange={event => setSettings({ ...settings, model: event.target.value })} placeholder="模型 ID" /> : <select value={settings.model} onChange={event => setSettings({ ...settings, model: event.target.value })}>{models[settings.provider].map(model => <option key={model}>{model}</option>)}</select>}</label>
            {settings.provider === 'custom' && <label className="wide">完整转写端点 URL<input value={settings.customEndpoint} onChange={event => setSettings({ ...settings, customEndpoint: event.target.value })} placeholder="https://example.com/v1/audio/transcriptions" /></label>}
            <label>API Key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={currentKeyConfigured ? '已配置；留空则保持不变' : '输入 API Key'} /></label>
            <label>语音语言<input value={settings.language} onChange={event => setSettings({ ...settings, language: event.target.value })} placeholder="留空自动识别；如 zh / en" /></label>
            <label>输出同名文件<select value={settings.conflictMode} onChange={event => setSettings({ ...settings, conflictMode: event.target.value as AppSettings['conflictMode'] })}><option value="ask">每次询问</option><option value="rename">自动另存</option><option value="overwrite">覆盖</option><option value="skip">跳过</option></select></label>
            <label className="wide">链接任务输出目录<div className="folder-choice"><input value={settings.outputDirectory} onChange={event => setSettings({ ...settings, outputDirectory: event.target.value })} /><button className="secondary compact" onClick={() => void window.desktop.chooseOutputFolder().then(folder => { if (folder) setSettings(current => ({ ...current, outputDirectory: folder })); })}>选择目录</button></div></label>
          </div>
          <div className="panel-footer"><button className="primary" disabled={busy || !profileName.trim()} onClick={() => void saveSettings()}>保存并启用</button>{currentKeyConfigured && <button className="text-button" onClick={() => void window.desktop.deleteKey(settings.provider).then(applySettingsView).catch(error => setMessage((error as Error).message))}>删除此配置的密钥</button>}{profileId && (view?.profiles.length ?? 0) > 1 && <button className="text-button danger" disabled={busy} onClick={() => void removeProfile()}>删除此配置</button>}</div>
        </section>
        <section className="panel"><div className="section-head"><div><div className="eyebrow">PI AI / OPTIONAL</div><h2>订阅模型排版</h2></div><span className="hint">默认关闭 · 只发送文本</span></div><p className="muted">连接后可对已完成的识别稿添加标点与分段。排版稿单独保存，原稿与字幕保持原样。</p><div className="provider-cards">{piProviders.map(provider => <div className="provider-card" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.connected ? '已连接' : '未连接'}</small></div>{provider.connected ? <button className="secondary compact" onClick={() => void window.desktop.logoutPi(provider.id).then(async () => setPiProviders(await window.desktop.listPiProviders()))}>断开</button> : <button className="secondary compact" disabled={busy} onClick={() => void login(provider.id)}>订阅登录</button>}</div>)}</div><div className="form-grid pi-select"><label>排版服务商<select value={piProvider} onChange={event => setPiProvider(event.target.value)}>{piProviders.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label><label>排版模型<select value={piModel} onChange={event => setPiModel(event.target.value)} disabled={!piModels.length}>{piModels.length ? piModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>) : <option value="">登录后选择</option>}</select></label></div>{notice && <p className="notice">{notice}</p>}</section>
      </div>}
      {message && <div className="toast" role="status"><span>{message}</span><button onClick={() => setMessage('')}>×</button></div>}
    </main>
    {preview && <div className="modal-backdrop"><div className="modal transcript-modal" role="dialog" aria-modal="true" aria-label="TXT 文本预览"><div className="eyebrow">TRANSCRIPT / TXT</div><h2>查看与复制文本</h2><p className="muted">可在下方选择部分文字并按 Ctrl+C，也可复制全文。</p><textarea className="transcript-preview" readOnly value={preview.text} aria-label="转写文本" /><div className="modal-actions"><button className="secondary" onClick={() => setPreview(null)}>关闭</button><button className="primary" onClick={() => void copyTranscript(preview.id)}>复制全文</button></div></div></div>}
    {retryFormatJob && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="修改输出格式"><div className="eyebrow">OUTPUT FORMAT</div><h2>选择格式后重试</h2><p>该字幕只有纯文本，没有时间轴。勾选 TXT 后可直接导出，SRT/VTT 不会生成。</p><FormatPicker value={retryFormats} onChange={setRetryFormats} /><div className="modal-actions"><button className="secondary" onClick={() => setRetryFormatJob(null)}>取消</button><button className="primary" disabled={busy || !retryFormats.includes('txt')} onClick={() => void retryWithFormats()}>保存并重试</button></div></div></div>}
    {prompt && <div className="modal-backdrop"><div className="modal"><div className="eyebrow">SUBSCRIPTION LOGIN</div><h2>完成授权</h2><p>{prompt.message}</p>{prompt.type === 'select' ? <select value={promptValue} onChange={event => setPromptValue(event.target.value)}><option value="">请选择</option>{prompt.options?.map(option => { const [id, label] = option.split('|'); return <option key={id} value={id}>{label}</option>; })}</select> : <input autoFocus type={prompt.type === 'secret' ? 'password' : 'text'} value={promptValue} onChange={event => setPromptValue(event.target.value)} placeholder={prompt.defaultValue ?? ''} />}<div className="modal-actions"><button className="secondary" onClick={() => void answer(null)}>取消</button><button className="primary" onClick={() => void answer(promptValue)} disabled={!promptValue}>继续</button></div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
