/**
 * 启动转场控制器
 * ------------------------------------------------------------
 * 为什么不用纯 CSS 动画 + class 切换：
 *   转场结束后要移除节点，而「移除 -> 重新插入」才能让动画从头播
 *   （CSS animation 跑完后再加 class 不会重播）。所以这里用 JS 管时序，
 *   由 Vue 渲染结构、CSS 负责每帧的样子。
 *
 * 播放策略：
 *   sessionStorage 存一次标记，一次启动只播一次。
 *   刷新/切页面都不重播，否则每次回主页都等三秒会疯。
 *
 * 为什么进度数字要读进度条的真实宽度：
 *   之前 CSS 用缓动曲线控宽度、JS 用固定时长估百分比，两套算法必然漂移，
 *   实测最大偏差 16.6%（数字写 72%，条子只到 69%）。
 *   现在数字读 getBoundingClientRect，以条子为唯一真源，偏差降到取整误差。
 */

import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from "vue";

const WORD = ["学", "习", "桌", "面"];

/** 状态文案，at 是相对转场开始的秒数 */
const STEPS = [
  { at: 0.0, text: "正在唤醒学习空间" },
  { at: 0.85, text: "装载课程与课表" },
  { at: 1.35, text: "同步笔记与知识点" },
  { at: 1.72, text: "准备就绪" },
];

const STORAGE_KEY = "sde.booted";

export function useBoot() {
  /** 转场层是否还在 DOM 里 */
  const active = ref(false);
  /** 页面是否已亮起（控制外壳可见） */
  const booted = ref(false);
  /**
   * 入场动画是否在跑。
   * 约 1.35s 后摘掉 —— 摘掉后 .is-entering 的整套 animation 规则消失，
   * 元素回到「没有任何动画」的最终态。之后用户再增删课程/日程/学科，
   * 新元素不会先被 opacity: 0 锁住再按 delay 干等。
   */
  const entering = ref(false);

  /** 给模板用的可见状态 */
  const view = reactive({
    wordReady: false,
    opening: false,
    done: false,
    pct: 0,
    status: STEPS[0].text,
    statusSwapping: false,
  });

  let finished = false;
  let rafId = 0;
  let timers = [];
  let wordTimers = [];
  let keyHandler = null;

  const clearAll = () => {
    timers.forEach(clearTimeout);
    timers = [];
    wordTimers.forEach(clearTimeout);
    wordTimers = [];
    cancelAnimationFrame(rafId);
    rafId = 0;
    if (keyHandler) {
      window.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }
  };

  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  };

  /**
   * 进度百分比：直接读进度条的真实像素宽度换算。
   * @param {HTMLElement} fillEl 进度条填充元素
   * @param {Function} onFull 走满时回调一次（用来触发劈开）
   */
  function trackPercent(fillEl, onFull) {
    const track = fillEl.parentElement;
    if (!track) return;

    // 轨道宽度是满屏固定值，测一次即可，不必每帧读
    const total = track.getBoundingClientRect().width;
    let full = false;

    const tick = () => {
      if (finished) return;

      const w = fillEl.getBoundingClientRect().width;
      const pct = total > 0 ? Math.min(100, Math.round((w / total) * 100)) : 0;
      view.pct = pct;

      if (pct >= 100 && !full) {
        full = true;
        if (onFull) onFull();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  /** 按时间点切换状态文案，切换时做一次淡出淡入 */
  function scheduleStatus() {
    STEPS.forEach((step) => {
      if (step.at === 0) return;
      later(() => {
        if (finished) return;
        view.statusSwapping = true;
        later(() => {
          view.status = step.text;
          view.statusSwapping = false;
        }, 150);
      }, step.at * 1000);
    });
  }

  /** 收尾：劈开 -> 亮出页面 -> 拆掉转场层 */
  function finish(skipped) {
    if (finished) return;
    finished = true;

    timers.forEach(clearTimeout);
    timers = [];
    wordTimers.forEach(clearTimeout);
    wordTimers = [];
    cancelAnimationFrame(rafId);

    // 跳过时把进度直接补满，避免视觉上突然断掉
    if (skipped) {
      view.pct = 100;
      view.status = "准备就绪";
    }

    view.opening = true;

    // 挡板是 0.72s 的位移。页面必须在挡板推开「足够多」之后才亮，
    // 太早会在缝隙里露出半张脸（实测 300ms 时挡板才走 51px，页面就透了）。
    // 等 460ms（约走完 60%），此时中间已开出大半屏。
    const revealAt = skipped ? 200 : 460;
    setTimeout(() => {
      booted.value = true;
      entering.value = true;
      // 入场整套在 0.835s + 0.46s = 1.295s 内跑完，留点余量到 1.35s。
      // 摘掉后所有元素彻底脱离 animation，回归纯静态。
      setTimeout(() => {
        entering.value = false;
      }, 1350);
    }, revealAt);

    // 挡板走完后整层淡出。压到 760ms = 挡板刚好走完就接淡出，不留空窗
    // （原来排到 1080ms，实测中间有约 0.5s 只有两块黑板在空转）。
    const fadeAt = skipped ? 700 : 760;
    setTimeout(() => {
      view.done = true;
      setTimeout(() => {
        active.value = false;
      }, 460);
    }, fadeAt);

    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      /* 隐私模式下会抛，忽略 */
    }
  }

  /** 点击 / Esc / 空格 跳过 */
  function bindSkip() {
    if (keyHandler) window.removeEventListener("keydown", keyHandler);
    keyHandler = (e) => {
      if (finished) return;
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        finish(true);
      }
    };
    window.addEventListener("keydown", keyHandler, { once: false });
  }

  /** 真正开跑 */
  async function run() {
    // 重置所有运行时状态。少了任何一个，第二次启动都会失效：
    // finished 为 true 会让新转场直接躺平，rAF 会一直画旧节点。
    finished = false;
    clearAll();
    view.wordReady = false;
    view.opening = false;
    view.done = false;
    view.pct = 0;
    view.status = STEPS[0].text;
    view.statusSwapping = false;

    // 品牌字逐字出现：每个字靠 CSS 的 data-i 决定 animation-delay
    view.wordReady = true;

    await nextTick();

    // 兜底：无论下面发生什么，这个定时器都要把页面亮出来。
    // 之前这里在拿不到 .boot-bar-fill 时直接 return，finish() 永远不调用，
    // 而 .app:not(.is-booted) 把所有板块设成了 opacity: 0 —— 结果就是
    // 整页永久空白。一个 DOM 结构没对上就黑屏，代价太大了。
    later(() => finish(false), 2600);

    const fillEl = document.querySelector(".boot-bar-fill");
    if (fillEl) {
      scheduleStatus();
      // 走满的那一刻才劈开，保证「100%」和劈开是同一瞬间。
      // 标签页在后台时 rAF 会被节流甚至暂停，onFull 可能永远不触发，
      // 所以上面那个 2600ms 定时器先到就先劈（finish 内部有锁）。
      trackPercent(fillEl, () => finish(false));
    } else {
      // 结构对不上就缩短等待，别让用户干瞪眼
      later(() => finish(false), 900);
    }

    bindSkip();
  }

  /** 手动重播（调试用，主应用里不暴露入口） */
  async function replay() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    booted.value = false;
    entering.value = false;
    active.value = true;
    await nextTick();
    run();
  }

  onMounted(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      seen = false;
    }

    if (seen) {
      // 本次会话已经看过：直接亮界面，不挂转场，也不播入场动画
      active.value = false;
      booted.value = true;
      entering.value = false;
      return;
    }

    active.value = true;
    run();
  });

  onBeforeUnmount(clearAll);

  return { active, booted, entering, view, replay, finish: () => finish(true) };
}
