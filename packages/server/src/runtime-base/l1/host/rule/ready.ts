/**
 * 规则校验研判 · RB-L1-HOST-RULE-01
 * 专属：风险阈值权威与研判；由配置管控注入，禁止业务硬编码第二套阈值。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export interface RiskThresholds {
  errorStorm5xx: number
  scanUniquePaths: number
  scan404Ratio: number
  scanMinSamples: number
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  errorStorm5xx: 50,
  scanUniquePaths: 40,
  scan404Ratio: 0.4,
  scanMinSamples: 20,
}

let riskThresholds: RiskThresholds = { ...DEFAULT_RISK_THRESHOLDS }
let riskPolicyBound = false
let ruleReady = false

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function clampRatio(v: unknown, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

export function getRiskThresholds(): RiskThresholds {
  return { ...riskThresholds }
}

/** 由配置管控热变更/回滚注入；禁止托管业务服务私自第二套阈值 */
export function setRiskThresholds(patch: Partial<RiskThresholds> | null | undefined): RiskThresholds {
  const next: RiskThresholds = {
    errorStorm5xx: clampInt(patch?.errorStorm5xx, DEFAULT_RISK_THRESHOLDS.errorStorm5xx, 1, 10_000),
    scanUniquePaths: clampInt(patch?.scanUniquePaths, DEFAULT_RISK_THRESHOLDS.scanUniquePaths, 1, 10_000),
    scan404Ratio: clampRatio(patch?.scan404Ratio, DEFAULT_RISK_THRESHOLDS.scan404Ratio),
    scanMinSamples: clampInt(patch?.scanMinSamples, DEFAULT_RISK_THRESHOLDS.scanMinSamples, 1, 10_000),
  }
  riskThresholds = next
  riskPolicyBound = true
  ruleReady = true
  return getRiskThresholds()
}

export function isRiskPolicyBound(): boolean {
  return riskPolicyBound
}

export function initRuleJudge(): { ready: boolean } {
  if (!riskPolicyBound) setRiskThresholds(DEFAULT_RISK_THRESHOLDS)
  ruleReady = true
  return { ready: true }
}

export function resetRuleJudge(): void {
  ruleReady = false
  riskPolicyBound = false
  riskThresholds = { ...DEFAULT_RISK_THRESHOLDS }
}

export function evaluateRiskRule(sample: {
  uniquePaths: number
  ratio404: number
  total: number
  err5xx: number
}): { scanSuspect: boolean; errorStorm: boolean; thresholds: RiskThresholds } {
  const thr = getRiskThresholds()
  return {
    scanSuspect:
      sample.uniquePaths >= thr.scanUniquePaths &&
      sample.ratio404 >= thr.scan404Ratio &&
      sample.total >= thr.scanMinSamples,
    errorStorm: sample.err5xx >= thr.errorStorm5xx,
    thresholds: thr,
  }
}

/** 实现锚点 · RB-L1-HOST-RULE-01 */
export function ready_rb_l1_host_rule_01(): boolean {
  return ruleReady && isRiskPolicyBound()
}
