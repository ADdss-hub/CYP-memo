/**
 * 路由模块类型声明
 * Type declarations for router module
 */

// Vue 单文件组件声明
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

// 本地视图组件声明
declare module '../views/SetupView.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}

declare module '../views/DesktopSettingsView.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
