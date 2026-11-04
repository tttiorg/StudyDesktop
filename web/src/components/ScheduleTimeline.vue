<template>
  <div class="timeline">
    <div v-if="!groups.length" class="sde-empty">
      {{ emptyText }}
    </div>

    <div v-for="g in groups" :key="g.date" class="tl-group">
      <div class="tl-date">
        <span class="tl-dot" :class="{ today: g.date === todayStr }" />
        <span class="tl-label">{{ dateLabel(g.date) }}</span>
        <span class="tl-count">{{ g.list.length }}</span>
      </div>
      <div class="tl-items">
        <div
          v-for="it in g.list"
          :key="it.id"
          class="tl-item"
          :class="[it.type, { done: it.done, late: !it.done && isLate(it) }]"
          @click="$emit('edit', it)"
          @contextmenu.prevent="$emit('menu', $event, it)"
        >
          <div class="ti-main">
            <div class="ti-title">
              <span class="ti-tag">{{ typeLabel(it.type) }}</span>
              {{ it.title }}
            </div>
            <div class="ti-meta">
              <span v-if="it.time" class="ti-time">{{ it.time }}</span>
              <span class="ti-left" :class="{ 'is-urgent': isUrgent(it) }">{{ remainText(it) }}</span>
              <span v-if="it.subjectId" class="ti-subject">{{ subjectName(it.subjectId) }}</span>
            </div>
          </div>
          <button
            class="ti-check"
            :class="{ on: it.done }"
            :title="it.done ? '标记未完成' : '标记完成'"
            @click.stop="$emit('toggle', it)"
          >
            ✓
          </button>
        </div>
      </div>
    </div>

    <div v-if="overdue.length" class="tl-overdue">
      <span>已逾期 {{ overdue.length }} 项</span>
      <button class="link-btn" @click="$emit('show-overdue')">去看</button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  groups: { type: Array, default: () => [] },
  overdue: { type: Array, default: () => [] },
  subjects: { type: Array, default: () => [] },
  emptyText: { type: String, default: "还没有日程" },
});

defineEmits(["toggle", "edit", "menu", "show-overdue"]);

const pad = (n) => String(n).padStart(2, "0");
const todayStr = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

const TYPE_LABEL = {
  assignment: "作业",
  exam: "考试",
  project: "项目",
  activity: "活动",
  task: "待办",
};

const typeLabel = (t) => TYPE_LABEL[t] || "待办";

function dateLabel(dateStr) {
  const diff = dayDiff(dateStr);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  const d = new Date(dateStr + "T00:00:00");
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`;
}

function dayDiff(dateStr) {
  const a = new Date(dateStr + "T00:00:00");
  const b = new Date(todayStr + "T00:00:00");
  return Math.round((a - b) / 86400000);
}

function remainText(it) {
  const d = dayDiff(it.due);
  if (it.done) return "已完成";
  if (d < 0) return `逾期 ${-d} 天`;
  if (d === 0) return "今天截止";
  if (d === 1) return "还剩 1 天";
  return `还剩 ${d} 天`;
}

const isLate = (it) => dayDiff(it.due) < 0;
const isUrgent = (it) => !it.done && dayDiff(it.due) <= 1;

function subjectName(id) {
  const s = props.subjects.find((x) => x.id === id);
  return s ? s.name : "";
}
</script>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tl-group {
  position: relative;
  padding-left: 16px;
}

/* 竖线 */
.tl-group::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 12px;
  bottom: -10px;
  width: 1px;
  background: var(--sde-border);
}

.tl-group:last-of-type::before {
  display: none;
}

.tl-date {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
  position: relative;
}

.tl-dot {
  position: absolute;
  left: -16px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sde-border);
  border: 1.5px solid var(--sde-surface);
}

.tl-dot.today {
  background: var(--sde-accent);
  box-shadow: 0 0 0 3px var(--sde-accent-soft);
}

.tl-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--sde-text);
}

.tl-count {
  font-size: 11px;
  color: var(--sde-muted);
}

.tl-items {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 9px;
  background: var(--sde-surface-2);
  border-left: 2.5px solid var(--sde-border);
  cursor: pointer;
  transition: all 0.14s;
}

.tl-item:hover {
  background: var(--sde-surface-3);
  transform: translateX(1px);
}

.tl-item.assignment {
  border-left-color: #4f9cf9;
}
.tl-item.exam {
  border-left-color: #e5534b;
}
.tl-item.project {
  border-left-color: #7c5cff;
}
.tl-item.activity {
  border-left-color: #3fb950;
}
.tl-item.task {
  border-left-color: #d29922;
}

/* 逾期未完成：左侧标红 */
.tl-item.late {
  border-left-color: var(--sde-danger);
}

/* 已完成：整体压暗 + 划掉 */
.tl-item.done {
  opacity: 0.52;
}

.tl-item.done .ti-title {
  text-decoration: line-through;
}

.tl-item.done .ti-left {
  color: var(--sde-ok);
}

.ti-main {
  flex: 1;
  min-width: 0;
}

.ti-title {
  font-size: 12.5px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ti-tag {
  display: inline-block;
  font-size: 10px;
  padding: 0 4px;
  margin-right: 4px;
  border-radius: 4px;
  background: var(--sde-surface-3);
  color: var(--sde-muted);
  vertical-align: 1px;
}

.ti-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--sde-muted);
}

.ti-left.is-urgent {
  color: #fff;
  background: var(--sde-danger);
  padding: 1px 6px;
  border-radius: 5px;
  font-weight: 600;
  font-size: 10px;
}

.ti-subject {
  margin-left: auto;
}

.ti-check {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--sde-border);
  background: transparent;
  color: transparent;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.ti-check:hover {
  border-color: var(--sde-ok);
  color: var(--sde-ok);
}

.ti-check.on {
  border-color: var(--sde-ok);
  color: var(--sde-ok);
  background: rgba(95, 199, 154, 0.16);
}

.tl-overdue {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: #e5a04b;
  padding-left: 2px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--sde-accent);
  font-size: 11.5px;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}

</style>
