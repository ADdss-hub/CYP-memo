/**
 * 主 API TLS：走 shared 签发 SSOT（R-TLS-001 / NR-15）
 */

import {
  ensureProductTlsMaterial,
  type ProductTlsMaterial,
  type ProductTlsSource,
} from '../../../shared/src/tls/issue.js'

export type ApiTlsSource = ProductTlsSource | 'leaf'
export type ApiTlsMaterial = ProductTlsMaterial

export async function ensureApiTlsMaterial(dataDir: string): Promise<ApiTlsMaterial> {
  return ensureProductTlsMaterial(dataDir)
}
