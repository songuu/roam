import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Compass, Leaf, LoaderCircle, MapPin, Menu, Mountain, Plus, Route, Settings2, Share2, Sparkles, Trash2, Users, X } from 'lucide-react';
import type { AppConfig, Destination, JournalEntry, Profile, Stop, TravelPlan, TravelRequest } from '../shared/types';
import { INTEREST_LABELS } from '../shared/types';
import { travelRequestSchema } from '../shared/schema';
import { api } from './api';
import TravelForm from './components/TravelForm';
import TripDetail from './components/TripDetail';
import JournalView from './components/JournalView';
import ShareStudio from './components/ShareStudio';
import ProfileView from './components/ProfileView';
import { addDays, Brand, EmptyState, money, PageHeading, shortDate, todayInShanghai } from './components/ui';

type View = 'explore' | 'trips' | 'journal' | 'share' | 'profile';
const navigation = [
  { id: 'explore' as const, label: '开始探索', icon: Compass }, { id: 'trips' as const, label: '我的行程', icon: Route },
  { id: 'journal' as const, label: '旅途手记', icon: BookOpen }, { id: 'share' as const, label: '分享工作室', icon: Share2 },
  { id: 'profile' as const, label: '旅行偏好', icon: Settings2 },
];
const heroImage = 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=85';
const cityImages: Record<string, string> = {
  '杭州': 'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=650&q=80',
  '成都': 'https://images.unsplash.com/photo-1757210616810-712b5bfc7317?auto=format&fit=crop&w=650&q=80',
  '北京': 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=650&q=80',
  '上海': 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?auto=format&fit=crop&w=650&q=80',
  '苏州': 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=650&q=80',
  '桂林': 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=650&q=80',
};
function initialRequest(): TravelRequest {
  const startDate = addDays(todayInShanghai(), 7);
  return { prompt: '', destination: '杭州', origin: '', startDate, endDate: addDays(startDate, 2), adults: 2, children: 0, budget: 5000, pace: 'balanced', transport: 'public', interests: ['nature', 'food', 'citywalk'], dietary: '', accessibility: '', avoidCrowds: true, weatherScenario: 'auto' };
}
function profileFields(profile: Profile) { return { interests: profile.interests, pace: profile.pace, dietary: profile.dietary, accessibility: profile.accessibility, avoidCrowds: profile.avoidCrowds }; }
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
function TravelImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return failed ? <div className={`image-unavailable ${className || ''}`}><Mountain size={28} /><span>灵感配图暂不可用</span></div> : <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />;
}

export default function App() {
  const [view, setView] = useState<View>('explore');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<TravelPlan[]>([]);
  const [request, setRequest] = useState<TravelRequest>(initialRequest);
  const [requestTouched, setRequestTouched] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootVersion, setBootVersion] = useState(0);
  const [connectionErrors, setConnectionErrors] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [entriesVersion, setEntriesVersion] = useState(0);
  const [journalWorking, setJournalWorking] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);
  const feedbackInFlight = useRef(false);
  const profileEpoch = useRef(0);
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const selectedTrip = trips.find(trip => trip.id === selectedTripId) ?? trips[0] ?? null;
  const activeTrip = trips.find(trip => trip.id === activeTripId) ?? null;
  const notify = useCallback((message: string) => setToast(message), []);
  const reloadEntries = useCallback(() => setEntriesVersion(version => version + 1), []);

  useEffect(() => {
    let alive = true;
    setBooting(true);
    async function bootstrap() {
      const errors: string[] = [];
      // Establish the workspace cookie before parallel reads on a first visit.
      try { const value = await api.config(); if (!alive) return; setConfig(value); }
      catch (error) {
        if (!alive) return;
        setConfig(null); setConnectionErrors([`服务配置：${messageOf(error)}`]); setBooting(false);
        return;
      }
      const results = await Promise.allSettled([api.profile(), api.destinations(), api.trips()]);
      if (!alive) return;
      const [profileResult, destinationResult, tripResult] = results;
      if (profileResult.status === 'fulfilled') { setProfile(profileResult.value); setRequest(previous => previous.prompt || editingTripId ? previous : { ...previous, interests: profileResult.value.interests, pace: profileResult.value.pace, dietary: profileResult.value.dietary, accessibility: profileResult.value.accessibility, avoidCrowds: profileResult.value.avoidCrowds }); }
      else errors.push(`旅行偏好：${messageOf(profileResult.reason)}`);
      if (destinationResult.status === 'fulfilled') setDestinations(destinationResult.value);
      else errors.push(`目的地灵感：${messageOf(destinationResult.reason)}`);
      if (tripResult.status === 'fulfilled') { setTrips(tripResult.value); setSelectedTripId(previous => previous || tripResult.value[0]?.id || ''); }
      else errors.push(`已保存行程：${messageOf(tripResult.reason)}`);
      setConnectionErrors(errors); setBooting(false);
    }
    void bootstrap();
    return () => { alive = false; };
  }, [bootVersion]);
  useEffect(() => {
    if (!selectedTrip) { setEntries([]); return; }
    let alive = true;
    setEntriesLoading(true); setEntriesError(null); setEntries([]);
    api.journal(selectedTrip.id).then(value => { if (alive) setEntries(value); }).catch(error => { if (alive) setEntriesError(messageOf(error)); }).finally(() => { if (alive) setEntriesLoading(false); });
    return () => { alive = false; };
  }, [selectedTrip?.id, entriesVersion]);
  useEffect(() => {
    if (!planning) { setProgress(0); return; }
    const timer = window.setInterval(() => setProgress(stage => Math.min(3, stage + 1)), 1500);
    return () => window.clearInterval(timer);
  }, [planning]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 5500); return () => window.clearTimeout(timer); }, [toast]);

  function navigate(next: View) { if (journalWorking) { notify('请等待照片上传或手记操作完成，再切换页面。'); return; } setView(next); setMobileOpen(false); if (next === 'trips') setActiveTripId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function newTrip() {
    if (journalWorking) { notify('请等待当前手记操作完成。'); return; }
    setRequest({ ...initialRequest(), ...(profile ? profileFields(profile) : {}) }); setRequestTouched(false); setEditingTripId(null); setActiveTripId(null); setPlanningError(null); navigate('explore');
  }
  function updateProfile(value: Profile) { profileEpoch.current++; setProfile(value); if (!requestTouched && !editingTripId) setRequest(previous => ({ ...previous, ...profileFields(value) })); }
  function storeTrip(plan: TravelPlan) { setTrips(previous => [plan, ...previous.filter(trip => trip.id !== plan.id)]); setSelectedTripId(plan.id); setActiveTripId(plan.id); }
  async function generateTrip() {
    const parsed = travelRequestSchema.safeParse(request);
    if (!parsed.success) { setPlanningError(parsed.error.issues.map(issue => issue.message).join('；')); return; }
    const existing = editingTripId ? trips.find(trip => trip.id === editingTripId) : undefined;
    if (editingTripId && !existing) { setPlanningError('原行程已不存在，请取消修改后创建新的旅程。'); return; }
    setPlanning(true); setPlanningError(null); setActionError(null);
    try {
      const result = existing ? await api.replan(existing.id, parsed.data, existing.revision) : await api.createTrip(parsed.data);
      storeTrip(result); setEditingTripId(null); setRequest(result.request); setRequestTouched(true); setView('trips'); window.scrollTo({ top: 0, behavior: 'smooth' }); notify(existing ? '行程已重新安排，并保存为新版本。' : '你的专属行程已生成并保存。');
    } catch (error) { setPlanningError(messageOf(error)); }
    finally { setPlanning(false); }
  }
  function editTrip(plan: TravelPlan) { setRequest({ ...plan.request, weatherScenario: 'auto' }); setRequestTouched(true); setEditingTripId(plan.id); setPlanningError(null); setView('explore'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function rainReplan(plan: TravelPlan) {
    setPlanning(true); setActionError(null);
    try { const result = await api.replan(plan.id, { ...plan.request, weatherScenario: 'rain' }, plan.revision); storeTrip(result); notify('已按雨天场景重新安排，天气标记为模拟。'); }
    catch (error) { setActionError(messageOf(error)); }
    finally { setPlanning(false); }
  }
  async function deleteTrip(plan: TravelPlan) {
    if (!window.confirm(`删除「${plan.title}」以及关联的手记？建议先下载需要保留的内容。`)) return;
    setDeletingId(plan.id); setActionError(null);
    try {
      const draftKey = `roam:journal-draft:${plan.id}`;
      const storedDraft = sessionStorage.getItem(draftKey);
      const draft = storedDraft ? JSON.parse(storedDraft) : null;
      if (Array.isArray(draft?.draftUploads)) {
        for (const id of [...draft.draftUploads]) {
          if (typeof id !== 'string') continue;
          await api.deletePhoto(id);
          draft.draftUploads = draft.draftUploads.filter((photoId: string) => photoId !== id);
          if (Array.isArray(draft.photos)) draft.photos = draft.photos.filter((photo: { id: string }) => photo.id !== id);
          sessionStorage.setItem(draftKey, JSON.stringify(draft));
        }
      }
      await api.deleteTrip(plan.id); sessionStorage.removeItem(draftKey); setTrips(previous => previous.filter(trip => trip.id !== plan.id)); if (activeTripId === plan.id) setActiveTripId(null); if (editingTripId === plan.id) setEditingTripId(null); notify('行程已从当前工作空间删除。');
    }
    catch (error) { setActionError(messageOf(error)); }
    finally { setDeletingId(null); }
  }
  async function feedback(stop: Stop, rating: -1 | 1) {
    if (!activeTrip || !stop.tags[0] || feedbackInFlight.current) return;
    feedbackInFlight.current=true;
    const epoch=profileEpoch.current;
    setFeedbackBusy(stop.id); setActionError(null);
    try { const result = await api.feedback(activeTrip.id, { stopId: stop.id, interest: stop.tags[0], rating }); if(epoch===profileEpoch.current) setProfile(result); if (result.memoryEnabled) setFeedbackRatings(previous => ({ ...previous, [`${activeTrip.id}:${stop.id}`]: rating })); notify(epoch!==profileEpoch.current ? '反馈已处理，保留了你刚更新的旅行偏好。' : result.memoryEnabled ? '反馈已收好，下次规划会参考你的偏好。' : '偏好学习已关闭，本次未更新画像。'); }
    catch (error) { setActionError(messageOf(error)); }
    finally { feedbackInFlight.current=false; setFeedbackBusy(null); }
  }
  function chooseDestination(destination: Destination) { setRequest(previous => ({ ...previous, destination: destination.name, interests: destination.tags, weatherScenario: 'auto' })); setRequestTouched(true); setEditingTripId(null); setPlanningError(null); document.getElementById('travel-prompt')?.focus(); document.getElementById('travel-prompt')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

  return <div className="app-shell">
    <header className="mobile-header"><Brand /><button className="icon-button" aria-label={mobileOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button></header>
    {mobileOpen && <button className="sidebar-scrim" aria-label="关闭导航遮罩" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}><Brand /><div className="nav-caption">YOUR TRAVEL COMPANION</div><nav aria-label="主要导航">{navigation.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-label={item.label} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={19} strokeWidth={1.7} /><span>{item.label}</span>{item.id === 'trips' && trips.length > 0 ? <small>{trips.length}</small> : view === item.id ? <ChevronRight size={14} /> : null}</button>)}</nav><div className="sidebar-note"><span className="note-leaf"><Leaf size={24} strokeWidth={1.3} /></span><h3>旅程不必赶路</h3><p>把时间留给风景，<br />把安排交给途伴。</p><div className="note-line" /></div><div className="sidebar-bottom"><div className="workspace-status"><span className={`connection-dot ${config ? 'online' : ''}`} />{config ? '本地私人工作空间' : booting ? '正在连接工作空间' : '工作空间暂未连接'}</div><div className="profile-mini"><span>{profile?.displayName?.slice(0, 1) || '旅'}</span><div><strong>{profile?.displayName || '旅行者'}</strong><small>{profile ? `${profile.feedbackCount} 次反馈，让旅程更懂你` : '欢迎开始你的下一段旅程'}</small></div><button className="icon-button" aria-label="打开旅行偏好" onClick={() => navigate('profile')}><Settings2 size={16} /></button></div></div></aside>
    <main className="main-content"><div className="content-container"><div className="topbar"><span>慢慢探索，好好生活 <span className="topbar-dot">·</span> <span className="topbar-en">GO SOMEWHERE THAT FEELS LIKE YOU</span></span><span className="mode-pill"><span className={`connection-dot ${config ? 'online' : ''}`} />{config ? config.mode === 'model' ? '模型辅助模式' : '本地规则模式' : booting ? '连接中' : '服务未连接'}<span className="mode-divider" />旅行管家</span></div>
      {connectionErrors.length > 0 && <div className="error-banner connection-error" role="alert"><div><strong>部分服务未能加载</strong><p>{connectionErrors.join('；')}</p></div><button type="button" className="button secondary" disabled={booting} onClick={() => setBootVersion(value => value + 1)}>重试连接</button></div>}
      {actionError && <div className="error-banner" role="alert">{actionError}<button className="icon-button" aria-label="关闭错误提示" onClick={() => setActionError(null)}><X size={15} /></button></div>}
      {view === 'explore' && <><div className="explore-heading"><div><span className="eyebrow">HELLO, {profile?.displayName || 'TRAVELER'}</span><h1>下一站，去哪里？<span>✦</span></h1><p>从一个念头开始，遇见属于你的风景。</p></div><span className="season-label"><Leaf size={15} />给自己，安排一场出走</span></div><section className="hero"><img src={heroImage} alt="山间湖泊与远山，旅行灵感摄影" className="hero-image" fetchPriority="high" /><div className="hero-shade" /><div className="hero-content"><span className="hero-eyebrow">LESS PLANNING. MORE LIVING.</span><h2>把想去的远方，<br />变成刚刚好的旅程。</h2><p>懂你的喜好，也顾得上旅途中的每一件小事。</p><span className="hero-signature">Roam freely, travel thoughtfully.</span></div><span className="hero-caption"><MapPin size={12} />下一段风景，留给你</span></section>
        <TravelForm request={request} onChange={value => { setRequest(value); setRequestTouched(true); }} onSubmit={() => void generateTrip()} onCancelEdit={() => { setActiveTripId(editingTripId); setEditingTripId(null); setPlanningError(null); setView('trips'); }} busy={planning} initializing={booting} editing={!!editingTripId} progress={progress} error={planningError} />
        <section className="destinations-section"><div className="destinations-heading"><div><span className="eyebrow">A LITTLE INSPIRATION</span><h2>总有一座城，正合你心意</h2><p>先选一个方向，剩下的交给我们一起慢慢安排。</p></div><span><ArrowDown size={15} />找到出发的灵感</span></div>{booting ? <div className="destination-grid">{Array.from({ length: 6 }, (_, index) => <div className="destination-skeleton" key={index} />)}</div> : destinations.length > 0 ? <div className="destination-grid">{destinations.map(destination => <button key={destination.name} className="destination-card" onClick={() => chooseDestination(destination)} disabled={planning} aria-label={`探索${destination.name}`}><TravelImage src={destination.image || cityImages[destination.name] || heroImage} alt={`${destination.name}旅行灵感配图`} /><span className="destination-shade" /><span className="destination-number">0{destinations.indexOf(destination) + 1}</span><div><span>{destination.tags.slice(0, 2).map(tag => INTEREST_LABELS[tag]).join(' · ')}</span><h3>{destination.name}<ArrowRight size={18} /></h3><p>{destination.subtitle}</p></div></button>)}</div> : <div className="muted destination-unavailable">目的地灵感尚未加载。你仍然可以填写想去的城市，再尝试生成行程。</div>}<div className="destination-footnote"><span>配图：Unsplash 旅行灵感摄影</span><span>6 城本地资料 · 更多目的地需地点服务支持</span></div></section>
        <div className="experience-strip"><span><Route size={20} /><div><strong>把复杂留给规划</strong><small>路线与预算，一起照顾</small></div></span><span><BookOpen size={20} /><div><strong>把美好留在手记</strong><small>照片与感受，妥帖收藏</small></div></span><span><HeartIcon /><div><strong>每一次，更懂你</strong><small>从真实反馈，慢慢了解</small></div></span></div>
      </>}
      {view === 'trips' && (activeTrip ? <TripDetail plan={activeTrip} busy={planning} onBack={() => setActiveTripId(null)} onEdit={() => editTrip(activeTrip)} onRain={() => void rainReplan(activeTrip)} onFeedback={(stop, rating) => void feedback(stop, rating)} feedbackBusy={feedbackBusy} feedbackRatings={feedbackRatings} /> : <><PageHeading eyebrow="YOUR UPCOMING CHAPTERS" title="每一场出发，都好好安排" description="已保存的行程都在这里。随时打开，按心情和天气调整。" action={<button className="button primary" onClick={newTrip}><Plus size={17} />规划新旅程</button>} />{booting ? <div className="loading-panel" role="status"><LoaderCircle size={22} className="spinning" />正在加载行程…</div> : trips.length === 0 ? <EmptyState icon={<Compass size={36} />} title="你的下一段旅程，还没有开始" description="告诉途伴你的目的地和小期待，生成第一份专属行程。" action={<button className="button primary" onClick={newTrip}>开始规划<ArrowRight size={16} /></button>} /> : <div className="saved-trips-grid">{trips.map(trip => <article key={trip.id} className="saved-trip paper-card"><div className="saved-trip-image"><TravelImage src={cityImages[trip.days[0]?.city] || heroImage} alt={`${trip.request.destination}旅行灵感配图`} /><span>{trip.days.length} DAYS</span></div><div className="saved-trip-content"><span className="eyebrow">{trip.request.destination}</span><h2>{trip.title}</h2><p>{trip.summary}</p><div className="saved-trip-meta"><span><CalendarDays size={14} />{shortDate(trip.request.startDate)}</span><span><Users size={14} />{trip.request.adults + trip.request.children} 人</span><span>约 ¥{money(trip.budget.total)}</span></div><div className="saved-trip-actions"><button className="text-button" aria-label={`打开行程${trip.title}`} onClick={() => { setActiveTripId(trip.id); setSelectedTripId(trip.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>打开行程<ArrowRight size={15} /></button><button className="icon-button danger-text" aria-label={`删除行程${trip.title}`} disabled={deletingId === trip.id} onClick={() => void deleteTrip(trip)}>{deletingId === trip.id ? <LoaderCircle size={15} className="spinning" /> : <Trash2 size={15} />}</button></div></div></article>)}</div>}</>)}
      {(view === 'journal' || view === 'share') && !selectedTrip && <><PageHeading eyebrow={view === 'journal' ? 'COLLECT YOUR MEMORIES' : 'STORIES WORTH SHARING'} title={view === 'journal' ? '旅途手记' : '分享工作室'} description="每个好故事，都从一场真实的旅行开始。" /><EmptyState icon={view === 'journal' ? <BookOpen size={34} /> : <Share2 size={34} />} title="先开启你的第一段旅程" description="生成行程后，你可以为这趟旅行保存照片与文字，再整理成分享草稿。" action={<button className="button primary" onClick={newTrip}>规划我的旅程<ArrowRight size={16} /></button>} /></>}
      {view === 'journal' && selectedTrip && <JournalView trip={selectedTrip} trips={trips} entries={entries} loading={entriesLoading} loadError={entriesError} onSelectTrip={setSelectedTripId} onChanged={reloadEntries} notify={notify} onBusyChange={setJournalWorking} />}
      {view === 'share' && selectedTrip && <ShareStudio trip={selectedTrip} trips={trips} entries={entries} loading={entriesLoading} loadError={entriesError} onSelectTrip={setSelectedTripId} onReload={reloadEntries} onJournal={() => navigate('journal')} notify={notify} />}
      {view === 'profile' && (profile ? <ProfileView profile={profile} onUpdated={updateProfile} notify={notify} /> : <div className="loading-panel" role="status">{booting ? <><LoaderCircle size={22} className="spinning" />正在读取旅行偏好…</> : <>旅行偏好暂未加载。<button className="button secondary" onClick={() => setBootVersion(value => value + 1)}>重试加载偏好</button></>}</div>)}
      <footer className="app-footer"><span>途伴 <em>Roam</em> · 让出发这件事，简单一点。</span><span>DESIGNED FOR THE WAY YOU TRAVEL <Leaf size={12} /></span></footer>
    </div></main>{toast && <div className="toast" role="status"><span><Check size={17} /></span>{toast}<button className="icon-button" aria-label="关闭操作提示" onClick={() => setToast(null)}><X size={15} /></button></div>}
  </div>;
}
function HeartIcon() { return <Sparkles size={20} />; }
