/**
 * 首页配图：必应每日壁纸
 *
 * 为什么不在前端直接引用外链：
 *   - 必应图片没有 CORS，也不保证长期有效；
 *   - 拉一次存到本机，之后离线也能显示，还不会每次打开都重新下载。
 *
 * 接口：
 *   GET /api/wallpaper/list  返回可用图片列表（含版权说明）
 *   GET /api/wallpaper/img?u=<编码后的必应地址>  取图片（磁盘缓存）
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import { Router } from "express";
import { FILES_DIR } from "../config.js";

const CACHE_DIR = path.join(FILES_DIR, "_wallpaper");
const LIST_TTL = 60 * 60 * 1000; // 1 小时刷新一次列表

let cache = { at: 0, items: [] };

function get(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          accept: "*/*",
          "accept-encoding": "identity",
        },
      },
      (r) => {
        if ([301, 302, 307, 308].includes(r.statusCode) && r.headers.location) {
          r.resume();
          return get(new URL(r.headers.location, url).href, timeout).then(resolve, reject);
        }
        resolve(r);
      }
    );
    req.on("error", reject);
    req.setTimeout(timeout, () => req.destroy(new Error("超时")));
  });
}

async function readBody(stream, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of stream) {
    size += c.length;
    if (size > limit) break;
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** 必应每日壁纸，取最近 8 天，随机用 */
async function fetchList() {
  const url = "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN";
  const r = await get(url);
  const buf = await readBody(r);
  const json = JSON.parse(buf.toString("utf8"));
  const images = Array.isArray(json.images) ? json.images : [];
  return images
    .filter((i) => i.urlbase)
    .map((i) => ({
      // _1920x1080 比原图小一半，够用且加载快
      remote: "https://cn.bing.com" + i.urlbase + "_1920x1080.jpg",
      credit: String(i.copyright || "").replace(/\s*\(©.*?\)\s*$/, "").trim(),
      date: String(i.startdate || ""),
    }));
}

/* ---------------- 路由 ---------------- */

const router = Router();

router.get("/list", async (req, res) => {
  try {
    if (Date.now() - cache.at > LIST_TTL || !cache.items.length) {
      cache = { at: Date.now(), items: await fetchList() };
    }
    const items = cache.items.map((i) => ({
      src: "/api/wallpaper/img?u=" + encodeURIComponent(i.remote),
      credit: i.credit,
      date: i.date,
    }));
    res.json({ items });
  } catch (e) {
    // 拿不到就返回空，前端自动退回本地图
    res.json({ items: [], error: e.message });
  }
});

router.get("/img", async (req, res) => {
  const raw = String(req.query.u || "");
  let u;
  try {
    u = new URL(raw);
  } catch {
    return res.status(400).send("参数不合法");
  }
  // 只代理必应，别被当成万能代理
  if (!/(^|\.)bing\.com$/i.test(u.hostname)) return res.status(403).send("不允许的域名");

  const name = crypto.createHash("sha1").update(u.href).digest("hex").slice(0, 16) + ".jpg";
  const file = path.join(CACHE_DIR, name);

  try {
    const st = fs.statSync(file);
    if (st.size > 1024) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=604800");
      return fs.createReadStream(file).pipe(res);
    }
  } catch {}

  try {
    const r = await get(u.href, 20000);
    if (r.statusCode !== 200) return res.status(502).send("图片获取失败");
    const buf = await readBody(r, 12 * 1024 * 1024);
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, buf);
    } catch {}
    res.setHeader("Content-Type", r.headers["content-type"] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.end(buf);
  } catch (e) {
    res.status(502).send("图片获取失败：" + e.message);
  }
});

export default router;
