import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "home",
    component: () => import("@/views/Home.vue"),
    meta: { title: "主页" },
  },
  {
    path: "/timetable",
    name: "timetable",
    component: () => import("@/views/TimetableView.vue"),
    meta: { title: "课表" },
  },
  {
    path: "/subjects/:id",
    name: "subject",
    component: () => import("@/views/SubjectView.vue"),
    props: true,
    meta: { title: "学科" },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "notfound",
    component: () => import("@/views/NotFound.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  document.title = to.meta?.title ? `${to.meta.title} · 学习桌面` : "学习桌面";
});

export default router;
