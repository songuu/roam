import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, travelRequestSchema } from '../shared/schema';
import type { TravelRequest } from '../shared/types';
import { generatePlan } from './planner';
import { destinations } from './catalog';

function request(changes: Partial<TravelRequest> = {}): TravelRequest {
  return travelRequestSchema.parse({ prompt: '', destination: '杭州', origin: '', startDate: '2027-05-12', endDate: '2027-05-14', adults: 2, children: 0, budget: 4000, pace: 'balanced', transport: 'public', interests: ['nature'], dietary: '', accessibility: '', avoidCrowds: true, weatherScenario: 'auto', ...changes });
}
beforeEach(() => { vi.stubEnv('WEATHER_ENABLED', 'false'); vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('AMAP_KEY', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('travel planning', () => {
  it('has a real catalog for six supported cities', () => {
    expect(destinations.map(city => city.name)).toEqual(expect.arrayContaining(['杭州', '成都', '大理', '北京', '上海', '西安']));
  });
  it('builds consecutive dates and unique attractions with complete travel context', async () => {
    const plan = await generatePlan(request(), defaultProfile());
    expect(plan.days.map(day => day.date)).toEqual(['2027-05-12', '2027-05-13', '2027-05-14']);
    const visits = plan.days.flatMap(day => day.stops.filter(stop => stop.kind === 'attraction'));
    expect(visits.length).toBeGreaterThanOrEqual(3);
    expect(new Set(visits.map(stop => stop.id)).size).toBe(visits.length);
    expect(plan.days.every(day => day.lodging.area && day.stops.some(stop => stop.kind === 'meal'))).toBe(true);
    expect(plan.packing.length).toBeGreaterThan(3);
    expect(plan.sources.every(source => source.note)).toBe(true);
    expect(plan.agentTrace.some(step => step.detail.includes('规则'))).toBe(true);
    expect(plan.warnings.some(warning => warning.includes('预约'))).toBe(true);
    expect(plan.days.every(day => day.stops.every((stop, index, stops) => index === 0 || stop.startTime >= stops[index - 1].endTime))).toBe(true);
  });
  it('scales cost with group size and warns when a budget cannot fund the trip', async () => {
    const solo = await generatePlan(request({ adults: 1 }), defaultProfile());
    const family = await generatePlan(request({ adults: 4, children: 2 }), defaultProfile());
    expect(family.budget.total).toBeGreaterThan(solo.budget.total * 2);
    const poor = await generatePlan(request({ adults: 6, children: 2, budget: 200 }), defaultProfile());
    expect(poor.budget.withinBudget).toBe(false);
    expect(poor.warnings.some(warning => warning.includes('预算'))).toBe(true);
    expect(Object.values(poor.budget.breakdown).reduce((sum, cost) => sum + cost, 0)).toBe(poor.budget.total);
  });
  it('uses indoor visits and provides rain alternatives without claiming live weather', async () => {
    const plan = await generatePlan(request({ weatherScenario: 'rain', endDate: '2027-05-13' }), defaultProfile());
    expect(plan.days.every(day => day.weather.status === 'scenario' && day.weather.rain)).toBe(true);
    expect(plan.days.flatMap(day => day.stops.filter(stop => stop.kind === 'attraction')).every(stop => stop.indoor)).toBe(true);
    expect(plan.days.some(day => day.stops.some(stop => stop.alternatives.length))).toBe(true);
  });
  it('respects accessibility, children and dietary requirements', async () => {
    const plan = await generatePlan(request({ prompt: '想亲子游，吃素不要辣', children: 2, dietary: '素食，不吃辣', accessibility: '轮椅', endDate: '2027-05-12' }), defaultProfile());
    expect(plan.days.flatMap(day => day.stops.filter(stop => stop.kind === 'meal')).every(stop => stop.description.includes('素食') && stop.description.includes('辣'))).toBe(true);
    expect(plan.warnings.some(warning => warning.includes('无障碍'))).toBe(true);
    expect(plan.days[0].notes.join('')).toContain('儿童');
  });
  it('changes ranking from positive feedback but ignores learning with memory off', async () => {
    const profile = defaultProfile(); profile.interests = []; profile.learnedWeights.culture = 5;
    const base = request({ interests: [], avoidCrowds: false, endDate: '2027-05-12' });
    const learned = await generatePlan(base, profile);
    const disabled = await generatePlan(base, { ...profile, memoryEnabled: false });
    const clean = await generatePlan(base, { ...profile, learnedWeights: { ...profile.learnedWeights, culture: 0 } });
    const attractions = (plan: Awaited<ReturnType<typeof generatePlan>>) => plan.days[0].stops.filter(stop => stop.kind === 'attraction').map(stop => stop.name);
    expect(attractions(learned)).not.toEqual(attractions(disabled));
    expect(attractions(disabled)).toEqual(attractions(clean));
  });
  it('extracts free text preferences without replacing explicit structured interests', async () => {
    const text = await generatePlan(request({ interests: [], prompt: '喜欢博物馆历史文化，希望吃素' }), { ...defaultProfile(), interests: [] });
    expect(text.request.interests).toContain('culture');
    expect(text.request.dietary).toContain('素');
    const structured = await generatePlan(request({ interests: ['nature'], prompt: '喜欢博物馆历史文化' }), defaultProfile());
    expect(structured.request.interests).toEqual(['nature']);
  });
  it('allocates cities in requested order and accounts for the transfer day', async () => {
    const plan = await generatePlan(request({ destination: '杭州，上海', endDate: '2027-05-15' }), defaultProfile());
    expect(plan.days.map(day => day.city)).toEqual(['杭州', '杭州', '上海', '上海']);
    const transfer = plan.days[2].stops.find(stop => stop.kind === 'transport');
    expect(transfer?.name).toContain('杭州'); expect(transfer?.name).toContain('上海');
    expect(transfer?.durationMinutes).toBeGreaterThan(0); expect(transfer?.estimatedCost).toBeGreaterThan(0);
    expect(plan.warnings.some(warning => warning.includes('跨城'))).toBe(true);
  });
  it('does not overload relaxed days and has more activities in packed days', async () => {
    const relaxed = await generatePlan(request({ pace: 'relaxed', endDate: '2027-05-12' }), defaultProfile());
    const packed = await generatePlan(request({ pace: 'packed', endDate: '2027-05-12' }), defaultProfile());
    const count = (plan: typeof relaxed) => plan.days[0].stops.filter(stop => stop.kind === 'attraction').length;
    expect(count(packed)).toBeGreaterThan(count(relaxed));
  });
  it('does not silently invent unsupported destinations', async () => {
    await expect(generatePlan(request({ destination: '不存在的小镇' }), defaultProfile())).rejects.toMatchObject({ code: 'DESTINATION_UNSUPPORTED', status: 422 });
  });
  it('fails with an actionable error when map lookup fails', async () => {
    vi.stubEnv('AMAP_KEY', 'secret'); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')));
    await expect(generatePlan(request({ destination: '苏州' }), defaultProfile())).rejects.toMatchObject({ status: 422, code: 'PLACE_LOOKUP_FAILED' });
  });
  it('discloses seasonal weather outside the forecast window', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); vi.stubEnv('WEATHER_ENABLED', 'true');
    const plan = await generatePlan(request(), defaultProfile());
    expect(plan.days.every(day => day.weather.status === 'seasonal')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('falls back from weather or model failures with trace and no leaked secrets', async () => {
    const date = new Date().toISOString().slice(0, 10);
    vi.stubEnv('WEATHER_ENABLED', 'true'); vi.stubEnv('OPENAI_API_KEY', 'do-not-leak-api-key');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('do-not-leak-api-key network down')));
    const plan = await generatePlan(request({ startDate: date, endDate: date }), defaultProfile());
    expect(plan.days[0].weather.status).toBe('seasonal');
    expect(plan.agentTrace.some(step => step.status === 'degraded')).toBe(true);
    expect(JSON.stringify(plan)).not.toContain('do-not-leak-api-key');
  });
  it('validates request date ranges at the engine boundary', async () => {
    await expect(generatePlan({ ...request(), endDate: '2027-05-01' }, defaultProfile())).rejects.toMatchObject({ code: 'INVALID_REQUEST', status: 422 });
  });
  it('keeps meal estimates equal to the full group food budget', async () => {
    const plan = await generatePlan(request({ adults: 1, children: 1, budget: 300, endDate: '2027-05-12' }), defaultProfile());
    expect(plan.days.flatMap(day => day.stops.filter(stop => stop.kind === 'meal')).reduce((sum, stop) => sum + stop.estimatedCost, 0)).toBe(plan.budget.breakdown.food);
  });
  it('uses only valid provider forecast dates as live weather', async () => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    vi.stubEnv('WEATHER_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [date], temperature_2m_max: [22], temperature_2m_min: [16], precipitation_probability_max: [80], weather_code: [61] } }) }));
    const plan = await generatePlan(request({ startDate: date, endDate: date }), defaultProfile());
    expect(plan.days[0].weather).toMatchObject({ status: 'live', rain: true, high: 22 });
    expect(plan.days[0].stops.filter(stop => stop.kind === 'attraction').every(stop => stop.indoor)).toBe(true);
  });
  it('rejects semantically impossible forecast values instead of calling them live', async () => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    vi.stubEnv('WEATHER_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [date], temperature_2m_max: [-1000], temperature_2m_min: [200], precipitation_probability_max: [10], weather_code: [0] } }) }));
    const plan = await generatePlan(request({ startDate: date, endDate: date }), defaultProfile());
    expect(plan.days[0].weather.status).toBe('seasonal');
    expect(plan.agentTrace.find(step => step.stage === 'research')?.status).toBe('degraded');
  });
  it('rejects unsupported model fields and safely uses deterministic text extraction', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'model-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ interests: ['shopping'], fakeHotel: '已预订虚构酒店' }) } }] }) }));
    const plan = await generatePlan(request({ interests: [], prompt: '想了解历史博物馆' }), defaultProfile());
    expect(plan.request.interests).toContain('culture');
    expect(plan.agentTrace[0].status).toBe('degraded');
    expect(JSON.stringify(plan)).not.toContain('虚构酒店');
  });
  it('accepts real map candidates and converts GCJ-02 coordinates for WGS84 maps', async () => {
    vi.stubEnv('AMAP_KEY', 'map-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: '1', pois: [
      { id: 'A1', name: '苏州博物馆', cityname: '苏州市', location: '120.628,31.324', address: '东北街' },
      { id: 'A2', name: '拙政园', cityname: '苏州市', location: '120.629,31.325', address: '东北街' },
      { id: 'A3', name: '狮子林', cityname: '苏州市', location: '120.629,31.320', address: '园林路' },
    ] }) }));
    const plan = await generatePlan(request({ destination: '苏州', endDate: '2027-05-12', interests: ['culture'] }), defaultProfile());
    expect(plan.days[0].stops.filter(stop => stop.kind === 'attraction').length).toBeGreaterThan(0);
    expect(plan.sources.find(source => source.id === 'places-苏州')?.status).toBe('live');
    const museum = plan.days[0].stops.find(stop => stop.name === '苏州博物馆');
    expect(museum?.lon).not.toBe(120.628);
    expect(museum?.status).toBe('estimate');
    expect(JSON.stringify(plan)).not.toContain('map-secret');
  });
  it('rejects insufficient valid map candidates rather than inventing stops', async () => {
    vi.stubEnv('AMAP_KEY', 'map-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: '1', pois: [{ id: 'A', name: '苏州博物馆', location: '120.628,31.324', cityname: '苏州市' }, { id: 'B', name: '错城地点', location: '120.628,31.324', cityname: '杭州' }, { id: 'C', name: '无坐标地点', location: 'unknown' }] }) }));
    await expect(generatePlan(request({ destination: '苏州' }), defaultProfile())).rejects.toMatchObject({ code: 'INSUFFICIENT_PLACES', status: 422 });
  });
  it('includes a known origin round trip and rejects impractical driving transfers', async () => {
    const plan = await generatePlan(request({ origin: '上海' }), defaultProfile());
    expect(plan.days[0].stops.find(stop => stop.kind === 'transport')).toMatchObject({ kind: 'transport', name: '上海 → 杭州' });
    expect(plan.days.at(-1)?.stops.filter(stop => stop.kind === 'transport').at(-1)).toMatchObject({ kind: 'transport', name: '杭州 → 上海' });
    await expect(generatePlan(request({ destination: '北京，大理', transport: 'driving' }), defaultProfile())).rejects.toMatchObject({ code: 'TRANSFER_TOO_LONG', status: 422 });
  });
  it('keeps strenuous high altitude or stair-heavy routes out of a child itinerary', async () => {
    const plan = await generatePlan(request({ destination: '大理', children: 2, budget: 30000, endDate: '2027-05-19', interests: ['nature'] }), defaultProfile());
    expect(plan.days.flatMap(day => day.stops).some(stop => stop.name.includes('洗马潭'))).toBe(false);
  });
  it('prioritizes current explicit interests over opposing historic feedback', async () => {
    const profile = defaultProfile();
    profile.learnedWeights = { nature: 10, photography: 10, citywalk: 10, culture: -10, food: 0, shopping: 0 };
    const plan = await generatePlan(request({ interests: ['culture'], endDate: '2027-05-12', avoidCrowds: false }), profile);
    expect(plan.days[0].stops.filter(stop => stop.kind === 'attraction').every(stop => stop.tags.includes('culture'))).toBe(true);
  });
  it('does not infer rejected free-text interests', async () => {
    const plan = await generatePlan(request({ interests: [], prompt: '不要摄影，不喜欢山水；想看历史文化', endDate: '2027-05-12' }), { ...defaultProfile(), interests: [] });
    expect(plan.request.interests).toContain('culture');
    expect(plan.request.interests).not.toContain('photography');
    expect(plan.request.interests).not.toContain('nature');
  });
  it('keeps meals in reasonable windows on a long same-day round trip', async () => {
    const plan = await generatePlan(request({ origin: '北京', endDate: '2027-05-12' }), defaultProfile());
    const breakfast = plan.days[0].stops.find(stop => stop.name.startsWith('早餐'));
    const dinner = plan.days[0].stops.find(stop => stop.name.startsWith('晚餐'));
    expect(breakfast!.startTime < '10:00').toBe(true);
    expect(dinner!.startTime >= '17:30').toBe(true);
    expect(plan.days[0].stops.at(-1)!.endTime <= '22:00').toBe(true);
    expect(plan.days[0].stops.every((stop, index, stops) => index === 0 || stop.startTime >= stops[index - 1].endTime)).toBe(true);
  });
  it('does not present unchecked model narratives as facts', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'model-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ interests: [], narrative: '酒店已预订，门票免费' }) } }] }) }));
    const plan = await generatePlan(request({ prompt: '我希望轻松旅行' }), defaultProfile());
    expect(plan.summary).not.toContain('酒店已预订');
    expect(plan.summary).not.toContain('门票免费');
  });
  it('keeps a Shanghai–Chengdu family trip feasible with meals during long transfers', async () => {
    const plan = await generatePlan(request({ origin: '上海', destination: '成都', startDate: '2026-11-06', endDate: '2026-11-09', adults: 2, children: 1, budget: 6000, pace: 'relaxed', interests: ['culture', 'food'] }), defaultProfile());
    expect(plan.days).toHaveLength(4);
    const first = plan.days[0], last = plan.days.at(-1)!;
    expect(first.stops.find(stop => stop.name.startsWith('午餐'))!.startTime >= '12:00').toBe(true);
    expect(first.stops.find(stop => stop.name.startsWith('午餐'))!.startTime < '14:00').toBe(true);
    expect(last.stops.find(stop => stop.name.startsWith('晚餐'))!.startTime >= '17:30').toBe(true);
    expect(last.stops.at(-1)!.endTime <= '22:00').toBe(true);
    expect(last.stops.some(stop => stop.kind === 'meal' && stop.name.includes('途中'))).toBe(true);
    expect(plan.days.every(day => day.stops.filter(stop => stop.kind === 'meal').length === 3)).toBe(true);
    expect(plan.days.every(day => day.stops.every((stop, index, stops) => index === 0 || stop.startTime >= stops[index - 1].endTime))).toBe(true);
    expect(plan.days.flatMap(day => day.stops.filter(stop => stop.kind === 'meal')).reduce((sum, stop) => sum + stop.estimatedCost, 0)).toBe(plan.budget.breakdown.food);
  });
});
