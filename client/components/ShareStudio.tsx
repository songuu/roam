import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Copy, Download, Image, LoaderCircle, MessageCircle, Sparkles } from 'lucide-react';
import type { JournalEntry, ShareDraft, TravelPlan } from '../../shared/types';
import { api } from '../api';
import { downloadShareImage, downloadText } from '../export';
import { EmptyState, PageHeading, shortDate, TripPicker } from './ui';

interface Props { trip: TravelPlan; trips: TravelPlan[]; entries: JournalEntry[]; loading: boolean; loadError: string | null; onSelectTrip: (id: string) => void; onReload: () => void; onJournal: () => void; notify: (message: string) => void }
export default function ShareStudio({ trip, trips, entries, loading, loadError, onSelectTrip, onReload, onJournal, notify }: Props) {
  const [platform, setPlatform] = useState<ShareDraft['platform']>('xiaohongshu');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<ShareDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestEpoch = useRef(0);
  useEffect(() => { requestEpoch.current++; setSelectedIds(entries.map(entry => entry.id)); setDraft(null); setError(null); setBusy(false); }, [entries, trip.id]);
  useEffect(() => { requestEpoch.current++; setDraft(null); setError(null); setBusy(false); }, [platform]);
  const photos = entries.flatMap(entry => entry.photos).filter((photo, index, all) => draft?.photoIds.includes(photo.id) && all.findIndex(item => item.id === photo.id) === index);
  const content = draft ? `${draft.title}\n\n${draft.body}\n\n${draft.tags.map(tag => `#${tag.replace(/^#/, '')}`).join(' ')}`.trim() : '';

  async function generate() {
    const epoch = ++requestEpoch.current;
    setBusy(true); setError(null);
    try { const result = await api.share(trip.id, platform, selectedIds); if (requestEpoch.current === epoch) setDraft(result); }
    catch (generationError) { if (requestEpoch.current === epoch) setError(generationError instanceof Error ? generationError.message : '分享文案生成失败，请重试'); }
    finally { if (requestEpoch.current === epoch) setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(content); notify('分享文案已复制，可粘贴到小红书或朋友圈。'); }
    catch { setError('浏览器暂时无法访问剪贴板，请下载文案或手动复制。'); }
  }
  async function exportImage() {
    if (!draft) return;
    setExporting(true); setError(null);
    try { await downloadShareImage(draft, entries); notify('图文分享卡片已下载。'); }
    catch (exportError) { setError(exportError instanceof Error ? exportError.message : '图片导出失败，请重试'); }
    finally { setExporting(false); }
  }

  return <div><PageHeading eyebrow="STORIES WORTH SHARING" title="把旅行的余温，分享出去" description="从真实手记出发，写成有你风格的旅行故事。" action={<TripPicker trips={trips} selected={trip.id} onChange={onSelectTrip} disabled={busy || exporting} />} />
    <div className="share-layout"><section className="share-controls"><div className="paper-card share-source-card"><div className="section-heading"><h2><BookOpen size={18} />故事来自这些手记</h2><span>{selectedIds.length} 篇已选择</span></div>{loadError && <div className="error-banner" role="alert">{loadError}<button className="text-button" onClick={onReload}>重试加载</button></div>}{loading ? <p className="loading-panel" role="status"><LoaderCircle className="spinning" />正在读取手记…</p> : entries.length === 0 ? <EmptyState title="先留下一点真实的回忆" description="分享文案需要至少一篇手记。去记下旅途中的见闻吧。" action={<button className="button primary" onClick={onJournal}>去写旅途手记<ArrowRight size={16} /></button>} /> : <div className="share-entry-list">{entries.map(entry => <label key={entry.id}><input type="checkbox" checked={selectedIds.includes(entry.id)} disabled={busy} onChange={() => setSelectedIds(previous => previous.includes(entry.id) ? previous.filter(id => id !== entry.id) : [...previous, entry.id])} /><span>{entry.photos[0] ? <img src={entry.photos[0].url} alt="" /> : <BookOpen size={21} />}</span><div><strong>{entry.title}</strong><small>{shortDate(entry.date)} · {entry.photos.length} 张照片</small></div><Check size={16} className={selectedIds.includes(entry.id) ? 'entry-selected-check' : 'hidden'} /></label>)}</div>}</div>
      <div className="paper-card platform-card"><h2>用什么方式讲故事？</h2><div className="platform-options" role="group" aria-label="分享平台"><button type="button" className={platform === 'xiaohongshu' ? 'selected' : ''} aria-pressed={platform === 'xiaohongshu'} disabled={busy} onClick={() => { setPlatform('xiaohongshu'); setDraft(null); }}><span className="platform-icon xhs">小红书</span><strong>小红书</strong><small>攻略、照片与旅途灵感</small></button><button type="button" className={platform === 'wechat' ? 'selected' : ''} aria-pressed={platform === 'wechat'} disabled={busy} onClick={() => { setPlatform('wechat'); setDraft(null); }}><span className="platform-icon wechat"><MessageCircle size={23} /></span><strong>朋友圈</strong><small>给朋友的一封旅行短笺</small></button></div><button className="button primary full-width" disabled={busy || loading || selectedIds.length === 0} onClick={() => void generate()}>{busy ? <LoaderCircle size={17} className="spinning" /> : <Sparkles size={17} />}{busy ? '正在整理故事…' : '生成分享文案'}</button><p className="fine-print">生成可编辑草稿。确认后复制或下载，由你发布。</p></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {draft && <div className="paper-card share-editor"><div className="section-heading"><h2>把文字调成你的语气</h2><span>可自由编辑</span></div><label>分享标题<input aria-label="分享标题" value={draft.title} maxLength={200} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><label>分享正文<textarea aria-label="分享正文" rows={10} value={draft.body} maxLength={20000} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label><div className="share-tags">{draft.tags.map(tag => <span key={tag}>#{tag.replace(/^#/, '')}</span>)}</div>{draft.warnings.length > 0 && <div className="notice-card"><ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}<div className="share-export-actions"><button className="button primary" onClick={() => void copy()}><Copy size={15} />复制文案</button><button className="button secondary" onClick={() => downloadText(`${draft.title || '旅行分享'}.txt`, content)}><Download size={15} />下载文案</button><button className="button secondary" disabled={exporting || photos.length === 0} onClick={() => void exportImage()}>{exporting ? <LoaderCircle size={15} className="spinning" /> : <Image size={15} />}{exporting ? '正在导出…' : '下载图文卡片'}</button></div></div>}
    </section><aside className="share-preview"><span className="eyebrow">PREVIEW · 分享预览</span><div className={`social-preview ${platform}`}><div className="social-preview-header"><span className="social-avatar">途</span><div><strong>我的旅行故事</strong><small>{platform === 'xiaohongshu' ? '小红书图文草稿' : '朋友圈图文草稿'}</small></div><span>•••</span></div>{draft ? <>{photos.length > 0 && <div className="preview-photos">{photos.slice(0, platform === 'xiaohongshu' ? 1 : 9).map(photo => <img key={photo.id} src={photo.url} alt={photo.caption || '所选手记的照片'} />)}{platform === 'xiaohongshu' && photos.length > 1 && <span>1 / {photos.length}</span>}</div>}<div className="preview-body"><h3>{draft.title}</h3><p>{draft.body}</p><div className="share-tags">{draft.tags.map(tag => <span key={tag}>#{tag.replace(/^#/, '')}</span>)}</div></div></> : <div className="preview-placeholder"><Image size={36} strokeWidth={1.2} /><p>你的照片与故事<br />会在这里相遇</p><small>选择手记，生成第一份草稿</small></div>}<div className="social-preview-footer"><span>{draft ? '来自你的真实旅途记录' : '等待你的旅行故事'}</span><span>♡</span></div></div><p>此处是内容预览。平台实际展示与发布规则以对应应用为准。</p></aside></div>
  </div>;
}
