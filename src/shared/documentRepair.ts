import {
  clampDeskSize,
  clampItemDimension,
  clampPosition,
  isValidDeviceType,
  normalizeRotation,
} from './layoutRules'
import { createId, createPlan, DEFAULT_DESK, type DeskItem, type WorkspaceDocument, type WorkspacePlan } from './models'

export interface DocumentRepairResult {
  document: WorkspaceDocument | null
  repaired: boolean
  /** 修复了多少处问题（方案/设备级别），用于告知用户 */
  fixCount: number
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * 尽力修复单个设备。返回 null 表示该设备已无法辨认，必须丢弃。
 * 任何被纠正的字段都会让 repaired 计数 +1。
 */
function repairItem(value: unknown, usedIds: Set<string>): { item: DeskItem | null; repaired: boolean } {
  if (!value || typeof value !== 'object') return { item: null, repaired: true }
  const candidate = value as Record<string, unknown>

  if (!isValidDeviceType(candidate.type)) return { item: null, repaired: true }

  let repaired = 0

  const width = readFiniteNumber(candidate.widthMm)
  const safeWidth = clampItemDimension(width, DEFAULT_DESK.widthMm)
  if (width === null || width !== safeWidth) repaired += 1

  const height = readFiniteNumber(candidate.heightMm)
  const safeHeight = clampItemDimension(height, DEFAULT_DESK.heightMm)
  if (height === null || height !== safeHeight) repaired += 1

  const x = readFiniteNumber(candidate.x)
  const safeX = clampPosition(x, 0)
  if (x === null || x !== safeX) repaired += 1

  const y = readFiniteNumber(candidate.y)
  const safeY = clampPosition(y, 0)
  if (y === null || y !== safeY) repaired += 1

  const rotationInput = readFiniteNumber(candidate.rotation)
  if (rotationInput === null) repaired += 1
  const safeRotation = normalizeRotation(rotationInput ?? 0)

  let id = readString(candidate.id)
  if (!id) {
    id = createId('item')
    repaired += 1
  } else if (usedIds.has(id)) {
    id = createId('item')
    repaired += 1
  }
  usedIds.add(id)

  return {
    item: { id, type: candidate.type, widthMm: safeWidth, heightMm: safeHeight, x: safeX, y: safeY, rotation: safeRotation },
    repaired: repaired > 0,
  }
}

function repairPlan(value: unknown, index: number, usedPlanIds: Set<string>): { plan: WorkspacePlan | null; repaired: number } {
  if (!value || typeof value !== 'object') return { plan: null, repaired: 1 }
  const candidate = value as Record<string, unknown>
  let fixCount = 0

  let id = readString(candidate.id)
  if (!id) {
    id = createId('plan')
    fixCount += 1
  } else if (usedPlanIds.has(id)) {
    id = createId('plan')
    fixCount += 1
  }
  usedPlanIds.add(id)

  const name = readString(candidate.name)?.slice(0, 60) ?? `工作台 ${index + 1}`
  if (name !== candidate.name) fixCount += 1

  const widthInput = readFiniteNumber(candidate.deskWidthMm)
  const deskWidthMm = clampDeskSize(widthInput, DEFAULT_DESK.widthMm)
  if (widthInput === null || widthInput !== deskWidthMm) fixCount += 1

  const heightInput = readFiniteNumber(candidate.deskHeightMm)
  const deskHeightMm = clampDeskSize(heightInput, DEFAULT_DESK.heightMm)
  if (heightInput === null || heightInput !== deskHeightMm) fixCount += 1

  const rawItems = Array.isArray(candidate.items) ? candidate.items : []
  if (!Array.isArray(candidate.items)) fixCount += 1

  const usedItemIds = new Set<string>()
  const items: DeskItem[] = []
  rawItems.forEach((rawItem) => {
    const result = repairItem(rawItem, usedItemIds)
    if (result.item) items.push(result.item)
    if (result.repaired) fixCount += 1
  })

  const updatedAt = readString(candidate.updatedAt) ?? new Date().toISOString()
  if (updatedAt !== candidate.updatedAt) fixCount += 1

  return { plan: { id, name, deskWidthMm, deskHeightMm, items, updatedAt }, repaired: fixCount }
}

/**
 * 打开存档时的唯一入口：结构完全无法辨认返回 null（调用方会新建示例方案）；
 * 结构可辨认但含非法数字 / 缺失字段时，原地修复并报告修复数量。
 * 保证返回的文档里所有数字都是有限且落在 VALUE_LIMITS 内的整数。
 */
export function repairWorkspaceDocument(value: unknown): DocumentRepairResult {
  if (!value || typeof value !== 'object') return { document: null, repaired: false, fixCount: 0 }
  const candidate = value as Record<string, unknown>

  const rawPlans = Array.isArray(candidate.plans) ? candidate.plans : []
  if (!Array.isArray(candidate.plans) || rawPlans.length === 0) {
    // 完全没有方案：用全新默认方案顶上，这属于修复而不是直接拒绝
    const fallback = createPlan('我的工作台', true)
    return { document: { version: 1, plans: [fallback], activePlanId: fallback.id }, repaired: true, fixCount: 1 }
  }

  const usedPlanIds = new Set<string>()
  const plans: WorkspacePlan[] = []
  let fixCount = 0
  rawPlans.forEach((rawPlan, index) => {
    const result = repairPlan(rawPlan, index, usedPlanIds)
    if (result.plan) plans.push(result.plan)
    fixCount += result.repaired
  })

  if (plans.length === 0) {
    const fallback = createPlan('我的工作台', true)
    return { document: { version: 1, plans: [fallback], activePlanId: fallback.id }, repaired: true, fixCount: fixCount + 1 }
  }

  const requestedActiveId = typeof candidate.activePlanId === 'string' ? candidate.activePlanId : null
  const activePlan = plans.find((plan) => plan.id === requestedActiveId) ?? plans[0]
  if (!activePlan || requestedActiveId !== activePlan.id) fixCount += 1

  return {
    document: { version: 1, plans, activePlanId: activePlan.id },
    repaired: fixCount > 0 || candidate.version !== 1,
    fixCount,
  }
}
