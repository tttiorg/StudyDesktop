/**
 * 学习桌面 · Electron 主进程（CommonJS）
 *
 * 把现有 Node 服务作为子进程拉起来，窗口加载 http://127.0.0.1:<端口>。
 * 前端、后端、路由、API 全部原样复用，业务代码一行不改。
 */
const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

let mainWindow = null;
let serverProc = null;
let serverPort = 0;
let quitting = false;

/* ---------------- 端口探测 ---------------- */

function probe(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function findPort(start = 3001, max = 40) {
  for (let p = start; p < start + max; p++) {
    if (await probe(p)) return p;
  }
  throw new Error("找不到可用端口");
}

function waitReachable(port, timeout = 25000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error("服务启动超时"));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

/* ---------------- 启动后端 ---------------- */

function appRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, "app") : path.resolve(__dirname, "..");
}

/** 与网页版保持一致：优先 D:\Document\学习桌面，没有 D 盘时用「文档」目录 */
function defaultDataDir() {
  try {
    if (fs.existsSync("D:\\")) return "D:\\Document\\学习桌面";
  } catch (e) {}
  return path.join(app.getPath("documents"), "学习桌面");
}

async function startServer() {
  serverPort = await findPort(3001);

  const entry = path.join(appRoot(), "server", "index.js");
  const dataDir = defaultDataDir();

  serverProc = spawn(process.execPath, [entry, "--no-open"], {
    cwd: appRoot(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(serverPort),
      STUDY_DATA_DIR: process.env.STUDY_DATA_DIR || dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProc.stdout.on("data", (d) => process.stdout.write("[server] " + d));
  serverProc.stderr.on("data", (d) => process.stderr.write("[server] " + d));

  serverProc.on("exit", (code) => {
    if (!quitting && code !== 0) {
      dialog.showErrorBox("后台服务已退出", "学习桌面的服务进程异常停止，请重新启动应用。\n退出码：" + code);
    }
  });

  await waitReachable(serverPort);
}

/* ---------------- 窗口 ---------------- */

function createWindow() {
  const iconPath = path.join(__dirname, "icon.png");

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 660,
    backgroundColor: "#13191c",
    autoHideMenuBar: true,
    title: "学习桌面",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.loadURL("http://127.0.0.1:" + serverPort);

  // 外链用系统浏览器打开，不在应用窗口里跳走
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("http://127.0.0.1:" + serverPort) && /^https?:/i.test(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ---------------- 生命周期 ---------------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      await startServer();
      createWindow();
    } catch (e) {
      dialog.showErrorBox("启动失败", String((e && e.message) || e));
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  const killServer = () => {
    quitting = true;
    if (serverProc) {
      try {
        serverProc.kill();
      } catch (e) {}
    }
  };

  app.on("window-all-closed", () => {
    killServer();
    app.quit();
  });

  app.on("before-quit", killServer);
}
