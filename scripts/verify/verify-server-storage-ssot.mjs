/**
 * 机检：服务器存储 SSOT（R-010）
 * - 远程禁 navigator.storage 作磁盘
 * - storage / health 同调 getDiskSpace(dataDir)
 * - 禁 cwd 旁路上传根；sqlite 只读 config.dataDir
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fails = []

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const diskMod = path.join(root, 'packages/server/src/runtime-base/l0/infra/cfg/ready.ts')
if (!fs.existsSync(diskMod) || !/export function getDiskSpace/.test(read('packages/server/src/runtime-base/l0/infra/cfg/ready.ts'))) {
  fails.push('缺少配置组件内 getDiskSpace（存储空间探测唯一实现）')
}

const fileManager = read('packages/shared/src/managers/FileManager.ts')
if (/navigator\.storage/.test(fileManager)) {
  fails.push('FileManager.ts 含 navigator.storage（R-010）')
}
if (/used:\s*accountUsed/.test(fileManager)) {
  fails.push('FileManager 禁止用 accountUsed 冒充 used（R-010）')
}

const local = read('packages/shared/src/storage/LocalStorageAdapter.ts')
if (/navigator\.storage/.test(local)) {
  fails.push('LocalStorageAdapter 仍含 navigator.storage：废弃本地路径不得报浏览器配额为磁盘（R-010）')
}

for (const rel of [
  'packages/app/src/views/AttachmentsView.vue',
  'packages/app/src/views/StatisticsView.vue',
]) {
  if (/navigator\.storage/.test(read(rel))) {
    fails.push(`${rel} 含 navigator.storage（R-010）`)
  }
}

const remote = read('packages/shared/src/storage/RemoteStorageAdapter.ts')
if (!/getStorageInfo/.test(remote) || !/accountUsed/.test(remote)) {
  fails.push('RemoteStorageAdapter 须实现 getStorageInfo 并传递 accountUsed')
}
if (/accountUsed\s*\?\?\s*result\.used/.test(remote)) {
  fails.push('getStorageUsed 禁止回退到卷 used（R-010）')
}

const serverIdx = read('packages/server/src/index.ts')
if (!/getDiskSpace/.test(serverIdx) || !/runtime-base\/l0\/infra\/cfg\/ready\.js/.test(serverIdx)) {
  fails.push('index.ts 须从配置组件导入 getDiskSpace')
}
if (/function getDiskSpace|function probeDiskSpace/.test(serverIdx)) {
  fails.push('index.ts 禁止再定义 getDiskSpace/probeDiskSpace（须唯一实现）')
}
if (!/\/users\/:userId\/storage/.test(serverIdx) || !/getDiskSpace\(config\.dataDir\)/.test(serverIdx)) {
  fails.push('GET /api/users/:userId/storage 须调用 getDiskSpace(config.dataDir)')
}
if (/process\.cwd\(\).*uploads|packages',\s*'server',\s*'data',\s*'uploads'/.test(serverIdx)) {
  fails.push('multer 禁止 cwd/仓库相对路径回退 uploads（R-010）')
}

const sqlite = read('packages/server/src/runtime-base/l0/infra/db/ready.ts')
if (/process\.env\.DATA_DIR/.test(sqlite)) {
  fails.push('数据库组件 getDataPaths 须只读 getConfig().dataDir，禁止另解析 DATA_DIR')
}
if (!/getConfig\(\)\.dataDir/.test(sqlite)) {
  fails.push('数据库组件须使用 getConfig().dataDir')
}

const boot = read('packages/server/src/bootstrap.ts')
if (!/getDiskSpace\(config\.dataDir\)/.test(boot) || !/MIN_DISK_SPACE_BYTES/.test(boot)) {
  fails.push('bootstrap Phase0（cfg.load_validate）须在配置注入后探测 getDiskSpace 并按 MIN_DISK_SPACE 阻断')
}
if (!/bootstrap\.phase0\.storage_space/.test(boot)) {
  fails.push('bootstrap 须记录 bootstrap.phase0.storage_space')
}
if (!/id:\s*'db\.z_file_storage',\s*\r?\n\s*phase:\s*1/.test(boot)) {
  fails.push('文件存储须在 Phase1 登记为 db.z_file_storage（基础设施完整）')
}
if (/id:\s*'mod\.file_storage'/.test(boot) || /id:\s*'mod\.upload_dir'/.test(boot)) {
  fails.push('禁止 Phase2 重复文件存储/upload_dir；唯一根经 Phase1 file_storage')
}

const healthSrc = read('packages/server/src/index.ts')
if (!/storageSpace:\s*spacePayload/.test(healthSrc)) {
  fails.push('GET /api/health 须输出正式字段 storageSpace')
}

const rule = path.join(root, '.cursor/rules/cyp-memo-server-storage-ssot-gate.mdc')
if (!fs.existsSync(rule)) {
  fails.push('缺少 Cursor 规则 cyp-memo-server-storage-ssot-gate.mdc')
}

if (fails.length) {
  console.error('FAIL_SERVER_STORAGE_SSOT')
  for (const f of fails) console.error(' -', f)
  process.exit(1)
}

console.log('PASS_SERVER_STORAGE_SSOT')
process.exit(0)
