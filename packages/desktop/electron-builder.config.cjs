/**
 * electron-builder 配置文件
 * 
 * 配置多平台构建:
 * - Windows NSIS 安装程序
 * - macOS DMG 安装程序
 * - Linux AppImage/deb 包
 * 
 * 需求: 10.4, 7.6, 7.1
 */

const config = {
  // 应用标识
  appId: 'com.cyp.memo',
  productName: 'CYP-memo',
  copyright: 'Copyright © 2024 CYP',

  // 输出目录
  directories: {
    output: 'release/${version}',
    buildResources: 'resources',
  },

  // 包含的文件
  files: [
    'dist/**/*',
    'package.json',
    '!**/*.map',
    '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!**/node_modules/*.d.ts',
    '!**/node_modules/.bin',
  ],

  // 额外资源（不打包进 asar）
  extraResources: [
    {
      from: 'resources/',
      to: 'resources/',
      filter: ['**/*', '!.gitkeep'],
    },
  ],

  // asar 打包配置
  asar: true,
  asarUnpack: [
    // 需要解压的原生模块
    '**/node_modules/better-sqlite3/**/*',
    '**/node_modules/keytar/**/*',
  ],

  // ==================== Windows 配置 ====================
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'ia32'],
      },
      {
        target: 'portable',
        arch: ['x64'],
      },
    ],
    icon: 'resources/icon.ico',
    // 代码签名配置（需求 7.6）
    // 需要设置环境变量: CSC_LINK, CSC_KEY_PASSWORD
    // 或者使用 Windows 证书存储
    signingHashAlgorithms: ['sha256'],
    signDlls: true,
    // 请求管理员权限（如果需要）
    requestedExecutionLevel: 'asInvoker',
  },

  // NSIS 安装程序配置
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CYP-memo',
    // 安装程序图标
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    installerHeaderIcon: 'resources/icon.ico',
    // 安装程序语言
    language: 2052, // 简体中文
    // 安装完成后运行
    runAfterFinish: true,
    // 删除应用数据选项
    deleteAppDataOnUninstall: false,
    // 许可证文件（可选）
    // license: 'LICENSE',
    // 安装程序脚本（可选，用于自定义安装流程）
    // include: 'resources/installer.nsh',
  },

  // 便携版配置
  portable: {
    artifactName: '${productName}-${version}-portable.${ext}',
  },

  // ==================== macOS 配置 ====================
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64'],
      },
    ],
    icon: 'resources/icon.icns',
    category: 'public.app-category.productivity',
    // 代码签名配置（需求 7.6）
    // 需要设置环境变量: CSC_LINK, CSC_KEY_PASSWORD
    // 或者使用 macOS 钥匙串中的证书
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    // 公证配置
    // 需要设置环境变量: APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID
    notarize: false, // 在 CI 中设置为 true
  },

  // DMG 配置
  dmg: {
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications',
      },
    ],
    window: {
      width: 540,
      height: 380,
    },
    // 背景图片（可选）
    // background: 'resources/dmg-background.png',
  },

  // ==================== Linux 配置 ====================
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64'],
      },
      {
        target: 'deb',
        arch: ['x64'],
      },
      {
        target: 'rpm',
        arch: ['x64'],
      },
      {
        target: 'tar.gz',
        arch: ['x64'],
      },
    ],
    icon: 'resources/icons',
    category: 'Office',
    synopsis: 'CYP-memo 备忘录应用',
    description: '一个简洁高效的备忘录管理应用，支持离线使用和多设备同步。',
    desktop: {
      Name: 'CYP-memo',
      Comment: '备忘录管理应用',
      Categories: 'Office;Utility;',
      Keywords: 'memo;note;备忘录;笔记;',
      StartupWMClass: 'cyp-memo',
    },
    // 文件关联（可选）
    // mimeTypes: ['x-scheme-handler/cyp-memo'],
  },

  // deb 包配置
  deb: {
    depends: [
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0', // keytar 依赖
    ],
    // 安装后脚本（可选）
    // afterInstall: 'resources/linux/after-install.sh',
  },

  // rpm 包配置
  rpm: {
    depends: [
      'gtk3',
      'libnotify',
      'nss',
      'libXScrnSaver',
      'libXtst',
      'xdg-utils',
      'at-spi2-core',
      'libuuid',
      'libsecret', // keytar 依赖
    ],
  },

  // AppImage 配置
  appImage: {
    artifactName: '${productName}-${version}.${ext}',
    // 桌面集成
    desktop: {
      Name: 'CYP-memo',
      Comment: '备忘录管理应用',
      Categories: 'Office;Utility;',
    },
  },

  // ==================== 自动更新配置（需求 7.1）====================
  publish: [
    {
      provider: 'github',
      owner: 'ADdss-hub',
      repo: 'cyp-memo',
      releaseType: 'release',
      // 私有仓库需要设置 GH_TOKEN 环境变量
    },
  ],

  // 生成 blockmap 文件以支持增量更新
  generateUpdatesFilesForAllChannels: true,

  // 构建后钩子
  afterSign: 'scripts/notarize.cjs',

  // 构建选项
  buildDependenciesFromSource: false,
  nodeGypRebuild: false,
  npmRebuild: true,
}

module.exports = config
