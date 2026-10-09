import { describe, expect, it } from 'vitest';
import { exportPlan } from './exports';
import { createShareDraft } from './share';
import type { JournalEntry, TravelPlan } from '../shared/types';

const trip={id:'trip-1',title:'标题 <script>',summary:'概要 **加粗**',request:{destination:'杭州',startDate:'2026-10-10',endDate:'2026-10-10'},updatedAt:'2026-10-09T10:00:00Z',days:[{date:'2026-10-10',theme:'湖边',weather:{summary:'未知',status:'unavailable'},lodging:{area:'城区',note:''},stops:[{id:'stop-1',name:'西湖\nBEGIN:VEVENT',startTime:'09:00',endTime:'10:00',address:'地址,一;二',description:'行程\n第二行',status:'catalog'}]}],budget:{total:100,note:'估算'},packing:['水杯'],warnings:['需核验'],sources:[]} as unknown as TravelPlan;
describe('safe itinerary exports and first-hand share drafts',()=> {
  it('escapes calendar injected lines and folds multi-byte text by octets',()=> {
    const result=exportPlan(trip,'ics');
    expect(result.content.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(result.content).toContain('SUMMARY:西湖\\nBEGIN:VEVENT');
    expect(result.content).toContain('LOCATION:地址\\,一\\;二');
    expect(result.content).toContain('DTSTART;TZID=Asia/Shanghai:20261010T090000');
    for(const line of result.content.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    const long=exportPlan({...trip,days:trip.days.map(day=>({...day,stops:day.stops.map(stop=>({...stop,name:'中文'.repeat(100)}))}))},'ics');
    expect(long.content).toContain('\r\n ');
    for(const line of long.content.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
  it('escapes user text in Markdown and serializes the plan as data',()=> {
    const markdown=exportPlan(trip,'markdown').content;
    expect(markdown).toContain('标题 \\<script\\>');
    expect(markdown).toContain('概要 \\*\\*加粗\\*\\*');
    expect(JSON.parse(exportPlan(trip,'json').content).id).toBe('trip-1');
  });
  it('escapes bare CR as well as LF so user text cannot inject calendar events',()=> {
    const injected={...trip,days:trip.days.map(day=>({...day,stops:day.stops.map(stop=>({...stop,description:'无辣\rEND:VEVENT\rBEGIN:VEVENT\rSUMMARY:注入'}))}))};
    const calendar=exportPlan(injected,'ics').content;
    expect(calendar.replaceAll('\r\n','')).not.toContain('\r');
    expect(calendar.replace(/\r\n|\r/g,'\n').match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  });
  it('uses only selected real entries and excludes planned sightseeing claims',()=> {
    const entry={id:'entry-1',title:'民宿',location:'民宿',date:'2026-10-10',content:'没有出门，整理照片。',photos:[{id:'photo-1'},{id:'photo-1'}]} as JournalEntry;
    const result=createShareDraft(trip,[entry],'xiaohongshu');
    expect(result.body).toContain(entry.content); expect(result.body).not.toContain('西湖');
    expect(result.photoIds).toEqual(['photo-1']);
    expect(result.warnings.join()).toContain('尚未发布');
  });
  it('改行程目的地之后，分享标题与标签仍依据实际记录',()=> {
    const entry={id:'entry-2',title:'湖边喝茶',location:'杭州西湖',date:'2026-10-10',content:'今天只在杭州西湖旁散步，上海没去。',photos:[]} as unknown as JournalEntry;
    const replanned={...trip,request:{...trip.request,destination:'上海'}};
    const result=createShareDraft(replanned,[entry],'xiaohongshu');
    expect(result.title).not.toContain('上海');
    expect(result.tags).not.toContain('上海');
    expect(result.title).toContain('湖边喝茶');
    expect(result.body).toContain(entry.content);
  });
});
