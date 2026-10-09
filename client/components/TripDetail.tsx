import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BedDouble, Check, ChevronRight, Cloud, CloudRain, Download, Footprints, Info, Leaf, LoaderCircle, MapPin, Pencil, Shirt, Sun, ThumbsDown, ThumbsUp, Utensils, Wallet } from 'lucide-react';
import type { Stop, TravelPlan } from '../../shared/types';
import { api } from '../api';
import RouteMap from './RouteMap';
import { ExternalLink, money, shortDate, StatusBadge } from './ui';

interface Props {
  plan: TravelPlan;
  busy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onRain: () => void;
  onFeedback: (stop: Stop, rating: -1 | 1) => void;
  feedbackBusy: string | null;
  feedbackRatings: Record<string, number>;
}
const stopIcons = { attraction: MapPin, meal: Utensils, transport: Footprints, checkin: BedDouble, free: Leaf };
const crowdLabels = { low: '较安静', medium: '适度人流', high: '可能拥挤' };
const budgetLabels = { accommodation: '住宿', food: '餐饮', transport: '交通', tickets: '门票', buffer: '机动费用' };

function BudgetCard({ plan }: { plan: TravelPlan }) {
  const budget = plan.budget;
  return <section className="budget-card paper-card"><div className="section-heading"><h3><Wallet size={17} />旅程预算</h3><span>人民币 · 估算</span></div><div className="budget-total"><span>¥</span>{money(budget.total)}<small>/{plan.request.adults + plan.request.children} 人总计</small></div><div className={`budget-meter ${budget.withinBudget ? '' : 'over-budget'}`}><span style={{ width: `${Math.min(100, budget.total / Math.max(1, budget.limit) * 100)}%` }} /></div><div className="budget-limit"><span>{budget.withinBudget ? '预算范围内' : '超出目标预算'}</span><span>上限 ¥{money(budget.limit)}</span></div><dl className="budget-breakdown">{Object.entries(budget.breakdown).map(([key, value]) => <div key={key}><dt>{budgetLabels[key as keyof typeof budgetLabels]}</dt><dd>¥{money(value)}</dd></div>)}<div className="per-person"><dt>人均参考</dt><dd>¥{money(budget.perPerson)}</dd></div></dl><p className="fine-print">{budget.note}</p></section>;
}
function StopCard({ stop, index, onFeedback, feedbackBusy, feedbackRating }: { stop: Stop; index: number; onFeedback: Props['onFeedback']; feedbackBusy: string | null; feedbackRating?: number }) {
  const Icon = stopIcons[stop.kind];
  return <li className="timeline-stop"><div className="timeline-time"><strong>{stop.startTime}</strong><span>{stop.endTime}</span></div><div className="timeline-rail"><span>{index + 1}</span></div><article className="stop-card">
    {index > 0 && <div className="travel-connector"><Footprints size={13} />距上一站约 {stop.distanceKm.toFixed(1)} km · 通勤估算 {stop.travelMinutes} 分钟</div>}
    <div className="stop-heading"><div><span className="stop-kind"><Icon size={14} />{stop.kind === 'meal' ? '吃点当地的' : stop.kind === 'checkin' ? '安顿下来' : stop.kind === 'transport' ? '路上的风景' : stop.kind === 'free' ? '留白时光' : '值得停留'}</span><h3>{stop.name}</h3></div><span className="stop-cost">{stop.estimatedCost > 0 ? `预估 ¥${money(stop.estimatedCost)}` : '费用以现场为准'}</span></div>
    <p className="stop-description">{stop.description}</p><p className="stop-why"><SparkleDot />{stop.why}</p>
    <div className="stop-meta"><StatusBadge status={stop.status} /><span>{crowdLabels[stop.crowd]}</span><span>{stop.durationMinutes} 分钟</span>{stop.indoor && <span>室内活动</span>}</div>
    {stop.accessibility && <p className="accessibility-note"><Info size={13} />{stop.accessibility}</p>}
    {stop.alternatives.length > 0 && <details className="alternatives"><summary>另一种选择 <ChevronRight size={13} /></summary><ul>{stop.alternatives.map((alternative, altIndex) => <li key={`${alternative.name}-${altIndex}`}><strong>{alternative.name}</strong><span>{alternative.reason}</span></li>)}</ul></details>}
    <div className="stop-footer"><ExternalLink href={stop.mapUrl}>{stop.address || '查看地点'} · 导航</ExternalLink><div className="feedback-buttons"><button type="button" aria-label={`喜欢${stop.name}`} aria-pressed={feedbackRating === 1} className={feedbackRating === 1 ? 'selected' : ''} title="喜欢这类安排" disabled={!stop.tags.length || feedbackBusy === stop.id} onClick={() => onFeedback(stop, 1)}><ThumbsUp size={14} /></button><button type="button" aria-label={`不喜欢${stop.name}`} aria-pressed={feedbackRating === -1} className={feedbackRating === -1 ? 'selected' : ''} title="减少这类安排" disabled={!stop.tags.length || feedbackBusy === stop.id} onClick={() => onFeedback(stop, -1)}><ThumbsDown size={14} /></button></div></div>
  </article></li>;
}
function SparkleDot() { return <span className="why-dot" aria-hidden="true">✦</span>; }

export default function TripDetail({ plan, busy, onBack, onEdit, onRain, onFeedback, feedbackBusy, feedbackRatings }: Props) {
  const [dayIndex, setDayIndex] = useState(0);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  useEffect(() => { setDayIndex(0); }, [plan.id, plan.revision]);
  async function download(format: 'markdown' | 'json' | 'ics') {
    setExporting(format); setExportError(null);
    try {
      const response = await fetch(api.exportUrl(plan.id, format), { credentials: 'same-origin' });
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.error?.message || `导出失败（${response.status}）`); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `${plan.title.replace(/[\\/:*?"<>|]/g, '_')}.${format === 'markdown' ? 'md' : format}`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : '导出失败，请重试'); }
    finally { setExporting(null); }
  }
  const day = plan.days[dayIndex] ?? plan.days[0];
  if (!day) return <div className="error-banner" role="alert">该行程尚未包含可展示的安排。请修改诉求后重新规划。</div>;
  const weatherSource = plan.sources.find(source => source.id === day.weather.sourceId);
  return <div className="trip-detail">
    <button className="text-button back-link" onClick={onBack}><ArrowLeft size={15} />全部行程</button>
    <header className="plan-heading"><div><span className="eyebrow">YOUR PERSONAL ITINERARY · 第 {plan.revision} 版</span><h1>{plan.title}</h1><p>{plan.summary}</p><div className="plan-meta"><span><CalendarIcon />{shortDate(plan.request.startDate)} — {shortDate(plan.request.endDate)}</span><span>{plan.request.adults} 成人{plan.request.children ? ` · ${plan.request.children} 儿童` : ''}</span><span>{plan.days.length} 天 · {plan.request.pace === 'relaxed' ? '松弛慢游' : plan.request.pace === 'packed' ? '充实探索' : '舒适节奏'}</span></div></div><div className="plan-actions"><button className="button secondary" onClick={onEdit} disabled={busy}><Pencil size={15} />修改需求</button><button className="button secondary" onClick={onRain} disabled={busy}><CloudRain size={15} />{busy ? '重新规划中…' : '模拟雨天重排'}</button></div></header>
    {plan.warnings.length > 0 && <div className="notice-card"><Info size={18} /><div><strong>出发前，留意这些信息</strong><ul>{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div></div>}
    <div className="plan-layout"><div className="plan-main"><div className="day-tabs" role="tablist" aria-label="行程日期">{plan.days.map((item, index) => <button key={item.date} role="tab" aria-selected={dayIndex === index} aria-controls={`day-panel-${index}`} id={`day-tab-${index}`} className={dayIndex === index ? 'active' : ''} onClick={() => setDayIndex(index)}><span>DAY {String(index + 1).padStart(2, '0')}</span><strong>{shortDate(item.date)}</strong><small>{item.city}</small></button>)}</div>
      <section role="tabpanel" id={`day-panel-${dayIndex}`} aria-labelledby={`day-tab-${dayIndex}`} className="day-panel"><div className="day-heading"><div><span className="eyebrow">在 {day.city} 的一天</span><h2>{day.theme}</h2></div><span className="day-number">{String(dayIndex + 1).padStart(2, '0')}</span></div>
        <div className="weather-card"><span className="weather-icon">{day.weather.status === 'unavailable' || day.weather.status === 'seasonal' ? <Cloud size={24} /> : day.weather.rain ? <CloudRain size={24} /> : <Sun size={24} />}</span><div><strong>{day.weather.summary}{day.weather.low !== undefined && day.weather.high !== undefined ? ` · ${day.weather.low}–${day.weather.high}°C` : ''}</strong><p>{day.weather.precipitationProbability !== undefined && `降水概率 ${day.weather.precipitationProbability}% · `}<StatusBadge status={day.weather.status} />{weatherSource?.url ? <ExternalLink href={weatherSource.url}>{weatherSource.label}</ExternalLink> : weatherSource && <span>{weatherSource.label}</span>}</p></div></div>
        <ol className="timeline">{day.stops.map((stop, index) => <StopCard key={stop.id} stop={stop} index={index} onFeedback={onFeedback} feedbackBusy={feedbackBusy} feedbackRating={feedbackRatings[`${plan.id}:${stop.id}`]} />)}</ol>
        <section className="lodging-card"><span className="lodging-icon"><BedDouble size={23} /></span><div><span className="eyebrow">今晚，住得舒服一点</span><h3>{day.lodging.area}</h3><p>{day.lodging.note}</p>{day.lodging.nightlyCost > 0 && <small>住宿预算参考 ¥{money(day.lodging.nightlyCost)} / 晚，实际房价与空房需另行确认。</small>}</div></section>
        {day.notes.length > 0 && <div className="day-notes"><h3><Leaf size={16} />管家的小提醒</h3><ul>{day.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      </section>
      <details className="planning-details paper-card"><summary><Info size={17} />规划依据与资料来源<ChevronRight size={16} /></summary><div className="planning-detail-content"><h3>为什么这样安排</h3><ul>{plan.reasoning.map((reason, index) => <li key={index}>{reason}</li>)}</ul><h3>规划过程</h3><div className="agent-trace">{plan.agentTrace.map((step, index) => <div key={`${step.stage}-${index}`}><span className={`trace-dot ${step.status}`} /><div><strong>{step.label}</strong><p>{step.detail}</p></div><small>{step.status === 'done' ? '已完成' : '使用备选方式'}</small></div>)}</div><h3>资料与时效</h3><div className="sources-list">{plan.sources.map(source => <div key={source.id}><div><StatusBadge status={source.status} />{source.url ? <ExternalLink href={source.url}>{source.label}</ExternalLink> : <strong>{source.label}</strong>}</div><p>{source.note}</p>{source.fetchedAt && <small>查询时间：{new Date(source.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small>}</div>)}</div></div></details>
    </div><aside className="plan-aside"><BudgetCard plan={plan} /><RouteMap stops={day.stops} /><section className="packing-card paper-card"><div className="section-heading"><h3><Shirt size={17} />行李小清单</h3><span>出发前检查</span></div><ul>{plan.packing.map((item, index) => <li key={index}><Check size={14} />{item}</li>)}</ul></section><section className="export-card paper-card"><h3><Download size={17} />带上这份攻略</h3><p>随时查看，也方便分享给同行的人。</p>{([['markdown', '下载攻略 Markdown'], ['ics', '同步日历 ICS'], ['json', '下载数据 JSON']] as const).map(([format, label]) => <button type="button" key={format} className="export-link" disabled={!!exporting} onClick={() => void download(format)}>{label}{exporting === format ? <LoaderCircle size={14} className="spinning" /> : <ArrowRight size={14} />}</button>)}{exportError && <div className="error-banner" role="alert">{exportError}</div>}</section></aside></div>
  </div>;
}
function CalendarIcon() { return <span aria-hidden="true">◷</span>; }
