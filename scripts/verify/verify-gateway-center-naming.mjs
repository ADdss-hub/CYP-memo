#!/usr/bin/env node
/**
 * 运行底座网关中心 · 命名违规扫描（W1）
 * - 中文「××中心」仅允许受控枚举（须含「网关」）或包含枚举名的复合表述
 * - 信号 ID 同行禁止把 ID 称作「××中心」（教学句「禁止称中心」豁免）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')

const ALLOWED = [
  '运行底座网关中心',
  '业务网关子中心',
  '系统网关子中心',
  '策略控制网关子中心',
  '出站治理网关子中心',
  '事件与可观测网关子中心',
  '安全准入网关子中心',
]

const SIGNAL_RE =
  /\b(RB-L[01]-[A-Z]+-[A-Z]+-\d+|HOST-[A-Z]+|COL-[A-Z]+|MGMT-[A-Z]+|PUB-[A-Z]+)\b/g
const CENTER_RE = /[\u4e00-\u9fff]{0,24}中心/g

const SCAN_DIRS = ['docs/runtime-base', 'packages/server/src/runtime-base']

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(md|ts|mjs|js)$/.test(ent.name)) out.push(p)
  }
  return out
}

function isMetaOrNegation(phrase, line) {
  if (phrase === '中心' || phrase.length <= 2) return true
  if (/禁止.*中心|不得.*中心|勿.*中心|称其为|称「|称\"|缺字|违规|枚举|例外|禁令|命名铁律/.test(line)) {
    // 教学/禁令句：未引入非法「××中心」专名则豁免
    const illegal = [...line.matchAll(CENTER_RE)].map((m) => m[0]).filter((p) => !isAllowedPhrase(p))
    return illegal.every((p) => p === '中心' || /称中心|为中心|的中心$/.test(p) || p.length <= 4)
  }
  if (/^六?网关子中心$|^网关子中心$|^网关中心族$/.test(phrase)) return true
  return false
}

function isAllowedPhrase(phrase) {
  if (ALLOWED.some((a) => phrase === a || phrase.includes(a) || a.includes(phrase))) return true
  // 复合：须同时含「网关」与「中心」，且包含某一枚举子串
  if (phrase.includes('网关') && ALLOWED.some((a) => phrase.includes(a.replace(/运行底座/, '')))) {
    return true
  }
  if (phrase.includes('网关') && /网关(子)?中心/.test(phrase) && !/告警中心|性能中心|日志中心|科技中心|十二中心/.test(phrase)) {
    // 「六网关子中心」类元叙述
    if (/^[一二三四五六七八九十\d]*网关子中心$/.test(phrase) || phrase === '网关中心') return true
  }
  return false
}

function isHistoricalOk(line) {
  if (!/(历史|括注|已废止|不再作为现行)/.test(line)) return false
  return ALLOWED.some((a) => line.includes(a))
}

const failures = []

for (const rel of SCAN_DIRS) {
  const abs = path.join(root, rel)
  for (const file of walk(abs)) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
      const centers = line.match(CENTER_RE) || []
      for (const phrase of centers) {
        if (isAllowedPhrase(phrase)) continue
        if (isMetaOrNegation(phrase, line)) continue
        if (isHistoricalOk(line)) continue
        failures.push({
          file: path.relative(root, file),
          line: i + 1,
          kind: 'center_name',
          detail: phrase,
        })
      }
      const signals = line.match(SIGNAL_RE) || []
      if (signals.length && /中心/.test(line) && !/禁止.*中心|不得.*称/.test(line)) {
        for (const phrase of centers) {
          if (isAllowedPhrase(phrase) || isMetaOrNegation(phrase, line)) continue
          failures.push({
            file: path.relative(root, file),
            line: i + 1,
            kind: 'signal_as_center',
            detail: `${signals[0]} + ${phrase}`,
          })
        }
      }
    })
  }
}

if (failures.length) {
  console.error(`[verify-gateway-center-naming] FAIL ${failures.length} issue(s)`)
  for (const f of failures.slice(0, 80)) {
    console.error(`  ${f.file}:${f.line} [${f.kind}] ${f.detail}`)
  }
  process.exit(1)
}

console.log('[verify-gateway-center-naming] OK')
process.exit(0)
