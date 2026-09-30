// Local Chromium acceptance checks. Reads built artifacts; never accesses application userData.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'output');
app.setPath('userData', path.join(__dirname, '.capture-profile/site'));
app.commandLine.appendSwitch('remote-debugging-port', '9224');
app.disableHardwareAcceleration();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 1000, useContentSize: true, show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
  const results = [];
  const check = (name, pass, detail) => { results.push({ name, pass: Boolean(pass), detail }); if (!pass) throw new Error(name + ': ' + JSON.stringify(detail)); };
  try {
    await win.loadURL('http://127.0.0.1:4173');
    await wait(1400);
    await win.webContents.executeJavaScript('document.fonts.ready');
    const info = await win.webContents.executeJavaScript(`({overflow:document.documentElement.scrollWidth>innerWidth, buttons:[...document.querySelectorAll('a[download]')].map(a=>a.getAttribute('href')), release:document.querySelector('.release-info').textContent, font:document.fonts.check('600 16px "Space Grotesk"')})`);
    check('desktop layout and bundled font', !info.overflow && info.font && info.release.includes('0.1.0'), info);
    await fs.writeFile(path.join(output, 'site-desktop.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('.watch').click()`);
    await wait(900);
    const video = await win.webContents.executeJavaScript(`({open:document.querySelector('dialog').open,duration:document.querySelector('video').duration,width:document.querySelector('video').videoWidth,controls:document.querySelector('video').controls})`);
    check('main film playback', video.open && Math.abs(video.duration-40)<.1 && video.width===1920 && video.controls, video);
    await win.webContents.executeJavaScript(`document.querySelector('video').currentTime=11`);
    await wait(300);
    await fs.writeFile(path.join(output, 'site-video.png'), (await win.webContents.capturePage()).toPNG());
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await wait(150);
    const keyboard = await win.webContents.executeJavaScript(`!document.querySelector('dialog').open && document.activeElement.classList.contains('watch')`);
    check('Escape closes film and restores keyboard focus', keyboard);
    await win.webContents.executeJavaScript(`document.querySelector('summary').click()`);
    check('FAQ native disclosure activation', await win.webContents.executeJavaScript(`document.querySelector('details').open`));
    win.setContentSize(390,844);
    await win.webContents.executeJavaScript('scrollTo(0,0)');
    await wait(400);
    const mobile = await win.webContents.executeJavaScript(`({width:innerWidth,scroll:document.documentElement.scrollWidth,downloadVisible:document.querySelector('.hero-actions .button').getBoundingClientRect().bottom<innerHeight})`);
    check('390px mobile layout and first-screen download', mobile.scroll<=mobile.width && mobile.downloadVisible, mobile);
    await fs.writeFile(path.join(output, 'site-mobile.png'), (await win.webContents.capturePage()).toPNG());
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const motion = await win.webContents.executeJavaScript(`({query:matchMedia('(prefers-reduced-motion: reduce)').matches,animation:getComputedStyle(document.querySelector('.hero-copy')).animationName,behavior:getComputedStyle(document.documentElement).scrollBehavior})`);
    check('reduced motion', motion.query && motion.animation==='none' && motion.behavior==='auto', motion);
    win.webContents.debugger.detach();
    const meta=JSON.parse(await fs.readFile(path.join(root, 'site/dist/release.json'), 'utf8'));
    const response=await fetch('http://127.0.0.1:4173/'+encodeURI(meta.url));
    const hash=createHash('sha256'); let bytes=0;
    for await(const chunk of response.body) { hash.update(chunk); bytes+=chunk.length; }
    check('actual installer download and SHA-256', response.ok && bytes===meta.bytes && hash.digest('hex')===meta.sha256, { status:response.status,bytes,expected:meta.bytes });
    await fs.writeFile(path.join(output, 'site-verification.json'), JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } catch(error) { console.error(error); await fs.writeFile(path.join(output,'site-verification.json'),JSON.stringify({results,error:String(error)},null,2)); process.exitCode=1; }
  app.quit();
});
