#!/bin/bash
# CYP-memo 本机联调启动脚本（生产配置基准 · 唯一入口）(Linux/macOS)

echo "启动 CYP-memo 本机联调（生产配置基准 · 唯一入口）..."
echo ""

echo "[info] Product: https://<网卡IP>:5170"
echo "[info] MCP 协议入口: https://<网卡IP>:5170/mcp （旁路仅环回同启）"
echo "[info] 可选热重载: pnpm local:hmr（:5173，非产品入口）"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

pnpm local:all
