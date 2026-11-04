<template>
  <div class="kw">
    <div class="kw-tabs">
      <button :class="{ on: tab === 'open' }" @click="tab = 'open'">
        待复习 <b v-if="openCount">{{ openCount }}</b>
      </button>
      <button :class="{ on: tab === 'done' }" @click="tab = 'done'">已掌握 {{ masteredCount }}</button>
    </div>

    <div v-if="dueCount && tab === 'open'" class="kw-banner">
      <span>今天有 {{ dueCount }} 个该复习了</span>
      <span class="kw-interval">1 / 2 / 4 / 7 / 15 / 30 / 60 天</span>
    </div>

    <div v-if="!shown.length" class="sde-empty">
      {{ tab === "done" ? "还没有彻底掌握的知识点" : "还没有知识点" }}
      <br v-if="tab === 'open'" />
      <span v-if="tab === 'open'" style="font-size: 12px; opacity: 0.7">
        把不会的题、没吃透的概念丢进来，系统按遗忘曲线提醒
      </span>
    </div>

    <div v-else class="kw-list">
      <div
        v-for="(k, i) in shown"
        :key="k.id"
        class="kw-item"
        :class="{ due: isDue(k), mastered: k.mastered }"
        @click="openEdit(k)"
        @contextmenu.prevent="onMenu($event, k)"
      >
        <button
          class="kw-check"
          :class="{ due: isDue(k), ok: k.mastered }"
          :title="k.mastered ? '已掌握' : '点一下打卡复习'"
          @click.stop="doReview(k)"
        >
          {{ k.mastered ? "✓" : i + 1 }}
        </button>

        <div class="kw-main">
          <div class="kw-title" :title="k.title">{{ k.title }}</div>
          <div class="kw-meta">
            <span class="kw-state" :class="{ due: isDue(k) }">{{ labelOf(k) }}</span>
            <span v-if="k.stage" class="kw-stage">第 {{ k.stage }} 轮</span>
            <span v-if="k.images?.length" class="kw-img">{{ k.images.length }} 张图</span>
          </div>
        </div>

        <div v-if="k.images?.length" class="kw-thumb">
          <img :src="rawUrl(k.images[0])" alt="" />
        </div>
      </div>
    </div>

    <ContextMenu ref="ctx" />

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="open" :title="form.id ? '编辑知识点' : '添加知识点'" width="500">
      <el-form label-width="62px" @submit.prevent>
        <el-form-item label="知识点">
          <el-input v-model="form.title" placeholder="例如：极限的 ε-δ 定义" maxlength="100" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" placeholder="记录卡住的地方、解法思路…" />
        </el-form-item>
        <el-form-item label="题目图片">
          <div class="up-area">
            <div v-for="(id, i) in form.images" :key="id" class="up-thumb">
              <img :src="rawUrl(id)" alt="" />
              <span class="up-del" @click="form.images.splice(i, 1)">×</span>
            </div>
            <label class="up-add" :class="{ busy: uploading }">
              <input type="file" accept="image/*" multiple hidden @change="onPick" />
              {{ uploading ? "…" : "+" }}
            </label>
          </div>
        </el-form-item>
        <el-form-item v-if="form.id" label="排期">
          <div class="plan-line">
            <span>{{ labelOf(form) }}</span>
            <span class="plan-intervals">1 / 2 / 4 / 7 / 15 / 30 / 60 天</span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button v-if="form.id" text type="danger" @click="removeItem">删除</el-button>
        <el-button v-if="form.id && !form.mastered" text @click="review(form.id, 'forgot')">
          忘完了
        </el-button>
        <el-button v-if="form.id && !form.mastered" text @click="review(form.id, 'master')">
          彻底掌握
        </el-button>
        <el-button v-if="form.id && form.mastered" text @click="review(form.id, 'reset')">
          重新开始
        </el-button>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { api } from "@/api";
import ContextMenu from "@/components/ContextMenu.vue";

const props = defineProps({
  subjectId: { type: String, required: true },
});

const emit = defineEmits(["changed"]);

const rawUrl = (fid) => api.files.rawUrl(fid);
const items = ref([]);
const tab = ref("open");
const open = ref(false);
const saving = ref(false);
const uploading = ref(false);
const ctx = ref(null);

const form = reactive({
  id: "",
  title: "",
  note: "",
  images: [],
  mastered: false,
  stage: 0,
  nextReview: null,
});

const dueCount = computed(() => items.value.filter((i) => isDue(i)).length);
const openCount = computed(() => items.value.filter((i) => !i.mastered).length);
const masteredCount = computed(() => items.value.filter((i) => i.mastered).length);
const shown = computed(() =>
  tab.value === "done" ? items.value.filter((i) => i.mastered) : items.value.filter((i) => !i.mastered)
);

function isDue(k) {
  if (k.mastered || !k.nextReview) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(k.nextReview + "T00:00:00") <= today;
}

const labelOf = (k) => {
  if (k.mastered) return "已掌握";
  if (!k.nextReview) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(k.nextReview + "T00:00:00") - today) / 86400000);
  if (diff < 0) return `已逾期 ${-diff} 天`;
  if (diff === 0) return "今天复习";
  if (diff === 1) return "明天复习";
  return `${diff} 天后复习`;
};

async function load() {
  try {
    const data = await api.knowledge.list({ subjectId: props.subjectId });
    items.value = data.items || [];
    emit("changed", { dueCount: data.dueCount || 0, total: data.total || 0 });
  } catch (e) {
    ElMessage.error("知识点加载失败：" + e.message);
  }
}

function openEdit(k) {
  Object.assign(form, {
    id: k.id,
    title: k.title,
    note: k.note || "",
    images: [...(k.images || [])],
    mastered: !!k.mastered,
    stage: k.stage || 0,
    nextReview: k.nextReview || null,
  });
  open.value = true;
}

function openCreate() {
  Object.assign(form, {
    id: "",
    title: "",
    note: "",
    images: [],
    mastered: false,
    stage: 0,
    nextReview: null,
  });
  open.value = true;
}

async function onPick(e) {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;

  uploading.value = true;
  try {
    for (const f of files) {
      const fd = new FormData();
      fd.append("files", f);
      fd.append("subjectId", props.subjectId);
      fd.append("category", "knowledge");
      const res = await api.files.upload(fd);
      const item = res.added?.[0];
      if (item) form.images.push(item.id);
      else if (res.duplicates?.[0]) {
        // 已上传过同一张图，直接复用
        const list = await api.files.list({ subjectId: props.subjectId, category: "knowledge" });
        const found = (list.items || []).find((x) => x.id === res.duplicates[0].id);
        if (found) form.images.push(found.id);
      }
    }
  } catch (err) {
    ElMessage.error("图片上传失败：" + err.message);
  } finally {
    uploading.value = false;
  }
}

async function save() {
  if (!form.title.trim()) return ElMessage.warning("请填写知识点");
  saving.value = true;
  try {
    const payload = {
      title: form.title.trim(),
      note: form.note,
      images: form.images,
      subjectId: props.subjectId,
    };
    if (form.id) await api.knowledge.update(form.id, payload);
    else await api.knowledge.create(payload);
    open.value = false;
    await load();
    ElMessage.success("已保存");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function doReview(k) {
  if (k.mastered) {
    openEdit(k);
    return;
  }
  try {
    const data = await api.knowledge.review(k.id, "review");
    items.value = data.items || items.value;
    emit("changed", { dueCount: data.items.filter((i) => isDue(i)).length });
    const it = data.item;
    ElMessage.success(`已打卡，下次复习：${it.nextReview}`);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function review(id, action) {
  try {
    const data = await api.knowledge.review(id, action);
    items.value = data.items || items.value;
    open.value = false;
    emit("changed", { dueCount: data.items.filter((i) => isDue(i)).length });
    ElMessage.success(action === "master" ? "已标记彻底掌握" : "已重新开始复习");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function removeItem() {
  try {
    await api.knowledge.remove(form.id);
    open.value = false;
    await load();
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function onMenu(e, k) {
  const items = [{ key: "edit", label: "编辑" }];
  if (!k.mastered) {
    items.push({ key: "review", label: "打卡复习" });
    items.push({ key: "forgot", label: "忘完了" });
    items.push({ key: "master", label: "彻底掌握" });
  } else {
    items.push({ key: "reset", label: "重新开始" });
  }
  items.push({ key: "delete", label: "删除", danger: true });

  ctx.value?.open(e, items, async (key) => {
    if (key === "edit") return openEdit(k);
    if (key === "delete") {
      try {
        await api.knowledge.remove(k.id);
        await load();
        ElMessage.success("已删除");
      } catch (err) {
        ElMessage.error(err.message);
      }
      return;
    }
    if (key === "review") return doReview(k);
    await review(k.id, key);
  });
}

onMounted(load);

defineExpose({ openCreate, load });
</script>

<style scoped>
.kw {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kw-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 9px;
  background: rgba(229, 160, 75, 0.1);
  border: 1px solid rgba(229, 160, 75, 0.25);
  font-size: 12px;
  color: #e5a04b;
}

.kw-interval {
  font-size: 10.5px;
  opacity: 0.75;
}

.kw-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 2px;
}

.kw-tabs button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--sde-muted);
  font-size: 12.5px;
  padding: 3px 11px;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.kw-tabs button b {
  color: var(--sde-warn);
  font-weight: 600;
  margin-left: 2px;
}

.kw-tabs button.on {
  background: var(--sde-surface-2);
  border-color: var(--sde-border);
  color: var(--sde-text);
}

.kw-list {
  display: flex;
  flex-direction: column;
}

.kw-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 6px;
  border-bottom: 1px solid var(--sde-border);
  cursor: pointer;
  border-radius: 7px;
  transition: background 0.13s;
}

.kw-item:hover {
  background: var(--sde-surface-2);
}

.kw-item.due {
  background: rgba(229, 160, 75, 0.06);
}

.kw-item.mastered {
  opacity: 0.5;
}

.kw-check {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: var(--sde-muted);
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.15s;
  display: grid;
  place-items: center;
}

.kw-check:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.kw-check.due {
  border-color: #e5a04b;
  color: #e5a04b;
  background: rgba(229, 160, 75, 0.12);
}

.kw-check.ok {
  border-color: var(--sde-ok);
  color: var(--sde-ok);
  background: rgba(63, 185, 80, 0.12);
}

.kw-main {
  flex: 1;
  min-width: 0;
}

.kw-title {
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kw-item.mastered .kw-title {
  text-decoration: line-through;
}

.kw-meta {
  display: flex;
  gap: 8px;
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--sde-muted);
}

.kw-state.due {
  color: #e5a04b;
}

.kw-thumb {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  overflow: hidden;
  flex: none;
  border: 1px solid var(--sde-border);
}

.kw-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 上传 */
.up-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.up-thumb {
  position: relative;
  width: 62px;
  height: 62px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--sde-border);
}

.up-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.up-del {
  position: absolute;
  top: 0;
  right: 0;
  width: 16px;
  height: 16px;
  line-height: 15px;
  text-align: center;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  border-bottom-left-radius: 6px;
}

.up-add {
  width: 62px;
  height: 62px;
  border-radius: 8px;
  border: 1px dashed var(--sde-border);
  display: grid;
  place-items: center;
  font-size: 20px;
  color: var(--sde-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.up-add:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.plan-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  font-size: 12px;
}

.plan-intervals {
  font-size: 10.5px;
  color: var(--sde-muted);
}
</style>
