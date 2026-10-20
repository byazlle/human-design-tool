import { computed, onMounted, onUnmounted, ref } from 'vue'

/** 视口分流：≤768 手机，≥1024 桌面（DESIGN.md §8） */
export function useBreakpoint() {
  const width = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)

  const update = () => {
    width.value = window.innerWidth
  }

  onMounted(() => {
    window.addEventListener('resize', update, { passive: true })
    window.addEventListener('orientationchange', update)
    update()
  })

  onUnmounted(() => {
    window.removeEventListener('resize', update)
    window.removeEventListener('orientationchange', update)
  })

  return {
    width,
    isMobile: computed(() => width.value <= 768),
    isTablet: computed(() => width.value > 768 && width.value < 1024),
    isDesktop: computed(() => width.value >= 1024),
  }
}
