<!--
  开放协作门户（唯一产品入口 · tenant_monitor）
  对齐 5.6 开发者门户：目录、应用、订阅、配额、SLA 只读面。未登记不得宣称已开放。
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <OpsPageShell
      title="开放门户"
      desc="开放接口目录、应用、订阅、配额与开放面 SLA。本页在唯一产品入口内，不另开站点。未登记不得宣称已开放。"
      :error="loadError"
      :meta="metaLabel"
    >
      <el-alert
        type="info"
        :closable="false"
        title="本页不构成已开放声明。未登记不得宣称已开放。"
        style="margin-bottom: 16px"
      />

      <section class="ops-panel">
        <h2 class="ops-panel-title">接口目录</h2>
        <p class="ops-panel-lead">路径来自契约治理管控。就绪={{ readyLabel }}</p>
        <el-table :data="paths" stripe empty-text="目录为空" max-height="280" size="small">
          <el-table-column prop="path" label="路径" min-width="280" />
        </el-table>
      </section>

      <section class="ops-panel">
        <h2 class="ops-panel-title">应用</h2>
        <el-table :data="apps" stripe empty-text="无应用" max-height="240" size="small">
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column prop="owner" label="所有者" width="140" />
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column prop="id" label="标识" min-width="180" />
        </el-table>
      </section>

      <section class="ops-panel">
        <h2 class="ops-panel-title">订阅</h2>
        <el-table :data="subscriptions" stripe empty-text="无订阅" max-height="240" size="small">
          <el-table-column prop="appId" label="应用" min-width="160" />
          <el-table-column prop="apiPath" label="路径" min-width="200" />
          <el-table-column prop="status" label="状态" width="120" />
        </el-table>
      </section>

      <section class="ops-panel">
        <h2 class="ops-panel-title">配额与 SLA</h2>
        <el-table :data="quotas" stripe empty-text="无配额" max-height="200" size="small">
          <el-table-column prop="appId" label="应用" min-width="160" />
          <el-table-column prop="maxRpm" label="每分钟上限" width="120" />
          <el-table-column prop="maxDaily" label="每日上限" width="120" />
        </el-table>
        <el-table :data="slas" stripe empty-text="无 SLA" max-height="200" size="small">
          <el-table-column prop="apiPath" label="路径" min-width="200" />
          <el-table-column prop="availabilityTarget" label="可用目标" width="120" />
          <el-table-column prop="latencyP99Ms" label="时延目标毫秒" width="140" />
        </el-table>
      </section>
    </OpsPageShell>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { resolveApiBaseUrl } from '@cyp-memo/shared'
import { storageManager } from '@cyp-memo/shared'
import AppLayout from '../../components/AppLayout.vue'
import OpsPageShell from '../../components/OpsPageShell.vue'

interface OpenApp {
  id: string
  name: string
  owner: string
  status: string
}
interface OpenSub {
  appId: string
  apiPath: string
  status: string
}
interface OpenQuota {
  appId: string
  maxRpm: number
  maxDaily: number
}
interface OpenSla {
  apiPath: string
  availabilityTarget: number
  latencyP99Ms: number
}

const loadError = ref('')
const ready = ref(false)
const declaredOpen = ref(false)
const paths = ref<{ path: string }[]>([])
const apps = ref<OpenApp[]>([])
const subscriptions = ref<OpenSub[]>([])
const quotas = ref<OpenQuota[]>([])
const slas = ref<OpenSla[]>([])

const readyLabel = computed(() => (ready.value ? '是' : '否'))
const metaLabel = computed(() =>
  declaredOpen.value ? '错误：接口宣称已开放' : '未宣称已开放'
)

function authHeaders(): Record<string, string> {
  const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
  const token = adapter.getAccessToken?.()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function apiBase(): string {
  return resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
}

onMounted(async () => {
  try {
    const r = await fetch(`${apiBase()}/open-collab/catalog`, {
      headers: authHeaders(),
      credentials: 'include',
    })
    const json = (await r.json()) as {
      success?: boolean
      data?: {
        catalog?: { paths?: string[] }
        apps?: OpenApp[]
        subscriptions?: OpenSub[]
        quotas?: OpenQuota[]
        slas?: OpenSla[]
        ready?: boolean
        declaredOpen?: boolean
      }
    }
    if (!r.ok || !json?.data) {
      loadError.value = '无法读取开放目录'
      return
    }
    paths.value = (json.data.catalog?.paths || []).map((p) => ({ path: p }))
    apps.value = json.data.apps || []
    subscriptions.value = json.data.subscriptions || []
    quotas.value = json.data.quotas || []
    slas.value = json.data.slas || []
    ready.value = Boolean(json.data.ready)
    declaredOpen.value = json.data.declaredOpen === true
  } catch {
    loadError.value = '无法读取开放目录'
  }
})
</script>
