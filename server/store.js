/**
 * JSON 数据存储
 *
 * 设计要点：
 * 1. 原子写入：先写 .tmp 再 rename，避免断电/崩溃写坏文件
 * 2. 每次写入前保留上一版（.prev），可回退一步
 * 3. 每天首次写入时留一份快照到 backups/YYYY-MM-DD/，事故时能找回
 */
import fs from "node:fs";
import path from "node:path";
import { DB_DIR, BACKUP_DIR } from "./config.js";

const MAX_BACKUP_DAYS = 14;

const fileOf = (name) => path.join(DB_DIR, name + ".json");

export function readData(name, fallback) {
  try {
    const raw = fs.readFileSync(fileOf(name), "utf8");
    return JSON.parse(raw);
  } catch {
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function snapshot(name) {
  const src = fileOf(name);
  if (!fs.existsSync(src)) return;
  const dir = path.join(BACKUP_DIR, today());
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name + ".json");
  // 每天只保留当天最初的一份，避免快照无限膨胀
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
}

function keepPrev(name) {
  const src = fileOf(name);
  if (fs.existsSync(src)) {
    try {
      fs.copyFileSync(src, src + ".prev");
    } catch {}
  }
}

export function writeData(name, data) {
  snapshot(name);
  keepPrev(name);
  const target = fileOf(name);
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, target);
  return data;
}

/** 清理超过保留天数的备份目录 */
export function cleanupBackups(days = MAX_BACKUP_DAYS) {
  let entries = [];
  try {
    entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  } catch {
    return 0;
  }
  const limit = new Date();
  limit.setDate(limit.getDate() - days);
  let removed = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const d = new Date(e.name + "T00:00:00");
    if (!isNaN(d) && d < limit) {
      try {
        fs.rmSync(path.join(BACKUP_DIR, e.name), { recursive: true, force: true });
        removed++;
      } catch {}
    }
  }
  return removed;
}

/** 生成短 id */
export function uid(prefix = "") {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return prefix + t + r;
}
