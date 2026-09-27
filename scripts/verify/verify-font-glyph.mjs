#!/usr/bin/env node
/**
 * CYP-memo · 文案字形 + 字体栈机检（规则 24.25 · R-022）
 * - 扫未批准字母/数字/符号类
 * - 扫第二套正文硬编码字族（Helvetica/Arial 等）
 * - **不**扫描、不要求删除产品图标（含 emoji 图标位）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')

const SCAN_DIRS = [
  'packages/app/src',
  'packages/desktop/src',
  'packages/shared/src',
]

/** 文案未批准字形（不含 emoji/图标位） */
const RE = {
  sect: /\u00a7/,
  circ: /〇[\.．]/,
  zhi: /[一二三四五六七八九十百千]+之[一二三四五六七八九十百千]+/,
  frac: /[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒⅟]/,
  math: /[\u{1D400}-\u{1D7FF}]/u,
  fw: /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/,
  pua: /[\uE000-\uF8FF]/,
  sup: /[⁰¹²³⁴⁵⁶⁷⁸⁹]/,
  sub: /[₀₁₂₃₄₅₆₇₈₉]/,
}

/** 禁止作为正文第二套硬编码的字族（批准栈见 theme.css --cyp-font-*） */
const BANNED_FONT_STACK =
  /font-family\s*:\s*(?![^;]*var\(--cyp-font-)[^;]*(Helvetica\s+Neue|\bHelvetica\b|\bArial\b|Comic\s+Sans|Times\s+New\s+Roman|-apple-system)/i

const ALLOW_MARKERS = [
  '24.25',
  '批准字符',
  '未批准',
  '分数字形',
  '数学字母',
  '私用区',
  '全角拉丁',
  '上下标',
  '图标资产保护',
  '--cyp-font-sans',
  '--cyp-font-mono',
  '同口径',
]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(vue|ts|tsx|js|mjs|css|html)$/.test(ent.name)) out.push(p)
  }
  return out
}

const hits = []
for (const relDir of SCAN_DIRS) {
  const abs = path.join(root, relDir)
  for (const file of walk(abs)) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (ALLOW_MARKERS.some((m) => line.includes(m))) return
      const kinds = []
      for (const [name, rx] of Object.entries(RE)) {
        if (rx.test(line)) kinds.push(name)
      }
      if (BANNED_FONT_STACK.test(line)) kinds.push('banned-font-stack')
      if (kinds.length) {
        hits.push({
          file: path.relative(root, file).replace(/\\/g, '/'),
          line: idx + 1,
          kinds: kinds.join(','),
          preview: line.trim().slice(0, 100),
        })
      }
    })
  }
}

if (hits.length === 0) {
  console.log(
    'PASS verify:font-glyph — 文案无未批准字形且无第二套硬编码字族（不检图标）',
  )
  process.exit(0)
}

console.error(`FAIL verify:font-glyph — ${hits.length} 处问题：`)
for (const h of hits.slice(0, 40)) {
  console.error(`  ${h.file}:${h.line} [${h.kinds}] ${h.preview}`)
}
if (hits.length > 40) console.error(`  ... 另有 ${hits.length - 40} 处`)
process.exit(1)
