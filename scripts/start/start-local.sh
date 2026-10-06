#!/usr/bin/env bash
# CYP-memo start-local · CI02 生产唯一基准（APP_ENV=prod）· 唯一产品入口 :5170
# 规范 2.2-禁3 / 2.5.4-4（F-02 端口占用须阻断启动）+ 2.4.1-2/3（F-03 度量独立计量、写盘失败退出非零）
set -euo pipefail

# 规范 2.4.1-2：冷启动用高精度墙钟（macOS date 不支持 %3N → 回退 python3/perl）
now_ms() {
  if v="$(date +%s%3N 2>/dev/null)" && [[ "$v" =~ ^[0-9]+$ ]]; then
    echo "$v"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(int(time.time()*1000))'
  elif command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes=time -e 'print int(time()*1000)'
  else
    echo "$(date +%s)000"
  fi
}
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export APP_ENV=prod
export NODE_ENV=production
echo "CI02: APP_ENV=prod NODE_ENV=production (production-only baseline)"

if ! command -v node >/dev/null 2>&1; then echo "Node.js not found"; exit 1; fi
if ! command -v pnpm >/dev/null 2>&1; then echo "pnpm not found"; exit 1; fi
if [[ ! -d node_modules ]]; then
  echo "node_modules missing. Run: pnpm install"
  exit 1
fi
mkdir -p logs
TIMEOUT="${CYP_START_TIMEOUT:-120}"

# 规范 2.2-禁3 / 2.5.4-4：端口占用须阻断启动，禁止覆盖使用（拉起前预检）
OWN_PID="$(cat logs/local-all.pid 2>/dev/null || true)"
PORTS_FAIL=0
for p in 5170 10170 13175 12000; do
  in_use=0
  pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -n "$pids" ]] && in_use=1
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp "sport = :$p" 2>/dev/null | grep -oE 'pid=[0-9]+' | sed 's/pid=//' | sort -u || true)"
    [[ -n "$pids" ]] && in_use=1
  else
    if (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null; then in_use=1; fi
  fi
  if [[ "$in_use" -eq 1 ]]; then
    detail=""
    for pid in $pids; do
      pname="$(ps -p "$pid" -o comm= 2>/dev/null || true)"
      detail="${detail}PID=$pid(${pname:-unknown}) "
    done
    if [[ -n "$OWN_PID" && " $pids " == *" $OWN_PID "* ]]; then
      echo "FATAL: port $p already in use by THIS project's previous run (PID $OWN_PID). Run stop-local first, then retry."
    else
      echo "FATAL: port $p already in use. Holder: ${detail:-unknown}. Free it (kill <pid>) or change the port before starting."
    fi
    PORTS_FAIL=1
  fi
done
if [[ "$PORTS_FAIL" -ne 0 ]]; then exit 1; fi

COLD_START_MS="$(now_ms)"
pnpm local:all >logs/local-all.out.log 2>logs/local-all.err.log &
echo $! >logs/local-all.pid
echo "Started PID $(cat logs/local-all.pid)"
HC_START_MS="$(now_ms)"
deadline=$((SECONDS + TIMEOUT))
while (( SECONDS < deadline )); do
  kms_ok=1
  if [[ -n "${KMS_AUTH_TOKEN:-}" ]]; then
    if ! curl -fsS "http://127.0.0.1:12000/kms/v1/health" 2>/dev/null | grep -q '"status":"ok"\|"status": "ok"'; then
      kms_ok=0
    fi
  fi
  if curl -k -fsS "https://127.0.0.1:5170/healthz/ready" | grep -q '"success":true\|"success": true' \
    && curl -k -fsS "https://127.0.0.1:5170/api/health" | grep -q '"success":true\|"success": true' \
    && curl -k -fsS "https://127.0.0.1:13175/healthz" | grep -q '"ok":true\|"ok": true' \
    && curl -k -fsS "https://127.0.0.1:5170/health/live" | grep -q '"status":"alive"\|"status": "alive"' \
    && [[ "$kms_ok" -eq 1 ]]; then
    if curl -k -fsS -o /dev/null "https://127.0.0.1:5170/"; then
      echo "Ready."

      # ========== CI03：一服务一端口 · 端口隔离验证 ==========
      CI03_PASS=0
      CI03_FAIL=0
      CI03_RESULTS=""

      ci03_add() {
        # $1: item, $2: detail, $3: ok (0=pass 1=fail)
        local marker
        if [[ "$2" == SKIP* ]]; then
          marker="  [SKIP]"
          CI03_PASS=$((CI03_PASS + 1))
        elif [[ "$3" -eq 0 ]]; then
          marker="  [PASS]"
          CI03_PASS=$((CI03_PASS + 1))
        else
          marker="  [FAIL]"
          CI03_FAIL=$((CI03_FAIL + 1))
        fi
        CI03_RESULTS="${CI03_RESULTS}${marker} $1
         $2
"
      }

      # 获取端口绑定地址列表（空格分隔）
      ci03_bind_addrs() {
        local port="$1"
        local addrs=""
        if command -v ss >/dev/null 2>&1; then
          addrs=$(ss -tlnp "sport = :$port" 2>/dev/null | awk 'NR>1 {split($4,a,":"); print a[1]}' | sed 's/\[//;s/\]//' | sort -u | tr '\n' ' ')
        elif command -v netstat >/dev/null 2>&1; then
          addrs=$(netstat -tlnp 2>/dev/null | awk -v p=":$port" '$4 ~ p"$" {split($4,a,":"); print a[1]}' | sed 's/\[//;s/\]//' | sort -u | tr '\n' ' ')
        fi
        echo "$addrs"
      }

      # 检查端口是否仅环回：返回 0=仅环回 1=有非环回绑定
      ci03_loopback_only() {
        local port="$1"
        local addrs
        addrs=$(ci03_bind_addrs "$port")
        if [[ -z "$addrs" ]]; then echo "no_listener"; return 1; fi
        local non_lb=""
        for a in $addrs; do
          case "$a" in
            127.0.0.1|::1|localhost) ;;
            0.0.0.0|::|[::]|\*) non_lb="${non_lb}${a} " ;;
            127.*) ;;
            *) non_lb="${non_lb}${a} " ;;
          esac
        done
        if [[ -n "$non_lb" ]]; then
          echo "non_loopback: ${non_lb% }"
          return 1
        fi
        echo "loopback_only: ${addrs% }"
        return 0
      }

      # 检查端口是否对外暴露：返回 0=对外暴露 1=仅环回
      ci03_has_external() {
        local port="$1"
        local addrs
        addrs=$(ci03_bind_addrs "$port")
        if [[ -z "$addrs" ]]; then echo "no_listener"; return 1; fi
        local has_ext=1
        for a in $addrs; do
          case "$a" in
            127.0.0.1|::1|localhost|127.*) ;;
            *) has_ext=0; break ;;
          esac
        done
        if [[ "$has_ext" -eq 0 ]]; then
          echo "externally_reachable: ${addrs% }"
          return 0
        fi
        echo "loopback_only: ${addrs% }"
        return 1
      }

      # 端口定义：port name layer segment seg_min seg_max is_external health_url health_check_type
      # 使用数组模拟
      CI03_PORTS=(
        "5170|产品统一网关|L3-外部接入|5000-5999|5000|5999|1|https://127.0.0.1:5170/healthz/ready|success"
        "10170|后端 API 服务|L2-业务层|10000-10999|10000|10999|0|https://127.0.0.1:10170/healthz/ready|success"
        "13175|MCP 旁路服务|L4-旁路层|13000-13999|13000|13999|0|https://127.0.0.1:13175/healthz|ok"
        "12000|KMS 密钥保险箱|L1-基础设施|12000-12999|12000|12999|0|http://127.0.0.1:12000/kms/v1/health|status"
      )

      KMS_ENABLED=0
      if [[ -n "${KMS_AUTH_TOKEN:-}" ]]; then KMS_ENABLED=1; fi

      echo ""
      echo "-- CI03-A 端口独立性验证 --"
      CI03_SEEN_PIDS=""
      for entry in "${CI03_PORTS[@]}"; do
        IFS='|' read -r port name layer seg seg_min seg_max is_ext hurl htype <<< "$entry"
        if [[ "$port" -eq 12000 && "$KMS_ENABLED" -eq 0 ]]; then
          ci03_add "CI03-A 端口独立性 · $port ($name)" "SKIP (KMS 未启用远程模式)" 0
          continue
        fi
        # 获取监听 PID
        pids=""
        if command -v ss >/dev/null 2>&1; then
          pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | sed 's/pid=//' | sort -u | tr '\n' ' ')
        elif command -v lsof >/dev/null 2>&1; then
          pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u | tr '\n' ' ')
        fi
        if [[ -z "$pids" ]]; then
          ci03_add "CI03-A 端口独立性 · $port ($name)" "FAIL (无监听器)" 1
          continue
        fi
        # 检查 PID 是否见过
        new_pid=0
        for pid in $pids; do
          if [[ " $CI03_SEEN_PIDS " != *" $pid "* ]]; then
            CI03_SEEN_PIDS="${CI03_SEEN_PIDS} ${pid}"
            new_pid=1
          fi
        done
        if [[ "$new_pid" -eq 1 ]]; then
          ci03_add "CI03-A 端口独立性 · $port ($name)" "PASS (独立进程: ${pids% })" 0
        else
          ci03_add "CI03-A 端口独立性 · $port ($name)" "WARN (PID 与其他端口共享: ${pids% })" 0
        fi
      done

      echo ""
      echo "-- CI03-B 端口段合规性验证 --"
      for entry in "${CI03_PORTS[@]}"; do
        IFS='|' read -r port name layer seg seg_min seg_max is_ext hurl htype <<< "$entry"
        if [[ "$port" -eq 12000 && "$KMS_ENABLED" -eq 0 ]]; then
          ci03_add "CI03-B 端口段合规 · $port ($name)" "SKIP (KMS 未启用远程模式)" 0
          continue
        fi
        if [[ "$port" -ge "$seg_min" && "$port" -le "$seg_max" ]]; then
          ci03_add "CI03-B 端口段合规 · $port ($name)" "PASS ($port ∈ $seg)" 0
        else
          ci03_add "CI03-B 端口段合规 · $port ($name)" "FAIL ($port 不在 $seg 段内)" 1
        fi
      done

      echo ""
      echo "-- CI03-C 隔离级别验证 --"
      for entry in "${CI03_PORTS[@]}"; do
        IFS='|' read -r port name layer seg seg_min seg_max is_ext hurl htype <<< "$entry"
        if [[ "$port" -eq 12000 && "$KMS_ENABLED" -eq 0 ]]; then
          ci03_add "CI03-C 隔离级别 · $port ($name · $layer)" "SKIP (KMS 未启用远程模式)" 0
          continue
        fi
        if [[ "$is_ext" -eq 1 ]]; then
          detail=$(ci03_has_external "$port")
          lb_ok=$?
          if [[ "$lb_ok" -eq 0 ]]; then
            ci03_add "CI03-C 隔离级别 · $port ($name · $layer)" "PASS ($detail)" 0
          else
            ci03_add "CI03-C 隔离级别 · $port ($name · $layer)" "FAIL (L3 网关应对外暴露，$detail)" 1
          fi
        else
          detail=$(ci03_loopback_only "$port")
          lb_ok=$?
          if [[ "$lb_ok" -eq 0 ]]; then
            ci03_add "CI03-C 隔离级别 · $port ($name · $layer)" "PASS ($detail)" 0
          else
            ci03_add "CI03-C 隔离级别 · $port ($name · $layer)" "FAIL (后端服务应仅环回，$detail)" 1
          fi
        fi
      done

      echo ""
      echo "-- CI03-D 服务独立健康检查 --"
      for entry in "${CI03_PORTS[@]}"; do
        IFS='|' read -r port name layer seg seg_min seg_max is_ext hurl htype <<< "$entry"
        if [[ "$port" -eq 12000 && "$KMS_ENABLED" -eq 0 ]]; then
          ci03_add "CI03-D 服务健康 · $port ($name)" "SKIP (KMS 未启用远程模式)" 0
          continue
        fi
        health_ok=1
        if [[ "$hurl" == https://* ]]; then
          resp=$(curl -k -fsS --max-time 3 "$hurl" 2>/dev/null || true)
        else
          resp=$(curl -fsS --max-time 3 "$hurl" 2>/dev/null || true)
        fi
        if [[ -n "$resp" ]]; then
          case "$htype" in
            success)
              if echo "$resp" | grep -q '"success"\s*:\s*true\|"success": true'; then health_ok=0; fi
              ;;
            ok)
              if echo "$resp" | grep -q '"ok"\s*:\s*true\|"ok": true'; then health_ok=0; fi
              ;;
            status)
              if echo "$resp" | grep -q '"status"\s*:\s*"ok"\|"status": "ok"'; then health_ok=0; fi
              ;;
          esac
        fi
        if [[ "$health_ok" -eq 0 ]]; then
          ci03_add "CI03-D 服务健康 · $port ($name)" "PASS ($hurl → 200)" 0
        else
          ci03_add "CI03-D 服务健康 · $port ($name)" "FAIL ($hurl → 健康检查未通过)" 1
        fi
      done

      # CI03 汇总输出
      echo ""
      echo "== CI03 端口隔离验证清单 =="
      echo -n "$CI03_RESULTS"
      echo ""
      echo "CI03 汇总: PASS=$CI03_PASS FAIL=$CI03_FAIL"

      if [[ "$CI03_FAIL" -gt 0 ]]; then
        echo "FATAL: CI03 端口隔离验证未通过。"
        exit 1
      fi
      echo "CI03 验证全部通过。"

      ADVERTISE_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
      if [[ -z "${ADVERTISE_IP}" ]]; then
        ADVERTISE_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
      fi
      if [[ -z "${ADVERTISE_IP}" ]]; then ADVERTISE_IP="127.0.0.1"; fi
      echo "  Product  : https://${ADVERTISE_IP}:5170 (产品统一网关 · 静态资源 + API代理 + MCP代理 · TLS)"
      echo "  Ready    : https://${ADVERTISE_IP}:5170/healthz/ready"
      echo "  Live     : https://${ADVERTISE_IP}:5170/health/live"
      echo "  Tenant   : https://${ADVERTISE_IP}:5170/tenant"
      echo "  API      : 127.0.0.1:10170 (后端 API 服务 · 仅环回 · 经网关代理)"
      echo "  MCP      : https://${ADVERTISE_IP}:5170/mcp (旁路环回同启 · 经产品入口)"
      echo "可选热重载（内部工具）: pnpm local:hmr → :5173"
      READY_MS="$(now_ms)"
      COLD_MS=$((READY_MS - COLD_START_MS))
      HC_MS=$((READY_MS - HC_START_MS))
      # 规范 2.4.1-2：超阈值仅 WARN 不阻断（连续 3 次才报警）
      if [[ "$COLD_MS" -gt 120000 ]]; then echo "WARN: cold_start_ms=$COLD_MS exceeds 120000ms (spec 2.4.1-2)."; fi
      if [[ "$HC_MS" -gt 10000 ]]; then echo "WARN: healthcheck_ms=$HC_MS exceeds 10000ms (spec 2.4.1-2)."; fi
      # 规范 2.4.1-3：写盘失败须退出非零（移除 || true）
      CYP_COLD_MS="$COLD_MS" CYP_HC_MS="$HC_MS" CYP_COMMIT="$(git rev-parse HEAD 2>/dev/null || true)" node --input-type=module -e "
        import fs from 'node:fs';
        import os from 'node:os';
        const cold = Number(process.env.CYP_COLD_MS || 0);
        const hc = Number(process.env.CYP_HC_MS || 0);
        const obj = {
          ts: new Date().toISOString(),
          host: os.hostname(),
          commit_sha: process.env.CYP_COMMIT || '',
          toolchain_versions: { node: process.version, os: os.type() + ' ' + os.release() },
          cold_start_ms: cold,
          warm_start_ms: 0,
          healthcheck_ms: hc,
          e2e_smoke_ms: 0,
          stages: { app_boot_ms: cold, ready_probe_ms: hc },
          result: 'success'
        };
        fs.writeFileSync('logs/start-time.json', JSON.stringify(obj, null, 2) + '\n');
      "
      exit 0
    fi
  fi
  sleep 2
done
echo "FAIL: services not ready in time (API :5170 and/or MCP :13175)"
exit 1
