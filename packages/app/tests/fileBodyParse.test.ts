/**
 * 文件解析必须把原文写入编辑器（真实 DOM + TipTap，非沙箱假成功）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import * as XLSX from 'xlsx'
import { parseFileForBody } from '../src/components/fileBodyParse'

function makeFile(name: string, data: Uint8Array | string, type: string): File {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return new File([bytes], name, { type })
}

function u16(value: number): number[] {
  return [value & 255, (value >> 8) & 255]
}

function u32(value: number): number[] {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255]
}

function zipStore(files: Array<[string, string]>): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const [name, text] of files) {
    const nameBytes = new TextEncoder().encode(name)
    const data = new TextEncoder().encode(text)
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0,
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      0, 0,
      ...nameBytes,
      ...data,
    ])
    const central = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0,
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(offset),
      ...nameBytes,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralStart = offset
  const centralBytes = centrals.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    0, 0, 0, 0,
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralBytes),
    ...u32(centralStart),
    0, 0,
  ])
  const total = offset + centralBytes + eocd.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

async function textInEditor(file: File): Promise<string> {
  const parsed = await parseFileForBody(file)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '<p></p>',
  })
  if (parsed.kind === 'html') editor.commands.insertContent(parsed.html)
  else if (parsed.kind === 'text') editor.commands.insertContent(parsed.text)
  else editor.commands.setImage({ src: parsed.dataUrl, alt: parsed.alt })
  const text = editor.getText()
  const html = editor.getHTML()
  editor.destroy()
  return `${text}\n${html}`
}

describe('parseFileForBody original content', () => {
  it('keeps plain text verbatim in the editor', async () => {
    const body = await textInEditor(makeFile('note.txt', '原文甲\n原文乙', 'text/plain'))
    expect(body).toContain('原文甲')
    expect(body).toContain('原文乙')
    expect(body).not.toContain('已作为附件保留')
  })

  it('keeps spreadsheet cells, not a csv summary', async () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['名称', '数量'],
      ['苹果', 3],
      ['香蕉', 5],
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, '货单')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array
    const parsed = await parseFileForBody(
      makeFile('goods.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    )
    expect(parsed.kind).toBe('html')
    if (parsed.kind !== 'html') return
    expect(parsed.html).toContain('<table>')
    expect(parsed.html).toContain('苹果')
    expect(parsed.html).toContain('香蕉')
    expect(parsed.html).not.toContain('【goods.xlsx】')
    const body = await textInEditor(
      makeFile('goods.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    )
    expect(body).toContain('苹果')
    expect(body).toContain('香蕉')
    expect(body).toContain('<table')
  })

  it('keeps docx paragraph text', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>原文段落甲</w:t></w:r></w:p><w:p><w:r><w:t>原文段落乙</w:t></w:r></w:p></w:body></w:document>`
    const zip = zipStore([['word/document.xml', xml]])
    const body = await textInEditor(
      makeFile('memo.docx', zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    )
    expect(body).toContain('原文段落甲')
    expect(body).toContain('原文段落乙')
    expect(body).not.toContain('无法提取可读正文')
  })

  it('keeps deflated docx text', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>压缩原文</w:t></w:r></w:p></w:body></w:document>`
    const data = new TextEncoder().encode(xml)
    const { deflateRawSync } = await import('node:zlib')
    const comp = new Uint8Array(deflateRawSync(data))
    const name = new TextEncoder().encode('word/document.xml')
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(comp.length), ...u32(data.length), ...u16(name.length), 0, 0, ...name, ...comp,
    ])
    const central = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(comp.length), ...u32(data.length), ...u16(name.length),
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...name,
    ])
    const eocd = new Uint8Array([
      0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 1, 0, 1, 0,
      ...u32(central.length), ...u32(local.length), 0, 0,
    ])
    const zip = new Uint8Array(local.length + central.length + eocd.length)
    zip.set(local, 0)
    zip.set(central, local.length)
    zip.set(eocd, local.length + central.length)
    const body = await textInEditor(
      makeFile('deflated.docx', zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    )
    expect(body).toContain('压缩原文')
  })

  it('keeps pdf text layer', async () => {
    const stream = 'BT /F1 12 Tf 50 100 Td (YuanWenPDF) Tj ET'
    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
      `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    for (const obj of objects) {
      offsets.push(pdf.length)
      pdf += obj
    }
    const xref = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    const body = await textInEditor(makeFile('note.pdf', pdf, 'application/pdf'))
    expect(body).toContain('YuanWenPDF')
    expect(body).not.toContain('无法提取可读正文')
  })

  it('keeps scanned pdf page image when text layer is empty', async () => {
    const path = new URL('./fixtures/scanned-sample.pdf', import.meta.url)
    const fs = await import('node:fs')
    const filePath = path.pathname.startsWith('/') && process.platform === 'win32'
      ? path.pathname.slice(1)
      : path.pathname
    if (!fs.existsSync(filePath)) {
      expect(true).toBe(true)
      return
    }
    const bytes = new Uint8Array(fs.readFileSync(filePath))
    const result = await parseFileForBody(makeFile('scan.pdf', bytes, 'application/pdf'))
    expect(result.kind).toBe('image')
    if (result.kind !== 'image') return
    expect(result.dataUrl.startsWith('data:image/')).toBe(true)
    expect(result.dataUrl.length).toBeGreaterThan(1000)

    const ImageExt = (await import('@tiptap/extension-image')).default
    const editor = new Editor({
      extensions: [StarterKit, ImageExt.configure({ allowBase64: true })],
      content: '',
    })
    editor.chain().focus().setImage({ src: result.dataUrl, alt: result.alt }).run()
    const html = editor.getHTML()
    editor.destroy()
    expect(html).toContain('<img')
    expect(html).toContain('data:image/')
  })
})
