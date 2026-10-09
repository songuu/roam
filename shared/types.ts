export const INTERESTS = ['nature', 'culture', 'food', 'photography', 'citywalk', 'shopping'] as const;
export type Interest = typeof INTERESTS[number];
export type Pace = 'relaxed' | 'balanced' | 'packed';
export type DataStatus = 'live' | 'catalog' | 'estimate' | 'seasonal' | 'unavailable' | 'scenario';
export const INTEREST_LABELS: Record<Interest, string> = { nature: '山水自然', culture: '人文历史', food: '当地美食', photography: '摄影出片', citywalk: '城市漫步', shopping: '逛街购物' };
export interface TravelRequest {
  prompt: string; destination: string; origin: string; startDate: string; endDate: string;
  adults: number; children: number; budget: number; pace: Pace;
  transport: 'public' | 'driving' | 'mixed'; interests: Interest[];
  dietary: string; accessibility: string; avoidCrowds: boolean;
  weatherScenario: 'auto' | 'rain' | 'clear';
}
export interface Profile {
  displayName: string; interests: Interest[]; pace: Pace; dietary: string;
  accessibility: string; avoidCrowds: boolean; memoryEnabled: boolean;
  learnedWeights: Record<Interest, number>; feedbackCount: number; updatedAt: string;
}
export interface Source { id: string; label: string; status: DataStatus; url?: string; fetchedAt?: string; note: string }
export interface Weather { date: string; status: DataStatus; low?: number; high?: number; precipitationProbability?: number; summary: string; sourceId: string; rain: boolean }
export interface Stop {
  id: string; name: string; kind: 'attraction' | 'meal' | 'transport' | 'checkin' | 'free';
  startTime: string; endTime: string; lat: number; lon: number; address: string;
  description: string; why: string; tags: Interest[]; estimatedCost: number;
  durationMinutes: number; travelMinutes: number; distanceKm: number;
  crowd: 'low' | 'medium' | 'high'; status: DataStatus; sourceId: string;
  indoor: boolean; accessibility: string; mapUrl: string;
  alternatives: { name: string; reason: string }[];
}
export interface DayPlan {
  date: string; city: string; theme: string; stops: Stop[]; weather: Weather;
  lodging: { area: string; note: string; nightlyCost: number }; notes: string[];
}
export interface Budget {
  currency: 'CNY'; total: number; perPerson: number; limit: number; withinBudget: boolean;
  breakdown: { accommodation: number; food: number; transport: number; tickets: number; buffer: number }; note: string;
}
export interface AgentStep { stage: string; label: string; detail: string; status: 'done' | 'degraded' }
export interface TravelPlan {
  id: string; title: string; summary: string; request: TravelRequest; days: DayPlan[];
  budget: Budget; packing: string[]; warnings: string[]; sources: Source[];
  reasoning: string[]; agentTrace: AgentStep[]; createdAt: string; updatedAt: string; revision: number;
}
export interface Destination { name: string; subtitle: string; lat: number; lon: number; image: string; tags: Interest[] }
export interface Photo { id: string; url: string; caption: string }
export interface JournalEntry {
  id: string; tripId: string; date: string; location: string; title: string; content: string;
  mood: 'happy' | 'calm' | 'tired' | 'amazing'; photos: Photo[]; createdAt: string; updatedAt: string;
}
export interface JournalInput { date: string; location: string; title: string; content: string; mood: JournalEntry['mood']; photoIds: string[] }
export interface ShareDraft { platform: 'xiaohongshu' | 'wechat'; title: string; body: string; tags: string[]; photoIds: string[]; warnings: string[]; generatedAt: string }
export interface Feedback { stopId: string; interest: Interest; rating: -1 | 1; note?: string }
export interface AppConfig { mode: 'local' | 'model'; modelConfigured: boolean; placesConfigured: boolean; weatherEnabled: boolean; workspaceMode: string }
export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface IntentResult { request: TravelRequest; extracted: string[]; warnings: string[]; mode: 'rules' | 'model' }
