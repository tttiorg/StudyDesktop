import { defineStore } from "pinia";
import { api } from "@/api";

const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const useScheduleStore = defineStore("schedules", {
  state: () => ({
    items: [],
    loaded: false,
    loading: false,
  }),

  getters: {
    open: (s) => s.items.filter((i) => !i.done),
    done: (s) => s.items.filter((i) => i.done),

    today() {
      const t = todayStr();
      return this.items.filter((i) => i.due === t);
    },

    /** 今天及以后、未完成的，按日期分组 */
    grouped() {
      const t = todayStr();
      const map = new Map();
      for (const i of this.items) {
        if (i.done || i.due < t) continue;
        if (!map.has(i.due)) map.set(i.due, []);
        map.get(i.due).push(i);
      }
      return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, list]) => ({ date, list }));
    },

    overdue() {
      const t = todayStr();
      return this.items.filter((i) => !i.done && i.due < t);
    },
  },

  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.items;
      this.loading = true;
      try {
        const data = await api.schedules.list();
        this.items = data.items || [];
        this.loaded = true;
        return this.items;
      } finally {
        this.loading = false;
      }
    },

    async create(payload) {
      const data = await api.schedules.create(payload);
      this.items = data.items;
      return data.item;
    },

    async update(id, patch) {
      const data = await api.schedules.update(id, patch);
      this.items = data.items;
      return data.item;
    },

    async remove(id) {
      const data = await api.schedules.remove(id);
      this.items = data.items;
    },

    async toggle(item) {
      return this.update(item.id, { done: !item.done });
    },
  },
});
