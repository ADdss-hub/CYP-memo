/**
 * Create placeholder icon files for CI builds
 * This creates minimal valid icon files to allow the build to proceed
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const resourcesDir = path.join(__dirname, '..', 'resources')

// Create a minimal valid ICO file (256x256 blue square)
function createMinimalIco() {
  const size = 256
  const bpp = 32
  const pixelDataSize = size * size * 4
  const maskSize = Math.ceil((size * size) / 8)
  const imageDataSize = 40 + pixelDataSize + maskSize // BMP header + pixels + mask
  
  // ICO file header
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type (1 = ICO)
  header.writeUInt16LE(1, 4) // Number of images
  
  // Image directory entry
  const dirEntry = Buffer.alloc(16)
  dirEntry.writeUInt8(0, 0) // Width (0 = 256)
  dirEntry.writeUInt8(0, 1) // Height (0 = 256)
  dirEntry.writeUInt8(0, 2) // Color palette
  dirEntry.writeUInt8(0, 3) // Reserved
  dirEntry.writeUInt16LE(1, 4) // Color planes
  dirEntry.writeUInt16LE(bpp, 6) // Bits per pixel
  dirEntry.writeUInt32LE(imageDataSize, 8) // Size of image data
  dirEntry.writeUInt32LE(22, 12) // Offset to image data (6 + 16)
  
  // BMP header (BITMAPINFOHEADER)
  const bmpHeader = Buffer.alloc(40)
  bmpHeader.writeUInt32LE(40, 0) // Header size
  bmpHeader.writeInt32LE(size, 4) // Width
  bmpHeader.writeInt32LE(size * 2, 8) // Height (doubled for ICO)
  bmpHeader.writeUInt16LE(1, 12) // Planes
  bmpHeader.writeUInt16LE(bpp, 14) // Bits per pixel
  bmpHeader.writeUInt32LE(0, 16) // Compression (BI_RGB)
  bmpHeader.writeUInt32LE(pixelDataSize, 20) // Image size
  bmpHeader.writeInt32LE(0, 24) // X pixels per meter
  bmpHeader.writeInt32LE(0, 28) // Y pixels per meter
  bmpHeader.writeUInt32LE(0, 32) // Colors used
  bmpHeader.writeUInt32LE(0, 36) // Important colors
  
  // Create 256x256 blue pixels (BGRA format, bottom-up)
  const pixels = Buffer.alloc(pixelDataSize)
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = 0xD9 // B
    pixels[i * 4 + 1] = 0x90 // G
    pixels[i * 4 + 2] = 0x4A // R
    pixels[i * 4 + 3] = 0xFF // A
  }
  
  // AND mask (all opaque)
  const mask = Buffer.alloc(maskSize, 0x00)
  
  return Buffer.concat([header, dirEntry, bmpHeader, pixels, mask])
}

// Create a minimal valid ICNS file
function createMinimalIcns() {
  // Minimal ICNS with just the header
  // In practice, this won't work for macOS, but it satisfies the file existence check
  const header = Buffer.from([
    0x69, 0x63, 0x6E, 0x73, // 'icns' magic
    0x00, 0x00, 0x00, 0x08, // File size (8 bytes - just header)
  ])
  
  return header
}

console.log('Creating placeholder icon files...')

// Create resources directory if it doesn't exist
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true })
}

// Create icon.ico
const icoPath = path.join(resourcesDir, 'icon.ico')
fs.writeFileSync(icoPath, createMinimalIco())
console.log(`Created: ${icoPath}`)

// Create icon.icns
const icnsPath = path.join(resourcesDir, 'icon.icns')
fs.writeFileSync(icnsPath, createMinimalIcns())
console.log(`Created: ${icnsPath}`)

// Create icons directory for Linux
const iconsDir = path.join(resourcesDir, 'icons')
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// Create a simple PNG placeholder (1x1 blue pixel)
const simplePng = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
  0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
  0x08, 0xD7, 0x63, 0x60, 0xA0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
  0xE2, 0x21, 0xBC, 0x33,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
  0xAE, 0x42, 0x60, 0x82
])

const iconPngPath = path.join(resourcesDir, 'icon.png')
fs.writeFileSync(iconPngPath, simplePng)
console.log(`Created: ${iconPngPath}`)

console.log('\nPlaceholder icons created successfully!')
console.log('Note: These are minimal placeholders for CI builds.')
console.log('For production, replace with proper icons using generate-icons.js')
