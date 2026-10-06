/**
 * CYP-memo 服务器配置模块
 * CI02 生产环境唯一基准：APP_ENV 固定 prod，禁止非 prod 配置分支
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 权威：军械库配置组件条例 CI01/CI02 · 老板 2026-08-03 裁定
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'
import os from 'os'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

/**
 * 日志级别类型
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 军械库强制：唯一环境标识 */
export type AppEnv = 'prod'

/**
 * 服务器运行配置接口
 */
export interface ServerConfig {
  // 基础配置
  /** 网关端口（产品统一入口：静态资源 + API 代理 + MCP 代理） */
  port: number
  /** 后端 API 服务端口（仅环回，不直接对外暴露） */
  apiPort: number
  dataDir: string
  logLevel: LogLevel

  /** 固定 prod（CI02） */
  appEnv: AppEnv
  /** 进程 Node 模式：与生产基准对齐，固定 production */
  nodeEnv: 'production'

  // 运行时信息
  version: string
  startTime: Date

  // 时区配置
  timezone: string

  /** CI17-B.2 LBN 绑定码（可空；启用时仅经 B01） */
  lbnBindingCode: string | null
  /** CI17 本机机器码（启动时计算/校验） */
  machineId: string
  /** CI16/G04：kill-switch 文件或环境已激活则 true（loadConfig 仅探测，阻断在 bootstrap） */
  killSwitchArmed: boolean

  // 服务注册与发现（跨系统编排规范）
  /** 服务注册模式：local（单机默认） / consul（集群） */
  serviceRegistryMode: 'local' | 'consul'
  /** Consul Agent HTTP 地址（consul 模式时使用） */
  consulHttpAddr: string
  /** Consul ACL Token（可选） */
  consulHttpToken: string | null
  /** Consul 服务标签（逗号分隔 key=value） */
  consulServiceTags: string[]
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

/**
 * 获取默认数据目录（跨平台 · 本机进程）
 * - 显式 DATA_DIR 优先（由 loadConfig 另处理）
 * - 兼容历史路径 /app/data（若存在则用）
 * - 其余：锚定 packages/server/data
 */
function resolveServerPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg?.name === '@cyp-memo/server') return dir
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('server package root not found')
}

function getDefaultDataDir(): string {
  if (fs.existsSync('/app/data')) {
    return '/app/data'
  }
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR
  }

  const packageRoot = resolveServerPackageRoot()
  const packageDataDir = path.join(packageRoot, 'data')

  try {
    if (!fs.existsSync(packageDataDir)) {
      fs.mkdirSync(packageDataDir, { recursive: true })
    }
    return packageDataDir
  } catch {
    // 无法使用包内目录，回退到系统目录
  }

  const platform = process.platform
  const homeDir = os.homedir()

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')
    return path.join(localAppData, 'cyp-memo', 'data')
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'cyp-memo', 'data')
  } else {
    const xdgDataHome = process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share')
    return path.join(xdgDataHome, 'cyp-memo', 'data')
  }
}

/**
 * 默认配置值（生产唯一基准）
 */
const DEFAULT_CONFIG = {
  port: 5170,
  apiPort: 10170,
  get dataDir() {
    return getDefaultDataDir()
  },
  logLevel: 'info' as LogLevel,
  appEnv: 'prod' as const,
  nodeEnv: 'production' as const,
  timezone: 'Asia/Shanghai',
}

/**
 * 验证端口号是否有效
 */
function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigValidationError(`无效的端口号: ${port}，端口必须在 1-65535 之间`)
  }
}

/**
 * 验证日志级别是否有效
 */
function validateLogLevel(level: string): LogLevel {
  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error']
  if (!validLevels.includes(level as LogLevel)) {
    throw new ConfigValidationError(
      `无效的日志级别: ${level}，有效值为: ${validLevels.join(', ')}`
    )
  }
  return level as LogLevel
}

/**
 * 验证数据目录是否可访问
 */
function validateDataDir(dataDir: string): void {
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      throw new ConfigValidationError(
        `无法创建数据目录: ${dataDir}\n` +
          `错误: ${errorMsg}\n\n` +
          `解决方案:\n` +
          `1. 确保 DATA_DIR 存在且运行用户可写（面板/NAS/Windows/Unix 原生部署）\n` +
          `2. 执行: mkdir -p ${dataDir}/logs ${dataDir}/governance && 修正属主权限\n` +
          `3. 见 DEPLOY.md 五大服务矩阵（配置服务 B01）`
      )
    }
  }

  try {
    const testFile = path.join(dataDir, '.write-test')
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const isPermissionError = errorMsg.includes('EACCES') || errorMsg.includes('permission')

    let solution = ''
    if (isPermissionError) {
      solution =
        `\n\n解决方案:\n` +
        `1. 修正 DATA_DIR 属主/ACL，确保 Node 进程用户可写\n` +
        `2. mkdir -p ${dataDir}/logs ${dataDir}/governance\n` +
        `3. 部署见 DEPLOY.md / deploy/nas/README.md\n`
    }

    throw new ConfigValidationError(
      `数据目录不可写: ${dataDir}\n` + `错误: ${errorMsg}${solution}`
    )
  }
}

/**
 * 读取版本号
 */
function readVersion(): string {
  try {
    const serverRoot = resolveServerPackageRoot()
    const repoRoot = path.resolve(serverRoot, '..', '..')
    const possiblePaths = [
      path.join(process.cwd(), 'package.json'),
      path.join(serverRoot, 'package.json'),
      path.join(repoRoot, 'package.json'),
    ]

    for (const packageJsonPath of possiblePaths) {
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        if (packageJson.version) {
          return packageJson.version
        }
      }
    }

    const versionPaths = [
      path.join(process.cwd(), 'VERSION'),
      path.join(repoRoot, 'VERSION'),
      path.join(serverRoot, 'VERSION'),
    ]

    for (const versionFilePath of versionPaths) {
      if (fs.existsSync(versionFilePath)) {
        return fs.readFileSync(versionFilePath, 'utf-8').trim()
      }
    }

    return '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * CI02：强制生产唯一基准。若外部误设非 prod / 非 production，记录警告并纠正。
 */
function enforceProdBaseline(): void {
  const rawApp = (process.env.APP_ENV || '').trim().toLowerCase()
  if (rawApp && rawApp !== 'prod' && rawApp !== 'production') {
    console.warn(
      `[CI02] APP_ENV=${rawApp} 被拒绝；军械库强制项目固定 APP_ENV=prod（生产唯一基准）`
    )
  }
  const rawNode = (process.env.NODE_ENV || '').trim().toLowerCase()
  if (rawNode && rawNode !== 'production') {
    console.warn(
      `[CI02] NODE_ENV=${rawNode} 被纠正为 production；仅允许 production`
    )
  }
  process.env.APP_ENV = 'prod'
  process.env.NODE_ENV = 'production'
}

function detectKillSwitchArmed(dataDir: string): boolean {
  const envKill = (process.env.CYP_KILL_SWITCH || '').trim().toLowerCase()
  if (envKill === '1' || envKill === 'on' || envKill === 'true') return true
  const flag = path.join(dataDir, 'governance', 'kill-switch.on')
  return fs.existsSync(flag)
}

function readOrComputeMachineId(): string {
  const forced = (process.env.CYP_MACHINE_ID || '').trim()
  if (forced) return forced
  // 轻量本机指纹（与 governance-service.computeMachineId 同算法字段；避免循环 import）
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.userInfo().username,
    process.env.COMPUTERNAME || '',
  ].join('|')
  return cryptoCreateHash(raw)
}

function cryptoCreateHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

/**
 * 从环境变量加载配置（始终生产基准）
 */
export function loadConfig(): ServerConfig {
  enforceProdBaseline()

  const portStr = process.env.PORT
  const apiPortStr = process.env.API_PORT
  const dataDir = process.env.DATA_DIR || DEFAULT_CONFIG.dataDir
  const logLevelStr = process.env.LOG_LEVEL || DEFAULT_CONFIG.logLevel
  const timezone = process.env.TZ || DEFAULT_CONFIG.timezone
  const lbnBindingCode = (process.env.CYP_LBN_BINDING_CODE || '').trim() || null

  // 服务注册与发现配置（统一运行模式 · 默认 consul，不可达自动降级）
  const rawRegistryMode = (process.env.SERVICE_REGISTRY_MODE || 'consul').trim().toLowerCase()
  const serviceRegistryMode: 'local' | 'consul' =
    rawRegistryMode === 'local' ? 'local' : 'consul'
  const consulHttpAddr = process.env.CONSUL_HTTP_ADDR || 'http://127.0.0.1:8500'
  const consulHttpToken = (process.env.CONSUL_HTTP_TOKEN || '').trim() || null
  const consulTagsRaw = process.env.CONSUL_SERVICE_TAGS || 'env=prod,app=cyp-memo'
  const consulServiceTags = consulTagsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const port = portStr ? parseInt(portStr, 10) : DEFAULT_CONFIG.port
  const apiPort = apiPortStr ? parseInt(apiPortStr, 10) : DEFAULT_CONFIG.apiPort

  validatePort(port)
  validatePort(apiPort)
  const logLevel = validateLogLevel(logLevelStr)
  validateDataDir(dataDir)

  const machineId = readOrComputeMachineId()
  const killSwitchArmed = detectKillSwitchArmed(dataDir)

  // CI17：若声明了绑定机器码期望值且与本机不符 → 配置层直接阻断
  const expectedMachine = (process.env.CYP_EXPECTED_MACHINE_ID || '').trim()
  if (expectedMachine && expectedMachine !== machineId) {
    throw new ConfigValidationError(
      `CI17 机器码不匹配：expected=${expectedMachine.slice(0, 8)}… actual=${machineId.slice(0, 8)}…；拒绝注入`
    )
  }

  return {
    port,
    apiPort,
    dataDir,
    logLevel,
    appEnv: 'prod',
    nodeEnv: 'production',
    version: readVersion(),
    startTime: new Date(),
    timezone,
    lbnBindingCode,
    machineId,
    killSwitchArmed,
    serviceRegistryMode,
    consulHttpAddr,
    consulHttpToken,
    consulServiceTags,
  }
}

/**
 * CFG-SYS-06：启动报告字段（端口/目录/级别/环境/版本/时区；含 Node）
 * 纯结构，永不含口令。
 */
export interface StartupReportFields {
  appEnv: string
  port: number
  apiPort: number
  dataDir: string
  logLevel: string
  nodeEnv: string
  version: string
  timezone: string
  machineIdPrefix: string
  lbnBound: boolean
  killSwitchArmed: boolean
}

export function getStartupReportFields(config: ServerConfig): StartupReportFields {
  return {
    appEnv: config.appEnv,
    port: config.port,
    apiPort: config.apiPort,
    dataDir: config.dataDir,
    logLevel: config.logLevel,
    nodeEnv: config.nodeEnv,
    version: config.version,
    timezone: config.timezone,
    machineIdPrefix: config.machineId.slice(0, 8),
    lbnBound: Boolean(config.lbnBindingCode),
    killSwitchArmed: config.killSwitchArmed,
  }
}

/** 多行启动报告（权威同形；供 formatConfigInfo / desktop / 安装通道复用） */
export function buildStartupReportLines(config: StartupReportFields): string[] {
  return [
    '========== 服务器配置 ==========',
    `  环境: ${config.appEnv}（CI02 生产唯一基准）`,
    `  网关端口: ${config.port}（产品统一入口：静态 + API代理 + MCP代理）`,
    `  API 端口: ${config.apiPort}（仅环回 127.0.0.1）`,
    `  数据目录: ${config.dataDir}`,
    `  日志级别: ${config.logLevel}`,
    `  Node: ${config.nodeEnv}`,
    `  版本: ${config.version}`,
    `  时区: ${config.timezone}`,
    `  机器码前缀: ${config.machineIdPrefix}`,
    `  LBN 绑定: ${config.lbnBound ? 'yes' : 'no'}`,
    `  kill-switch: ${config.killSwitchArmed ? 'ARMED' : 'off'}`,
    '================================',
  ]
}

/** 单行摘要（同字段，无口令） */
export function formatStartupReportLine(config: StartupReportFields | ServerConfig): string {
  const f: StartupReportFields =
    'startTime' in config ? getStartupReportFields(config) : config
  return `[CYP-memo startup] env=${f.appEnv} port=${f.port} apiPort=${f.apiPort} dataDir=${f.dataDir} logLevel=${f.logLevel} node=${f.nodeEnv} version=${f.version} tz=${f.timezone} machine=${f.machineIdPrefix} lbn=${f.lbnBound} kill=${f.killSwitchArmed ? 'on' : 'off'}`
}

/**
 * 格式化配置信息用于日志输出（首行含环境=prod；禁口令）
 */
export function formatConfigInfo(config: ServerConfig): string {
  return buildStartupReportLines(getStartupReportFields(config)).join('\n')
}

let _config: ServerConfig | null = null

export function getConfig(): ServerConfig {
  if (!_config) {
    _config = loadConfig()
  }
  return _config
}

/**
 * 热变更仅允许动态项。port / dataDir / appEnv 是进程绑定，禁止经此改写。
 */
export function applyRuntimeLogLevel(level: string): LogLevel {
  const next = validateLogLevel(level)
  const cfg = getConfig()
  cfg.logLevel = next
  return next
}

/** 仅单测重置；不引入非生产配置 */
export function resetConfig(): void {
  _config = null
}

export function ready_rb_l0_infra_cfg_01(): boolean {
  try {
    getConfig()
    return true
  } catch {
    return false
  }
}

export interface InfraResourceProbe {
  sqlite: boolean
  cache: boolean
  mq: boolean
  port: boolean
}

export interface InfraResourceState {
  ready: boolean
  dataDir: string | null
  port: number | null
  sqlitePath: string | null
  mqOutboxPath: string | null
  cacheReady: boolean
  lastEnsureAt: string | null
  lastProbe: InfraResourceProbe | null
}

export interface EnsureResourcesOptions {
  dataDir: string
  port: number
}

const infraState: InfraResourceState = {
  ready: false,
  dataDir: null,
  port: null,
  sqlitePath: null,
  mqOutboxPath: null,
  cacheReady: false,
  lastEnsureAt: null,
  lastProbe: null,
}

function sqliteFile(dataDir: string): string {
  return path.join(dataDir, 'database.sqlite')
}

function mqOutboxFile(dataDir: string): string {
  return path.join(dataDir, 'mq', 'outbox.json')
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * 端口探测：尝试短暂 bind；成功则视为端口可用（存活/可拉起）。
 * 不长期占口；不创建 HTTP 服务（网关/初始化服务职责）。
 */
function probePortBindable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      resolve(false)
      return
    }
    const server = net.createServer()
    const done = (ok: boolean) => {
      try {
        server.close()
      } catch {
        /* ignore */
      }
      resolve(ok)
    }
    server.once('error', () => done(false))
    server.listen(port, '127.0.0.1', () => done(true))
  })
}

function pathAlive(filePath: string | null): boolean {
  if (!filePath) return false
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) return false
    // 文件可不存在（尚未首次写库）；目录可写即路径存活
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK)
    if (fs.existsSync(filePath)) {
      fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK)
    }
    return true
  } catch {
    return false
  }
}

/**
 * 拉起并验收嵌入式中间件能力位：目录/文件路径 + 进程内 cache 位 + 端口登记。
 * 不打开 sql.js、不建连接池、不跑 migration。
 */
export function ensureResources(opts: EnsureResourcesOptions): InfraResourceState {
  if (!infraState.ready) throw new Error('infra-resource not ready')
  const dataDir = String(opts.dataDir || '').trim()
  const port = Number(opts.port)
  if (!dataDir) throw new Error('ensureResources requires dataDir')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('ensureResources requires valid port')
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const sqlitePath = sqliteFile(dataDir)
  const outboxPath = mqOutboxFile(dataDir)
  ensureParentDir(sqlitePath)
  ensureParentDir(outboxPath)

  // 仅验收路径能力位：缺文件时建空壳，不写 Schema
  if (!fs.existsSync(sqlitePath)) {
    fs.writeFileSync(sqlitePath, Buffer.alloc(0))
  }
  if (!fs.existsSync(outboxPath)) {
    fs.writeFileSync(outboxPath, '[]\n', 'utf-8')
  }

  infraState.dataDir = dataDir
  infraState.port = port
  infraState.sqlitePath = sqlitePath
  infraState.mqOutboxPath = outboxPath
  infraState.cacheReady = true // 进程内 cache 能力位（非 Redis；不建业务池）
  infraState.lastEnsureAt = new Date().toISOString()
  return getInfraResourceState()
}

/**
 * 探活：sqlite/mq 路径存活 · cache 能力位 · 端口可 bind
 */
export async function probe(): Promise<InfraResourceProbe> {
  if (!infraState.ready) {
    const empty: InfraResourceProbe = { sqlite: false, cache: false, mq: false, port: false }
    infraState.lastProbe = empty
    return { ...empty }
  }
  const portOk =
    infraState.port != null ? await probePortBindable(infraState.port) : false
  const result: InfraResourceProbe = {
    sqlite: pathAlive(infraState.sqlitePath),
    cache: infraState.cacheReady === true,
    mq: pathAlive(infraState.mqOutboxPath),
    port: portOk,
  }
  infraState.lastProbe = { ...result }
  return { ...result }
}

export function getInfraResourceState(): InfraResourceState {
  return {
    ...infraState,
    lastProbe: infraState.lastProbe ? { ...infraState.lastProbe } : null,
  }
}

export function isInfraResourceReady(): boolean {
  return infraState.ready
}

export function initInfraResource(_opts?: { dataDir?: string }): InfraResourceState {
  infraState.ready = true
  if (_opts?.dataDir) {
    infraState.dataDir = String(_opts.dataDir).trim() || null
  }
  return getInfraResourceState()
}

export function resetInfraResource(): void {
  infraState.ready = false
  infraState.dataDir = null
  infraState.port = null
  infraState.sqlitePath = null
  infraState.mqOutboxPath = null
  infraState.cacheReady = false
  infraState.lastEnsureAt = null
  infraState.lastProbe = null
}

export type EnvSlotKind = 'prod' | 'feature'

export interface EnvSlot {
  name: string
  kind: EnvSlotKind
  registeredAt: string
}

export interface EnvIsolationState {
  ready: boolean
  /** CI02：默认 active=prod */
  active: string
  envSlots: EnvSlot[]
}

const ENV_PROD = 'prod'
const HEADER = 'x-cyp-env'

const envIsoState: EnvIsolationState = {
  ready: false,
  active: ENV_PROD,
  envSlots: [],
}

const envSlots = new Map<string, EnvSlot>()

function normalizeName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ensureProdSlot(): void {
  if (!envSlots.has(ENV_PROD)) {
    envSlots.set(ENV_PROD, {
      name: ENV_PROD,
      kind: 'prod',
      registeredAt: new Date().toISOString(),
    })
  }
}

/**
 * 登记隔离槽。prod 固定存在；其它名视为 feature（仅联调，非生产发布）。
 */
export function registerEnv(name: string): EnvSlot {
  if (!envIsoState.ready) throw new Error('env-isolation not ready')
  const n = normalizeName(name)
  if (!n) throw new Error('registerEnv requires name')
  if (n === ENV_PROD) {
    ensureProdSlot()
    return { ...envSlots.get(ENV_PROD)! }
  }
  const existing = envSlots.get(n)
  if (existing) return { ...existing }
  const slot: EnvSlot = {
    name: n,
    kind: 'feature',
    registeredAt: new Date().toISOString(),
  }
  envSlots.set(n, slot)
  envIsoState.envSlots = Array.from(envSlots.values()).map((s) => ({ ...s }))
  return { ...slot }
}

/**
 * 从请求头解析环境槽：优先 x-cyp-env，否则回落 active（默认 prod）。
 * 未登记的 feature 名不会自动创建（须先 registerEnv）。
 */
export function resolveEnv(
  reqHeaders: Record<string, string | string[] | undefined> | Headers | null | undefined
): string {
  if (!envIsoState.ready) return ENV_PROD
  let raw: string | undefined
  if (reqHeaders && typeof (reqHeaders as Headers).get === 'function') {
    raw = (reqHeaders as Headers).get(HEADER) || undefined
  } else if (reqHeaders && typeof reqHeaders === 'object') {
    const h = reqHeaders as Record<string, string | string[] | undefined>
    const v = h[HEADER] ?? h['X-Cyp-Env'] ?? h['X-CYP-ENV']
    raw = Array.isArray(v) ? v[0] : v
  }
  const n = normalizeName(raw || '')
  if (!n) return envIsoState.active
  if (envSlots.has(n)) return n
  // 未登记：不隐式建槽，回落 active（CI02 默认 prod）
  return envIsoState.active
}

/**
 * 销毁 feature 槽。禁止销毁 prod。
 */
export function destroyEnv(name: string): boolean {
  if (!envIsoState.ready) throw new Error('env-isolation not ready')
  const n = normalizeName(name)
  if (!n) return false
  if (n === ENV_PROD) throw new Error('cannot destroy prod slot')
  const ok = envSlots.delete(n)
  if (ok && envIsoState.active === n) envIsoState.active = ENV_PROD
  envIsoState.envSlots = Array.from(envSlots.values()).map((s) => ({ ...s }))
  return ok
}

export function getEnvIsolationState(): EnvIsolationState {
  return {
    ready: envIsoState.ready,
    active: envIsoState.active,
    envSlots: Array.from(envSlots.values()).map((s) => ({ ...s })),
  }
}

export function isEnvIsolationReady(): boolean {
  return envIsoState.ready
}

export function initEnvIsolation(_opts?: { dataDir?: string }): EnvIsolationState {
  envSlots.clear()
  ensureProdSlot()
  envIsoState.active = ENV_PROD
  envIsoState.envSlots = Array.from(envSlots.values()).map((s) => ({ ...s }))
  const dataDir = _opts?.dataDir ? String(_opts.dataDir).trim() : ''
  if (dataDir) {
    const dir = path.join(dataDir, 'env-isolation')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
  envIsoState.ready = true
  return getEnvIsolationState()
}

export function resetEnvIsolation(): void {
  envSlots.clear()
  envIsoState.ready = false
  envIsoState.active = ENV_PROD
  envIsoState.envSlots = []
}

export interface DiskSpaceInfo {
  used: number
  available: number
  total: number
}

/** 可用空间低于此值则拒绝就绪（100MB） */
export const MIN_DISK_SPACE_BYTES = 100 * 1024 * 1024

const DISK_SPACE_CACHE_TTL_MS = 60_000
let diskSpaceCache: { at: number; path: string; value: DiskSpaceInfo | null } | null = null

export function getDiskSpace(dirPath: string): DiskSpaceInfo | null {
  const resolved = path.resolve(dirPath)
  const now = Date.now()
  if (
    diskSpaceCache &&
    diskSpaceCache.path === resolved &&
    now - diskSpaceCache.at < DISK_SPACE_CACHE_TTL_MS
  ) {
    return diskSpaceCache.value
  }
  const value = probeDiskSpace(resolved)
  diskSpaceCache = { at: now, path: resolved, value }
  return value
}

/**
 * 本机能力（性能自动化唯一前提）。
 * 同一公式覆盖 Win/macOS/Linux 与 x64/arm64：逻辑 CPU + 物理内存，禁止写死并发。
 * 每 512MiB 计 1 个内存槽；地板 = min(逻辑 CPU, 内存槽)；上限 = min(CPU×2, 内存槽×2, 256)。
 */
export interface MachineCapacity {
  platform: NodeJS.Platform
  arch: string
  logicalCpus: number
  totalMemBytes: number
  freeMemBytes: number
  floorConcurrency: number
  maxConcurrency: number
  /** 单键 API 预算（次/分钟），随逻辑 CPU，再乘弹性系数 */
  apiRpm: number
  /** 客户端错误上报预算（次/分钟），随 apiRpm，防止刷屏但不写死 60 */
  clientErrorRpm: number
  /** 领域事件单轮出队条数，随逻辑 CPU */
  mqDrainBatch: number
  /** 事件循环延迟预算（毫秒）。测的是本进程，阈值只在此处定义 */
  eventLoopWarnMs: number
  eventLoopCriticalMs: number
  eventLoopShedMs: number
  probedAt: string
}

const MEM_SLOT_BYTES = 512 * 1024 * 1024

export function getMachineCapacity(): MachineCapacity {
  const fromParallel =
    typeof os.availableParallelism === 'function' ? os.availableParallelism() : 0
  const fromCpus = Array.isArray(os.cpus()) ? os.cpus().length : 0
  const logicalCpus = Math.max(1, fromParallel || fromCpus || 1)
  const totalMemBytes = os.totalmem()
  const freeMemBytes = os.freemem()
  const memSlots = Math.max(1, Math.floor(totalMemBytes / MEM_SLOT_BYTES))
  const floorConcurrency = Math.max(1, Math.min(logicalCpus, memSlots))
  const maxConcurrency = Math.max(
    floorConcurrency,
    Math.min(logicalCpus * 2, memSlots * 2, 256)
  )
  const apiRpm = Math.max(30, logicalCpus * 75)
  const clientErrorRpm = Math.max(10, Math.floor(apiRpm / 10))
  const mqDrainBatch = Math.max(16, Math.min(1024, logicalCpus * 32))
  return {
    platform: process.platform,
    arch: process.arch,
    logicalCpus,
    totalMemBytes,
    freeMemBytes,
    floorConcurrency,
    maxConcurrency,
    apiRpm,
    clientErrorRpm,
    mqDrainBatch,
    eventLoopWarnMs: 120,
    eventLoopCriticalMs: 400,
    eventLoopShedMs: 800,
    probedAt: new Date().toISOString(),
  }
}

/** 块数 × 块大小 → 字节。超安全整数则放弃，改走 CLI 兜底（避免大卷在 32 位丢失精度）。 */
function blocksToBytes(blockSize: number | bigint, count: number | bigint): number | null {
  const bsize = typeof blockSize === 'bigint' ? blockSize : BigInt(Math.trunc(blockSize))
  const n = typeof count === 'bigint' ? count : BigInt(Math.trunc(count))
  if (bsize <= 0n || n < 0n) return null
  const bytes = bsize * n
  if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(bytes)
}

/**
 * 存储空间探测：主路径 Node `fs.statfsSync`（Win / macOS / Linux，x64 / arm64 等同口径）。
 * CLI 仅在 statfs 缺失或失败时兜底，禁止按系统另造第二套 used/total/available 定义。
 */
function probeDiskSpace(dirPath: string): DiskSpaceInfo | null {
  const viaStatfs = probeDiskSpaceStatfs(dirPath)
  if (viaStatfs) return viaStatfs
  return probeDiskSpaceCli(dirPath)
}

function probeDiskSpaceStatfs(dirPath: string): DiskSpaceInfo | null {
  try {
    const statfsSync = (
      fs as typeof fs & {
        statfsSync?: (p: string) => {
          bsize: number | bigint
          blocks: number | bigint
          bavail: number | bigint
          bfree: number | bigint
        }
      }
    ).statfsSync
    if (typeof statfsSync !== 'function') return null
    const s = statfsSync(path.resolve(dirPath))
    const total = blocksToBytes(s.bsize, s.blocks)
    const available = blocksToBytes(s.bsize, s.bavail)
    const free = blocksToBytes(s.bsize, s.bfree)
    if (total == null || available == null || free == null || total <= 0) return null
    const used = Math.max(0, total - free)
    if (!Number.isFinite(used) || !Number.isFinite(available)) return null
    return { used, available, total }
  } catch {
    return null
  }
}

function probeDiskSpaceCli(dirPath: string): DiskSpaceInfo | null {
  try {
    if (process.platform === 'win32') {
      return probeDiskSpaceWindowsCli(dirPath)
    }
    return probeDiskSpacePosixDf(dirPath)
  } catch {
    return null
  }
}

function probeDiskSpaceWindowsCli(dirPath: string): DiskSpaceInfo | null {
  const drive = path.parse(path.resolve(dirPath)).root.replace('\\', '')
  const letter = drive.replace(':', '')
  if (!/^[A-Za-z]$/.test(letter)) return null
  try {
    const psCommand = `(Get-PSDrive -Name '${letter}' | Select-Object Used,Free | ConvertTo-Json)`
    const output = execSync(`powershell -NoProfile -Command "${psCommand}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    })
    const data = JSON.parse(output.trim()) as { Used?: number; Free?: number }
    const used = data.Used || 0
    const available = data.Free || 0
    if (used + available <= 0) return null
    return { used, available, total: used + available }
  } catch {
    const output = execSync(
      `wmic logicaldisk where "DeviceID='${letter}:'" get FreeSpace,Size /format:csv`,
      { encoding: 'utf-8', timeout: 5000 }
    )
    const lines = output.trim().split('\n').filter((line) => line.trim())
    if (lines.length < 2) return null
    const values = lines[1].split(',')
    if (values.length < 3) return null
    const available = parseInt(values[1], 10) || 0
    const total = parseInt(values[2], 10) || 0
    if (total <= 0) return null
    return { available, total, used: Math.max(0, total - available) }
  }
}

/** POSIX `df -kP`：macOS / Linux / BusyBox 均可用；禁止 `df -B1`（部分发行版没有 -B）。 */
function probeDiskSpacePosixDf(dirPath: string): DiskSpaceInfo | null {
  const output = execSync(`df -kP "${dirPath}"`, {
    encoding: 'utf-8',
    timeout: 5000,
  })
  const lines = output.trim().split('\n').filter((line) => line.trim())
  const row = lines[lines.length - 1]
  if (!row) return null
  const parts = row.trim().split(/\s+/)
  if (parts.length < 4) return null
  const total = (parseInt(parts[1], 10) || 0) * 1024
  const used = (parseInt(parts[2], 10) || 0) * 1024
  const available = (parseInt(parts[3], 10) || 0) * 1024
  if (total <= 0 || !Number.isFinite(total)) return null
  return { used, available, total }
}
