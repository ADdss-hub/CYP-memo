# 发行公钥登记

把 **ASCII 装甲公钥** 放到本目录 `cyp-memo-release.pub.asc`（可入库）。

- 签发：本机 `CYP_GPG_SIGN_KEY`（指纹或邮箱）调用 `gpg --detach-sign`，私钥不出仓。
- 校验：制品旁路 `.sha256` 必有；`.asc` / `.sig` 若存在则 `gpg --verify`。需要强制签名时设 `CYP_REQUIRE_GPG=1`。
- **禁止**把私钥、口令、伪造 sidecar 写入仓库。
- 桌面/龙芯实签仍须目标机与受控密钥；本目录只登记公钥。
