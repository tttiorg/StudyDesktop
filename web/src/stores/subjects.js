import { defineStore } from "pinia";
import { api } from "@/api";

export const useSubjectStore = defineStore("subjects", {
  state: () => ({
    items: [],
    loading: false,
    loaded: false,
  }),

  getters: {
    byId: (state) => (id) => state.items.find((s) => s.id === id) || null,
  },

  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.items;
      this.loading = true;
      try {
        const data = await api.subjects.list();
        this.items = data.items || [];
        this.loaded = true;
        return this.items;
      } finally {
        this.loading = false;
      }
    },

    async create(payload) {
      const item = await api.subjects.create(payload);
      this.items.push(item);
      return item;
    },

    async update(id, payload) {
      const item = await api.subjects.update(id, payload);
      const idx = this.items.findIndex((s) => s.id === id);
      if (idx >= 0) this.items[idx] = item;
      return item;
    },

    async reorder(ids) {
      const data = await api.subjects.reorder(ids);
      this.items = data.items;
      return this.items;
    },

    async remove(id) {
      await api.subjects.remove(id);
      this.items = this.items.filter((s) => s.id !== id);
    },
  },
});
