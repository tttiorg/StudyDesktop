# 学习桌面 · 标准导入文件说明

这份文档是给 **AI** 和 **新用户** 一起看的：AI 读完就知道该问用户要什么、怎么填；
用户读完就知道这些信息能从哪儿弄到。

配套文件：

| 文件 | 用途 |
| --- | --- |
| `study-desktop.template.json` | 空白模板，复制一份填即可 |
| 应用内「设置 → 导入」 | 选文件 → 合并 / 覆盖 → 导入 |

导入接口（给 AI 或脚本用）：

```
POST http://127.0.0.1:3001/api/import
Content-Type: application/json

{ "mode": "merge", "data": { ...下面这份标准 JSON... } }
```

`mode` 有两种：

- `merge`（默认）：只补不改。学科按 **名称** 去重，已存在就跳过；日程按「标题 + 日期」去重，成绩按「名称 + 学科」去重。
- `replace`：先清空学科 / 日程 / 成绩 / 笔记 / 知识点 / 外链 / 资料，再写入。数据每次写入前会自动在 `数据目录/backups/` 留快照，写坏了可以回退。

---

## 一、整体结构

```jsonc
{
  "version": 1,
  "meta":      { ... },   // 称呼、学期、开学日期
  "subjects":  [ ... ],   // 学科（其它数据都靠学科名引用它）
  "timetable": { ... },   // 课表：时间块 + 上课时段
  "schedules": [ ... ],   // 日程 / 作业 / 考试
  "grades":    [ ... ],   // 成绩
  "notes":     [ ... ],   // 笔记
  "knowledge": [ ... ],   // 待解决知识点（自动进入艾宾浩斯复习队列）
  "links":     [ ... ],   // 右侧快捷外链
  "files":     [ ... ]    // 本地资料：文件路径或整个文件夹
}
```

**除了 `version`，所有字段都可以省略。** 缺什么就不写什么，导入时会跳过，不会报错。

---

## 二、各字段详解

### meta —— 个人信息

| 字段 | 类型 | 说明 | 从哪儿来 |
| --- | --- | --- | --- |
| `student` | string | 称呼，显示在首页欢迎语 | 问用户 |
| `semester` | string | 学期，如 `2026 秋季` | 教务系统首页 / 问用户 |
| `startDate` | `YYYY-MM-DD` | 开学第一天，用来算「已开学第几周」 | 校历 |

### subjects[] —— 学科

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string **必填** | 学科简称，如 `高数`、`线代`。其它地方都用这个名字引用它 |
| `color` | `#rrggbb` | 学科色，不填自动分配 |
| `note` | string | 备注：考核比例、教材、老师要求 |
| `course` | object | `fullName` 课程全名、`teacher` 教师、`room` 教室、`weeks` 周次、`classCode` 课程号、`homepage` 课程主页 |
| `faculty` | object | `name`、`title` 职称、`dept` 院系、`avatar` 头像 URL、`url` 主页、`email`、`phone` |
| `bbUrl` | string | Blackboard 课程页地址 |

> 教师信息可以不给——学科页会拿 `course.teacher` 去学校官网搜，搜到后自动填头像和院系。

### timetable —— 课表

```jsonc
"timetable": {
  "blocks": [ { "index": 1, "label": "第1-2节", "time": "08:00-09:50" } ],
  "slots":  [ { "day": 1, "block": 1, "name": "高等数学", "subject": "高数",
                "room": "一教407", "teacher": "张三", "weeks": "1-16周" } ]
}
```

- `day`：**1–7**，周一到周日
- `block`：第几大节，从 **1** 开始（默认一大节 = 两小节）
- `subject`：对应 `subjects[].name`，对不上就留空，只当作课表格子里的文字
- `blocks` 不填就用默认的 5 大节（08:00 / 10:20 / 14:00 / 16:20 / 19:00）

### schedules[] —— 日程 / 作业 / 考试

| 字段 | 说明 |
| --- | --- |
| `title` **必填** | 标题 |
| `due` **必填** | 截止日期 `YYYY-MM-DD` |
| `time` | `HH:mm`，选填 |
| `type` | `task` 待办 / `assignment` 作业 / `exam` 考试 / `project` 项目 / `activity` 活动 |
| `subject` | 学科名，选填 |
| `place` | 地点 |
| `note` | 备注 |
| `done` | 是否已完成，默认 `false` |

### grades[] —— 成绩

`name`（必填）、`subject`、`score`、`full`（满分，默认 100）、`weight`（占比 %，选填）、
`type`（`homework` / `quiz` / `exam` / `project` / `other`）、`date`、`note`

### notes[] —— 笔记

`title`、`content`（纯文本，支持换行）、`subject`

### knowledge[] —— 待解决知识点

`title`（必填）、`note`、`subject`。
导入后自动按艾宾浩斯曲线排期：第 1、2、4、7、15、30、60 天提醒复习。

### links[] —— 右侧外链

`name`（必填，≤10 字）、`url`。顺序即数组顺序。

### files[] —— 本地资料

```jsonc
[ { "path": "D:\\学习资料\\高数\\第三章.pdf", "subject": "高数" },
  { "path": "D:\\学习资料\\高数", "folder": true, "subject": "高数" } ]
```

- **只做链接，不复制文件**，磁盘上原来的文件不会被改动
- `folder: true` 表示映射整个文件夹，**包含子文件夹**；之后在资源管理器里增删文件，应用里会自动同步
- 路径不存在会被跳过，不影响其它数据导入
- 路径要写绝对路径，Windows 里反斜杠在 JSON 中要写成 `\\`

---

## 三、让 AI 帮你填：复制这段话

> 我在用「学习桌面」这个本地应用。请把我下面的信息整理成它要求的 JSON 格式，**只输出 JSON 本身**，不要解释。
>
> 格式规范见 `README.md`，模板见 `study-desktop.template.json`。
>
> 规则：
> 1. 顶层字段：`meta` / `subjects` / `timetable` / `schedules` / `grades` / `notes` / `knowledge` / `links` / `files`。
> 2. 学科用 `name` 作为唯一标识，其它数据用 `subject` 字段引用学科名。
> 3. 日期一律 `YYYY-MM-DD`，时间 `HH:mm`；课表 `day` 是 1–7，`block` 从 1 开始。
> 4. 拿不准或没有的信息直接省略该字段，**不要编造**。
> 5. 路径里有反斜杠要转义成 `\\`。
>
> 我的信息如下：
> （课程表截图 / 成绩 / 待办 / 资料文件夹路径 ……）

---

## 四、新用户至少要准备什么

按重要性排序，前四项填完，应用就基本能用了：

1. **学科名单** —— 这学期上哪几门课（`subjects[].name`）
2. **课表** —— 每门课周几、第几大节、在哪间教室（`timetable.slots`）
   - 从哪儿弄：教务系统（如 SUSTech 的 TIS）→ 我的课表 → 截图或导出
3. **开学日期** —— 校历上第一周的周一（`meta.startDate`）
4. **近期 DDL** —— 作业、测验、考试（`schedules`）
   - 从哪儿弄：Blackboard 的 Calendar / 课程群通知 / 教学大纲
5. **本地资料文件夹** —— 每门课的讲义、真题放在哪个目录（`files`）
6. **成绩构成** —— 平时分、期中、期末各占多少（可写进 `subjects[].note` 或 `grades`）
7. **常用链接** —— Blackboard、教务、图书馆、座位预约（`links`）

---

## 五、常见坑

- **学科名对不上**：其它数据里的 `subject` 必须和 `subjects[].name` 一个字不差，否则关联不上（数据仍会导入，只是挂不到学科页）。
- **日期写错格式**：`2026/9/1` 会被丢弃，要写 `2026-09-01`。
- **路径不存在**：会被静默跳过。导入后可在学科页「资料」里看是否都进来了。
- **覆盖模式**：`replace` 会清空已有数据，只在确认要「换一套」时用。
