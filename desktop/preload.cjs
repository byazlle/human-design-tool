'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * 渲染层唯一可用的桌面能力入口。
 * 没有 Node 集成，全部经 ipcRenderer 白名单转发。
 */
contextBridge.exposeInMainWorld('hdDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '',

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onState: (handler) => {
      const listener = (_event, state) => handler(state)
      ipcRenderer.on('window:state', listener)
      return () => ipcRenderer.removeListener('window:state', listener)
    },
  },

  file: {
    save: (payload) => ipcRenderer.invoke('file:save', payload),
    open: () => ipcRenderer.invoke('file:open'),
  },
})
