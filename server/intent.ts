import { travelRequestSchema } from '../shared/schema';
import type { Interest, IntentResult, TravelRequest } from '../shared/types';

export class IntentError extends Error {
  readonly status = 400;
  readonly code = 'INTENT_INVALID';
}
const numberText = '[\\d一二两三四五六七八九十百千万]+';
const cityNames = ['杭州','成都','大理','北京','上海','西安','苏州','重庆','南京','广州','深圳','昆明','厦门','长沙','武汉','桂林','三亚','青岛','黄山','东京','大阪','京都','曼谷','巴黎','伦敦','新加坡','香港','澳门'];

export function hasPositiveMention(text: string, pattern: RegExp): boolean {
  const flags = [...new Set((pattern.flags + 'g').split(''))].join('');
  for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
    const prefix = text.slice(0, match.index).split(/[，,。；;！!？?\n]|但是|不过|但|而且/).at(-1) || '';
    if (!/(?:不喜欢|不想|不要|不需要|不愿|不|没|别|无需|避免|拒绝)[^，。；！？\n]{0,12}$/.test(prefix)) return true;
  }
  return false;
}

function numberValue(text: string): number {
  if (/^[\d,.]+$/.test(text)) return Number(text.replaceAll(',', ''));
  const digits: Record<string, number> = { 零:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
  const units: Record<string, number> = { 十:10, 百:100, 千:1000 };
  let total = 0, section = 0, digit = 0;
  for (const character of text) {
    if (character in digits) digit = digits[character];
    else if (character in units) { section += (digit || 1) * units[character]; digit = 0; }
    else if (character === '万') { total += (section + digit || 1) * 10000; section = 0; digit = 0; }
    else return Number.NaN;
  }
  return total + section + digit;
}
function addDays(date: string, days: number): string {
  const timestamp = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(timestamp)) throw new IntentError('描述中的日期无效，请按 YYYY-MM-DD 填写并核对。');
  return new Date(timestamp + days * 86400000).toISOString().slice(0,10);
}

// Recognition is an explicit editing action. It proposes fields for confirmation,
// while direct planning always honors the user's submitted structured request.
export async function interpretIntent(base: TravelRequest): Promise<IntentResult> {
  const request: TravelRequest = { ...base, interests: [...base.interests] };
  const extracted: string[] = [];
  const warnings: string[] = [];
  const prompt = base.prompt;
  const mark = (field: string) => { if (!extracted.includes(field)) extracted.push(field); };
  const origin = prompt.match(/从(.{2,12}?)(?:出发)?(?:去|到)/)?.[1];
  if (origin) { request.origin = origin.trim(); mark('出发地'); }
  const positiveDestinationText = prompt.replace(/(?:不想去|不愿去|不要去|别去|不去)[^，,。；;！？\n]*/g, '');
  const segment = positiveDestinationText.match(/(?:想去|去|到|目的地[：:\s]*)([^，。！？\n]{2,70})/)?.[1];
  if (segment) {
    const cities = [...segment.matchAll(new RegExp(cityNames.join('|'), 'g'))].map(match => match[0]);
    if (cities.length) { request.destination = [...new Set(cities)].join(','); mark('目的地'); }
    else {
      const unknown = segment.match(/^([\p{Script=Han}]{2,12}?)(?:玩|游|待|旅行|旅游|度假|[\d一二两三四五六七八九十]|$)/u)?.[1];
      if (unknown) { request.destination = unknown; mark('目的地'); warnings.push('识别到目录外的目的地，需要配置地点服务并核对城市名称。'); }
    }
  }
  const durationMatch = prompt.match(new RegExp(`(${numberText})\\s*天`));
  const duration = durationMatch ? numberValue(durationMatch[1]) : undefined;
  if (duration !== undefined && (!Number.isInteger(duration) || duration < 1 || duration > 14)) throw new IntentError('当前支持 1～14 天的旅行，请调整描述或直接填写表单。');
  const dates = [...prompt.matchAll(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?/g)].map(match => `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`);
  if (dates.length) { request.startDate = dates[0]; mark('出发日期'); }
  if (dates.length > 1) { request.endDate = dates[1]; mark('结束日期'); }
  else if (duration !== undefined) { request.endDate = addDays(request.startDate, duration - 1); mark('旅行天数'); }
  else if (dates.length) {
    const previousDays = (Date.parse(base.endDate) - Date.parse(base.startDate)) / 86400000 + 1;
    request.endDate = addDays(request.startDate, previousDays - 1);
    warnings.push(`未明确结束日期，沿用原表单的 ${previousDays} 天，请核对。`);
  }
  const family = prompt.match(new RegExp(`(${numberText})\\s*大\\s*(${numberText})\\s*小`));
  const adults = prompt.match(new RegExp(`(${numberText})\\s*(?:个|位|名)?\\s*成人`));
  const children = prompt.match(new RegExp(`(?:带\\s*)?(${numberText})\\s*(?:个|位|名)?\\s*(?:孩子|儿童|小孩)`));
  if (family) { request.adults = numberValue(family[1]); request.children = numberValue(family[2]); mark('同行人数'); }
  else {
    if (adults) { request.adults = numberValue(adults[1]); mark('成人'); }
    if (children) { request.children = numberValue(children[1]); mark('儿童'); }
    const total = prompt.match(new RegExp(`(${numberText})\\s*(?:个人|人同行|人出游|人一起)`));
    if (total && !adults) { request.adults = numberValue(total[1]) - (children ? request.children : 0); mark('同行人数'); }
  }
  const budget = prompt.match(/(?:总?预算|花费|经费)[约大概为是：:\s]*([\d,.]+|[一二两三四五六七八九十百千万]+)\s*([kK万千])?/);
  if (budget) {
    const multiplier = budget[2] === '万' ? 10000 : ['千','k','K'].includes(budget[2] || '') ? 1000 : 1;
    request.budget = numberValue(budget[1]) * multiplier;
    mark('总预算');
    if (/人均(?:预算)?|每人(?:预算)?/.test(prompt)) { request.budget *= request.adults + request.children; warnings.push('描述为人均预算，已按识别的同行人数换算为总预算，请核对。'); }
  }
  if (hasPositiveMention(prompt, /轻松|松弛|慢慢|慢游|不赶|少走|走累/)) { request.pace = 'relaxed'; mark('旅行节奏'); }
  else if (hasPositiveMention(prompt, /特种兵|充实|紧凑|多逛|密集/)) { request.pace = 'packed'; mark('旅行节奏'); }
  if (hasPositiveMention(prompt, /自驾|开车/)) { request.transport = 'driving'; mark('交通方式'); }
  else if (hasPositiveMention(prompt, /地铁|公交|公共交通/)) { request.transport = 'public'; mark('交通方式'); }
  const interestKeywords: Record<Interest, RegExp> = { nature:/自然|山水|风景|湖|森林|海边/,culture:/博物馆|历史|人文|古迹|古城/,food:/美食|小吃|好吃|吃吃/,photography:/拍照|摄影|出片/,citywalk:/漫步|散步|city\s*walk/i,shopping:/购物|逛街|买东西/ };
  const interests = Object.entries(interestKeywords).filter(([,pattern]) => hasPositiveMention(prompt,pattern)).map(([interest]) => interest as Interest);
  if (interests.length) { request.interests = interests; mark('兴趣'); }
  const dietary = [...new Set(prompt.match(/少辣|不吃辣|不能吃辣|素食|清真|不吃海鲜|不吃牛肉|不吃猪肉|[\p{Script=Han}]{1,5}过敏/gu) || [])];
  if (dietary.length) { request.dietary = dietary.join('；'); mark('饮食需求'); }
  const accessibility = [...new Set(prompt.match(/轮椅|无障碍|带老人|老人同行|孕妇|不宜久走|少走路|婴儿车/gu) || [])];
  if (accessibility.length) { request.accessibility = accessibility.join('；'); mark('行动需求'); }
  if (/避开人|避开高峰|不喜欢人多|不挤|避拥挤/.test(prompt)) { request.avoidCrowds = true; mark('避开拥挤'); }
  if (/雨天|下雨/.test(prompt)) warnings.push('提到雨天：真实天气仍由天气服务查询，若要模拟，请生成后点击“模拟雨天重排”。');
  const result = travelRequestSchema.safeParse(request);
  if (!result.success) throw new IntentError(`识别出的诉求超出支持范围：${result.error.issues[0]?.message}。请调整描述或直接填写表单。`);
  const missing = ['目的地','出发日期','同行人数','总预算'].filter(field => !extracted.includes(field) && !(field === '同行人数' && extracted.includes('成人')));
  if (missing.length) warnings.push(`未明确识别 ${missing.join('、')}，沿用当前表单，请核对。`);
  warnings.push('识别结果已填入表单，请核对日期、人数和总预算后生成行程。');
  return {request:result.data,extracted,warnings,mode:'rules'};
}
