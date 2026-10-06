#!/usr/bin/env node
/**
 * 制品双校验：先 sha256 sidecar，再可选 gpg 分离签名。
 * - 无 .asc/.sig：sha256 通过后退出 0，并打印 UNSIGNED（除非 CYP_REQUIRE_GPG=1）
 * - 有 sidecar：gpg --verify；失败或无 gpg 则退出 1
 * - 禁止在无密钥时伪造签名文件
 *
 * 用法: node scripts/verify/verify-artifact-integrity.mjs <file>
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/verify/verify-artifact-integrity.mjs <file>')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const shaScript = join(here, 'verify-artifact-sha256.mjs')
const sha = spawnSync(process.execPath, [shaScript, file], { stdio: 'inherit' })
if (sha.status !== 0) process.exit(sha.status === null ? 1 : sha.status)

const sig = existsSync(`${file}.asc`) ? `${file}.asc` : existsSync(`${file}.sig`) ? `${file}.sig` : ''
const requireGpg = process.env.CYP_REQUIRE_GPG === '1'

if (!sig) {
  if (requireGpg) {
    console.error('CYP_REQUIRE_GPG=1 but no .asc/.sig sidecar')
    process.exit(1)
  }
  console.log('UNSIGNED (sha256 ok; set CYP_REQUIRE_GPG=1 to refuse)')
  process.exit(0)
}

const gpg = spawnSync('gpg', ['--verify', sig, file], { stdio: 'inherit' })
if (gpg.error && gpg.error.code === 'ENOENT') {
  console.error('gpg not on PATH; cannot verify sidecar')
  process.exit(1)
}
if (gpg.status !== 0) {
  console.error('gpg verify failed')
  process.exit(gpg.status === null ? 1 : gpg.status)
}
console.log('OK gpg sidecar')
