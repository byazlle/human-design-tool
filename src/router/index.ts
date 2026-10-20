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
  scrollBehavior: () => ({ top: 0 }),
})

export default router
