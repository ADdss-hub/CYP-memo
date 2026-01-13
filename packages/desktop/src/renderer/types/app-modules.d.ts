/**
 * 类型声明文件 - 用于解决跨包引用的类型问题
 * Type declarations for cross-package imports
 */

// ============ @app-stores 模块声明 ============

declare module '@app-stores/auth' {
  import { defineStore } from 'pinia'
  import type { User, Permission } from '@cyp-memo/shared'
  
  export const useAuthStore: ReturnType<typeof defineStore<'auth', {
    currentUser: User | null
    isLoading: boolean
    error: string | null
    isAuthenticated: boolean
    username: string
    userId: string
    isMainAccount: boolean
    permissions: Permission[]
    loginWithPassword: (username: string, password: string, remember?: boolean) => Promise<User>
    loginWithToken: (token: string) => Promise<User>
    registerWithPassword: (username: string, password: string, securityQuestion: { question: string; answerHash: string }) => Promise<User>
    registerWithToken: () => Promise<{ user: User; token: string }>
    logout: () => Promise<void>
    autoLogin: () => Promise<User | null>
    resetPassword: (username: string, securityAnswer: string, newPassword: string) => Promise<void>
    clearError: () => void
    validateSession: () => Promise<{ valid: boolean; reason?: string }>
    forceLogout: () => void
  }>>
}

declare module '@app-stores/settings' {
  import { defineStore } from 'pinia'
  import type { AppSettings } from '@cyp-memo/shared'
  
  export const useSettingsStore: ReturnType<typeof defineStore<'settings', {
    settings: AppSettings
    isLoading: boolean
    error: string | null
    isFirstTime: boolean
    welcomeCompleted: boolean
    autoCleanLogs: boolean
    logRetentionHours: number
    loadSettings: () => Promise<void>
    saveSettings: () => Promise<void>
    updateSettings: (updates: Partial<AppSettings>) => Promise<void>
    setFirstTime: (value: boolean) => Promise<void>
    setWelcomeCompleted: (value: boolean) => Promise<void>
    setTheme: (theme: 'light' | 'dark') => Promise<void>
    setFontSize: (fontSize: 'small' | 'medium' | 'large') => Promise<void>
    setLanguage: (language: string) => Promise<void>
    setAutoCleanLogs: (value: boolean) => Promise<void>
    setLogRetentionHours: (hours: number) => Promise<void>
    resetToDefaults: () => Promise<void>
    clearSettings: () => Promise<void>
    exportSettings: () => string
    importSettings: (jsonString: string) => Promise<void>
    clearError: () => void
  }>>
}

declare module '@app-stores/memo' {
  export const useMemoStore: any
}

declare module '@app-stores/ui' {
  export const useUIStore: any
}

// ============ @app-components 模块声明 ============

declare module '@app-components/AppLayout.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-components/AppFooter.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-components/AppSidebar.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-components/MobileBottomNav.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-components/TermsDialog.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-components/SessionExpiredDialog.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<{
    visible: boolean
    message: string
    type: 'expired' | 'restricted' | 'warning'
    title: string
    hint: string
  }, object, any>
  export default component
}

// ============ @app-views 模块声明 ============

declare module '@app-views/auth/LoginView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/auth/RegisterView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/auth/ResetPasswordView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/auth/RecoverAccountView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/auth/ResetPasswordNewView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/WelcomeView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/memo/MemoListView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/memo/MemoEditView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/memo/MemoDetailView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/StatisticsView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/AttachmentsView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/share/ShareManageView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/share/ShareView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/MemoDataView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/AccountsView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/SettingsView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/ProfileView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '@app-views/NotFoundView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

// ============ 本地视图模块声明 ============

declare module '../views/SetupView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '../views/DesktopSettingsView.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
