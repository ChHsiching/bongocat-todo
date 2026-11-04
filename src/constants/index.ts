export const GITHUB_LINK = 'https://github.com/ayangweb/BongoCat'

export const UPGRADE_LINK_ACCESS_KEY = 'xDbrq2rOoRThDqKOHL2ZRA'

export const LISTEN_KEY = {
  SHOW_WINDOW: 'show-window',
  HIDE_WINDOW: 'hide-window',
  DEVICE_CHANGED: 'device-changed',
  UPDATE_APP: 'update-app',
  GAMEPAD_CHANGED: 'gamepad-changed',
  START_MOTION: 'start-motion',
  SET_EXPRESSION: 'set-expression',
  /** todo 窗口以主面板形态（380×560）打开，由「待办」菜单项触发。 */
  SHOW_TODO_FULL: 'show-todo-full',
  /** todo 窗口以迷你输入窗形态（280×110）打开，定位到光标附近，由「快速新建」菜单项触发。 */
  SHOW_TODO_MINI: 'show-todo-mini',
  /** 桌宠气泡窗口弹气泡，由「新邮件到达」事件触发（Phase 2 邮件通知）。 */
  SHOW_BUBBLE: 'show-bubble',
  /** 邮件列表窗口打开（贴猫正上方，由「邮件列表」菜单项触发）。 */
  SHOW_MAIL_LIST: 'show-mail-list',
  /** 归档邮件窗口打开（贴猫正上方，由「归档邮件」菜单项触发）。 */
  SHOW_MAIL_ARCHIVE: 'show-mail-archive',
}

export const INVOKE_KEY = {
  COPY_DIR: 'copy_dir',
  START_DEVICE_LISTENING: 'start_device_listening',
  START_GAMEPAD_LISTING: 'start_gamepad_listing',
  STOP_GAMEPAD_LISTING: 'stop_gamepad_listing',
}

export const LANGUAGE = {
  ZH_CN: 'zh-CN',
  ZH_TW: 'zh-TW',
  EN_US: 'en-US',
  VI_VN: 'vi-VN',
  PT_BR: 'pt-BR',
} as const

export const WINDOW_LABEL = {
  MAIN: 'main',
  PREFERENCE: 'preference',
  TODO: 'todo',
  /** 桌宠气泡通知窗口（贴桌宠正上方，Phase 2 邮件/todo 共用）。 */
  BUBBLE: 'bubble',
  /** 邮件列表窗口（本地通知历史，未读+已读，贴猫正上方伴随窗口）。 */
  MAIL_LIST: 'mail-list',
  /** 归档邮件窗口（已归档邮件列表，贴猫正上方伴随窗口）。 */
  MAIL_ARCHIVE: 'mail-archive',
} as const
