/**
 * CYP-memo Web Worker 池管理
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { generateUUID } from './crypto'

/**
 * Worker 任务接口
 */
export interface WorkerTask<T = unknown, R = unknown> {
  id: string
  type: string
  data: T
  resolve: (result: R) => void
  reject: (error: Error) => void
}

/**
 * Worker 消息接口
 */
export interface WorkerMessage<T = unknown> {
  id: string
  type: string
  data: T
}

/**
 * Worker 响应接口
 */
export interface WorkerResponse<R = unknown> {
  id: string
  success: boolean
  result?: R
  error?: string
}

/**
 * Worker 池配置
 */
export interface WorkerPoolConfig {
  /** Worker 数量 */
  size: number
  /** Worker 脚本 URL */
  workerUrl: string
}

/**
 * Worker 池类
 * 管理多个 Web Worker 以处理计算密集型任务
 */
export class WorkerPool {
  private workers: Worker[] = []
  private availableWorkers: Worker[] = []
  private taskQueue: WorkerTask[] = []
  private activeTasks: Map<string, WorkerTask> = new Map()

  constructor(private config: WorkerPoolConfig) {
    this.initialize()
  }

  /**
   * 初始化 Worker 池
   */
  private initialize(): void {
    for (let i = 0; i < this.config.size; i++) {
      const worker = new Worker(this.config.workerUrl, { type: 'module' })

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(worker, event.data)
      }

      worker.onerror = (error) => {
        console.error('Worker error:', error)
        this.handleWorkerError(worker, error)
      }

      this.workers.push(worker)
      this.availableWorkers.push(worker)
    }
  }

  /**
   * 处理 Worker 消息
   */
  private handleWorkerMessage(worker: Worker, response: WorkerResponse): void {
    const task = this.activeTasks.get(response.id)

    if (!task) {
      console.warn('Received response for unknown task:', response.id)
      return
    }

    // 移除活动任务
    this.activeTasks.delete(response.id)

    // 将 Worker 标记为可用
    this.availableWorkers.push(worker)

    // 处理响应
    if (response.success && response.result !== undefined) {
      task.resolve(response.result)
    } else {
      task.reject(new Error(response.error || 'Worker task failed'))
    }

    // 处理队列中的下一个任务
    this.processNextTask()
  }

  /**
   * 处理 Worker 错误
   */
  private handleWorkerError(worker: Worker, error: ErrorEvent): void {
    // 找到该 Worker 正在处理的任务
    for (const [id, task] of this.activeTasks.entries()) {
      // 简单处理：拒绝所有该 Worker 的任务
      task.reject(new Error(`Worker error: ${error.message}`))
      this.activeTasks.delete(id)
    }

    // 将 Worker 标记为可用
    if (!this.availableWorkers.includes(worker)) {
      this.availableWorkers.push(worker)
    }

    // 处理队列中的下一个任务
    this.processNextTask()
  }

  /**
   * 处理队列中的下一个任务
   */
  private processNextTask(): void {
    if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
      return
    }

    const task = this.taskQueue.shift()!
    const worker = this.availableWorkers.shift()!

    this.activeTasks.set(task.id, task)

    const message: WorkerMessage = {
      id: task.id,
      type: task.type,
      data: task.data,
    }

    worker.postMessage(message)
  }

  /**
   * 执行任务
   * @param type 任务类型
   * @param data 任务数据
   * @returns Promise<R> 任务结果
   */
  execute<T, R>(type: string, data: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const task: WorkerTask<T, R> = {
        id: generateUUID(),
        type,
        data,
        resolve,
        reject,
      }

      this.taskQueue.push(task)
      this.processNextTask()
    })
  }

  /**
   * 终止所有 Worker
   */
  terminate(): void {
    this.workers.forEach((worker) => worker.terminate())
    this.workers = []
    this.availableWorkers = []
    this.taskQueue = []
    this.activeTasks.clear()
  }

  /**
   * 获取池状态
   */
  getStatus(): {
    totalWorkers: number
    availableWorkers: number
    activeTasks: number
    queuedTasks: number
  } {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
    }
  }
}

/**
 * 创建简单的内联 Worker
 * @param workerFunction Worker 函数
 * @returns Worker URL
 * @example
 * const workerUrl = createInlineWorker((data) => {
 *   // 处理数据
 *   return result
 * })
 */
export function createInlineWorker(workerFunction: string): string {
  const blob = new Blob([workerFunction], { type: 'application/javascript' })
  return URL.createObjectURL(blob)
}
