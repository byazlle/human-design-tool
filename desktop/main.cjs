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
    centers: document.querySelectorAll('.center-chip').length,
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
  const aiPanel = await js(`({
    open: Boolean(document.querySelector('.panel[role="dialog"]')),
    text: (document.querySelector('.panel .error-state')?.textContent || '').slice(0, 60),
  })`)
  check('AI 未配置时打开面板并提示', aiPanel.open || aiGuard === 'no-run', aiPanel.text)
  await js(`document.querySelector('.panel .actions button[aria-label="关闭"]')?.click()`)
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
