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
    // 需求 #10：报告导出（按扩展名 filters / base64 二进制 / PDF 打印）
    saveReport: (payload) => ipcRenderer.invoke('file:save-report', payload),
    savePdf: (payload) => ipcRenderer.invoke('file:save-pdf', payload),
    // v3.0.0：批量解读选目录 + 静默逐份写 md
    defaultDir: () => ipcRenderer.invoke('dir:default'),
    pickDir: () => ipcRenderer.invoke('dir:pick'),
    writeInDir: (payload) => ipcRenderer.invoke('file:write-in-dir', payload),
  },

  /**
   * v2.5.0：AI 接口经主进程转发，绕开渲染进程的同源策略。
   *
   * 必要性：部分中转站不返回 CORS 响应头，渲染进程里带 Authorization 的
   * POST 会在预检阶段就被拒；主进程的 Chromium 网络栈没有同源限制。
   * 密钥只经 IPC 过一遍，主进程不落盘、不写日志。
   */
  ai: {
    request: (payload) => ipcRenderer.invoke('ai:request', payload),
    cancel: (id) => ipcRenderer.send('ai:cancel', id),
    // 发起流式请求；返回与 ai:request 完全相同形态的结果对象
    stream: (payload) => ipcRenderer.invoke('ai:stream', payload),
    // 订阅流式事件，返回取消订阅函数
    onStreamEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('ai:stream-event', listener)
      return () => ipcRenderer.removeListener('ai:stream-event', listener)
    },
  },
})
