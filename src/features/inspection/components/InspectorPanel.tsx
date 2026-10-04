import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, Crosshair, RotateCcw, RotateCw, Ruler, Trash2 } from 'lucide-react'
import type { DeskItem, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { VALUE_LIMITS } from '../../../shared/layoutRules'
import { evaluateNumericDraft, isBadNumberInput } from '../../../shared/numericDraft'

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

type FieldTone = 'ok' | 'warn' | 'error'

/**
 * 所有毫米/坐标输入框的统一行为：
 * - 输入过程中，合法数字实时写进方案，画布立即跟随
 * - 清空、粘贴非法字符：输入框标红提示，但绝不写入；离开输入框时恢复到上一个有效值
 * - 超出范围的极端值：输入框标黄提示，离开时夹取到最近的合法边界并明确告知用户
 */
function NumericField({ label, value, min, max, onChange }: NumericFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [tone, setTone] = useState<FieldTone>('ok')
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const committedText = String(Math.round(value))
  const editing = draft !== null

  // 外部值变化（拖动、切换设备）且没有在编辑时，清掉残留提示
  useEffect(() => {
    if (!editing) {
      setTone('ok')
      setMessage('')
    }
  }, [committedText, editing])

  const currentStatus = (): 'valid' | 'out-of-range' | 'incomplete' | 'invalid' | 'empty' => {
    if (inputRef.current && isBadNumberInput(inputRef.current)) return 'invalid'
    return evaluateNumericDraft(draft ?? '', min, max).status
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.currentTarget.value
    setDraft(text)
    const status = isBadNumberInput(event.currentTarget)
      ? 'invalid'
      : evaluateNumericDraft(text, min, max).status

    if (status === 'valid') {
      onChange(evaluateNumericDraft(text, min, max).clamped)
      setTone('ok')
      setMessage('')
    } else if (status === 'out-of-range') {
      setTone('warn')
      setMessage(`允许范围 ${min}–${max}，离开时会自动调整`)
    } else if (status === 'incomplete') {
      setTone('ok')
      setMessage('')
    } else {
      setTone('error')
      setMessage('不是有效数字，本次输入不会被保存')
    }
  }

  const finishEditing = () => {
    if (draft === null) return
    const status = currentStatus()
    if (status === 'valid') {
      setTone('ok')
      setMessage('')
    } else if (status === 'out-of-range') {
      const clamped = evaluateNumericDraft(draft, min, max).clamped
      onChange(clamped)
      setTone('ok')
      setMessage(`已调整为允许范围内的 ${clamped} mm`)
    } else {
      // empty / invalid / incomplete：明确拒绝，恢复并让用户看到恢复后的值
      setTone('error')
      setMessage(`输入无效，已恢复为 ${committedText} mm`)
    }
    setDraft(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      inputRef.current?.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(null)
      setTone('ok')
      setMessage('')
      inputRef.current?.blur()
    }
  }

  return (
    <label className={`numeric-field tone-${tone}`}>
      <span>{label}</span>
      <input
        ref={inputRef}
        type="number"
        value={editing ? draft : committedText}
        min={min}
        max={max}
        step={1}
        title={`允许范围 ${min}–${max} mm`}
        onChange={handleChange}
        onBlur={finishEditing}
        onKeyDown={handleKeyDown}
        onFocus={(event) => { setDraft(event.currentTarget.value); setTone('ok'); setMessage('') }}
      />
      <em>mm</em>
      <small className="numeric-message" role={tone === 'error' ? 'alert' : undefined}>
        {tone === 'error' && <AlertTriangle size={9} />}
        {message}
      </small>
    </label>
  )
}

export function InspectorPanel({ plan, item, issueIds, onUpdateDesk, onUpdateItem, onRotate, onDelete }: InspectorPanelProps) {
  const isIssue = item ? issueIds.includes(item.id) : false
  const definition = item ? getDeviceDefinition(item.type) : null
  return (
    <aside className="inspector-panel">
      <div className="module-heading">
        <div><span className="eyebrow">02 / 检查</span><h2>尺寸检查</h2></div>
        <Ruler size={18} className="muted-icon" />
      </div>
      <div className="desk-size-card">
        <div className="field-heading"><span>桌面画布</span><span className="field-status">实时</span></div>
        <div className="desk-size-fields">
          <NumericField label="宽度" value={plan.deskWidthMm} min={VALUE_LIMITS.deskMin} max={VALUE_LIMITS.deskMax} onChange={(value) => onUpdateDesk('deskWidthMm', value)} />
          <NumericField label="深度" value={plan.deskHeightMm} min={VALUE_LIMITS.deskMin} max={VALUE_LIMITS.deskMax} onChange={(value) => onUpdateDesk('deskHeightMm', value)} />
        </div>
        <p className="helper-text">建议保留 40 mm 走线缓冲空间 · 允许范围 {VALUE_LIMITS.deskMin}–{VALUE_LIMITS.deskMax} mm</p>
      </div>
      {item && definition ? (
        <div className="item-editor">
          <div className="selected-item-heading"><span className="selected-swatch" style={{ backgroundColor: definition.color }} /> <div><strong>{definition.label}</strong><small>{definition.hint}</small></div><span className="item-code">{definition.shortLabel}</span></div>
          {isIssue && <div className="issue-callout"><AlertTriangle size={16} /><span>设备与其他元素重叠或超出桌面边界</span></div>}
          <div className="field-heading"><span>实际尺寸</span><span className="unit-label">单位：毫米</span></div>
          <div className="two-column-fields">
            <NumericField label="宽度" value={item.widthMm} min={VALUE_LIMITS.itemMin} max={VALUE_LIMITS.itemMax} onChange={(value) => onUpdateItem(item.id, { widthMm: value })} />
            <NumericField label="深度" value={item.heightMm} min={VALUE_LIMITS.itemMin} max={VALUE_LIMITS.itemMax} onChange={(value) => onUpdateItem(item.id, { heightMm: value })} />
          </div>
          <div className="field-heading position-heading"><span>位置</span><span className="unit-label">左上角坐标</span></div>
          <div className="two-column-fields">
            <NumericField label="X" value={item.x} min={VALUE_LIMITS.positionMin} max={VALUE_LIMITS.positionMax} onChange={(value) => onUpdateItem(item.id, { x: value })} />
            <NumericField label="Y" value={item.y} min={VALUE_LIMITS.positionMin} max={VALUE_LIMITS.positionMax} onChange={(value) => onUpdateItem(item.id, { y: value })} />
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
