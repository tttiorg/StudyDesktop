/**
 * 学习桌面 - 后端入口
 *
 * 职责：
 *   /api/*      数据接口
 *   /__proxy    外部网页代理（用于左侧 AIHOT 栏）
 *   其余        托管前端构建产物 dist/，并支持 SPA 路由回退
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

import { PORT, WEB_DIST, DATA_DIR, ensureDirs } from "./config.js";
import { cleanupBackups } from "./store.js";
import subjectsRouter from "./api/subjects.js";
import timetableRouter from "./api/timetable.js";
import filesRouter from "./api/files.js";
import facultyRouter from "./api/faculty.js";
import knowledgeRouter from "./api/knowledge.js";
import fsRouter from "./api/fs.js";
import faviconRouter from "./api/favicon.js";
import importRouter from "./api/import.js";
import wallpaperRouter from "./api/wallpaper.js";
import { schedules, grades, notes, links } from "./api/collections.js";
import { proxyHandler, assetHandler } from "./proxy.js";

ensureDirs();
const cleaned = cleanupBackups();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

app.use("/api/subjects", subjectsRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/files", filesRouter);
app.use("/api/faculty", facultyRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/fs", fsRouter);
app.use("/api/favicon", faviconRouter);
app.use("/api/import", importRouter);
app.use("/api/wallpaper", wallpaperRouter);
app.use("/api/schedules", schedules.router);
app.use("/api/grades", grades.router);
app.use("/api/notes", notes.router);
app.use("/api/links", links.router);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: "0.1.0",
    dataDir: DATA_DIR,
    backupsCleaned: cleaned,
  });
});

app.get("/__proxy", proxyHandler);
// 被代理页面的 CSS / JS / 图片等子资源（同源，绕过目标站点对浏览器的反爬）
app.use("/__px", assetHandler);

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false }));
}

// SPA 路由回退：刷新 /subjects/xxx 这类地址时仍然返回 index.html
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/__proxy") || req.path.startsWith("/__px")) return next();

  // 带扩展名的请求是真静态资源，找不到就该 404，
  // 不能回退成 index.html —— 否则会把脚本当 HTML 塞给浏览器
  if (path.extname(req.path)) return next();

  const indexHtml = path.join(WEB_DIST, "index.html");
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  res
    .status(503)
    .type("text/plain")
    .send("前端尚未构建。请先运行：npm run build\n或者开发模式：npm run dev");
});

const HOST = process.env.STUDY_HOST || "127.0.0.1";

app.listen(PORT, HOST, () => {
  const url = "http://localhost:" + PORT;
  console.log("");
  console.log("  学习桌面服务已启动");
  console.log("  地址    : " + url);
  console.log("  数据目录: " + DATA_DIR);
  console.log("");

  if (!process.argv.includes("--no-open")) {
    openAppWindow(url);
  }
});

/**
 * 打开应用窗口
 * ------------------------------------------------------------
 * 目标是「双击启动就全屏的一个独立应用窗口」，而不是用默认浏览器打开一个标签页。
 *
 * 参数选择依据（scripts/verify/fullscreen-app.cjs 实测，1920x1080 屏幕）：
 *   --start-fullscreen  -> windowState=fullscreen，视口 1920x1080，完全铺满
 *   --start-maximized   -> windowState=maximized，视口 1920x1009（被任务栏占 71px）
 *   --window-size=W,H   -> windowState=normal，四周留一圈
 * 所以用 --start-fullscreen。没选 --kiosk：那个会锁死用户（退不出全屏）。
 * 全屏状态下按 F11 或 Esc 可以退出，用户可以自己切回来。
 *
 * 另外验证过：即使 Chrome 已经在运行（同一 profile），
 * 新进程带 --start-fullscreen 依然能开出 fullscreen 的独立窗口，
 * 不会被已有实例吞掉参数（见 scripts/verify/fullscreen-shared.cjs）。
 */
function openAppWindow(url) {
  // Edge 优先。它是 Windows 自带的，不会因为用户卸载/重装 Chrome 而失效；
  // 且 --app + --start-fullscreen 两个参数的行为与 Chrome 完全一致（同一内核）。
  // Chrome 留作兜底，万一 Edge 被精简掉还能开出来。
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  ];

  const browser = candidates.find((p) => p && fs.existsSync(p));

  if (!browser) {
    // 没有 Chrome/Edge：退回默认浏览器（至少能用，只是不全屏）
    const fallback =
      process.platform === "win32" ? `start "" "${url}"`
      : process.platform === "darwin" ? `open "${url}"`
      : `xdg-open "${url}"`;
    exec(fallback, () => {});
    return;
  }

  // --app 让窗口独立、任务栏显示学习桌面自己的图标；
  // --start-fullscreen 直接铺满整屏。
  // 路径里有空格，必须整体加引号。
  // STUDY_DEBUG_PORT / STUDY_CHROME_PROFILE 只在验证脚本里用
  // （见 scripts/verify/e2e-start.cjs）。正常启动时这两个变量不存在，
  // 命令行与用户可见行为完全一致。
  const dbgPort = process.env.STUDY_DEBUG_PORT;
  const dbgProfile = process.env.STUDY_CHROME_PROFILE;
  let extra = "";
  if (dbgPort) extra += ` --remote-debugging-port=${dbgPort}`;
  if (dbgProfile) extra += ` --user-data-dir="${dbgProfile}"`;
  const cmd = `"${browser}" --app="${url}" --start-fullscreen${extra}`;
  exec(cmd, (err) => {
    if (err) {
      // 浏览器拒绝启动时别让用户面对一个空屏幕，退回默认浏览器
      const fallback =
        process.platform === "win32" ? `start "" "${url}"`
        : process.platform === "darwin" ? `open "${url}"`
        : `xdg-open "${url}"`;
      exec(fallback, () => {});
    }
  });
}
