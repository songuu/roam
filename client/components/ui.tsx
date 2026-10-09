import type { ReactNode } from 'react';
import { ArrowUpRight, Compass, MapPin } from 'lucide-react';
import type { DataStatus, TravelPlan } from '../../shared/types';

export const STATUS_LABELS: Record<DataStatus, string> = {
  live: '实时查询', catalog: '本地参考', estimate: '估算', seasonal: '季节参考', unavailable: '暂不可用', scenario: '模拟天气',
};
export const money = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
export const shortDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' }).format(date);
};
export function todayInShanghai() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
export function Brand() {
  return <div className="brand"><span className="brand-mark"><Compass size={28} strokeWidth={1.5} /></span><div><strong>途伴 <em>Roam</em></strong><span>每一次出发，都刚刚好</span></div></div>;
}
export function StatusBadge({ status }: { status: DataStatus }) {
  return <span className={`data-badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}
export function EmptyState({ icon = <MapPin size={32} />, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h2>{title}</h2><p>{description}</p>{action}</div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}
export function TripPicker({ trips, selected, onChange, disabled = false }: { trips: TravelPlan[]; selected: string; onChange: (id: string) => void; disabled?: boolean }) {
  return <label className="trip-picker">当前旅程<select aria-label="选择旅程" value={selected} disabled={disabled} onChange={event => onChange(event.target.value)}>{trips.map(trip => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select></label>;
}
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="source-link">{children}<ArrowUpRight size={13} /></a>;
}
