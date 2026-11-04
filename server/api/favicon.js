/**
 * 网站图标代理
 *
 * 直接 <img src="https://别的站/favicon.ico"> 常因防盗链或路径不一致失败，
 * 这里由后端抓首页 HTML 解析 <link rel="icon">，再把图标流式转发回来。
 */
import http from "node:http";
import https from "node:https";
import { Router } from "express";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const cache = new Map(); // origin -> { at, buf, type }
const TTL = 1000 * 60 * 60 * 24;

function get(url, maxBytes = 400 * 1024, depth = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error("bad url"));
    }
    const mod = u.protocol === "https:" ? https : http;

    const req = mod.get(
      url,
      {
        headers: {
          "user-agent": UA,
          accept: "*/*",
          "accept-encoding": "identity",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 3) {
          res.resume();
          return get(new URL(res.headers.location, url).href, maxBytes, depth + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode));
        }
        const chunks = [];
        let size = 0;
        let done = false;
        res.on("data", (c) => {
          if (done) return;
          size += c.length;
          if (size > maxBytes) {
            // 超限时保留已收到的部分即可，解析 <head> 足够
            done = true;
            chunks.push(c);
            res.destroy();
            resolve({ buf: Buffer.concat(chunks), type: res.headers["content-type"] || "" });
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          if (done) return;
          done = true;
          resolve({ buf: Buffer.concat(chunks), type: res.headers["content-type"] || "" });
        });
        res.on("error", () => {
          if (done) return;
          done = true;
          resolve({ buf: Buffer.concat(chunks), type: res.headers["content-type"] || "" });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
  });
}

/** 从首页 HTML 里找图标地址 */
function findIconHref(html, base) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  const candidates = [];
  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']?[^"'>]*(icon)[^"'>]*/i.test(tag)) continue;
    const m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!m) continue;
    const sizeM = tag.match(/sizes\s*=\s*["'](\d+)x\d+["']/i);
    candidates.push({ href: m[1], size: sizeM ? Number(sizeM[1]) : 0 });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.size - a.size);
  try {
    return new URL(candidates[0].href, base).href;
  } catch {
    return null;
  }
}

const router = Router();

router.get("/", async (req, res) => {
  const raw = String(req.query.url || "").trim();
  if (!raw) return res.status(400).send("缺少 url");

  let origin;
  try {
    origin = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw).origin;
  } catch {
    return res.status(400).send("url 不合法");
  }

  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < TTL) {
    res.setHeader("Content-Type", hit.type);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.end(hit.buf);
  }

  // 先试最常见的根图标（最快），再解析首页 HTML 找声明的图标
  const tryUrls = [origin + "/favicon.ico", origin + "/favicon.png"];
  try {
    const page = await get(origin + "/", 600 * 1024);
    const html = page.buf.toString("utf8");
    const href = findIconHref(html, origin + "/");
    if (href) tryUrls.unshift(href);
  } catch {}

  for (const u of tryUrls) {
    try {
      const { buf, type } = await get(u, 512 * 1024);
      if (!buf.length) continue;
      // 有些站对 /favicon.ico 返回 HTML 错误页，过滤掉
      if (type.includes("text/html")) continue;
      const finalType = type || "image/x-icon";
      cache.set(origin, { at: Date.now(), buf, type: finalType });
      res.setHeader("Content-Type", finalType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.end(buf);
    } catch {}
  }

  res.status(404).send("没有找到图标");
});

export default router;
