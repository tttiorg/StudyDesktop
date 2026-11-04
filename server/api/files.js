/**
 * 资料 / 附件 API
 *
 * 两种来源：
 *   link   链接本机已有文件（默认，不复制副本，省空间）
 *   upload 上传副本（知识点题目图片用，因为要独立于原文件）
 *
 * 结构：{ id, name, path?|stored?, size, type, subjectId, category, pinned, link, tags, note, createdAt }
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { readData, writeData, uid } from "../store.js";
import { FILES_DIR, INBOX_DIR } from "../config.js";

const FILE = "files";

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] || "application/octet-stream";

/* ---------- 存储 ---------- */

function load() {
  const data = readData(FILE, null);
  if (data && Array.isArray(data.items)) {
    // 兼容老数据
    data.items = data.items.map((i) => ({
      pinned: false,
      link: false,
      category: "material",
      ...i,
    }));
    if (!Array.isArray(data.ignored)) data.ignored = [];
    if (!Array.isArray(data.folders)) data.folders = [];
    return data;
  }
  const fresh = { version: 1, items: [], ignored: [], folders: [] };
  writeData(FILE, fresh);
  return fresh;
}

const save = (data) =>
  writeData(FILE, {
    version: 1,
    items: data.items,
    ignored: data.ignored || [],
    folders: data.folders || [],
  });


const sortItems = (items) =>
  [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

function safeName(name) {
  const base = path.basename(name || "未命名");
  const cleaned = base
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "未命名").slice(0, 120);
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(p);
    s.on("data", (d) => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

const absOf = (item) => (item.link ? item.path : path.join(FILES_DIR, item.stored));

function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return String(raw || "")
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ---------- 文件夹映射 ----------
 * 映射整个文件夹后，里面的文件（含子文件夹）在每次读取时都会重新扫描一遍：
 *   - 新增的文件自动出现在资料里
 *   - 已经被删除 / 移走的文件自动消失
 *   - 用户手动移除过的文件记进 ignored，不会被重新拉回来
 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  "System Volume Information",
  "$RECYCLE.BIN",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
]);

function scanFolder(root, { max = 4000, maxDepth = 8 } = {}) {
  const out = [];
  const walk = (dir, depth) => {
    if (out.length >= max || depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries) {
      if (out.length >= max) return;
      const name = d.name;
      if (name.startsWith(".") || name.startsWith("~$") || /^desktop\.ini$/i.test(name)) continue;
      const full = path.join(dir, name);
      if (d.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(full, depth + 1);
      } else if (d.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {}
        out.push({
          path: full,
          name,
          rel: path.relative(root, full).replace(/\\/g, "/"),
          size,
          type: mimeOf(full),
        });
      }
    }
  };
  walk(root, 0);
  return out;
}

/** 5 秒内不重复扫描同一目录，避免频繁切页时反复读盘 */
const lastScan = new Map();
const SCAN_TTL = 5000;

export function clearScanCache() {
  lastScan.clear();
}

export function syncFolders(data, { force = false, only = null } = {}) {
  const folders = (data.folders || []).filter((f) => !only || f.path === only);
  if (!folders.length) return { added: 0, removed: 0, scanned: 0 };

  let added = 0;
  let removed = 0;
  let scanned = 0;
  const now = Date.now();

  for (const folder of folders) {
    const stamp = lastScan.get(folder.path) || 0;
    if (!force && now - stamp < SCAN_TTL) continue;
    lastScan.set(folder.path, now);

    const found = scanFolder(folder.path);
    scanned++;
    const byPath = new Map(found.map((f) => [f.path, f]));

    // 1) 目录里已经没有了 → 从资料库同步移除（链接的文件不动磁盘）
    const keep = [];
    for (const it of data.items) {
      if (it.link && it.dir === folder.path && !byPath.has(it.path)) {
        removed++;
        continue;
      }
      keep.push(it);
    }
    data.items = keep;

    // 2) 目录里新出现的 → 加进资料库
    const known = new Set(data.items.filter((i) => i.link).map((i) => i.path));
    for (const f of found) {
      if (known.has(f.path)) continue;
      if ((data.ignored || []).includes(f.path)) continue;
      data.items.push({
        id: uid("f_"),
        name: safeName(f.name),
        path: f.path,
        dir: folder.path,
        rel: f.rel,
        link: true,
        size: f.size,
        type: f.type,
        subjectId: folder.subjectId || null,
        category: folder.category || "material",
        pinned: false,
        tags: [],
        note: "",
        createdAt: new Date().toISOString(),
      });
      added++;
    }
  }

  return { added, removed, scanned };
}


/* ---------- 上传（知识点图片等） ---------- */

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, INBOX_DIR),
    filename: (req, file, cb) => cb(null, uid("tmp_")),
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
});

function fixName(file) {
  try {
    return Buffer.from(file.originalname, "latin1").toString("utf8");
  } catch {
    return file.originalname;
  }
}

const router = Router();

/* ---------- 查询 ---------- */

router.get("/", (req, res) => {
  const { subjectId, q, tag, category, sync } = req.query;
  const data = load();

  // 映射的文件夹每次读取时同步一次，这样外面增删文件这里会跟着变
  const changed = syncFolders(data, { force: sync === "1" });
  if (changed.added || changed.removed) save(data);

  let items = data.items;

  if (category && category !== "all") items = items.filter((i) => i.category === category);
  if (subjectId) items = items.filter((i) => i.subjectId === subjectId);
  if (subjectId === "_none") items = data.items.filter((i) => !i.subjectId);
  if (tag) items = items.filter((i) => (i.tags || []).includes(String(tag)));
  if (q) {
    const kw = String(q).toLowerCase();
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(kw) ||
        (i.note || "").toLowerCase().includes(kw) ||
        (i.tags || []).some((t) => t.toLowerCase().includes(kw))
    );
  }

  const sorted = sortItems(items);
  // 顺带标记原文件是否还在，前端可以提示
  const withState = sorted.map((i) => {
    let missing = false;
    try {
      missing = !fs.existsSync(absOf(i));
    } catch {
      missing = true;
    }
    return { ...i, missing };
  });

  res.json({ items: withState, total: withState.length, sync: changed });
});

/* ---------- 映射整个文件夹 ---------- */

router.post("/folder", (req, res) => {
  const raw = String(req.body?.path || "").trim();
  if (!raw) return res.status(400).json({ error: "缺少文件夹路径" });

  const dir = path.resolve(raw);
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    return res.status(404).json({ error: "文件夹不存在：" + dir });
  }
  if (!stat.isDirectory()) return res.status(400).json({ error: "不是一个文件夹" });

  const subjectId = req.body.subjectId && req.body.subjectId !== "_none" ? req.body.subjectId : null;
  const category = req.body.category === "knowledge" ? "knowledge" : "material";

  const data = load();
  const exist = data.folders.find((f) => f.path === dir);
  if (exist) {
    exist.subjectId = subjectId;
    exist.category = category;
  } else {
    data.folders.push({
      path: dir,
      name: path.basename(dir),
      subjectId,
      category,
      createdAt: new Date().toISOString(),
    });
  }

  lastScan.delete(dir);
  const changed = syncFolders(data, { force: true, only: dir });
  save(data);
  res.json({ folder: dir, ...changed, items: sortItems(data.items) });
});

/** 手动重新扫描（外部改了文件夹后想立刻刷新） */
router.post("/sync", (req, res) => {
  const only = req.body?.dir ? path.resolve(String(req.body.dir)) : null;
  const data = load();
  lastScan.clear();
  const changed = syncFolders(data, { force: true, only });
  if (changed.added || changed.removed) save(data);
  res.json({ ...changed, items: sortItems(data.items) });
});

/** 取消文件夹映射：只解除关联，不动磁盘 */
router.post("/unmap", (req, res) => {
  const dir = path.resolve(String(req.body?.dir || ""));
  const data = load();
  data.folders = (data.folders || []).filter((f) => f.path !== dir);
  data.items = data.items.filter((i) => !(i.link && i.dir === dir));
  lastScan.delete(dir);
  save(data);
  res.json({ ok: true, items: sortItems(data.items) });
});


/* ---------- 链接本地文件 ---------- */

router.post("/link", (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter(Boolean) : [];
  if (!paths.length) return res.status(400).json({ error: "没有收到文件路径" });

  const subjectId = req.body.subjectId && req.body.subjectId !== "_none" ? req.body.subjectId : null;
  const category = req.body.category === "knowledge" ? "knowledge" : "material";
  const tags = parseTags(req.body.tags);
  const note = req.body.note || "";

  const data = load();
  const added = [];
  const skipped = [];

  for (const raw of paths) {
    const p = path.resolve(String(raw));

    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      skipped.push({ path: p, reason: "文件不存在" });
      continue;
    }
    if (!stat.isFile()) {
      skipped.push({ path: p, reason: "不是文件" });
      continue;
    }

    const exist = data.items.find((i) => i.link && i.path === p);
    if (exist) {
      skipped.push({ path: p, reason: "已经链接过了", id: exist.id });
      continue;
    }

    const item = {
      id: uid("f_"),
      name: safeName(path.basename(p)),
      path: p,
      link: true,
      size: stat.size,
      type: mimeOf(p),
      subjectId,
      category,
      pinned: false,
      tags,
      note,
      createdAt: new Date().toISOString(),
    };
    data.items.push(item);
    added.push(item);
  }

  save(data);
  res.json({ added, skipped, items: sortItems(data.items) });
});

/* ---------- 上传文件 ---------- */

router.post("/", upload.array("files", 30), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "没有收到文件" });

  const subjectId = req.body.subjectId && req.body.subjectId !== "_none" ? req.body.subjectId : null;
  const tags = parseTags(req.body.tags);
  const note = req.body.note || "";
  const category = req.body.category === "knowledge" ? "knowledge" : "material";

  const data = load();
  const added = [];
  const duplicates = [];

  for (const f of files) {
    const original = safeName(fixName(f));
    let hash = "";
    try {
      hash = await sha256File(f.path);
    } catch {
      fs.rmSync(f.path, { force: true });
      continue;
    }

    const exist = data.items.find((i) => !i.link && i.hash === hash && fs.existsSync(absOf(i)));
    if (exist) {
      fs.rmSync(f.path, { force: true });
      duplicates.push({ id: exist.id, name: exist.name });
      continue;
    }

    const folder = subjectId || "_未分类";
    const dir = path.join(FILES_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });

    const stored = path.posix.join(folder, `${hash.slice(0, 8)}_${original}`);
    const dest = path.join(FILES_DIR, stored);

    try {
      fs.renameSync(f.path, dest);
    } catch {
      try {
        fs.copyFileSync(f.path, dest);
        fs.rmSync(f.path, { force: true });
      } catch {
        continue;
      }
    }

    const item = {
      id: uid("f_"),
      name: original,
      stored,
      link: false,
      size: f.size,
      type: f.mimetype || "application/octet-stream",
      hash,
      subjectId,
      category,
      pinned: false,
      tags,
      note,
      createdAt: new Date().toISOString(),
    };
    data.items.push(item);
    added.push(item);
  }

  save(data);
  res.json({ added, duplicates, items: sortItems(data.items) });
});

/* ---------- 修改 ---------- */

router.put("/:id", (req, res) => {
  const data = load();
  const item = data.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "文件不存在" });

  const { name, subjectId, tags, note, pinned } = req.body || {};
  if (name !== undefined) item.name = safeName(name);
  if (subjectId !== undefined) item.subjectId = subjectId || null;
  if (tags !== undefined) item.tags = parseTags(tags);
  if (note !== undefined) item.note = note;
  if (pinned !== undefined) item.pinned = !!pinned;

  save(data);
  res.json({ item, items: sortItems(data.items) });
});

router.delete("/:id", (req, res) => {
  const data = load();
  const idx = data.items.findIndex((i) => i.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "文件不存在" });

  const [removed] = data.items.splice(idx, 1);
  // 只删除自己复制进来的副本；链接的本地文件绝不动
  if (!removed.link) {
    try {
      const src = absOf(removed);
      if (fs.existsSync(src)) {
        const trash = path.join(FILES_DIR, "_回收站");
        fs.mkdirSync(trash, { recursive: true });
        fs.renameSync(src, path.join(trash, `${Date.now()}_${path.basename(src)}`));
      }
    } catch {}
  } else if (removed.dir && removed.path) {
    // 来自映射文件夹的文件：记一笔忽略，否则下次同步又会被拉回来
    if (!Array.isArray(data.ignored)) data.ignored = [];
    if (!data.ignored.includes(removed.path)) data.ignored.push(removed.path);
  }
  save(data);
  res.json({ ok: true, items: sortItems(data.items) });
});

/* ---------- 读取内容 ---------- */

router.get("/:id/raw", (req, res) => {
  const data = load();
  const item = data.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).send("文件不存在");

  const abs = absOf(item);
  if (!fs.existsSync(abs)) return res.status(410).send("原文件已移动或删除");

  if (req.query.download) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`
    );
  }
  res.setHeader("Content-Type", item.type || "application/octet-stream");
  fs.createReadStream(abs).pipe(res);
});

/* ---------- 统计 ---------- */

router.get("/stats/summary", (req, res) => {
  const data = load();
  const totalSize = data.items.reduce((s, i) => s + (i.size || 0), 0);
  const bySubject = {};
  for (const i of data.items) {
    const k = i.subjectId || "_none";
    bySubject[k] = (bySubject[k] || 0) + 1;
  }
  res.json({ count: data.items.length, totalSize, bySubject });
});

/* 供导入等其他模块复用 */
export { load as loadFiles, save as saveFiles, mimeOf as mimeOfFile, safeName as safeFileName };

export default router;
