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

# 配置环境变量（Electron 和原生模块）
Write-Host "⚡ 配置 Electron 和原生模块镜像..." -ForegroundColor Blue
Write-Host "ℹ 设置用户环境变量..." -ForegroundColor Yellow

try {
    [System.Environment]::SetEnvironmentVariable('ELECTRON_MIRROR', 'https://npmmirror.com/mirrors/electron/', 'User')
    [System.Environment]::SetEnvironmentVariable('ELECTRON_BUILDER_BINARIES_MIRROR', 'https://npmmirror.com/mirrors/electron-builder-binaries/', 'User')
    [System.Environment]::SetEnvironmentVariable('BETTER_SQLITE3_BINARY_HOST_MIRROR', 'https://npmmirror.com/mirrors/better-sqlite3/', 'User')
    [System.Environment]::SetEnvironmentVariable('SHARP_BINARY_HOST', 'https://npmmirror.com/mirrors/sharp/', 'User')
    [System.Environment]::SetEnvironmentVariable('SHARP_LIBVIPS_BINARY_HOST', 'https://npmmirror.com/mirrors/sharp-libvips/', 'User')
    [System.Environment]::SetEnvironmentVariable('NODE_SQLITE3_BINARY_HOST_MIRROR', 'https://npmmirror.com/mirrors/sqlite3/', 'User')
    
    Write-Host "✓ 环境变量配置完成" -ForegroundColor Green
    Write-Host "  请重启终端以使环境变量生效" -ForegroundColor Yellow
} catch {
    Write-Host "⚠ 环境变量设置失败: $_" -ForegroundColor Red
    Write-Host "  请手动在系统设置中添加环境变量" -ForegroundColor Yellow
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
