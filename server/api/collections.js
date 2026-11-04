/**
 * 日程 / 成绩 / 笔记 / 外链 四类集合
 * 结构同构，统一用 crud 工厂生成，各自的字段清洗规则在这里定义。
 */
import { makeCrud } from "./crud.js";

const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);

/* ---------------- 日程 ---------------- */
const SCHEDULE_TYPES = ["task", "assignment", "exam", "project", "activity"];

function sanSchedule(body = {}, old) {
  const out = {};
  const creating = !old;

  if (creating || body.title !== undefined) {
    const title = str(body.title, 120);
    if (!title) return null;
    out.title = title;
  }
  if (creating || body.due !== undefined) {
    const due = str(body.due, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
    out.due = due;
  }
  if (creating || body.type !== undefined) {
    out.type = SCHEDULE_TYPES.includes(body.type) ? body.type : "task";
  }
  if (body.subjectId !== undefined) out.subjectId = body.subjectId || null;
  if (body.time !== undefined) {
    const t = str(body.time, 5);
    out.time = /^\d{2}:\d{2}$/.test(t) ? t : "";
  }
  if (body.place !== undefined) out.place = str(body.place, 80);
  if (body.note !== undefined) out.note = str(body.note, 1000);
  if (body.done !== undefined) out.done = !!body.done;
  if (creating && out.done === undefined) out.done = false;
  return out;
}

export const schedules = makeCrud("schedules", {
  prefix: "d_",
  sanitize: sanSchedule,
  sort: (items) =>
    [...items].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      const d = (a.due || "").localeCompare(b.due || "");
      return d !== 0 ? d : (a.time || "").localeCompare(b.time || "");
    }),
});

/* ---------------- 成绩 ---------------- */
const GRADE_TYPES = ["homework", "quiz", "exam", "project", "other"];

function sanGrade(body = {}, old) {
  const out = {};
  const creating = !old;

  if (creating || body.name !== undefined) {
    const name = str(body.name, 80);
    if (!name) return null;
    out.name = name;
  }
  if (creating || body.subjectId !== undefined) out.subjectId = body.subjectId || null;
  if (body.score !== undefined) {
    const n = Number(body.score);
    out.score = Number.isFinite(n) ? n : null;
  }
  if (body.full !== undefined) {
    const n = Number(body.full);
    out.full = Number.isFinite(n) && n > 0 ? n : 100;
  }
  if (creating && out.full === undefined) out.full = 100;
  if (body.weight !== undefined) {
    const n = Number(body.weight);
    out.weight = Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (creating || body.type !== undefined) {
    out.type = GRADE_TYPES.includes(body.type) ? body.type : "other";
  }
  if (body.date !== undefined) out.date = str(body.date, 10);
  if (body.note !== undefined) out.note = str(body.note, 500);
  return out;
}

export const grades = makeCrud("grades", {
  prefix: "g_",
  sanitize: sanGrade,
  sort: (items) => [...items].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
});

/* ---------------- 笔记 ---------------- */
function sanNote(body = {}, old) {
  const out = {};
  const creating = !old;

  if (creating || body.title !== undefined) {
    const title = str(body.title, 120);
    if (creating && !title && !str(body.content, 1)) return null;
    out.title = title || "无标题";
  }
  if (creating || body.content !== undefined) out.content = String(body.content ?? "").slice(0, 200000);
  if (body.subjectId !== undefined) out.subjectId = body.subjectId || null;
  return out;
}

export const notes = makeCrud("notes", {
  prefix: "n_",
  sanitize: sanNote,
  sort: (items) => [...items].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
});

/* ---------------- 外链 ---------------- */
function sanLink(body = {}, old) {
  const out = {};
  const creating = !old;

  if (creating || body.name !== undefined) {
    const name = str(body.name, 20);
    if (!name) return null;
    out.name = name;
  }
  if (creating || body.url !== undefined) {
    let url = str(body.url, 500);
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!/^https?:\/\/[^\s.]+/i.test(url)) return null;
    out.url = url;
  }
  if (body.icon !== undefined) out.icon = str(body.icon, 4) || null;
  if (body.order !== undefined) out.order = Number(body.order) || 0;
  return out;
}

export const links = makeCrud("links", {
  prefix: "l_",
  sanitize: sanLink,
  ordered: true,
  initial: () => [
    { id: "l_home", name: "官网", url: "https://www.sustech.edu.cn", order: 0, createdAt: "", updatedAt: "" },
    { id: "l_tis", name: "教务", url: "https://tis.sustech.edu.cn", order: 1, createdAt: "", updatedAt: "" },
    { id: "l_bb", name: "Blackboard", url: "https://bb.sustech.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1", order: 2, createdAt: "", updatedAt: "" },
    { id: "l_lib", name: "图书馆", url: "https://lib.sustech.edu.cn", order: 3, createdAt: "", updatedAt: "" },
    { id: "l_seat", name: "座位预约", url: "https://booking.lib.sustech.edu.cn/#/ic/home", order: 4, createdAt: "", updatedAt: "" },
    { id: "l_zxc", name: "中心预约", url: "https://booking.zxc.sustech.edu.cn/user/login", order: 5, createdAt: "", updatedAt: "" },
    { id: "l_sys", name: "常用系统", url: "https://www.sustech.edu.cn/zh/common-systems.html", order: 6, createdAt: "", updatedAt: "" },
    { id: "l_hall", name: "服务大厅", url: "https://ehall.sustech.edu.cn/new/index.html", order: 7, createdAt: "", updatedAt: "" },
    { id: "l_osa", name: "OSA", url: "https://classic.osa.sustech.edu.cn/index.php?g=School&m=College&a=index&pterm=96", order: 8, createdAt: "", updatedAt: "" },
  ],
  sort: (items) => [...items].sort((a, b) => (a.order || 0) - (b.order || 0)),
});
