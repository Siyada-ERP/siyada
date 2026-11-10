'use strict';
// جسر صغير بين نافذة «اتصال بسيرفر» والبرنامج الرئيسي (بدون صلاحيات Node داخل الصفحة)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('siyadaDesktop', {
  current: () => ipcRenderer.invoke('srv:current'),
  connect: url => ipcRenderer.invoke('srv:connect', url),
  local: () => ipcRenderer.invoke('srv:local'),
  close: () => ipcRenderer.invoke('srv:close')
});
