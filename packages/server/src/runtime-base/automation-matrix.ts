/**
 * CYP-memo 闭集自动化/智能化登记投影（产品绑定 IA01–IA85）
 * 人类 SSOT：docs/runtime-base/AUTOMATION_INTELLIGENCE.md
 * 机读 SSOT：docs/runtime-base/automation-matrix.json
 */
export const AUTOMATION_A3_IDS = [
  'RB-L1-MGMT-PERF-01',
  'RB-L1-HOST-RESIL-01',
  'RB-L1-HOST-ALERT-01',
] as const

export interface AutomationIntelligenceState {
  ready: boolean
  closedSet: 35
  standard: string
  matrix: string
  opsObservesOnly: true
  systemDispositionAutoClose: true
  ia13Exception: string
  a3: readonly string[]
  minAcl: {
    L0: 'A1'
    'L1-MGMT': 'A2'
    'L1-HOST': 'A2'
    'L1-COL': 'A1'
    'L1-PUB': 'A2'
  }
}

export function getAutomationIntelligenceState(): AutomationIntelligenceState {
  return {
    ready: true,
    closedSet: 35,
    standard: 'docs/runtime-base/AUTOMATION_INTELLIGENCE.md',
    matrix: 'docs/runtime-base/automation-matrix.json',
    opsObservesOnly: true,
    systemDispositionAutoClose: true,
    ia13Exception: 'assignee automation:* = 责任方已确认（系统处置单 · IA13-X）',
    a3: AUTOMATION_A3_IDS,
    minAcl: {
      L0: 'A1',
      'L1-MGMT': 'A2',
      'L1-HOST': 'A2',
      'L1-COL': 'A1',
      'L1-PUB': 'A2',
    },
  }
}

export function ready_automation_intelligence(): boolean {
  return getAutomationIntelligenceState().ready && AUTOMATION_A3_IDS.length >= 3
}
