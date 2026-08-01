import type { RouteRecordRaw } from 'vue-router'

import { createRouter, createWebHashHistory } from 'vue-router'

import Bubble from '../pages/bubble/index.vue'
import MailArchive from '../pages/mail-archive/index.vue'
import MailList from '../pages/mail-list/index.vue'
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
  {
    path: '/mail-list',
    component: MailList,
  },
  {
    path: '/mail-archive',
    component: MailArchive,
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
