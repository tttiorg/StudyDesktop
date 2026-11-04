/**
 * 反向代理：让外部网页能被 iframe 嵌入
 *
 * 为什么需要它：
 *   1. 目标站点带 X-Frame-Options / CSP，浏览器会拒绝渲染 → 这里剥掉限制头。
 *   2. 目标站点有反爬（Chrome 直连返回 blocked），但 Node 服务端请求能过
 *      → 所以不只是 HTML，**连 CSS / JS / 图片也都必须走服务端代理**。
 *
 * 两段式设计：
 *   /__proxy?url=<绝对地址>   返回页面本身（HTML），并在其中把站内地址改写为 /__px/<key>/...
 *   /__px/<key>/<路径>        <key> 是 origin 的 base64url，按原样回源取子资源
 *
 * 这样 iframe 里的文档与所有子资源都是同源的 http://127.0.0.1:PORT/…，
 * 既不会被反爬拦截，也不会触发跨域限制。
 */
import http from "node:http";
import https from "node:https";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PX = "/__px/";
const MAX_HTML = 8 * 1024 * 1024;

/* ---------------- 编码工具 ---------------- */

function keyOf(origin) {
  return Buffer.from(origin, "utf8").toString("base64url");
}

function originOfKey(key) {
  try {
    const s = Buffer.from(String(key), "base64url").toString("utf8");
    return /^https?:\/\/[^/]+$/i.test(s) ? s : "";
  } catch {
    return "";
  }
}

/* ---------------- 文本改写 ---------------- */

/**
 * 把文本里的站内地址改写到本代理前缀下。
 * 同一套规则对 html / css / js 都适用，只是各自会命中的模式不同。
 */
function rewriteText(s, origin, key) {
  const p = PX + key;

  // 1) 站内绝对地址 → 代理前缀
  if (origin) s = s.split(origin).join(p);

  // 2) HTML 属性里以 / 开头（排除 // 协议相对）
  s = s.replace(/(\s(?:href|src|action|poster|content|data-src)=")\/(?!\/)/gi, (_m, a) => a + p + "/");

  // 3) 脚本 / JSON 字符串里的根相对路径："/assets/x.js"、'\/api\/x'
  s = s.replace(/(["'`])\/(assets|api|_next|static|fonts?|images?)\//g, (_m, q, d) => q + p + "/" + d + "/");

  // 4) 同上，但路径被转义成 \/assets\/ 的写法（Next / RR 的流式数据里常见）
  const pe = p.replace(/\//g, "\\/");
  s = s.replace(/\\\/(assets|api|_next|static|fonts?|images?)\\\//g, (_m, d) => pe + "\\/" + d + "\\/");

  // 5) CSS 的 url(/xxx) 与 @import "/xxx"
  s = s.replace(/url\(\s*(['"]?)\/(?!\/)/gi, (_m, q) => "url(" + q + p + "/");
  s = s.replace(/@import\s+(['"])\/(?!\/)/gi, (_m, q) => "@import " + q + p + "/");

  return s;
}

/** 注入 <base> 与点击拦截脚本（站内链接继续走代理，站外链接新窗口打开） */
function buildInject(origin, key) {
  const js = `
(function(){
  var O = ${JSON.stringify(origin)};
  var P = ${JSON.stringify(PX + key)};
  function abs(href){
    if (href.indexOf(P) === 0) return O + href.slice(P.length);
    try { return new URL(href, O + '/').href; } catch (e) { return ''; }
  }
  function go(u){
    location.href = location.origin + '/__proxy?url=' + encodeURIComponent(u);
  }
  document.addEventListener('click', function(e){
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return;
    var u = abs(href);
    if (!u || !/^https?:/i.test(u)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (u.indexOf(O) === 0) go(u);
    else window.open(u, '_blank', 'noopener');
  }, true);
})();`;
  // base 让相对地址也落在代理前缀下
  return `<base href="${PX + key}/"><script>${js}<\/script>`;
}

/* ---------------- 回源 ---------------- */

function request(target, { method = "GET", headers = {}, body = null, depth = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(target);
    } catch {
      return reject(new Error("非法的 URL"));
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return reject(new Error("只支持 http / https"));
    }
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: {
          "user-agent": UA,
          accept: "*/*",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "accept-encoding": "identity",
          referer: u.origin + "/",
          ...headers,
        },
      },
      (up) => {
        const code = up.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(code) && up.headers.location && depth < 6) {
          const next = new URL(up.headers.location, u).href;
          up.resume();
          const nextMethod = code === 303 || ((code === 301 || code === 302) && method === "POST") ? "GET" : method;
          return request(next, { method: nextMethod, headers, body: nextMethod === "GET" ? null : body, depth: depth + 1 })
            .then(resolve, reject);
        }
        resolve({ up, code });
      }
    );
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("上游超时")));
    if (body) req.write(body);
    req.end();
  });
}

/** 把非文本资源直接透传 */
function pipeThrough(up, res, code, type) {
  res.writeHead(code, {
    "content-type": type,
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  });
  up.pipe(res);
}

/** 读完整段文本，改写后再返回 */
function readText(up, limit = MAX_HTML) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    up.on("data", (c) => {
      size += c.length;
      // 超限时不要 destroy：保留已收内容，避免整页变空
      if (size > limit) {
        if (size - c.length <= limit) chunks.push(c.slice(0, limit - (size - c.length)));
        return;
      }
      chunks.push(c);
    });
    up.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    up.on("error", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

const TEXTUAL = /^(text\/|application\/(javascript|json|xml|xhtml\+xml|ecmascript))/i;

/* ---------------- 页面代理 ---------------- */

async function handleDocument(target, res) {
  let u;
  try {
    u = new URL(target);
  } catch {
    return res.status(400).send("非法的 URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return res.status(400).send("只支持 http / https");
  }

  let r;
  try {
    r = await request(u.href, { headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
  } catch (e) {
    return res.status(502).send("代理请求失败：" + e.message);
  }

  const { up, code } = r;
  const type = up.headers["content-type"] || "application/octet-stream";

  if (!type.includes("text/html")) return pipeThrough(up, res, code, type);

  const origin = u.origin;
  const key = keyOf(origin);
  let html = await readText(up);

  html = html.replace(/<base\b[^>]*>/gi, "");
  // Next.js 先输出 preload as=style，再由 JS 换成 stylesheet；iframe 里会先闪一下无样式
  html = html.replace(/<link\b[^>]*>/gi, (tag) =>
    /as="style"/i.test(tag) && /rel="preload"/i.test(tag) ? tag.replace(/rel="preload"/i, 'rel="stylesheet"') : tag
  );

  // 计算流式隐藏块：React Router / Next 的 Suspense 内容靠内联脚本揭晓，
  // 若因为脚本报错而留在 <div hidden> 里就会白屏，这里顺带兜底去掉 hidden。
  html = rewriteText(html, origin, key);
  html = html.replace(/<div hidden id="(S:\d+)"/g, '<div id="$1"');

  const inject = buildInject(origin, key);
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inject) : inject + html;

  res.writeHead(code, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(html);
}

export function proxyHandler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send("缺少 ?url= 参数");
  handleDocument(String(target), res);
}

/* ---------------- 子资源代理 ---------------- */

export function assetHandler(req, res) {
  const m = /^\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/.exec(req.url || "");
  if (!m) return res.status(400).end("bad asset path");
  const key = m[1];
  const origin = originOfKey(key);
  if (!origin) return res.status(400).end("bad origin key");

  const target = origin + (m[2] || "/") + (m[3] || "");
  const headers = {};
  const ct = req.headers["content-type"];
  if (ct) headers["content-type"] = ct;
  if (req.headers.cookie) headers.cookie = req.headers.cookie;

  // 子资源基本都是 GET；其余方法按 GET 回源，避免 body 已被解析中间件吃掉
  const method = req.method === "HEAD" ? "HEAD" : "GET";

  request(target, { method, headers })
    .then(async ({ up, code }) => {
      const type = up.headers["content-type"] || "application/octet-stream";
      const enc = up.headers["content-encoding"];
      if (enc && enc !== "identity") return pipeThrough(up, res, code, type);
      if (!TEXTUAL.test(type)) return pipeThrough(up, res, code, type);

      let text = await readText(up, 12 * 1024 * 1024);
      text = rewriteText(text, origin, key);
      res.writeHead(code, {
        "content-type": type,
        "cache-control": "public, max-age=300",
        "access-control-allow-origin": "*",
      });
      res.end(text);
    })
    .catch((e) => {
      if (!res.headersSent) res.status(502).end("资源代理失败：" + e.message);
    });
}
