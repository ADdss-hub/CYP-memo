#!/bin/bash
# CYP-memo 开发环境启动脚本 (Linux/macOS)
# 对应 Windows 的 dev.bat

echo "🚀 启动 CYP-memo 开发环境..."
echo ""

echo "✅ 服务器端: http://localhost:5170"
echo "✅ 用户端应用: http://localhost:5173"
echo "✅ 管理员端应用: http://localhost:5174"
echo ""
echo "按 Ctrl+C 停止所有服务器"
echo ""

pnpm dev:all
