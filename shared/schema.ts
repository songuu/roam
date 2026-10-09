import { z } from 'zod';
import { INTERESTS, type Profile } from './types';
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请输入有效日期').refine(value => { const parsed = new Date(value + 'T00:00:00Z'); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, '日期不存在');
const interest = z.enum(INTERESTS);
export const travelRequestSchema = z.object({
  prompt: z.string().trim().max(3000).default(''), destination: z.string().trim().min(1, '请填写目的地').max(100), origin: z.string().trim().max(80).default(''),
  startDate: dateString, endDate: dateString, adults: z.number().int().min(1).max(12), children: z.number().int().min(0).max(8).default(0),
  budget: z.number().finite().min(200, '总预算至少 200 元').max(1000000), pace: z.enum(['relaxed', 'balanced', 'packed']).default('balanced'),
  transport: z.enum(['public', 'driving', 'mixed']).default('public'), interests: z.array(interest).max(6).default([]),
  dietary: z.string().trim().max(300).default(''), accessibility: z.string().trim().max(300).default(''), avoidCrowds: z.boolean().default(true),
  weatherScenario: z.enum(['auto', 'rain', 'clear']).default('auto'),
}).strict().superRefine((value, ctx) => {
  const days = (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 + 1;
  if (days < 1 || days > 14) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: '行程需为 1～14 天，结束日期不得早于出发日期' });
  const cities = value.destination.split(/[,，、→>\/]/).map(city => city.trim());
  if (cities.some(city => !city) || new Set(cities).size !== cities.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destination'], message: '请填写完整且不重复的城市，使用逗号分隔' });
  if (cities.length > 3 || cities.length > days) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destination'], message: '最多规划 3 个城市，每个城市至少留 1 天' });
});
export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40), interests: z.array(interest).max(6), pace: z.enum(['relaxed', 'balanced', 'packed']),
  dietary: z.string().trim().max(300), accessibility: z.string().trim().max(300), avoidCrowds: z.boolean(), memoryEnabled: z.boolean(),
}).strict();
export const journalSchema = z.object({ date: dateString, location: z.string().trim().max(120), title: z.string().trim().min(1, '给这段回忆一个标题').max(100), content: z.string().trim().min(1, '写下真实的旅途经历').max(10000), mood: z.enum(['happy', 'calm', 'tired', 'amazing']).default('happy'), photoIds: z.array(z.string().uuid()).max(9).default([]) }).strict();
export const feedbackSchema = z.object({ stopId: z.string().min(1).max(100), interest, rating: z.union([z.literal(-1), z.literal(1)]), note: z.string().trim().max(300).optional() }).strict();
export const shareSchema = z.object({ platform: z.enum(['xiaohongshu', 'wechat']), entryIds: z.array(z.string().uuid()).max(100).optional() }).strict();
export function defaultProfile(): Profile { return { displayName: '旅行者', interests: ['nature', 'food', 'citywalk'], pace: 'balanced', dietary: '', accessibility: '', avoidCrowds: true, memoryEnabled: true, learnedWeights: { nature: 0, culture: 0, food: 0, photography: 0, citywalk: 0, shopping: 0 }, feedbackCount: 0, updatedAt: new Date().toISOString() }; }
