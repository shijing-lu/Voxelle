const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'marketing', '.capture-profile'));
app.disableHardwareAcceleration();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 1000, useContentSize: true, show: false, webPreferences: { preload: path.join(__dirname, 'demo-preload.cjs'), contextIsolation: true, sandbox: true } });
  try {
    await win.loadFile(path.join(root, 'dist/renderer/index.html'));
    await wait(800);
    const capture = async name => { await wait(250); await fs.writeFile(path.join(__dirname, 'assets', name + '.png'), (await win.webContents.capturePage()).toPNG()); };
    await capture('app-import');
    await win.webContents.executeJavaScript("document.querySelector('main').scrollTop = document.querySelector('.tasks-panel').offsetTop - 110");
    await capture('app-queue');
    for (const progress of [12,28,46,64,82,100]) {
      await win.webContents.executeJavaScript(`window.desktop.demoProgress(${progress})`);
      await capture(`app-progress-${progress}`);
    }
    await win.webContents.executeJavaScript('window.desktop.demoProgress(72)');
    await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent === '查看/复制文本').click()");
    await capture('app-transcript');
    await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent === '关闭').click();document.querySelectorAll('nav button')[1].click()");
    await capture('app-settings');
    await win.webContents.executeJavaScript("document.querySelectorAll('nav button')[0].click()");
    await wait(150);
    await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent.includes('选择文件') && !b.textContent.includes('夹')).click()");
    await wait(300);
    await win.webContents.executeJavaScript("document.querySelector('main').scrollTop = document.querySelector('.pending-list').offsetTop - 160");
    await capture('app-files');
    await win.webContents.executeJavaScript("document.querySelector('.pending-list').parentElement.querySelectorAll('.format-picker input')[1].click()");
    await capture('app-files-two');
    await win.webContents.executeJavaScript("document.querySelector('.pending-list').parentElement.querySelectorAll('.format-picker input')[2].click()");
    await capture('app-files-all');
    console.log('Captured actual renderer screens and progress/format sequences with isolated demo fixtures.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  app.quit();
});
