<!--
  用户资料界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="profile-view">
      <div class="page-header">
        <Button type="text" @click="handleBack">
          <span class="back-icon">←</span> 返回
        </Button>
        <h1 class="page-title">个人资料</h1>
      </div>

      <!-- 用户信息卡片 -->
      <section class="profile-section">
        <el-card shadow="hover">
          <div class="profile-header">
            <div class="profile-avatar">
              <el-icon :size="64">
                <UserFilled />
              </el-icon>
            </div>
            <div class="profile-info">
              <h2 class="profile-name">{{ authStore.username }}</h2>
              <div class="profile-type">
                {{ authStore.isMainAccount ? '主账号' : '子账号' }}
              </div>
            </div>
          </div>
        </el-card>
      </section>

      <!-- 账号信息 -->
      <section class="profile-section">
        <h2 class="section-title">账号信息</h2>
        <el-card shadow="hover">
          <div class="info-item">
            <label class="info-label">用户名</label>
            <div class="info-value">{{ authStore.username }}</div>
          </div>

          <div class="info-item">
            <label class="info-label">账号类型</label>
            <div class="info-value">
              {{ authStore.isMainAccount ? '主账号' : '子账号' }}
            </div>
          </div>

          <div v-if="authStore.currentUser?.createdAt" class="info-item">
            <label class="info-label">创建时间</label>
            <div class="info-value">{{ formatDate(authStore.currentUser.createdAt) }}</div>
          </div>

          <div v-if="authStore.currentUser?.lastLoginAt" class="info-item">
            <label class="info-label">最后登录</label>
            <div class="info-value">{{ formatDate(authStore.currentUser.lastLoginAt) }}</div>
          </div>

          <div v-if="authStore.currentUser?.token" class="info-item">
            <label class="info-label">个人令牌</label>
            <div class="info-control">
              <input
                type="text"
                :value="showToken ? authStore.currentUser.token : '••••••••••••••••'"
                readonly
                class="token-input"
              />
              <Button size="small" type="secondary" @click="toggleTokenVisibility">
                {{ showToken ? '隐藏' : '显示' }}
              </Button>
              <Button size="small" type="primary" @click="copyToken"> 复制 </Button>
            </div>
          </div>
        </el-card>
      </section>

      <!-- 权限信息 -->
      <section class="profile-section">
        <h2 class="section-title">权限信息</h2>
        <el-card shadow="hover">
          <div class="permissions-grid">
            <div
              v-for="permission in authStore.permissions"
              :key="permission"
              class="permission-item"
            >
              <el-icon class="permission-icon" color="#67c23a">
                <Check />
              </el-icon>
              <span>{{ getPermissionLabel(permission) }}</span>
            </div>
          </div>
          <el-empty v-if="authStore.permissions.length === 0" description="暂无权限" />
        </el-card>
      </section>

      <!-- 个人资料详情 -->
      <section class="profile-section">
        <h2 class="section-title">个人资料详情</h2>
        <el-card shadow="hover">
          <div class="info-item">
            <label class="info-label">性别</label>
            <div class="info-value">
              {{ authStore.currentUser?.gender || '未设置' }}
            </div>
          </div>

          <div class="info-item">
            <label class="info-label">邮箱</label>
            <div class="info-value">
              {{ authStore.currentUser?.email || '未设置' }}
            </div>
          </div>

          <div class="info-item">
            <label class="info-label">出生年月日</label>
            <div class="info-value">
              {{ authStore.currentUser?.birthDate ? formatDate(authStore.currentUser.birthDate) : '未设置' }}
            </div>
          </div>

          <div class="info-item">
            <label class="info-label">电话号码</label>
            <div class="info-value">
              {{ authStore.currentUser?.phone || '未设置' }}
            </div>
          </div>

          <div class="info-item">
            <label class="info-label">地址</label>
            <div class="info-value">
              {{ authStore.currentUser?.address || '未设置' }}
            </div>
          </div>

          <div class="info-item">
            <label class="info-label">职位</label>
            <div class="info-value">
              {{ authStore.currentUser?.position || '未设置' }}
            </div>
          </div>

          <div class="info-item">
            <label class="info-label">公司</label>
            <div class="info-value">
              {{ authStore.currentUser?.company || '未设置' }}
            </div>
          </div>

          <div class="info-item">
            <label class="info-label">个人简介</label>
            <div class="info-value">
              {{ authStore.currentUser?.bio || '未设置' }}
            </div>
          </div>

          <div class="info-actions">
            <Button type="primary" @click="showUpdateProfileDialog = true">
              编辑资料
            </Button>
          </div>
        </el-card>
      </section>

      <!-- 安全设置 -->
      <section class="profile-section">
        <h2 class="section-title">安全设置</h2>
        <el-card shadow="hover">
          <div class="info-item">
            <label class="info-label">安全问题</label>
            <div class="info-value">
              {{ authStore.currentUser?.securityQuestion?.question || '未设置' }}
            </div>
          </div>
          <div v-if="authStore.currentUser?.securityQuestion" class="info-item">
            <label class="info-label">答案状态</label>
            <div class="info-value">
              <el-tag type="success" size="small">已设置</el-tag>
            </div>
          </div>
          <div class="info-actions">
            <Button type="primary" @click="showUpdateSecurityDialog = true">
              {{ authStore.currentUser?.securityQuestion ? '更新安全问题' : '设置安全问题' }}
            </Button>
          </div>
        </el-card>
      </section>

      <!-- 账号安全 -->
      <section v-if="authStore.currentUser?.passwordHash" class="profile-section">
        <h2 class="section-title">账号安全</h2>
        <el-card shadow="hover">
          <div class="info-item">
            <label class="info-label">登录方式</label>
            <div class="info-value">
              {{ authStore.currentUser.passwordHash ? '账号密码' : '个人令牌' }}
            </div>
          </div>
          <div v-if="authStore.currentUser.passwordHash" class="info-item">
            <label class="info-label">密码</label>
            <div class="info-value">••••••••</div>
          </div>
          <div class="info-actions">
            <Button type="primary" @click="showChangePasswordDialog = true">
              修改密码
            </Button>
          </div>
        </el-card>
      </section>

      <!-- 账号统计 -->
      <section class="profile-section">
        <h2 class="section-title">账号统计</h2>
        <el-card shadow="hover">
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-label">账号状态</div>
              <div class="stat-value active">正常</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">权限数量</div>
              <div class="stat-value">{{ authStore.permissions.length }}</div>
            </div>
            <div v-if="authStore.isMainAccount" class="stat-item">
              <div class="stat-label">子账号数量</div>
              <div class="stat-value">{{ subAccountCount }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">使用天数</div>
              <div class="stat-value">{{ usageDays }}</div>
            </div>
          </div>
        </el-card>
      </section>

      <!-- 编辑资料对话框 -->
      <el-dialog v-model="showUpdateProfileDialog" title="编辑个人资料" width="500px">
        <el-form :model="profileForm" label-width="100px">
          <el-form-item label="性别">
            <el-select
              v-model="profileForm.gender"
              placeholder="请选择性别"
              style="width: 100%"
            >
              <el-option value="男" label="男" />
              <el-option value="女" label="女" />
              <el-option value="保密" label="保密" />
            </el-select>
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input
              id="profile-email"
              v-model="profileForm.email"
              type="email"
              placeholder="请输入邮箱地址"
              clearable
            />
          </el-form-item>
          <el-form-item label="出生年月日">
            <el-date-picker
              id="profile-birth-date"
              v-model="profileForm.birthDate"
              type="date"
              placeholder="请选择出生日期"
              style="width: 100%"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
          <el-form-item label="电话号码">
            <el-input
              id="profile-phone"
              v-model="profileForm.phone"
              placeholder="请输入电话号码"
              clearable
            />
          </el-form-item>
          <el-form-item label="地址">
            <el-input
              id="profile-address"
              v-model="profileForm.address"
              placeholder="请输入地址"
              clearable
            />
          </el-form-item>
          <el-form-item label="职位">
            <el-input
              id="profile-position"
              v-model="profileForm.position"
              placeholder="请输入职位"
              clearable
            />
          </el-form-item>
          <el-form-item label="公司">
            <el-input
              id="profile-company"
              v-model="profileForm.company"
              placeholder="请输入公司名称"
              clearable
            />
          </el-form-item>
          <el-form-item label="个人简介">
            <el-input
              id="profile-bio"
              v-model="profileForm.bio"
              type="textarea"
              placeholder="请输入个人简介"
              clearable
              :rows="3"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showUpdateProfileDialog = false"> 取消 </el-button>
          <el-button type="primary" :loading="isUpdatingProfile" @click="handleUpdateProfile">
            保存
          </el-button>
        </template>
      </el-dialog>

      <!-- 更新安全问题对话框 -->
      <el-dialog
        v-model="showUpdateSecurityDialog"
        :title="authStore.currentUser?.securityQuestion ? '更新安全问题' : '设置安全问题'"
        width="500px"
      >
        <el-form :model="securityForm" label-width="100px">
          <el-form-item label="安全问题">
            <el-select
              v-model="securityForm.question"
              placeholder="请选择安全问题"
              style="width: 100%"
            >
              <el-option value="您的出生地是？" label="您的出生地是？" />
              <el-option value="您母亲的姓名是？" label="您母亲的姓名是？" />
              <el-option value="您的小学名称是？" label="您的小学名称是？" />
              <el-option value="您最喜欢的颜色是？" label="您最喜欢的颜色是？" />
              <el-option value="您的宠物名字是？" label="您的宠物名字是？" />
            </el-select>
          </el-form-item>
          <el-form-item label="答案">
            <el-input
              id="security-answer"
              v-model="securityForm.answer"
              type="password"
              placeholder="请输入答案"
              show-password
              clearable
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showUpdateSecurityDialog = false"> 取消 </el-button>
          <el-button type="primary" :loading="isUpdating" @click="handleUpdateSecurity">
            确认{{ authStore.currentUser?.securityQuestion ? '更新' : '设置' }}
          </el-button>
        </template>
      </el-dialog>

      <!-- 修改密码对话框 -->
      <el-dialog v-model="showChangePasswordDialog" title="修改密码" width="500px">
        <el-form :model="passwordForm" label-width="100px">
          <el-form-item label="当前密码">
            <el-input
              id="password-current"
              v-model="passwordForm.currentPassword"
              type="password"
              placeholder="请输入当前密码"
              show-password
              clearable
            />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input
              id="password-new"
              v-model="passwordForm.newPassword"
              type="password"
              placeholder="至少 8 位，包含字母和数字"
              show-password
              clearable
            />
          </el-form-item>
          <el-form-item label="确认密码">
            <el-input
              id="password-confirm"
              v-model="passwordForm.confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
              show-password
              clearable
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showChangePasswordDialog = false"> 取消 </el-button>
          <el-button type="primary" :loading="isChangingPassword" @click="handleChangePassword">
            确认修改
          </el-button>
        </template>
      </el-dialog>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { Permission, hashPassword } from '@cyp-memo/shared'
import { ElMessage } from 'element-plus'
import AppLayout from '../components/AppLayout.vue'
import Button from '../components/Button.vue'
import { UserFilled, Check } from '@element-plus/icons-vue'

const router = useRouter()
const authStore = useAuthStore()

// 状态
const showToken = ref(false)
const showUpdateProfileDialog = ref(false)
const showUpdateSecurityDialog = ref(false)
const showChangePasswordDialog = ref(false)
const isUpdatingProfile = ref(false)
const isUpdating = ref(false)
const isChangingPassword = ref(false)
const subAccountCount = ref(0)
const usageDays = ref(0)

const profileForm = ref({
  gender: '',
  email: '',
  birthDate: '',
  phone: '',
  address: '',
  position: '',
  company: '',
  bio: '',
})

const securityForm = ref({
  question: '',
  answer: '',
})

const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

/**
 * 返回上一页
 */
function handleBack() {
  router.back()
}

/**
 * 切换令牌可见性
 */
function toggleTokenVisibility() {
  showToken.value = !showToken.value
}

/**
 * 复制令牌
 */
async function copyToken() {
  if (!authStore.currentUser?.token) {
    ElMessage.error('没有可复制的令牌')
    return
  }

  try {
    await navigator.clipboard.writeText(authStore.currentUser.token)
    ElMessage.success('令牌已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败，请手动复制')
  }
}

/**
 * 获取权限标签
 */
function getPermissionLabel(permission: Permission): string {
  const labels: Record<Permission, string> = {
    [Permission.MEMO_MANAGE]: '备忘录管理',
    [Permission.STATISTICS_VIEW]: '数据统计查看',
    [Permission.ATTACHMENT_MANAGE]: '附件管理',
    [Permission.SETTINGS_MANAGE]: '系统设置',
    [Permission.ACCOUNT_MANAGE]: '账号管理',
  }
  return labels[permission] || permission
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 更新个人资料
 */
async function handleUpdateProfile() {
  if (!authStore.currentUser) {
    ElMessage.error('用户未登录')
    return
  }

  isUpdatingProfile.value = true

  try {
    const { userDAO } = await import('@cyp-memo/shared')
    await userDAO.update(authStore.currentUser.id, {
      gender: profileForm.value.gender || undefined,
      email: profileForm.value.email || undefined,
      birthDate: profileForm.value.birthDate ? new Date(profileForm.value.birthDate) : undefined,
      phone: profileForm.value.phone || undefined,
      address: profileForm.value.address || undefined,
      position: profileForm.value.position || undefined,
      company: profileForm.value.company || undefined,
      bio: profileForm.value.bio || undefined,
    })

    // 重新获取用户信息以更新 store
    const updatedUser = await userDAO.getById(authStore.currentUser.id)
    if (updatedUser) {
      authStore.currentUser = updatedUser
    }

    ElMessage.success('个人资料已更新')
    showUpdateProfileDialog.value = false
  } catch (error) {
    console.error('更新个人资料失败:', error)
    ElMessage.error('更新个人资料失败')
  } finally {
    isUpdatingProfile.value = false
  }
}

/**
 * 更新安全问题
 */
async function handleUpdateSecurity() {
  if (!authStore.currentUser) {
    ElMessage.error('用户未登录')
    return
  }

  if (!securityForm.value.question || !securityForm.value.answer) {
    ElMessage.warning('请填写完整信息')
    return
  }

  isUpdating.value = true

  try {
    const answerHash = await hashPassword(securityForm.value.answer)

    // 调用 UserDAO 更新用户信息
    const { userDAO } = await import('@cyp-memo/shared')
    await userDAO.update(authStore.currentUser.id, {
      securityQuestion: {
        question: securityForm.value.question,
        answerHash,
      },
    })

    // 重新获取用户信息以更新 store
    const updatedUser = await userDAO.getById(authStore.currentUser.id)
    if (updatedUser) {
      authStore.currentUser = updatedUser
    }

    ElMessage.success(
      authStore.currentUser.securityQuestion ? '安全问题已更新' : '安全问题已设置'
    )
    showUpdateSecurityDialog.value = false
    securityForm.value = { question: '', answer: '' }
  } catch (error) {
    console.error('更新安全问题失败:', error)
    ElMessage.error('更新安全问题失败')
  } finally {
    isUpdating.value = false
  }
}

/**
 * 修改密码
 */
async function handleChangePassword() {
  if (!authStore.currentUser) {
    ElMessage.error('用户未登录')
    return
  }

  if (
    !passwordForm.value.currentPassword ||
    !passwordForm.value.newPassword ||
    !passwordForm.value.confirmPassword
  ) {
    ElMessage.warning('请填写完整信息')
    return
  }

  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }

  if (passwordForm.value.newPassword.length < 8) {
    ElMessage.warning('新密码至少 8 位')
    return
  }

  if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(passwordForm.value.newPassword)) {
    ElMessage.warning('新密码必须包含字母和数字')
    return
  }

  isChangingPassword.value = true

  try {
    const { verifyPassword: verify } = await import('@cyp-memo/shared')

    // 验证当前密码
    if (!authStore.currentUser.passwordHash) {
      ElMessage.error('该账号不支持密码登录')
      return
    }

    const isValid = await verify(passwordForm.value.currentPassword, authStore.currentUser.passwordHash)
    if (!isValid) {
      ElMessage.error('当前密码错误')
      return
    }

    // 更新密码
    const newPasswordHash = await hashPassword(passwordForm.value.newPassword)
    const { userDAO } = await import('@cyp-memo/shared')
    await userDAO.update(authStore.currentUser.id, {
      passwordHash: newPasswordHash,
    })

    // 重新获取用户信息
    const updatedUser = await userDAO.getById(authStore.currentUser.id)
    if (updatedUser) {
      authStore.currentUser = updatedUser
    }

    ElMessage.success('密码修改成功')
    showChangePasswordDialog.value = false
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }
  } catch (error) {
    console.error('修改密码失败:', error)
    ElMessage.error('修改密码失败')
  } finally {
    isChangingPassword.value = false
  }
}

/**
 * 加载子账号数量
 */
async function loadSubAccountCount() {
  if (!authStore.currentUser || !authStore.isMainAccount) {
    return
  }

  try {
    const { authManager } = await import('@cyp-memo/shared')
    const subAccounts = await authManager.getSubAccounts(authStore.currentUser.id)
    subAccountCount.value = subAccounts.length
  } catch (error) {
    console.error('加载子账号数量失败:', error)
  }
}

/**
 * 计算使用天数
 */
function calculateUsageDays() {
  if (!authStore.currentUser?.createdAt) {
    usageDays.value = 0
    return
  }

  const created = new Date(authStore.currentUser.createdAt)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - created.getTime())
  usageDays.value = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// 初始化数据
import { onMounted } from 'vue'
onMounted(() => {
  loadSubAccountCount()
  calculateUsageDays()
  
  // 初始化个人资料表单
  if (authStore.currentUser) {
    profileForm.value = {
      gender: authStore.currentUser.gender || '',
      email: authStore.currentUser.email || '',
      birthDate: authStore.currentUser.birthDate 
        ? new Date(authStore.currentUser.birthDate).toISOString().split('T')[0]
        : '',
      phone: authStore.currentUser.phone || '',
      address: authStore.currentUser.address || '',
      position: authStore.currentUser.position || '',
      company: authStore.currentUser.company || '',
      bio: authStore.currentUser.bio || '',
    }
  }
})
</script>

<style scoped>
.profile-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
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
  color: #303133;
  margin: 0;
}

.profile-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px 0;
}

/* 用户信息卡片 */
.profile-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px;
}

.profile-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
}

.profile-name {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px 0;
}

.profile-type {
  display: inline-block;
  padding: 6px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 500;
}

/* 信息项 */
.info-item {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  flex: 0 0 120px;
  font-weight: 500;
  color: #606266;
}

.info-value {
  flex: 1;
  color: #303133;
}

.info-control {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #f5f7fa;
  color: #303133;
  font-family: monospace;
  font-size: 14px;
}

.info-actions {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 权限网格 */
.permissions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 16px;
}

.permission-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
  font-size: 14px;
  color: #303133;
}

.permission-icon {
  font-size: 20px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .profile-view {
    padding: 16px;
  }

  .page-title {
    font-size: 24px;
  }

  .profile-header {
    flex-direction: column;
    text-align: center;
  }

  .info-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .info-label {
    flex: none;
  }

  .info-control {
    width: 100%;
    flex-direction: column;
  }

  .token-input {
    width: 100%;
  }

  .permissions-grid {
    grid-template-columns: 1fr;
  }
}

/* 深色主题支持 */
[data-theme='dark'] .page-title,
[data-theme='dark'] .section-title,
[data-theme='dark'] .profile-name,
[data-theme='dark'] .info-value {
  color: #e5eaf3;
}

[data-theme='dark'] .info-label {
  color: #cfd3dc;
}

[data-theme='dark'] .info-item {
  border-bottom-color: #414243;
}

[data-theme='dark'] .token-input {
  background: #262727;
  border-color: #414243;
  color: #e5eaf3;
}

[data-theme='dark'] .permission-item {
  background: #1a3a52;
  color: #e5eaf3;
}

[data-theme='dark'] .empty-value {
  color: #8a8f99;
}

[data-theme='dark'] .stat-item {
  background: #262727;
}

[data-theme='dark'] .stat-label {
  color: #8a8f99;
}

[data-theme='dark'] .stat-value {
  color: #e5eaf3;
}

[data-theme='dark'] .stat-value.active {
  color: #67c23a;
}

/* 空值样式 */
.empty-value {
  color: #909399;
  font-style: italic;
}

/* 统计网格 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 24px;
  padding: 16px;
}

.stat-item {
  text-align: center;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.stat-value.active {
  color: #67c23a;
}
</style>
