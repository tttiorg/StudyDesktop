/**
 * 全局配置
 *
 * 数据根目录优先级：环境变量 STUDY_DATA_DIR > 项目根目录 config.json > 默认值
 * 所有数据都在同一个根目录下，整个文件夹拷走即可完成备份与迁移。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const WEB_DIST = path.join(ROOT, "dist");
export const CONFIG_FILE = path.join(ROOT, "config.json");

/** 默认数据目录：优先 D:\Document\学习桌面，没有 D 盘时退回用户文档目录 */
function defaultDataDir() {
  try {
    if (fs.existsSync("D:\\")) return "D:\\Document\\学习桌面";
  } catch {}
  const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
  return path.join(home, "Documents", "学习桌面");
}

function loadConfig() {
  let cfg = { dataDir: defaultDataDir(), port: 3001 };
  try {
    cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
  } catch {
    // 首次运行：写一份默认配置，方便以后改路径
    try {
      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(
          {
            dataDir: cfg.dataDir,
            port: 3001,
          },
          null,
          2
        ),
        "utf8"
      );
    } catch {}
  }
  if (process.env.STUDY_DATA_DIR) cfg.dataDir = process.env.STUDY_DATA_DIR;
  if (process.env.STUDY_PORT) cfg.port = Number(process.env.STUDY_PORT);
  return cfg;
}

export const config = loadConfig();
export const PORT = config.port || 3001;
export const DATA_DIR = path.resolve(config.dataDir);
export const DB_DIR = path.join(DATA_DIR, "db");
export const FILES_DIR = path.join(DATA_DIR, "files");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
export const INBOX_DIR = path.join(FILES_DIR, "_inbox");

export function ensureDirs() {
  for (const d of [DATA_DIR, DB_DIR, FILES_DIR, BACKUP_DIR, INBOX_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
