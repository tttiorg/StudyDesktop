/* 生成学习桌面的图标：favicon.ico（多尺寸）+ icon.png + electron 打包用 icon.ico
 * 纯 Node 实现，不依赖外部图像库。
 * 用法：node scripts/make-icon.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");

/* ---------------- 画图 ---------------- */

/* 配色沿用 webui / AIHOT 的主题：
   深底 #13191c -> #1a2226，前景用主色青 #12ccd8 -> #0a8f9e
   这样在浅色或深色任务栏上都够清晰，也和界面的观感一致 */
const BG_TOP = [19, 25, 28]; // #13191c
const BG_BOT = [26, 34, 38]; // #1a2226
const ACCENT_TOP = [18, 204, 216]; // #12ccd8
const ACCENT_BOT = [10, 143, 158]; // #0a8f9e

/** 圆角矩形：返回 0~1 的覆盖率（用超采样算） */
function roundRectCov(x, y, r) {
  // 归一化坐标 0..1，圆角半径 r（0..0.5）
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  return d <= r ? 1 : 0;
}

function inQuad(px, py, q) {
  // 凸四边形点内测试（叉积同号）
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i];
    const [x2, y2] = q[(i + 1) % 4];
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// 摊开的书：左右两页 + 中间书脊
const PAGE_L = [
  [0.470, 0.385],
  [0.205, 0.315],
  [0.205, 0.685],
  [0.470, 0.740],
];
const PAGE_R = [
  [0.530, 0.385],
  [0.795, 0.315],
  [0.795, 0.685],
  [0.530, 0.740],
];

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** 在 (x,y) 处取色，返回 [r,g,b,a] 0~255 */
function shade(x, y) {
  // 背景圆角方块
  const bg = roundRectCov(x, y, 0.225);
  if (bg === 0) return [0, 0, 0, 0];

  let col = lerp(BG_TOP, BG_BOT, y);

  // 书体本身用主色渐变（自下而上，和页面里 accent 的走向一致）
  const book = lerp(ACCENT_BOT, ACCENT_TOP, 1 - y);

  // 书脊：中间一条竖条
  const spine = x >= 0.474 && x <= 0.526 && y >= 0.372 && y <= 0.752;
  // 左右两页
  const page = inQuad(x, y, PAGE_L) || inQuad(x, y, PAGE_R);

  if (spine || page) {
    col = book;
  } else {
    // 页面和书脊之间的暗缝，做出折线层次
    const gapL = x > 0.455 && x < 0.478 && y > 0.38 && y < 0.748;
    const gapR = x > 0.522 && x < 0.545 && y > 0.38 && y < 0.748;
    if (gapL || gapR) {
      col = [Math.round(book[0] * 0.45), Math.round(book[1] * 0.45), Math.round(book[2] * 0.45)];
    }
  }

  return [col[0], col[1], col[2], 255];
}

const SS = 4; // 每像素 4x4 超采样

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const c = shade(x, y);
          // 预乘合成
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const n = SS * SS;
      const aa = a / n;
      const i = (py * size + px) * 4;
      if (aa > 0) {
        buf[i] = Math.round(r / a);
        buf[i + 1] = Math.round(g / a);
        buf[i + 2] = Math.round(b / a);
      }
      buf[i + 3] = Math.round(aa);
    }
  }
  return buf;
}

/* ---------------- 编码 PNG ---------------- */

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前加 filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 编码 ICO（内嵌 PNG） ---------------- */

function encodeICO(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const blobs = [];

  entries.forEach((e, i) => {
    const p = 16 * i;
    dir[p] = e.size >= 256 ? 0 : e.size;
    dir[p + 1] = e.size >= 256 ? 0 : e.size;
    dir[p + 2] = 0; // palette
    dir[p + 3] = 0;
    dir.writeUInt16LE(1, p + 4); // color planes
    dir.writeUInt16LE(32, p + 6); // bpp
    dir.writeUInt32LE(e.png.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += e.png.length;
    blobs.push(e.png);
  });

  return Buffer.concat([header, dir, ...blobs]);
}

/* ---------------- 输出 ---------------- */

const targets = [
  { size: 16 },
  { size: 24 },
  { size: 32 },
  { size: 48 },
  { size: 64 },
  { size: 128 },
  { size: 256 },
];

const entries = targets.map((t) => {
  const rgba = render(t.size);
  return { size: t.size, png: encodePNG(t.size, rgba) };
});

// favicon.ico 放 web/public，Vite 会复制到 dist 根目录
const ico = encodeICO(entries);
fs.writeFileSync(path.join(ROOT, "web/public/favicon.ico"), ico);
console.log("web/public/favicon.ico", ico.length, "bytes");

// 打包用的图标（electron-builder 需要 256 起的 ico）
fs.mkdirSync(path.join(ROOT, "electron"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "electron/icon.ico"), ico);
console.log("electron/icon.ico", ico.length, "bytes");

// 大图，供桌面快捷方式/预览用
const big = encodePNG(512, render(512));
fs.writeFileSync(path.join(ROOT, "web/public/icon-512.png"), big);
fs.writeFileSync(path.join(ROOT, "electron/icon.png"), big);
console.log("web/public/icon-512.png", big.length, "bytes");

// 内联 SVG，给现代浏览器优先使用（缩放无损）
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#13191c"/>
      <stop offset="1" stop-color="#1a2226"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#0a8f9e"/>
      <stop offset="1" stop-color="#12ccd8"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22.5" fill="url(#bg)"/>
  <path d="M47 38.5 L20.5 31.5 L20.5 68.5 L47 74 Z" fill="url(#ink)"/>
  <path d="M53 38.5 L79.5 31.5 L79.5 68.5 L53 74 Z" fill="url(#ink)"/>
  <rect x="47.4" y="37" width="5.2" height="38" fill="url(#ink)"/>
</svg>
`;
fs.writeFileSync(path.join(ROOT, "web/public/favicon.svg"), svg);
console.log("web/public/favicon.svg ok");
