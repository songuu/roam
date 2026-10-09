import type { TravelPlan } from '../shared/types';

const calendarText = (value: string) => value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const markdownText = (value: string) => value.replace(/[\\`*_{}\[\]<>#!|]/g, '\\$&');
const calendarTime = (date: string,time: string) => `${date.replace(/-/g,'')}T${time.replace(':','')}00`;
function foldLine(line: string) { let result='',current='',bytes=0; for (const character of line) { const size=Buffer.byteLength(character); if (bytes+size>73) { result+=current+'\r\n'; current=' '; bytes=1; } current+=character; bytes+=size; } return result+current; }
export function exportPlan(trip: TravelPlan,format: 'markdown'|'json'|'ics') {
  if (format === 'json') return {content:JSON.stringify(trip,null,2),type:'application/json; charset=utf-8',extension:'json'};
  if (format === 'markdown') {
    const text=[`# ${markdownText(trip.title)}`,markdownText(trip.summary),`日期：${trip.request.startDate} ～ ${trip.request.endDate}`,`预计总预算：¥${trip.budget.total}（${markdownText(trip.budget.note)}）`,...trip.days.flatMap(day=>[`## ${day.date} ${markdownText(day.theme)}`,`天气：${markdownText(day.weather.summary)} [${day.weather.status}]`,...day.stops.map(stop=>`- ${stop.startTime}–${stop.endTime} ${markdownText(stop.name)}：${markdownText(stop.description)}（${stop.status}）`),`住宿区域：${markdownText(day.lodging.area)}。${markdownText(day.lodging.note)}`]),'## 行前准备',...trip.packing.map(item=>'- '+markdownText(item)),'## 核验与提醒',...trip.warnings.map(item=>'- '+markdownText(item)),'## 信息来源',...trip.sources.map(source=>`- ${markdownText(source.label)} [${source.status}]：${markdownText(source.note)}${source.url ? ' '+markdownText(source.url) : ''}`)].join('\n\n');
    return {content:text,type:'text/markdown; charset=utf-8',extension:'md'};
  }
  const stamp = new Date(trip.updatedAt).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Roam//Travel Agent//ZH','CALSCALE:GREGORIAN','X-WR-TIMEZONE:Asia/Shanghai','BEGIN:VTIMEZONE','TZID:Asia/Shanghai','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0800','TZOFFSETTO:+0800','TZNAME:CST','END:STANDARD','END:VTIMEZONE'];
  for (const day of trip.days) for (const stop of day.stops) lines.push('BEGIN:VEVENT',`UID:${calendarText(trip.id+'-'+stop.id+'-'+day.date)}@roam.local`,`DTSTAMP:${stamp}`,`DTSTART;TZID=Asia/Shanghai:${calendarTime(day.date,stop.startTime)}`,`DTEND;TZID=Asia/Shanghai:${calendarTime(day.date,stop.endTime)}`,`SUMMARY:${calendarText(stop.name)}`,`LOCATION:${calendarText(stop.address)}`,`DESCRIPTION:${calendarText(stop.description+'\n信息状态：'+stop.status)}`,'END:VEVENT');
  lines.push('END:VCALENDAR');
  return {content:lines.map(foldLine).join('\r\n')+'\r\n',type:'text/calendar; charset=utf-8',extension:'ics'};
}
