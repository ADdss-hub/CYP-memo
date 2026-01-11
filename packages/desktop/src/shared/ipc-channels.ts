/**
 * IPC 通道常量定义
 * IPC channel constants for main-renderer communication
 */

export const IPC_CHANNELS = {
  // 窗口操作
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_TOGGLE: 'window:toggle',

  // 快捷键
  SHORTCUT_REGISTER: 'shortcut:register',
  SHORTCUT_UNREGISTER: 'shortcut:unregister',
  SHORTCUT_GET_CONFIG: 'shortcut:getConfig',
  SHORTCUT_UPDATE_CONFIG: 'shortcut:updateConfig',

  // 缓存
  CACHE_GET_MEMO: 'cache:getMemo',
  CACHE_GET_ALL_MEMOS: 'cache:getAllMemos',
  CACHE_SET_MEMO: 'cache:setMemo',
  CACHE_DELETE_MEMO: 'cache:deleteMemo',
  CACHE_CLEAR: 'cache:clear',

  // 同步
  SYNC_STATUS: 'sync:status',
  SYNC_START: 'sync:start',
  SYNC_RESOLVE_CONFLICT: 'sync:resolveConflict',
  SYNC_ADD_OPERATION: 'sync:addOperation',
  SYNC_GET_PENDING: 'sync:getPending',

  // 网络状态
  NETWORK_STATUS: 'network:status',
  NETWORK_CHECK: 'network:check',

  // 启动加载
  STARTUP_LOAD: 'startup:load',
  STARTUP_MANUAL_SYNC: 'startup:manualSync',
  STARTUP_STATE: 'startup:state',

  // 启动事件（从主进程发送到渲染进程）
  STARTUP_CACHE_LOADED: 'startup:cache-loaded',
  STARTUP_SYNC_COMPLETE: 'startup:sync-complete',
  STARTUP_SYNC_CONFLICTS: 'startup:sync-conflicts',

  // 凭证
  CREDENTIAL_SET: 'credential:set',
  CREDENTIAL_GET: 'credential:get',
  CREDENTIAL_DELETE: 'credential:delete',

  // 更新
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',

  // 更新事件（从主进程发送到渲染进程）
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',

  // 通知
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_SET_PREFS: 'notification:setPrefs',
  NOTIFICATION_GET_PREFS: 'notification:getPrefs',

  // 服务器
  SERVER_START: 'server:start',
  SERVER_STOP: 'server:stop',
  SERVER_STATUS: 'server:status',

  // 服务器连接配置
  SERVER_CONFIG_GET: 'server:config:get',
  SERVER_CONFIG_SET: 'server:config:set',
  SERVER_CONFIG_IS_FIRST_LAUNCH: 'server:config:isFirstLaunch',
  SERVER_CONFIG_COMPLETE_SETUP: 'server:config:completeSetup',
  SERVER_VALIDATE_URL: 'server:validateUrl',
  SERVER_TEST_CONNECTION: 'server:testConnection',
  SERVER_SWITCH_MODE: 'server:switchMode',

  // 托盘
  TRAY_SET_TOOLTIP: 'tray:setTooltip',
  TRAY_SHOW_BALLOON: 'tray:showBalloon',

  // 导航事件（从主进程发送到渲染进程）
  NAVIGATE: 'navigate',

  // 平台相关
  PLATFORM_GET: 'platform:get',
  PLATFORM_GET_FEATURES: 'platform:getFeatures',
  PLATFORM_SET_PROGRESS: 'platform:setProgress',
  PLATFORM_CLEAR_PROGRESS: 'platform:clearProgress',
  PLATFORM_SET_BADGE: 'platform:setBadge',
  PLATFORM_CLEAR_BADGE: 'platform:clearBadge',

  // 拖放相关
  DRAG_DROP_PROCESS: 'drag-drop:process-files',
  DRAG_DROP_VALIDATE: 'drag-drop:validate-files',
  DRAG_DROP_START: 'drag-drop:start-drag',
} as const

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
