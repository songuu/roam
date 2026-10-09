import { randomUUID } from 'node:crypto';
import { travelRequestSchema } from '../shared/schema';
import { INTEREST_LABELS, type Budget, type DayPlan, type Interest, type Profile, type Source, type Stop, type TravelPlan, type TravelRequest } from '../shared/types';
import { findCity, type CatalogPlace, type CityCatalog } from './catalog';
import { getWeather, lookupCity, ProviderError, readModelHints } from './providers';
import { hasPositiveMention } from './intent';

export class PlannerError extends Error {
  constructor(public code: string, message: string, public status = 422, public details?: unknown) { super(message); this.name = 'PlannerError'; }
}
function round(value: number): number { return Math.round(value); }
function distance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat), dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function time(minutes: number): string { return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`; }
function datesBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let current = Date.parse(start); current <= Date.parse(end); current += 86400000) days.push(new Date(current).toISOString().slice(0, 10));
  return days;
}
function parseText(prompt: string): { interests: Interest[]; rejectedInterests: Interest[]; dietary: string; accessibility: string } {
  const patterns: Record<Interest, RegExp> = { nature: /自然|山水|湖|公园|森林|徒步|海边/, culture: /历史|博物|人文|文化|古迹|古城/, food: /美食|吃|小吃|餐厅/, photography: /摄影|拍照|出片|打卡/, citywalk: /citywalk|漫步|散步|街巷|胡同/i, shopping: /购物|逛街|买东西/ };
  const interests = (Object.keys(patterns) as Interest[]).filter(interest => hasPositiveMention(prompt, patterns[interest]));
  const rejectedInterests = (Object.keys(patterns) as Interest[]).filter(interest => patterns[interest].test(prompt) && !hasPositiveMention(prompt, patterns[interest]));
  const dietary: string[] = [];
  if (hasPositiveMention(prompt, /吃素|素食|素菜/)) dietary.push('素食，核实汤底、油脂与馅料');
  if (/不要辣|不吃辣|不辣|少辣/.test(prompt)) dietary.push('不吃辣，酱料单独提供');
  if (/过敏|忌口/.test(prompt)) dietary.push(`饮食限制：${prompt.match(/[^，,。；;]*(?:过敏|忌口)[^，,。；;]*/)?.[0] || '请逐店确认过敏原'}`);
  const accessibility = hasPositiveMention(prompt, /轮椅|无障碍|行动不便/) ? '需要无障碍动线，电梯、坡道与入口需提前确认' : hasPositiveMention(prompt, /老人|长辈|腿脚|少走路/) ? '减少步行和台阶，安排休息' : '';
  return { interests, rejectedInterests, dietary: dietary.join('；'), accessibility };
}
function estimatedCrowd(place: CatalogPlace, date: string): Stop['crowd'] {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const peak = weekday === 0 || weekday === 6 || /^\d{4}-(10-0[1-7]|05-0[1-5]|01-01)$/.test(date);
  const score = place.popularity + (peak ? 1 : 0);
  return score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
}
function transferBetween(from: CityCatalog, to: CityCatalog, request: TravelRequest): { minutes: number; cost: number; km: number; mode: string } {
  const km = distance(from, to);
  const people = request.adults + request.children;
  if (request.transport === 'driving') return { minutes: Math.ceil((km * 1.3 / 75 * 60 + 45) / 5) * 5, cost: round(km * 1.3 * 1.2 * Math.ceil(people / 4)), km, mode: '自驾（道路、停车与过路费估计）' };
  if (km > 900) return { minutes: Math.ceil((210 + km / 700 * 60) / 5) * 5, cost: round(Math.max(600, km * 0.65) * people), km, mode: '航班 + 市内接驳（无实时航班核实）' };
  return { minutes: Math.ceil((90 + km * 1.15 / 180 * 60) / 5) * 5, cost: round(Math.max(80, km * 1.15 * 0.5) * people), km, mode: '城际铁路 + 市内接驳（无实时车次核实）' };
}
function mapUrl(name: string, city: string): string { return `https://uri.amap.com/search?keyword=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}&src=roam`; }

export async function generatePlan(input: TravelRequest, profile: Profile, options: { id?: string; revision?: number; createdAt?: string } = {}): Promise<TravelPlan> {
  const parsed = travelRequestSchema.safeParse(input);
  if (!parsed.success) throw new PlannerError('INVALID_REQUEST', '旅行需求无效，请检查日期、人数、预算和目的地。', 422, parsed.error.flatten());
  const model = await readModelHints(parsed.data);
  const inferred = parseText(parsed.data.prompt);
  const request: TravelRequest = { ...parsed.data,
    interests: parsed.data.interests.length ? parsed.data.interests : (inferred.interests.length ? inferred.interests : model.hints.interests.length ? model.hints.interests : profile.interests).filter(interest => !inferred.rejectedInterests.includes(interest)),
    dietary: parsed.data.dietary || inferred.dietary || model.hints.dietary || profile.dietary,
    accessibility: parsed.data.accessibility || inferred.accessibility || model.hints.accessibility || profile.accessibility,
  };
  const hasCurrentInterest = parsed.data.interests.length > 0 || inferred.interests.length > 0 || model.hints.interests.some(interest => !inferred.rejectedInterests.includes(interest));
  const names = [...new Set(request.destination.split(/[,，、→>\/]+/).map(name => name.trim().replace(/市$/, '')).filter(Boolean))];
  request.destination = names.join('，');
  const dates = datesBetween(request.startDate, request.endDate);
  const warnings = [
    '景点营业、门票、闭馆日、预约名额和特殊活动尚未实时核实；出发前通过官网确认并预约。',
    '费用、距离、交通时长、坐标与拥挤度是规划估计；拥挤度并非实时客流，餐馆和酒店尚未选定或预订。',
  ];
  const sources: Source[] = [{ id: 'planning-estimates', label: '行程与费用估算', status: 'estimate', note: '市内距离按直线距离 × 1.3；公共交通/自驾按平均速度估时。酒店按房间、人数组计价；儿童门票按成人票保守估计，优惠需核实。购物、签证、保险和个人额外消费未计入。' }];
  const cities: CityCatalog[] = [];
  for (const name of names) {
    const known = findCity(name);
    if (known) {
      cities.push(known);
      sources.push({ id: `places-${known.name}`, label: `${known.name}人工整理地点目录`, status: 'catalog', url: known.sourceUrl, note: '地点为人工整理目录，政府或馆方网站供核实；坐标是近似 WGS84，门票/时长/室内属性为估计，营业和预约未联网核实。' });
    } else {
      try { const result = await lookupCity(name); cities.push(result.city); sources.push(result.source); }
      catch (error) { if (error instanceof ProviderError) throw new PlannerError(error.code, error.message, error.status); throw error; }
    }
  }
  const cityIndices = dates.map((_, index) => Math.min(cities.length - 1, Math.floor(index * cities.length / dates.length)));
  const weatherData = await Promise.all(cities.map((city, index) => getWeather(city, dates.filter((_, day) => cityIndices[day] === index), request.weatherScenario)));
  weatherData.forEach(result => sources.push(...result.sources));
  if (weatherData.some(result => result.degraded)) warnings.push('部分天气查询失败或缺失，已降级为季节提示，请自行复查最新预报。');
  if (request.accessibility) warnings.push('无障碍要求已优先减少台阶和长距离，但入口、坡道、电梯及卫生间条件未核实，需逐点联系确认。');
  if (request.dietary) warnings.push(`饮食限制：${request.dietary}；请向餐厅确认汤底、配料、过敏原和交叉接触情况。`);
  if (cities.length > 1) warnings.push('跨城交通按距离估计，车次/航班、班次衔接和票价未核实；已预留接驳时间，请先确认交通后再预约景点。');
  const people = request.adults + request.children, rooms = Math.ceil(people / 2);
  const budgetPerDay = request.budget / dates.length;
  const economical = budgetPerDay < people * 250;
  const foodPerDay = round((request.adults + request.children * 0.75) * (economical ? 65 : 110));
  const used = new Set<string>();
  const breakdown: Budget['breakdown'] = { accommodation: 0, food: foodPerDay * dates.length, transport: 0, tickets: 0, buffer: 0 };
  const days: DayPlan[] = [];
  const origin = request.origin ? findCity(request.origin) : undefined;
  if (request.origin && !origin) warnings.push(`未能可靠估计出发地“${request.origin}”的往返交通，往返费用不含在当前预算，请补充真实车票/机票价格。`);
  if (!request.origin) warnings.push('未填写出发地，预算不含到首城与末城返回的往返大交通。');

  for (let index = 0; index < dates.length; index++) {
    const cityIndex = cityIndices[index], city = cities[cityIndex], date = dates[index];
    const weather = weatherData[cityIndex].weather.get(date)!;
    const notes = [city.seasonalNote, '餐饮点和住宿区域是选址建议，地图坐标仅作为附近搜索锚点，请核实具体商家。'];
    if (request.children) notes.push('儿童同行：缩短连续步行，预留洗手间、加餐和休息；儿童票优惠未假定。');
    const nightlyCost = round((economical ? Math.min(city.lodgingBase, 170) : city.lodgingBase) * rooms);
    if (index < dates.length - 1) breakdown.accommodation += nightlyCost;
    const stops: Stop[] = [];
    const incomingCity = index === 0 && origin && origin.name !== city.name ? origin : index > 0 && cityIndices[index - 1] !== cityIndex ? cities[cityIndices[index - 1]] : undefined;
    let cursor = 8 * 60, previous: { lat: number; lon: number } = incomingCity || city;
    let lunch = false, dinner = false;
    const append = (stop: Omit<Stop, 'startTime' | 'endTime'>, earliest = cursor): Stop => {
      const start = Math.max(cursor + stop.travelMinutes, earliest);
      const completed = { ...stop, startTime: time(start), endTime: time(start + stop.durationMinutes) };
      stops.push(completed); cursor = start + stop.durationMinutes; previous = completed;
      return completed;
    };
    const addTransfer = (from: CityCatalog, to: CityCatalog, suffix: string) => {
      const transit = transferBetween(from, to, request);
      if (transit.minutes > 12 * 60) throw new PlannerError('TRANSFER_TOO_LONG', `${from.name}到${to.name}的自驾估计超过 12 小时，请更换公共交通或拆分路线。`);
      breakdown.transport += transit.cost;
      const finish = cursor + transit.minutes;
      const mealWindows = [{ label: '午餐', start: 12 * 60, missing: !lunch }, { label: '晚餐', start: 17 * 60 + 30, missing: !dinner }].filter(meal => meal.missing && meal.start >= cursor && meal.start + 45 <= finish);
      let segment = 0;
      const appendSegment = (end: number, final: boolean) => {
        const minutes = end - cursor;
        if (minutes <= 0) return;
        const anchor = final ? to : from;
        append({ id: `${date}-transfer-${suffix}-${segment}`, name: `${from.name} → ${to.name}`, kind: 'transport', lat: anchor.lat, lon: anchor.lon, address: final ? '到达枢纽待确认' : '交通途中（地图仅使用出发城市锚点）', description: `${transit.mode}${mealWindows.length ? '；按途中用餐时段展示连续交通过程' : ''}`, why: '城市切换已计入当日时间与全组交通预算；站点、班次和到达时间需实际订票后校准。', tags: [], estimatedCost: segment === 0 ? transit.cost : 0, durationMinutes: minutes, travelMinutes: 0, distanceKm: round(transit.km * minutes / (transit.minutes - mealWindows.length * 45)), crowd: 'medium', status: 'estimate', sourceId: 'planning-estimates', indoor: false, accessibility: '车站、车辆辅助服务需提前联系', mapUrl: mapUrl(`${anchor.name}交通枢纽`, anchor.name), alternatives: [] });
        segment++;
      };
      for (const meal of mealWindows) {
        appendSegment(meal.start, false);
        addMeal(meal.label, 0.4, meal.start, { transit: true, city: from });
      }
      appendSegment(finish, true);
      notes.push('转场日减少景点，并计入站点接驳；不要按估计时间直接购买不可退票服务。');
      if (mealWindows.length) notes.push('途中用餐时间包含在交通估计内：提前准备符合饮食要求的随身餐，候乘或航程合适时食用；自驾需安全停车。实际班次、位置与供餐均待确认。');
    };
    addMeal('早餐', 0.2, cursor);
    if (index === 0 && origin && origin.name !== city.name) addTransfer(origin, city, 'outbound');
    if (index > 0 && cityIndices[index - 1] !== cityIndex) addTransfer(cities[cityIndices[index - 1]], city, 'intercity');
    const returnTransit = index === dates.length - 1 && origin && origin.name !== city.name ? transferBetween(city, origin, request) : undefined;
    if (returnTransit && returnTransit.minutes > 12 * 60) throw new PlannerError('TRANSFER_TOO_LONG', `${city.name}返回${origin!.name}的自驾估计超过 12 小时，请更换公共交通或拆分路线。`);
    const endOfVisits = returnTransit ? Math.min(18 * 60, 22 * 60 - returnTransit.minutes - 60) : 18 * 60;
    function addMeal(label: string, fraction: number, earliest: number, context: { transit?: boolean; city?: CityCatalog } = {}): Stop {
      const mealCity = context.city || (label === '早餐' && incomingCity ? incomingCity : city);
      if (label === '午餐') lunch = true;
      if (label === '晚餐') dinner = true;
      return append({ id: `${date}-meal-${label}`, name: `${label} · ${context.transit ? '途中随身餐' : `${mealCity.name}风味`}`, kind: 'meal', lat: previous.lat, lon: previous.lon, address: context.transit ? '交通途中（地图为出发城市锚点，实际用餐位置待确认）' : '附近餐饮候选区（具体店铺待选择）', description: `${context.transit ? '提前准备随身简餐，在候乘或航程合适时段食用；不假定交通运营方供餐或车站商家可用，自驾须安全停车。' : mealCity.food}${request.dietary ? `；按要求选择：${request.dietary}` : ''}；预算是全组餐费估计。`, why: context.transit ? '用餐包含在现有交通估计时段内，避免将三餐挤到到达之后；实际班次与用餐条件仍需确认。' : '安排正餐与休息；店名、菜单和营业时间尚未核实。', tags: ['food'], estimatedCost: label === '晚餐' ? foodPerDay - round(foodPerDay * 0.2) - round(foodPerDay * 0.4) : round(foodPerDay * fraction), durationMinutes: label === '早餐' ? 30 : 45, travelMinutes: 0, distanceKm: 0, crowd: 'medium', status: 'estimate', sourceId: 'planning-estimates', indoor: true, accessibility: context.transit ? '交通途中与候乘区条件需联系运营方确认' : '选择无台阶入口、可休息的餐馆，需实地确认', mapUrl: mapUrl(`${mealCity.name} ${context.transit ? '交通枢纽' : request.dietary.includes('素') ? '素食' : '餐馆'}`, mealCity.name), alternatives: [{ name: context.transit ? '出发前备好的替代简餐' : '住宿附近可核实餐馆', reason: '若排队或饮食限制无法满足，现场核实后改选' }] }, earliest);
    }
    const desired = request.pace === 'relaxed' ? 1 : request.pace === 'packed' ? 3 : 2;
    const maxVisits = request.children || request.accessibility ? Math.min(desired, 2) : desired;
    let visits = 0;
    for (let slot = 0; slot < maxVisits; slot++) {
      const candidates = city.places.filter(place => !used.has(place.id) && (!weather.rain || place.indoor) && (!(request.accessibility || request.children) || !place.strenuous));
      const month = Number(date.slice(5, 7));
      const ranked = candidates.map(place => {
        const groupTicket = place.ticket * people;
        const weights = profile.memoryEnabled ? place.tags.reduce((sum, tag) => sum + Math.min(10, Math.max(-10, Number(profile.learnedWeights[tag]) || 0)), 0) * 3 : 0;
        const affinity = place.tags.filter(tag => request.interests.includes(tag)).length * 8;
        const crowdPenalty = request.avoidCrowds ? (estimatedCrowd(place, date) === 'high' ? 6 : estimatedCrowd(place, date) === 'medium' ? 2 : 0) : 0;
        const costPenalty = economical ? groupTicket / Math.max(30, budgetPerDay) * 18 : groupTicket / Math.max(100, budgetPerDay) * 2;
        const seasonal = place.indoor && (month >= 11 || month <= 2 || month >= 6 && month <= 8) ? 3 : 0;
        const score = 20 - city.places.indexOf(place) * 0.4 + affinity + weights + seasonal - crowdPenalty - costPenalty - Math.min(20, distance(previous, place) * 0.25);
        return { place, score, matchesCurrent: hasCurrentInterest && place.tags.some(tag => request.interests.includes(tag)) ? 1 : 0 };
      }).sort((a, b) => b.matchesCurrent - a.matchesCurrent || b.score - a.score);
      // Prefer a good nearby candidate and then advance from it, avoiding repeated center returns.
      let selected: { place: CatalogPlace; travelMinutes: number; km: number } | undefined;
      for (const { place } of ranked) {
        const km = Math.round(distance(previous, place) * 1.3 * 10) / 10;
        const travelMinutes = Math.ceil(((request.transport === 'driving' ? km / 28 * 60 + 8 : km / 20 * 60 + 12) * (weather.rain ? 1.2 : 1)) / 5) * 5;
        if (cursor + travelMinutes + place.minutes + (!lunch ? 45 : 0) <= endOfVisits) { selected = { place, travelMinutes, km }; break; }
      }
      if (!selected) break;
      if (!lunch && cursor >= 11 * 60 + 30) { addMeal('午餐', 0.4, cursor); lunch = true; }
      const { place, km, travelMinutes } = selected;
      const alternatives = city.places.filter(other => other.id !== place.id && other.indoor && (!request.accessibility || !other.strenuous)).sort((a, b) => distance(place, a) - distance(place, b)).slice(0, 2).map(other => ({ name: other.name, reason: `雨天、排队或预约失败的候选；开放与预约仍需核实${other.ticket ? '，可能增加门票支出' : ''}` }));
      append({ id: place.id, name: place.name, kind: 'attraction', lat: place.lat, lon: place.lon, address: place.address, description: place.description, why: `${place.tags.filter(tag => request.interests.includes(tag)).map(tag => INTEREST_LABELS[tag]).join('、') || '匹配当天可用地点'}；${weather.rain ? '雨天优先室内展厅' : '兼顾地理距离与体力'}${profile.memoryEnabled && place.tags.some(tag => profile.learnedWeights[tag] > 0) ? '；历史正向反馈提高了推荐排序' : ''}${request.avoidCrowds ? '，已对预计拥挤地点降权' : ''}。`, tags: place.tags, estimatedCost: place.ticket * people, durationMinutes: place.minutes, travelMinutes, distanceKm: km, crowd: estimatedCrowd(place, date), status: place.id.startsWith('amap-') ? 'estimate' : 'catalog', sourceId: `places-${city.name}`, indoor: place.indoor, accessibility: place.strenuous ? '涉及台阶、登高或长程步行' : '优先常规参观动线；入口坡道、电梯与无障碍设施待确认', mapUrl: mapUrl(place.name, city.name), alternatives });
      breakdown.tickets += place.ticket * people;
      breakdown.transport += request.transport === 'driving' ? round((km * 1.7 + 12) * Math.ceil(people / 4)) : round(Math.max(2, km * 0.65) * people);
      used.add(place.id); visits++;
    }
    if (!lunch && (!returnTransit || Math.max(cursor, 12 * 60) + 45 <= endOfVisits)) addMeal('午餐', 0.4, Math.max(cursor, 12 * 60));
    if (!visits) {
      notes.push('当日转场耗时或符合条件的真实景点不足，保留休息与自主探索，不补造地点。');
      warnings.push(`${date} ${city.name}未安排固定景点：转场时间或可用室内/无障碍候选不足。`);
    }
    if (cursor + 45 <= endOfVisits) append({ id: `${date}-free`, name: weather.rain ? '室内休息 · 记录旅途' : '自由时间 · 随兴发现', kind: 'free', lat: previous.lat, lon: previous.lon, address: '当前位置附近 / 住宿处（待确认）', description: weather.rain ? '在已确认开放的室内场所休息，整理照片和旅途记录。' : '为休息、临时发现与照片记录留白；不强制追加景点。', why: '预留体力和变化空间，避免用重复景点填满行程。', tags: [], estimatedCost: 0, durationMinutes: 45, travelMinutes: 0, distanceKm: 0, crowd: 'low', status: 'estimate', sourceId: 'planning-estimates', indoor: weather.rain, accessibility: '按个人体力自主选择', mapUrl: mapUrl(`${city.name}休息`, city.name), alternatives: [] });
    if (returnTransit) addTransfer(city, origin!, 'return');
    if (!lunch) addMeal('午餐', 0.4, Math.max(cursor, 12 * 60), { city: returnTransit ? origin : city });
    if (!dinner) addMeal('晚餐', 0.4, Math.max(cursor, returnTransit ? 17 * 60 + 30 : 18 * 60), { city: returnTransit ? origin : city });
    breakdown.transport += (request.transport === 'driving' ? 20 * Math.ceil(people / 4) : 6 * people); // Unspecified short hotel connections need a cost allowance.
    if (stops.some(stop => stop.endTime > '23:59') || returnTransit && cursor > 22 * 60) throw new PlannerError('TRANSFER_SCHEDULE_INFEASIBLE', `${date}的跨城与往返交通无法在当天合理完成，请延长行程或调整出发地。`);
    days.push({ date, city: city.name, theme: `${weather.rain ? '雨天室内' : request.pace === 'relaxed' ? '慢享' : '探索'} · ${city.subtitle}`, stops, weather, lodging: { area: city.lodgingAreas[0], nightlyCost, note: `公共交通出行建议住地铁/公交附近；${rooms} 间双人房的全组每晚估计，不代表房源报价${index === dates.length - 1 ? '，最后一日住宿不计入预算' : ''}。` }, notes });
  }
  const subtotal = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  breakdown.buffer = Math.ceil(subtotal * 0.1);
  const total = subtotal + breakdown.buffer;
  if (total > request.budget) warnings.push(`总预算 ${request.budget} 元不足以覆盖当前估计 ${total} 元（差额 ${total - request.budget} 元）；已倾向节约方案，建议减少天数/人数、换住宿或提高预算后确认。`);
  const packing = ['身份证及已确认预约凭证', '舒适防滑鞋与替换袜', '充电器、充电宝与拍摄设备', '饮水与个人日常用品'];
  const month = Number(request.startDate.slice(5, 7));
  packing.push(month >= 11 || month <= 2 ? '保暖外套与防风层（按临近预报调整）' : month >= 6 && month <= 8 ? '透气速干衣、遮阳帽与防晒用品' : '薄外套与可叠穿衣物');
  if (days.some(day => day.weather.rain) || request.weatherScenario === 'auto') packing.push('雨伞 / 轻便雨衣与鞋袋');
  if (cities.some(city => city.name === '大理')) packing.push('防晒与防风外套，适应早晚温差');
  if (request.children) packing.push('儿童备用衣物、零食与常用照护用品');
  if (request.accessibility) packing.push('个人辅助工具与无障碍服务确认信息');
  if (request.dietary) packing.push('饮食限制说明卡与适合自己的备用零食');
  const createdAt = options.createdAt || new Date().toISOString();
  return {
    id: options.id || randomUUID(), revision: options.revision || 1, createdAt, updatedAt: new Date().toISOString(), request,
    title: `${cities.map(city => city.name).join(' → ')} · ${dates.length} 天${request.pace === 'relaxed' ? '慢旅行' : '旅行计划'}`,
    summary: `为 ${request.adults} 位成人${request.children ? `和 ${request.children} 位儿童` : ''}安排 ${dates.length} 天路线，整合${request.interests.map(interest => INTEREST_LABELS[interest]).join('、') || '当地体验'}、餐饮、住宿区域、转场与休息。${total <= request.budget ? '当前估算在总预算内' : '当前预算存在缺口'}；预约与商家需确认。`,
    days, budget: { currency: 'CNY', total, perPerson: round(total / people), limit: request.budget, withinBudget: total <= request.budget, breakdown, note: `${people} 人全组估计，住宿 ${dates.length - 1} 晚，包含 10% 机动金。儿童门票按成人保守估算。${origin ? '目录内出发地往返已估计。' : '未计无法核实的出发地往返大交通。'}购物、保险与额外消费另计。` }, packing, warnings: [...new Set(warnings)], sources,
    reasoning: [
      `结构化需求优先：${request.pace === 'relaxed' ? '宽松' : request.pace === 'packed' ? '紧凑' : '均衡'}节奏，${people} 人，总预算 ${request.budget} 元；空白偏好由自由文本与手动画像补充。`,
      `按请求顺序分配 ${cities.length} 座城市的连续日期；以偏好、反馈、费用、季节与拥挤估计评分，再结合上一个地点的距离减少折返。`,
      '全天不重复安排同一景点；时间不足或候选耗尽时留出自由时间。室内优先适用于真实降雨预报或用户雨天模拟。',
      profile.memoryEnabled ? '记忆开启：已启用历史反馈的有限权重调整，手动偏好与当前请求仍优先。' : '记忆关闭：完全忽略 learnedWeights，不使用历史反馈影响排序。',
      '餐饮按全组人数、住宿按房间与夜数、交通按市内路段和跨城距离估算；不假定儿童折扣。',
    ],
    agentTrace: [
      { stage: 'understand', label: '理解旅行需求', detail: model.detail, status: model.degraded ? 'degraded' : 'done' },
      { stage: 'profile', label: '应用个人偏好', detail: profile.memoryEnabled ? `结合手动偏好与 ${profile.feedbackCount} 次历史反馈；当前结构化需求优先。` : '记忆关闭，未使用历史反馈权重。', status: 'done' },
      { stage: 'research', label: '核实候选与天气', detail: `使用 ${cities.length} 城真实目录/检索候选；天气仅对近 16 天有效返回值标 live，其余明确标 seasonal/scenario。营业预约未核实。`, status: weatherData.some(result => result.degraded) ? 'degraded' : 'done' },
      { stage: 'route', label: '组织路线与转场', detail: '连续日期分配城市，以地理距离减少折返，计入市内接驳、跨城时间与费用，景点不重复。', status: 'done' },
      { stage: 'budget', label: '检查全组预算', detail: `全组估计 ${total} 元 / 上限 ${request.budget} 元，包含 ${dates.length - 1} 晚住宿与机动金。`, status: total > request.budget ? 'degraded' : 'done' },
      { stage: 'check', label: '检查天气与可执行性', detail: '保留雨天候选、休息时间、饮食限制、无障碍核实提醒与出发准备清单；没有自动订票或预订。', status: 'done' },
    ],
  };
}
