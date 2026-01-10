/**
 * CYP-memo 用户端路由配置
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { Permission } from '@cyp-memo/shared'

/**
 * 扩展 Vue Router 的 RouteMeta 类型
 */
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresGuest?: boolean
    requiredPermissions?: Permission[]
    title?: string
  }
}

/**
 * 路由配置
 */
const routes: RouteRecordRaw[] = [
  // 认证相关路由
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: {
      requiresGuest: true,
      title: '登录',
    },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/auth/RegisterView.vue'),
    meta: {
      requiresGuest: true,
      title: '注册',
    },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('../views/auth/ResetPasswordView.vue'),
    meta: {
      requiresGuest: true,
      title: '找回账号和密码',
    },
  },
  {
    path: '/recover-account',
    name: 'recover-account',
    component: () => import('../views/auth/RecoverAccountView.vue'),
    meta: {
      requiresGuest: true,
      title: '找回账号',
    },
  },
  {
    path: '/reset-password-new',
    name: 'reset-password-new',
    component: () => import('../views/auth/ResetPasswordNewView.vue'),
    meta: {
      requiresGuest: true,
      title: '重置密码',
    },
  },

  // 欢迎引导
  {
    path: '/welcome',
    name: 'welcome',
    component: () => import('../views/WelcomeView.vue'),
    meta: {
      requiresAuth: true,
      title: '欢迎使用',
    },
  },

  // 主应用路由
  {
    path: '/',
    name: 'home',
    redirect: '/memos',
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: '/memos',
    name: 'memos',
    component: () => import('../views/memo/MemoListView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.MEMO_MANAGE],
      title: '备忘录',
    },
  },
  {
    path: '/memos/new',
    name: 'memo-new',
    component: () => import('../views/memo/MemoEditView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.MEMO_MANAGE],
      title: '新建备忘录',
    },
  },
  {
    path: '/memos/:id',
    name: 'memo-detail',
    component: () => import('../views/memo/MemoDetailView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.MEMO_MANAGE],
      title: '备忘录详情',
    },
  },
  {
    path: '/memos/:id/edit',
    name: 'memo-edit',
    component: () => import('../views/memo/MemoEditView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.MEMO_MANAGE],
      title: '编辑备忘录',
    },
  },

  // 统计
  {
    path: '/statistics',
    name: 'statistics',
    component: () => import('../views/StatisticsView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.STATISTICS_VIEW],
      title: '数据统计',
    },
  },

  // 附件管理
  {
    path: '/attachments',
    name: 'attachments',
    component: () => import('../views/AttachmentsView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.ATTACHMENT_MANAGE],
      title: '附件管理',
    },
  },

  // 分享管理
  {
    path: '/shares',
    name: 'shares',
    component: () => import('../views/share/ShareManageView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.MEMO_MANAGE],
      title: '分享管理',
    },
  },
  {
    path: '/share/:id',
    name: 'share-view',
    component: () => import('../views/share/ShareView.vue'),
    meta: {
      title: '查看分享',
    },
  },

  // 备忘录数据管理
  {
    path: '/memo-data',
    name: 'memo-data',
    component: () => import('../views/MemoDataView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.MEMO_MANAGE],
      title: '备忘录数据管理',
    },
  },

  // 账号管理
  {
    path: '/accounts',
    name: 'accounts',
    component: () => import('../views/AccountsView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.ACCOUNT_MANAGE],
      title: '账号管理',
    },
  },

  // 系统设置
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: {
      requiresAuth: true,
      requiredPermissions: [Permission.SETTINGS_MANAGE],
      title: '系统设置',
    },
  },

  // 个人资料
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: {
      requiresAuth: true,
      title: '个人资料',
    },
  },

  // 404 页面
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: {
      title: '页面未找到',
    },
  },
]

/**
 * 创建路由实例
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * 全局前置守卫 - 认证检查
 */
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const settingsStore = useSettingsStore()

  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - CYP-memo`
  } else {
    document.title = 'CYP-memo'
  }

  // 尝试自动登录（仅在首次访问且未认证时）
  // 避免在已登录或正在加载时重复调用
  if (!authStore.isAuthenticated && !authStore.isLoading && from.name === undefined) {
    await authStore.autoLogin()
  }

  // 检查是否需要认证
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // 未登录，重定向到登录页
    next({
      name: 'login',
      query: { redirect: to.fullPath },
    })
    return
  }

  // 检查是否需要访客身份（已登录用户不能访问）
  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    // 已登录，重定向到首页
    next({ name: 'home' })
    return
  }

  // 检查首次使用引导（仅在已认证且不是访问欢迎页面时）
  if (
    authStore.isAuthenticated &&
    to.name !== 'welcome' &&
    to.name !== 'login' &&
    to.name !== 'register' &&
    to.name !== 'reset-password' &&
    to.name !== 'share-view'
  ) {
    // 加载设置以获取最新的首次使用状态
    await settingsStore.loadSettings()
    
    if (settingsStore.isFirstTime && !settingsStore.welcomeCompleted) {
      // 首次使用且未完成引导，重定向到欢迎页
      next({ name: 'welcome' })
      return
    }
  }

  // 检查权限
  if (to.meta.requiredPermissions && to.meta.requiredPermissions.length > 0) {
    const hasPermission = to.meta.requiredPermissions.every((permission) =>
      authStore.permissions.includes(permission)
    )

    if (!hasPermission) {
      // 权限不足，重定向到首页或显示错误
      console.warn(`权限不足，无法访问 ${to.path}`)
      next({
        name: 'memos',
        query: { error: 'permission_denied' },
      })
      return
    }
  }

  // 所有检查通过，允许导航
  next()
})

/**
 * 全局后置钩子 - 滚动到顶部
 */
router.afterEach(() => {
  window.scrollTo(0, 0)
})

export default router
