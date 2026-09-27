<!--
  账号管理界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <template #sidebar>
      <el-menu :default-active="activeMenu" class="sidebar-menu">
        <el-menu-item index="create" @click="scrollToSection('create')">
          <el-icon><Plus /></el-icon>
          <span>创建子账号</span>
        </el-menu-item>
        <el-menu-item index="accounts" @click="scrollToSection('accounts')">
          <el-icon><UserIcon /></el-icon>
          <span>子账号列表</span>
        </el-menu-item>
      </el-menu>
    </template>

    <div class="accounts-view">
      <div class="page-header">
        <Button type="text" @click="handleBack">
          <span class="back-icon">←</span> 返回
        </Button>
        <h1 class="page-title">子用户管理</h1>
      </div>

      <!-- 主账号信息 -->
      <section class="account-section">
        <h2 class="section-title">主账号信息</h2>
        <el-card shadow="hover">
          <div class="main-account-info">
            <div class="account-avatar">
              <el-icon :size="48">
                <UserFilled />
              </el-icon>
            </div>
            <div class="account-details">
              <div class="account-name">
                {{ authStore.username }}
              </div>
              <div class="account-type">主账号</div>
              <div class="account-meta">
                <span>创建时间: {{ formatDate(authStore.currentUser?.createdAt) }}</span>
                <span>最后登录: {{ formatDate(authStore.currentUser?.lastLoginAt) }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </section>

      <!-- 创建子账号 -->
      <section id="create" class="account-section">
        <h2 class="section-title">创建子账号</h2>
        <el-card shadow="hover">
          <el-form
            ref="createFormRef"
            :model="createForm"
            :rules="createRules"
            label-width="100px"
            @submit.prevent="handleCreate"
          >
            <el-form-item label="用户名" prop="username">
              <el-input 
                id="create-username"
                v-model="createForm.username" 
                placeholder="请输入用户名" 
                clearable 
              />
            </el-form-item>

            <el-form-item label="密码" prop="password">
              <el-input
                id="create-password"
                v-model="createForm.password"
                type="password"
                placeholder="至少 8 位，包含字母和数字"
                show-password
                clearable
              />
            </el-form-item>

            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input
                id="create-confirm-password"
                v-model="createForm.confirmPassword"
                type="password"
                placeholder="请再次输入密码"
                show-password
                clearable
              />
            </el-form-item>

            <el-form-item label="权限设置" prop="permissions">
              <el-checkbox-group v-model="createForm.permissions" class="perm-grid">
                <el-checkbox
                  v-for="item in permissionItems"
                  :key="item.permission"
                  :value="item.permission"
                  :disabled="item.permission === Permission.PROFILE_SELF"
                >
                  {{ PERMISSION_LABELS[item.permission] }}
                  <span v-if="item.hint" class="perm-tag">{{ item.hint }}</span>
                </el-checkbox>
              </el-checkbox-group>
              <p class="form-tip">与侧栏入口一一对应；不可分配「子用户管理」。</p>
            </el-form-item>

            <el-form-item>
              <el-button 
                type="primary" 
                :loading="isCreating" 
                :disabled="isCreating"
                @click="handleCreate"
              >
                {{ isCreating ? '创建中...' : '创建子账号' }}
              </el-button>
              <el-button :disabled="isCreating" @click="resetCreateForm"> 重置 </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </section>

      <!-- 子账号列表 -->
      <section id="accounts" class="account-section">
        <h2 class="section-title">子账号列表 ({{ subAccounts.length }})</h2>

        <el-card v-if="subAccounts.length > 0" shadow="hover">
          <el-table :data="subAccounts" style="width: 100%">
            <el-table-column prop="username" label="用户名" min-width="150" />
            <el-table-column label="权限" min-width="220">
              <template #default="{ row }">
                <el-tag
                  v-for="permission in visiblePermissions(row.permissions)"
                  :key="permission"
                  size="small"
                  style="margin-right: 4px; margin-bottom: 4px"
                >
                  {{ getPermissionLabel(permission) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" min-width="150">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="最后登录" min-width="150">
              <template #default="{ row }">
                {{ formatDate(row.lastLoginAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="openPermissionDialog(row)">
                  设置权限
                </el-button>
                <el-button type="danger" size="small" @click="confirmDelete(row)"> 删除 </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-empty v-else description="暂无子账号" />
      </section>
    </div>

    <!-- 权限设置对话框 -->
    <el-dialog v-model="permissionDialogVisible" title="设置权限" width="640px">
      <el-form label-width="88px">
        <el-form-item label="用户名">
          <span>{{ selectedAccount?.username }}</span>
        </el-form-item>
        <el-form-item label="权限设置">
          <el-checkbox-group v-model="permissionForm.permissions" class="perm-grid">
            <el-checkbox
              v-for="item in permissionItems"
              :key="'dlg-' + item.permission"
              :value="item.permission"
              :disabled="item.permission === Permission.PROFILE_SELF"
            >
              {{ PERMISSION_LABELS[item.permission] }}
              <span v-if="item.hint" class="perm-tag">{{ item.hint }}</span>
            </el-checkbox>
          </el-checkbox-group>
          <p class="form-tip">保存后按侧栏入口生效；可单独收回。</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="permissionDialogVisible = false"> 取消 </el-button>
        <el-button type="primary" :loading="isUpdatingPermission" @click="handleUpdatePermission">
          保存
        </el-button>
      </template>
    </el-dialog>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { authManager, Permission, PERMISSION_LABELS, ASSIGNABLE_PERMISSION_ITEMS, normalizeMemberPermissions } from '@cyp-memo/shared'
import type { User } from '@cyp-memo/shared'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppLayout from '../components/AppLayout.vue'
import Button from '../components/Button.vue'
import { User as UserIcon, Plus, UserFilled } from '@element-plus/icons-vue'

const router = useRouter()
const authStore = useAuthStore()
const activeMenu = ref('create')

/** 扁平：一入口一权（不含子用户管理） */
const permissionItems = ASSIGNABLE_PERMISSION_ITEMS

const defaultMemberPermissions = (): Permission[] =>
  normalizeMemberPermissions([Permission.MEMO_MANAGE, Permission.PROFILE_SELF])

// 子账号列表
const subAccounts = ref<User[]>([])

// 创建表单
const createFormRef = ref<FormInstance>()
const createForm = ref({
  username: '',
  password: '',
  confirmPassword: '',
  permissions: defaultMemberPermissions(),
})
const isCreating = ref(false)

// 权限对话框
const permissionDialogVisible = ref(false)
const selectedAccount = ref<User | null>(null)
const permissionForm = ref({
  permissions: [] as Permission[],
})
const isUpdatingPermission = ref(false)

// 表单验证规则
const createRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度在 2 到 20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
    {
      pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
      message: '密码必须包含字母和数字',
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (!value) {
          callback(new Error('请再次输入密码'))
        } else if (value !== createForm.value.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  permissions: [
    {
      type: 'array',
      required: true,
      message: '请至少选择一个权限',
      trigger: 'change',
    },
  ],
}

/**
 * 加载子账号列表
 */
async function loadSubAccounts() {
  if (!authStore.currentUser) {
    console.warn('loadSubAccounts: 用户未登录')
    return
  }

  try {
    console.log('开始加载子账号列表...')
    subAccounts.value = await authManager.getSubAccounts(authStore.currentUser.id)
    console.log(`成功加载 ${subAccounts.value.length} 个子账号`)
  } catch (error) {
    console.error('加载子账号列表失败:', error)
    ElMessage.error('加载子账号列表失败: ' + (error instanceof Error ? error.message : '未知错误'))
  }
}

/**
 * 创建子账号
 */
async function handleCreate() {
  // 防止重复提交
  if (isCreating.value) {
    console.warn('正在创建子账号，请勿重复提交')
    return
  }

  if (!createFormRef.value) {
    ElMessage.error('表单未初始化')
    return
  }

  // 验证表单
  try {
    await createFormRef.value.validate()
  } catch (error) {
    console.warn('表单验证失败:', error)
    return
  }

  if (!authStore.currentUser) {
    ElMessage.error('用户未登录')
    return
  }

  // 设置加载状态
  isCreating.value = true

  try {
    console.log('开始创建子账号:', createForm.value.username)
    
    await authManager.createSubAccount(
      authStore.currentUser.id,
      createForm.value.username,
      createForm.value.password,
      normalizeMemberPermissions(createForm.value.permissions)
    )

    console.log('子账号创建成功')
    ElMessage.success('子账号创建成功')
    
    // 重置表单
    resetCreateForm()
    
    // 重新加载子账号列表
    await loadSubAccounts()
  } catch (error) {
    console.error('创建子账号失败:', error)
    const errorMessage = error instanceof Error ? error.message : '创建子账号失败'
    ElMessage.error(errorMessage)
  } finally {
    // 确保无论成功还是失败都重置加载状态
    isCreating.value = false
    console.log('创建子账号流程结束，isCreating已重置为false')
  }
}

/**
 * 重置创建表单
 */
function resetCreateForm() {
  createFormRef.value?.resetFields()
  createForm.value = {
    username: '',
    password: '',
    confirmPassword: '',
    permissions: defaultMemberPermissions(),
  }
}

/**
 * 打开权限设置对话框
 */
function openPermissionDialog(account: User) {
  selectedAccount.value = account
  permissionForm.value.permissions = normalizeMemberPermissions(account.permissions || [])
  permissionDialogVisible.value = true
}

/**
 * 更新子账号权限
 */
async function handleUpdatePermission() {
  if (!authStore.currentUser || !selectedAccount.value) return

  if (permissionForm.value.permissions.length === 0) {
    ElMessage.warning('请至少选择一个权限')
    return
  }

  isUpdatingPermission.value = true

  try {
    await authManager.updateSubAccountPermissions(
      authStore.currentUser.id,
      selectedAccount.value.id,
      normalizeMemberPermissions(permissionForm.value.permissions)
    )

    ElMessage.success('权限更新成功')
    permissionDialogVisible.value = false
    await loadSubAccounts()
  } catch (error) {
    console.error('更新权限失败:', error)
    ElMessage.error(error instanceof Error ? error.message : '更新权限失败')
  } finally {
    isUpdatingPermission.value = false
  }
}

/**
 * 确认删除子账号
 */
async function confirmDelete(account: User) {
  try {
    await ElMessageBox.confirm(
      `确定要删除子账号 "${account.username}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )

    await handleDelete(account)
  } catch {
    // 用户取消删除
  }
}

/**
 * 删除子账号
 */
async function handleDelete(account: User) {
  if (!authStore.currentUser) return

  try {
    await authManager.deleteSubAccount(authStore.currentUser.id, account.id)
    ElMessage.success('子账号删除成功')
    await loadSubAccounts()
  } catch (error) {
    console.error('删除子账号失败:', error)
    ElMessage.error(error instanceof Error ? error.message : '删除子账号失败')
  }
}

function visiblePermissions(permissions: readonly string[] | undefined): string[] {
  return (permissions || []).filter(
    (p) => p !== Permission.TENANT_USERS && p !== Permission.ACCOUNT_MANAGE
  )
}

/**
 * 获取权限标签
 */
function getPermissionLabel(permission: Permission | string): string {
  return PERMISSION_LABELS[permission as Permission] || String(permission)
}

/**
 * 格式化日期
 */
function formatDate(date: Date | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 滚动到指定区域
 */
function scrollToSection(section: string) {
  activeMenu.value = section
  const element = document.getElementById(section)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/**
 * 返回上一页
 */
function handleBack() {
  router.back()
}

onMounted(() => {
  // 检查权限
  if (!authStore.isMainAccount) {
    ElMessage.error('权限不足，只有主账号可以访问账号管理')
    return
  }

  loadSubAccounts()
})
</script>

<style scoped>
.accounts-view {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.back-icon {
  font-size: 20px;
  font-weight: bold;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0;
}

.account-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0 0 16px 0;
}

/* 主账号信息 */
.main-account-info {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px;
}

.account-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--cyp-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cyp-text);
  flex-shrink: 0;
}

.account-details {
  flex: 1;
}

.account-name {
  font-size: 24px;
  font-weight: 600;
  color: var(--cyp-text);
  margin-bottom: 8px;
}

.account-type {
  display: inline-block;
  padding: 4px 12px;
  background: var(--cyp-brand);
  color: var(--cyp-text);
  border-radius: 12px;
  font-size: 14px;
  margin-bottom: 12px;
}

.account-meta {
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: var(--cyp-text-muted);
}

/* 表单提示 */
.form-tip {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin-top: 8px;
}

/* 侧边栏菜单 */
.sidebar-menu {
  border-right: none;
}

.perm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 6px 12px;
  width: 100%;
}

.perm-grid :deep(.el-checkbox) {
  height: auto;
  margin-right: 0;
  white-space: nowrap;
}

.perm-tag {
  margin-left: 4px;
  font-size: 12px;
  color: var(--cyp-text-muted);
  font-weight: 400;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .page-title {
    font-size: 24px;
  }

  .main-account-info {
    flex-direction: column;
    text-align: center;
  }

  .account-meta {
    flex-direction: column;
    gap: 8px;
  }

  :deep(.el-table__fixed-right) {
    display: none;
  }

  :deep(.el-table__body-wrapper) {
    overflow-x: auto;
  }
}

</style>
