/**
 * B3 upload-guard
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import assert from 'node:assert/strict'
import {
  sanitizeUploadFilename,
  isAllowedUploadName,
  magicOk,
} from '../src/upload-guard.ts'

assert.equal(sanitizeUploadFilename('..\\..\\evil.exe'), 'evil.exe')
assert.equal(isAllowedUploadName('evil.exe'), false)
assert.equal(isAllowedUploadName('note.html'), false)
assert.equal(isAllowedUploadName('photo.png', 'image/png'), true)
assert.equal(magicOk(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]), 'a.png'), true)
assert.equal(magicOk(Buffer.from([0x00, 0x00, 0x00, 0x00]), 'a.png'), false)
assert.equal(magicOk(Buffer.from('%PDF-1.4'), 'a.pdf'), true)
console.log('server smoke: upload-guard ok')
