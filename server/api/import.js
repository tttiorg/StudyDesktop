/**
 * 标准文件导入
 *
 * 目的：让 AI（或用户自己）把零散信息整理成一份标准 JSON，一次性灌进应用。
 * 格式规范见 web/public/data-format/README.md，模板见同目录的 template.json。
 *
 * 接口：POST /api/import   body = { mode: "merge" | "replace", data: <标准 JSON> }
 *
 * 设计取舍：
 *   - 一律按「学科名称」做引用，导入时翻译成内部 id，这样对 AI 和人都好写
 *   - merge 模式只补不改：已存在的学科 / 外链 / 同名条目跳过
 *   - replace 模式先清空再写，靠 store 的 .prev 与每日备份兜底
 */
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { readData, writeData, uid } from "../store.js";
import { loadSubjects } from "./subjects.js";
import { loadTimetable, DEFAULT_BLOCKS } from "./timetable.js";
import { loadFiles, saveFiles, syncFolders, clearScanCache } from "./files.js";

const PALETTE = ["#4f9cf9", "#7c5cff", "#e5534b", "#3fb950", "#d29922", "#db61a2", "#39c5cf"];

const str = (v, n = 200) => String(v ?? "").trim().slice(0, n);
const arr = (v) => (Array.isArray(v) ? v : []);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const isTime = (v) => /^\d{2}:\d{2}$/.test(String(v || ""));

const pad = (n) => String(n).padStart(2, "0");
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(dateStr, n) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SCHEDULE_TYPES = ["task", "assignment", "exam", "project", "activity"];
const GRADE_TYPES = ["homework", "quiz", "exam", "project", "other"];

const router = Router();

router.post("/", (req, res) => {
  const mode = req.body?.mode === "replace" ? "replace" : "merge";
  const data = req.body?.data || {};
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "data 必须是一个 JSON 对象" });
  }

  const log = [];
  const now = new Date().toISOString();

  /* ---------- 1. 学科 ---------- */
  const subjData = loadSubjects();
  const byName = new Map(subjData.items.map((s) => [s.name, s]));

  if (mode === "replace") {
    subjData.items = [];
    byName.clear();
    log.push("已清空原有学科");
  }

  let sAdded = 0;
  let sFilled = 0;
  for (const raw of arr(data.subjects)) {
    const name = str(raw?.name, 20);
    if (!name) continue;

    const exist = byName.get(name);
    if (exist) {
      // merge 下只补空缺字段，不动用户已经填过的内容（颜色也保留用户的）
      let touched = false;
      if (!str(exist.note) && str(raw.note)) {
        exist.note = str(raw.note, 2000);
        touched = true;
      }
      if (!exist.course && raw.course && typeof raw.course === "object") {
        exist.course = raw.course;
        touched = true;
      }
      if (!exist.faculty && raw.faculty && typeof raw.faculty === "object") {
        exist.faculty = raw.faculty;
        touched = true;
      }
      if (!str(exist.bbUrl) && str(raw.bbUrl)) {
        exist.bbUrl = str(raw.bbUrl, 400);
        touched = true;
      }
      if (touched) {
        exist.updatedAt = now;
        sFilled++;
      }
      continue;
    }

    const item = {
      id: uid("s_"),
      name,
      color: /^#[0-9a-f]{6}$/i.test(raw.color || "") ? raw.color : PALETTE[byName.size % PALETTE.length],
      order: byName.size,
      note: str(raw.note, 2000),
      course: raw.course && typeof raw.course === "object" ? raw.course : undefined,
      faculty: raw.faculty && typeof raw.faculty === "object" ? raw.faculty : undefined,
      bbUrl: str(raw.bbUrl, 400),
      createdAt: now,
      updatedAt: now,
    };
    subjData.items.push(item);
    byName.set(name, item);
    sAdded++;
  }
  writeData("subjects", { version: 1, items: subjData.items });
  log.push(`学科：新增 ${sAdded} 个${sFilled ? `，补充信息 ${sFilled} 个` : ""}，共 ${subjData.items.length} 个`);

  /** 学科名（或 id）→ 内部 id */
  const sidOf = (v) => {
    if (!v) return null;
    const key = String(v).trim();
    const hit = byName.get(key);
    if (hit) return hit.id;
    const byId = subjData.items.find((s) => s.id === key);
    return byId ? byId.id : null;
  };

  /* ---------- 2. 课表 ---------- */
  const tt = loadTimetable();
  if (data.meta && typeof data.meta === "object") {
    tt.meta = {
      semester: str(data.meta.semester, 30) || tt.meta?.semester || "",
      student: str(data.meta.student, 20) || tt.meta?.student || "",
      startDate: isDate(data.meta.startDate) ? data.meta.startDate : tt.meta?.startDate || "",
    };
    log.push("个人信息：已更新");
  }
  if (arr(data.timetable?.blocks).length) {
    tt.blocks = arr(data.timetable.blocks)
      .map((b, i) => ({
        index: Number(b?.index) || i + 1,
        label: str(b?.label, 20) || `第${(Number(b?.index) || i + 1) * 2 - 1}-${(Number(b?.index) || i + 1) * 2}节`,
        time: str(b?.time, 20),
      }))
      .filter((b) => b.index >= 1 && b.index <= 8);
  }
  if (!arr(tt.blocks).length) tt.blocks = DEFAULT_BLOCKS;

  const slotsIn = arr(data.timetable?.slots);
  if (slotsIn.length || mode === "replace") {
    const map = new Map();
    if (mode !== "replace") for (const s of arr(tt.slots)) map.set(`${s.day}-${s.block}`, s);
    for (const raw of slotsIn) {
      const day = Number(raw?.day);
      const block = Number(raw?.block);
      if (!(day >= 1 && day <= 7) || !(block >= 1 && block <= 8)) continue;
      map.set(`${day}-${block}`, {
        id: uid("t_"),
        day,
        block,
        name: str(raw.name, 60),
        room: str(raw.room, 40),
        teacher: str(raw.teacher, 40),
        weeks: str(raw.weeks, 30),
        subjectId: sidOf(raw.subject) || null,
      });
    }
    tt.slots = [...map.values()];
    log.push(`课表：${slotsIn.length} 个时段，共 ${tt.slots.length} 条`);
  }
  writeData("timetable", tt);

  /* ---------- 3. 日程 ---------- */
  const sc = readData("schedules", { version: 1, items: [] });
  if (mode === "replace") sc.items = [];
  const scKeys = new Set(sc.items.map((i) => `${i.title}|${i.due}`));
  let scAdded = 0;
  for (const raw of arr(data.schedules)) {
    const title = str(raw?.title, 120);
    const due = isDate(raw?.due) ? raw.due : "";
    if (!title || !due) continue;
    if (scKeys.has(`${title}|${due}`)) continue;
    sc.items.push({
      id: uid("d_"),
      title,
      due,
      time: isTime(raw.time) ? raw.time : "",
      type: SCHEDULE_TYPES.includes(raw.type) ? raw.type : "task",
      subjectId: sidOf(raw.subject) || null,
      place: str(raw.place, 80),
      note: str(raw.note, 1000),
      done: !!raw.done,
      createdAt: now,
      updatedAt: now,
    });
    scKeys.add(`${title}|${due}`);
    scAdded++;
  }
  writeData("schedules", { version: 1, items: sc.items });
  log.push(`日程：新增 ${scAdded} 条`);

  /* ---------- 4. 成绩 ---------- */
  const gr = readData("grades", { version: 1, items: [] });
  if (mode === "replace") gr.items = [];
  const grKeys = new Set(gr.items.map((i) => `${i.name}|${i.subjectId || ""}`));
  let grAdded = 0;
  for (const raw of arr(data.grades)) {
    const name = str(raw?.name, 80);
    if (!name) continue;
    const subjectId = sidOf(raw.subject) || null;
    if (grKeys.has(`${name}|${subjectId || ""}`)) continue;
    const score = raw.score === null || raw.score === undefined || raw.score === "" ? null : Number(raw.score);
    gr.items.push({
      id: uid("g_"),
      name,
      subjectId,
      score: Number.isFinite(score) ? score : null,
      full: Number(raw.full) > 0 ? Number(raw.full) : 100,
      weight: Number.isFinite(Number(raw.weight)) && raw.weight !== null && raw.weight !== "" ? Number(raw.weight) : null,
      type: GRADE_TYPES.includes(raw.type) ? raw.type : "other",
      date: isDate(raw.date) ? raw.date : "",
      note: str(raw.note, 500),
      createdAt: now,
      updatedAt: now,
    });
    grKeys.add(`${name}|${subjectId || ""}`);
    grAdded++;
  }
  writeData("grades", { version: 1, items: gr.items });
  log.push(`成绩：新增 ${grAdded} 条`);

  /* ---------- 5. 笔记 ---------- */
  const nt = readData("notes", { version: 1, items: [] });
  if (mode === "replace") nt.items = [];
  const ntKeys = new Set(nt.items.map((i) => `${i.title}|${i.subjectId || ""}`));
  let ntAdded = 0;
  for (const raw of arr(data.notes)) {
    const title = str(raw?.title, 120) || "无标题";
    const content = String(raw?.content ?? "").slice(0, 200000);
    if (!content && !str(raw?.title)) continue;
    const subjectId = sidOf(raw.subject) || null;
    if (ntKeys.has(`${title}|${subjectId || ""}`)) continue;
    nt.items.push({ id: uid("n_"), title, content, subjectId, createdAt: now, updatedAt: now });
    ntKeys.add(`${title}|${subjectId || ""}`);
    ntAdded++;
  }
  writeData("notes", { version: 1, items: nt.items });
  log.push(`笔记：新增 ${ntAdded} 条`);

  /* ---------- 6. 知识点 ---------- */
  const kw = readData("knowledge", { version: 1, items: [] });
  if (mode === "replace") kw.items = [];
  const kwKeys = new Set(kw.items.map((i) => `${i.title}|${i.subjectId || ""}`));
  let kwAdded = 0;
  for (const raw of arr(data.knowledge)) {
    const title = str(raw?.title, 150);
    if (!title) continue;
    const subjectId = sidOf(raw.subject) || null;
    if (kwKeys.has(`${title}|${subjectId || ""}`)) continue;
    kw.items.push({
      id: uid("k_"),
      title,
      note: str(raw.note, 3000),
      subjectId,
      images: [],
      stage: 0,
      nextReview: addDays(todayStr(), 1),
      mastered: !!raw.mastered,
      log: [],
      createdAt: now,
      updatedAt: now,
    });
    kwKeys.add(`${title}|${subjectId || ""}`);
    kwAdded++;
  }
  writeData("knowledge", { version: 1, items: kw.items });
  log.push(`知识点：新增 ${kwAdded} 条`);

  /* ---------- 7. 外链 ---------- */
  const lk = readData("links", { version: 1, items: [] });
  if (mode === "replace") lk.items = [];
  const lkKeys = new Set(lk.items.map((i) => i.name));
  let lkAdded = 0;
  for (const raw of arr(data.links)) {
    const name = str(raw?.name, 20);
    let url = str(raw?.url, 500);
    if (!name || !url) continue;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (lkKeys.has(name)) continue;
    lk.items.push({ id: uid("l_"), name, url, order: lk.items.length, createdAt: now, updatedAt: now });
    lkKeys.add(name);
    lkAdded++;
  }
  writeData("links", { version: 1, items: lk.items });
  log.push(`外链：新增 ${lkAdded} 个`);

  /* ---------- 8. 资料（本地文件 / 文件夹映射） ---------- */
  const fl = loadFiles();
  if (mode === "replace") {
    fl.items = [];
    fl.folders = [];
    fl.ignored = [];
  }
  const fileKeys = new Set(fl.items.map((i) => i.path));
  let fAdded = 0;
  let dirAdded = 0;
  for (const raw of arr(data.files)) {
    const p = String(raw?.path || "").trim();
    if (!p) continue;
    const subjectId = sidOf(raw.subject) || null;
    const category = raw.category === "knowledge" ? "knowledge" : "material";

    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      continue; // 路径不存在就跳过，不阻断整体导入
    }

    if (stat.isDirectory() || raw.folder === true) {
      if (!stat.isDirectory()) continue;
      const exist = fl.folders.find((f) => f.path === p);
      if (exist) {
        exist.subjectId = subjectId;
        exist.category = category;
      } else {
        fl.folders.push({
          path: p,
          name: path.basename(p),
          subjectId,
          category,
          createdAt: now,
        });
        dirAdded++;
      }
      continue;
    }

    if (fileKeys.has(p)) continue;
    fl.items.push({
      id: uid("f_"),
      name: str(raw.name, 120) || path.basename(p),
      path: p,
      link: true,
      size: stat.size,
      type: raw.type || "application/octet-stream",
      subjectId,
      category,
      pinned: false,
      tags: arr(raw.tags).map((t) => str(t, 20)).filter(Boolean),
      note: str(raw.note, 500),
      createdAt: now,
    });
    fileKeys.add(p);
    fAdded++;
  }
  clearScanCache();
  const synced = syncFolders(fl, { force: true });
  if (fl.folders.length || fl.items.length) saveFiles(fl);
  log.push(`资料：链接 ${fAdded} 个文件、映射 ${dirAdded} 个文件夹${synced.added ? `，扫到 ${synced.added} 个文件` : ""}`);

  res.json({ ok: true, mode, log });
});

export default router;
