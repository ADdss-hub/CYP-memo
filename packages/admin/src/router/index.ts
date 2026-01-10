/**
 * CYP-memo 管理员端路由配置
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { useAdminAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/AdminLoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('../views/UsersView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/database',
      name: 'database',
      component: () => import('../views/DatabaseView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/monitor',
      name: 'monitor',
      component: () => import('../views/MonitorView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresAuth: false },
    },
  ],
})

/**
 * 全局前置守卫 - 认证检查
 */
router.beforeEach(
  async (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
    const adminAuthStore = useAdminAuthStore()

    // 如果路由需要认证
    if (to.meta.requiresAuth) {
      // 如果未认证，尝试自动登录
      if (!adminAuthStore.isAuthenticated) {
        const user = await adminAuthStore.autoLogin()

        // 自动登录失败，重定向到登录页
        if (!user) {
          next({
            path: '/login',
            query: { redirect: to.fullPath },
          })
          return
        }
      }

      // 已认证，允许访问
      next()
    } else {
      // 不需要认证的路由，直接访问
      // 但如果已登录且访问登录页，重定向到控制台
      if (to.path === '/login' && adminAuthStore.isAuthenticated) {
        next('/dashboard')
        return
      }

      next()
    }
  }
)

export default router
