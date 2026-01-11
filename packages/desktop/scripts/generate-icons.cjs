/**
 * 图标生成脚本
 * 
 * 从源图片生成各平台所需的图标文件
 * 
 * 使用方法:
 * 1. 准备一个 1024x1024 的 PNG 源图片
 * 2. 将其放置在 resources/icon-source.png
 * 3. 运行: node scripts/generate-icons.cjs
 * 
 * 依赖:
 * - sharp: npm install sharp --save-dev
 * - png2icons: npm install png2icons --save-dev (可选，用于生成 .ico 和 .icns)
 */

const fs = require('fs')
const path = require('path')

// 检查是否安装了 sharp
let sharp
try {
  sharp = require('sharp')
} catch (e) {
  console.log('sharp not installed. Install it with: npm install sharp --save-dev')
  console.log('Then run this script again.')
  process.exit(1)
}

const resourcesDir = path.join(__dirname, '..', 'resources')
const iconsDir = path.join(resourcesDir, 'icons')
const sourceIcon = path.join(resourcesDir, 'icon-source.png')

// Linux 图标尺寸
const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

async function generateIcons() {
  // 检查源图片是否存在
  if (!fs.existsSync(sourceIcon)) {
    console.log(`Source icon not found: ${sourceIcon}`)
    console.log('Please create a 1024x1024 PNG image at resources/icon-source.png')
    
    // 创建一个占位符图标
    console.log('Creating placeholder icons...')
    await createPlaceholderIcons()
    return
  }

  // 创建 icons 目录
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true })
  }

  console.log('Generating icons from source...')

  // 生成 Linux 图标
  for (const size of linuxSizes) {
    const outputPath = path.join(iconsDir, `${size}x${size}.png`)
    await sharp(sourceIcon)
      .resize(size, size)
      .png()
      .toFile(outputPath)
    console.log(`Generated: ${size}x${size}.png`)
  }

  // 复制 256x256 作为主图标
  const icon256 = path.join(iconsDir, '256x256.png')
  if (fs.existsSync(icon256)) {
    fs.copyFileSync(icon256, path.join(resourcesDir, 'icon.png'))
    console.log('Generated: icon.png')
  }

  console.log('')
  console.log('PNG icons generated successfully!')
  console.log('')
  console.log('To generate .ico and .icns files, you can use:')
  console.log('- Online tools like https://icoconvert.com/')
  console.log('- Or install png2icons: npm install png2icons --save-dev')
  console.log('')
  console.log('Required files:')
  console.log('- resources/icon.ico (Windows)')
  console.log('- resources/icon.icns (macOS)')
}

async function createPlaceholderIcons() {
  // 创建 icons 目录
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true })
  }

  // 创建一个简单的占位符图标（蓝色方块带 M 字母）
  const svg = `
    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" rx="128" fill="#4A90D9"/>
      <text x="512" y="700" font-family="Arial, sans-serif" font-size="600" font-weight="bold" fill="white" text-anchor="middle">M</text>
    </svg>
  `

  // 生成各尺寸图标
  for (const size of linuxSizes) {
    const outputPath = path.join(iconsDir, `${size}x${size}.png`)
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outputPath)
    console.log(`Generated placeholder: ${size}x${size}.png`)
  }

  // 生成主图标
  await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toFile(path.join(resourcesDir, 'icon.png'))
  console.log('Generated placeholder: icon.png')

  console.log('')
  console.log('Placeholder icons created!')
  console.log('Replace resources/icon-source.png with your actual icon and run this script again.')
}

generateIcons().catch(console.error)
