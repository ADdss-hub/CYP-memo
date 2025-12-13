<template>
  <el-container class="app-container">
    <!-- 侧边栏 -->
    <el-aside width="250px" class="app-aside">
      <div class="logo">
        <h1>CYP备忘录</h1>
      </div>
      <el-menu 
        :default-active="activeMenu" 
        class="app-menu"
        router
        @select="handleMenuSelect"
      >
        <el-menu-item index="/notes">
          <template #icon>
            <span class="menu-icon">📝</span>
          </template>
          <span>笔记管理</span>
        </el-menu-item>
        <el-menu-item index="/files">
          <template #icon>
            <span class="menu-icon">📁</span>
          </template>
          <span>文件管理</span>
        </el-menu-item>
        <el-menu-item index="/tags">
          <template #icon>
            <span class="menu-icon">🏷️</span>
          </template>
          <span>标签管理</span>
        </el-menu-item>
        <el-menu-item index="/webdav">
          <template #icon>
            <span class="menu-icon">🔗</span>
          </template>
          <span>WebDAV</span>
        </el-menu-item>
        <el-menu-item index="/user">
          <template #icon>
            <span class="menu-icon">👤</span>
          </template>
          <span>用户中心</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <template #icon>
            <span class="menu-icon">⚙️</span>
          </template>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
      <div class="version-info">
        <p>版本: v0.1.0</p>
        <p>作者: CYP</p>
      </div>
    </el-aside>
    
    <!-- 主内容区 -->
    <el-container>
      <!-- 顶部导航 -->
      <el-header class="app-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">{{ breadcrumbItems[0] }}</el-breadcrumb-item>
            <el-breadcrumb-item v-for="(item, index) in breadcrumbItems.slice(1)" :key="index">{{ item }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown>
            <span class="user-info">
              <el-avatar :size="32" src="https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png" />
              <span>用户名</span>
              <span class="menu-icon">▼</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>个人中心</el-dropdown-item>
                <el-dropdown-item>系统通知</el-dropdown-item>
                <el-dropdown-item divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <!-- 内容区域 -->
      <el-main class="app-main">
        <el-card shadow="hover" class="main-card">
          <template #header>
            <div class="card-header">
              <h2>{{ pageTitle }}</h2>
              <el-button type="primary">
                <span class="menu-icon">+</span>
                新建笔记
              </el-button>
            </div>
          </template>
          
          <!-- 笔记列表 -->
          <el-table :data="notes" style="width: 100%">
            <el-table-column prop="title" label="标题" min-width="200" />
            <el-table-column prop="created_at" label="创建时间" width="180" />
            <el-table-column prop="updated_at" label="更新时间" width="180" />
            <el-table-column prop="tags" label="标签" width="150">
              <template #default="scope">
                <el-tag 
                  v-for="tag in scope.row.tags" 
                  :key="tag.name" 
                  size="small" 
                  :type="tag.type">
                  {{ tag.name }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="scope">
                <el-button size="small" type="primary" @click="handleEdit(scope.row)">
                  <span class="menu-icon">✏️</span>
                  编辑
                </el-button>
                <el-button size="small" type="danger" @click="handleDelete(scope.row)">
                  <span class="menu-icon">🗑️</span>
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <!-- 分页 -->
          <div class="pagination">
            <el-pagination
              background
              layout="prev, pager, next"
              :total="100"
              :page-size="10"
              class="pagination"
            />
          </div>
        </el-card>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
// 简化图标使用，避免构建错误

// 响应式数据
const activeMenu = ref('/notes')
const pageTitle = ref('笔记管理')
const breadcrumbItems = ref(['笔记管理'])

// 模拟笔记数据
const notes = ref([
  {
    id: 1,
    title: '测试笔记1',
    content: '这是一个测试笔记',
    created_at: '2024-01-01 10:00:00',
    updated_at: '2024-01-01 10:00:00',
    tags: [
      { name: '工作', type: 'primary' },
      { name: '重要', type: 'danger' }
    ]
  },
  {
    id: 2,
    title: '测试笔记2',
    content: '这是另一个测试笔记',
    created_at: '2024-01-02 14:30:00',
    updated_at: '2024-01-02 14:30:00',
    tags: [
      { name: '学习', type: 'success' }
    ]
  },
  {
    id: 3,
    title: '测试笔记3',
    content: '这是第三个测试笔记',
    created_at: '2024-01-03 09:15:00',
    updated_at: '2024-01-03 09:15:00',
    tags: []
  }
])

// 菜单选择事件
const handleMenuSelect = (index, indexPath) => {
  console.log('菜单选择:', index)
  // 更新页面标题和面包屑
  switch (index) {
    case '/notes':
      pageTitle.value = '笔记管理'
      breadcrumbItems.value = ['笔记管理']
      break
    case '/files':
      pageTitle.value = '文件管理'
      breadcrumbItems.value = ['文件管理']
      break
    case '/tags':
      pageTitle.value = '标签管理'
      breadcrumbItems.value = ['标签管理']
      break
    case '/webdav':
      pageTitle.value = 'WebDAV'
      breadcrumbItems.value = ['WebDAV']
      break
    case '/user':
      pageTitle.value = '用户中心'
      breadcrumbItems.value = ['用户中心']
      break
    case '/settings':
      pageTitle.value = '系统设置'
      breadcrumbItems.value = ['系统设置']
      break
    default:
      pageTitle.value = '笔记管理'
      breadcrumbItems.value = ['笔记管理']
  }
}

// 编辑笔记
const handleEdit = (row) => {
  console.log('编辑笔记:', row)
}

// 删除笔记
const handleDelete = (row) => {
  console.log('删除笔记:', row)
}
</script>

<style scoped>
/* 容器样式 */
.app-container {
  width: 100%;
  height: 100vh;
  background: var(--background-color);
  color: var(--text-primary);
}

/* 侧边栏样式 */
.app-aside {
  background: var(--surface-color);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

/* Logo样式 */
.logo {
  padding: 1.5rem;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
}

.logo h1 {
  font-size: 1.5rem;
  margin: 0;
}

/* 菜单样式 */
.app-menu {
  flex: 1;
  border-right: none;
}

/* 版本信息 */
.version-info {
  padding: 1rem;
  text-align: center;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* 顶部导航样式 */
.app-header {
  background: var(--surface-color);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  height: 60px;
}

/* 面包屑样式 */
.header-left {
  display: flex;
  align-items: center;
}

/* 用户信息 */
.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  transition: all 0.3s ease;
}

.user-info:hover {
  background: rgba(59, 130, 246, 0.1);
}

/* 主内容区样式 */
.app-main {
  padding: 2rem;
  background: var(--background-color);
  overflow: auto;
}

/* 卡片样式 */
.main-card {
  background: var(--surface-color);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

/* 分页样式 */
.pagination {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .app-aside {
    width: 200px;
  }
  
  .app-main {
    padding: 1rem;
  }
  
  .app-header {
    padding: 0 1rem;
  }
  
  .logo h1 {
    font-size: 1.25rem;
  }
}
</style>
