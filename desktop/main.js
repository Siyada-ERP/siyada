'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, net, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;
autoUpdater.logger = require('electron-log');

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.logger.info('[updates] checking for updates');
  autoUpdater.checkForUpdates().catch(error => {
    autoUpdater.logger.error('[updates] check failed:', error);
    dialog.showErrorBox('تحديث SIYADA', 'تعذر التحقق من التحديثات:\n' + error.message);
  });
}

autoUpdater.on('update-available', async info => {
  const choice = await dialog.showMessageBox({
    type: 'info',
    buttons: ['تنزيل التحديث', 'لاحقًا'],
    defaultId: 0,
    cancelId: 1,
    title: 'تحديث SIYADA',
    message: 'يوجد إصدار جديد من SIYADA (' + info.version + '). هل تريد تنزيله الآن؟'
  });
  if (choice.response === 0) autoUpdater.downloadUpdate().catch(error => {
    dialog.showErrorBox('تحديث SIYADA', 'تعذر تنزيل التحديث: ' + error.message);
  });
});

autoUpdater.on('update-downloaded', async () => {
  const choice = await dialog.showMessageBox({
    type: 'info',
    buttons: ['إعادة التشغيل والتحديث', 'لاحقًا'],
    defaultId: 0,
    cancelId: 1,
    title: 'تحديث SIYADA جاهز',
    message: 'تم تنزيل التحديث. أعد تشغيل البرنامج لتثبيته.'
  });
  if (choice.response === 0) autoUpdater.quitAndInstall();
});

autoUpdater.on('download-progress', progress => {
  autoUpdater.logger.info('[updates] download', Math.round(progress.percent) + '%', progress.bytesPerSecond, progress.transferred, progress.total);
});

autoUpdater.on('error', error => {
  autoUpdater.logger.error('[updates] error:', error);
  dialog.showErrorBox('تحديث SIYADA', 'فشل تنزيل أو تثبيت التحديث:\n' + error.message);
});

/* ---------- إعداد الاتصال بالسيرفر (اختياري) ----------
   بدون سيرفر: البرنامج يفتح ملف SIYADA.html المحلي (جهاز واحد).
   مع سيرفر: يفتح نفس البرنامج من عنوان السيرفر، فيشتغل الدخول بالإيميل وتسجيل الخروج والمزامنة بين الأجهزة. */
const APP_HTML = path.join(__dirname, '..', 'dist', 'SIYADA.html');
const cfgFile = () => path.join(app.getPath('userData'), 'siyada-desktop.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) || {}; } catch (e) { return {}; } }
function writeCfg(c) { try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 1)); } catch (e) { autoUpdater.logger.error('[cfg] write failed:', e); } }
function normUrl(raw) {
  let v = String(raw || '').trim(); if (!v) throw new Error('اكتب عنوان السيرفر.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(v) ? 'http://' : 'https://') + v;
  const u = new URL(v); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('العنوان لازم يبدأ بـ http أو https.');
  return u.origin;
}
async function pingServer(origin) {
  try {
    const r = await net.fetch(origin + '/api/ping', { cache: 'no-store' });
    if (!r.ok) return 'السيرفر رد بخطأ ' + r.status + '.';
    const j = await r.json(); if (j && j.app === 'siyada-server') return '';
    return 'العنوان ده مش سيرفر SIYADA.';
  } catch (e) { return 'مقدرتش أوصل للعنوان ده. اتأكد من العنوان ومن الإنترنت أو الشبكة.'; }
}

let mainWin = null, srvWin = null;

function loadContent(win) {
  const origin = readCfg().serverUrl;
  const p = origin ? win.loadURL(origin) : win.loadFile(APP_HTML);
  p.catch(() => { /* الأخطاء بتتعالج في did-fail-load */ });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'SIYADA',
    autoHideMenuBar: false,
    backgroundColor: '#0f1f3d',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWin = win;
  win.on('closed', () => { if (mainWin === win) mainWin = null; });

  // روابط خارجية (واتساب وغيره) تتفتح في المتصفح، مش جوه البرنامج
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const cur = win.webContents.getURL();
    try { if (new URL(url).origin === new URL(cur).origin && new URL(url).protocol !== 'file:') return; } catch (x) { }
    if (url.startsWith('file:') && cur.startsWith('file:')) return;
    e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  // السيرفر مش متاح: اسأل المستخدم بدل شاشة بيضا
  let asking = false;
  win.webContents.on('did-fail-load', async (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3 || asking) return;   // -3 = اتلغى
    const origin = readCfg().serverUrl; if (!origin) return;
    asking = true;
    const r = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['إعادة المحاولة', 'تغيير عنوان السيرفر', 'العمل على الجهاز بدون سيرفر'], defaultId: 0, cancelId: 0, noLink: true,
      title: 'SIYADA', message: 'تعذر الاتصال بالسيرفر', detail: origin + '\n' + desc
    });
    asking = false;
    if (r.response === 0) loadContent(win);
    else if (r.response === 1) openServerWindow();
    else { writeCfg(Object.assign(readCfg(), { serverUrl: '' })); loadContent(win); }
  });

  loadContent(win);
}

function openServerWindow() {
  if (srvWin && !srvWin.isDestroyed()) { srvWin.focus(); return; }
  srvWin = new BrowserWindow({
    width: 560, height: 470, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true,
    parent: mainWin || undefined, modal: !!mainWin, title: 'اتصال بسيرفر SIYADA',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  srvWin.setMenu(null);
  srvWin.loadFile(path.join(__dirname, 'server.html'));
  srvWin.on('closed', () => { srvWin = null; });
}

ipcMain.handle('srv:current', () => readCfg().serverUrl || '');
ipcMain.handle('srv:connect', async (_e, raw) => {
  let origin; try { origin = normUrl(raw); } catch (e) { return { ok: false, error: e.message }; }
  const bad = await pingServer(origin); if (bad) return { ok: false, error: bad };
  writeCfg(Object.assign(readCfg(), { serverUrl: origin }));
  if (srvWin) srvWin.close();
  if (mainWin) loadContent(mainWin); else createWindow();
  return { ok: true };
});
ipcMain.handle('srv:local', () => {
  writeCfg(Object.assign(readCfg(), { serverUrl: '' }));
  if (srvWin) srvWin.close();
  if (mainWin) loadContent(mainWin); else createWindow();
  return { ok: true };
});
ipcMain.handle('srv:close', () => { if (srvWin) srvWin.close(); });

function buildMenu() {
  const t = [
    {
      label: 'SIYADA',
      submenu: [
        { label: 'اتصال بسيرفر الشركة (حساب بالإيميل)…', click: openServerWindow },
        { label: 'العمل على هذا الجهاز بدون سيرفر', click: () => { writeCfg(Object.assign(readCfg(), { serverUrl: '' })); if (mainWin) loadContent(mainWin); } },
        { type: 'separator' },
        { label: 'تحديث الصفحة', accelerator: 'CmdOrCtrl+R', click: () => { if (mainWin) mainWin.webContents.reload(); } },
        { label: 'التحقق من التحديثات', click: () => checkForUpdates() },
        { type: 'separator' },
        { label: 'خروج', accelerator: 'Alt+F4', role: 'quit' }
      ]
    },
    {
      label: 'عرض',
      submenu: [
        { label: 'تكبير', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'تصغير', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'الحجم الطبيعي', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'ملء الشاشة', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setTimeout(checkForUpdates, 3000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
