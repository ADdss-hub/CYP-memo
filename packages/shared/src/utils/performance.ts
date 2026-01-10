/**
 * CYP-memo 性能优化工具
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/**
 * 防抖函数
 * 在事件被触发 n 毫秒后再执行回调，如果在这 n 毫秒内又被触发，则重新计时
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 * @example
 * const debouncedSearch = debounce((query) => search(query), 300)
 * input.addEventListener('input', (e) => debouncedSearch(e.target.value))
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function (...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      func(...args)
      timeoutId = null
    }, wait)
  }
}

/**
 * 节流函数
 * 规定在一个单位时间内，只能触发一次函数。如果这个单位时间内触发多次函数，只有一次生效
 * @param func 要执行的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流后的函数
 * @example
 * const throttledScroll = throttle(() => handleScroll(), 100)
 * window.addEventListener('scroll', throttledScroll)
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false
  let lastResult: ReturnType<T>

  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      lastResult = func(...args)
      inThrottle = true

      setTimeout(() => {
        inThrottle = false
      }, limit)
    }

    return lastResult
  }
}

/**
 * 虚拟滚动配置
 */
export interface VirtualScrollConfig {
  /** 总项目数 */
  totalItems: number
  /** 每项高度（像素） */
  itemHeight: number
  /** 容器高度（像素） */
  containerHeight: number
  /** 缓冲区项目数（上下各增加的项目数） */
  bufferSize?: number
}

/**
 * 虚拟滚动计算结果
 */
export interface VirtualScrollResult {
  /** 开始索引 */
  startIndex: number
  /** 结束索引 */
  endIndex: number
  /** 可见项目数 */
  visibleCount: number
  /** 偏移量（像素） */
  offsetY: number
  /** 总高度（像素） */
  totalHeight: number
}

/**
 * 计算虚拟滚动参数
 * 用于优化大列表渲染性能
 * @param scrollTop 当前滚动位置
 * @param config 虚拟滚动配置
 * @returns VirtualScrollResult 计算结果
 * @example
 * const result = calculateVirtualScroll(scrollTop, {
 *   totalItems: 10000,
 *   itemHeight: 50,
 *   containerHeight: 600,
 *   bufferSize: 5
 * })
 * // 只渲染 result.startIndex 到 result.endIndex 的项目
 */
export function calculateVirtualScroll(
  scrollTop: number,
  config: VirtualScrollConfig
): VirtualScrollResult {
  const { totalItems, itemHeight, containerHeight, bufferSize = 3 } = config

  // 计算可见项目数
  const visibleCount = Math.ceil(containerHeight / itemHeight)

  // 计算开始索引（包含缓冲区）
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize)

  // 计算结束索引（包含缓冲区）
  const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + bufferSize * 2)

  // 计算偏移量
  const offsetY = startIndex * itemHeight

  // 计算总高度
  const totalHeight = totalItems * itemHeight

  return {
    startIndex,
    endIndex,
    visibleCount,
    offsetY,
    totalHeight,
  }
}

/**
 * 获取虚拟滚动的可见项目
 * @param items 所有项目
 * @param result 虚拟滚动计算结果
 * @returns 可见项目数组
 */
export function getVisibleItems<T>(items: T[], result: VirtualScrollResult): T[] {
  return items.slice(result.startIndex, result.endIndex + 1)
}

/**
 * 图片懒加载配置
 */
export interface LazyLoadConfig {
  /** 根元素（用于 IntersectionObserver） */
  root?: Element | null
  /** 根边距 */
  rootMargin?: string
  /** 阈值 */
  threshold?: number | number[]
}

/**
 * 创建图片懒加载观察器
 * @param callback 当图片进入视口时的回调
 * @param config 懒加载配置
 * @returns IntersectionObserver 实例
 * @example
 * const observer = createLazyLoadObserver((img) => {
 *   img.src = img.dataset.src
 * })
 * document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img))
 */
export function createLazyLoadObserver(
  callback: (element: Element) => void,
  config?: LazyLoadConfig
): IntersectionObserver {
  const options: IntersectionObserverInit = {
    root: config?.root ?? null,
    rootMargin: config?.rootMargin ?? '50px',
    threshold: config?.threshold ?? 0.01,
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        callback(entry.target)
        observer.unobserve(entry.target)
      }
    })
  }, options)

  return observer
}

/**
 * 简单的内存缓存类
 */
export class MemoryCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }>
  private maxSize: number
  private ttl: number // 生存时间（毫秒）

  /**
   * @param maxSize 最大缓存项数
   * @param ttl 生存时间（毫秒），默认 5 分钟
   */
  constructor(maxSize: number = 100, ttl: number = 5 * 60 * 1000) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.ttl = ttl
  }

  /**
   * 设置缓存
   */
  set(key: K, value: V): void {
    // 如果缓存已满，删除最旧的项
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    })
  }

  /**
   * 获取缓存
   * @returns 缓存值，如果不存在或已过期则返回 undefined
   */
  get(key: K): V | undefined {
    const item = this.cache.get(key)

    if (!item) {
      return undefined
    }

    // 检查是否过期
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return undefined
    }

    return item.value
  }

  /**
   * 检查缓存是否存在
   */
  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  /**
   * 删除缓存
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size
  }

  /**
   * 清理过期缓存
   */
  cleanup(): number {
    const now = Date.now()
    let removed = 0

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key)
        removed++
      }
    }

    return removed
  }
}

/**
 * 预加载图片
 * @param urls 图片 URL 数组
 * @returns Promise，当所有图片加载完成时 resolve
 * @example
 * await preloadImages(['/img1.jpg', '/img2.jpg'])
 */
export function preloadImages(urls: string[]): Promise<void[]> {
  const promises = urls.map((url) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
      img.src = url
    })
  })

  return Promise.all(promises)
}

/**
 * 预加载资源（通用）
 * @param url 资源 URL
 * @param as 资源类型（script, style, image, font 等）
 * @example
 * preloadResource('/script.js', 'script')
 */
export function preloadResource(url: string, as: string): void {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = as
  link.href = url
  document.head.appendChild(link)
}

/**
 * 批量预加载资源
 * @param resources 资源配置数组
 * @example
 * preloadResources([
 *   { url: '/script.js', as: 'script' },
 *   { url: '/style.css', as: 'style' }
 * ])
 */
export function preloadResources(resources: Array<{ url: string; as: string }>): void {
  resources.forEach(({ url, as }) => preloadResource(url, as))
}

/**
 * 请求空闲回调
 * 在浏览器空闲时执行任务
 * @param callback 要执行的回调
 * @param options 选项
 * @example
 * requestIdleCallback(() => {
 *   // 执行非关键任务
 * })
 */
export function requestIdleCallback(callback: () => void, options?: { timeout?: number }): number {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options)
  } else {
    // 降级方案
    return window.setTimeout(callback, 1) as unknown as number
  }
}

/**
 * 取消空闲回调
 */
export function cancelIdleCallback(id: number): void {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(id)
  } else {
    window.clearTimeout(id)
  }
}
