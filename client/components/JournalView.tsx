import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, Camera, ImagePlus, LoaderCircle, MapPin, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { JournalEntry, JournalInput, Photo, TravelPlan } from '../../shared/types';
import { journalSchema } from '../../shared/schema';
import { api } from '../api';
import { EmptyState, PageHeading, shortDate, TripPicker } from './ui';

interface Props {
  trip: TravelPlan; trips: TravelPlan[]; entries: JournalEntry[]; loading: boolean; loadError: string | null;
  onSelectTrip: (id: string) => void; onChanged: () => void; notify: (message: string) => void; onBusyChange: (busy: boolean) => void;
}
const moodLabels: Record<JournalEntry['mood'], string> = { happy: '开心的', calm: '松弛的', tired: '有点累', amazing: '惊喜满满' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
interface StoredDraft { input: JournalInput; photos: Photo[]; editingId: string | null; draftUploads: string[] }
function readDraft(tripId: string): StoredDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`roam:journal-draft:${tripId}`) || 'null');
    if (!value || typeof value.input?.title !== 'string' || typeof value.input?.content !== 'string') return null;
    const parsed = journalSchema.safeParse({ ...value.input, title: value.input.title || '草稿', content: value.input.content || '草稿' });
    if (!parsed.success || !Array.isArray(value.photos) || !value.photos.every((photo: Photo) => typeof photo.id === 'string' && typeof photo.url === 'string' && photo.url.startsWith('/api/')) || !Array.isArray(value.draftUploads) || !value.draftUploads.every((id: unknown) => typeof id === 'string')) return null;
    return { input: { ...parsed.data, title: value.input.title, content: value.input.content }, photos: value.photos, draftUploads: value.draftUploads, editingId: typeof value.editingId === 'string' ? value.editingId : null };
  } catch { return null; }
}

export default function JournalView({ trip, trips, entries, loading, loadError, onSelectTrip, onChanged, notify, onBusyChange }: Props) {
  const emptyInput = (): JournalInput => ({ date: trip.request.startDate, location: trip.request.destination, title: '', content: '', mood: 'happy', photoIds: [] });
  const [initialDraft] = useState(() => readDraft(trip.id));
  const [input, setInput] = useState<JournalInput>(() => initialDraft?.input ?? emptyInput());
  const [photos, setPhotos] = useState<Photo[]>(initialDraft?.photos ?? []);
  const [editingId, setEditingId] = useState<string | null>(initialDraft?.editingId ?? null);
  const [draftUploads, setDraftUploads] = useState<string[]>(initialDraft?.draftUploads ?? []);
  const [draftTripId, setDraftTripId] = useState(trip.id);
  const [restored, setRestored] = useState(!!initialDraft);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLFormElement>(null);
  const reset = () => { setInput(emptyInput()); setPhotos([]); setEditingId(null); setDraftUploads([]); setError(null); setRestored(false); };
  useEffect(() => {
    const saved = readDraft(trip.id);
    setInput(saved?.input ?? emptyInput()); setPhotos(saved?.photos ?? []); setEditingId(saved?.editingId ?? null); setDraftUploads(saved?.draftUploads ?? []); setDraftTripId(trip.id); setRestored(!!saved); setError(null);
  }, [trip.id]);
  useEffect(() => {
    if (draftTripId !== trip.id) return;
    try {
      if (input.title || input.content || photos.length || editingId) sessionStorage.setItem(`roam:journal-draft:${trip.id}`, JSON.stringify({ input, photos, editingId, draftUploads } satisfies StoredDraft));
      else sessionStorage.removeItem(`roam:journal-draft:${trip.id}`);
    } catch { notify('浏览器无法暂存手记草稿，离开前请保存或清空手记。'); }
  }, [input, photos, editingId, draftUploads, draftTripId, trip.id, notify]);
  useEffect(() => { onBusyChange(busy || uploading || !!deletingId); return () => onBusyChange(false); }, [busy, uploading, deletingId, onBusyChange]);
  const change = <K extends keyof JournalInput>(key: K, value: JournalInput[K]) => setInput(previous => ({ ...previous, [key]: value }));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (photos.length + selected.length > 9) { setError('每篇手记最多 9 张照片，请减少选择。'); return; }
    if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('请上传 JPEG、PNG 或 WebP 图片。'); return; }
    setUploading(true); setError(null);
    try {
      for (const file of selected) {
        const photo = await api.upload(file);
        setPhotos(previous => [...previous, photo]);
        setDraftUploads(previous => [...previous, photo.id]);
      }
    } catch (uploadError) { setError(`照片上传未全部完成：${errorMessage(uploadError)}。已上传的照片仍然保留。`); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function removePhoto(photo: Photo) {
    setError(null); setBusy(true);
    try {
      if (draftUploads.includes(photo.id)) {
        await api.deletePhoto(photo.id);
        setDraftUploads(previous => previous.filter(id => id !== photo.id));
      }
      setPhotos(previous => previous.filter(item => item.id !== photo.id));
    } catch (removeError) { setError(`移除照片失败：${errorMessage(removeError)}`); }
    finally { setBusy(false); }
  }
  async function discardUploads() {
    for (const id of draftUploads) {
      await api.deletePhoto(id);
      setDraftUploads(previous => previous.filter(item => item !== id));
      setPhotos(previous => previous.filter(photo => photo.id !== id));
    }
  }
  async function cancelEdit() {
    setBusy(true);
    try { await discardUploads(); reset(); }
    catch (cancelError) { setError(`临时照片清理失败：${errorMessage(cancelError)}，请重试。`); }
    finally { setBusy(false); }
  }
  async function save() {
    const parsed = journalSchema.safeParse({ ...input, photoIds: photos.map(photo => photo.id) });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join('；')); return; }
    setBusy(true); setError(null);
    try {
      if (editingId) await api.updateEntry(editingId, parsed.data);
      else await api.createEntry(trip.id, parsed.data);
      notify(editingId ? '手记已更新，回忆好好收好了。' : '手记已保存，回忆好好收好了。');
      reset(); onChanged();
    } catch (saveError) { setError(errorMessage(saveError)); }
    finally { setBusy(false); }
  }
  async function edit(entry: JournalEntry) {
    if (draftUploads.length || input.title || input.content) {
      if (!window.confirm('当前有未保存的内容，切换到这篇手记进行编辑？')) return;
    }
    setBusy(true); setError(null);
    try {
      await discardUploads();
      setEditingId(entry.id); setInput({ date: entry.date, location: entry.location, title: entry.title, content: entry.content, mood: entry.mood, photoIds: entry.photos.map(photo => photo.id) });
      setPhotos(entry.photos); setDraftUploads([]); setRestored(false); editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (editError) { setError(`切换编辑前的临时照片清理失败：${errorMessage(editError)}。当前草稿已保留。`); }
    finally { setBusy(false); }
  }
  async function removeEntry(entry: JournalEntry) {
    if (!window.confirm(`删除手记「${entry.title}」？这条记录将从本地工作空间移除。`)) return;
    setDeletingId(entry.id); setError(null);
    try { if (editingId === entry.id) await discardUploads(); await api.deleteEntry(entry.id); if (editingId === entry.id) reset(); onChanged(); notify('手记已删除。'); }
    catch (deleteError) { setError(errorMessage(deleteError)); }
    finally { setDeletingId(null); }
  }

  return <div><PageHeading eyebrow="LITTLE MOMENTS, BIG MEMORIES" title="把路上的小美好，留在这里" description="一张照片，一点心情。让旅程成为自己的故事。" action={<TripPicker trips={trips} selected={trip.id} onChange={id => { if (busy || uploading || deletingId) notify('请等待当前手记操作完成。'); else onSelectTrip(id); }} />} />
    <div className="journal-layout"><section className="journal-feed"><div className="section-heading"><h2><BookOpen size={19} />我的旅途手记</h2><span>{entries.length} 篇记载</span></div>
      {loadError && <div className="error-banner" role="alert">{loadError}<button type="button" className="text-button" onClick={onChanged}>重试加载</button></div>}
      {loading ? <div className="loading-panel" role="status"><LoaderCircle className="spinning" size={22} />正在取出你的回忆…</div> : entries.length === 0 ? <EmptyState icon={<Camera size={34} />} title="第一篇回忆，从此刻开始" description="写下真实发生的事，上传亲手拍下的照片。之后，途伴会帮你整理成分享文案。" /> : entries.map(entry => <article className="journal-entry paper-card" key={entry.id}>
        {entry.photos.length > 0 && <div className={`journal-photo-grid photos-${Math.min(entry.photos.length, 3)}`}>{entry.photos.map(photo => <img key={photo.id} src={photo.url} alt={photo.caption || `${entry.title}的旅途照片`} loading="lazy" />)}</div>}
        <div className="entry-content"><div className="entry-meta"><span><CalendarDays size={13} />{shortDate(entry.date)}</span>{entry.location && <span><MapPin size={13} />{entry.location}</span>}<span className="mood-pill">{moodLabels[entry.mood]}</span></div><h3>{entry.title}</h3><p>{entry.content}</p><div className="entry-actions"><span>{entry.photos.length ? `${entry.photos.length} 张照片 · ` : ''}真实旅途记载</span><div className="button-row"><button type="button" className="text-button" aria-label={`编辑手记${entry.title}`} onClick={() => edit(entry)} disabled={busy || uploading}><Pencil size={14} />编辑</button><button type="button" className="text-button danger-text" aria-label={`删除手记${entry.title}`} onClick={() => removeEntry(entry)} disabled={deletingId === entry.id || busy || uploading}><Trash2 size={14} />{deletingId === entry.id ? '删除中…' : '删除'}</button></div></div></div>
      </article>)}</section>
      <form ref={editor} className="journal-editor paper-card" onSubmit={event => { event.preventDefault(); void save(); }}><div className="section-heading"><h2><Pencil size={18} />{editingId ? '编辑这一刻' : '记下这一刻'}</h2>{editingId && <span>正在编辑</span>}</div>{restored && <p className="draft-notice" role="status">已恢复未保存的手记草稿，包含 {draftUploads.length} 张临时照片。你可以继续保存或清空草稿。</p>}<div className="field-grid two-columns"><label>记录日期<input aria-label="记录日期" type="date" value={input.date} onChange={event => change('date', event.target.value)} disabled={busy || uploading} required /></label><label>地点<input aria-label="记录地点" placeholder="在哪里遇见这份美好" value={input.location} maxLength={120} onChange={event => change('location', event.target.value)} disabled={busy || uploading} /></label><label className="wide-field">手记标题<input aria-label="手记标题" placeholder="给这一刻起个名字" value={input.title} maxLength={100} onChange={event => change('title', event.target.value)} disabled={busy || uploading} required /></label><label className="wide-field">旅途记载<textarea aria-label="旅途记载" placeholder="今天去了哪里？遇见了谁？什么让你舍不得忘记？" rows={6} value={input.content} maxLength={10000} onChange={event => change('content', event.target.value)} disabled={busy || uploading} required /></label><label className="wide-field">今天的心情<select aria-label="今天的心情" value={input.mood} onChange={event => change('mood', event.target.value as JournalEntry['mood'])} disabled={busy || uploading}>{Object.entries(moodLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
        <div className="photo-upload-heading"><span>旅途照片</span><small>{photos.length}/9 · JPEG / PNG / WebP</small></div><div className="editor-photos">{photos.map(photo => <div key={photo.id}><img src={photo.url} alt={photo.caption || '待保存的旅途照片'} /><button type="button" aria-label="移除这张照片" onClick={() => void removePhoto(photo)} disabled={busy || uploading}><X size={13} /></button></div>)}{photos.length < 9 && <button type="button" className="upload-photo-button" onClick={() => fileInput.current?.click()} disabled={uploading || busy}>{uploading ? <LoaderCircle size={24} className="spinning" /> : <ImagePlus size={24} />}<span>{uploading ? '上传中…' : '添加照片'}</span></button>}</div><input ref={fileInput} className="sr-only" aria-label="上传旅途照片" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => void upload(event.target.files)} disabled={uploading || busy} />
        {error && <div className="error-banner" role="alert">{error}</div>}<div className="journal-editor-footer"><button type="button" className="button secondary" disabled={busy || uploading} onClick={() => void cancelEdit()}><Plus size={15} />{editingId ? '取消编辑' : '清空草稿'}</button><button className="button primary" type="submit" disabled={busy || uploading}>{busy ? <LoaderCircle size={16} className="spinning" /> : <Save size={16} />}保存手记</button></div><p className="fine-print">记录保存到当前浏览器关联的本地工作空间。</p>
      </form>
    </div></div>;
}
