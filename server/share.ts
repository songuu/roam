import type { JournalEntry, ShareDraft, TravelPlan } from '../shared/types';

export function createShareDraft(_trip: TravelPlan, entries: JournalEntry[], platform: ShareDraft['platform']): ShareDraft {
  const photoIds = [...new Set(entries.flatMap(entry=>entry.photos.map(photo=>photo.id)))];
  const locations = [...new Set(entries.map(entry=>entry.location).filter(Boolean))];
  const title = platform === 'xiaohongshu' ? `旅行记｜${entries[0].title}`.slice(0,40) : `${entries[0].title} · 旅行碎片`;
  const memories = entries.map(entry=>`${entry.date} · ${entry.location || '旅途'}\n${entry.title}\n${entry.content}`).join('\n\n');
  const tags = platform === 'xiaohongshu' ? ['旅行记录', ...locations.slice(0,3)] : [];
  // Only first-hand journal entries establish where the traveler actually went.
  const body = platform === 'xiaohongshu' ? `${memories}\n\n留给下次出发的自己，也分享给喜欢旅行的你。` : `${memories}\n\n把旅途里的这些瞬间留下来。`;
  return {platform,title,body,tags,photoIds,warnings:['文案仅依据所选旅途记录生成，请在发布前检查事实与隐私；尚未发布到平台。'],generatedAt:new Date().toISOString()};
}
