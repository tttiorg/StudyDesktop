<template>
  <div v-if="subject" class="subject-page">
    <!-- 顶部：学科信息 + 教师 -->
    <header class="s-top">
      <div class="s-left">
        <div class="s-title-row">
          <span class="s-dot" :style="{ background: subject.color }" />
          <h1 class="s-name">{{ subject.name }}</h1>
          <button class="mini-btn" @click="noteDlgOpen = true">编辑备注</button>
        </div>
        <div class="s-when">
          <template v-if="whenText">{{ whenText }}</template>
          <template v-else>课表里还没有这门课的时间</template>
        </div>
        <div class="s-tags">
          <span v-if="subject.course?.room" class="tag">{{ subject.course.room }}</span>
          <span v-if="subject.course?.weeks" class="tag">{{ subject.course.weeks }}</span>
          <span v-if="subject.course?.classCode" class="tag">{{ subject.course.classCode }}</span>
          <span v-if="subject.course?.fullName" class="tag full">{{ subject.course.fullName }}</span>
          <a class="tag bb-link" :href="bbUrl" target="_blank" rel="noopener" title="打开 Blackboard 课程页">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                d="M4 5.5h6.2a3 3 0 0 1 2.4 4.9A3.2 3.2 0 0 1 10.8 17H4Z M4 10.4h6.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
              />
              <path
                d="M13.6 8.8h4.2a2.7 2.7 0 0 1 2.2 4.2 2.9 2.9 0 0 1 2 4.6h-8.4Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
              />
            </svg>
            Blackboard
          </a>
        </div>
        <p v-if="subject.note" class="s-note">{{ subject.note }}</p>
      </div>

      <FacultyCard
        :faculty="subject.faculty"
        :default-name="subject.course?.teacher || ''"
        @update="saveFaculty"
      />
    </header>

    <!-- 三列：左 成绩 / 中 知识点 + 笔记 / 右 任务 + 资料，宽度比 2:3:3 -->
    <div class="grid3">
      <!-- 左列 -->
      <div class="col">
        <section class="panel">
          <header class="panel-head">
            <span class="ph-title">成绩</span>
            <span class="ph-sub">{{ avgText }}</span>
            <button class="ph-add" title="添加成绩" @click="openGrade()">+</button>
          </header>
          <div class="panel-body">
            <div v-if="!grades.length" class="panel-empty">还没有成绩记录</div>
            <template v-else>
              <div class="grade-total">
                <div class="gt-main">
                  <span class="gt-label">总分</span>
                  <span class="gt-value">{{ totalScore }}<em>/{{ totalFull }}</em></span>
                </div>
                <span class="gt-rate" :class="rateClass">{{ totalRate }}%</span>
                <span class="gt-count">{{ scoredCount }} 项</span>
              </div>
              <div class="grade-list">
                <div
                  v-for="g in grades"
                  :key="g.id"
                  class="grade-row"
                  @click="openGrade(g)"
                  @contextmenu.prevent="onGradeMenu($event, g)"
                >
                  <span class="g-name">{{ g.name }}</span>
                  <span class="g-extra" v-if="g.note">{{ g.note }}</span>
                  <span class="g-score" :class="scoreClass(g)"
                    >{{ g.score ?? "-" }}<em>/{{ g.full }}</em></span
                  >
                  <span class="g-weight">{{ g.weight ? g.weight + "%" : "" }}</span>
                </div>
              </div>
            </template>
          </div>
        </section>
      </div>

      <!-- 中列 -->
      <div class="col">
        <!-- 待解决知识点 -->
        <section class="panel">
          <header class="panel-head">
            <span class="ph-title">待解决知识点</span>
            <span v-if="kwDue" class="ph-due">{{ kwDue }} 个待复习</span>
            <button class="ph-add" title="添加知识点" @click="kwRef?.openCreate()">+</button>
          </header>
          <div class="panel-body">
            <KnowledgePanel ref="kwRef" :subject-id="id" @changed="onKwChanged" />
          </div>
        </section>

        <!-- 笔记轮播 -->
        <section class="panel">
          <header class="panel-head">
            <span class="ph-title">笔记</span>
            <span class="ph-sub">{{ notes.length }} 条 · 卡片右上 + 可加进复习</span>
            <button class="ph-add" title="新建笔记" @click="openNote()">+</button>
          </header>
          <div class="panel-body notes-body">
            <NotesCarousel
              :notes="notes"
              @open="openNote"
              @create="openNote()"
              @review="noteToReview"
              @menu="onNoteMenu"
            />
          </div>
        </section>
      </div>

      <!-- 右列 -->
      <div class="col">
        <!-- 任务 -->
        <section class="panel">
          <header class="panel-head">
            <span class="ph-title">任务</span>
            <span class="ph-sub">{{ works.length }} 项</span>
            <button class="ph-add" title="添加任务" @click="openWork()">+</button>
          </header>
          <div class="panel-body">
            <div class="sde-tabs task-tabs">
              <button :class="{ on: taskTab === 'open' }" @click="taskTab = 'open'">
                未完成 <b v-if="openWorks.length">{{ openWorks.length }}</b>
              </button>
              <button :class="{ on: taskTab === 'done' }" @click="taskTab = 'done'">
                已完成 {{ doneWorks.length }}
              </button>
            </div>

            <div v-if="!shownWorks.length" class="panel-empty">
              {{ taskTab === "done" ? "还没有已完成的任务" : "没有未完成的任务" }}
            </div>
            <div v-else class="task-list">
              <div
                v-for="w in shownWorks"
                :key="w.id"
                class="task-row"
                :class="{ done: w.done }"
                @contextmenu.prevent="onWorkMenu($event, w)"
              >
                <div class="t-main" @click="openWork(w)">
                  <div class="t-title">{{ w.title }}</div>
                  <div v-if="w.note" class="t-note">{{ w.note }}</div>
                </div>
                <span class="t-due">{{ shortDate(w.due) }}</span>
                <button class="t-check" @click="toggleWork(w)">✓</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 资料 -->
        <section class="panel">
          <header class="panel-head">
            <span class="ph-title">资料</span>
            <span v-if="!selectMode" class="ph-sub">{{ files.length }} 个</span>
            <span v-else class="ph-sub">已选 {{ selected.length }} / {{ files.length }}</span>

            <div class="ph-actions">
              <template v-if="selectMode">
                <button class="ph-txt" @click="toggleAll">{{ allSelected ? "取消全选" : "全选" }}</button>
                <button class="ph-txt danger" :disabled="!selected.length" @click="deleteSelected">
                  删除
                </button>
                <button class="ph-txt" @click="exitSelect">完成</button>
              </template>
              <template v-else>
                <button class="ph-sync" title="重新扫描映射的文件夹" @click="syncFolders">↻</button>
                <button class="ph-txt" title="选择多个资料一起删除" @click="enterSelect">选择</button>
                <el-dropdown trigger="click" :show-arrow="false" @command="onAddFile">
                  <button class="ph-add ph-add-tight" title="添加资料">+</button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="file">选择本地文件</el-dropdown-item>
                      <el-dropdown-item command="folder">映射整个文件夹（含子文件夹）</el-dropdown-item>
                      <el-dropdown-item command="path">手动输入路径</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </div>
          </header>
          <div class="panel-body">
            <div v-if="!files.length" class="panel-empty">点右上角 +，链接本地文件进来</div>
            <div v-else class="file-grid">
              <div
                v-for="f in files"
                :key="f.id"
                class="file-card"
                :class="{ missing: f.missing, pinned: f.pinned, picked: isPicked(f) }"
                :title="f.missing ? '原文件已移动或删除\n' + (f.path || '') : f.name + '\n' + (f.path || '')"
                @click="onFileClick(f)"
                @contextmenu.prevent="fileMenu($event, f)"
              >
                <span v-if="selectMode" class="pick-dot" :class="{ on: isPicked(f) }">✓</span>
                <button
                  v-else
                  class="pin-btn"
                  :class="{ on: f.pinned }"
                  :title="f.pinned ? '取消置顶' : '置顶'"
                  @click.stop="togglePin(f)"
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path
                      d="M9.5 1.5 14.5 6.5 12.6 8.4 12.2 8 8.8 11.4 8.9 13.6 7.5 15 1 8.5 2.4 7.1 4.6 7.2 8 3.8 7.6 3.4Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <div v-if="kindOf(f) === 'img' && !f.missing" class="fthumb">
                  <img :src="api.files.rawUrl(f.id)" :alt="f.name" loading="lazy" />
                </div>
                <div v-else class="ficon" :data-kind="kindOf(f)">
                  <span class="ficon-ext">{{ extOf(f.name) }}</span>
                </div>
                <div class="fname">{{ f.name }}</div>
                <div v-if="relDir(f)" class="fsub">{{ relDir(f) }}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 成绩 -->
    <el-dialog v-model="gradeOpen" :title="gradeForm.id ? '编辑成绩' : '添加成绩'" width="440">
      <el-form label-width="66px" @submit.prevent>
        <el-form-item label="名称">
          <el-input v-model="gradeForm.name" placeholder="如 期中考试" maxlength="60" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="gradeForm.type" style="width: 100%">
            <el-option label="作业" value="homework" />
            <el-option label="小测" value="quiz" />
            <el-option label="考试" value="exam" />
            <el-option label="项目" value="project" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="分数">
          <div style="display: flex; gap: 8px; width: 100%; align-items: center">
            <el-input-number v-model="gradeForm.score" :min="0" :precision="1" style="flex: 1" />
            <span style="color: var(--sde-muted)">/</span>
            <el-input-number v-model="gradeForm.full" :min="1" style="flex: 1" />
          </div>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="gradeForm.weight" :min="0" :max="100" />
          <span style="margin-left: 8px; font-size: 12.5px; color: var(--sde-muted)">%（选填）</span>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="gradeForm.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="gradeForm.note" placeholder="选填" maxlength="60" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="gradeForm.id" text type="danger" @click="removeGrade">删除</el-button>
        <el-button @click="gradeOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveGrade">保存</el-button>
      </template>
    </el-dialog>

    <!-- 任务 -->
    <el-dialog v-model="workOpen" :title="workForm.id ? '编辑任务' : '添加任务'" width="440">
      <el-form label-width="66px" @submit.prevent>
        <el-form-item label="标题">
          <el-input v-model="workForm.title" maxlength="80" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="workForm.type" style="width: 100%">
            <el-option label="作业" value="assignment" />
            <el-option label="考试" value="exam" />
            <el-option label="项目" value="project" />
            <el-option label="待办" value="task" />
            <el-option label="活动" value="activity" />
          </el-select>
        </el-form-item>
        <el-form-item label="截止">
          <el-date-picker v-model="workForm.due" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-picker v-model="workForm.time" format="HH:mm" value-format="HH:mm" placeholder="选填" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="workForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="workForm.id" text type="danger" @click="removeWork">删除</el-button>
        <el-button @click="workOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveWork">保存</el-button>
      </template>
    </el-dialog>

    <!-- 笔记 -->
    <el-dialog v-model="noteOpen" :title="noteForm.id ? '编辑笔记' : '新建笔记'" width="680">
      <el-input v-model="noteForm.title" placeholder="标题" maxlength="80" style="margin-bottom: 12px" />
      <el-input v-model="noteForm.content" type="textarea" :rows="16" placeholder="正文…" resize="vertical" />
      <template #footer>
        <el-button v-if="noteForm.id" text type="danger" @click="removeNote">删除</el-button>
        <el-button v-if="noteForm.id" text @click="noteToReview(noteForm)">加入复习</el-button>
        <el-button @click="noteOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveNoteItem">保存</el-button>
      </template>
    </el-dialog>

    <!-- 备注 -->
    <el-dialog v-model="noteDlgOpen" title="学科备注" width="540">
      <el-input v-model="noteDraft" type="textarea" :rows="8" placeholder="考核比例、教材、老师要求…" />
      <template #footer>
        <el-button @click="noteDlgOpen = false">取消</el-button>
        <el-button type="primary" @click="saveNote">保存</el-button>
      </template>
    </el-dialog>

    <ContextMenu ref="ctx" />

    <!-- 手动输入路径 -->
    <el-dialog v-model="pathOpen" title="链接本地文件" width="560">
      <p class="sde-hint" style="margin-top: 0">
        每行一个绝对路径，可以拖文件到下面的框里自动填入（拖入后读取真实路径）
      </p>
      <el-input
        v-model="pathDraft"
        type="textarea"
        :rows="5"
        placeholder="D:\学习资料\高数\第三章.pdf"
        @drop.native.prevent="onDropPaths"
      />
      <template #footer>
        <el-button @click="pathOpen = false">取消</el-button>
        <el-button type="primary" @click="submitPaths">链接</el-button>
      </template>
    </el-dialog>
  </div>

  <div v-else class="sde-empty">学科不存在，可能已被删除</div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "@/api";
import { useSubjectStore } from "@/stores/subjects";
import FacultyCard from "@/components/FacultyCard.vue";
import KnowledgePanel from "@/components/KnowledgePanel.vue";
import NotesCarousel from "@/components/NotesCarousel.vue";
import ContextMenu from "@/components/ContextMenu.vue";

const props = defineProps({ id: { type: String, required: true } });

const store = useSubjectStore();
const { items: subjects } = storeToRefs(store);
const subject = computed(() => subjects.value.find((s) => s.id === props.id) || null);

const saving = ref(false);
const dragging = ref(false);

/* 备注相关要放在 watch 之前声明，避免 immediate 回调触发暂时性死区 */
const noteDraft = ref("");
const noteDlgOpen = ref(false);

/* 资料多选状态同理，watch 里会重置它们 */
const selectMode = ref(false);
const selected = ref([]);

const grades = ref([]);
const works = ref([]);
const notes = ref([]);
const files = ref([]);
const slots = ref([]);
const blocks = ref([]);

const kwRef = ref(null);
const kwDue = ref(0);
const ctx = ref(null);

/** 学科对应的 Blackboard 课程页，没设置就回落到 BB 首页 */
const bbUrl = computed(
  () => subject.value?.bbUrl || "https://bb.sustech.edu.cn"
);

/* ---------- 上课时间 ---------- */
const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const whenText = computed(() => {
  const mine = slots.value.filter((s) => s.subjectId === props.id);
  if (!mine.length) return "";
  return mine
    .sort((a, b) => a.day - b.day || a.block - b.block)
    .map((s) => {
      const b = blocks.value.find((x) => x.index === s.block);
      return `${DAYS[s.day - 1]} ${b ? b.label : "第" + s.block + "节"}`;
    })
    .join(" · ");
});

/* ---------- 加载 ---------- */
async function loadAll() {
  const sid = props.id;
  try {
    const [tt, g, s, n, f] = await Promise.all([
      api.timetable.get(),
      api.grades.list({ subjectId: sid }),
      api.schedules.list({ subjectId: sid }),
      api.notes.list({ subjectId: sid }),
      api.files.list({ subjectId: sid, category: "material" }),
    ]);
    slots.value = tt.slots || [];
    blocks.value = tt.blocks || [];
    grades.value = g.items || [];
    works.value = s.items || [];
    notes.value = n.items || [];
    files.value = f.items || [];
  } catch (e) {
    ElMessage.error("加载失败：" + e.message);
  }
}

async function reloadFiles() {
  const f = await api.files.list({ subjectId: props.id, category: "material" });
  files.value = f.items || [];
}

watch(
  () => props.id,
  () => {
    noteDraft.value = subject.value?.note || "";
    exitSelect();
    loadAll();
  },
  { immediate: true }
);

watch(subject, (s) => {
  if (s) noteDraft.value = s.note || "";
});

const openWorks = computed(() => works.value.filter((w) => !w.done));
const doneWorks = computed(() => works.value.filter((w) => w.done));

/* 任务面板的子标签 */
const taskTab = ref("open");
const shownWorks = computed(() => (taskTab.value === "done" ? doneWorks.value : openWorks.value));

const avgText = computed(() => {
  const w = grades.value.filter((g) => g.score != null && g.weight);
  if (w.length) {
    const sw = w.reduce((s, g) => s + g.weight, 0);
    const sum = w.reduce((s, g) => s + (g.score / (g.full || 100)) * 100 * g.weight, 0);
    if (sw) return "加权 " + (sum / sw).toFixed(1);
  }
  const all = grades.value.filter((g) => g.score != null);
  if (!all.length) return "";
  const avg = all.reduce((s, g) => s + (g.score / (g.full || 100)) * 100, 0) / all.length;
  return "平均 " + avg.toFixed(1);
});

/* 成绩置顶的总分卡：得分求和 / 满分求和 */
const scored = computed(() => grades.value.filter((g) => g.score != null));
const scoredCount = computed(() => scored.value.length);
const totalScore = computed(() =>
  scored.value.reduce((s, g) => s + (Number(g.score) || 0), 0)
);
const totalFull = computed(() =>
  scored.value.reduce((s, g) => s + (Number(g.full) || 0), 0)
);
const totalRate = computed(() => {
  const f = totalFull.value;
  if (!f) return "0.0";
  return ((totalScore.value / f) * 100).toFixed(1);
});
const rateClass = computed(() => {
  const r = Number(totalRate.value);
  if (r >= 90) return "good";
  if (r >= 75) return "ok";
  return "bad";
});

/**
 * 单条成绩的得分率配色：
 *   得分 ≥ 90%  绿
 *   60% ~ 89%   黄
 *   得分 < 60%  红
 * 满分缺失或分数缺失时不着色，保持中性。
 */
function scoreClass(g) {
  const s = Number(g.score);
  const f = Number(g.full);
  if (!Number.isFinite(s) || !Number.isFinite(f) || f <= 0) return "";
  const rate = (s / f) * 100;
  if (rate >= 90) return "s-good";
  if (rate >= 60) return "s-mid";
  return "s-bad";
}

/* ---------- 教师 ---------- */
async function saveFaculty(faculty) {
  try {
    await store.update(props.id, { faculty });
    ElMessage.success(faculty ? "教师信息已保存" : "已清除教师信息");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/* ---------- 成绩 ---------- */
const gradeOpen = ref(false);
const gradeForm = reactive({
  id: "",
  name: "",
  type: "homework",
  score: null,
  full: 100,
  weight: null,
  date: "",
  note: "",
});

function openGrade(g) {
  Object.assign(gradeForm, {
    id: g?.id || "",
    name: g?.name || "",
    type: g?.type || "homework",
    score: g?.score ?? null,
    full: g?.full ?? 100,
    weight: g?.weight ?? null,
    date: g?.date || "",
    note: g?.note || "",
  });
  gradeOpen.value = true;
}

async function saveGrade() {
  if (!gradeForm.name.trim()) return ElMessage.warning("请填写名称");
  saving.value = true;
  try {
    const payload = {
      name: gradeForm.name.trim(),
      type: gradeForm.type,
      score: gradeForm.score,
      full: gradeForm.full,
      weight: gradeForm.weight,
      date: gradeForm.date,
      note: gradeForm.note,
      subjectId: props.id,
    };
    const data = gradeForm.id
      ? await api.grades.update(gradeForm.id, payload)
      : await api.grades.create(payload);
    grades.value = data.items || grades.value;
    gradeOpen.value = false;
    ElMessage.success("已保存");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function removeGrade() {
  try {
    const data = await api.grades.remove(gradeForm.id);
    grades.value = data.items || [];
    gradeOpen.value = false;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/* ---------- 任务 ---------- */
const workOpen = ref(false);
const workForm = reactive({ id: "", title: "", type: "assignment", due: "", time: "", note: "" });

function openWork(w) {
  Object.assign(workForm, {
    id: w?.id || "",
    title: w?.title || "",
    type: w?.type || "assignment",
    due: w?.due || new Date().toISOString().slice(0, 10),
    time: w?.time || "",
    note: w?.note || "",
  });
  workOpen.value = true;
}

async function saveWork() {
  if (!workForm.title.trim()) return ElMessage.warning("请填写标题");
  saving.value = true;
  try {
    const payload = {
      title: workForm.title.trim(),
      type: workForm.type,
      due: workForm.due,
      time: workForm.time || "",
      note: workForm.note,
      subjectId: props.id,
    };
    const data = workForm.id
      ? await api.schedules.update(workForm.id, payload)
      : await api.schedules.create(payload);
    works.value = data.items || works.value;
    workOpen.value = false;
    ElMessage.success("已保存");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function toggleWork(w) {
  try {
    const data = await api.schedules.update(w.id, { done: !w.done });
    works.value = data.items || works.value;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function removeWork() {
  try {
    const data = await api.schedules.remove(workForm.id);
    works.value = data.items || [];
    workOpen.value = false;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/* ---------- 笔记 ---------- */
const noteOpen = ref(false);
const noteForm = reactive({ id: "", title: "", content: "" });

function openNote(n) {
  Object.assign(noteForm, {
    id: n?.id || "",
    title: n?.title || "",
    content: n?.content || "",
  });
  noteOpen.value = true;
}

async function saveNoteItem() {
  if (!noteForm.title.trim() && !noteForm.content.trim()) return ElMessage.warning("写点内容吧");
  saving.value = true;
  try {
    const payload = {
      title: noteForm.title.trim() || "无标题",
      content: noteForm.content,
      subjectId: props.id,
    };
    const data = noteForm.id
      ? await api.notes.update(noteForm.id, payload)
      : await api.notes.create(payload);
    notes.value = data.items || notes.value;
    noteOpen.value = false;
    ElMessage.success("已保存");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function removeNote() {
  try {
    const data = await api.notes.remove(noteForm.id);
    notes.value = data.items || [];
    noteOpen.value = false;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/** 笔记一键加入复习队列 */
async function noteToReview(n) {
  try {
    await api.knowledge.create({
      title: n.title || "笔记",
      note: (n.content || "").slice(0, 400),
      subjectId: props.id,
    });
    await kwRef.value?.load();
    noteOpen.value = false;
    ElMessage.success("已加入复习队列");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/* ---------- 资料 ---------- */
const pathOpen = ref(false);
const pathDraft = ref("");

async function onAddFile(cmd) {
  if (cmd === "path") {
    pathDraft.value = "";
    pathOpen.value = true;
    return;
  }
  try {
    if (cmd === "folder") {
      const res = await fetch("/api/fs/pick-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "选择失败");
      if (!data.folder) return;
      await mapFolder(data.folder);
      return;
    }

    const res = await fetch("/api/fs/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "选择要链接的文件" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "选择失败");

    const paths = data.paths || [];
    if (!paths.length) return;
    await linkPaths(paths);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/** 映射整个文件夹：之后文件夹里增删文件，这里会自动跟着变 */
async function mapFolder(dir) {
  try {
    const res = await api.files.folder({ path: dir, subjectId: props.id, category: "material" });
    const n = res.added || 0;
    ElMessage.success(n ? `已映射，扫到 ${n} 个文件` : "已映射该文件夹（暂时是空的）");
    await reloadFiles();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/** 手动重新扫描一次所有映射的文件夹 */
async function syncFolders() {
  try {
    const res = await api.files.sync({});
    await reloadFiles();
    const { added = 0, removed = 0 } = res;
    if (added || removed) ElMessage.success(`同步完成：新增 ${added}，移除 ${removed}`);
    else ElMessage.success("已是最新");
  } catch (e) {
    ElMessage.error(e.message);
  }
}


async function submitPaths() {
  const paths = pathDraft.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!paths.length) return ElMessage.warning("请填写路径");

  try {
    // 先判断是文件还是文件夹：文件夹按「映射」处理，文件按「链接」处理
    const res = await fetch("/api/fs/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    const data = await res.json();
    const items = data.items || [];
    const dirs = items.filter((i) => i.exists && i.dir).map((i) => i.path);
    const plain = items.filter((i) => i.exists && !i.dir).map((i) => i.path);
    const lost = items.filter((i) => !i.exists);

    for (const d of dirs) await mapFolder(d);
    if (plain.length) await linkPaths(plain);
    if (lost.length) ElMessage.warning(`${lost.length} 个路径不存在，已跳过`);
    pathOpen.value = false;
  } catch (e) {
    ElMessage.error(e.message);
  }
}


/* ---------- 资料：多选 / 全选 / 批量删除 ---------- */
const pickedSet = computed(() => new Set(selected.value));
const isPicked = (f) => pickedSet.value.has(f.id);
const allSelected = computed(() => files.value.length > 0 && selected.value.length === files.value.length);

function enterSelect() {
  selectMode.value = true;
  selected.value = [];
}

function exitSelect() {
  selectMode.value = false;
  selected.value = [];
}

function togglePick(f) {
  const i = selected.value.indexOf(f.id);
  if (i < 0) selected.value.push(f.id);
  else selected.value.splice(i, 1);
}

function toggleAll() {
  selected.value = allSelected.value ? [] : files.value.map((f) => f.id);
}

function onFileClick(f) {
  if (selectMode.value) togglePick(f);
  else openFile(f);
}

async function deleteSelected() {
  const ids = [...selected.value];
  if (!ids.length) return;
  try {
    await ElMessageBox.confirm(
      `从资料库移除选中的 ${ids.length} 个？磁盘上的原文件不会被删除。`,
      "删除资料",
      { type: "warning", confirmButtonText: "移除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const id of ids) {
    try {
      await api.files.remove(id);
      ok++;
    } catch {
      fail++;
    }
  }
  await reloadFiles();
  selected.value = [];
  if (!files.value.length) selectMode.value = false;
  if (fail) ElMessage.warning(`已移除 ${ok} 个，${fail} 个失败`);
  else ElMessage.success(`已移除 ${ok} 个`);
}

/** 从资源管理器拖文件进来时，能拿到真实路径（Electron 才有）
 *  浏览器里拿不到，退化为提示手动输入 */
function onDropPaths(e) {
  const files = [...(e.dataTransfer?.files || [])];
  const paths = files.map((f) => f.path).filter(Boolean);
  if (!paths.length) {
    ElMessage.warning("浏览器拿不到拖入文件的路径，请用「选择本地文件」");
    return;
  }
  pathDraft.value = paths.join("\n");
}

async function linkPaths(paths) {
  try {
    const res = await api.files.link({ paths, subjectId: props.id, category: "material" });
    const { added = [], skipped = [] } = res;
    if (added.length) ElMessage.success(`已链接 ${added.length} 个文件`);
    if (skipped.length) ElMessage.warning(`${skipped.length} 个被跳过（${skipped[0].reason}）`);
    await reloadFiles();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function togglePin(f) {
  try {
    const res = await api.files.update(f.id, { pinned: !f.pinned });
    files.value = res.items || files.value;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function fileMenu(e, f) {
  const items = [
    { key: "pin", label: f.pinned ? "取消置顶" : "置顶" },
    { key: "open-dir", label: "在资源管理器中打开" },
    { key: "rename", label: "重命名" },
  ];
  if (f.dir) items.push({ key: "unmap", label: "取消该文件夹映射", danger: true });
  items.push({ key: "remove", label: "从资料库移除", danger: true });

  ctx.value?.open(e, items, (k) => {
    if (k === "pin") togglePin(f);
    else if (k === "open-dir") revealFile(f);
    else if (k === "rename") renameFile(f);
    else if (k === "unmap") unmapFolder(f);
    else removeFileRecord(f);
  });
}

/** 在资源管理器里定位这个文件（只打开窗口，不动文件） */
async function revealFile(f) {
  try {
    await api.fs.reveal(f.path);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/** 取消整个文件夹的映射：只解除关联，磁盘上的文件一个都不动 */
async function unmapFolder(f) {
  try {
    await ElMessageBox.confirm(
      `取消映射「${f.dir}」？资料库里的这些条目会被移除，磁盘上的文件不会被动。`,
      "取消文件夹映射",
      { type: "warning", confirmButtonText: "取消映射", cancelButtonText: "算了" }
    );
  } catch {
    return;
  }
  try {
    await fetch("/api/files/unmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: f.dir }),
    });
    await reloadFiles();
    ElMessage.success("已取消映射");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function renameFile(f) {
  try {
    const { value } = await ElMessageBox.prompt("只改显示名称，磁盘上的文件名不变", "重命名", {
      inputValue: f.name,
      confirmButtonText: "保存",
      cancelButtonText: "取消",
    });
    if (!value || !value.trim()) return;
    const res = await api.files.update(f.id, { name: value.trim() });
    files.value = res.items || files.value;
  } catch {}
}

async function removeFileRecord(f) {
  try {
    await ElMessageBox.confirm(`从资料库移除「${f.name}」？原文件不会被删除。`, "移除资料", {
      type: "warning",
      confirmButtonText: "移除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    const res = await api.files.remove(f.id);
    files.value = res.items || files.value;
    ElMessage.success("已移除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function openFile(f) {
  if (f.missing) return ElMessage.warning("原文件已移动或删除，请重新链接");
  window.open(api.files.rawUrl(f.id), "_blank", "noopener");
}

const extOf = (name) => (name.split(".").pop() || "").toLowerCase().slice(0, 4);

/** 映射文件夹里的文件会带相对子路径，这里只取它所在的那一级目录 */
function relDir(f) {
  if (!f.rel) return "";
  const i = f.rel.lastIndexOf("/");
  if (i < 0) return "";
  return f.rel.slice(0, i);
}

function kindOf(f) {
  const e = extOf(f.name);
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(e)) return "img";
  if (e === "pdf") return "pdf";
  if (["doc", "docx"].includes(e)) return "doc";
  if (["ppt", "pptx"].includes(e)) return "ppt";
  if (["xls", "xlsx", "csv"].includes(e)) return "xls";
  if (["zip", "rar", "7z"].includes(e)) return "zip";
  return "other";
}

/* ---------- 右键菜单 ---------- */
function onGradeMenu(e, g) {
  ctx.value?.open(
    e,
    [
      { key: "edit", label: "编辑成绩" },
      { key: "delete", label: "删除", danger: true },
    ],
    (k) => (k === "edit" ? openGrade(g) : deleteGradeItem(g))
  );
}

function onWorkMenu(e, w) {
  ctx.value?.open(
    e,
    [
      { key: "edit", label: "编辑任务" },
      { key: "toggle", label: w.done ? "标记未完成" : "标记完成" },
      { key: "delete", label: "删除", danger: true },
    ],
    (k) => {
      if (k === "edit") openWork(w);
      else if (k === "toggle") toggleWork(w);
      else deleteWorkItem(w);
    }
  );
}

function onNoteMenu(e, n) {
  ctx.value?.open(
    e,
    [
      { key: "edit", label: "编辑笔记" },
      { key: "review", label: "加入复习" },
      { key: "delete", label: "删除", danger: true },
    ],
    (k) => {
      if (k === "edit") openNote(n);
      else if (k === "review") noteToReview(n);
      else deleteNoteItem(n);
    }
  );
}

async function deleteGradeItem(g) {
  try {
    const data = await api.grades.remove(g.id);
    grades.value = data.items || [];
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function deleteWorkItem(w) {
  try {
    const data = await api.schedules.remove(w.id);
    works.value = data.items || [];
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function deleteNoteItem(n) {
  try {
    const data = await api.notes.remove(n.id);
    notes.value = data.items || [];
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/* ---------- 知识点 ---------- */
function onKwChanged(payload) {
  kwDue.value = payload?.dueCount || 0;
}

/* ---------- 备注 ---------- */
async function saveNote() {
  try {
    await store.update(props.id, { note: noteDraft.value });
    noteDlgOpen.value = false;
    ElMessage.success("备注已保存");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

/* ---------- 工具 ---------- */
function shortDate(v) {
  if (!v) return "";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}
</script>

<style scoped>
.subject-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部 */
.s-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.s-left {
  flex: 1;
  min-width: 0;
}

.s-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.s-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
}

.s-name {
  margin: 0;
  font-size: 24px;
  font-weight: 680;
  letter-spacing: 0.3px;
}

.mini-btn {
  margin-left: 4px;
  background: transparent;
  border: 1px solid var(--sde-border);
  color: var(--sde-muted);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.mini-btn:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.s-when {
  margin-top: 7px;
  font-size: 13.5px;
  color: var(--sde-text-2);
}

.s-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 9px;
}

.tag {
  font-size: 12.5px;
  padding: 3px 10px;
  border-radius: 7px;
  background: var(--sde-surface-2);
  color: var(--sde-text-2);
  border: 1px solid var(--sde-border);
}

.bb-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--sde-accent);
  border-color: rgba(18, 204, 216, 0.35);
  background: var(--sde-accent-soft);
  text-decoration: none;
  transition: all 0.15s;
}

.bb-link:hover {
  background: rgba(18, 204, 216, 0.2);
  border-color: var(--sde-accent);
}

.tag.full {
  color: var(--sde-muted);
  background: transparent;
}

.s-note {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--sde-muted);
  white-space: pre-wrap;
  max-width: 760px;
}

/* 三列：成绩 | 知识点+笔记 | 任务+资料，宽度比 2:3:3 */
.grid3 {
  display: grid;
  grid-template-columns: 2fr 3fr 3fr;
  /* 三列等高：短的那列（只有成绩一个 panel）会被拉伸到与最高列齐平，
     否则底部会参差不齐 */
  align-items: stretch;
  gap: 16px;
}

/* 每列内部纵向堆叠，列内各 panel 按内容比例填满列高 */
.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.col > .panel {
  flex: 1 1 auto;
}

@media (max-width: 1400px) {
  .grid3 {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 1080px) {
  .grid3 {
    grid-template-columns: 1fr;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  background: var(--sde-surface);
  border: 1px solid var(--sde-border);
  border-radius: var(--sde-radius);
  overflow: hidden;
  min-height: 250px;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sde-border);
  flex: none;
}

.ph-title {
  font-size: 14.5px;
  font-weight: 650;
}

.ph-sub {
  font-size: 11.5px;
  color: var(--sde-muted);
}

.ph-due {
  font-size: 11.5px;
  color: var(--sde-warn);
  background: rgba(211, 178, 106, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
}

.ph-add {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: var(--sde-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

/* 顶部右侧的按钮组：只有它吃 margin-left:auto，里面的按钮都靠 gap 排 */
.ph-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.ph-txt {
  height: 26px;
  padding: 0 9px;
  border-radius: 7px;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: var(--sde-text-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.ph-txt:hover:not(:disabled) {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.ph-txt.danger {
  color: var(--sde-danger);
  border-color: color-mix(in srgb, var(--sde-danger) 40%, transparent);
}

.ph-txt.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sde-danger) 14%, transparent);
  color: var(--sde-danger);
}

.ph-txt:disabled {
  opacity: 0.4;
  cursor: default;
}

/* 资料面板的同步按钮：要和 + 挨着，所以 + 不再自动顶到最右 */
.ph-sync {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: var(--sde-muted);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.ph-sync:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
}

.ph-add-tight {
  margin-left: 0;
}

.ph-add:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
  background: var(--sde-accent-soft);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 16px 14px;
  /* 不再写死 max-height：三列布局下面板要跟着列高伸缩，
     内容多时由 overflow-y 自行滚动 */
  min-height: 0;
}

.panel-empty {
  color: var(--sde-muted);
  font-size: 13px;
  text-align: center;
  padding: 30px 0;
}

/* 成绩 */
.grade-list {
  display: flex;
  flex-direction: column;
}

/* 置顶的总分卡 */
.grade-total {
  position: sticky;
  top: -10px;
  z-index: 2;
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: -10px -16px 6px;
  padding: 12px 16px;
  background: var(--sde-surface);
  border-bottom: 1px solid var(--sde-border);
}

.gt-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.gt-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--sde-muted);
}

.gt-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: var(--sde-text);
  font-variant-numeric: tabular-nums;
}

.gt-value em {
  font-style: normal;
  font-weight: 400;
  font-size: 12px;
  color: var(--sde-muted);
}

.gt-rate {
  margin-left: auto;
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  padding: 2px 8px;
  border-radius: 7px;
}

.gt-rate.good {
  color: var(--sde-ok);
  background: color-mix(in srgb, var(--sde-ok) 14%, transparent);
}

.gt-rate.ok {
  color: var(--sde-warn);
  background: color-mix(in srgb, var(--sde-warn) 14%, transparent);
}

.gt-rate.bad {
  color: var(--sde-danger);
  background: color-mix(in srgb, var(--sde-danger) 14%, transparent);
}

.gt-count {
  font-size: 11px;
  color: var(--sde-dim);
}

.grade-row {
  display: grid;
  /* 名称 | 备注(自适应) | 分数 | 权重，分数列靠右且定宽，
     这样不同长度（48/100 与 10/10）也能对齐成一条竖线 */
  grid-template-columns: minmax(0, auto) 1fr 62px 34px;
  gap: 10px;
  align-items: baseline;
  padding: 9px 4px;
  border-bottom: 1px solid var(--sde-border);
  font-size: 13.5px;
  cursor: pointer;
  border-radius: 6px;
}

.grade-row:hover {
  background: var(--sde-surface-2);
}

.g-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.g-extra {
  font-size: 11.5px;
  color: var(--sde-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.g-score {
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  text-align: right;
  justify-self: end;
  min-width: 62px;
}

/* 按得分率上色：<60% 红 / 60~89% 黄 / >=90% 绿 */
.g-score.s-good {
  color: var(--sde-ok);
}

.g-score.s-mid {
  color: var(--sde-warn);
}

.g-score.s-bad {
  color: var(--sde-danger);
}

.g-score em {
  font-style: normal;
  font-weight: 400;
  font-size: 11px;
  color: var(--sde-muted);
}

.g-weight {
  font-size: 11px;
  color: var(--sde-muted);
  width: 34px;
  text-align: right;
}

/* 任务 */
.task-tabs {
  margin-bottom: 6px;
}

.task-list {
  display: flex;
  flex-direction: column;
}

.task-row {
  display: grid;
  grid-template-columns: 1fr auto 26px;
  gap: 10px;
  align-items: center;
  padding: 8px 4px;
  border-bottom: 1px solid var(--sde-border);
  font-size: 13.5px;
}

.task-row.done .t-title {
  text-decoration: line-through;
  color: var(--sde-muted);
}

.t-main {
  min-width: 0;
  cursor: pointer;
}

.t-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.t-main:hover .t-title {
  color: var(--sde-accent);
}

.t-note {
  font-size: 11.5px;
  color: var(--sde-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.t-due {
  font-size: 11.5px;
  color: var(--sde-muted);
  font-variant-numeric: tabular-nums;
}

.t-check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: transparent;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.t-check:hover,
.task-row.done .t-check {
  border-color: var(--sde-ok);
  color: var(--sde-ok);
}

.task-row.done .t-check {
  background: rgba(95, 199, 154, 0.14);
}

/* 资料卡片：模拟电脑文件夹 */
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(94px, 1fr));
  gap: 10px;
}

.file-card {
  position: relative;
  padding: 12px 8px 10px;
  border-radius: 11px;
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  transition: all 0.15s;
}

.file-card:hover {
  background: var(--sde-surface-2);
  border-color: var(--sde-border);
}

.file-card.missing {
  opacity: 0.45;
}

/* 多选态：选中的卡片描边高亮 */
.file-card.picked {
  background: var(--sde-accent-soft);
  border-color: color-mix(in srgb, var(--sde-accent) 50%, transparent);
}

.pick-dot {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--sde-text) 42%, transparent);
  background: var(--sde-surface-3);
  color: transparent;
  font-size: 10px;
  line-height: 1;
  display: grid;
  place-items: center;
  transition: all 0.15s;
}

.pick-dot.on {
  background: var(--sde-accent);
  border-color: var(--sde-accent);
  color: #07181a;
  font-weight: 700;
}

.pin-btn {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--sde-dim);
  cursor: pointer;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: all 0.15s;
}

.file-card:hover .pin-btn {
  opacity: 1;
}

.pin-btn.on {
  opacity: 1;
  color: var(--sde-accent);
}

.pin-btn:hover {
  background: var(--sde-surface-3);
  color: var(--sde-accent);
}

/* 文件图标：用色块 + 扩展名，替代 emoji */
.ficon {
  width: 46px;
  height: 54px;
  border-radius: 6px 12px 6px 6px;
  display: grid;
  place-items: center;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #fff;
  background: #5a6675;
  position: relative;
  flex: none;
}

.ficon::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.28);
  border-radius: 0 0 0 6px;
}

.ficon[data-kind="pdf"] {
  background: #c1493a;
}
.ficon[data-kind="doc"] {
  background: #2f6fa8;
}
.ficon[data-kind="ppt"] {
  background: #c0703a;
}
.ficon[data-kind="xls"] {
  background: #2f8a5c;
}
.ficon[data-kind="img"] {
  background: #7c5cff;
}
.ficon[data-kind="zip"] {
  background: #8a7a3f;
}

.fthumb {
  width: 46px;
  height: 54px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--sde-surface-3);
  flex: none;
  display: grid;
  place-items: center;
}

.fthumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fname {
  font-size: 12px;
  line-height: 1.35;
  text-align: center;
  width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

/* 子文件夹：小号浅色，标在文件名下面 */
.fsub {
  margin-top: -3px;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--sde-dim);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 笔记区：轮播自带横向滚动，外层不纵向滚动 */
.notes-body {
  overflow-y: hidden;
  padding: 12px 14px 14px;
}
</style>
