import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const media = './media/';
const faqs = [
  ['需要付费吗？', '软件由本地安装包提供。云端语音识别需要你自己的 API Key，服务商可能按音频时长收费。有可用字幕的公开链接优先提取字幕，不额外调用 ASR。免费额度以服务商账户实际情况为准。'],
  ['能处理哪些视频？', '可导入本地视频、音频和文件夹，也可粘贴 YouTube 或哔哩哔哩的公开单视频链接。支持一次添加多个独立链接，不支持播放列表、私密、会员、付费、年龄限制或 DRM 内容。平台限制或网络问题可能导致提取失败，此时可使用有权处理的本地文件。'],
  ['可以导出什么格式？', '每批可选择 TXT、SRT、VTT 中的一种、多种或全部，默认只选 TXT。只有带时间轴的结果才能生成字幕文件；纯文本字幕只生成 TXT。生成 TXT 后可在应用中预览、选择文字或复制全文。'],
  ['视频和密钥会发送到哪里？', '源视频在本地处理，云端 ASR 只接收提取的音频片段。凭据使用 Windows 系统加密保存。可选 Pi AI 排版仅发送文字，原始稿保留。官网没有追踪脚本。'],
  ['ChatGPT Plus 可以用于语音识别吗？', 'ASR 使用独立的 API 凭据。订阅 OAuth 接入用于可选的 Pi AI 文本排版，不代替语音识别 API。可保存多套 Groq、Deepgram、OpenAI 或自定义兼容配置并切换。'],
];

function App() {
  const [release, setRelease] = useState(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filmOpen, setFilmOpen] = useState(false);
  const dialog = useRef(null);
  const player = useRef(null);
  const playButton = useRef(null);
  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('motion-ready');
    fetch('./release.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setRelease).catch(() => setError(true));
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }), { threshold: .12 });
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (filmOpen) player.current.play().catch(() => {}); }, [filmOpen]);
  function watch() { setFilmOpen(true); dialog.current.showModal(); }
  function close() { player.current.pause(); dialog.current.close(); setFilmOpen(false); playButton.current.focus(); }
  async function copyHash() { try { await navigator.clipboard.writeText(release.sha256); setCopied(true); } catch { setCopied(false); } }
  const download = release ? './' + release.url : '#download';
  return <>
    <a className="skip" href="#main">跳至正文</a>
    <header className="nav wrap">
      <a className="wordmark" href="#" aria-label="Voxelle 首页"><span className="brand-glyph" aria-hidden="true"/>Voxelle</a>
      <nav aria-label="主导航"><a href="#workflow">使用方式</a><a href="#workspace">软件界面</a><a href="#faq">常见问题</a></nav>
      <a className="nav-download" href="#download">下载 Windows 版 <span aria-hidden="true">↗</span></a>
    </header>
    <main id="main">
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="kicker">从视频，到值得留下的文字</p>
          <h1>让声音<br/><span>留下文字。</span></h1>
          <p className="hero-desc">课程、访谈、灵感。导入视频或链接，<br className="desktop-break"/>把每一次回看，变成一次查找。</p>
          <div className="hero-actions"><a className="button primary" href={download} download={release?.fileName}>下载 Windows 版 <span aria-hidden="true">↗</span></a><button className="watch" onClick={watch} ref={playButton}><span className="play" aria-hidden="true">▶</span>观看 40 秒短片</button></div>
          <p className="hero-note">本地管理 · 字幕优先 · 云端转写自备 API Key</p>
        </div>
        <div className="hero-art" aria-label="Voxelle 转写任务真实界面演示">
          <img className="sculpture" src={media+'brand-wave.webp'} srcSet={`${media}brand-wave-mobile.webp 800w, ${media}brand-wave.webp 1280w`} sizes="(max-width:760px) 100vw, 52vw" alt="绿色玻璃声波雕塑" fetchPriority="high" width="1280" height="720"/>
          <div className="hero-screen"><div className="screen-caption"><span>VOXELLE / WORKSPACE</span><span>真实界面 · 演示数据</span></div><img src={media+'app-queue.webp'} srcSet={`${media}app-queue-mobile.webp 720w, ${media}app-queue.webp 1440w`} sizes="(max-width:760px) 88vw, 46vw" alt="Voxelle 队列显示设计课程的识别进度和已完成字幕的导出结果" width="1440" height="1000"/></div>
          <div className="art-label">VOICE INTO WORDS<span>听见。记录。再发现。</span></div>
        </div>
      </section>
      <div className="format-band"><div className="wrap"><span>你的内容，你的工作流。</span><p>视频 / 音频 <b>→</b> 文字 / 字幕</p><span>TXT&nbsp; · &nbsp;SRT&nbsp; · &nbsp;VTT</span></div></div>
      <section className="workflow wrap" id="workflow">
        <div className="section-title" data-reveal><p className="kicker">少一点重复，多一点专注</p><h2>把回放的时间，<br/>留给真正的思考。</h2></div>
        <div className="steps">
          <article data-reveal><span className="step-index">01</span><div><h3>一个文件，或一组链接。</h3><p>添加本地视频、音频或整个文件夹。YouTube 和哔哩哔哩公开链接，也能一次导入多个。</p><div className="tags"><span>本地文件</span><span>文件夹</span><span>公开视频链接</span></div></div></article>
          <article data-reveal><span className="step-index">02</span><div><h3>有字幕，就先用字幕。</h3><p>优先人工字幕，其次自动字幕；没有字幕时，再提取音频交给你选择的 ASR 服务。按需使用，减少额外费用。</p><div className="route"><span>人工字幕</span><b>→</b><span>自动字幕</span><b>→</b><span>音频识别</span></div></div></article>
          <article data-reveal><span className="step-index">03</span><div><h3>带走你需要的文字。</h3><p>查看任务进度，按批次勾选输出格式。生成 TXT 后直接预览、复制全文，或选择一段带走。</p><div className="tags"><span>批量队列</span><span>格式可选</span><span>应用内复制</span></div></div></article>
        </div>
      </section>
      <section className="workspace" id="workspace">
        <div className="wrap"><div className="workspace-heading" data-reveal><h2>从声音到文字，<br/>每一步都看得见。</h2><p>任务、模型与输出，放在一个清楚的工作空间。<br/>画面来自当前软件，使用演示素材。</p></div>
          <figure className="wide-screen" data-reveal><img src={media+'app-import.webp'} alt="Voxelle 主界面，包含本地文件和公开视频链接导入" loading="lazy" width="1440" height="1000"/><figcaption><span>你的转写工作空间</span><span>Windows 桌面应用</span></figcaption></figure>
          <div className="detail-row" data-reveal><div className="detail-copy"><span className="detail-tag">模型由你选择</span><h3>保存多套配置。<br/>随时切换。</h3><p>Groq、Deepgram、OpenAI，或自定义兼容接口。为不同内容保存不同模型配置，密钥使用 Windows 系统加密保存。</p><p className="small-copy">Pi AI 文本排版可选，默认关闭。<br/>只处理文字，原始稿始终保留。</p></div><img src={media+'settings-detail.webp'} alt="模型设置中已保存日常转写、中文课程和英文访谈三套演示配置" loading="lazy" width="1120" height="770"/></div>
          <div className="detail-row reverse" data-reveal><div className="detail-copy"><span className="detail-tag">文字就在手边</span><h3>找到重点，<br/>复制到下一次创作。</h3><p>不必在文件夹里来回寻找。生成 TXT 的任务支持应用内预览，选择一段文字，或复制全文。</p><div className="format-choice"><strong>TXT</strong><span>SRT</span><span>VTT</span><small>每次导入，自由勾选</small></div></div><img src={media+'transcript-detail.webp'} alt="软件内的 TXT 预览窗口以及复制全文按钮" loading="lazy" width="960" height="530"/></div>
        </div>
      </section>
      <section className="download wrap" id="download" data-reveal>
        <div><p className="kicker">开始下一份文字稿</p><h2>把好内容<br/>留在手边。</h2><a className="button primary" href={download} download={release?.fileName}>下载 Windows 版 <span aria-hidden="true">↗</span></a><p className="download-note">Windows 10 / 11 · x64 · 安装包内含 FFmpeg</p></div>
        <div className="release-info"><h3>Voxelle for Windows</h3>{release ? <><dl><div><dt>版本</dt><dd>{release.version}</dd></div><div><dt>大小</dt><dd>{(release.bytes/1024/1024).toFixed(1)} MB</dd></div><div><dt>文件</dt><dd>{release.fileName}</dd></div></dl><div className="checksum"><div><span>SHA-256</span><button onClick={copyHash}>{copied ? '已复制' : '复制校验值'}</button></div><code tabIndex="0">{release.sha256}</code></div><p>云端转写需自备 API Key，可能产生服务商费用。公开链接的提取受平台规则与网络条件影响。</p></> : <p role="status">{error ? '安装包信息暂不可用，请重新构建网站后预览。' : '正在读取安装包信息…'}</p>}</div>
      </section>
      <section className="faq wrap" id="faq"><h2 data-reveal>开始前，你可能想知道。</h2><div>{faqs.map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">＋</span></summary><p>{a}</p></details>)}</div></section>
    </main>
    <footer className="wrap"><a className="wordmark" href="#"><span className="brand-glyph" aria-hidden="true"/>Voxelle</a><p>让声音留下文字。</p><a href="./media/voxelle-social.mp4" download>下载竖屏宣传片 ↗</a><span>© {new Date().getFullYear()} Voxelle</span></footer>
    <dialog className="film-dialog" ref={dialog} onCancel={e => { e.preventDefault(); close(); }} aria-label="Voxelle 宣传片"><button className="close-film" onClick={close}>关闭 ×</button><video ref={player} controls playsInline preload="none" poster={filmOpen ? media+'poster-main.jpg' : undefined} src={filmOpen ? media+'voxelle-main.mp4' : undefined}>你的浏览器不支持视频播放。</video><p>Voxelle · 40 秒产品短片 · <a href={media+'voxelle-main.mp4'} download>下载横屏宣传片 ↗</a></p></dialog>
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
