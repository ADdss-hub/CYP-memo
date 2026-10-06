/**
 * 设计 §17 O1–O7：按建议默认落地核验（任务线 5）
 * 通过打印 OPEN_ITEMS_O1_O7_PASS + JSON 证据
 */
import { loadMcpConfig } from '../src/config.js'
import { extractTextFromBuffer } from '../src/extract/text.js'
import { SegmentSessionStore } from '../src/session/store.js'
import { assertPublicSelected } from '../src/public/selector.js'
import { assertLayerAllowed } from '../src/auth/context.js'
import { mcpError, McpBizError } from '../src/errors.js'

const evidence: Record<string, unknown> = {}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT ${msg}`)
}

async function main(): Promise<void> {
  const clearKeys = [
    'CYP_MCP_ENABLED',
    'CYP_MCP_CAP_QUERY',
    'CYP_MCP_CAP_MEMO_WRITE',
    'CYP_MCP_CAP_FILE_WRITE',
    'CYP_MCP_PUBLIC_MAX_LAYER',
    'CYP_MCP_MEMO_SELECTOR_MODE',
    'CYP_MCP_FILE_SELECTOR_MODE',
    'CYP_MCP_SSE_LEGACY',
    'CYP_MCP_EMBED_SERVER',
  ]
  for (const k of clearKeys) delete process.env[k]

  const cfg = loadMcpConfig()

  // O3：enabled=true；默认仅 query；写关
  assert(cfg.enabled === true, 'O3 enabled')
  assert(cfg.cap.query === true, 'O3 query')
  assert(cfg.cap.memoWrite === false && cfg.cap.fileWrite === false, 'O3 write off')
  evidence.O3 = { enabled: true, query: true, memoWrite: false, fileWrite: false }

  // O5：公开默认最高层 summary
  assert(cfg.public.maxLayer === 'summary', 'O5 maxLayer')
  evidence.O5 = { maxLayer: cfg.public.maxLayer }
  try {
    assertLayerAllowed(
      { track: 'public', subject: 'public', token: null, maxLayer: 'summary' },
      'full'
    )
    throw new Error('O5 should block full')
  } catch (e) {
    assert(e instanceof McpBizError && e.reason === 'MCP_NOT_FOUND', 'O5 full → NOT_FOUND')
  }

  // O7：选择器默认 flag
  assert(cfg.public.memoSelector.mode === 'flag', 'O7 memo flag')
  assert(cfg.public.fileSelector.mode === 'flag', 'O7 file flag')
  evidence.O7 = {
    memo: cfg.public.memoSelector.mode,
    file: cfg.public.fileSelector.mode,
  }

  // O2：单实例进程内 LRU
  const store = new SegmentSessionStore({ ttlMs: 60_000, maxEntries: 3 })
  store.advance('s', 'memo', 'a', 'title')
  store.advance('s', 'memo', 'b', 'title')
  store.advance('s', 'memo', 'c', 'title')
  store.advance('s', 'memo', 'd', 'title')
  store.get('s', 'memo', 'd') // 触发 purge
  const aGone = store.get('s', 'memo', 'a').state === 'none'
  evidence.O2 = {
    kind: 'in-process-LRU',
    maxEntriesDefault: cfg.session.maxEntries,
    evictionOk: aGone,
  }
  assert(aGone, 'O2 LRU eviction')
  assert(cfg.session.maxEntries > 0, 'O2 maxEntries')

  // O1：文本可抽；二进制不可；PDF 尽力路径存在
  const txt = extractTextFromBuffer(Buffer.from('hello open-items', 'utf8'), 'a.txt', 'text/plain')
  assert(txt.extractable && txt.text?.includes('hello'), 'O1 txt')
  const bin = extractTextFromBuffer(Buffer.from([0, 1, 2, 3]), 'x.bin', 'application/octet-stream')
  assert(!bin.extractable && bin.reason, 'O1 bin not_extractable')
  const pdf = extractTextFromBuffer(
    Buffer.from('%PDF-1.4\nBT /F1 12 Tf (HelloPDF) Tj ET\n', 'latin1'),
    'a.pdf',
    'application/pdf'
  )
  evidence.O1 = {
    txt: true,
    binNot: true,
    pdfPath: pdf.extractable || Boolean(pdf.reason),
    pdfExtractable: pdf.extractable,
  }
  assert(evidence.O1.pdfPath, 'O1 pdf best-effort path')

  // O6：产品路径抛 MCP_NOT_FOUND；MCP_NOT_PUBLIC 仅别名码表
  try {
    assertPublicSelected('memo', { id: 'x', mcpPublic: false }, cfg.public.memoSelector)
    throw new Error('O6 should throw')
  } catch (e) {
    assert(e instanceof McpBizError && e.reason === 'MCP_NOT_FOUND', 'O6 NOT_FOUND')
  }
  assert(mcpError('MCP_NOT_PUBLIC').code === -32603, 'O6 alias code')
  evidence.O6 = { productThrows: 'MCP_NOT_FOUND', aliasKept: true }

  // O4：full 后 incomplete，不阻断后续 title
  const sess = new SegmentSessionStore({ ttlMs: 60_000, maxEntries: 100 })
  sess.advance('o4sub', 'memo', 'm1', 'title')
  sess.advance('o4sub', 'memo', 'm1', 'summary')
  sess.advance('o4sub', 'memo', 'm1', 'full')
  sess.markIncomplete('o4sub', 'memo', 'm1')
  assert(sess.get('o4sub', 'memo', 'm1').state === 'incomplete', 'O4 incomplete')
  sess.advance('o4sub', 'memo', 'm1', 'title')
  evidence.O4 = { incomplete: true, titleAfterIncomplete: true, nonblock: true }

  console.log('OPEN_ITEMS_O1_O7_PASS')
  console.log(JSON.stringify(evidence, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error('OPEN_ITEMS_O1_O7_FAIL', e)
  console.error(JSON.stringify(evidence, null, 2))
  process.exit(1)
})
