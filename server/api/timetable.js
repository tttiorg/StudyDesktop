/**
 * 课表 API
 *
 * 结构：{ version: 2, meta: { semester, student, startDate }, slots: [...] }
 * day: 1-7（周一~周日）
 * block: 时间块序号，1-6，每块对应两节课
 */
import { Router } from "express";
import { readData, writeData, uid } from "../store.js";

const FILE = "timetable";

export const DEFAULT_BLOCKS = [
  { index: 1, label: "第1-2节", time: "08:00-09:50" },
  { index: 2, label: "第3-4节", time: "10:20-12:10" },
  { index: 3, label: "第5-6节", time: "14:00-15:50" },
  { index: 4, label: "第7-8节", time: "16:20-18:10" },
  { index: 5, label: "第9-10节", time: "19:00-20:50" },
];

function emptyMeta() {
  return { semester: "", student: "", startDate: "" };
}

export function loadTimetable() {
  const data = readData(FILE, null);
  if (data && Array.isArray(data.slots)) {
    return { blocks: DEFAULT_BLOCKS, meta: emptyMeta(), ...data };
  }
  const fresh = { version: 2, meta: emptyMeta(), blocks: DEFAULT_BLOCKS, slots: [] };
  writeData(FILE, fresh);
  return fresh;
}

function sanitize(slot) {
  const day = Number(slot.day);
  const block = Number(slot.block ?? slot.period);
  if (!(day >= 1 && day <= 7)) return null;
  if (!(block >= 1 && block <= 6)) return null;
  if (!slot.name && !slot.room && !slot.teacher && !slot.subjectId) return null;
  return {
    id: slot.id || uid("t_"),
    day,
    block,
    name: String(slot.name || "").slice(0, 60),
    room: String(slot.room || "").slice(0, 40),
    teacher: String(slot.teacher || "").slice(0, 40),
    weeks: String(slot.weeks || "").slice(0, 30),
    subjectId: slot.subjectId || null,
  };
}

const router = Router();

router.get("/", (req, res) => {
  res.json(loadTimetable());
});

/** 整体保存：同时可更新 meta 与 blocks */
router.put("/", (req, res) => {
  const cur = loadTimetable();
  const incoming = Array.isArray(req.body?.slots) ? req.body.slots : cur.slots;
  const cleaned = incoming.map(sanitize).filter(Boolean);

  const map = new Map();
  for (const s of cleaned) map.set(`${s.day}-${s.block}`, s);

  const data = {
    version: 2,
    meta: { ...cur.meta, ...(req.body?.meta || {}) },
    blocks: Array.isArray(req.body?.blocks) && req.body.blocks.length ? req.body.blocks : cur.blocks,
    slots: [...map.values()],
  };
  writeData(FILE, data);
  res.json(data);
});

/** 单格更新 */
router.put("/slot", (req, res) => {
  const slot = sanitize(req.body || {});
  const data = loadTimetable();
  const key = slot ? `${slot.day}-${slot.block}` : `${req.body.day}-${req.body.block ?? req.body.period}`;
  data.slots = data.slots.filter((s) => `${s.day}-${s.block}` !== key);
  if (slot) data.slots.push(slot);
  writeData(FILE, data);
  res.json(data);
});

router.delete("/", (req, res) => {
  const data = { version: 2, meta: emptyMeta(), blocks: DEFAULT_BLOCKS, slots: [] };
  writeData(FILE, data);
  res.json(data);
});

export default router;
