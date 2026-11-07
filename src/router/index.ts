import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 路由表（COMPONENTS.md §2）。
 * 使用 hash 模式：既能直接双击 dist/index.html 打开，也便于 Tauri / 静态托管。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'archive-home',
      component: () => import('../views/ArchiveHomeView.vue'),
    },
    {
      path: '/archive/:id',
      name: 'single-chart',
      component: () => import('../views/SingleChartView.vue'),
    },
    {
      path: '/chiron/:id',
      name: 'chiron-return',
      component: () => import('../views/ChironView.vue'),
    },
    {
      path: '/boards',
      name: 'multi-board',
      component: () => import('../views/MultiBoardView.vue'),
    },
    {
      path: '/composite/:aId/:bId',
      name: 'composite',
      component: () => import('../views/CompositeView.vue'),
    },
    {
      path: '/new',
      name: 'entry',
      component: () => import('../views/EntryView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
    {
      path: '/compare/:aId?/:bId?',
      name: 'compare',
      component: () => import('../views/CompareView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  // 从设置页返回（含浏览器后退）时恢复原来的滚动位置
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
})

/** 进入设置页前的来源路由：让「返回」回到完整盘而不是强制回档案库 */
const SETTINGS_RETURN_KEY = 'hdt.settings.returnTo'

router.beforeEach((to, from) => {
  if (to.name !== 'settings') return
  try {
    if (from.name && from.name !== 'settings') {
      sessionStorage.setItem(SETTINGS_RETURN_KEY, from.fullPath)
    } else if (!from.name) {
      // 直接打开 / 刷新设置页：清掉旧来源，避免「返回」串到上一次的盘面
      sessionStorage.removeItem(SETTINGS_RETURN_KEY)
    }
  } catch {
    /* 隐私模式下不可写时忽略，返回按钮回退到档案库 */
  }
})

/** 只读来源（用于返回按钮文案，不消费） */
export function peekSettingsReturn(): string {
  try {
    return sessionStorage.getItem(SETTINGS_RETURN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** 读取并清除来源（只消费一次，避免之后从别处进设置时串到旧来源） */
export function consumeSettingsReturn(): string {
  try {
    const value = sessionStorage.getItem(SETTINGS_RETURN_KEY) ?? ''
    sessionStorage.removeItem(SETTINGS_RETURN_KEY)
    return value
  } catch {
    return ''
  }
}

export default router
