@echo off
chcp 65001 >nul
echo 🚀 启动 CYP-memo 本机联调（生产配置基准）...
echo.

echo ✅ 服务器端: http://localhost:5170
echo ✅ 用户端应用: http://localhost:5173
echo.
echo 按 Ctrl+C 停止所有服务器
echo.

pnpm local:all

pause
