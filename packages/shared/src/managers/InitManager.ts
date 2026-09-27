/**
 * CYP-memo 系统就绪客户端（Init · 只读）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * INIT-SYS-07 / INIT-SYS-10：
 * - 禁止在 shared / 客户端平行创建默认管理员或 Owner 种子
 * - 种子权威仅 packages/server bootstrap（对接点：sqlite-database.ensureSystemOwnerSeed → 目标 Owner）
 * - 本模块只消费 ready；托管业务服务不得 import 触发副作用种子
 */

import { getStorage } from '../storage'
import { logManager } from './LogManager'

/**
 * 系统就绪态（客户端消费契约）
 * 权威探针：服务端 `GET /healthz/ready`（R0 Phase4）
 */
export interface SystemReadyStatus {
  ready: boolean
  /** 就绪信息来源 */
  source: 'server_probe' | 'local_flag' | 'unknown'
  message?: string
  /** 服务端已具备 Owner 种子（目标态） */
  hasOwnerSeed?: boolean
  /** bootstrap 阶段名（若服务端返回） */
  phase?: string
  /** 关联 trace（若服务端返回） */
  traceId?: string
}

export type SystemReadyProbe = () => Promise<SystemReadyStatus>

/**
 * 系统初始化/就绪管理器（降级为只读就绪态）
 *
 * @deprecated 名称保留兼容；勿再理解为「创建默认管理员」
 */
export class InitManager {
  private readyProbe: SystemReadyProbe | null = null

  /**
   * 由 app/desktop 在启动时注入：通常请求 `GET /healthz/ready`
   * 未注入时绝不回退为建库/建管理员
   */
  setReadyProbe(probe: SystemReadyProbe): void {
    this.readyProbe = probe
  }

  clearReadyProbe(): void {
    this.readyProbe = null
  }

  /**
   * 只读：查询系统是否就绪（配置+DB+种子+关键模块）
   */
  async getReadyStatus(): Promise<SystemReadyStatus> {
    if (this.readyProbe) {
      try {
        return await this.readyProbe()
      } catch (error) {
        await logManager.warn('readyProbe 失败', {
          action: 'system_ready_probe',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        return {
          ready: false,
          source: 'server_probe',
          message: 'readyProbe 调用失败；请确认服务端 bootstrap 已完成',
        }
      }
    }

    // 过渡态：仅读本地标记，绝不创建种子
    try {
      const initSetting = await getStorage().getSetting<boolean>('system_initialized')
      if (initSetting === true) {
        return {
          ready: true,
          source: 'local_flag',
          message:
            '本地 system_initialized=true（过渡态）；权威以 server /healthz/ready 为准',
        }
      }
      return {
        ready: false,
        source: 'local_flag',
        message:
          '未配置 readyProbe 且本地未标记就绪；客户端禁止自建管理员，请等待服务端 bootstrap',
      }
    } catch {
      return {
        ready: false,
        source: 'unknown',
        message: '无法读取就绪态',
      }
    }
  }

  /**
   * 兼容旧调用名：仅返回就绪态，不再创建默认管理员
   *
   * @deprecated 请改用 getReadyStatus()
   */
  async initializeSystem(): Promise<SystemReadyStatus> {
    const status = await this.getReadyStatus()
    await logManager.info('initializeSystem 已降级为只读就绪检查（INIT-SYS-07）', {
      action: 'system_init_ready_only',
      ready: status.ready,
      source: status.source,
    })
    return status
  }

  /**
   * @deprecated INIT-SYS-07：客户端禁止重置种子口令；请走服务端运维入口
   */
  async resetAdminPassword(): Promise<never> {
    throw new Error(
      'INIT-SYS-07: 客户端已废止 resetAdminPassword / 平行建管理员；种子权威在 server bootstrap'
    )
  }
}

/**
 * InitManager 单例（无副作用；不在 import 时建库或建用户）
 */
export const initManager = new InitManager()
