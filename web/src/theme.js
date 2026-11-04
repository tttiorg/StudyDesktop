/**
 * 主题：深色 / 浅色 / 跟随系统
 * 通过在 <html> 上挂 .dark / .light 类切换，CSS 变量见 styles/theme.css。
 */
import { computed, ref, watch } from "vue";

const KEY = "sde.theme";
const MODES = ["auto", "light", "dark"];

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return MODES.includes(v) ? v : "dark";
  } catch {
    return "dark";
  }
}

const mode = ref(stored());

const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: light)") : null;
const systemLight = ref(mq ? mq.matches : false);
if (mq) {
  const onChange = (e) => (systemLight.value = e.matches);
  mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
}

export const isDark = computed(
  () => mode.value === "dark" || (mode.value === "auto" && !systemLight.value)
);

export const themeMode = mode;

/** 立刻把主题写到 <html> 上 */
export function applyTheme() {
  const el = document.documentElement;
  el.classList.toggle("dark", isDark.value);
  el.classList.toggle("light", !isDark.value);
  el.style.colorScheme = isDark.value ? "dark" : "light";
}

export function setTheme(m) {
  if (!MODES.includes(m)) return;
  mode.value = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {}
}

export function toggleTheme() {
  setTheme(isDark.value ? "light" : "dark");
}

watch([mode, systemLight], applyTheme, { immediate: true });
