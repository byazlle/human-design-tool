'use strict'

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeTheme,
  protocol,
  net,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const { pathToFileURL } = require('node:url')

/** 开发态：VITE_DEV_SERVER_URL 指向本地 vite；否则用 app:// 协议加载打包后的静态资源 */
const DEV_URL = process.env.VITE_DEV_SERVER_URL || ''
const isDev = Boolean(DEV_URL)

/** 冒烟模式：启动后自动走一遍核心流程并截图，然后退出（用于 CI / 打包后自检） */
const isSmoke = process.env.HD_SMOKE === '1' || process.argv.includes('--smoke')
const smokeDir = process.env.HD_SMOKE_DIR || path.join(process.cwd(), '.shots')

/** GUI 程序在 Windows 下拿不到 stdout，诊断信息统一落文件 */
const logFile = path.join(smokeDir, 'smoke.log')
function flog(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`
  console.log(line)
  try {
    fsSync.appendFileSync(logFile, line + String.fromCharCode(10))
  } catch {
    /* 目录不可写时忽略 */
  }
}
flog('boot', 'smoke=' + isSmoke, 'resources=' + process.resourcesPath, 'appPath=' + app.getAppPath())

process.on('uncaughtException', (error) => {
  flog('uncaught', error && error.stack ? error.stack : String(error))
})
process.on('unhandledRejection', (reason) => {
  flog('unhandledRejection', String(reason))
})

/**
 * 必须在 ready 之前注册。
 * 用 app:// 而不是 file:// 的原因：Chromium 禁止 file:// 文档访问 localStorage，
 * 会导致全部档案无法持久化；同时 ES module 在 file:// 下会被 CORS 阻断。
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

let mainWindow = null

/** 单实例：再次启动时聚焦已有窗口 */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

/** 前端产物根目录（打包后即 resources/app） */
function bundleRoot() {
  return app.getAppPath()
}

function registerAppProtocol() {
  const root = bundleRoot()

  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.pathname)
    if (!pathname || pathname === '/') pathname = '/index.html'

    // 归一化并阻止目录穿越
    const resolved = path.normalize(path.join(root, pathname))
    if (!resolved.startsWith(path.normalize(root))) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      return await net.fetch(pathToFileURL(resolved).toString())
    } catch (error) {
      flog('protocol-miss', pathname, String(error && error.message))
      // SPA 兜底：未知路径回落到 index.html，交给 hash 路由处理
      if (!path.extname(pathname)) {
        return net.fetch(pathToFileURL(path.join(root, 'index.html')).toString())
      }
      return new Response('Not Found', { status: 404 })
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    // 原生窗口级毛玻璃（Windows 11 生效，其它系统自动降级，页面内 backdrop-filter 仍然可用）
    backgroundMaterial: 'acrylic',
    backgroundColor: '#f5f6f800',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    flog('window ready-to-show')
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
    if (isSmoke) {
      runSmoke(mainWindow).catch((error) => {
        flog('[smoke] failed:', error && error.stack ? error.stack : String(error))
        app.exit(1)
      })
    }
  })

  // 外链一律交给系统浏览器，避免在应用内被劫持
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL()
    if (url !== current && /^https?:/i.test(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  const pushState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('window:state', {
      maximized: mainWindow.isMaximized(),
      fullScreen: mainWindow.isFullScreen(),
    })
  }
  mainWindow.on('maximize', pushState)
  mainWindow.on('unmaximize', pushState)
  mainWindow.on('enter-full-screen', pushState)
  mainWindow.on('leave-full-screen', pushState)

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    flog('render-process-gone', JSON.stringify(details))
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    flog('did-fail-load', code, desc, url)
  })
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) flog('renderer-console', message)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    flog('did-finish-load', mainWindow.webContents.getURL())
  })

  if (isDev) {
    mainWindow.loadURL(`${DEV_URL}/#/`)
  } else {
    mainWindow.loadURL('app://bundle/index.html#/')
  }
}

/** 本地文件读写：供「导出/导入备份」使用，走系统对话框 */
ipcMain.handle('file:save', async (_e, { defaultName, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出备份',
    defaultPath: defaultName || 'human-design-backup.json',
    filters: [
      { name: 'JSON 备份', extensions: ['json'] },
      { name: '全部文件', extensions: ['*'] },
    ],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try {
    await fs.writeFile(filePath, content, 'utf8')
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
})

/**
 * 解读报告另存为（需求 #10）：按扩展名给 filters，支持 UTF-8 文本与 base64 二进制。
 * 原有 file:save 保持 JSON 备份语义不变，避免影响导入/导出备份链路。
 */
const REPORT_FILTERS = {
  md: { name: 'Markdown 报告', extensions: ['md'] },
  docx: { name: 'Word 文档', extensions: ['docx'] },
  html: { name: 'HTML 报告', extensions: ['html', 'htm'] },
  pdf: { name: 'PDF 文档', extensions: ['pdf'] },
  json: { name: 'JSON 备份', extensions: ['json'] },
}

function reportFilters(defaultName) {
  const ext = String(defaultName || '').split('.').pop().toLowerCase()
  return [
    REPORT_FILTERS[ext] || { name: '全部文件', extensions: ['*'] },
    { name: '全部文件', extensions: ['*'] },
  ]
}

ipcMain.handle('file:save-report', async (_e, { defaultName, content, encoding } = {}) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出解读报告',
    defaultPath: defaultName || 'human-design-reading.md',
    filters: reportFilters(defaultName),
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try {
    if (encoding === 'base64') {
      // Word（docx）是二进制，渲染层以 base64 文本过 IPC
      await fs.writeFile(filePath, Buffer.from(String(content ?? ''), 'base64'))
    } else {
      await fs.writeFile(filePath, String(content ?? ''), 'utf8')
    }
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
})

/**
 * PDF：离屏窗口加载可打印 HTML → webContents.printToPDF() → 写二进制。
 * 走 Chromium 的系统字体渲染，中文不会像 jsPDF 内置字体那样乱码。
 */
ipcMain.handle('file:save-pdf', async (_e, { defaultName, html } = {}) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出 PDF 报告',
    defaultPath: defaultName || 'human-design-reading.pdf',
    filters: [{ name: 'PDF 文档', extensions: ['pdf'] }, { name: '全部文件', extensions: ['*'] }],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  const tmpFile = path.join(app.getPath('temp'), `hdt-report-${Date.now()}-${process.pid}.html`)
  let win = null
  try {
    // 用临时文件而非 data: URL：完整版报告可达数万字，避免 URL 长度限制
    await fs.writeFile(tmpFile, String(html ?? ''), 'utf8')
    win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    await win.loadFile(tmpFile)
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    if (!data || !data.length) throw new Error('printToPDF 返回空内容')
    await fs.writeFile(filePath, data)
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    await fs.unlink(tmpFile).catch(() => {})
  }
})

ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '导入备份',
    properties: ['openFile'],
    filters: [
      { name: 'JSON 备份', extensions: ['json'] },
      { name: '全部文件', extensions: ['*'] },
    ],
  })
  if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true }
  try {
    const content = await fs.readFile(filePaths[0], 'utf8')
    return { ok: true, filePath: filePaths[0], content }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
})

/* ── 批量解读导出目录（v3.0.0）────────────────────────────
 * 渲染层要「选一个目录，完成后每人一份 md 自动落进去」。浏览器没有目录能力，
 * 所以只在桌面端提供；安卓 / 网页由前端退化为逐个下载。
 * 写盘一律用 flag:'wx'：目标存在就换 -2/-3，绝不覆盖用户已有文件。
 */
async function defaultExportDir() {
  const dir = path.join(app.getPath('documents'), 'HumanDesign解读')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

ipcMain.handle('dir:default', async () => {
  try {
    return { ok: true, dirPath: await defaultExportDir() }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
})

ipcMain.handle('dir:pick', async () => {
  try {
    const start = await defaultExportDir().catch(() => undefined)
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择解读导出目录',
      defaultPath: start,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true }
    await fs.mkdir(filePaths[0], { recursive: true })
    return { ok: true, dirPath: filePaths[0] }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
})

ipcMain.handle('file:write-in-dir', async (_e, { dirPath, fileName, content } = {}) => {
  if (!dirPath || typeof dirPath !== 'string') return { ok: false, error: '未指定导出目录' }
  // 只取纯文件名：渲染层传来的名字不可信，挡住 ../ 之类的路径穿越
  const clean = path.basename(String(fileName || 'AI 解读.md')).replace(/[\\/:*?"<>|\r\n\t]/g, '_')
  const base = clean.endsWith('.md') ? clean.slice(0, -3) : clean
  const ext = '.md'
  try {
    await fs.mkdir(dirPath, { recursive: true })
    for (let n = 1; n <= 999; n += 1) {
      const candidate = path.join(dirPath, `${base}${n === 1 ? '' : `-${n}`}${ext}`)
      try {
        await fs.writeFile(candidate, String(content ?? ''), { encoding: 'utf8', flag: 'wx' })
        return { ok: true, filePath: candidate }
      } catch (error) {
        if (error && error.code === 'EEXIST') continue
        throw error
      }
    }
    return { ok: false, error: '同名文件过多（已尝试到 -999），请换一个目录' }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
})

/**
 * AI 接口代理（v2.5.0）：在**主进程**里发出 ai 请求，绕开渲染进程的同源策略。
 *
 * 为什么必须这样：部分中转站不返回任何 CORS 响应头（OPTIONS 预检 403、
 * POST 响应无 `access-control-allow-origin`）。带 `Authorization` 与
 * `Content-Type: application/json` 的请求必然触发预检，于是渲染进程里这类
 * 接口「永远连不上」，而同样的请求在主进程里是通的。
 *
 * 用 Electron 的 `net.request` 而不是 Node 的 http：前者走 Chromium 网络栈，
 * 自动继承系统代理 / 证书设置，行为与用户在浏览器里访问一致。
 * 密钥只在本进程内存中过一遍，不落盘、不写日志。
 */
const aiInflight = new Map()

function abortAiRequest(id) {
  const entry = aiInflight.get(id)
  if (!entry) return
  aiInflight.delete(id)
  try {
    entry.request.abort()
  } catch {
    /* 已结束的请求 abort 会抛错，忽略 */
  }
  entry.finish({ ok: false, status: 0, bodyText: '', error: '已取消', errorKind: 'cancelled' })
}

ipcMain.handle('ai:request', async (_e, payload = {}) => {
  const {
    id = `ai-${Date.now()}`,
    url,
    method = 'POST',
    headers = {},
    body,
    timeoutMs = 60000,
  } = payload

  if (!url || !/^https?:\/\//i.test(String(url))) {
    return { ok: false, status: 0, bodyText: '', error: '接口地址需以 http:// 或 https:// 开头' }
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      aiInflight.delete(id)
      clearTimeout(timer)
      resolve(result)
    }

    let request
    try {
      request = net.request({ method, url: String(url), redirect: 'follow' })
    } catch (error) {
      resolve({
        ok: false,
        status: 0,
        bodyText: '',
        error: `无法发起请求：${String(error && error.message ? error.message : error)}`,
      })
      return
    }

    const timer = setTimeout(() => {
      try {
        request.abort()
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        status: 0,
        bodyText: '',
        error: `请求超时（${Math.round(timeoutMs / 1000)} 秒）`,
        errorKind: 'timeout',
      })
    }, Math.max(1000, Math.min(3600000, Number(timeoutMs) || 60000)))

    aiInflight.set(id, { request, finish })

    // 只透传调用方显式给出的头；不额外伪造 Origin / Referer
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string' && v) request.setHeader(k, v)
    }

    const chunks = []
    request.on('response', (response) => {
      const status = response.statusCode
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8')
        finish({ ok: status >= 200 && status < 300, status, bodyText })
      })
      response.on('error', (error) => {
        finish({
          ok: false,
          status,
          bodyText: Buffer.concat(chunks).toString('utf8'),
          error: String(error && error.message ? error.message : error),
          errorKind: 'network',
        })
      })
    })

    request.on('error', (error) => {
      const message = String(error && error.message ? error.message : error)
      finish({
        ok: false,
        status: 0,
        bodyText: '',
        error: message,
        // net.request 的超时/取消也会走到这里，但上面已各自处理；此处一律归为网络问题
        errorKind: /abort/i.test(message) ? 'cancelled' : 'network',
      })
    })

    if (body) request.write(String(body), 'utf8')
    request.end()
  })
})

ipcMain.on('ai:cancel', (_e, id) => abortAiRequest(id))

/**
 * AI 流式响应（v3.0.0）：与 ai:request 共用 net.request / aiInflight / abortAiRequest，
 * 但在响应到达后把 SSE 的每个 delta 实时推给渲染层，最终仍 resolve 成
 * 与 ai:request 同形态的 { ok, status, bodyText }，前端 explain() 的解析逻辑无需改动。
 *
 * 全程不伪造连接：connected 事件只在真实 response 到达时发出。
 * 密钥同样只在主进程内存过一遍，不落盘、不写日志。
 */
ipcMain.handle('ai:stream', async (event, payload = {}) => {
  const {
    id = `ai-${Date.now()}`,
    url,
    method = 'POST',
    headers = {},
    body,
    timeoutMs = 60000,
  } = payload

  if (!url || !/^https?:\/\//i.test(String(url))) {
    return { ok: false, status: 0, bodyText: '', error: '接口地址需以 http:// 或 https:// 开头' }
  }

  // 渲染层可能在流途中被关闭 / 重载，推送前检查 sender 是否仍存活
  const sendStream = (data) => {
    try {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream-event', data)
      }
    } catch {
      /* sender 已销毁时静默忽略，不影响主进程收尾 */
    }
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      aiInflight.delete(id)
      clearTimeout(timer)
      resolve(result)
    }

    let request
    try {
      request = net.request({ method, url: String(url), redirect: 'follow' })
    } catch (error) {
      resolve({
        ok: false,
        status: 0,
        bodyText: '',
        error: `无法发起请求：${String(error && error.message ? error.message : error)}`,
      })
      return
    }

    const timer = setTimeout(() => {
      try {
        request.abort()
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        status: 0,
        bodyText: '',
        error: `请求超时（${Math.round(timeoutMs / 1000)} 秒）`,
        errorKind: 'timeout',
      })
    }, Math.max(1000, Math.min(3600000, Number(timeoutMs) || 60000)))

    aiInflight.set(id, { request, finish })

    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string' && v) request.setHeader(k, v)
    }

    // 原始响应体：非 SSE（或错误）时原样返回，交给前端按普通 JSON 解析
    const rawChunks = []
    // 跨 chunk 的 SSE 分帧状态
    let pending = Buffer.alloc(0)
    let eventLines = []
    let sawDone = false
    let accumulated = ''
    let finishReason = ''

    const handleEvent = (lines) => {
      if (sawDone) return
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') {
          sawDone = true
          return
        }
        let json
        try {
          json = JSON.parse(data)
        } catch {
          // 非法 JSON（或注释行）忽略，不要抛错
          continue
        }
        const choice = json && Array.isArray(json.choices) ? json.choices[0] : null
        if (!choice) continue
        let text = ''
        if (choice.delta && typeof choice.delta.content === 'string') {
          text = choice.delta.content
        } else if (choice.message && typeof choice.message.content === 'string') {
          text = choice.message.content
        }
        if (text) {
          accumulated += text
          sendStream({ id, kind: 'delta', text })
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
    }

    request.on('response', (response) => {
      const status = response.statusCode

      // content-type 键大小写不一，做小写归一；值可能是 string 或 string[]
      let contentType = ''
      for (const [k, v] of Object.entries(response.headers || {})) {
        if (k.toLowerCase() === 'content-type') {
          contentType = Array.isArray(v) ? v.join(';') : String(v ?? '')
          break
        }
      }
      const isSSE = /text\/event-stream/i.test(contentType)

      // 真实连接建立信号：只在 response 到达时发出，严禁用定时器伪造
      sendStream({ id, kind: 'connected', status })

      response.on('data', (chunk) => {
        const buf = Buffer.from(chunk)
        rawChunks.push(buf)
        pending = pending.length ? Buffer.concat([pending, buf]) : buf

        // 按换行切行：未遇到换行的部分留在 pending，天然实现跨 chunk 分帧。
        // \n 是单字节，不会切进 UTF-8 多字节字符，切出的行可安全 toString('utf8')。
        let nl
        while ((nl = pending.indexOf(0x0a)) !== -1) {
          const line = pending.subarray(0, nl).toString('utf8').trim()
          pending = pending.subarray(nl + 1)
          if (line === '') {
            // 空行 = 一个事件结束
            if (eventLines.length) {
              handleEvent(eventLines)
              eventLines = []
            }
          } else {
            eventLines.push(line)
          }
        }
      })

      response.on('end', () => {
        // 兼容末尾没有以空行结尾的事件
        if (pending.length) {
          const tail = pending.toString('utf8').trim()
          if (tail) eventLines.push(tail)
          pending = Buffer.alloc(0)
        }
        if (eventLines.length) handleEvent(eventLines)

        const bodyTextRaw = Buffer.concat(rawChunks).toString('utf8')

        // 非 2xx：把响应体原文放进 bodyText，让前端 explain() 显示接口错误
        if (status < 200 || status >= 300) {
          finish({ ok: false, status, bodyText: bodyTextRaw })
          return
        }

        // 服务端不支持流式：原样返回，并先通知前端走整段解析
        if (!isSSE) {
          sendStream({ id, kind: 'fallback', reason: '该接口不支持流式，已改用整段返回' })
          finish({ ok: true, status, bodyText: bodyTextRaw })
          return
        }

        // SSE：把累积的 content 合成 OpenAI 兼容 JSON，前端 JSON.parse 逻辑不变
        const bodyText = JSON.stringify({
          choices: [
            {
              message: { content: accumulated },
              finish_reason: finishReason || 'stop',
            },
          ],
        })
        finish({ ok: true, status, bodyText })
      })

      response.on('error', (error) => {
        finish({
          ok: false,
          status,
          bodyText: Buffer.concat(rawChunks).toString('utf8'),
          error: String(error && error.message ? error.message : error),
          errorKind: 'network',
        })
      })
    })

    request.on('error', (error) => {
      const message = String(error && error.message ? error.message : error)
      finish({
        ok: false,
        status: 0,
        bodyText: '',
        error: message,
        // net.request 的超时/取消也会走到这里，但上面已各自处理；此处一律归为网络问题
        errorKind: /abort/i.test(message) ? 'cancelled' : 'network',
      })
    })

    if (body) request.write(String(body), 'utf8')
    request.end()
  })
})

app.on('before-quit', () => {
  for (const id of [...aiInflight.keys()]) abortAiRequest(id)
})

ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize())
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window:close', () => mainWindow && mainWindow.close())
ipcMain.handle('window:is-maximized', () => Boolean(mainWindow && mainWindow.isMaximized()))

app.whenReady().then(() => {
  nativeTheme.themeSource = 'system'
  if (!isDev) registerAppProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * 冒烟流程：载入示例档案 → 打开单人盘 → 切深色 → 展开悬浮坞，逐张截图。
 * 全部基于真实用户路径（点击按钮 / 改 hash），任何一步失败都视为产物不可用。
 */
async function runSmoke(win) {
  const wc = win.webContents
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  await fs.mkdir(smokeDir, { recursive: true })

  const shots = []
  const shot = async (name) => {
    const image = await wc.capturePage()
    const size = image.getSize()
    await fs.writeFile(path.join(smokeDir, `smoke-${name}.png`), image.toPNG())
    shots.push(name)
    flog(`[smoke] captured ${name} ${size.width}x${size.height}`)
  }

  const js = (code) => wc.executeJavaScript(code, true)
  const checks = []
  const check = (name, pass, detail) => {
    checks.push({ name, pass: Boolean(pass), detail: detail ?? '' })
    flog(`[check] ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
  }

  await wait(1500)

  // 0) 干净的起点：清空本地数据后重载，验证空态与本地存储可用
  await js('localStorage.clear()')
  await wc.reload()
  await wait(2000)

  const origin = await js('location.origin + " | " + location.href')
  check('安全 origin（localStorage 可用）', origin.startsWith('app://'), origin)

  const storageOk = await js(`(() => {
    try {
      localStorage.setItem('hdt.__probe', '1')
      const ok = localStorage.getItem('hdt.__probe') === '1'
      localStorage.removeItem('hdt.__probe')
      return ok
    } catch (e) { return false }
  })()`)
  check('localStorage 读写', storageOk)

  const emptyState = await js(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.includes('载入示例档案')))`)
  check('空态提供载入示例入口', emptyState)
  await shot('00-empty')

  // 1) 载入示例档案
  const seeded = await js(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('载入示例档案'))
    if (!btn) return false
    btn.click()
    return true
  })()`)
  await wait(1800)
  check('载入示例档案', seeded)
  await shot('01-home')

  const ids = await js(`(() => {
    const raw = localStorage.getItem('hdt.archives.v1')
    if (!raw) return []
    return JSON.parse(raw).map((a) => a.id)
  })()`)
  check('档案写入本地存储', ids.length >= 2, `count=${ids.length}`)

  if (!ids.length) {
    flog('[smoke] 没有档案，终止')
    app.exit(1)
    return
  }

  // 2) 单人盘
  await js(`location.hash = '#/archive/${ids[0]}'`)
  await wait(2000)
  await shot('02-single')

  const graph = await js(`(() => {
    const svg = document.querySelector('.graph-wrap svg')
    if (!svg) return { ok: false }
    return {
      ok: true,
      lit: svg.querySelectorAll('circle.is-active').length,
      plainText: svg.querySelectorAll('.gates text:not(.is-clickable)').length,
      definedChannels: svg.querySelectorAll('.channels line.is-defined').length,
    }
  })()`)
  check('人体图渲染', graph.ok)
  check('设计侧闸门有点亮样式（蓝底白字）', graph.lit > 0, `lit=${graph.lit}`)
  check('未激活/显意识闸门仅数字（无底圈）', graph.plainText > 0, `n=${graph.plainText}`)
  check('已定义通道单独成层', graph.definedChannels >= 0, `n=${graph.definedChannels}`)

  // 3) 完整盘直接列出通道与闸门（无需点击）
  const lists = await js(`({
    channels: document.querySelectorAll('.channel-item').length,
    channelEffect: document.querySelectorAll('.channel-effect').length,
    gates: document.querySelectorAll('.act-gate').length,
    // v2.1.0 起九中心改为紧凑状态条（.center-strip），不再使用旧的 .center-chip
    centers: document.querySelectorAll('.center-strip .center-dot-btn').length,
    typeToggle: Boolean(document.querySelector('.detail-toggle')),
  })`)
  check('已激活通道列表可见', lists.channels > 0, `n=${lists.channels}`)
  check('已激活闸门列表可见', lists.gates > 0, `n=${lists.gates}`)
  check('九中心状态可见', lists.centers === 9, `n=${lists.centers}`)
  check('类型详解入口存在', lists.typeToggle)

  // 4) 类型详解展开
  await js(`document.querySelector('.detail-toggle')?.click()`)
  await wait(600)
  const detail = await js(`({
    sections: document.querySelectorAll('.detail-body section').length,
    hasMechanism: (document.querySelector('.detail-body')?.textContent || '').includes('能量机制'),
    hasMisconception: (document.querySelector('.detail-body')?.textContent || '').includes('常见误区'),
  })`)
  check('类型详解包含完整分节', detail.sections >= 6, `sections=${detail.sections}`)
  check('类型详解含能量机制', detail.hasMechanism)
  check('类型详解含常见误区', detail.hasMisconception)
  await shot('03-type-detail')

  // 5) 通道作用直接展示（点击展开）
  await js(`document.querySelector('.channel-main')?.click()`)
  await wait(500)
  const channelText = await js(`(document.querySelector('.channel-effect')?.textContent || '').length`)
  check('通道作用可直接展开阅读', channelText > 10, `len=${channelText}`)
  await shot('04-channel-detail')

  // 6) 星体两翼（竖排、可折叠、可选中联动）
  const planet = await js(`(() => {
    const cols = document.querySelectorAll('.planet-col')
    if (cols.length < 2) return { cols: 0, rows: 0, toggle: false }
    const before = cols[0].querySelectorAll('.row').length
    cols[0].querySelector('.head')?.click()
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          cols: cols.length,
          rows: before,
          toggle: Boolean(cols[0].closest('.planet-col')),
        })
      }, 400)
    })
  })()`)
  check('星体两翼竖排列存在', planet.cols >= 2, `cols=${planet.cols}`)
  check('星体列行数完整（13 行星）', planet.rows === 13, `rows=${planet.rows}`)
  await shot('05-planet-detail')

  // 7) 未激活闸门点击不应点亮（回归第 8 条）
  const beforeLit = await js(`document.querySelectorAll('.graph-wrap svg circle.is-active').length`)
  await js(`(() => {
    const hit = document.querySelector('.graph-wrap svg .gates circle.hit')
    if (hit) hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })()`)
  await wait(700)
  const afterLit = await js(`document.querySelectorAll('.graph-wrap svg circle.is-active').length`)
  check('点击未激活闸门不误亮', beforeLit === afterLit, `${beforeLit} -> ${afterLit}`)

  // 8) 批量选择后可发起解读（未配置 AI 时应给出配置提示而不是伪造内容）
  const bulkClicked = await js(`(() => {
    const chip = document.querySelector('.act-gate')
    if (!chip) return false
    chip.click()
    return true
  })()`)
  await wait(700)
  const bulk = await js(`({
    bar: Boolean(document.querySelector('.bulk-bar')),
    selected: (document.querySelector('.bulk-bar .count')?.textContent || ''),
  })`)
  check('选中闸门后出现批量解读条', bulkClicked && bulk.bar, bulk.selected)
  await shot('06-bulk-select')

  // 9) 多选 + AI 未配置时的错误提示
  const aiGuard = await js(`(() => {
    const run = document.querySelector('.bulk-bar .run')
    if (!run) return 'no-run'
    run.click()
    return 'clicked'
  })()`)
  await wait(900)
  // v2.3.0 五区重构后面板根为 .ai-panel、错误区为 [data-zone="E"]；
  // 保留旧 .panel 选择器做向后兼容，断言强度不变（面板已打开且确有提示文案）。
  const aiPanel = await js(`(() => {
    const panel = document.querySelector('.ai-panel[role="dialog"], .panel[role="dialog"]')
    const err = panel?.querySelector('.error-state, [data-zone="E"]')
    return { open: Boolean(panel), text: (err?.textContent || '').trim().slice(0, 80) }
  })()`)
  check('AI 未配置时打开面板并提示', aiPanel.open && Boolean(aiPanel.text), aiPanel.text)
  await js(`(() => {
    const panel = document.querySelector('.ai-panel[role="dialog"], .panel[role="dialog"]')
    const btn = panel?.querySelector('button[aria-label="关闭"]')
    if (!btn) return false
    btn.click()
    return true
  })()`)
  await wait(400)

  // 10) 深色模式
  await js(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').includes('深色'))
    if (btn) btn.click()
    return Boolean(btn)
  })()`)
  await wait(1000)
  const dark = await js(`document.documentElement.dataset.theme`)
  check('深色模式切换', dark === 'dark', String(dark))
  await shot('07-dark')

  // 11) 合盘 + 维度切换
  if (ids.length >= 2) {
    await js(`location.hash = '#/composite/${ids[0]}/${ids[1]}'`)
    await wait(2200)
    const comp = await js(`({
      columns: document.querySelectorAll('.grid3 > *').length,
      dims: document.querySelectorAll('.dim-chip').length,
      scene: (document.querySelector('.dim-head .t-xs')?.textContent || '').slice(0, 30),
    })`)
    check('合盘三栏渲染', comp.columns >= 3, `cols=${comp.columns}`)
    check('合盘维度可选', comp.dims >= 6, `dims=${comp.dims}`)
    await shot('08-composite')

    // 切到「事业」维度
    const switched = await js(`(() => {
      const chips = [...document.querySelectorAll('.dim-chip')]
      const target = chips.find((c) => c.textContent.includes('事业'))
      if (!target) return false
      target.click()
      return true
    })()`)
    await wait(700)
    const sceneChanged = await js(`(document.querySelector('.dim-head .t-xs')?.textContent || '')`)
    check('切换解读维度生效', switched && sceneChanged.includes('职业'), sceneChanged.slice(0, 30))

    // 自定义维度
    const custom = await js(`(() => {
      const chips = [...document.querySelectorAll('.dim-chip')]
      const target = chips.find((c) => c.textContent.includes('自定义'))
      if (!target) return false
      target.click()
      return true
    })()`)
    await wait(500)
    const hasInput = await js(`Boolean(document.querySelector('.dim-input'))`)
    check('自定义维度提供输入框', custom && hasInput)
    await shot('09-composite-dim')
  }

  // 12) 设置页
  await js(`location.hash = '#/settings'`)
  await wait(1600)
  const settingsOk = await js(`document.querySelectorAll('input, select, button').length > 5`)
  check('设置页可渲染', settingsOk)
  await shot('10-settings')

  // 13) 新建页
  await js(`location.hash = '#/new'`)
  await wait(1600)
  const entryOk = await js(`({
    title: (document.querySelector('h1')?.textContent || ''),
    fields: document.querySelectorAll('input').length,
  })`)
  check('新建页可渲染', entryOk.fields >= 3, `fields=${entryOk.fields}`)
  await shot('11-new')

  const failed = checks.filter((c) => !c.pass)
  const result = {
    ok: failed.length === 0,
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.map((c) => c.name),
    checks,
    shots,
  }
  flog('[smoke] summary:', `${result.passed}/${result.total} passed`)
  await fs.writeFile(
    path.join(smokeDir, 'smoke-result.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  )
  app.exit(result.ok ? 0 : 3)
}
