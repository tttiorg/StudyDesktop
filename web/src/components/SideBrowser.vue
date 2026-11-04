<template>
  <aside class="sidebar" :class="{ collapsed: !open }">
    <div class="sb-head">
      <div class="sb-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="sb-tab"
          :class="{ active: cur === t.key }"
          :title="t.title || t.label"
          @click="cur = t.key"
        >
          {{ t.label }}
        </button>
      </div>
      <span class="grow" />
      <button class="icon-btn" title="刷新" @click="reload">↻</button>
    </div>

    <div class="sb-body">
      <iframe
        :key="current.key + reloadTick"
        ref="frame"
        :src="current.src"
        :title="current.label"
        allow="accelerometer; clipboard-write; encrypted-media"
      />
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from "vue";

defineProps({ open: { type: Boolean, default: true } });
defineEmits(["toggle"]);

/** 侧边栏的标签页，目前只有 News（AI 资讯聚合），以后可继续加 */
const tabs = [
  {
    key: "news",
    label: "News",
    title: "AI 行业动态 · AIHOT",
    src: "/__proxy?url=" + encodeURIComponent("https://aihot.news/"),
  },
];

const cur = ref(tabs[0].key);
const current = computed(() => tabs.find((t) => t.key === cur.value) || tabs[0]);

const frame = ref(null);
const reloadTick = ref(0);

/** 靠换 key 强制重建 iframe，比改 src 干净 */
function reload() {
  reloadTick.value++;
}
</script>

<style scoped>
.sidebar {
  width: 400px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--sde-surface);
  border-right: 1px solid var(--sde-border);
  transition: width 0.22s ease;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 0;
  border-right-color: transparent;
}

.sb-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 8px 12px;
  border-bottom: 1px solid var(--sde-border);
  flex: none;
}

.sb-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.sb-tabs::-webkit-scrollbar {
  display: none;
}

.sb-tab {
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sde-text-2);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.3px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}

.sb-tab:hover {
  color: var(--sde-text);
  background: var(--sde-surface-2);
}

.sb-tab.active {
  color: var(--sde-accent-ink);
  background: color-mix(in srgb, var(--sde-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--sde-accent) 45%, transparent);
  font-weight: 700;
}

.grow {
  flex: 1;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--sde-border);
  color: var(--sde-text);
  border-radius: 7px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.icon-btn:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.sb-body {
  flex: 1;
  min-height: 0;
  background: var(--sde-surface-2);
}

iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: var(--sde-surface);
}

/* 收起状态下的左上角入口已移到顶栏的 News 按钮，这里只保留面板本体 */
@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    width: min(90vw, 400px);
    box-shadow: var(--sde-shadow);
  }
}
</style>
