/**
 * 统一产品壳 · 单一菜单数据源（VIEW-03）
 * 按业务独立入口（军械库《界面独立开发规范》页面级拆分）；禁止把多业务塞进单页分栏
 * 仅按 permissions 显隐；禁止「管理端/用户端」二分导航
 * 图标：Element Plus 线性图标（currentColor，跟主题）；禁止 functions/*.svg 白底占位复用
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { Component } from 'vue'
import {
  Notebook,
  DataAnalysis,
  FolderOpened,
  Files,
  Share,
  User,
  Odometer,
  Document,
  Setting,
  UserFilled,
  Monitor,
  Reading,
  Connection,
} from '@element-plus/icons-vue'
import { Permission } from '@cyp-memo/shared'

export interface AppMenuItem {
  path: string
  label: string
  /** Element Plus 图标组件 */
  icon: Component
  /** 需全部满足才显示；空 = 仅需登录 */
  permissions?: Permission[]
}

export interface AppMenuSection {
  id: string
  title: string
  items: AppMenuItem[]
}

/** 桌面端专有项（仅 DesktopSidebar 追加） */
export const DESKTOP_SETTINGS_ITEM: AppMenuItem = {
  path: '/desktop-settings',
  label: '桌面客户端设置',
  icon: Monitor,
}

/** 全站侧栏权威清单 */
export const APP_MENU_SECTIONS: readonly AppMenuSection[] = [
  {
    id: 'main',
    title: '主要功能',
    items: [
      { path: '/memos', label: '备忘录', icon: Notebook, permissions: [Permission.MEMO_MANAGE] },
      {
        path: '/statistics',
        label: '数据统计',
        icon: DataAnalysis,
        permissions: [Permission.STATISTICS_VIEW],
      },
    ],
  },
  {
    id: 'manage',
    title: '管理',
    items: [
      {
        path: '/attachments',
        label: '文件库',
        icon: FolderOpened,
        permissions: [Permission.ATTACHMENT_MANAGE],
      },
      {
        path: '/memo-data',
        label: '备忘录数据',
        icon: Files,
        permissions: [Permission.MEMO_DATA],
      },
      { path: '/shares', label: '分享管理', icon: Share, permissions: [Permission.SHARE_MANAGE] },
      {
        path: '/accounts',
        label: '子用户管理',
        icon: User,
        permissions: [Permission.ACCOUNT_MANAGE],
      },
    ],
  },
  {
    id: 'ops',
    title: '运维',
    items: [
      {
        path: '/tenant',
        label: '运维概览',
        icon: Odometer,
        permissions: [Permission.TENANT_DASHBOARD],
      },
      {
        path: '/tenant/logs',
        label: '运行日志',
        icon: Document,
        permissions: [Permission.TENANT_LOGS],
      },
      {
        path: '/tenant/open-portal',
        label: '开放门户',
        icon: Connection,
        permissions: [Permission.TENANT_MONITOR],
      },
    ],
  },
  {
    id: 'system',
    title: '系统',
    items: [
      {
        path: '/settings',
        label: '系统设置',
        icon: Setting,
        permissions: [Permission.SETTINGS_MANAGE],
      },
    ],
  },
  {
    id: 'help',
    title: '帮助中心',
    items: [
      {
        path: '/help/knowledge',
        label: '知识',
        icon: Reading,
      },
      {
        path: '/help/mcp',
        label: 'MCP',
        icon: Connection,
      },
    ],
  },
  {
    id: 'self',
    title: '个人',
    items: [
      {
        path: '/profile',
        label: '个人资料',
        icon: UserFilled,
        permissions: [Permission.PROFILE_SELF],
      },
    ],
  },
]

export function filterMenuByPermissions(
  sections: readonly AppMenuSection[],
  userPermissions: readonly string[]
): AppMenuSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.permissions || item.permissions.length === 0) return true
        return item.permissions.every((p) => userPermissions.includes(p))
      }),
    }))
    .filter((section) => section.items.length > 0)
}
