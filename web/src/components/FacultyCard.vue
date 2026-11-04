<template>
  <div class="fac-card" :class="{ empty: !faculty?.name }">
    <div class="fac-text">
      <div class="fac-name">
        <template v-if="displayName">
          {{ displayName }}
          <span v-if="faculty?.title" class="fac-title">{{ faculty.title }}</span>
          <span v-else-if="!faculty?.name" class="fac-title">来自课表</span>
        </template>
        <template v-else>未填写教师</template>
      </div>
      <div class="fac-dept">{{ faculty?.dept || "点头像查询院系 / 职称 / 主页" }}</div>
      <div class="fac-contact">
        <span v-if="faculty?.email">{{ faculty.email }}</span>
        <span v-if="faculty?.phone">{{ faculty.phone }}</span>
      </div>
    </div>

    <div class="fac-avatar" :title="faculty?.url ? '点击打开官网主页' : '查询教师信息'" @click="onAvatarClick">
      <img v-if="avatarOk && faculty?.avatar" :src="faculty.avatar" alt="" @error="avatarOk = false" />
      <span v-else class="fac-initial">{{ initial }}</span>
      <span class="fac-badge">查询</span>
    </div>

    <!-- 查询教师 -->
    <el-dialog v-model="open" title="查询授课教师" width="560">
      <div class="q-row">
        <el-input v-model="keyword" placeholder="输入教师姓名" @keyup.enter="doSearch" />
        <el-button type="primary" :loading="searching" @click="doSearch">搜索</el-button>
      </div>
      <p class="q-tip">数据来自南方科技大学官网师资库，未收录的老师可手动填写。</p>

      <div v-if="results.length" class="q-list">
        <div v-for="(r, i) in results" :key="i" class="q-item" @click="pick(r)">
          <img v-if="r.avatar" :src="r.avatar" class="q-avatar" alt="" />
          <span v-else class="q-avatar q-initial">{{ r.name.slice(0, 1) }}</span>
          <div class="q-info">
            <div class="q-name">{{ r.name }}<span v-if="r.title"> · {{ r.title }}</span></div>
            <div class="q-dept">{{ r.dept }}</div>
          </div>
          <el-button text size="small" type="primary">选择</el-button>
        </div>
      </div>
      <div v-else-if="searched && !searching" class="sde-empty">
        官网师资库没找到「{{ keyword }}」<br />
        <span style="font-size: 11.5px; opacity: 0.7">可以在下面手动填写</span>
      </div>

      <div class="divider"><span>手动填写</span></div>
      <el-form label-width="60px" @submit.prevent>
        <el-form-item label="姓名">
          <el-input v-model="manual.name" maxlength="20" />
        </el-form-item>
        <el-form-item label="职称">
          <el-input v-model="manual.title" placeholder="如 副教授" maxlength="30" />
        </el-form-item>
        <el-form-item label="院系">
          <el-input v-model="manual.dept" maxlength="60" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="manual.email" maxlength="60" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="manual.phone" maxlength="30" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button v-if="faculty?.name" text type="danger" @click="clearFaculty">清除</el-button>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="saveManual">保存手动填写</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { api } from "@/api";

const props = defineProps({
  faculty: { type: Object, default: null },
  defaultName: { type: String, default: "" },
});

const emit = defineEmits(["update"]);

const open = ref(false);
const keyword = ref("");
const searching = ref(false);
const searched = ref(false);
const results = ref([]);
const avatarOk = ref(true);

const manual = reactive({ name: "", title: "", dept: "", email: "", phone: "" });

const initial = computed(() => {
  const n = props.faculty?.name || props.defaultName || "师";
  return n.slice(0, 1);
});

/** 没有查询过时，先用课表里的教师姓名占位 */
const displayName = computed(() => props.faculty?.name || props.defaultName || "");

watch(
  () => props.faculty?.avatar,
  () => (avatarOk.value = true)
);

function onAvatarClick() {
  if (props.faculty?.url && !open.value) {
    // 有官网链接时直接跳转，同时长按/查询按钮仍可编辑
    window.open(props.faculty.url, "_blank", "noopener");
    return;
  }
  openDialog();
}

function openDialog() {
  keyword.value = props.faculty?.name || props.defaultName || "";
  results.value = [];
  searched.value = false;
  Object.assign(manual, {
    name: props.faculty?.name || props.defaultName || "",
    title: props.faculty?.title || "",
    dept: props.faculty?.dept || "",
    email: props.faculty?.email || "",
    phone: props.faculty?.phone || "",
  });
  open.value = true;
}

async function doSearch() {
  const kw = keyword.value.trim();
  if (!kw) return ElMessage.warning("请输入姓名");
  searching.value = true;
  try {
    const data = await api.faculty.search(kw);
    results.value = data.items || [];
    searched.value = true;
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    searching.value = false;
  }
}

function pick(r) {
  emit("update", {
    name: r.name,
    title: r.title,
    dept: r.dept,
    avatar: r.avatar,
    url: r.url,
    email: "",
    phone: "",
  });
  open.value = false;
  ElMessage.success("已保存教师信息");
}

function saveManual() {
  if (!manual.name.trim()) return ElMessage.warning("请填写姓名");
  emit("update", { ...manual, avatar: props.faculty?.avatar || "", url: props.faculty?.url || "" });
  open.value = false;
  ElMessage.success("已保存");
}

function clearFaculty() {
  emit("update", null);
  open.value = false;
}

defineExpose({ openDialog });
</script>

<style scoped>
.fac-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--sde-surface);
  border: 1px solid var(--sde-border);
  border-radius: 12px;
  min-width: 260px;
}

.fac-card.empty {
  border-style: dashed;
}

.fac-text {
  flex: 1;
  min-width: 0;
  text-align: right;
}

.fac-name {
  font-size: 14px;
  font-weight: 650;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
}

.fac-title {
  font-size: 11px;
  font-weight: 400;
  color: var(--sde-muted);
  background: var(--sde-surface-2);
  padding: 1px 6px;
  border-radius: 5px;
}

.fac-dept {
  font-size: 11.5px;
  color: var(--sde-muted);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fac-contact {
  font-size: 10.5px;
  color: #5d6875;
  margin-top: 2px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.fac-avatar {
  position: relative;
  width: 58px;
  height: 58px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  background: var(--sde-surface-2);
  border: 1px solid var(--sde-border);
  cursor: pointer;
  display: grid;
  place-items: center;
}

.fac-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fac-initial {
  font-size: 20px;
  font-weight: 600;
  color: var(--sde-muted);
}

.fac-badge {
  position: absolute;
  inset: auto 0 0 0;
  font-size: 9px;
  text-align: center;
  padding: 1px 0;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}

.fac-avatar:hover .fac-badge {
  opacity: 1;
}

/* 查询弹窗 */
.q-row {
  display: flex;
  gap: 8px;
}

.q-tip {
  font-size: 11.5px;
  color: var(--sde-muted);
  margin: 8px 0 12px;
}

.q-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.q-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--sde-surface-2);
  cursor: pointer;
  transition: background 0.13s;
}

.q-item:hover {
  background: var(--sde-surface-3);
}

.q-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
  background: var(--sde-surface-3);
}

.q-initial {
  display: grid;
  place-items: center;
  font-size: 15px;
  color: var(--sde-muted);
}

.q-info {
  flex: 1;
  min-width: 0;
}

.q-name {
  font-size: 13px;
  font-weight: 600;
}

.q-dept {
  font-size: 11.5px;
  color: var(--sde-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0 14px;
  font-size: 12px;
  color: var(--sde-muted);
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--sde-border);
}
</style>
