import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, Crosshair, RotateCcw, RotateCw, Ruler, Trash2 } from 'lucide-react'
import type { DeskItem, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { getItemPositionRange } from '../../../shared/layoutRules'
import {
  DESK_MAX_MM,
  DESK_MIN_MM,
  ITEM_MAX_MM,
  ITEM_MIN_MM,
  clampToIntRange,
  parseNumericInput,
} from '../../../shared/numeric'

interface InspectorPanelProps {
  plan: WorkspacePlan
  item: DeskItem | null
  issueIds: string[]
  onUpdateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  onUpdateItem: (id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => void
  onRotate: (id: string, delta: number) => void
  onDelete: (id: string) => void
}

interface NumericFieldProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

/**
 * 所有毫米数值输入的统一行为：
 * - 编辑中保留原始文本，不会因为中间态（如 "-"、"1"）被强行纠正；
 * - 失焦 / 回车时提交：有限数字一律取整并纠正到 [min, max]，父层状态回写后用户能立刻看到修正后的值；
 * - 清空或粘贴非法内容（文字、Infinity）：明确拒绝——红框提示，失焦/回车时回弹到上一个有效值，绝不产生 NaN；
 * - Esc：放弃本次输入。
 */
function NumericField({ label, value, min, max, onChange }: NumericFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    if (draft === null) return
    const parsed = parseNumericInput(draft)
    if (parsed === null) {
      // 拒绝本次输入：回弹到权威值。
      setDraft(null)
      setInvalid(false)
      return
    }
    const corrected = clampToIntRange(parsed, min, max)
    onChange(corrected)
    setDraft(String(corrected))
    setInvalid(false)
  }

  const handleChange = (raw: string) => {
    setDraft(raw)
    setInvalid(parseNumericInput(raw) === null)
  }

  const handleBlur = (_event: FocusEvent<HTMLInputElement>) => {
    commit()
    // 让 React 在下次渲染时把 value 同步为父层权威值。
    setDraft(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit()
      inputRef.current?.blur()
    } else if (event.key === 'Escape') {
      setDraft(null)
      setInvalid(false)
      inputRef.current?.blur()
    }
  }

  return (
    <label className={`numeric-field ${invalid ? 'is-invalid' : ''}`}>
      <span>{label}</span>
      <input
        ref={inputRef}
        type="number"
        value={draft ?? value}
        min={min}
        max={max}
        aria-invalid={invalid}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <em>mm</em>
      {invalid && <small className="numeric-error"><AlertTriangle size={10} /> 请输入 {min}–{max} 之间的数字</small>}
    </label>
  )
}

export function InspectorPanel({ plan, item, issueIds, onUpdateDesk, onUpdateItem, onRotate, onDelete }: InspectorPanelProps) {
  const isIssue = item ? issueIds.includes(item.id) : false
  const definition = item ? getDeviceDefinition(item.type) : null
  // 当前桌面下该设备的合法坐标区间（设备至少有一部分处于桌面内）。
  const positionRange = item
    ? getItemPositionRange(item.widthMm, item.heightMm, plan.deskWidthMm, plan.deskHeightMm)
    : null
  return (
    <aside className="inspector-panel">
      <div className="module-heading">
        <div><span className="eyebrow">02 / 检查</span><h2>尺寸检查</h2></div>
        <Ruler size={18} className="muted-icon" />
      </div>
      <div className="desk-size-card">
        <div className="field-heading"><span>桌面画布</span><span className="field-status">实时</span></div>
        <div className="desk-size-fields">
          <NumericField label="宽度" value={plan.deskWidthMm} min={DESK_MIN_MM} max={DESK_MAX_MM} onChange={(value) => onUpdateDesk('deskWidthMm', value)} />
          <NumericField label="深度" value={plan.deskHeightMm} min={DESK_MIN_MM} max={DESK_MAX_MM} onChange={(value) => onUpdateDesk('deskHeightMm', value)} />
        </div>
        <p className="helper-text">桌面尺寸支持 {DESK_MIN_MM}–{DESK_MAX_MM} mm，建议保留 40 mm 走线缓冲空间</p>
      </div>
      {item && definition ? (
        <div className="item-editor">
          <div className="selected-item-heading"><span className="selected-swatch" style={{ backgroundColor: definition.color }} /> <div><strong>{definition.label}</strong><small>{definition.hint}</small></div><span className="item-code">{definition.shortLabel}</span></div>
          {isIssue && <div className="issue-callout"><AlertTriangle size={16} /><span>设备与其他元素重叠或超出桌面边界</span></div>}
          <div className="field-heading"><span>实际尺寸</span><span className="unit-label">单位：毫米</span></div>
          <div className="two-column-fields">
            <NumericField label="宽度" value={item.widthMm} min={ITEM_MIN_MM} max={ITEM_MAX_MM} onChange={(value) => onUpdateItem(item.id, { widthMm: value })} />
            <NumericField label="深度" value={item.heightMm} min={ITEM_MIN_MM} max={ITEM_MAX_MM} onChange={(value) => onUpdateItem(item.id, { heightMm: value })} />
          </div>
          <div className="field-heading position-heading"><span>位置</span><span className="unit-label">左上角坐标</span></div>
          <div className="two-column-fields">
            <NumericField label="X" value={item.x} min={positionRange?.minX ?? 0} max={positionRange?.maxX ?? plan.deskWidthMm} onChange={(value) => onUpdateItem(item.id, { x: value })} />
            <NumericField label="Y" value={item.y} min={positionRange?.minY ?? 0} max={positionRange?.maxY ?? plan.deskHeightMm} onChange={(value) => onUpdateItem(item.id, { y: value })} />
          </div>
          <div className="rotation-row"><span><Crosshair size={15} /> 旋转角度 <strong>{Math.round(item.rotation)}°</strong></span><div className="rotation-actions"><button aria-label="逆时针旋转 15 度" onClick={() => onRotate(item.id, -15)} type="button"><RotateCcw size={15} /></button><button aria-label="顺时针旋转 15 度" onClick={() => onRotate(item.id, 15)} type="button"><RotateCw size={15} /></button></div></div>
          <button className="remove-item-button" onClick={() => onDelete(item.id)} type="button"><Trash2 size={15} /> 移除这个设备</button>
        </div>
      ) : (
        <div className="empty-inspector"><span className="empty-illustration">⌖</span><strong>选择一个设备</strong><p>点击画布上的设备查看尺寸、位置和旋转控制。</p></div>
      )}
    </aside>
  )
}
