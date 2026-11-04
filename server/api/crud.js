/**
 * 通用 JSON 集合 CRUD 工厂
 * 日程、成绩、笔记、外链这些结构相似的数据，统一走这里，避免重复代码。
 */
import { Router } from "express";
import { readData, writeData, uid } from "../store.js";

/**
 * @param {string} fileName 数据文件名（不含 .json）
 * @param {object} opts
 * @param {() => any} opts.initial 首次初始化返回值
 * @param {(body:any, old?:any) => any|null} opts.sanitize 清洗入参，返回 null 表示非法
 * @param {string} opts.prefix id 前缀
 * @param {(items:any[]) => any[]} [opts.sort] 排序
 * @param {boolean} [opts.ordered] 是否支持拖拽排序（按数组下标写 order 字段）
 */
export function makeCrud(fileName, { initial, sanitize, prefix = "i_", sort, ordered = false } = {}) {
  function load() {
    const data = readData(fileName, null);
    if (data && Array.isArray(data.items)) return data;
    const fresh = { version: 1, items: initial ? initial() : [] };
    writeData(fileName, fresh);
    return fresh;
  }

  function save(items) {
    const data = { version: 1, items };
    writeData(fileName, data);
    return data;
  }

  const router = Router();

  router.get("/", (req, res) => {
    const { items } = load();
    let list = items;
    const { subjectId, type } = req.query;
    if (subjectId) list = list.filter((i) => i.subjectId === subjectId);
    if (type) list = list.filter((i) => i.type === type);
    list = sort ? sort(list) : list;
    res.json({ items: list });
  });

  router.post("/", (req, res) => {
    const data = load();
    const now = new Date().toISOString();
    const item = sanitize ? sanitize(req.body || {}) : { ...req.body };
    if (!item) return res.status(400).json({ error: "参数不合法" });

    const record = { ...item, id: uid(prefix), createdAt: now, updatedAt: now };
    data.items.push(record);
    const saved = save(data.items);
    res.json({ item: record, items: sort ? sort(saved.items) : saved.items });
  });

  // 注意：必须放在 /:id 之前，否则 reorder 会被当成 id
  if (ordered) {
    router.put("/reorder", (req, res) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      if (!ids.length) return res.status(400).json({ error: "缺少 ids" });
      const data = load();
      const pos = new Map(ids.map((id, i) => [id, i]));
      data.items = data.items.map((i) => (pos.has(i.id) ? { ...i, order: pos.get(i.id) } : i));
      const saved = save(data.items);
      res.json({ ok: true, items: sort ? sort(saved.items) : saved.items });
    });
  }

  router.put("/:id", (req, res) => {
    const data = load();
    const idx = data.items.findIndex((i) => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "记录不存在" });

    const patch = sanitize ? sanitize(req.body || {}, data.items[idx]) : req.body || {};
    if (!patch) return res.status(400).json({ error: "参数不合法" });

    data.items[idx] = { ...data.items[idx], ...patch, updatedAt: new Date().toISOString() };
    const saved = save(data.items);
    res.json({ item: data.items[idx], items: sort ? sort(saved.items) : saved.items });
  });

  router.delete("/:id", (req, res) => {
    const data = load();
    const idx = data.items.findIndex((i) => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "记录不存在" });
    data.items.splice(idx, 1);
    const saved = save(data.items);
    res.json({ ok: true, items: sort ? sort(saved.items) : saved.items });
  });

  return { router, load, save };
}
