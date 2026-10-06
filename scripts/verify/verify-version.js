/**
 * 版本验证脚本
 * 验证所有文件中的版本号是否一致
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')

// 读取VERSION文件
const versionFile = path.join(rootDir, 'VERSION')
const expectedVersion = fs.readFileSync(versionFile, 'utf-8').trim()

console.log(`\n📋 验证版本号: ${expectedVersion}\n`)

let hasError = false

// 检查的文件列表
const filesToCheck = [
  {
    path: 'package.json',
    extract: (content) => JSON.parse(content).version,
  },
  {
    path: 'packages/app/package.json',
    extract: (content) => JSON.parse(content).version,
  },
  {
    path: 'packages/shared/package.json',
    extract: (content) => JSON.parse(content).version,
  },
  {
    path: 'packages/shared/src/config/version.ts',
    extract: (content) => {
      const match = content.match(/patch:\s*(\d+)/)
      if (match) {
        const patchMatch = content.match(/patch:\s*(\d+)/)
        const minorMatch = content.match(/minor:\s*(\d+)/)
        const majorMatch = content.match(/major:\s*(\d+)/)
        if (patchMatch && minorMatch && majorMatch) {
          return `${majorMatch[1]}.${minorMatch[1]}.${patchMatch[1]}`
        }
      }
      return null
    },
  },
  {
    path: 'README.md',
    extract: (content) => {
      const match = content.match(/\*\*版本\*\*:\s*(\d+\.\d+\.\d+)/)
      return match ? match[1] : null
    },
  },
]

// 检查每个文件
for (const file of filesToCheck) {
  const filePath = path.join(rootDir, file.path)

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const version = file.extract(content)

    if (version === expectedVersion) {
      console.log(`✅ ${file.path}: ${version}`)
    } else {
      console.log(`❌ ${file.path}: ${version} (期望: ${expectedVersion})`)
      hasError = true
    }
  } catch (error) {
    console.log(`⚠️  ${file.path}: 无法读取或解析`)
    hasError = true
  }
}

console.log('\n' + '='.repeat(50))

if (hasError) {
  console.log('❌ 版本验证失败！存在不一致的版本号。')
  process.exit(1)
} else {
  console.log('✅ 版本验证通过！所有文件版本号一致。')
  process.exit(0)
}
