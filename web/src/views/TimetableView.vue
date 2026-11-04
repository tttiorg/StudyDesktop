<template>
  <div class="timetable-view">
    <div class="head">
      <div>
        <h2 class="title">课程表</h2>
        <p class="sub">
          <span v-if="meta.semester">{{ meta.semester }}</span>
          <span v-if="meta.student"> · {{ meta.student }}</span>
          <span> · 点格子编辑，留空即为空闲</span>
        </p>
      </div>
      <el-button v-if="slots.length" text type="danger" size="small" @click="clearAll">
        清空课表
      </el-button>
    </div>

    <div class="sde-card tt-card">
      <TimetableGrid
        :slots="slots"
        :blocks="blocks"
        :subjects="subjects"
        :days="7"
        editable
        @cell-click="openCell"
        @cell-menu="onCellMenu"
      />
    </div>

    <ContextMenu ref="ctx" />

    <el-dialog v-model="cellOpen" :title="cellTitle" width="460">
      <el-form label-width="62px" @submit.prevent>
        <el-form-item label="课程">
          <el-input v-model="editing.name" placeholder="课程名称" maxlength="60" />
        </el-form-item>
        <el-form-item label="学科">
          <el-select v-model="editing.subjectId" clearable placeholder="关联学科" style="width: 100%">
            <el-option v-for="s in subjects" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="地点">
          <el-input v-model="editing.room" placeholder="教学楼 / 教室" maxlength="40" />
        </el-form-item>
        <el-form-item label="教师">
          <el-input v-model="editing.teacher" placeholder="选填" maxlength="40" />
        </el-form-item>
        <el-form-item label="周次">
          <el-input v-model="editing.weeks" placeholder="如 1-16周" maxlength="30" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="slotAt(editing.day, editing.block)" text type="danger" @click="clearCell">
          清空此格
        </el-button>
        <el-button @click="cellOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCell">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import TimetableGrid from "@/components/TimetableGrid.vue";
import ContextMenu from "@/components/ContextMenu.vue";
import { api } from "@/api";
import { useSubjectStore } from "@/stores/subjects";

const store = useSubjectStore();
const { items: subjects } = storeToRefs(store);

const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const slots = ref([]);
const ctx = ref(null);
const blocks = ref([]);
const meta = reactive({ semester: "", student: "", startDate: "" });
const saving = ref(false);

const map = computed(() => {
  const m = {};
  for (const s of slots.value) m[`${s.day}-${s.block}`] = s;
  return m;
});

const slotAt = (d, b) => map.value[`${d}-${b}`] || null;

const cellTitle = computed(
  () => `${days[editing.day - 1]} · ${blockLabel(editing.block)}`
);

function blockLabel(idx) {
  const b = blocks.value.find((x) => x.index === idx);
  return b ? b.label : `第${idx}块`;
}

async function load() {
  try {
    const data = await api.timetable.get();
    slots.value = data.slots || [];
    blocks.value = data.blocks || [];
    Object.assign(meta, data.meta || {});
  } catch (e) {
    ElMessage.error("课表加载失败：" + e.message);
  }
}

/* ---------- 编辑 ---------- */
const cellOpen = ref(false);
const editing = reactive({
  day: 1,
  block: 1,
  name: "",
  room: "",
  teacher: "",
  weeks: "",
  subjectId: null,
});

function openCell({ day, block, slot }) {
  editing.day = day;
  editing.block = block;
  editing.name = slot?.name || "";
  editing.room = slot?.room || "";
  editing.teacher = slot?.teacher || "";
  editing.weeks = slot?.weeks || "";
  editing.subjectId = slot?.subjectId || null;
  cellOpen.value = true;
}

function onCellMenu(e, payload) {
  const has = !!payload.slot;
  const items = [{ key: "edit", label: has ? "编辑此节" : "添加课程" }];
  if (has) items.push({ key: "clear", label: "清空此格", danger: true });

  ctx.value?.open(e, items, (k) => {
    if (k === "edit") openCell(payload);
    else if (k === "clear") {
      editing.day = payload.day;
      editing.block = payload.block;
      clearCell();
    }
  });
}

async function persist(nextSlots) {
  saving.value = true;
  try {
    const data = await api.timetable.save(nextSlots);
    slots.value = data.slots || nextSlots;
    return true;
  } catch (e) {
    ElMessage.error("保存失败：" + e.message);
    return false;
  } finally {
    saving.value = false;
  }
}

async function saveCell() {
  const e = editing;
  const rest = slots.value.filter((s) => !(s.day === e.day && s.block === e.block));
  const hasContent = e.name || e.room || e.teacher || e.subjectId;
  const next = hasContent
    ? [
        ...rest,
        {
          day: e.day,
          block: e.block,
          name: e.name,
          room: e.room,
          teacher: e.teacher,
          weeks: e.weeks,
          subjectId: e.subjectId,
        },
      ]
    : rest;
  if (await persist(next)) cellOpen.value = false;
}

async function clearCell() {
  const e = editing;
  const next = slots.value.filter((s) => !(s.day === e.day && s.block === e.block));
  if (await persist(next)) cellOpen.value = false;
}

async function clearAll() {
  try {
    await ElMessageBox.confirm("确定清空整张课表？", "清空课表", { type: "warning" });
  } catch {
    return;
  }
  try {
    await api.timetable.clear();
    slots.value = [];
    ElMessage.success("已清空");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(() => {
  store.load();
  load();
});
</script>

<style scoped>
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.title {
  margin: 0 0 3px;
  font-size: 18px;
  font-weight: 650;
}

.sub {
  margin: 0;
  color: var(--sde-muted);
  font-size: 12.5px;
}

.tt-card {
  padding: 0;
  overflow: hidden;
}
</style>
