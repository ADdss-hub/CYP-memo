<!--
  法律文案页（服务条款 / 隐私）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="legal-doc-view">
    <header class="legal-header">
      <button type="button" class="back-btn" @click="goBack">← 返回</button>
      <h1 class="legal-title">{{ title }}</h1>
      <p class="legal-subtitle">CYP-memo · v{{ VERSION.full }} · 生效 {{ LEGAL_EFFECTIVE_DATE }}</p>
    </header>

    <main class="legal-main">
      <article class="legal-article">
        <section v-for="(section, index) in sections" :key="index" class="legal-section">
          <h2 class="section-title">
            <span class="section-num">{{ index + 1 }}</span>
            {{ section.title }}
          </h2>
          <p v-if="section.content" class="section-body">{{ section.content }}</p>
          <ul v-if="section.list?.length" class="section-list">
            <li v-for="(item, i) in section.list" :key="i">{{ item }}</li>
          </ul>
        </section>

        <section class="legal-meta">
          <p>作者：{{ VERSION.author }}</p>
          <p>联系：{{ VERSION.email }}</p>
          <p>{{ VERSION.copyright }}</p>
        </section>
      </article>
    </main>

    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { VERSION } from '@shared/config/version'
import AppFooter from '../../components/AppFooter.vue'
import {
  TERMS_SECTIONS,
  PRIVACY_SECTIONS,
  LEGAL_EFFECTIVE_DATE,
  type LegalSection,
} from '../../content/legal'

const props = defineProps<{
  doc: 'terms' | 'privacy'
}>()

const router = useRouter()

const title = computed(() => (props.doc === 'terms' ? '服务条款' : '隐私政策'))

const sections = computed<LegalSection[]>(() =>
  props.doc === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS
)

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push('/memos')
}
</script>

<style scoped>
.legal-doc-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: transparent;
  color: var(--cyp-text, var(--cyp-text));
}

.legal-header {
  padding: 24px 20px 8px;
  text-align: center;
  border-bottom: 1px solid var(--cyp-chrome-border);
  background: var(--cyp-chrome-bg);
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.back-btn {
  display: inline-block;
  margin-bottom: 12px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--cyp-brand, var(--cyp-brand));
  cursor: pointer;
  font-size: 14px;
}

.legal-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 600;
}

.legal-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--cyp-text-muted, var(--cyp-text-muted));
}

.legal-main {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 20px 40px;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .legal-main {
    padding: 16px 12px 32px;
  }

  .legal-article {
    padding: 16px;
  }

  .legal-title {
    font-size: 20px;
  }
}

.legal-article {
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--cyp-chrome-shadow), 0 8px 28px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.legal-section + .legal-section {
  margin-top: 22px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
}

.section-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--cyp-brand, var(--cyp-brand));
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.section-body {
  margin: 0;
  line-height: 1.7;
  color: var(--cyp-text-secondary, var(--cyp-text-secondary));
  font-size: 14px;
}

.section-list {
  margin: 0;
  padding-left: 20px;
  color: var(--cyp-text-secondary, var(--cyp-text-secondary));
  font-size: 14px;
  line-height: 1.7;
}

.section-list li + li {
  margin-top: 6px;
}

.legal-meta {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--cyp-border);
  font-size: 12px;
  color: var(--cyp-text-muted, var(--cyp-text-muted));
  line-height: 1.6;
}

.legal-meta p {
  margin: 0;
}

</style>
