/**
 * CYP-memo · 永久封禁离线人工解除（仅部署机）
 *
 * 禁止经公网/业务 API 解除。须在服务端主机执行：
 *   pnpm exec tsx scripts/offline-lift-ban.ts --username=foo1
 *   pnpm exec tsx scripts/offline-lift-ban.ts --ip=203.0.113.10
 *   pnpm exec tsx scripts/offline-lift-ban.ts --username=user1 --actor=ops-zhang
 *
 * 数据目录默认 packages/server/data；可用 --data-dir= 覆盖。
 * 运行中服务约 2s 内热加载 permanent-bans.json。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { offlineLiftPermanentBan } from '../src/runtime-base/l1/mgmt/iam/ready.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main(): Promise<void> {
  if (hasFlag('help') || hasFlag('h')) {
    console.log(`用法:
  pnpm exec tsx scripts/offline-lift-ban.ts --username=<user>
  pnpm exec tsx scripts/offline-lift-ban.ts --ip=<ipv4>
  可选: --actor=ops-name --data-dir=绝对或相对路径`)
    process.exit(0)
  }

  const username = arg('username')
  const ip = arg('ip')
  const actor = arg('actor')
  const dataDir =
    arg('data-dir') ||
    process.env.CYP_DATA_DIR ||
    path.resolve(__dirname, '../data')

  if (!username && !ip) {
    console.error('错误: 必须提供 --username= 或 --ip=')
    process.exit(2)
  }

  const result = offlineLiftPermanentBan({
    dataDir,
    username,
    ip,
    actor,
  })

  console.log(
    JSON.stringify(
      {
        ok: result.lifted > 0,
        lifted: result.lifted,
        dataDir: result.dataDir,
        records: result.records.map((r) => ({
          id: r.id,
          username: r.username,
          ip: r.ip,
          status: r.status,
          liftedBy: r.liftedBy,
          observationUntil: r.observationUntil,
        })),
        note: '仅离线；在线 POST /api/governance/bans/lift 已 410',
      },
      null,
      2
    )
  )
  if (result.lifted === 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
