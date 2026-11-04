<template>
  <div class="boot" :class="{ opening: view.opening, done: view.done }" @click="$emit('finish')">
    <!-- 劈开用的两块挡板，z-index 最低；其他层都叠在它们上面 -->
    <div class="boot-gate left" />
    <div class="boot-gate right" />

    <div class="boot-grid"><i /></div>
    <div class="boot-glow" />
    <div class="boot-horizon" />
    <div class="boot-halo" />

    <div class="boot-rings">
      <i /><i /><i /><i />
    </div>

    <div class="boot-core">
      <div class="boot-mark">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <!-- 左右两页书页 -->
          <path class="bm-fill" d="M50 30 L24 24 L24 72 L50 78 Z" />
          <path class="bm-fill" d="M50 30 L76 24 L76 72 L50 78 Z" />
          <!-- 书脊 -->
          <path class="bm-fill" d="M50 30 L50 78" />
          <circle class="bm-dot" cx="50" cy="20" r="2.6" />
        </svg>
      </div>

      <div class="boot-word">
        <span v-for="(ch, i) in WORD" :key="i" :style="{ animationDelay: 0.3 + i * 0.09 + 's' }">
          {{ ch }}
        </span>
      </div>
      <div class="boot-sub">Study Desktop</div>

      <div class="boot-bar-wrap">
        <div class="boot-bar-track">
          <div class="boot-bar-fill" />
        </div>
        <div class="boot-status">
          <span class="bs-text" :class="{ swap: view.statusSwapping }">{{ view.status }}</span>
          <span class="bs-pct">{{ view.pct }}%</span>
        </div>
      </div>
    </div>

    <div class="boot-scan" />
    <div class="boot-skip">点击任意位置跳过</div>
    <div class="boot-seam" />
  </div>
</template>

<script setup>
defineProps({
  view: { type: Object, required: true },
});
defineEmits(["finish"]);

const WORD = ["学", "习", "桌", "面"];
</script>
