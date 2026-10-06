/**
 * 生产口径广告 IP：非环回 IPv4（CI02 本机联调=生产访问形态）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */
import os from 'os'

/** 列出本机非环回 IPv4（多网卡全列） */
export function listAdvertiseIPv4(): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      const family = String(n.family)
      if ((family === 'IPv4' || family === '4') && !n.internal && n.address) {
        if (!seen.has(n.address)) {
          seen.add(n.address)
          out.push(n.address)
        }
      }
    }
  }
  return out
}

/** 首选广告 IP；无网卡时回落 127.0.0.1（仅探针） */
export function resolveAdvertiseIPv4(): string {
  return listAdvertiseIPv4()[0] || '127.0.0.1'
}
