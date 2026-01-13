/**
 * 本地视图组件类型声明
 * Type declarations for local view components
 */

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
