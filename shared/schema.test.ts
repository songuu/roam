import { describe, expect, it } from 'vitest';
import { travelRequestSchema, journalSchema, profileSchema, defaultProfile } from './schema';

const valid = { destination: '杭州', startDate: '2026-10-16', endDate: '2026-10-18', adults: 2, budget: 5000 };
describe('输入边界', () => {
  it('拒绝不存在的日期和反向行程', () => {
    expect(travelRequestSchema.safeParse({ ...valid, startDate: '2026-02-30' }).success).toBe(false);
    expect(travelRequestSchema.safeParse({ ...valid, endDate: '2026-10-15' }).success).toBe(false);
  });
  it('拒绝超长行程与少于城市数的旅行天数', () => {
    expect(travelRequestSchema.safeParse({ ...valid, endDate: '2026-11-01' }).success).toBe(false);
    expect(travelRequestSchema.safeParse({ ...valid, destination: '杭州,上海,北京', endDate: valid.startDate }).success).toBe(false);
  });
  it('保护人数预算并拒绝客户端注入未知字段', () => {
    expect(travelRequestSchema.safeParse({ ...valid, adults: 0 }).success).toBe(false);
    expect(travelRequestSchema.safeParse({ ...valid, budget: Number.NaN }).success).toBe(false);
    expect(travelRequestSchema.safeParse({ ...valid, workspaceId: 'other' }).success).toBe(false);
  });
  it('有效请求规范化且保留原始描述', () => {
    const parsed = travelRequestSchema.parse({ ...valid, prompt: '  想慢慢走，有孩子  ' });
    expect(parsed.prompt).toBe('想慢慢走，有孩子');
    expect(parsed.weatherScenario).toBe('auto');
  });
  it('拒绝仅有分隔符、空城市和重复城市的路线', () => {
    for (const destination of ['，', '杭州，', '杭州,,上海', '杭州,杭州']) {
      expect(travelRequestSchema.safeParse({ ...valid, destination }).success).toBe(false);
    }
  });
  it('记录必须真实填写内容且照片只能引用合法ID', () => {
    const entry = { date: '2026-10-16', title: '西湖边', content: '散步很开心', location: '杭州' };
    expect(journalSchema.safeParse(entry).success).toBe(true);
    expect(journalSchema.safeParse({ ...entry, content: ' ' }).success).toBe(false);
    expect(journalSchema.safeParse({ ...entry, photoIds: ['../private'] }).success).toBe(false);
  });
  it('画像接口不允许伪造学习权重', () => {
    expect(profileSchema.safeParse(defaultProfile()).success).toBe(false);
    const { learnedWeights: _weights, feedbackCount: _count, updatedAt: _time, ...editable } = defaultProfile();
    expect(profileSchema.safeParse(editable).success).toBe(true);
  });
});
