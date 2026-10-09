import type { AppConfig, Destination, TravelPlan, TravelRequest, Profile, JournalEntry, JournalInput, Photo, ShareDraft, Feedback, IntentResult } from '../shared/types';
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin' });
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error?.message || `请求失败（${response.status}），请重试`); }
  return response.status === 204 ? undefined as T : response.json();
}
let configRequest: Promise<AppConfig> | null = null;
export const api = {
  config: () => {
    // StrictMode can replay bootstrap before its first cookie has arrived.
    // Sharing the in-flight handshake prevents two anonymous workspaces racing.
    if (!configRequest) configRequest=request<AppConfig>('/config').finally(()=>{configRequest=null;});
    return configRequest;
  }, destinations: () => request<Destination[]>('/destinations'),
  interpret: (input: TravelRequest) => request<IntentResult>('/intent', {method:'POST',body:JSON.stringify(input)}),
  profile: () => request<Profile>('/profile'), saveProfile: (profile: Pick<Profile, 'displayName'|'interests'|'pace'|'dietary'|'accessibility'|'avoidCrowds'|'memoryEnabled'>) => request<Profile>('/profile', {method:'PUT', body:JSON.stringify(profile)}),
  clearMemory: () => request<Profile>('/profile/memory', {method:'DELETE'}),
  trips: () => request<TravelPlan[]>('/trips'), createTrip: (input: TravelRequest) => request<TravelPlan>('/trips', {method:'POST', body:JSON.stringify(input)}),
  replan: (id: string, input: TravelRequest, revision?: number) => request<TravelPlan>(`/trips/${id}/replan`, {method:'POST', body:JSON.stringify({request:input, revision})}),
  deleteTrip: (id: string) => request<void>(`/trips/${id}`, {method:'DELETE'}),
  journal: (id: string) => request<JournalEntry[]>(`/trips/${id}/journal`),
  createEntry: (id: string, input: JournalInput) => request<JournalEntry>(`/trips/${id}/journal`, {method:'POST',body:JSON.stringify(input)}),
  updateEntry: (id: string, input: JournalInput) => request<JournalEntry>(`/journal/${id}`, {method:'PATCH',body:JSON.stringify(input)}),
  deleteEntry: (id: string) => request<void>(`/journal/${id}`, {method:'DELETE'}),
  upload: (file: File) => {const body = new FormData(); body.append('photo',file); return request<Photo>('/uploads',{method:'POST',body});},
  deletePhoto: (id: string) => request<void>(`/photos/${id}?unreferenced=true`,{method:'DELETE'}),
  share: (id: string, platform: ShareDraft['platform'], entryIds?: string[]) => request<ShareDraft>(`/trips/${id}/share`,{method:'POST',body:JSON.stringify({platform,entryIds})}),
  feedback: (id: string, input: Feedback) => request<Profile>(`/trips/${id}/feedback`,{method:'POST',body:JSON.stringify(input)}),
  exportUrl: (id: string, format: 'markdown'|'json'|'ics') => `/api/trips/${id}/export?format=${format}`,
};
