# CYP-memo 国内镜像一键配置脚本
# 适用于 Windows PowerShell

Write-Host "🚀 开始配置国内镜像源..." -ForegroundColor Cyan
Write-Host ""

# 检查命令是否存在
function Test-Command {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# 配置 NPM
Write-Host "📦 配置 NPM 镜像..." -ForegroundColor Blue
if (Test-Command npm) {
    npm config set registry https://registry.npmmirror.com
    Write-Host "✓ NPM 镜像配置完成" -ForegroundColor Green
} else {
    Write-Host "⚠ NPM 未安装，跳过" -ForegroundColor Yellow
}

# 配置 PNPM
Write-Host "📦 配置 PNPM 镜像..." -ForegroundColor Blue
if (Test-Command pnpm) {
    pnpm config set registry https://registry.npmmirror.com
    Write-Host "✓ PNPM 镜像配置完成" -ForegroundColor Green
} else {
    Write-Host "⚠ PNPM 未安装，跳过" -ForegroundColor Yellow
}

# 配置 Electron
Write-Host "⚡ 配置 Electron 镜像..." -ForegroundColor Blue
if (Test-Command npm) {
    npm config set electron_mirror https://npmmirror.com/mirrors/electron/
    npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
    Write-Host "✓ Electron 镜像配置完成" -ForegroundColor Green
}

# 配置原生模块
Write-Host "🔧 配置原生模块镜像..." -ForegroundColor Blue
if (Test-Command npm) {
    npm config set better_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/better-sqlite3/
    npm config set sharp_binary_host https://npmmirror.com/mirrors/sharp/
    npm config set sharp_libvips_binary_host https://npmmirror.com/mirrors/sharp-libvips/
    npm config set node_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/sqlite3/
    Write-Host "✓ 原生模块镜像配置完成" -ForegroundColor Green
}

# Docker 配置提示
Write-Host "🐳 Docker 镜像配置..." -ForegroundColor Blue
if (Test-Command docker) {
    Write-Host "⚠ 请在 Docker Desktop 中手动配置镜像" -ForegroundColor Yellow
    Write-Host "  设置 → Docker Engine → 添加 registry-mirrors" -ForegroundColor Gray
    Write-Host "  参考: .github\MIRROR_QUICK_REF.md" -ForegroundColor Gray
} else {
    Write-Host "⚠ Docker 未安装，跳过" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ 镜像配置完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📊 验证配置:" -ForegroundColor Cyan
Write-Host "  npm config get registry"
Write-Host "  pnpm config get registry"
Write-Host ""
Write-Host "📖 详细文档: docs\CHINA_MIRROR_CONFIG.md" -ForegroundColor Cyan
Write-Host "🔍 快速参考: docs\MIRROR_QUICK_REF.md" -ForegroundColor Cyan
