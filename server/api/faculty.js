/**
 * 教师信息查询
 *
 * 数据来源：南科大官网师资库
 *   https://www.sustech.edu.cn/zh/search?wd=姓名&type=faculty
 * 页面本身是 AJAX 渲染，真实数据接口是 /zh/search/data?type=faculty&wd=姓名&page=1
 * 返回一段 HTML，这里用正则解析出姓名 / 职称 / 院系 / 头像。
 */
import { Router } from "express";
import http from "node:http";
import https from "node:https";

const BASE = "https://www.sustech.edu.cn";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** 简单内存缓存，避免反复打扰官网 */
const cache = new Map();
const TTL = 1000 * 60 * 60 * 12;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "user-agent": UA,
          accept: "text/html,application/json,*/*",
          "accept-language": "zh-CN,zh;q=0.9",
          "x-requested-with": "XMLHttpRequest",
          referer: BASE + "/zh/search",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return fetchText(new URL(res.headers.location, url).href).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("请求官网超时")));
  });
}

const stripTags = (s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function parseFaculty(html) {
  const out = [];
  // 每个结果是一个 <li> ... </li>
  const blocks = html.split(/<li[\s>]/i).slice(1);

  for (const block of blocks) {
    const nameM = block.match(/class="name"[^>]*>([\s\S]*?)<\/div>/i);
    if (!nameM) continue;
    const name = stripTags(nameM[1]);
    if (!name) continue;

    const linkM = block.match(/href="([^"]*faculties[^"]*)"/i);
    const avatarM = block.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
    const titleM = block.match(/class="p"[^>]*>([\s\S]*?)<\/div>/i);
    const honorM = block.match(/class="p2"[^>]*>([\s\S]*?)<\/div>/i);
    const postM = block.match(/class="p1"[^>]*>([\s\S]*?)<\/div>/i);
    const deptM = block.match(/class="dep"[^>]*>([\s\S]*?)<\/div>/i);

    out.push({
      name,
      title: titleM ? stripTags(titleM[1]) : "",
      honor: honorM ? stripTags(honorM[1]) : "",
      post: postM ? stripTags(postM[1]) : "",
      dept: deptM ? stripTags(deptM[1]) : "",
      avatar: avatarM ? (avatarM[1].startsWith("http") ? avatarM[1] : BASE + avatarM[1]) : "",
      url: linkM ? (linkM[1].startsWith("http") ? linkM[1] : BASE + linkM[1]) : "",
    });
  }
  return out;
}

const router = Router();

router.get("/search", async (req, res) => {
  const name = String(req.query.name || "").trim();
  if (!name) return res.status(400).json({ error: "缺少 name 参数" });

  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL) {
    return res.json({ items: hit.items, cached: true });
  }

  try {
    const url =
      BASE +
      "/zh/search/data?type=faculty&wd=" +
      encodeURIComponent(name) +
      "&page=1";
    const html = await fetchText(url);

    // 接口返回的是 JSON 字符串（HTML 片段被转义），先尝试解析
    let raw = html;
    try {
      const parsed = JSON.parse(html);
      if (typeof parsed === "string") raw = parsed;
    } catch {}

    const items = parseFaculty(raw).slice(0, 8);
    cache.set(name, { at: Date.now(), items });
    res.json({ items });
  } catch (e) {
    res.status(502).json({ error: "查询官网失败：" + e.message });
  }
});

export default router;
