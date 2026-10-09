import { useEffect, useState } from 'react';
import { Brain, Heart, Leaf, LoaderCircle, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { INTERESTS, INTEREST_LABELS, type Profile } from '../../shared/types';
import { profileSchema } from '../../shared/schema';
import { api } from '../api';
import { PageHeading } from './ui';

type EditableProfile = Pick<Profile, 'displayName' | 'interests' | 'pace' | 'dietary' | 'accessibility' | 'avoidCrowds' | 'memoryEnabled'>;
interface Props { profile: Profile; onUpdated: (profile: Profile) => void; notify: (message: string) => void }
function editable(profile: Profile): EditableProfile { return { displayName: profile.displayName, interests: profile.interests, pace: profile.pace, dietary: profile.dietary, accessibility: profile.accessibility, avoidCrowds: profile.avoidCrowds, memoryEnabled: profile.memoryEnabled }; }
export default function ProfileView({ profile, onUpdated, notify }: Props) {
  const [draft, setDraft] = useState<EditableProfile>(() => editable(profile));
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(editable(profile)); }, [profile]);
  const change = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  async function save() {
    const parsed = profileSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join('；')); return; }
    setBusy(true); setError(null);
    try { onUpdated(await api.saveProfile(parsed.data)); notify('旅行偏好已保存，下一次规划会参考这些选择。'); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '偏好保存失败，请重试'); }
    finally { setBusy(false); }
  }
  async function clearMemory() {
    setClearing(true); setError(null);
    try { onUpdated(await api.clearMemory()); notify('推断偏好已清除，你明确填写的偏好仍会生效。'); }
    catch (clearError) { setError(clearError instanceof Error ? clearError.message : '清除失败，请重试'); }
    finally { setClearing(false); }
  }
  return <div><PageHeading eyebrow="A LITTLE MORE LIKE YOU" title="好的旅程，从了解你开始" description="你明确告诉我的，以及一路慢慢发现的，都由你来决定。" /><div className="profile-layout"><form className="paper-card profile-form" onSubmit={event => { event.preventDefault(); void save(); }}><div className="section-heading"><h2><SlidersHorizontal size={19} />你明确选择的偏好</h2><span>随时可以修改</span></div><div className="field-grid two-columns"><label>如何称呼你<input aria-label="如何称呼你" value={draft.displayName} maxLength={40} required onChange={event => change('displayName', event.target.value)} disabled={busy || clearing} /></label><label>喜欢的旅行节奏<select aria-label="喜欢的旅行节奏" value={draft.pace} onChange={event => change('pace', event.target.value as Profile['pace'])} disabled={busy || clearing}><option value="relaxed">松弛慢游</option><option value="balanced">刚刚好的节奏</option><option value="packed">充实探索</option></select></label><label className="wide-field">长期饮食偏好<input aria-label="长期饮食偏好" placeholder="例如：素食、不吃花生、少辣" value={draft.dietary} maxLength={300} onChange={event => change('dietary', event.target.value)} disabled={busy || clearing} /></label><label className="wide-field">长期行动与无障碍需求<input aria-label="长期行动与无障碍需求" placeholder="例如：不适合登山，需要无障碍路线" value={draft.accessibility} maxLength={300} onChange={event => change('accessibility', event.target.value)} disabled={busy || clearing} /></label></div><fieldset className="interest-fieldset"><legend>一直喜欢的旅行主题</legend><div className="chip-row">{INTERESTS.map(interest => <button type="button" key={interest} className={`choice-chip ${draft.interests.includes(interest) ? 'selected' : ''}`} aria-pressed={draft.interests.includes(interest)} disabled={busy || clearing} onClick={() => change('interests', draft.interests.includes(interest) ? draft.interests.filter(item => item !== interest) : [...draft.interests, interest])}>{INTEREST_LABELS[interest]}</button>)}</div></fieldset><label className="checkbox-field"><input type="checkbox" checked={draft.avoidCrowds} onChange={event => change('avoidCrowds', event.target.checked)} disabled={busy || clearing} /><Leaf size={16} />优先避开人潮</label><div className="learning-toggle"><div><h3><Brain size={17} />从反馈中了解我</h3><p>根据行程中“喜欢 / 不喜欢”的反馈调整推荐。关闭后不再更新推断权重。</p></div><label className="switch"><input aria-label="开启偏好学习" type="checkbox" checked={draft.memoryEnabled} onChange={event => change('memoryEnabled', event.target.checked)} disabled={busy || clearing} /><span /></label></div>{error && <div className="error-banner" role="alert">{error}</div>}<button type="submit" className="button primary" disabled={busy || clearing}>{busy ? <LoaderCircle size={16} className="spinning" /> : <Save size={16} />}保存旅行偏好</button></form><aside className="paper-card learned-profile"><span className="learned-icon"><Heart size={25} strokeWidth={1.5} /></span><span className="eyebrow">LEARNING WITH YOU</span><h2>从每次反馈里，更懂你一点</h2><p>已收到 <strong>{profile.feedbackCount}</strong> 次反馈。下方是系统推断的兴趣权重，不会替代你明确设置的需求。</p><div className="weight-list">{INTERESTS.map(interest => { const weight = profile.learnedWeights[interest]; return <div key={interest}><div><span>{INTEREST_LABELS[interest]}</span><strong>{weight > 0 ? '+' : ''}{weight.toFixed(2)}</strong></div><div className="weight-track"><span className={weight < 0 ? 'negative' : 'positive'} style={{ width: `${Math.min(50, Math.abs(weight) * 15)}%` }} /><i /></div></div>; })}</div><p className="fine-print">0 表示尚无倾向，正值表示增加推荐，负值表示减少推荐。</p><button type="button" className="button secondary full-width" onClick={() => void clearMemory()} disabled={busy || clearing}>{clearing ? <LoaderCircle size={15} className="spinning" /> : <Trash2 size={15} />}清除推断偏好</button><div className="memory-status"><span className={`connection-dot ${profile.memoryEnabled ? 'online' : ''}`} />学习{profile.memoryEnabled ? '已开启' : '已关闭'} · 仅用于当前本地工作空间</div></aside></div></div>;
}
