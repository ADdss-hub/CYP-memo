/**
 * 产品 TLS 身份 SSOT（R-TLS-001）
 * 证书 CN/O/OU/CA 一律用项目名 CYP-memo；禁止含 MCP / api 分叉名。
 */

/** 产品显示名（证书 CN / OU） */
export const CYP_TLS_PRODUCT = 'CYP-memo'

/** 组织 */
export const CYP_TLS_ORG = 'CYP'

/** 国家（ISO 3166-1 alpha-2） */
export const CYP_TLS_COUNTRY = 'CN'

/** 私有 CA 主题（完整 DN） */
export const CYP_TLS_CA_SUBJECT =
  `CN=${CYP_TLS_PRODUCT} TLS CA,OU=${CYP_TLS_PRODUCT},O=${CYP_TLS_ORG},C=${CYP_TLS_COUNTRY}`

/** 服务叶子主题（完整 DN · API / MCP / 其它监听面共用） */
export const CYP_TLS_LEAF_SUBJECT =
  `CN=${CYP_TLS_PRODUCT},OU=${CYP_TLS_PRODUCT},O=${CYP_TLS_ORG},C=${CYP_TLS_COUNTRY}`

/** openssl -subj 叶子 */
export const CYP_TLS_OPENSSL_LEAF_SUBJ =
  `/C=${CYP_TLS_COUNTRY}/O=${CYP_TLS_ORG}/OU=${CYP_TLS_PRODUCT}/CN=${CYP_TLS_PRODUCT}`

/** openssl -subj CA */
export const CYP_TLS_OPENSSL_CA_SUBJ =
  `/C=${CYP_TLS_COUNTRY}/O=${CYP_TLS_ORG}/OU=${CYP_TLS_PRODUCT}/CN=${CYP_TLS_PRODUCT} TLS CA`

/** selfsigned attrs */
export const CYP_TLS_SELFSIGNED_ATTRS: Array<{ name: string; value: string }> = [
  { name: 'countryName', value: CYP_TLS_COUNTRY },
  { name: 'organizationName', value: CYP_TLS_ORG },
  { name: 'organizationalUnitName', value: CYP_TLS_PRODUCT },
  { name: 'commonName', value: CYP_TLS_PRODUCT },
]

/** 自动签发叶子目录（相对 dataDir/tls） */
export const CYP_TLS_LEAF_DIR_NAME = 'leaf'

/** 历史目录名（仅迁移读取；不再新写） */
export const CYP_TLS_LEGACY_LEAF_DIRS = ['mcp', 'api'] as const

/** CA 目录名 */
export const CYP_TLS_CA_DIR_NAME = 'ca'

/** 正规证书目录名 */
export const CYP_TLS_OFFICIAL_DIR_NAME = 'official'

/** 识别私有 CA issuer */
export function isCypProductTlsCaIssuer(issuer: string): boolean {
  // 现行：CYP-memo TLS CA；兼容曾用 CYP-memo Product TLS CA
  return /CN\s*=\s*CYP-memo(?:\s+Product)?\s+TLS\s+CA/i.test(issuer)
}

/**
 * 叶子主题是否为现行产品身份。
 * 含 MCP / 旧 api 分叉名 → 强制重签。
 * Node subject 可能为多行 `C=..\nCN=CYP-memo` 或逗号分隔。
 */
export function isCurrentProductLeafSubject(subject: string): boolean {
  if (!subject || /mcp/i.test(subject)) return false
  if (/cyp-memo-api/i.test(subject)) return false
  const flat = subject.replace(/\r/g, '').replace(/\n/g, ',').replace(/\s+/g, ' ').trim()
  const m = flat.match(/(?:^|[,\/])\s*CN\s*=\s*([^,\/]+)/i)
  if (!m) return false
  return m[1].trim() === CYP_TLS_PRODUCT
}
