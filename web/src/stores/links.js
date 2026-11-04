import { defineStore } from "pinia";
import { api } from "@/api";

export const useLinkStore = defineStore("links", {
  state: () => ({
    items: [],
    loaded: false,
  }),

  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.items;
      const data = await api.links.list();
      this.items = data.items || [];
      this.loaded = true;
      return this.items;
    },

    async create(payload) {
      const data = await api.links.create(payload);
      this.items = data.items;
      return data.item;
    },

    async update(id, patch) {
      const data = await api.links.update(id, patch);
      this.items = data.items;
    },

    async remove(id) {
      const data = await api.links.remove(id);
      this.items = data.items;
    },

    /** 拖动排序：按下标顺序整体提交 */
    async reorder(ids) {
      const data = await api.links.reorder(ids);
      this.items = data.items;
    },
  },
});
