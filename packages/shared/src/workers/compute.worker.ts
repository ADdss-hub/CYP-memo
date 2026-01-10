/**
 * CYP-memo 计算密集型任务 Worker
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { WorkerMessage, WorkerResponse } from '../utils/worker-pool'

/**
 * 处理消息
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { id, type, data } = event.data

  try {
    let result: unknown

    switch (type) {
      case 'hash':
        // 计算哈希（示例）
        result = computeHash(data as string)
        break

      case 'compress':
        // 压缩数据（示例）
        result = compressData(data as string)
        break

      case 'search':
        // 搜索（示例）
        result = searchInData(data as { query: string; items: unknown[] })
        break

      default:
        throw new Error(`Unknown task type: ${type}`)
    }

    const response: WorkerResponse = {
      id,
      success: true,
      result,
    }

    self.postMessage(response)
  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }

    self.postMessage(response)
  }
}

/**
 * 计算简单哈希（示例实现）
 */
function computeHash(data: string): string {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(16)
}

/**
 * 压缩数据（示例实现 - 简单的 RLE）
 */
function compressData(data: string): string {
  let compressed = ''
  let count = 1

  for (let i = 0; i < data.length; i++) {
    if (data[i] === data[i + 1]) {
      count++
    } else {
      compressed += data[i] + (count > 1 ? count : '')
      count = 1
    }
  }

  return compressed
}

/**
 * 在数据中搜索（示例实现）
 */
function searchInData(params: { query: string; items: unknown[] }): unknown[] {
  const { query, items } = params
  const lowerQuery = query.toLowerCase()

  return items.filter((item) => {
    const itemStr = JSON.stringify(item).toLowerCase()
    return itemStr.includes(lowerQuery)
  })
}
