/**
 * 待解决知识点（带艾宾浩斯遗忘曲线复习排期）
 *
 * 记忆原理：刚学会的知识遗忘最快，按递增间隔重复能显著降低遗忘率。
 * 每次打卡复习，就把下一次复习时间往后推一档；点「彻底掌握」则毕业不再提醒。
 *
 * 结构：
 * {
 *   id, subjectId, title, note, images: [fileId],
 *   stage: 0,            // 已完成的复习轮次
 *   nextReview: "2026-11-02",
 *   mastered: false,
 *   log: [{ at, stage }],
 *   createdAt, updatedAt
 * }
 */
import { Router } from "express";
import { readData, writeData, uid } from "../store.js";

const FILE = "knowledge";

/** 艾宾浩斯复习间隔（天）：第 1、2、4、7、15、30、60 天 */
export const INTERVALS = [1, 2, 4, 7, 15, 30, 60];

const pad = (n) => String(n).padStart(2, "0");
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toStr(new Date());

function addDays(dateStr, n) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toStr(d);
}

function nextDate(stage) {
  const gap = INTERVALS[stage] ?? 90;
  return addDays(todayStr(), gap);
}

function load() {
  const data = readData(FILE, null);
  if (data && Array.isArray(data.items)) return data;
  const fresh = { version: 1, items: [] };
  writeData(FILE, fresh);
  return fresh;
}

const save = (items) => writeData(FILE, { version: 1, items });

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (!!a.mastered !== !!b.mastered) return a.mastered ? 1 : -1;
    return (a.nextReview || "9999").localeCompare(b.nextReview || "9999");
  });
}

function sanitize(body = {}, old) {
  const out = {};
  const creating = !old;

  if (creating || body.title !== undefined) {
    const t = String(body.title || "").trim().slice(0, 150);
    if (!t) return null;
    out.title = t;
  }
  if (creating || body.subjectId !== undefined) out.subjectId = body.subjectId || null;
  if (body.note !== undefined) out.note = String(body.note || "").slice(0, 3000);
  if (body.images !== undefined) {
    out.images = Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 12) : [];
  }
  return out;
}

const router = Router();

/** scope=due 只看今天该复习的；scope=all 全部；默认按学科筛 */
router.get("/", (req, res) => {
  const { subjectId, scope } = req.query;
  const { items } = load();
  let list = items;
  if (subjectId) list = list.filter((i) => i.subjectId === subjectId);

  const t = todayStr();
  const due = list.filter((i) => !i.mastered && i.nextReview && i.nextReview <= t);

  if (scope === "due") {
    const sorted = sortItems(due);
    return res.json({ items: sorted, dueCount: sorted.length, total: list.length });
  }

  const sorted = sortItems(list);
  res.json({
    items: sorted,
    dueCount: due.length,
    total: list.length,
    masteredCount: list.filter((i) => i.mastered).length,
  });
});

router.post("/", (req, res) => {
  const data = load();
  const body = sanitize(req.body || {});
  if (!body) return res.status(400).json({ error: "请填写知识点标题" });

  const now = new Date().toISOString();
  const item = {
    ...body,
    id: uid("k_"),
    stage: 0,
    nextReview: addDays(todayStr(), INTERVALS[0]),
    mastered: false,
    log: [],
    createdAt: now,
    updatedAt: now,
  };
  data.items.push(item);
  save(data.items);
  res.json({ item, items: sortItems(data.items) });
});

router.put("/:id", (req, res) => {
  const data = load();
  const item = data.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "知识点不存在" });

  const patch = sanitize(req.body || {}, item);
  if (!patch) return res.status(400).json({ error: "标题不能为空" });
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  save(data.items);
  res.json({ item, items: sortItems(data.items) });
});

router.delete("/:id", (req, res) => {
  const data = load();
  const idx = data.items.findIndex((i) => i.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "知识点不存在" });
  data.items.splice(idx, 1);
  save(data.items);
  res.json({ ok: true, items: sortItems(data.items) });
});

/**
 * 打卡复习
 * action = review   记录一次复习，按艾宾浩斯推进下一轮
 * action = forgot   忘完了，进度清零，明天重新开始
 * action = master   彻底掌握，不再提醒
 * action = reset    重置复习进度
 */
router.post("/:id/review", (req, res) => {
  const action = String(req.body?.action || "review");
  const data = load();
  const item = data.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "知识点不存在" });

  const now = new Date().toISOString();

  if (action === "master") {
    item.mastered = true;
    item.nextReview = null;
    item.log.push({ at: now, action: "master", stage: item.stage });
  } else if (action === "forgot" || action === "reset") {
    item.stage = 0;
    item.mastered = false;
    item.nextReview = nextDate(0);
    item.log.push({ at: now, action, stage: 0 });
  } else {
    item.stage = (item.stage || 0) + 1;
    item.mastered = false;
    item.nextReview = nextDate(item.stage);
    item.log.push({ at: now, action: "review", stage: item.stage });
  }

  item.updatedAt = now;
  save(data.items);
  res.json({ item, items: sortItems(data.items) });
});

export default router;
