import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, Compass, Leaf, LoaderCircle, MapPin, SlidersHorizontal, Sparkles, Users, Wallet } from 'lucide-react';
import { INTERESTS, INTEREST_LABELS, type IntentResult, type TravelRequest } from '../../shared/types';
import { api } from '../api';
import { money, shortDate } from './ui';

interface Props {
  request: TravelRequest;
  onChange: (request: TravelRequest) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
  busy: boolean;
  initializing?: boolean;
  editing: boolean;
  progress: number;
  error: string | null;
}
const progressLabels = ['梳理旅行诉求', '匹配地点与天气', '组合路线与预算', '检查行程与备选方案'];

export default function TravelForm({ request, onChange, onSubmit, onCancelEdit, busy: serviceBusy, initializing = false, editing, progress, error }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const requestEpoch = useRef(0);
  const currentRequest = useRef(request);
  currentRequest.current = request;
  const busy = serviceBusy || interpreting || initializing;
  useEffect(() => { requestEpoch.current++; setInterpreting(false); }, [request]);
  useEffect(() => () => { requestEpoch.current++; }, []);
  useEffect(() => { if (editing) setExpanded(true); }, [editing]);
  const change = <K extends keyof TravelRequest>(key: K, value: TravelRequest[K]) => { setIntentResult(null); setIntentError(null); onChange({ ...request, [key]: value }); };
  const toggleInterest = (interest: TravelRequest['interests'][number]) => change('interests', request.interests.includes(interest) ? request.interests.filter(item => item !== interest) : [...request.interests, interest]);
  async function interpret() {
    const epoch = ++requestEpoch.current;
    const sourceRequest = request;
    setInterpreting(true); setIntentError(null); setIntentResult(null);
    try { const result = await api.interpret(sourceRequest); if (requestEpoch.current === epoch && currentRequest.current === sourceRequest) { onChange(result.request); setIntentResult(result); setExpanded(true); } }
    catch (interpretError) { if (requestEpoch.current === epoch && currentRequest.current === sourceRequest) setIntentError(interpretError instanceof Error ? interpretError.message : '旅行诉求识别失败，请手动完善表单'); }
    finally { if (requestEpoch.current === epoch) setInterpreting(false); }
  }

  return <form className="travel-form paper-card" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <div className="form-heading"><span className="small-icon"><Sparkles size={19} /></span><div><h2>{editing ? '把旅程调整得更适合你' : '说说你想要的旅行'}</h2><p>目的地之外，你的小期待也很重要。</p></div><span className="form-kicker">A JOURNEY, MADE FOR YOU</span></div>
    <label htmlFor="travel-prompt" className="sr-only">描述你的旅行诉求</label>
    <textarea id="travel-prompt" className="prompt-input" placeholder="比如：想去杭州慢慢玩 3 天，和朋友一起，预算 5000 元。喜欢自然和当地小吃，想逛西湖，也想留点发呆的时间，尽量避开人潮……" value={request.prompt} maxLength={3000} onChange={event => change('prompt', event.target.value)} disabled={busy} />
    <div className="intent-controls"><button type="button" className="text-button" disabled={busy || !request.prompt.trim()} onClick={() => void interpret()}>{interpreting ? <LoaderCircle size={14} className="spinning" /> : <Sparkles size={14} />}{interpreting ? '正在识别诉求…' : '识别旅行诉求'}</button><p>先从描述提取目的地、天数与预算，再核对下方表单。</p></div>
    {intentError && <div className="error-banner" role="alert">{intentError}</div>}
    {intentResult && <div className="intent-result" role="status"><strong>{intentResult.mode === 'model' ? '模型辅助识别' : '本地规则识别'} · {intentResult.extracted.length ? `已更新：${intentResult.extracted.join('、')}` : '暂未提取出明确字段'}</strong><p>请核对展开的旅行诉求，生成时以表单字段为准。</p>{intentResult.warnings.length > 0 && <ul>{intentResult.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</div>}
    <div className="request-summary"><span><MapPin size={15} />{request.destination || '选择目的地'}</span><span><CalendarDays size={15} />{shortDate(request.startDate)} — {shortDate(request.endDate)}</span><span><Users size={15} />{request.adults} 成人{request.children > 0 ? ` · ${request.children} 儿童` : ''}</span><span><Wallet size={15} />总预算 ¥{money(request.budget)}</span><button type="button" className="text-button expand-button" aria-expanded={expanded} aria-controls="travel-fields" onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={15} />{expanded ? '收起旅行诉求' : '完善旅行诉求'}<ChevronDown className={expanded ? 'rotated' : ''} size={14} /></button></div>
    {expanded && <div id="travel-fields" className="travel-fields">
      <div className="field-grid">
        <label>目的地<input name="destination" aria-label="目的地" placeholder="杭州，苏州（最多 3 城）" value={request.destination} maxLength={100} onChange={event => change('destination', event.target.value)} disabled={busy} required /><small>多个城市用逗号分隔，最多 3 城。</small></label>
        <label>出发地<input name="origin" aria-label="出发地" placeholder="例如：上海" value={request.origin} maxLength={80} onChange={event => change('origin', event.target.value)} disabled={busy} /></label>
        <label>出发日期<input name="startDate" aria-label="出发日期" type="date" value={request.startDate} onChange={event => change('startDate', event.target.value)} disabled={busy} required /></label>
        <label>结束日期<input name="endDate" aria-label="结束日期" type="date" value={request.endDate} min={request.startDate} onChange={event => change('endDate', event.target.value)} disabled={busy} required /></label>
        <label>成人<input name="adults" aria-label="成人" type="number" min={1} max={12} value={request.adults} onChange={event => change('adults', Number(event.target.value))} disabled={busy} required /></label>
        <label>儿童<input name="children" aria-label="儿童" type="number" min={0} max={8} value={request.children} onChange={event => change('children', Number(event.target.value))} disabled={busy} required /></label>
        <label>总预算（元）<input name="budget" aria-label="总预算（元）" type="number" min={200} max={1000000} step={100} value={request.budget} onChange={event => change('budget', Number(event.target.value))} disabled={busy} required /></label>
        <label>旅行节奏<select aria-label="旅行节奏" value={request.pace} onChange={event => change('pace', event.target.value as TravelRequest['pace'])} disabled={busy}><option value="relaxed">松弛慢游</option><option value="balanced">刚刚好的节奏</option><option value="packed">充实探索</option></select></label>
        <label>交通方式<select aria-label="交通方式" value={request.transport} onChange={event => change('transport', event.target.value as TravelRequest['transport'])} disabled={busy}><option value="public">公共交通</option><option value="driving">自驾出行</option><option value="mixed">灵活组合</option></select></label>
        <label>饮食偏好<input aria-label="饮食偏好" placeholder="素食、过敏、少辣等" value={request.dietary} maxLength={300} onChange={event => change('dietary', event.target.value)} disabled={busy} /></label>
        <label className="wide-field">行动与无障碍需求<input aria-label="行动与无障碍需求" placeholder="例如：带老人，不宜久走；需要轮椅通道" value={request.accessibility} maxLength={300} onChange={event => change('accessibility', event.target.value)} disabled={busy} /></label>
      </div>
      <fieldset className="interest-fieldset"><legend>这趟旅行，你更在意什么？</legend><div className="chip-row">{INTERESTS.map(interest => <button key={interest} type="button" className={`choice-chip ${request.interests.includes(interest) ? 'selected' : ''}`} aria-pressed={request.interests.includes(interest)} onClick={() => toggleInterest(interest)} disabled={busy}>{INTEREST_LABELS[interest]}</button>)}</div></fieldset>
      <label className="checkbox-field"><input type="checkbox" checked={request.avoidCrowds} onChange={event => change('avoidCrowds', event.target.checked)} disabled={busy} /><Leaf size={16} />尽量避开人潮，留出更舒适的游览时间</label>
    </div>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {serviceBusy && <div className="generation-progress" role="status" aria-live="polite"><div className="progress-label"><LoaderCircle size={16} className="spinning" />正在为你安排旅程，等待规划服务返回…</div><ol>{progressLabels.map((label, index) => <li key={label} className={index <= progress ? 'active' : ''}><span>{index + 1}</span>{label}</li>)}</ol></div>}
    <div className="form-footer"><span><Compass size={15} />路线、天气、住宿与美食，一起考虑。</span><div className="button-row">{editing && <button type="button" className="button secondary" onClick={onCancelEdit} disabled={busy}>取消修改</button>}<button type="submit" className="button primary generate-button" disabled={busy}>{serviceBusy || initializing ? <LoaderCircle size={18} className="spinning" /> : <Sparkles size={17} />}{initializing ? '正在连接工作空间…' : serviceBusy ? '正在规划旅程…' : editing ? '重新规划行程' : '生成我的行程'}{!serviceBusy && !initializing && <ArrowRight size={18} />}</button></div></div>
  </form>;
}
