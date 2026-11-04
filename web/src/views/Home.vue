<template>
  <div class="home">
    <!-- 标题行 -->
    <div class="hero">
      <h1 class="hero-title">{{ greeting }}，{{ meta.student || "同学" }}</h1>
      <p class="hero-sub">
        <span v-if="meta.semester">{{ meta.semester }}</span>
        <span v-if="weekNo"> · 第 {{ weekNo }} 周</span>
        <span> · {{ todayText }}</span>
      </p>
    </div>

    <!-- 名言 + 天数 -->
    <div class="row-top">
      <div class="quote-card" :style="bgStyle">
        <div class="q-inner">
          <div class="q-text">{{ quote.text }}</div>
          <div class="q-from">— {{ quote.from }}</div>
        </div>
        <span v-if="wallpaperCredit" class="q-credit">{{ wallpaperCredit }}</span>
        <button class="q-refresh" title="换一条" @click="refreshQuote">换一换</button>
      </div>

      <div class="day-card">
        <div class="dc-label">大学已开始</div>
        <div class="dc-num">{{ daysSinceStart }}<span class="dc-unit">天</span></div>
        <div class="dc-divider" />
        <div class="dc-stats">
          <span>今天 <b>{{ todaySlots.length }}</b> 节课</span>
          <span>待办 <b>{{ openCount }}</b></span>
          <span :class="{ warn: overdueCount > 0 }">逾期 <b>{{ overdueCount }}</b></span>
        </div>
      </div>
    </div>

    <!-- 课表 + 日程 -->
    <div class="row-mid">
      <section class="sde-card">
        <div class="card-head">
          <h3 class="sde-card-title">本周课表</h3>
          <router-link to="/timetable" class="more">完整课表 →</router-link>
        </div>
        <TimetableGrid
          :slots="slots"
          :blocks="blocks"
          :subjects="subjects"
          :days="5"
          compact
          @cell-click="onCellClick"
          @cell-menu="onCellMenu"
        />
      </section>

      <section class="sde-card">
        <div class="card-head">
          <h3 class="sde-card-title">近期日程</h3>
          <div class="head-right">
            <span class="more">{{ openCount }} 项未完成</span>
            <button class="mini-add" @click="openNew">新建日程</button>
          </div>
        </div>
        <div class="sde-tabs sched-tabs">
          <button :class="{ on: schedTab === 'pending' }" @click="schedTab = 'pending'">
            待完成 <b v-if="pendingCount">{{ pendingCount }}</b>
          </button>
          <button :class="{ on: schedTab === 'closed' }" @click="schedTab = 'closed'">
            已完成/逾期 <b v-if="closedCount">{{ closedCount }}</b>
          </button>
        </div>
        <div class="tl-scroll">
          <ScheduleTimeline
            :groups="shownGroups"
            :overdue="schedTab === 'pending' ? overdue : []"
            :subjects="subjects"
            :empty-text="
              schedTab === 'pending' ? '没有待完成的日程，先享受一下' : '还没有已完成或逾期的日程'
            "
            @toggle="toggleSchedule"
            @edit="openEdit"
            @menu="onScheduleMenu"
            @show-overdue="schedTab = 'closed'"
          />
        </div>
      </section>
    </div>

    <!-- 学科 -->
    <section class="subjects">
      <div class="card-head">
        <h3 class="sde-card-title">学科</h3>
        <span class="more">{{ subjects.length }} 个</span>
      </div>
      <div class="subj-grid">
        <router-link
          v-for="s in subjects"
          :key="s.id"
          :to="`/subjects/${s.id}`"
          class="subj-card"
          :style="{ '--sc': s.color }"
        >
          <div class="sc-top">
            <span class="sc-name">{{ s.name }}</span>
            <span class="sc-dot" />
          </div>
          <div class="sc-meta">
            <span v-if="s.faculty?.name || s.course?.teacher">
              {{ s.faculty?.name || s.course.teacher }}
            </span>
            <span v-if="s.course?.room" class="sc-room">{{ s.course.room }}</span>
          </div>
          <div class="sc-foot">
            <span v-if="s.course?.weeks">{{ s.course.weeks }}</span>
            <span v-else>暂无课程信息</span>
          </div>
        </router-link>
      </div>
    </section>

    <!-- 日程编辑 -->
    <el-dialog v-model="editOpen" :title="form.id ? '编辑日程' : '新建日程'" width="460">
      <el-form label-width="62px" @submit.prevent>
        <el-form-item label="标题">
          <el-input v-model="form.title" maxlength="80" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="待办" value="task" />
            <el-option label="作业" value="assignment" />
            <el-option label="考试" value="exam" />
            <el-option label="项目" value="project" />
            <el-option label="活动" value="activity" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="form.due" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-picker v-model="form.time" format="HH:mm" value-format="HH:mm" placeholder="选填" style="width: 100%" />
        </el-form-item>
        <el-form-item label="学科">
          <el-select v-model="form.subjectId" clearable placeholder="选填" style="width: 100%">
            <el-option v-for="s in subjects" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="form.id" text type="danger" @click="removeSchedule">删除</el-button>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <ContextMenu ref="ctx" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import TimetableGrid from "@/components/TimetableGrid.vue";
import ScheduleTimeline from "@/components/ScheduleTimeline.vue";
import ContextMenu from "@/components/ContextMenu.vue";
import { useSubjectStore } from "@/stores/subjects";
import { useScheduleStore } from "@/stores/schedules";
import { api } from "@/api";

const router = useRouter();
const subjectStore = useSubjectStore();
const scheduleStore = useScheduleStore();
const { items: subjects } = storeToRefs(subjectStore);
const { grouped, overdue, open: openList } = storeToRefs(scheduleStore);

const slots = ref([]);
const blocks = ref([]);
const meta = reactive({ semester: "", student: "", startDate: "" });

const openCount = computed(() => openList.value.length);
const overdueCount = computed(() => overdue.value.length);

/* ---------- 时间 ---------- */
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();

const greeting = computed(() => {
  const h = now.getHours();
  if (h < 6) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
});

const todayText = computed(() => {
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 ${week}`;
});

const todayWeekday = computed(() => (now.getDay() === 0 ? 7 : now.getDay()));

const todaySlots = computed(() => slots.value.filter((s) => s.day === todayWeekday.value));

const daysSinceStart = computed(() => {
  if (!meta.startDate) return "—";
  const start = new Date(meta.startDate + "T00:00:00");
  const diff = Math.floor((now - start) / 86400000) + 1;
  return diff < 1 ? 0 : diff;
});

const weekNo = computed(() => {
  const d = daysSinceStart.value;
  return typeof d === "number" && d > 0 ? Math.floor((d - 1) / 7) + 1 : 0;
});

/* ---------- 名言 + 配图 ---------- */
const QUOTES = [
  { text: "真正的勤勉，从来不是长时间的无脑劳作，而是持续高质量地解决真问题。", from: "学习笔记" },
  { text: "你现在做的一页笔记，可能是考试前一小时救你的那一页。", from: "过来人" },
  { text: "所有的一鸣惊人，其实都是厚积薄发。", from: "《人民日报》" },
  { text: "不要因为走得慢就停下，怕的是你连方向都没有。", from: "随手记" },
  { text: "把不会的题抄下来，比刷十道会做的题更有价值。", from: "错题本法" },
  { text: "大学的自由，是把时间花在真正想学会的东西上。", from: "自勉" },
  { text: "复习不是重新学一遍，是把记忆的绳子再系紧一次。", from: "艾宾浩斯" },
  { text: "今天多熬的半小时，明天会以另一种方式还给你。", from: "匿名" },
  { text: "你不需要很厉害才能开始，但你需要开始才会很厉害。", from: "网络" },
  { text: "知识的复利，靠的是持续不断的小额投入。", from: "自学手册" },
  { text: "慢一点没关系，方向对了就行。", from: "写给自己" },
  { text: "把大目标切成今天能做完的那一小块。", from: "执行法则" },
  { text: "没有白走的路，每一步都算数。", from: "李宗盛" },
  { text: "读书的意义，是让你有底气做选择，而不是被选择。", from: "自勉" },
  { text: "所有自律的本质，都是对未来自己的善意。", from: "随笔" },
];

const quoteIdx = ref(Math.floor(Math.random() * QUOTES.length));
const quote = computed(() => QUOTES[quoteIdx.value]);

/* 配图：必应每日壁纸，服务端缓存到本地；拿不到就退回内置图 */
const wallpapers = ref([]);
const wpIdx = ref(-1);
const wallpaper = computed(() => (wpIdx.value >= 0 ? wallpapers.value[wpIdx.value] : null));
const wallpaperSrc = computed(() => wallpaper.value?.src || "/campus.jpg");
const wallpaperCredit = computed(() => wallpaper.value?.credit || "");

const bgStyle = computed(() => ({
  backgroundImage:
    'linear-gradient(105deg, rgba(9, 14, 17, 0.92) 0%, rgba(9, 14, 17, 0.62) 45%, rgba(9, 14, 17, 0.18) 100%), url("' +
    wallpaperSrc.value +
    '")',
  backgroundSize: "cover",
  backgroundPosition: "center 62%",
}));

async function loadWallpaper() {
  try {
    const data = await api.wallpaper.list();
    wallpapers.value = data.items || [];
    wpIdx.value = wallpapers.value.length ? Math.floor(Math.random() * wallpapers.value.length) : -1;
  } catch {
    wallpapers.value = [];
    wpIdx.value = -1;
  }
}

function refreshQuote() {
  let next = quoteIdx.value;
  while (next === quoteIdx.value) next = Math.floor(Math.random() * QUOTES.length);
  quoteIdx.value = next;

  if (wallpapers.value.length > 1) {
    let i = wpIdx.value;
    while (i === wpIdx.value) i = Math.floor(Math.random() * wallpapers.value.length);
    wpIdx.value = i;
  }
}

/* ---------- 加载 ---------- */
async function loadTimetable() {
  try {
    const data = await api.timetable.get();
    slots.value = data.slots || [];
    blocks.value = data.blocks || [];
    Object.assign(meta, data.meta || {});
  } catch (e) {
    ElMessage.error("课表加载失败：" + e.message);
  }
}

function onCellMenu(e, payload) {
  const { slot } = payload;
  const items = [];
  if (slot?.subjectId) items.push({ key: "subject", label: "打开学科" });
  items.push({ key: "timetable", label: slot ? "去课表页编辑" : "去填这节课" });

  ctx.value?.open(e, items, (k) => {
    if (k === "subject") router.push(`/subjects/${slot.subjectId}`);
    else router.push("/timetable");
  });
}

function onCellClick({ slot }) {
  if (slot?.subjectId) router.push(`/subjects/${slot.subjectId}`);
  else router.push("/timetable");
}

/* ---------- 日程 ---------- */
async function toggleSchedule(item) {
  try {
    await scheduleStore.toggle(item);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

const editOpen = ref(false);
const saving = ref(false);
const ctx = ref(null);
const form = reactive({ id: "", title: "", type: "task", due: "", time: "", subjectId: null, note: "" });

const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- 日程子标签：待完成 / 已完成·逾期 ---------- */
const schedTab = ref("pending");

/** 待完成 = 未完成且没过期（过期的单独放另一栏，免得混在一起看不清） */
const pendingCount = computed(() => grouped.value.reduce((n, g) => n + g.list.length, 0));

/** 已完成或已逾期，按日期倒序 */
const closedList = computed(() => {
  const t = todayStr();
  return scheduleStore.items
    .filter((i) => i.done || i.due < t)
    .sort((a, b) => (b.due || "").localeCompare(a.due || ""));
});

const closedCount = computed(() => closedList.value.length);

const shownGroups = computed(() => {
  if (schedTab.value === "pending") return grouped.value;
  const map = new Map();
  for (const i of closedList.value) {
    if (!map.has(i.due)) map.set(i.due, []);
    map.get(i.due).push(i);
  }
  return [...map.entries()].map(([date, list]) => ({ date, list }));
});

function openNew() {
  Object.assign(form, {
    id: "",
    title: "",
    type: "task",
    due: todayStr(),
    time: "",
    subjectId: null,
    note: "",
  });
  editOpen.value = true;
}

function onScheduleMenu(e, item) {
  ctx.value?.open(
    e,
    [
      { key: "edit", label: "编辑" },
      { key: "toggle", label: item.done ? "标记未完成" : "标记完成" },
      { key: "delete", label: "删除", danger: true },
    ],
    (key) => {
      if (key === "edit") openEdit(item);
      else if (key === "toggle") toggleSchedule(item);
      else if (key === "delete") deleteSchedule(item);
    }
  );
}

async function deleteSchedule(item) {
  try {
    await scheduleStore.remove(item.id);
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function openEdit(item) {
  Object.assign(form, {
    id: item.id,
    title: item.title,
    type: item.type,
    due: item.due,
    time: item.time || "",
    subjectId: item.subjectId || null,
    note: item.note || "",
  });
  editOpen.value = true;
}

async function saveEdit() {
  if (!form.title.trim()) return ElMessage.warning("请填写标题");
  saving.value = true;
  try {
    const payload = {
      title: form.title.trim(),
      type: form.type,
      due: form.due,
      time: form.time || "",
      subjectId: form.subjectId,
      note: form.note,
    };
    if (form.id) await scheduleStore.update(form.id, payload);
    else await scheduleStore.create(payload);
    editOpen.value = false;
    ElMessage.success("已保存");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function removeSchedule() {
  try {
    await scheduleStore.remove(form.id);
    editOpen.value = false;
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(async () => {
  await subjectStore.load();
  loadWallpaper();
  await Promise.all([loadTimetable(), scheduleStore.load()]);
});
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-title {
  margin: 0 0 4px;
  font-size: 26px;
  font-weight: 680;
  letter-spacing: 0.3px;
}

.hero-sub {
  margin: 0;
  color: var(--sde-muted);
  font-size: 13.5px;
}

/* 名言 + 天数 */
.row-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px;
  gap: 14px;
}

@media (max-width: 900px) {
  .row-top {
    grid-template-columns: 1fr;
  }
}

.quote-card {
  position: relative;
  min-height: 168px;
  border-radius: var(--sde-radius);
  border: 1px solid var(--sde-border);
  padding: 26px 30px;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.q-inner {
  position: relative;
  z-index: 1;
  max-width: 640px;
}

.q-text {
  font-size: 19.5px;
  line-height: 1.75;
  font-weight: 500;
  color: #f2f6fb;
  letter-spacing: 0.4px;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
}

.q-from {
  margin-top: 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}

.q-refresh {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 1;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 11.5px;
  padding: 4px 11px;
  border-radius: 7px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  font-family: inherit;
  transition: background 0.15s;
}

.q-refresh:hover {
  background: rgba(255, 255, 255, 0.22);
}

/* 图片出处：小号浅色，贴在左下角 */
.q-credit {
  position: absolute;
  left: 20px;
  bottom: 12px;
  z-index: 1;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.42);
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-card {
  background: var(--sde-surface);
  border: 1px solid var(--sde-border);
  border-radius: var(--sde-radius);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.dc-label {
  font-size: 12px;
  color: var(--sde-muted);
}

.dc-num {
  font-size: 48px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--sde-accent);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}

.dc-unit {
  font-size: 15px;
  margin-left: 5px;
  color: var(--sde-muted);
  font-weight: 500;
}

.dc-divider {
  height: 1px;
  background: var(--sde-border);
  margin: 12px 0 10px;
}

.dc-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 12.5px;
  color: var(--sde-muted);
}

.dc-stats b {
  color: var(--sde-text);
  font-variant-numeric: tabular-nums;
}

.dc-stats .warn b {
  color: #e5a04b;
}

/* 课表 + 日程 */
.row-mid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 1fr);
  gap: 14px;
  align-items: stretch;
}

.row-mid > .sde-card {
  display: flex;
  flex-direction: column;
}

@media (max-width: 1100px) {
  .row-mid {
    grid-template-columns: 1fr;
  }
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.card-head .sde-card-title {
  margin: 0;
}

.more {
  font-size: 11.5px;
  color: var(--sde-muted);
  text-decoration: none;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mini-add {
  background: transparent;
  border: 1px solid var(--sde-border);
  color: var(--sde-text-2);
  font-size: 12px;
  padding: 3px 11px;
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.mini-add:hover {
  border-color: var(--sde-accent);
  color: var(--sde-accent);
  background: var(--sde-accent-soft);
}

a.more:hover {
  color: var(--sde-accent);
}

.tl-scroll {
  flex: 1;
  min-height: 180px;
  max-height: 430px;
  overflow-y: auto;
  padding-right: 4px;
}

.sched-tabs {
  margin: -2px 0 10px;
}

/* 学科 */
.subj-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.subj-card {
  position: relative;
  display: block;
  padding: 12px 14px 12px 16px;
  background: var(--sde-surface);
  border: 1px solid var(--sde-border);
  border-radius: 12px;
  text-decoration: none;
  color: var(--sde-text);
  overflow: hidden;
  transition: all 0.15s;
}

.subj-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--sc);
}

.subj-card:hover {
  border-color: color-mix(in srgb, var(--sc) 55%, var(--sde-border));
  transform: translateY(-1px);
}

.sc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.sc-name {
  font-size: 15.5px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sc);
  flex: none;
}

.sc-meta {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--sde-muted);
  overflow: hidden;
}

.sc-room {
  opacity: 0.75;
}

.sc-foot {
  margin-top: 4px;
  font-size: 11.5px;
  color: #5d6875;
}
</style>
