import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createApp } from './app';
import type { Store } from './store';
import type { Profile, TravelPlan, TravelRequest } from '../shared/types';

const input: TravelRequest = { prompt: '', destination: '杭州', origin: '上海', startDate: '2026-10-10', endDate: '2026-10-11', adults: 2, children: 0, budget: 3000, pace: 'balanced', transport: 'public', interests: ['nature'], dietary: '', accessibility: '', avoidCrowds: true, weatherScenario: 'auto' };
const directories: string[] = [];
const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const planner = async (value: TravelRequest, _profile: Profile, options: {id?: string; revision?: number; createdAt?: string} = {}): Promise<TravelPlan> => ({
  id: options.id || crypto.randomUUID(), title: '杭州旅行', summary: '', request: value, days: [{ date: value.startDate, city: '杭州', theme: '西湖', stops: [{ id: 'west-lake', name: '西湖', kind: 'attraction', startTime: '09:00', endTime: '11:00', lat: 30, lon: 120, address: '杭州', description: '', why: '', tags: ['nature'], estimatedCost: 0, durationMinutes: 120, travelMinutes: 0, distanceKm: 0, crowd: 'medium', status: 'catalog', sourceId: 'catalog', indoor: false, accessibility: '', mapUrl: '', alternatives: [] }], weather: { date: value.startDate, status: 'unavailable', summary: '', sourceId: '', rain: false }, lodging: { area: '', note: '', nightlyCost: 0 }, notes: [] }], budget: { currency: 'CNY', total: 0, perPerson: 0, limit: value.budget, withinBudget: true, breakdown: { accommodation: 0, food: 0, transport: 0, tickets: 0, buffer: 0 }, note: '' }, packing: [], warnings: [], sources: [], reasoning: [], agentTrace: [], createdAt: options.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), revision: options.revision || 1,
});
function setup(hidden = false) { const root = mkdtempSync(join(tmpdir(), 'travel-api-')); directories.push(root); const dataDir=hidden ? join(root,'.private') : root; const app = createApp({dataDir, planner}); stores.push(app.locals.store as Store); return { app, dataDir, owner: request.agent(app), stranger: request.agent(app) }; }

describe('workspace API', () => {
  it('配置为点目录的数据存储仍可以鉴权读取合法照片', async () => {
    const {owner,stranger}=setup(true);
    const image=await sharp({create:{width:12,height:12,channels:3,background:'#315846'}}).png().toBuffer();
    const photo=(await owner.post('/api/uploads').attach('photo',image,{filename:'hidden-storage.png',contentType:'image/png'}).expect(201)).body;
    await owner.get(photo.url).expect(200);
    await stranger.get(photo.url).expect(404);
  });
  it('临时草稿清理不能删除已成功保存或被其他记录引用的照片', async () => {
    const {owner}=setup();
    const trip=(await owner.post('/api/trips').send(input).expect(201)).body;
    const image=await sharp({create:{width:12,height:12,channels:3,background:'#315846'}}).png().toBuffer();
    const photo=(await owner.post('/api/uploads').attach('photo',image,{filename:'saved.png',contentType:'image/png'}).expect(201)).body;
    const entry=(await owner.post(`/api/trips/${trip.id}/journal`).send({date:input.startDate,location:'杭州',title:'保存成功但响应断连',content:'照片已经属于真实记录。',mood:'calm',photoIds:[photo.id]}).expect(201)).body;
    await owner.delete(`/api/photos/${photo.id}?unreferenced=true`).expect(204);
    await owner.get(photo.url).expect(200);
    const entries=(await owner.get(`/api/trips/${trip.id}/journal`).expect(200)).body;
    expect(entries[0].photos[0].id).toBe(photo.id);
    await owner.delete(`/api/journal/${entry.id}`).expect(204);
    await owner.get(photo.url).expect(404);
  });
  it('isolates trips, exports, journals, photos and persists local data', async () => {
    const { app, dataDir, owner, stranger } = setup();
    const trip = (await owner.post('/api/trips').send(input).expect(201)).body;
    expect((await stranger.get('/api/trips').expect(200)).body).toEqual([]);
    await stranger.get(`/api/trips/${trip.id}/export?format=json`).expect(404);
    await stranger.get(`/api/trips/${trip.id}/journal`).expect(404);
    const session = await owner.get('/api/session').expect(200);
    const resumed = createApp({dataDir, planner});
    stores.push(resumed.locals.store as Store);
    expect((await request(resumed).get('/api/trips').set('Authorization', `Bearer ${session.body.bearerToken}`).expect(200)).body).toHaveLength(1);
    await request(app).get('/api/trips').set('Authorization', 'Bearer unknown').expect(401);
  });
  it('validates input and origins and never fabricates memories for share drafts', async () => {
    const { owner } = setup();
    await owner.post('/api/trips').set('Origin', 'https://evil.example').send(input).expect(403);
    await owner.post('/api/trips').send({...input, startDate: '2026-02-30'}).expect(400);
    const trip = (await owner.post('/api/trips').send(input).expect(201)).body;
    await owner.post(`/api/trips/${trip.id}/share`).send({platform: 'wechat'}).expect(422);
    await owner.post(`/api/trips/${trip.id}/journal`).send({date: '2026-12-01', location: '杭州', title: '回忆', content: '开心', mood: 'happy', photoIds: []}).expect(400);
    const entry = (await owner.post(`/api/trips/${trip.id}/journal`).send({date: input.startDate, location: '民宿', title: '雨天休息', content: '在民宿喝茶，今天没有去西湖。', mood: 'calm', photoIds: []}).expect(201)).body;
    const share = (await owner.post(`/api/trips/${trip.id}/share`).send({platform: 'wechat', entryIds: [entry.id]}).expect(200)).body;
    expect(share.body).toContain('在民宿喝茶，今天没有去西湖。');
    expect(share.body).not.toContain('游览西湖');
  });
  it('deduplicates feedback, rejects fake stop interests and clears only learned memory', async () => {
    const { owner } = setup();
    const trip = (await owner.post('/api/trips').send(input)).body;
    await owner.post(`/api/trips/${trip.id}/feedback`).send({stopId: 'west-lake', interest: 'food', rating: 1}).expect(400);
    for (let i=0;i<2;i++) await owner.post(`/api/trips/${trip.id}/feedback`).send({stopId: 'west-lake', interest: 'nature', rating: 1}).expect(200);
    const profile = (await owner.get('/api/profile')).body;
    expect(profile.feedbackCount).toBe(1); expect(profile.learnedWeights.nature).toBe(1);
    await owner.put('/api/profile').send({...profile, learnedWeights: {nature: 999}}).expect(400);
    const clean = (await owner.delete('/api/profile/memory').expect(200)).body;
    expect(clean.feedbackCount).toBe(0); expect(clean.interests).toEqual(profile.interests);
    const {learnedWeights: _weights, feedbackCount: _count, updatedAt: _date, ...preferences} = clean;
    await owner.put('/api/profile').send({...preferences,memoryEnabled:false}).expect(200);
    expect((await owner.post(`/api/trips/${trip.id}/feedback`).send({stopId:'west-lake',interest:'nature',rating:1})).body.feedbackCount).toBe(0);
  });
  it('enforces optimistic revisions and protects journal dates during replanning', async () => {
    const { owner } = setup(); const trip = (await owner.post('/api/trips').send(input)).body;
    await owner.post(`/api/trips/${trip.id}/replan`).send({request:input,revision:999}).expect(409);
    const results = await Promise.all([owner.post(`/api/trips/${trip.id}/replan`).send({request:input,revision:1}),owner.post(`/api/trips/${trip.id}/replan`).send({request:input,revision:1})]);
    expect(results.map(result => result.status).sort()).toEqual([200,409]);
    await owner.post(`/api/trips/${trip.id}/journal`).send({date:input.startDate,location:'杭州',title:'真实记录',content:'在湖边走走',mood:'calm',photoIds:[]}).expect(201);
    await owner.post(`/api/trips/${trip.id}/replan`).send({request:{...input,startDate:'2026-11-01',endDate:'2026-11-02'},revision:2}).expect(409);
    expect((await owner.get(`/api/trips/${trip.id}`)).body.revision).toBe(2);
  });
  it('validates actual image bytes, limits size and authenticates image access', async () => {
    const { owner, stranger } = setup();
    await owner.post('/api/uploads').attach('photo', Buffer.from('not a photo'), {filename:'fake.jpg',contentType:'image/jpeg'}).expect(400);
    await owner.post('/api/uploads').attach('photo', Buffer.alloc(8*1024*1024+1), {filename:'large.jpg',contentType:'image/jpeg'}).expect(413);
    const image = await sharp({create:{width:10,height:10,channels:3,background:'red'}}).png().toBuffer();
    const photo = (await owner.post('/api/uploads').attach('photo', image, {filename:'photo.png',contentType:'image/png'}).expect(201)).body;
    await owner.get(photo.url).expect(200).expect('Content-Type', /image\/jpeg/);
    await stranger.get(photo.url).expect(404);
    await stranger.delete(`/api/photos/${photo.id}`).expect(404);
    await owner.delete(`/api/photos/${photo.id}`).expect(204);
    await owner.get(photo.url).expect(404);
  });
  it('owns journal photos and cleans associated files when deleting a trip', async () => {
    const { owner, stranger }=setup();
    const trip=(await owner.post('/api/trips').send(input)).body;
    const image=await sharp({create:{width:8,height:8,channels:3,background:'blue'}}).png().toBuffer();
    const photo=(await owner.post('/api/uploads').attach('photo',image,{filename:'memory.png'})).body;
    const entry=(await owner.post(`/api/trips/${trip.id}/journal`).send({date:input.startDate,location:'湖边',title:'漫步',content:'吃了一个包子',mood:'happy',photoIds:[photo.id]}).expect(201)).body;
    await stranger.patch(`/api/journal/${entry.id}`).send({date:input.startDate,location:'',title:'覆盖',content:'假内容',mood:'happy',photoIds:[]}).expect(404);
    const strangersTrip=(await stranger.post('/api/trips').send(input)).body;
    await stranger.post(`/api/trips/${strangersTrip.id}/journal`).send({date:input.startDate,location:'',title:'偷图',content:'假的',mood:'happy',photoIds:[photo.id]}).expect(404);
    const draft=(await owner.post(`/api/trips/${trip.id}/share`).send({platform:'xiaohongshu',entryIds:[entry.id]})).body;
    expect(draft.photoIds).toEqual([photo.id]);
    await owner.delete(`/api/trips/${trip.id}`).expect(204);
    await owner.get(photo.url).expect(404);
    await owner.get(`/api/trips/${trip.id}/journal`).expect(404);
  });
  it('exports real timed calendar events with escaped user text', async () => {
    const {owner}=setup(); const trip=(await owner.post('/api/trips').send(input)).body;
    const calendar=await owner.get(`/api/trips/${trip.id}/export?format=ics`).expect(200);
    expect(calendar.text).toContain('DTSTART;TZID=Asia/Shanghai:20261010T090000');
    expect(calendar.text).toContain('DTEND;TZID=Asia/Shanghai:20261010T110000');
    expect(calendar.text).toContain('SUMMARY:西湖');
    const markdown=await owner.get(`/api/trips/${trip.id}/export?format=markdown`).expect(200);
    expect(markdown.text).toContain('09:00–11:00 西湖');
    await owner.get(`/api/trips/${trip.id}/export?format=html`).expect(400);
  });
  it('limits paid planning calls per workspace without affecting another traveler',async()=> {
    const {owner,stranger}=setup();
    for(let count=0;count<30;count++) await owner.post('/api/trips').send(input).expect(201);
    await owner.post('/api/trips').send(input).expect(429);
    await stranger.post('/api/trips').send(input).expect(201);
  });
});
