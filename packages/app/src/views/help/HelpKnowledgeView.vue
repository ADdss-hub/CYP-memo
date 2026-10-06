<!--
  帮助中心 · 知识
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="help-knowledge-view">
      <header class="page-header">
        <div class="header-text">
          <p class="eyebrow">帮助中心</p>
          <h1 class="page-title">知识</h1>
          <p class="page-desc">产品内置说明，覆盖入门、备忘录、文件、分享、MCP 客户端配置与常见问题。</p>
        </div>
        <div class="header-search">
          <label class="sr-only" for="help-knowledge-q">搜索知识</label>
          <input
            id="help-knowledge-q"
            v-model="query"
            type="search"
            class="search-input"
            placeholder="搜索标题或正文..."
            autocomplete="off"
          />
        </div>
      </header>

      <div class="help-body">
        <nav class="article-nav" aria-label="知识目录">
          <button
            v-for="article in filteredArticles"
            :key="article.id"
            type="button"
            class="nav-item"
            :class="{ active: article.id === activeId }"
            @click="selectArticle(article.id)"
          >
            <span class="nav-title">{{ article.title }}</span>
            <span class="nav-summary">{{ article.summary }}</span>
          </button>
          <p v-if="filteredArticles.length === 0" class="nav-empty">没有匹配的条目</p>
        </nav>

        <article v-if="activeArticle" class="article-panel" :aria-labelledby="`help-art-${activeArticle.id}`">
          <h2 :id="`help-art-${activeArticle.id}`" class="article-title">{{ activeArticle.title }}</h2>
          <p class="article-summary">{{ activeArticle.summary }}</p>

          <div v-if="activeArticle.id === 'mcp-client'" class="live-endpoints" aria-label="前往独立 MCP 界面">
            <h3 class="live-title">独立 MCP 界面</h3>
            <p class="live-hint">
              令牌签发、端点复制与 Cursor 配置已迁至独立页。请打开侧栏「帮助中心」→「MCP」，或访问 /help/mcp。
            </p>
            <Button type="primary" @click="goMcpPage">打开 MCP 界面</Button>
          </div>

          <section
            v-for="(section, index) in activeArticle.sections"
            :key="index"
            class="article-section"
          >
            <h3 class="section-heading">
              <span class="section-num">{{ index + 1 }}</span>
              {{ section.heading }}
            </h3>
            <p class="section-body">{{ section.body }}</p>
            <ul v-if="section.bullets?.length" class="section-list">
              <li v-for="(item, i) in section.bullets" :key="i">{{ item }}</li>
            </ul>
            <div v-if="section.code" class="code-block">
              <div class="code-toolbar">
                <span class="code-label">{{ section.codeLabel || '配置样例' }}</span>
                <button type="button" class="copy-btn" @click="copyText(section.code!)">复制</button>
              </div>
              <pre class="code-pre"><code>{{ section.code }}</code></pre>
            </div>
          </section>
        </article>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../../components/AppLayout.vue'
import Button from '../../components/Button.vue'
import { useToast } from '../../composables/useToast'
import { HELP_KNOWLEDGE_ARTICLES } from '../../content/helpKnowledge'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const query = ref('')
const activeId = ref(HELP_KNOWLEDGE_ARTICLES[0]?.id || '')

const filteredArticles = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return HELP_KNOWLEDGE_ARTICLES
  return HELP_KNOWLEDGE_ARTICLES.filter((a) => {
    const hay = [
      a.title,
      a.summary,
      ...a.sections.flatMap((s) => [
        s.heading,
        s.body,
        s.code || '',
        s.codeLabel || '',
        ...(s.bullets || []),
      ]),
    ]
      .join('\n')
      .toLowerCase()
    return hay.includes(q)
  })
})

const activeArticle = computed(() => {
  const fromFilter = filteredArticles.value.find((a) => a.id === activeId.value)
  if (fromFilter) return fromFilter
  return filteredArticles.value[0] || null
})

function selectArticle(id: string) {
  activeId.value = id
  router.replace({ query: { ...route.query, article: id } })
}

function goMcpPage() {
  router.push('/help/mcp')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制')
  } catch {
    toast.error('复制失败，请手动选中')
  }
}

watch(
  () => route.query.article,
  (raw) => {
    const id = typeof raw === 'string' ? raw : ''
    if (id && HELP_KNOWLEDGE_ARTICLES.some((a) => a.id === id)) {
      activeId.value = id
    }
  },
  { immediate: true }
)

watch(filteredArticles, (list) => {
  if (!list.some((a) => a.id === activeId.value) && list[0]) {
    activeId.value = list[0].id
  }
})
</script>

<style scoped>
.help-knowledge-view {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  color: var(--cyp-text);
}

.help-knowledge-view *,
.help-knowledge-view *::before,
.help-knowledge-view *::after {
  box-sizing: border-box;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 14px 16px;
  background: var(--cyp-chrome-bg);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 10px;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--cyp-text-secondary);
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--cyp-text);
}

.page-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--cyp-text-muted);
  max-width: 42em;
}

.header-search {
  flex: 1 1 220px;
  max-width: 320px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: var(--cyp-brand);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.help-body {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
  gap: 12px;
}

.article-nav {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: var(--cyp-chrome-bg-soft);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 10px;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.nav-item:hover {
  background: rgba(0, 153, 255, 0.08);
  border-color: rgba(0, 153, 255, 0.2);
}

.nav-item.active {
  background: rgba(0, 153, 255, 0.12);
  border-color: rgba(0, 153, 255, 0.35);
}

.nav-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cyp-text);
}

.nav-summary {
  font-size: 12px;
  color: var(--cyp-text-muted);
  line-height: 1.4;
}

.nav-empty {
  margin: 12px 8px;
  font-size: 13px;
  color: var(--cyp-text-muted);
}

.article-panel {
  min-height: 0;
  overflow: auto;
  padding: 18px 20px 24px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 10px;
  box-shadow: var(--cyp-chrome-shadow), 0 8px 28px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.article-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
  color: var(--cyp-text);
}

.article-summary {
  margin: 0 0 18px;
  font-size: 14px;
  color: var(--cyp-text-secondary);
}

.article-section {
  margin-bottom: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--cyp-border);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--cyp-text);
}

.section-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  color: var(--cyp-brand);
  background: rgba(0, 153, 255, 0.12);
}

.section-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--cyp-text-secondary);
}

.section-list {
  margin: 8px 0 0;
  padding-left: 1.25em;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cyp-text-secondary);
}

.live-endpoints {
  margin: 0 0 18px;
  padding: 12px 14px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
}

.live-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cyp-text);
}

.live-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.live-row {
  display: grid;
  grid-template-columns: minmax(100px, 140px) minmax(0, 1fr);
  gap: 8px 12px;
  align-items: start;
}

.live-row dt {
  margin: 0;
  padding-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.live-row dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.live-row code,
.code-pre code {
  font-family: var(--cyp-font-mono);
  font-size: 12px;
  word-break: break-all;
  color: var(--cyp-text);
}

.live-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--cyp-text-muted);
  line-height: 1.5;
}

.code-block {
  margin-top: 10px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--cyp-bg-input);
}

.code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--cyp-border);
  background: var(--cyp-chrome-bg-soft);
}

.code-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.copy-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  background: var(--cyp-chrome-bg);
  color: var(--cyp-brand);
  font-size: 12px;
  cursor: pointer;
}

.copy-btn:hover {
  border-color: var(--cyp-brand);
  background: rgba(0, 153, 255, 0.08);
}

.code-pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  max-height: 360px;
  white-space: pre;
  line-height: 1.45;
}

@media (max-width: 860px) {
  .help-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(280px, 1fr);
  }

  .article-nav {
    max-height: 220px;
  }

  .header-search {
    max-width: none;
  }

  .live-row {
    grid-template-columns: 1fr;
  }
}
</style>
