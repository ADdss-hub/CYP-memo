/**
 * MCP JSON-RPC 错误工厂（设计报告 §12）
 * 顶层 error.code 为整数；业务主键在 error.data.reason
 */

export type McpReason =
  | 'MCP_DISABLED'
  | 'MCP_CAP_OFF'
  | 'MCP_AUTH'
  | 'MCP_NOT_PUBLIC'
  | 'MCP_AUDIT_REJECT'
  | 'MCP_FORBIDDEN'
  | 'MCP_READ_LAYER_SKIP'
  | 'MCP_REPORT_REQUIRED'
  | 'MCP_REPORT_MISMATCH'
  | 'MCP_NOT_EXTRACTABLE'
  | 'MCP_NOT_FOUND'

const REASON_CODE: Record<McpReason, number> = {
  MCP_DISABLED: -32603,
  MCP_CAP_OFF: -32601,
  MCP_AUTH: -32001,
  MCP_NOT_PUBLIC: -32603,
  MCP_AUDIT_REJECT: -32603,
  MCP_FORBIDDEN: -32007,
  MCP_READ_LAYER_SKIP: -32602,
  MCP_REPORT_REQUIRED: -32602,
  MCP_REPORT_MISMATCH: -32602,
  MCP_NOT_EXTRACTABLE: -32602,
  MCP_NOT_FOUND: -32602,
}

const REASON_MESSAGE: Record<McpReason, string> = {
  MCP_DISABLED: 'MCP service is disabled',
  MCP_CAP_OFF: 'MCP capability is turned off',
  MCP_AUTH: 'Personal token required or invalid',
  MCP_NOT_PUBLIC: 'Resource is not in public projection',
  MCP_AUDIT_REJECT: 'Audit match rejected',
  MCP_FORBIDDEN: 'RBAC or tenant forbidden',
  MCP_READ_LAYER_SKIP: 'Segmented read layer skipped',
  MCP_REPORT_REQUIRED: 'Honesty report required',
  MCP_REPORT_MISMATCH: 'Honesty report layers mismatch',
  MCP_NOT_EXTRACTABLE: 'File text not extractable',
  MCP_NOT_FOUND: 'Resource not found',
}

export class McpBizError extends Error {
  readonly code: number
  readonly reason: McpReason
  readonly extra?: Record<string, unknown>

  constructor(reason: McpReason, message?: string, extra?: Record<string, unknown>) {
    super(message || REASON_MESSAGE[reason])
    this.name = 'McpBizError'
    this.code = REASON_CODE[reason]
    this.reason = reason
    this.extra = extra
  }

  toJsonRpc() {
    return {
      code: this.code,
      message: this.message,
      data: { reason: this.reason, ...(this.extra || {}) },
    }
  }
}

export function mcpError(reason: McpReason, message?: string, extra?: Record<string, unknown>): McpBizError {
  return new McpBizError(reason, message, extra)
}

/** 工具层业务错误（isError:true），用于不可抽取等 */
export function toolErrorPayload(reason: McpReason, message?: string, extra?: Record<string, unknown>) {
  return {
    isError: true as const,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          reason,
          code: REASON_CODE[reason],
          message: message || REASON_MESSAGE[reason],
          ...(extra || {}),
        }),
      },
    ],
  }
}
