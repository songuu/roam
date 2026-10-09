import type { Destination, Interest } from '../shared/types';

export interface CatalogPlace {
  id: string; name: string; lat: number; lon: number; address: string;
  tags: Interest[]; indoor: boolean; ticket: number; minutes: number;
  popularity: number; family: boolean; strenuous: boolean; description: string;
}
export interface CityCatalog {
  name: string; lat: number; lon: number; subtitle: string; tags: Interest[];
  sourceUrl: string; places: CatalogPlace[]; lodgingAreas: string[];
  food: string; seasonalNote: string; lodgingBase: number;
}
type PlaceRow = [name: string, lat: number, lon: number, tags: Interest[], indoor: boolean, ticket: number, minutes: number, popularity: number, description: string, strenuous?: boolean];
function city(data: Omit<CityCatalog, 'places'>, rows: PlaceRow[]): CityCatalog {
  return { ...data, places: rows.map(([name, lat, lon, tags, indoor, ticket, minutes, popularity, description, strenuous], index) => ({ id: `${data.name}-${index + 1}`, name, lat, lon, tags, indoor, ticket, minutes, popularity, description, strenuous: Boolean(strenuous), family: !strenuous, address: `${data.name} · ${name}（具体入口请打开地图核实）` })) };
}

// Coordinates and costs are planning approximations, never availability or booking claims.
export const cityCatalogs: CityCatalog[] = [
  city({ name: '杭州', lat: 30.2741, lon: 120.1551, subtitle: '湖山慢行 · 江南烟雨', tags: ['nature', 'culture', 'food'], sourceUrl: 'https://wgly.hangzhou.gov.cn/attach/538/2307051510367229.pdf', lodgingAreas: ['武林广场 / 凤起路地铁周边', '西湖东侧 / 龙翔桥周边'], food: '杭帮菜、片儿川、葱包桧；根据饮食限制选择清淡做法', seasonalNote: '春秋适合湖畔步行；夏季防暑并留意梅雨，冬季备防风层。花期与红叶随天气变化。', lodgingBase: 260 }, [
    ['西湖苏堤', 30.2404, 120.1352, ['nature', 'photography', 'citywalk'], false, 0, 110, 5, '沿湖分段慢行，看湖山与堤岸；无需一次走完整圈'],
    ['西湖断桥', 30.2591, 120.1489, ['nature', 'photography'], false, 0, 65, 5, '从断桥进入白堤，选择短段湖边散步'],
    ['西湖博物馆', 30.2375, 120.1561, ['culture', 'nature'], true, 0, 90, 2, '以室内展厅了解西湖历史与自然环境，院落转场仍需雨具'],
    ['中国丝绸博物馆', 30.2237, 120.1488, ['culture', 'shopping'], true, 0, 100, 2, '参观丝绸历史、工艺与服饰展厅'],
    ['杭州博物馆', 30.2374, 120.1707, ['culture'], true, 0, 100, 2, '通过馆内展陈认识杭州城市发展'],
    ['浙江省博物馆孤山馆区', 30.2527, 120.1384, ['culture'], true, 0, 100, 3, '参观孤山馆区室内展陈；开放展区需以官方公告为准'],
    ['南宋官窑博物馆', 30.2055, 120.1644, ['culture', 'photography'], true, 0, 100, 1, '观察宋代陶瓷与遗址展示'],
    ['河坊街', 30.2376, 120.1765, ['food', 'shopping', 'citywalk'], false, 0, 90, 4, '历史街区步行与特色小食，避开正餐高峰'],
    ['西溪国家湿地公园', 30.2689, 120.0625, ['nature', 'photography'], false, 80, 150, 3, '湿地步道与生态观察，雨天不安排水上活动'],
    ['九溪烟树', 30.1992, 120.1131, ['nature', 'photography'], false, 0, 120, 3, '林间溪谷步行，湿滑或强降雨时取消', true],
  ]),
  city({ name: '成都', lat: 30.5728, lon: 104.0668, subtitle: '烟火巷陌 · 松弛之城', tags: ['food', 'culture', 'citywalk'], sourceUrl: 'https://m.panda.org.cn/yd/', lodgingAreas: ['天府广场 / 人民公园地铁周边', '春熙路地铁周边'], food: '川菜、担担面、钟水饺；可要求清汤、分锅与少油少辣', seasonalNote: '春秋户外体感较舒适；夏季湿热多雨，冬季阴冷，熊猫活动情况无法预先保证。', lodgingBase: 220 }, [
    ['成都大熊猫繁育研究基地', 30.7381, 104.1455, ['nature', 'photography'], false, 55, 180, 5, '早段观察大熊猫与生态园区，需预留园内步行时间'],
    ['成都博物馆', 30.6572, 104.0632, ['culture'], true, 0, 120, 3, '以室内历史展陈建立成都城市印象'],
    ['四川博物院', 30.6622, 104.0277, ['culture'], true, 0, 120, 2, '参观巴蜀文物与艺术展厅'],
    ['成都自然博物馆', 30.6776, 104.1454, ['nature', 'culture'], true, 0, 120, 3, '恐龙化石与自然科普，适合亲子室内参观'],
    ['金沙遗址博物馆展厅', 30.6835, 104.0115, ['culture', 'photography'], true, 70, 120, 3, '以室内遗址与文物展厅为主，园区转场备雨具'],
    ['人民公园', 30.6556, 104.055, ['citywalk', 'nature', 'food'], false, 0, 90, 3, '城市公园慢行，茶馆消费按实际另计'],
    ['宽窄巷子', 30.6635, 104.0523, ['citywalk', 'food', 'photography'], false, 0, 100, 5, '老街巷与建筑观察，推荐错峰穿行'],
    ['锦里', 30.6456, 104.0497, ['food', 'shopping', 'culture'], false, 0, 90, 5, '民俗街区漫步与小食体验'],
    ['武侯祠', 30.6459, 104.0482, ['culture'], false, 50, 120, 4, '三国遗迹与园林，院落以户外为主'],
    ['杜甫草堂', 30.6608, 104.0288, ['culture', 'nature'], false, 50, 120, 3, '诗人纪念园林与建筑慢行'],
  ]),
  city({ name: '大理', lat: 25.6065, lon: 100.2676, subtitle: '苍山洱海 · 风与日常', tags: ['nature', 'photography', 'citywalk'], sourceUrl: 'https://www.yndali.gov.cn/dlsrmzf/c103380/pc/content/1985989376943951872/content_1985989376943951872.html', lodgingAreas: ['大理古城南门周边', '下关 / 大理站周边（便于交通）'], food: '米线、饵块、乳扇、白族家常菜；乳制品过敏者避开乳扇', seasonalNote: '紫外线强、早晚温差大；夏季雨季慎选山地与湖上项目，冬春注意大风。', lodgingBase: 230 }, [
    ['大理古城', 25.6948, 100.163, ['culture', 'citywalk', 'food'], false, 0, 120, 4, '古城街巷分段步行，不将整个古城安排为重复景点'],
    ['洱海生态廊道才村段', 25.7112, 100.2001, ['nature', 'photography', 'citywalk'], false, 0, 110, 3, '湖边短段步行，不安排机动车进入生态廊道'],
    ['喜洲古镇', 25.8502, 100.1317, ['culture', 'food', 'photography'], false, 0, 120, 3, '白族民居与街巷，尊重居民日常生活'],
    ['崇圣寺三塔', 25.7116, 100.1486, ['culture', 'photography'], false, 75, 120, 4, '三塔与历史景观，室外路段较多'],
    ['大理市博物馆', 25.6902, 100.1638, ['culture'], true, 0, 90, 2, '馆内展陈认识大理历史；古建院落间需短距离户外转场'],
    ['大理白族自治州博物馆', 25.6009, 100.2416, ['culture'], true, 0, 100, 2, '以室内民族历史与文物展陈为主'],
    ['大理州非物质文化遗产博物馆', 25.6021, 100.2411, ['culture', 'shopping'], true, 0, 90, 1, '了解白族传统工艺；具体展陈与开放情况需提前确认'],
    ['双廊古镇', 25.9264, 100.1955, ['nature', 'photography', 'citywalk'], false, 0, 130, 4, '洱海东岸镇区漫步，往返路程较长'],
    ['苍山洗马潭索道周边', 25.6763, 100.1233, ['nature', 'photography'], false, 280, 180, 4, '高海拔项目仅在天气和身体条件允许时考虑，索道运行需核实', true],
    ['龙尾关历史街区', 25.5711, 100.2218, ['culture', 'citywalk'], false, 0, 90, 1, '下关历史街区步行，适合城市生活观察'],
  ]),
  city({ name: '北京', lat: 39.9042, lon: 116.4074, subtitle: '古都轴线 · 博物时光', tags: ['culture', 'citywalk', 'food'], sourceUrl: 'https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html', lodgingAreas: ['东四 / 灯市口地铁周边', '西单 / 宣武门地铁周边'], food: '北京烤鸭、炸酱面、豆汁等；可改选蔬菜与素面，酱料单独提供', seasonalNote: '春季留意风沙，夏季防暑，秋季适合步行，冬季防风保暖；户外景观随气温变化。', lodgingBase: 330 }, [
    ['故宫博物院', 39.9163, 116.3972, ['culture', 'photography'], false, 60, 180, 5, '宫殿建筑与文物参观，主要动线在户外，预约需确认'],
    ['天坛公园', 39.8822, 116.4066, ['culture', 'nature', 'photography'], false, 34, 140, 4, '古建筑轴线与公园步行'],
    ['颐和园', 39.9999, 116.2755, ['culture', 'nature'], false, 60, 180, 5, '皇家园林分区游览，按体力缩短湖畔动线'],
    ['首都博物馆', 39.906, 116.3412, ['culture'], true, 0, 120, 2, '室内认识北京城市历史与文化'],
    ['中国国家博物馆', 39.9035, 116.4014, ['culture'], true, 0, 160, 5, '大型文物展厅，安检与预约时间需额外预留'],
    ['中国科学技术馆', 40.0038, 116.3983, ['nature', 'culture'], true, 30, 140, 4, '科学互动展厅，适合儿童参与'],
    ['北京鲁迅博物馆', 39.9233, 116.3566, ['culture'], true, 0, 100, 1, '室内文学展陈与故居院落，转场需雨具'],
    ['什刹海', 39.9401, 116.3857, ['citywalk', 'nature', 'photography'], false, 0, 110, 4, '湖边与胡同短段慢行，避免商业高峰'],
    ['前门大街', 39.8949, 116.3981, ['citywalk', 'food', 'shopping'], false, 0, 90, 4, '历史商业街步行，消费按现场菜单核实'],
    ['景山公园', 39.925, 116.3969, ['nature', 'photography'], false, 2, 90, 3, '园林与中轴线观景；登高需上台阶', true],
  ]),
  city({ name: '上海', lat: 31.2304, lon: 121.4737, subtitle: '江风夜色 · 城市漫游', tags: ['citywalk', 'shopping', 'culture'], sourceUrl: 'https://www.shanghai.gov.cn/huangpu/index.html', lodgingAreas: ['人民广场 / 南京西路地铁周边', '静安寺地铁周边'], food: '本帮菜、小笼、生煎；清淡或素食可选菜饭与蔬菜，核实馅料', seasonalNote: '春秋适合滨江散步；梅雨与台风季要看临近预警，冬季滨江体感偏冷。', lodgingBase: 310 }, [
    ['外滩', 31.2396, 121.4908, ['photography', 'citywalk', 'culture'], false, 0, 100, 5, '黄浦江岸步行与建筑观察，恶劣天气取消江边活动'],
    ['豫园', 31.2274, 121.4873, ['culture', 'photography'], false, 40, 100, 4, '古典园林游览，雨天路面可能湿滑'],
    ['上海博物馆人民广场馆', 31.2272, 121.4751, ['culture'], true, 0, 120, 4, '参观室内艺术与文物展陈，开放展区以公告为准'],
    ['上海自然博物馆', 31.2364, 121.462, ['nature', 'culture'], true, 30, 140, 4, '自然历史与生态展览，适合亲子'],
    ['上海市历史博物馆', 31.2324, 121.4723, ['culture'], true, 0, 110, 2, '通过室内展陈认识上海发展'],
    ['世博会博物馆', 31.2021, 121.4811, ['culture', 'photography'], true, 0, 110, 2, '世博历史与城市文化室内展厅'],
    ['南京西路', 31.2333, 121.4598, ['shopping', 'citywalk', 'food'], false, 0, 90, 4, '商业街步行与休息，购物费用不包含在预算中'],
    ['武康路', 31.2084, 121.4378, ['citywalk', 'photography', 'culture'], false, 0, 100, 4, '街区建筑慢行，拍摄时不要打扰居民'],
    ['世纪公园', 31.213, 121.5494, ['nature', 'citywalk'], false, 0, 120, 3, '城市公园短程散步与休息'],
    ['苏州河四行仓库周边', 31.2444, 121.4682, ['citywalk', 'culture', 'photography'], false, 0, 90, 2, '河岸步行与近代建筑观察，入馆需另核开放信息'],
  ]),
  city({ name: '西安', lat: 34.3416, lon: 108.9398, subtitle: '长安文脉 · 千年烟火', tags: ['culture', 'food', 'photography'], sourceUrl: 'https://wlj.xa.gov.cn/wlml/lyjq/1.html', lodgingAreas: ['钟楼 / 南门地铁周边', '小寨 / 大雁塔地铁周边'], food: '面食、肉夹馍、羊肉泡馍；素食可选油泼面并核实汤底与油脂', seasonalNote: '春秋适合古城步行；夏季日晒强，冬季防寒，室外古迹按天气调整。', lodgingBase: 210 }, [
    ['秦始皇帝陵博物院兵马俑展厅', 34.3841, 109.2785, ['culture', 'photography'], true, 120, 180, 5, '以俑坑室内展厅为主，园区间转场需要雨具且距城区较远'],
    ['陕西历史博物馆', 34.2224, 108.9555, ['culture'], true, 0, 140, 5, '大型历史文物展陈，基本展与特展费用应分别核实'],
    ['西安博物院展厅', 34.2295, 108.9393, ['culture'], true, 0, 120, 2, '室内认识长安历史，园林院落仍有户外转场'],
    ['西安碑林博物馆展厅', 34.2518, 108.9532, ['culture'], true, 65, 120, 3, '碑刻艺术展厅，古建院落间需雨具'],
    ['大雁塔南广场', 34.2157, 108.9639, ['culture', 'photography', 'citywalk'], false, 0, 100, 4, '广场与古塔外观，登塔及寺院入场费用另核实'],
    ['西安城墙南门段', 34.2521, 108.9476, ['culture', 'photography'], false, 54, 120, 4, '按体力分段步行，不默认全程骑行', true],
    ['回民街', 34.2638, 108.9404, ['food', 'citywalk'], false, 0, 90, 5, '饮食街区，尊重宗教饮食习惯并按菜单点餐'],
    ['大唐不夜城', 34.21, 108.964, ['citywalk', 'photography', 'shopping'], false, 0, 100, 5, '步行街建筑与夜色；表演安排未核实'],
    ['大明宫国家遗址公园', 34.2915, 108.9631, ['culture', 'nature'], false, 60, 140, 3, '遗址空间与公园分区步行，收费区域另核实'],
    ['陕西自然博物馆', 34.1949, 108.9377, ['nature', 'culture'], true, 30, 120, 2, '自然与科学室内展厅，适合亲子'],
  ]),
];

export const destinations: Destination[] = cityCatalogs.map(({ name, subtitle, lat, lon, tags }) => ({ name, subtitle, lat, lon, tags, image: '' }));
export function findCity(name: string): CityCatalog | undefined { return cityCatalogs.find(item => item.name === name.replace(/市$/, '').trim()); }
