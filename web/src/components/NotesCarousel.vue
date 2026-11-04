<template>
  <div class="carousel">
    <button class="nav prev" :disabled="atStart" @click="scroll(-1)">‹</button>

    <div ref="track" class="track" @scroll="onScroll">
      <div v-for="n in notes" :key="n.id" class="note-card" @click="$emit('open', n)" @contextmenu.prevent="$emit('menu', $event, n)">
        <div class="nc-head">
          <span class="nc-title" :title="n.title">{{ n.title }}</span>
          <button class="nc-add" title="加入复习队列" @click.stop="$emit('review', n)">+</button>
        </div>
        <div class="nc-body">{{ preview(n.content) }}</div>
        <div class="nc-foot">{{ timeOf(n.updatedAt) }}</div>
      </div>

      <div class="note-card new-card" @click="$emit('create')">
        <span class="nc-plus">+</span>
        <span class="nc-tip">新建笔记</span>
      </div>
    </div>

    <button class="nav next" :disabled="atEnd" @click="scroll(1)">›</button>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";

const props = defineProps({ notes: { type: Array, default: () => [] } });
defineEmits(["open", "create", "review", "menu"]);

const track = ref(null);
const atStart = ref(true);
const atEnd = ref(false);

function updateState() {
  const el = track.value;
  if (!el) return;
  atStart.value = el.scrollLeft <= 2;
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
}

function scroll(dir) {
  const el = track.value;
  if (!el) return;
  el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  setTimeout(updateState, 320);
}

function onScroll() {
  updateState();
}

const preview = (t) => (t || "").replace(/\s+/g, " ").slice(0, 80) || "（空）";

function timeOf(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let ro = null;
onMounted(async () => {
  await nextTick();
  updateState();
  if (window.ResizeObserver && track.value) {
    ro = new ResizeObserver(updateState);
    ro.observe(track.value);
  }
});

/**
 * notes 是异步拉回来的：数据到位后 track 的宽度没变（只有内容变多），
 * ResizeObserver 不会触发，翻页按钮会一直停在 disabled。
 * 所以内容长度变化后必须重新算一次可用状态。
 */
watch(
  () => props.notes.length,
  async () => {
    await nextTick();
    updateState();
  }
);
onBeforeUnmount(() => ro?.disconnect());
</script>

<style scoped>
.carousel {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav {
  flex: none;
  width: 26px;
  height: 62px;
  border-radius: 9px;
  border: 1px solid var(--sde-border);
  background: var(--sde-surface-2);
  color: var(--sde-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

.nav:hover:not(:disabled) {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.nav:disabled {
  opacity: 0.28;
  cursor: default;
}

.track {
  flex: 1;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-behavior: smooth;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.track::-webkit-scrollbar {
  display: none;
}

.note-card {
  flex: none;
  width: 238px;
  height: 148px;
  padding: 13px 15px;
  border-radius: 12px;
  background: var(--sde-surface-2);
  border: 1px solid var(--sde-border);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.16s;
  overflow: hidden;
}

.note-card:hover {
  border-color: var(--sde-accent);
  background: var(--sde-surface-3);
  transform: translateY(-1px);
}

.nc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.nc-title {
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.nc-add {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: var(--sde-muted);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

.nc-add:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
  background: var(--sde-accent-soft);
}

.nc-body {
  flex: 1;
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--sde-muted);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.nc-foot {
  font-size: 11px;
  color: var(--sde-dim);
}

.new-card {
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-style: dashed;
  border-color: var(--sde-border-strong);
  background: transparent;
  color: var(--sde-muted);
}

.new-card:hover {
  color: var(--sde-accent);
  border-color: var(--sde-accent);
}

.nc-plus {
  font-size: 22px;
  line-height: 1;
}

.nc-tip {
  font-size: 12.5px;
}
</style>
