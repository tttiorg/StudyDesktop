<template>
  <div class="tt-wrap" :class="{ compact }">
    <table class="tt">
      <thead>
        <tr>
          <th class="corner">{{ compact ? "节次" : "节次 / 时间" }}</th>
          <th v-for="d in dayList" :key="d" :class="{ today: d === todayDay }">
            {{ DAYS[d - 1] }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="b in blockList" :key="b.index">
          <td class="period">
            <span class="pno">{{ b.label }}</span>
            <span v-if="!compact" class="ptime">{{ b.time }}</span>
          </td>
          <td
            v-for="d in dayList"
            :key="d"
            class="cell"
            :class="{ filled: !!slotAt(d, b.index), today: d === todayDay }"
            @click="$emit('cell-click', { day: d, block: b.index, slot: slotAt(d, b.index) })"
            @contextmenu.prevent="$emit('cell-menu', $event, { day: d, block: b.index, slot: slotAt(d, b.index) })"
          >
            <template v-if="slotAt(d, b.index)">
              <div class="c-name">
                <span class="c-dot" :style="{ background: colorOf(slotAt(d, b.index)) }" />
                <span class="c-text">{{ shortName(slotAt(d, b.index)) }}</span>
              </div>
              <div v-if="slotAt(d, b.index).room" class="c-meta">{{ slotAt(d, b.index).room }}</div>
              <div v-if="compact && slotAt(d, b.index).teacher" class="c-meta">
                {{ slotAt(d, b.index).teacher }}
              </div>
            </template>
            <span v-else class="c-empty">{{ editable ? "+" : "" }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  slots: { type: Array, default: () => [] },
  blocks: { type: Array, default: () => [] },
  subjects: { type: Array, default: () => [] },
  days: { type: Number, default: 5 },
  compact: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
});

defineEmits(["cell-click", "cell-menu"]);

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const dayList = computed(() => Array.from({ length: props.days }, (_, i) => i + 1));

/** 今天是周几（1-7），非本周范围时不标红 */
const todayDay = computed(() => {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
});

const map = computed(() => {
  const m = {};
  for (const s of props.slots) m[`${s.day}-${s.block}`] = s;
  return m;
});

const slotAt = (day, block) => map.value[`${day}-${block}`] || null;

function colorOf(slot) {
  const s = props.subjects.find((x) => x.id === slot.subjectId);
  return s?.color || "#5a6675";
}

/** 课程名去掉班级后缀，卡片里放得下 */
function shortName(slot) {
  const s = props.subjects.find((x) => x.id === slot.subjectId);
  const raw = slot.name || "";
  const head = raw.split(/[-（(]/)[0];
  return s?.name || head || raw;
}

const blockList = computed(() =>
  props.blocks.length
    ? props.blocks
    : [
        { index: 1, label: "第1-2节", time: "08:00-09:50" },
        { index: 2, label: "第3-4节", time: "10:20-12:10" },
        { index: 3, label: "第5-6节", time: "14:00-15:50" },
        { index: 4, label: "第7-8节", time: "16:20-18:10" },
        { index: 5, label: "第9-10节", time: "19:00-20:50" },
      ]
);
</script>

<style scoped>
.tt-wrap {
  overflow-x: auto;
}

.tt {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 680px;
}

.tt th {
  font-size: 13px;
  font-weight: 600;
  color: var(--sde-muted);
  padding: 8px 4px;
  border-bottom: 1px solid var(--sde-border);
  background: var(--sde-surface-2);
}

.tt th.today {
  color: var(--sde-accent);
}

.corner {
  width: 96px;
}

.compact .corner {
  width: 72px;
}

.tt td {
  border-bottom: 1px solid var(--sde-border);
  border-right: 1px solid var(--sde-border);
}

.period {
  text-align: center;
  padding: 5px 3px;
  background: var(--sde-surface-2);
}

.pno {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.ptime {
  display: block;
  font-size: 11px;
  color: var(--sde-muted);
  white-space: nowrap;
}

.cell {
  padding: 5px 6px;
  cursor: pointer;
  vertical-align: top;
  height: 54px;
  transition: background 0.13s;
}

.cell:hover {
  background: var(--sde-surface-2);
}

.cell.filled {
  background: rgba(79, 156, 249, 0.045);
}

.cell.today {
  background: rgba(79, 156, 249, 0.075);
}

.c-empty {
  display: block;
  text-align: center;
  line-height: 42px;
  color: #333c47;
  font-size: 13px;
}

.cell:hover .c-empty {
  color: var(--sde-accent);
}

.c-name {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 12.8px;
  font-weight: 600;
  line-height: 1.3;
}

.c-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex: none;
  margin-top: 5px;
}

.c-text {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.c-meta {
  font-size: 11px;
  color: var(--sde-muted);
  margin-top: 2px;
  margin-left: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 老师名有「Christopher Anderson（安德森）」这种长串，字号再收一点能少被截。
     原型的 design/home.css 里已经这么改过，这里之前漏同步了。 */
  letter-spacing: -0.15px;
}

.compact .tt tbody tr td {
  height: 46px;
}

.compact .c-name {
  font-size: 12.2px;
}
</style>
