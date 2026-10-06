#!/usr/bin/env node
/**
 * CI 门禁 redact-dryrun · 规范 2.8 / AP-13
 *
 * 干跑扫描：检出目录（默认 logs/）中【未脱敏】的敏感信息。
 * 只读取、不修改（与 redact.sh 的真替换互补）。
 * 命中任意一项即视为泄露，退出码非 0，阻断流水线。
 *
 * 用法: node scripts/verify/verify-redact-dryrun.mjs [--dir <dir>] [--level strict|normal|off]
 * 退出码:
 *   0  无泄露
 *   1  检出未脱敏敏感信息（必须阻断）
 *   2  参数/用法错误
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const args = process.argv.slice(2)
let dir = 'logs'
let level = 'strict'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir') { dir = args[++i]; }
  else if (args[i] === '--level') { level = args[++i]; }
  else if (args[i] === '-h' || args[i] === '--help') {
    console.log('usage: node scripts/verify/verify-redact-dryrun.mjs [--dir <dir>] [--level strict|normal|off]')
    process.exit(0)
  } else { console.error('unknown arg: ' + args[i]); process.exit(2) }
}
if (!['strict', 'normal', 'off'].includes(level)) {
  console.error('illegal --level: ' + level); process.exit(2)
}

const groups = level === 'off' ? []
  : level === 'normal' ? ['secret', 'phone', 'email']
  : ['secret', 'phone', 'email', 'id', 'bank']

// 各模式的正则与说明
const PATTERNS = {
  secret: {
    desc: '密钥键值(password/token/secret/...)',
    re: /(password|passwd|pwd|token|secret|apikey|api_key|authorization|jwt)(["'\s]*[:=]["'\s]*)(["']?)([^\s"',;}{]+)/i
  },
  phone: { desc: '手机号(11位1开头)', re: /(?<![0-9a-fA-F])(1[3-9]\d{9})(?![0-9a-fA-F])/g },
  email: { desc: '邮箱', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  id: { desc: '身份证(18位)', re: /(?<![0-9a-fA-F])(\d{17}[\dXx])(?![0-9a-fA-F])/g },
  // 银行卡：16-19 位且通过 Luhn 校验，避免 UUID/计数器/小数/带小数点浮点的误报
  bank: {
    desc: '银行卡(16-19位,Luhn)',
    re: /(?<![0-9a-fA-F.])(\d{16,19})(?![0-9a-fA-F.])/g,
    luhn: true
  }
}

function isText(buf) {
  // 含 NUL 视为二进制
  return !buf.includes(0)
}

const findings = []
function scanFile(abs, rel) {
  let buf
  try { buf = readFileSync(abs) } catch { return }
  if (!isText(buf)) return
  const text = buf.toString('utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, idx) => {
    for (const g of groups) {
      const p = PATTERNS[g]
      p.re.lastIndex = 0
      let m
      while ((m = p.re.exec(line)) !== null) {
        // secret 模式需排除已被脱敏的值 ***
        if (g === 'secret') {
          const val = m[4] || ''
          if (val === '***' || val === '""' || val === "''") { p.re.lastIndex++; continue }
        }
        // 银行卡需通过 Luhn 校验，否则视为普通数字（UUID/计数器等）跳过
        if (p.luhn) {
          const num = m[1]
          let sum = 0, alt = false
          for (let i = num.length - 1; i >= 0; i--) { let d = +num[i]; if (alt) { d *= 2; if (d > 9) d -= 9 } sum += d; alt = !alt }
          if (sum % 10 !== 0) { p.re.lastIndex++; continue }
        }
        findings.push({ rel, line: idx + 1, group: g, desc: p.desc, snippet: line.trim().slice(0, 120) })
        break
      }
    }
  })
}

function walk(d) {
  let entries
  try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const abs = join(d, e.name)
    if (e.isDirectory()) {
      if (e.name === '.git' || e.name === 'node_modules') continue
      walk(abs)
    } else if (e.isFile()) {
      scanFile(abs, relative(process.cwd(), abs))
    }
  }
}

try { statSync(dir) } catch { console.error('missing dir: ' + dir); process.exit(2) }
walk(dir)

if (findings.length === 0) {
  console.log(`OK  redact-dryrun clean (dir=${dir}, level=${level})`)
  process.exit(0)
}

console.error(`FAIL  redact-dryrun: ${findings.length} unredacted finding(s) (level=${level})`)
for (const f of findings.slice(0, 200)) {
  console.error(`  [${f.group}] ${f.rel}:${f.line}  ${f.desc}`)
  console.error(`      > ${f.snippet}`)
}
process.exit(1)
