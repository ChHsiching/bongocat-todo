import type { RouteRecordRaw } from 'vue-router'

import { createRouter, createWebHashHistory } from 'vue-router'

import Bubble from '../pages/bubble/index.vue'
import Main from '../pages/main/index.vue'
import Preference from '../pages/preference/index.vue'
import Todo from '../pages/todo/index.vue'

const routes: Readonly<RouteRecordRaw[]> = [
  {
    path: '/',
    component: Main,
  },
  {
    path: '/preference',
    component: Preference,
  },
  {
    path: '/todo',
    component: Todo,
  },
  {
    path: '/bubble',
    component: Bubble,
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
