<template>
  <aside class="rail">
    <div class="rail-list">
      <a
        v-for="(l, i) in links"
        :key="l.id"
        :href="l.url"
        target="_blank"
        rel="noopener"
        class="rail-item"
        :class="{ dragging: dragIdx === i, 'drop-on': overIdx === i && dragIdx !== i }"
        :title="`${l.name}\n${l.url}\n（拖动可排序，右键可编辑）`"
        draggable="true"
        @dragstart="onDragStart(i, $event)"
        @dragover.prevent="onDragOver(i)"
        @dragleave="onDragLeave(i)"
        @drop.prevent="onDrop(i)"
        @dragend="onDragEnd"
        @click="onClick"
        @contextmenu.prevent="onMenu($event, l)"
      >
        <span class="rail-icon">
          <img
            v-if="!broken[l.id]"
            :src="iconUrl(l)"
            alt=""
            referrerpolicy="no-referrer"
            @error="broken[l.id] = true"
          />
          <span v-else class="rail-fallback">{{ l.name.slice(0, 1) }}</span>
        </span>
        <span class="rail-name">{{ l.name }}</span>
      </a>
    </div>

    <button class="rail-add" title="添加外链" @click="openAdd">+</button>

    <el-dialog v-model="dialogOpen" :title="form.id ? '编辑外链' : '添加外链'" width="420">
      <el-form label-width="56px" @submit.prevent>
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="例如：Blackboard" maxlength="10" show-word-limit />
        </el-form-item>
        <el-form-item label="网址">
          <el-input v-model="form.url" placeholder="https://..." @keyup.enter="submit" />
        </el-form-item>
      </el-form>
      <p class="dlg-tip">图标会自动从网站抓取，抓不到时显示名称首字。</p>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">添加</el-button>
      </template>
    </el-dialog>
    <ContextMenu ref="ctx" />
  </aside>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import { useLinkStore } from "@/stores/links";
import ContextMenu from "@/components/ContextMenu.vue";

const store = useLinkStore();
const { items: links } = storeToRefs(store);

const broken = reactive({});
const dialogOpen = ref(false);
const saving = ref(false);
const form = reactive({ id: "", name: "", url: "" });
const ctx = ref(null);

const iconUrl = (l) => "/api/favicon?url=" + encodeURIComponent(l.url);

function openAdd() {
  form.id = "";
  form.name = "";
  form.url = "";
  dialogOpen.value = true;
}

function openEdit(l) {
  form.id = l.id;
  form.name = l.name;
  form.url = l.url;
  dialogOpen.value = true;
}

function onMenu(e, l) {
  ctx.value?.open(
    e,
    [
      { key: "edit", label: "编辑" },
      { key: "del", label: "删除", danger: true },
    ],
    (k) => (k === "edit" ? openEdit(l) : askRemove(l))
  );
}

/* ---------- 拖动排序 ---------- */
const dragIdx = ref(-1);
const overIdx = ref(-1);
let justDragged = false;

function onDragStart(i, e) {
  dragIdx.value = i;
  justDragged = false;
  e.dataTransfer.effectAllowed = "move";
  try {
    e.dataTransfer.setData("text/plain", String(i));
  } catch {}
}

function onDragOver(i) {
  overIdx.value = i;
}

function onDragLeave(i) {
  if (overIdx.value === i) overIdx.value = -1;
}

async function onDrop(i) {
  const from = dragIdx.value;
  dragIdx.value = -1;
  overIdx.value = -1;
  if (from < 0 || from === i) return;

  justDragged = true;
  const list = [...links.value];
  const [moved] = list.splice(from, 1);
  list.splice(i, 0, moved);
  links.value = list;

  try {
    await store.reorder(list.map((l) => l.id));
  } catch (e) {
    ElMessage.error(e.message);
    store.load(true);
  }
  setTimeout(() => (justDragged = false), 50);
}

function onDragEnd() {
  dragIdx.value = -1;
  overIdx.value = -1;
}

/** 拖完手一松会紧接着触发 click，这里挡掉，避免误开网页 */
function onClick(e) {
  if (justDragged) e.preventDefault();
}


async function submit() {
  if (!form.name.trim() || !form.url.trim()) return ElMessage.warning("名称和网址都要填");
  saving.value = true;
  try {
    const payload = { name: form.name.trim(), url: form.url.trim() };
    if (form.id) await store.update(form.id, payload);
    else await store.create(payload);
    dialogOpen.value = false;
    ElMessage.success(form.id ? "已保存" : "已添加");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function askRemove(l) {
  try {
    await ElMessageBox.confirm(`删除外链「${l.name}」？`, "删除", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await store.remove(l.id);
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(() => store.load());
</script>

<style scoped>
.rail {
  width: 74px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0 12px;
  gap: 6px;
  background: var(--sde-surface);
  border-left: 1px solid var(--sde-border);
  overflow: hidden;
}

.rail-list {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  overflow-y: auto;
  scrollbar-width: none;
}

.rail-list::-webkit-scrollbar {
  display: none;
}

.rail-item {
  width: 60px;
  padding: 8px 2px 7px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  color: var(--sde-muted);
  transition: all 0.15s;
  border: 1px solid transparent;
}

.rail-item:hover {
  background: var(--sde-surface-2);
  color: var(--sde-text);
  border-color: var(--sde-border);
}

.rail-item.dragging {
  opacity: 0.35;
}

/* 拖动时给落点一个明确的提示 */
.rail-item.drop-on {
  border-color: var(--sde-accent);
  background: var(--sde-accent-soft);
  box-shadow: 0 -2px 0 var(--sde-accent);
}

.rail-icon {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  overflow: hidden;
}

.rail-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.rail-fallback {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: var(--sde-surface-3);
  color: var(--sde-text-2);
  font-size: 11px;
  display: grid;
  place-items: center;
}

.rail-name {
  font-size: 11px;
  line-height: 1.2;
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-add {
  width: 46px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  border: 1px dashed var(--sde-border-strong);
  background: transparent;
  color: var(--sde-muted);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s;
}

.rail-add:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
  background: var(--sde-accent-soft);
}

.dlg-tip {
  margin: 0;
  font-size: 12px;
  color: var(--sde-muted);
}

@media (max-width: 900px) {
  .rail {
    display: none;
  }
}
</style>
