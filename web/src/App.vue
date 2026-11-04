<template>
  <!-- 启动转场：挂在外壳层而不是 Home 里，这样切路由不会重播 -->
  <BootSplash v-if="active" :view="bootView" @finish="skipBoot" />

  <div class="app" :class="{ 'is-booted': booted, 'is-entering': entering }">
    <SideBrowser :open="sidebarOpen" @toggle="sidebarOpen = !sidebarOpen" />

    <div class="main">
      <header class="topbar">
        <div class="tb-left">
          <!-- 左侧栏开关：跟布局一起走，展开后按钮贴着侧栏右侧，再点一次收起 -->
          <button
            class="news-btn"
            :class="{ active: sidebarOpen }"
            :title="sidebarOpen ? '收起 News' : '展开 News'"
            @click="sidebarOpen = !sidebarOpen"
          >
            <svg class="nb-chev" :class="{ open: sidebarOpen }" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            News
          </button>
        </div>

        <div class="tb-center">
          <nav class="tabs">
            <router-link to="/" class="tab" :class="{ active: route.name === 'home' }">主页</router-link>
            <router-link to="/timetable" class="tab" :class="{ active: route.name === 'timetable' }">
              课表
            </router-link>
            <router-link
              v-for="s in subjects"
              :key="s.id"
              :to="`/subjects/${s.id}`"
              class="tab"
              :class="{ active: route.params.id === s.id }"
              @contextmenu.prevent="manageOpen = true"
            >
              <span class="dot" :style="{ background: s.color }" />{{ s.name }}
            </router-link>
          </nav>
        </div>

        <div class="tb-right">
          <!-- 外观：不在设置里，点一下直接切深色 -> 浅色 -> 跟随系统 -->
          <button
            class="icon-btn theme-btn"
            :title="`外观：${curThemeLabel}（点击切换）`"
            @click="cycleTheme"
          >
            <svg v-if="themeMode === 'dark'" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg v-else-if="themeMode === 'light'" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2" />
              <path
                d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M8 20.5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <span>{{ curThemeLabel }}</span>
          </button>
          <button class="icon-btn" title="导入数据" @click="openSettings('import')">导入</button>
          <button class="icon-btn" @click="manageOpen = true">管理学科</button>
          <button class="icon-btn" title="设置" @click="openSettings('profile')">设置</button>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <RightRail />

    <el-dialog v-model="dialogOpen" title="新建学科" width="420">
      <el-form label-width="64px" @submit.prevent>
        <el-form-item label="名称">
          <el-input
            v-model="form.name"
            placeholder="例如：离散数学"
            maxlength="20"
            show-word-limit
            @keyup.enter="submitCreate"
          />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" :predefine="palette" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="manageOpen" title="管理学科" width="620">
      <div class="manage-head">
        <p class="sde-hint" style="margin: 0">改名称或颜色后会自动保存。删除学科不会删除已链接的资料文件。</p>
        <el-button type="primary" size="small" @click="createFromManage">新建学科</el-button>
      </div>
      <div v-if="!subjects.length" class="sde-empty">还没有学科，点右上角「新建学科」</div>
      <div v-for="(s, i) in subjects" :key="s.id" class="manage-row">
        <div class="ord-btns">
          <button :disabled="i === 0" title="上移" @click="move(i, -1)">↑</button>
          <button :disabled="i === subjects.length - 1" title="下移" @click="move(i, 1)">↓</button>
        </div>
        <span class="dot" :style="{ background: s.color }" />
        <el-input v-model="s.name" @change="saveSubject(s, { name: s.name })" />
        <el-color-picker v-model="s.color" size="small" @change="(v) => saveSubject(s, { color: v })" />
        <el-button text type="danger" size="small" @click="removeSubject(s)">删除</el-button>
      </div>
    </el-dialog>

    <!-- 设置：外观与导入已经拆到顶栏，这里只剩个人信息 -->
    <el-dialog v-model="settingsOpen" title="设置" width="560">
      <el-tabs v-model="settingsTab">
        <!-- 个人信息 -->
        <el-tab-pane label="个人信息" name="profile">
          <p class="sde-hint">这些信息只存在本机，用来显示首页的称呼与学期。</p>
          <el-form label-width="82px" @submit.prevent>
            <el-form-item label="称呼">
              <el-input v-model="profile.student" placeholder="显示在首页欢迎语里" maxlength="20" />
            </el-form-item>
            <el-form-item label="学期">
              <el-input v-model="profile.semester" placeholder="例如：2026 秋季" maxlength="30" />
            </el-form-item>
            <el-form-item label="开学日期">
              <el-date-picker v-model="profile.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-form>
          <div class="dlg-actions">
            <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 导入：独立弹窗，从顶栏「导入」进 -->
    <el-dialog v-model="importOpen" title="导入数据" width="620">
      <p class="sde-hint" style="margin-bottom: 10px">
        支持把一份标准 JSON 一次性导入（学科、课表、日程、成绩、笔记、资料路径、知识点、外链）。
        你可以把模板和规范发给 AI，让它把你的信息整理成这个格式，再导入回来。
      </p>
      <div class="imp-actions">
        <a class="link-btn" href="/data-format/study-desktop.template.json" download>下载模板 JSON</a>
        <a class="link-btn" href="/data-format/README.md" target="_blank" rel="noopener">查看格式规范</a>
        <button class="link-btn" @click="copyPrompt">复制给 AI 的提示词</button>
      </div>

      <div class="imp-drop" @dragover.prevent @drop.prevent="onImportDrop" @click="pickImportFile">
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
        <div class="imp-big">{{ importFile ? importFile.name : "点击选择，或把 JSON 拖到这里" }}</div>
        <div class="imp-small">导入前会自动备份当前数据到 backups 目录</div>
      </div>

      <div class="imp-mode">
        <el-radio-group v-model="importMode" size="small">
          <el-radio-button value="merge">合并（同名称跳过）</el-radio-button>
          <el-radio-button value="replace">覆盖（先清空再导入）</el-radio-button>
        </el-radio-group>
      </div>

      <pre v-if="importLog" class="imp-log">{{ importLog }}</pre>

      <div class="dlg-actions">
        <el-button type="primary" :loading="importing" :disabled="!importFile" @click="doImport">
          开始导入
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import SideBrowser from "@/components/SideBrowser.vue";
import RightRail from "@/components/RightRail.vue";
import BootSplash from "@/components/BootSplash.vue";
import { useSubjectStore } from "@/stores/subjects";
import { api } from "@/api";
import { themeMode, setTheme, isDark } from "@/theme";
import { useBoot } from "@/composables/useBoot";

const { active, booted, entering, view: bootView, finish: skipBoot } = useBoot();

const route = useRoute();
const router = useRouter();
const store = useSubjectStore();
const { items: subjects } = storeToRefs(store);

const palette = ["#4f9cf9", "#7c5cff", "#e5534b", "#3fb950", "#d29922", "#db61a2", "#39c5cf"];

// 默认收起，用户展开后记住选择
const sidebarOpen = ref(localStorage.getItem("sde.sidebar") === "1");
watch(sidebarOpen, (v) => localStorage.setItem("sde.sidebar", v ? "1" : "0"));

/* ---------- 新建学科 ---------- */
const dialogOpen = ref(false);
const saving = ref(false);
const form = reactive({ name: "", color: palette[0], note: "" });

function openCreate() {
  form.name = "";
  form.color = palette[subjects.value.length % palette.length];
  form.note = "";
  dialogOpen.value = true;
}

async function submitCreate() {
  const name = form.name.trim();
  if (!name) return ElMessage.warning("请填写学科名称");
  saving.value = true;
  try {
    const item = await store.create({ name, color: form.color, note: form.note });
    dialogOpen.value = false;
    ElMessage.success("已添加");
    router.push(`/subjects/${item.id}`);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

/* ---------- 管理 ---------- */
const manageOpen = ref(false);

function createFromManage() {
  manageOpen.value = false;
  openCreate();
}

/** 上移 / 下移学科，本地先交换再整体提交顺序 */
async function move(idx, dir) {
  const list = [...subjects.value];
  const j = idx + dir;
  if (j < 0 || j >= list.length) return;
  const tmp = list[idx];
  list[idx] = list[j];
  list[j] = tmp;
  subjects.value = list;
  try {
    await store.reorder(list.map((s) => s.id));
  } catch (e) {
    ElMessage.error(e.message);
    store.load(true);
  }
}

async function saveSubject(s, patch) {
  try {
    await store.update(s.id, patch);
  } catch (e) {
    ElMessage.error(e.message);
    store.load(true);
  }
}

async function removeSubject(s) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${s.name}」？已上传的文件会保留，只是解除关联。`,
      "删除学科",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  try {
    await store.remove(s.id);
    ElMessage.success("已删除");
    if (route.params.id === s.id) router.push("/");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/* ---------- 设置 ---------- */
const settingsOpen = ref(false);
const settingsTab = ref("profile");
const importOpen = ref(false);

/** 从顶栏直接进某个设置页签 */
function openSettings(tab) {
  if (tab === "import") {
    importOpen.value = true;
    return;
  }
  settingsTab.value = tab || "profile";
  settingsOpen.value = true;
}

/* ---------- 外观：点击直接循环切换 ---------- */
const THEME_CYCLE = ["dark", "light", "auto"];
const THEME_LABEL = { dark: "深色", light: "浅色", auto: "自动" };
const curThemeLabel = computed(() => THEME_LABEL[themeMode.value] || "深色");

function cycleTheme() {
  const i = THEME_CYCLE.indexOf(themeMode.value);
  const next = THEME_CYCLE[(i + 1) % THEME_CYCLE.length];
  setTheme(next);
  const tip =
    next === "auto" ? `外观：跟随系统（当前${isDark.value ? "深色" : "浅色"}）` : `外观：${THEME_LABEL[next]}`;
  ElMessage.success(tip);
}

const profile = reactive({ student: "", semester: "", startDate: "" });
const savingProfile = ref(false);

async function loadProfile() {
  try {
    const data = await api.timetable.get();
    Object.assign(profile, {
      student: data.meta?.student || "",
      semester: data.meta?.semester || "",
      startDate: data.meta?.startDate || "",
    });
  } catch {}
}

async function saveProfile() {
  savingProfile.value = true;
  try {
    await api.timetable.saveMeta({ ...profile });
    ElMessage.success("已保存");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    savingProfile.value = false;
  }
}

/* ---------- 导入 ---------- */
const fileInput = ref(null);
const importFile = ref(null);
const importMode = ref("merge");
const importing = ref(false);
const importLog = ref("");

function pickImportFile() {
  fileInput.value?.click();
}

function onImportFile(e) {
  const f = e.target.files?.[0];
  if (f) {
    importFile.value = f;
    importLog.value = "";
  }
}

function onImportDrop(e) {
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  importFile.value = f;
  importLog.value = "";
}

async function doImport() {
  if (!importFile.value) return;
  importing.value = true;
  importLog.value = "";
  try {
    const text = await importFile.value.text();
    const payload = JSON.parse(text);
    const res = await api.importData({ mode: importMode.value, data: payload });
    importLog.value = (res.log || []).join("\n") || "导入完成";
    ElMessage.success("导入完成");
    await store.load(true);
  } catch (e) {
    importLog.value = "导入失败：" + e.message;
    ElMessage.error(e.message);
  } finally {
    importing.value = false;
  }
}

const AI_PROMPT = `我在用「学习桌面」这个本地应用。请把下面的信息整理成它要求的 JSON 格式，只输出 JSON 本身。

格式规范见：/data-format/README.md
模板见：/data-format/study-desktop.template.json

要点：
1. 顶层字段：meta / subjects / timetable / schedules / grades / notes / knowledge / links / files。
2. 学科用 name 作为唯一标识，其它数据用 subject 字段引用学科名。
3. 日期一律 YYYY-MM-DD，时间 HH:mm。
4. 课表 slot 的 day 是 1-7（周一到周日），block 是第几大节（1 起）。
5. 缺的信息直接省略该字段，不要编造。

我的信息如下：
（把课程表截图内容 / 成绩 / 待办 / 资料夹路径等粘贴在这里）`;

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(AI_PROMPT);
    ElMessage.success("提示词已复制，粘贴给 AI 即可");
  } catch {
    ElMessage.warning("复制失败，请手动选中复制");
  }
}

watch(settingsOpen, (v) => {
  if (v) loadProfile();
});

onMounted(() => store.load());
</script>

<style scoped>
.app {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 三列等分的网格：中间列自动居中，左右两侧宽度恒等，
   所以学科数量变化不会让标签整体偏移 */
.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--sde-border);
  background: var(--sde-surface);
  flex: none;
}

.tb-left {
  min-width: 0;
  display: flex;
  justify-content: flex-start;
}

.news-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 9px;
  border: 1px solid var(--sde-border);
  background: var(--sde-surface-2);
  color: var(--sde-text-2);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.4px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}

.news-btn:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.news-btn.active {
  background: color-mix(in srgb, var(--sde-accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--sde-accent) 45%, transparent);
  color: var(--sde-accent-ink);
}

.nb-chev {
  transition: transform 0.22s ease;
  opacity: 0.75;
}

.nb-chev.open {
  transform: rotate(180deg);
}

.tb-center {
  min-width: 0;
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}

.tb-center::-webkit-scrollbar {
  display: none;
}

.tb-right {
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  /* 内容比容器窄时居中，比容器宽时可从左边滚动 */
  margin: 0 auto;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 15px;
  border-radius: 9px;
  font-size: 14px;
  color: var(--sde-muted);
  text-decoration: none;
  white-space: nowrap;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.tab:hover {
  background: var(--sde-surface-2);
  color: var(--sde-text);
}

.tab.active {
  background: var(--sde-accent-soft);
  color: var(--sde-accent);
  border-color: color-mix(in srgb, var(--sde-accent) 35%, transparent);
  font-weight: 600;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--sde-border);
  color: var(--sde-text);
  border-radius: 7px;
  padding: 5px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  white-space: nowrap;
}

.icon-btn:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
}

.manage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.ord-btns {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: none;
}

.ord-btns button {
  width: 22px;
  height: 15px;
  padding: 0;
  border: 1px solid var(--sde-border);
  border-radius: 4px;
  background: transparent;
  color: var(--sde-muted);
  font-size: 9px;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
}

.ord-btns button:hover:not(:disabled) {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.ord-btns button:disabled {
  opacity: 0.3;
  cursor: default;
}

.manage-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--sde-border);
}

.manage-row:last-child {
  border-bottom: none;
}

/* 外观按钮：图标 + 当前档位文字 */
.theme-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dlg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

/* 导入 */
.imp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.link-btn {
  font-size: 12.5px;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: var(--sde-text-2);
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
  transition: all 0.15s;
}

.link-btn:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.imp-drop {
  border: 1px dashed var(--sde-border-strong);
  border-radius: 12px;
  padding: 22px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}

.imp-drop:hover {
  border-color: var(--sde-accent);
  background: var(--sde-accent-soft);
}

.imp-big {
  font-size: 13.5px;
  color: var(--sde-text-2);
}

.imp-small {
  font-size: 12px;
  color: var(--sde-muted);
  margin-top: 4px;
}

.imp-mode {
  margin: 12px 0;
}

.imp-log {
  margin: 0 0 12px;
  max-height: 160px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--sde-surface-2);
  border: 1px solid var(--sde-border);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sde-text-2);
  white-space: pre-wrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-leave-to {
  opacity: 0;
}
</style>
