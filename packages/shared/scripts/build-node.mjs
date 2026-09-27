/**
 * 把共享库打成单文件 ESM，供目标机 `node --conditions=cyp-node` 加载。
 * 第三方依赖（dexie、bcryptjs）保持外部，由目标平台安装，不打进本机路径。
 */
import * as esbuild from 'esbuild'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

await esbuild.build({
  entryPoints: [join(root, 'src/index.ts')],
  outfile: join(root, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  banner: {
    js: "import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)\n",
  },
})
