/** 后端接口封装，所有请求集中在这里，方便以后调整 */

async function request(url, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: isForm ? options.headers : { "Content-Type": "application/json", ...(options.headers || {}) },
  });

  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export const api = {
  health: () => request("/api/health"),

  subjects: {
    list: () => request("/api/subjects"),
    create: (data) => request("/api/subjects", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
      request(`/api/subjects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/subjects/${id}`, { method: "DELETE" }),
    reorder: (ids) => request("/api/subjects/reorder", { method: "PUT", body: JSON.stringify({ ids }) }),
  },

  timetable: {
    get: () => request("/api/timetable"),
    save: (slots) => request("/api/timetable", { method: "PUT", body: JSON.stringify({ slots }) }),
    saveMeta: (meta) => request("/api/timetable", { method: "PUT", body: JSON.stringify({ meta }) }),
    clear: () => request("/api/timetable", { method: "DELETE" }),
  },

  files: {
    list: (params = {}) => {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== null)
      ).toString();
      return request("/api/files" + (qs ? `?${qs}` : ""));
    },
    upload: (formData) => request("/api/files", { method: "POST", body: formData }),
    link: (data) => request("/api/files/link", { method: "POST", body: JSON.stringify(data) }),
    /** 映射整个文件夹（含子文件夹），之后每次读取都会自动同步变动 */
    folder: (data) => request("/api/files/folder", { method: "POST", body: JSON.stringify(data) }),
    /** 手动触发一次文件夹重新扫描 */
    sync: (data) => request("/api/files/sync", { method: "POST", body: JSON.stringify(data || {}) }),
    update: (id, data) =>
      request(`/api/files/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/files/${id}`, { method: "DELETE" }),
    rawUrl: (id) => `/api/files/${id}/raw`,
    downloadUrl: (id) => `/api/files/${id}/raw?download=1`,
    stats: () => request("/api/files/stats/summary"),
  },

  fs: {
    reveal: (path) => request("/api/fs/reveal", { method: "POST", body: JSON.stringify({ path }) }),
  },

  schedules: {
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return request("/api/schedules" + (qs ? `?${qs}` : ""));
    },
    create: (data) => request("/api/schedules", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
      request(`/api/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/schedules/${id}`, { method: "DELETE" }),
  },

  grades: {
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return request("/api/grades" + (qs ? `?${qs}` : ""));
    },
    create: (data) => request("/api/grades", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/grades/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/grades/${id}`, { method: "DELETE" }),
  },

  notes: {
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return request("/api/notes" + (qs ? `?${qs}` : ""));
    },
    create: (data) => request("/api/notes", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/notes/${id}`, { method: "DELETE" }),
  },

  links: {
    list: () => request("/api/links"),
    create: (data) => request("/api/links", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/links/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/links/${id}`, { method: "DELETE" }),
    reorder: (ids) => request("/api/links/reorder", { method: "PUT", body: JSON.stringify({ ids }) }),
  },

  /** 导入标准 JSON（学科 / 课表 / 日程 / 成绩 / 笔记 / 知识点 / 资料 / 外链） */
  importData: (payload) => request("/api/import", { method: "POST", body: JSON.stringify(payload) }),

  faculty: {
    search: (name) => request("/api/faculty/search?name=" + encodeURIComponent(name)),
  },

  /** 首页配图（必应每日壁纸，服务端缓存到本地） */
  wallpaper: {
    list: () => request("/api/wallpaper/list"),
  },

  knowledge: {
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return request("/api/knowledge" + (qs ? `?${qs}` : ""));
    },
    create: (data) => request("/api/knowledge", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
      request(`/api/knowledge/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/knowledge/${id}`, { method: "DELETE" }),
    review: (id, action) =>
      request(`/api/knowledge/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
  },
};

/* ---------- 艾宾浩斯复习间隔，与后端保持一致 ---------- */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30, 60];

export function reviewLabel(stage, nextReview, mastered) {
  if (mastered) return "已掌握";
  if (!nextReview) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(nextReview + "T00:00:00");
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return `已逾期 ${-diff} 天`;
  if (diff === 0) return "今天复习";
  if (diff === 1) return "明天复习";
  return `${diff} 天后复习`;
}

export function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(2) + " GB";
}
