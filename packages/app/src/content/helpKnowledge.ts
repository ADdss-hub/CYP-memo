/**
 * 帮助中心 · 知识文案 SSOT（产品内嵌，不依赖外链）
 * 文案遵守批准字符集：简体常用字 + ASCII 产品名
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export interface HelpKnowledgeSection {
  heading: string
  body: string
  bullets?: string[]
  /** 可选配置样例（等宽展示，可复制） */
  code?: string
  codeLabel?: string
}

export interface HelpKnowledgeArticle {
  id: string
  title: string
  summary: string
  sections: HelpKnowledgeSection[]
}

/** Cursor / 通用 MCP 客户端 stdio 配置样例（cwd 请改成本机仓库根） */
export const MCP_CLIENT_STDIO_SAMPLE = `{
  "mcpServers": {
    "cyp-memo": {
      "command": "pnpm",
      "args": [
        "--filter",
        "@cyp-memo/mcp",
        "exec",
        "tsx",
        "src/index.ts",
        "--stdio"
      ],
      "cwd": "D:/kf/kf/CYP-memo",
      "env": {
        "CYP_MCP_API_BASE": "https://127.0.0.1:5170/api",
        "CYP_MCP_PAT": "<可选·帮助中心 MCP 页签发的个人令牌>"
      }
    }
  }
}`

export const HELP_KNOWLEDGE_ARTICLES: readonly HelpKnowledgeArticle[] = [
  {
    id: 'quick-start',
    title: '快速入门',
    summary: '登录后如何写备忘录、找文件与保存设置',
    sections: [
      {
        heading: '打开产品',
        body: '使用网卡 IP 访问唯一产品入口（默认端口 5170）。登录后从侧栏进入各功能。',
      },
      {
        heading: '第一篇备忘录',
        body: '侧栏打开「备忘录」，点新建，填写标题与正文后点保存。可用标签整理内容。',
        bullets: ['支持富文本与表格', '可从编辑器插入文件', '可勾选允许 MCP 公开查询'],
      },
      {
        heading: '个人资料与设置',
        body: '「个人资料」可查看账号信息与个人令牌。「系统设置」可改主题、字号与导入导出。',
      },
    ],
  },
  {
    id: 'memos',
    title: '备忘录',
    summary: '列表、编辑、标签与保存',
    sections: [
      {
        heading: '列表',
        body: '备忘录列表按更新时间展示。可用搜索与标签筛选。大库采用窗口分页，点「加载更多」继续浏览。',
      },
      {
        heading: '编辑与保存',
        body: '编辑页顶栏「保存」写入服务端。正文支持自动暂存提示。离开未保存页时请留意浏览器提示。',
      },
      {
        heading: '标签',
        body: '在元信息条添加标签，可从已有标签下拉选择。建议标签便于复用常见分类。',
      },
    ],
  },
  {
    id: 'files',
    title: '文件库',
    summary: '附件入库、关联备忘录与占用说明',
    sections: [
      {
        heading: '文件库是什么',
        body: '文件库保存本账号可见范围内的附件元数据与文件体。可从备忘录编辑页关联已有文件，也可在文件库统一管理。卡片上可勾选「允许 MCP 公开」。',
      },
      {
        heading: '系统存储与文件库占用',
        body: '「系统存储空间」指服务器数据根所在卷容量。「文件库存储空间」仅统计本可见范围附件合计，二者不要混读。',
      },
    ],
  },
  {
    id: 'share',
    title: '分享',
    summary: '创建分享链接与评论注意点',
    sections: [
      {
        heading: '分享管理',
        body: '在「分享管理」可为备忘录生成分享链接，按需要设置有效期与权限。公开访问方打开分享页即可查看。',
      },
      {
        heading: '安全提示',
        body: '分享链接持有者可能看到你公开的内容。不再需要时请在分享管理中停用或删除。',
      },
    ],
  },
  {
    id: 'accounts',
    title: '子用户与权限',
    summary: '主账号如何创建子账号并分配权限',
    sections: [
      {
        heading: '子用户管理',
        body: '主账号可在「子用户管理」创建子账号，用下拉多选分配业务、运维等权限。隔离类选项可限制子账号只看本人数据。',
      },
      {
        heading: '权限原则',
        body: '侧栏入口与权限一一对应。子账号看不到未授予的入口。个人资料为各账号自用能力。',
      },
    ],
  },
  {
    id: 'mcp',
    title: 'MCP 旁路',
    summary: '独立 MCP 界面：令牌、端点、公开配置与客户端样例',
    sections: [
      {
        heading: '独立界面',
        body: '侧栏「帮助中心」打开「MCP」。该页集中连接信息、公开投影配置、能力开关、审核流水、个人令牌签发/轮换/吊销（有效期 30 天），以及 Cursor stdio 配置样例。',
      },
      {
        heading: '公开查询',
        body: '备忘录在编辑页勾选「允许 MCP 公开查询」；文件在文件库勾选「允许 MCP 公开」。公开最高层与选择器（flag / tag / ids / none）在 MCP 页「公开投影配置」中调整；tag 与 ids 须填白名单，并可开关「仍须勾选公开」。能力开关（写/公开轨/分段等）同页可改；旁路会热叠读配置。',
      },
      {
        heading: '使用规则',
        body: 'MCP 个人令牌不能直接调用备忘录业务接口，须先换发下游令牌。远程交互客户端走 OAuth：打开授权端点后在同意页批准或拒绝。',
      },
    ],
  },
  {
    id: 'mcp-client',
    title: 'MCP 客户端配置',
    summary: '详见帮助中心独立 MCP 页',
    sections: [
      {
        heading: '去哪里配置',
        body: '请打开侧栏「帮助中心」→「MCP」。该独立界面提供实时端点、公开投影配置、能力开关、可复制 stdio 样例与令牌签发。知识页不再重复维护第二套操作面。',
        bullets: [
          '路由：/help/mcp',
          'OAuth 同意：/help/mcp/oauth/consent',
          '快捷：/mcp 会跳转到同一页',
          '先启动业务 API，再启动 pnpm mcp:local 或 mcp:stdio',
          '协议入口与产品同端口 /mcp；旁路只绑环回',
        ],
      },
    ],
  },
  {
    id: 'ops',
    title: '运维概览',
    summary: '健康状态、日志与监控入口',
    sections: [
      {
        heading: '运维概览',
        body: '有运维权限时可打开「运维概览」查看整体健康与快捷入口。运行监控可从概览窗口进入。',
      },
      {
        heading: '运行日志',
        body: '「运行日志」合并业务审计与运维观测流水，便于排查登录、权限与异常请求。',
      },
      {
        heading: '开放门户',
        body: '有运行监控权限时可打开「开放门户」，查看开放接口目录、应用、订阅与配额。目录未登记不得宣称已开放。本页在唯一产品入口内。',
      },
      {
        heading: '嵌入式底座等价',
        body: '调度工单审计、对账指针回放与进程内服务发现按嵌入式落地。这不等于运行底座已完善。',
      },
    ],
  },
  {
    id: 'faq',
    title: '常见问题',
    summary: '登录、入口地址与签发失败等',
    sections: [
      {
        heading: '要用哪个地址打开',
        body: '联调与业务使用同一个产品入口：https 加网卡 IP 加端口 5170。不要用 localhost 当主链接。',
      },
      {
        heading: 'MCP 令牌签发失败',
        body: '请确认已登录，并在帮助中心 MCP 页签发。若仍失败，刷新页面后重试，或查看提示中的服务端原因。',
      },
      {
        heading: '忘记密码',
        body: '可用注册时保存的个人令牌找回账号或重置密码。请妥善保管个人令牌。',
      },
    ],
  },
]
