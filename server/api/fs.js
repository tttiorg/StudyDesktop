/**
 * 本地文件系统接口
 *
 * 资料改为「链接本地文件」而不是复制副本：
 *   - /api/fs/pick        弹出系统文件选择框（可多选）
 *   - /api/fs/pick-folder 弹出文件夹选择框，并扫描其中的文件
 *   - /api/fs/list        列目录（手动输入路径时用）
 *   - /api/fs/raw         读取文件内容（预览 / 下载）
 *
 * 服务只监听 127.0.0.1，且只做读取，不做删除或写入。
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { Router } from "express";

const isWin = process.platform === "win32";

/** 常见扩展名 → MIME */
const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] || "application/octet-stream";

/** 跑一段 PowerShell（STA 模式，WinForms 对话框需要） */
function runPS(script, timeout = 300000) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
      { timeout, maxBuffer: 1024 * 1024 * 8, windowsHide: false },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      }
    );
  });
}

const PS_HEAD = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
`;

const router = Router();

/** 弹出文件选择框，返回选中的绝对路径 */
router.post("/pick", async (req, res) => {
  if (!isWin) return res.status(400).json({ error: "当前系统不支持原生选择框，请手动输入路径" });

  const title = String(req.body?.title || "选择要链接的文件").replace(/'/g, "''");
  const script = `${PS_HEAD}
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title = '${title}'
$dlg.Multiselect = $true
$dlg.Filter = '所有文件|*.*'
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
$top.WindowState = 'Minimized'
$top.ShowInTaskbar = $false
if ($dlg.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) {
  $dlg.FileNames | ForEach-Object { Write-Output $_ }
}
$top.Dispose()
`;
  try {
    const out = await runPS(script);
    const paths = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    res.json({ paths });
  } catch (e) {
    res.status(500).json({ error: "打开选择框失败：" + e.message });
  }
});

/** 弹出文件夹选择框，返回文件夹里的文件（不含子目录） */
router.post("/pick-folder", async (req, res) => {
  if (!isWin) return res.status(400).json({ error: "当前系统不支持原生选择框，请手动输入路径" });

  const script = `${PS_HEAD}
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = '选择要映射的本地文件夹'
$dlg.ShowNewFolderButton = $false
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
$top.WindowState = 'Minimized'
$top.ShowInTaskbar = $false
if ($dlg.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output ('FOLDER:' + $dlg.SelectedPath)
}
$top.Dispose()
`;
  try {
    const out = await runPS(script);
    const line = out.split(/\r?\n/).map((s) => s.trim()).find((s) => s.startsWith("FOLDER:"));
    if (!line) return res.json({ folder: "", files: [] });

    const folder = line.slice(7);
    const files = listFiles(folder);
    res.json({ folder, files });
  } catch (e) {
    res.status(500).json({ error: "打开选择框失败：" + e.message });
  }
});

function listFiles(dir, limit = 500) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith(".") && !d.name.startsWith("~$"))
      .slice(0, limit)
      .map((d) => {
        const full = path.join(dir, d.name);
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {}
        return { path: full, name: d.name, size, type: mimeOf(full) };
      });
  } catch {
    return [];
  }
}

/** 列目录，供手动输入路径时浏览 */
router.get("/list", (req, res) => {
  const dir = String(req.query.path || "").trim();
  if (!dir) {
    // 没给路径时列盘符
    if (isWin) {
      const drives = [];
      for (let c = 65; c <= 90; c++) {
        const p = String.fromCharCode(c) + ":\\";
        try {
          if (fs.existsSync(p)) drives.push({ path: p, name: p, dir: true });
        } catch {}
      }
      return res.json({ path: "", parent: null, entries: drives });
    }
    return res.json({ path: "/", parent: null, entries: [{ path: "/", name: "/", dir: true }] });
  }

  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return res.status(400).json({ error: "不是一个文件夹" });

    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith(".") && !d.name.startsWith("~$"))
      .map((d) => {
        const full = path.join(dir, d.name);
        let size = 0;
        try {
          if (d.isFile()) size = fs.statSync(full).size;
        } catch {}
        return { path: full, name: d.name, dir: d.isDirectory(), size, type: mimeOf(full) };
      })
      .sort((a, b) => (b.dir ? 1 : 0) - (a.dir ? 1 : 0) || a.name.localeCompare(b.name));

    const parent = path.dirname(dir);
    res.json({ path: dir, parent: parent === dir ? null : parent, entries });
  } catch (e) {
    res.status(404).json({ error: "路径不存在或无法访问" });
  }
});

/** 读取文件内容 */
router.get("/raw", (req, res) => {
  const p = String(req.query.path || "").trim();
  if (!p) return res.status(400).send("缺少 path 参数");

  let stat;
  try {
    stat = fs.statSync(p);
  } catch {
    return res.status(404).send("文件不存在：" + p);
  }
  if (!stat.isFile()) return res.status(400).send("不是文件");

  res.setHeader("Content-Type", mimeOf(p));
  res.setHeader("Content-Length", stat.size);
  if (req.query.download) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`
    );
  }
  fs.createReadStream(p).pipe(res);
});

/** 检查路径是否存在（前端添加时校验用） */
router.post("/stat", (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  const out = paths.map((p) => {
    try {
      const st = fs.statSync(p);
      return {
        path: p,
        exists: true,
        dir: st.isDirectory(),
        size: st.isFile() ? st.size : 0,
        name: path.basename(p),
        type: mimeOf(p),
      };
    } catch {
      return { path: p, exists: false };
    }
  });
  res.json({ items: out });
});

/** 在资源管理器里定位文件（只读操作，不改动任何东西） */
router.post("/reveal", (req, res) => {
  if (!isWin) return res.status(400).json({ error: "当前系统不支持" });
  const p = String(req.body?.path || "").trim();
  if (!p) return res.status(400).json({ error: "缺少路径" });

  let exists = true;
  try {
    fs.statSync(p);
  } catch {
    exists = false;
  }
  if (!exists) return res.status(404).json({ error: "路径不存在" });

  const isDir = (() => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  })();

  execFile(
    "explorer.exe",
    isDir ? [p] : ["/select,", p],
    { windowsHide: false },
    () => {} // explorer 正常也返回非 0，忽略
  );
  res.json({ ok: true });
});

export default router;
