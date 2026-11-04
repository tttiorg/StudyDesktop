/**
 * 学科 API
 * 数据结构：{ version, items: [{ id, name, color, order, note, createdAt, updatedAt }] }
 */
import { Router } from "express";
import { readData, writeData, uid } from "../store.js";

const FILE = "subjects";

const PALETTE = [
  "#4f9cf9",
  "#7c5cff",
  "#e5534b",
  "#3fb950",
  "#d29922",
  "#db61a2",
  "#39c5cf",
];

// 首次运行时预置的学科
const PRESET = ["高数", "线代", "大物", "SE3", "C程序", "思政", "ARTINX"];

export function loadSubjects() {
  const data = readData(FILE, null);
  if (data && Array.isArray(data.items)) return data;

  const now = new Date().toISOString();
  const items = PRESET.map((name, i) => ({
    id: uid("s_"),
    name,
    color: PALETTE[i % PALETTE.length],
    order: i,
    note: "",
    createdAt: now,
    updatedAt: now,
  }));
  const fresh = { version: 1, items };
  writeData(FILE, fresh);
  return fresh;
}

/** 授课教师信息（可从官网查询后缓存到学科里） */
function sanitizeFaculty(f) {
  if (!f || typeof f !== "object") return null;
  const s = (v, n = 200) => String(v ?? "").trim().slice(0, n);
  const out = {
    name: s(f.name, 40),
    title: s(f.title, 60),
    dept: s(f.dept, 120),
    avatar: s(f.avatar, 400),
    url: s(f.url, 400),
    phone: s(f.phone, 60),
    email: s(f.email, 120),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

const router = Router();

/** 课程信息（从课表导入或手动填写），用于学科页顶部展示 */
function sanitizeCourse(c) {
  if (!c || typeof c !== "object") return null;
  const s = (v, n = 60) => String(v ?? "").trim().slice(0, n);
  const out = {
    fullName: s(c.fullName, 110),
    teacher: s(c.teacher, 40),
    room: s(c.room, 40),
    weeks: s(c.weeks, 40),
    classCode: s(c.classCode, 40),
    homepage: s(c.homepage, 300),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

router.get("/", (req, res) => {
  const { items } = loadSubjects();
  res.json({ items: [...items].sort((a, b) => a.order - b.order) });
});

router.post("/", (req, res) => {
  const { name, color, note } = req.body || {};
  const trimmed = String(name || "").trim();
  if (!trimmed) return res.status(400).json({ error: "学科名称不能为空" });

  const data = loadSubjects();
  if (data.items.some((i) => i.name === trimmed)) {
    return res.status(409).json({ error: "已存在同学科" });
  }

  const now = new Date().toISOString();
  const item = {
    id: uid("s_"),
    name: trimmed,
    color: color || PALETTE[data.items.length % PALETTE.length],
    order: data.items.length,
    note: note || "",
    course: sanitizeCourse(req.body?.course),
    faculty: sanitizeFaculty(req.body?.faculty),
    bbUrl: String(req.body?.bbUrl || "").trim().slice(0, 400),
    createdAt: now,
    updatedAt: now,
  };
  data.items.push(item);
  writeData(FILE, data);
  res.json(item);
});

/** 调整学科顺序 */
router.put("/reorder", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: "缺少 ids" });

  const data = loadSubjects();
  const map = new Map(data.items.map((i) => [i.id, i]));
  const now = new Date().toISOString();

  let n = 0;
  for (const id of ids) {
    const item = map.get(id);
    if (!item) continue;
    item.order = n++;
    item.updatedAt = now;
  }
  writeData(FILE, data);
  res.json({ items: [...data.items].sort((a, b) => a.order - b.order) });
});

router.put("/:id", (req, res) => {
  const data = loadSubjects();
  const item = data.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "学科不存在" });

  const { name, color, note, order, course, faculty, bbUrl } = req.body || {};
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: "学科名称不能为空" });
    if (data.items.some((i) => i.id !== item.id && i.name === trimmed)) {
      return res.status(409).json({ error: "已存在同学科" });
    }
    item.name = trimmed;
  }
  if (color !== undefined) item.color = color;
  if (note !== undefined) item.note = note;
  if (order !== undefined) item.order = order;
  if (course !== undefined) item.course = sanitizeCourse(course);
  if (faculty !== undefined) item.faculty = sanitizeFaculty(faculty);
  if (bbUrl !== undefined) item.bbUrl = String(bbUrl || "").trim().slice(0, 400);
  item.updatedAt = new Date().toISOString();

  writeData(FILE, data);
  res.json(item);
});

router.delete("/:id", (req, res) => {
  const data = loadSubjects();
  const idx = data.items.findIndex((i) => i.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "学科不存在" });

  const [removed] = data.items.splice(idx, 1);
  writeData(FILE, data);

  // 解除文件关联（文件本身不删，避免误删资料）
  const files = readData("files", { version: 1, items: [] });
  let fChanged = false;
  for (const f of files.items || []) {
    if (f.subjectId === removed.id) {
      f.subjectId = null;
      fChanged = true;
    }
  }
  if (fChanged) writeData("files", files);

  // 课表里的关联置空，但保留填写的课程名文本
  const tt = readData("timetable", { version: 1, slots: [] });
  let tChanged = false;
  for (const s of tt.slots || []) {
    if (s.subjectId === removed.id) {
      s.subjectId = null;
      tChanged = true;
    }
  }
  if (tChanged) writeData("timetable", tt);

  res.json({ ok: true, removed: removed.id });
});

export default router;
