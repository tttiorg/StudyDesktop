<template>
  <teleport to="body">
    <div v-if="visible" class="ctx-layer" @click="close" @contextmenu.prevent="close">
      <div class="ctx-menu" :style="pos">
        <button
          v-for="it in items"
          :key="it.key"
          class="ctx-item"
          :class="{ danger: it.danger }"
          @click.stop="pick(it)"
        >
          {{ it.label }}
        </button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from "vue";

const visible = ref(false);
const items = ref([]);
const x = ref(0);
const y = ref(0);
let onPick = null;

const pos = computed(() => {
  const w = 148;
  const h = items.value.length * 34 + 10;
  const px = Math.min(x.value, window.innerWidth - w - 8);
  const py = Math.min(y.value, window.innerHeight - h - 8);
  return { left: px + "px", top: py + "px" };
});

function open(e, list, cb) {
  e?.preventDefault?.();
  e?.stopPropagation?.();
  items.value = list;
  x.value = e.clientX;
  y.value = e.clientY;
  onPick = cb;
  visible.value = true;
  window.addEventListener("keydown", onKey);
}

function close() {
  visible.value = false;
  onPick = null;
  window.removeEventListener("keydown", onKey);
}

function onKey(e) {
  if (e.key === "Escape") close();
}

function pick(it) {
  const cb = onPick;
  close();
  cb?.(it.key, it);
}

onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

defineExpose({ open, close });
</script>

<style>
.ctx-layer {
  position: fixed;
  inset: 0;
  z-index: 3000;
}

.ctx-menu {
  position: fixed;
  min-width: 132px;
  padding: 5px;
  border-radius: 10px;
  background: var(--el-bg-color-overlay, #202a2f);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}

.ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 12px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--sde-text, #e7eceb);
  font-size: 13.5px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s;
}

.ctx-item:hover {
  background: var(--sde-surface-3, #202a2f);
  color: var(--sde-accent, #12ccd8);
}

.ctx-item.danger {
  color: #d86a52;
}

.ctx-item.danger:hover {
  background: rgba(216, 106, 82, 0.14);
  color: #d86a52;
}
</style>
