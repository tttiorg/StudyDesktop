/**
 * 开发模式：同时启动后端(3001) 和 Vite(5173)
 * 访问 http://localhost:5173 ，改前端代码会热更新
 */
import { spawn } from "node:child_process";

const children = [];

function start(label, cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit", shell: true });
  children.push(child);
  child.on("exit", (code) => {
    if (code !== null && code !== 0) console.log(`[${label}] 退出，代码 ${code}`);
  });
}

function shutdown() {
  for (const c of children) {
    try {
      c.kill();
    } catch {}
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("server", "node", ["server/index.js", "--no-open"]);
start("web", "npx", ["vite"]);
