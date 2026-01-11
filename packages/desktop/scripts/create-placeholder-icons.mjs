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

// Create a minimal valid ICO file (16x16 blue square)
function createMinimalIco() {
  // ICO file header + 16x16 32bpp image
  const icoData = Buffer.from([
    // ICO header
    0x00, 0x00, // Reserved
    0x01, 0x00, // Type (1 = ICO)
    0x01, 0x00, // Number of images
    
    // Image directory entry
    0x10, // Width (16)
    0x10, // Height (16)
    0x00, // Color palette
    0x00, // Reserved
    0x01, 0x00, // Color planes
    0x20, 0x00, // Bits per pixel (32)
    0x68, 0x04, 0x00, 0x00, // Size of image data
    0x16, 0x00, 0x00, 0x00, // Offset to image data
    
    // BMP header
    0x28, 0x00, 0x00, 0x00, // Header size
    0x10, 0x00, 0x00, 0x00, // Width
    0x20, 0x00, 0x00, 0x00, // Height (doubled for ICO)
    0x01, 0x00, // Planes
    0x20, 0x00, // Bits per pixel
    0x00, 0x00, 0x00, 0x00, // Compression
    0x00, 0x04, 0x00, 0x00, // Image size
    0x00, 0x00, 0x00, 0x00, // X pixels per meter
    0x00, 0x00, 0x00, 0x00, // Y pixels per meter
    0x00, 0x00, 0x00, 0x00, // Colors used
    0x00, 0x00, 0x00, 0x00, // Important colors
  ])
  
  // Create 16x16 blue pixels (BGRA format, bottom-up)
  const pixels = Buffer.alloc(16 * 16 * 4)
  for (let i = 0; i < 16 * 16; i++) {
    pixels[i * 4 + 0] = 0xD9 // B
    pixels[i * 4 + 1] = 0x90 // G
    pixels[i * 4 + 2] = 0x4A // R
    pixels[i * 4 + 3] = 0xFF // A
  }
  
  // AND mask (all transparent)
  const mask = Buffer.alloc(16 * 16 / 8)
  
  return Buffer.concat([icoData, pixels, mask])
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
