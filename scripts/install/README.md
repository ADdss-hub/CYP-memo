# scripts/install

生产安装（闭集 35 · Server 声明集）。权威说明见根目录 `DEPLOY.md`。

| 脚本 | 通道 |
|------|------|
| `install.ps1` / `install.sh` / `install.bat` | 三平台统一入口（自动转调对应平台脚本） |
| `install-panel.sh` | 宝塔 / 1Panel / aaPanel |
| `install-nas.sh` | 飞牛 / 群晖 / 威联（原生 Node） |
| `install-windows.ps1` | Windows 服务端（优先 SCM，见 `scripts/start/register-windows-scm.ps1`） |
| `install-unix.sh` | Linux / macOS |
| `pack-server-release.sh` | Server 发行包（旁路 `.sha256`；`CYP_GPG_SIGN_KEY` 才签名） |
| `build.js` / `release.js` / `version-bump.js` | 构建与升版（根 `package.json` 脚本入口） |
| `setup-mirrors.sh` / `setup-mirrors.ps1` | 国内镜像 |

安装成功退出前须通过 `scripts/verify/verify-five-centers.*`。
