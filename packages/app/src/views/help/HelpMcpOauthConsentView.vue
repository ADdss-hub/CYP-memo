<!--
  MCP OAuth 授权同意页（设计 10.1 · PKCE 交互主路径）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="oauth-consent-shell">
    <div class="oauth-card" role="dialog" aria-modal="true" aria-labelledby="oauth-title">
      <p class="eyebrow">MCP 授权</p>
      <h1 id="oauth-title" class="title">允许客户端访问？</h1>
      <p class="desc">
        以下客户端请求以你的账号使用 CYP-memo MCP 全功能（查询与已开启的写能力）。批准后将回跳并换发短期访问令牌；拒绝则取消授权。
      </p>

      <dl class="meta-list">
        <div class="meta-row">
          <dt>客户端</dt>
          <dd>
            <code>{{ clientId || '未知' }}</code>
          </dd>
        </div>
        <div class="meta-row">
          <dt>回调地址</dt>
          <dd>
            <code>{{ redirectUri || '未知' }}</code>
          </dd>
        </div>
        <div v-if="state" class="meta-row">
          <dt>state</dt>
          <dd>
            <code>{{ state }}</code>
          </dd>
        </div>
      </dl>

      <p v-if="errorMsg" class="error" role="alert">{{ errorMsg }}</p>

      <div class="actions">
        <Button type="danger" :disabled="busy" @click="deny">拒绝</Button>
        <Button type="primary" :disabled="busy || !canSubmit" @click="approve">批准</Button>
      </div>
      <p class="foot-hint">授权码 5 分钟内有效；个人令牌不会出现在回跳地址中。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { resolveApiBaseUrl, storageManager } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'

const route = useRoute()
const busy = ref(false)
const errorMsg = ref('')

const clientId = computed(() => String(route.query.client_id || ''))
const redirectUri = computed(() => String(route.query.redirect_uri || ''))
const challenge = computed(() => String(route.query.code_challenge || ''))
const method = computed(() => String(route.query.code_challenge_method || 'S256'))
const state = computed(() => String(route.query.state || ''))

const canSubmit = computed(
  () =>
    Boolean(clientId.value) &&
    Boolean(redirectUri.value) &&
    challenge.value.length >= 16 &&
    method.value === 'S256'
)

function apiBase(): string {
  return resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
}

function writeHeaders(token: string): Record<string, string> {
  const rid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': rid,
    'X-Request-Id': rid,
    'X-Trace-Id': rid,
  }
}

function failMessage(json: unknown, fallback: string): string {
  const msg =
    json && typeof json === 'object' && 'error' in json
      ? (json as { error?: { message?: string } }).error?.message
      : undefined
  return typeof msg === 'string' && msg.trim() ? msg.trim() : fallback
}

async function submitConsent(approveFlag: boolean) {
  if (busy.value) return
  if (!canSubmit.value) {
    errorMsg.value = '授权参数不完整或无效'
    return
  }
  busy.value = true
  errorMsg.value = ''
  try {
    const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
    const token = adapter.getAccessToken?.() || ''
    if (!token) {
      errorMsg.value = '请先登录后再授权'
      return
    }
    const res = await fetch(`${apiBase()}/mcp/oauth/consent`, {
      method: 'POST',
      headers: writeHeaders(token),
      body: JSON.stringify({
        approve: approveFlag,
        client_id: clientId.value,
        redirect_uri: redirectUri.value,
        code_challenge: challenge.value,
        code_challenge_method: method.value,
        state: state.value || undefined,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data?.redirect) {
      errorMsg.value = failMessage(json, approveFlag ? '批准失败' : '拒绝失败')
      return
    }
    window.location.assign(String(json.data.redirect))
  } catch {
    errorMsg.value = '网络异常，请重试'
  } finally {
    busy.value = false
  }
}

function approve() {
  void submitConsent(true)
}

function deny() {
  void submitConsent(false)
}
</script>

<style scoped>
.oauth-consent-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  padding-top: max(24px, env(safe-area-inset-top, 0px));
  padding-bottom: max(24px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  color: var(--cyp-text);
  background: transparent;
}

.oauth-card {
  width: 100%;
  max-width: 520px;
  padding: 22px 20px 18px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 12px;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--cyp-text-secondary);
}

.title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.desc {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cyp-text-muted);
}

.meta-list {
  margin: 16px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.meta-row dt {
  margin: 0;
  padding-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.meta-row dd {
  margin: 0;
  min-width: 0;
}

.meta-row code {
  display: block;
  font-family: var(--cyp-font-mono);
  font-size: 12px;
  word-break: break-all;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--cyp-bg-input);
  border: 1px solid var(--cyp-border);
  color: var(--cyp-text);
}

.error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--cyp-danger);
}

.actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.foot-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--cyp-text-muted);
}
</style>
