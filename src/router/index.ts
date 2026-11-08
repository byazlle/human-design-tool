import { createRouter, createWebHashHistory } from 'vue-router'
import {
  SETTINGS_RETURN_KEY,
  SOURCE_KEYS,
  clearSource,
  consumeSource,
  isDerivedRoute,
  peekSource,
  recordSource,
} from '../utils/navigationSource'

/** 兼容既有引用：key 名与 v2.2.1 完全一致 */
export { SETTINGS_RETURN_KEY } from '../utils/navigationSource'

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

/**
 * 唯一改动的路由逻辑（T-1 / §3.1.3）：
 * ① 设置页来源 —— 保持 v2.2.1 原语义（直接打开 / 刷新清掉旧来源）；
 * ② 派生页来源 —— 记录发起页 fullPath，不覆盖派生页之间的内部跳转。
 */
router.beforeEach((to, from) => {
  if (to.name === 'settings') {
    if (from.name && from.name !== 'settings') recordSource(SOURCE_KEYS.settings, from.fullPath)
    else if (!from.name) clearSource(SOURCE_KEYS.settings)
    return
  }
  if (isDerivedRoute(to.name)) {
    if (from.name && !isDerivedRoute(from.name)) {
      recordSource(SOURCE_KEYS.derived, from.fullPath)
    } else if (!from.name) {
      clearSource(SOURCE_KEYS.derived)
    }
  }
})

/** 只读来源（用于返回按钮文案，不消费）；签名与返回语义完全不变 */
export function peekSettingsReturn(): string {
  return peekSource(SOURCE_KEYS.settings)
}

/** 读取并清除来源（只消费一次）；签名与返回语义完全不变 */
export function consumeSettingsReturn(): string {
  return consumeSource(SOURCE_KEYS.settings)
}

export default router
