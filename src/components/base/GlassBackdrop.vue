<script setup lang="ts">
/**
 * 环境光斑层：为玻璃表面提供"背后有颜色可折射"的物理基础。
 * 纯装饰，pointer-events: none，不参与任何交互。
 */
</script>

<template>
  <div class="backdrop" aria-hidden="true">
    <span class="glow g1" />
    <span class="glow g2" />
    <span class="glow g3" />
    <span class="glow g4" />
    <span class="glow g5" />
    <span class="grain" />
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  /* 必须在普通流内容之下：z-index: 0 的定位元素会盖住静态内容 */
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  contain: strict;
}

.glow {
  position: absolute;
  display: block;
  border-radius: 50%;
  filter: blur(96px);
  opacity: 0.85;
  will-change: transform;
}

.g1 {
  width: 46vw;
  height: 46vw;
  min-width: 380px;
  min-height: 380px;
  top: -14vw;
  left: -8vw;
  background: var(--glow-1);
  animation: drift-1 32s var(--ease-in-out) infinite alternate;
}

.g2 {
  width: 40vw;
  height: 40vw;
  min-width: 340px;
  min-height: 340px;
  top: -8vw;
  right: -10vw;
  background: var(--glow-2);
  animation: drift-2 38s var(--ease-in-out) infinite alternate;
}

.g3 {
  width: 52vw;
  height: 40vw;
  min-width: 400px;
  min-height: 320px;
  bottom: -18vw;
  left: 18vw;
  background: var(--glow-3);
  animation: drift-3 44s var(--ease-in-out) infinite alternate;
}

.g4 {
  width: 30vw;
  height: 30vw;
  min-width: 260px;
  min-height: 260px;
  bottom: -6vw;
  right: 4vw;
  background: var(--glow-4);
  animation: drift-4 36s var(--ease-in-out) infinite alternate;
}

.g5 {
  width: 24vw;
  height: 24vw;
  min-width: 200px;
  min-height: 200px;
  top: -6vw;
  left: 42vw;
  background: var(--glow-5);
  animation: drift-5 48s var(--ease-in-out) infinite alternate;
}

/* 极细颗粒：消除大面积渐变的 banding，让玻璃更有"介质感" */
.grain {
  position: absolute;
  inset: 0;
  opacity: var(--noise-opacity);
  background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

@keyframes drift-1 {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(6vw, 5vh, 0) scale(1.12);
  }
}
@keyframes drift-2 {
  from {
    transform: translate3d(0, 0, 0) scale(1.05);
  }
  to {
    transform: translate3d(-7vw, 8vh, 0) scale(0.94);
  }
}
@keyframes drift-3 {
  from {
    transform: translate3d(0, 0, 0) scale(0.96);
  }
  to {
    transform: translate3d(-5vw, -6vh, 0) scale(1.1);
  }
}
@keyframes drift-4 {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(-8vw, -5vh, 0) scale(1.16);
  }
}
@keyframes drift-5 {
  from {
    transform: translate3d(0, 0, 0) scale(0.9);
    opacity: 0.5;
  }
  to {
    transform: translate3d(5vw, -7vh, 0) scale(1.2);
    opacity: 0.9;
  }
}

/* 移动端 / 低性能：减少光斑与模糊半径，优先保证滚动流畅 */
@media (max-width: 768px) {
  .glow {
    filter: blur(64px);
  }
  .g4,
  .g5 {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .glow {
    animation: none;
  }
}
</style>
