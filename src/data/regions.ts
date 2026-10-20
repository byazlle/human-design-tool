/**
 * 出生地参考数据（精简版）。
 *
 * 重要说明：人类图的排盘只取决于「出生的绝对时刻（UTC）」，
 * 与经纬度无关（行星位置是地心坐标，不使用宫位/上升点）。
 * 因此经纬度仅用于界面展示与未来扩展，精度要求低；
 * 真正影响结果的是「时区 + 出生时间」。
 *
 * 数据口径：GB/T 2260 行政区划码前 4 位（省 2 + 市 2）。
 */

export interface RegionEntry {
  /** 4 位前缀或 2 位省码 */
  code: string
  name: string
  lat: number
  lng: number
  timezone: string
  /** 省级条目标记 */
  province?: boolean
}

export const PROVINCES: RegionEntry[] = [
  { code: '11', name: '北京市', lat: 39.9, lng: 116.41, timezone: 'Asia/Shanghai', province: true },
  { code: '12', name: '天津市', lat: 39.08, lng: 117.2, timezone: 'Asia/Shanghai', province: true },
  { code: '13', name: '河北省', lat: 38.04, lng: 114.51, timezone: 'Asia/Shanghai', province: true },
  { code: '14', name: '山西省', lat: 37.87, lng: 112.55, timezone: 'Asia/Shanghai', province: true },
  { code: '15', name: '内蒙古自治区', lat: 40.82, lng: 111.75, timezone: 'Asia/Shanghai', province: true },
  { code: '21', name: '辽宁省', lat: 41.8, lng: 123.43, timezone: 'Asia/Shanghai', province: true },
  { code: '22', name: '吉林省', lat: 43.9, lng: 125.32, timezone: 'Asia/Shanghai', province: true },
  { code: '23', name: '黑龙江省', lat: 45.8, lng: 126.53, timezone: 'Asia/Shanghai', province: true },
  { code: '31', name: '上海市', lat: 31.23, lng: 121.47, timezone: 'Asia/Shanghai', province: true },
  { code: '32', name: '江苏省', lat: 32.06, lng: 118.8, timezone: 'Asia/Shanghai', province: true },
  { code: '33', name: '浙江省', lat: 30.27, lng: 120.15, timezone: 'Asia/Shanghai', province: true },
  { code: '34', name: '安徽省', lat: 31.86, lng: 117.28, timezone: 'Asia/Shanghai', province: true },
  { code: '35', name: '福建省', lat: 26.07, lng: 119.3, timezone: 'Asia/Shanghai', province: true },
  { code: '36', name: '江西省', lat: 28.68, lng: 115.86, timezone: 'Asia/Shanghai', province: true },
  { code: '37', name: '山东省', lat: 36.67, lng: 117.0, timezone: 'Asia/Shanghai', province: true },
  { code: '41', name: '河南省', lat: 34.77, lng: 113.65, timezone: 'Asia/Shanghai', province: true },
  { code: '42', name: '湖北省', lat: 30.59, lng: 114.3, timezone: 'Asia/Shanghai', province: true },
  { code: '43', name: '湖南省', lat: 28.19, lng: 112.98, timezone: 'Asia/Shanghai', province: true },
  { code: '44', name: '广东省', lat: 23.13, lng: 113.26, timezone: 'Asia/Shanghai', province: true },
  { code: '45', name: '广西壮族自治区', lat: 22.82, lng: 108.37, timezone: 'Asia/Shanghai', province: true },
  { code: '46', name: '海南省', lat: 20.04, lng: 110.32, timezone: 'Asia/Shanghai', province: true },
  { code: '50', name: '重庆市', lat: 29.56, lng: 106.55, timezone: 'Asia/Shanghai', province: true },
  { code: '51', name: '四川省', lat: 30.66, lng: 104.07, timezone: 'Asia/Shanghai', province: true },
  { code: '52', name: '贵州省', lat: 26.65, lng: 106.63, timezone: 'Asia/Shanghai', province: true },
  { code: '53', name: '云南省', lat: 25.04, lng: 102.71, timezone: 'Asia/Shanghai', province: true },
  { code: '54', name: '西藏自治区', lat: 29.65, lng: 91.14, timezone: 'Asia/Shanghai', province: true },
  { code: '61', name: '陕西省', lat: 34.34, lng: 108.94, timezone: 'Asia/Shanghai', province: true },
  { code: '62', name: '甘肃省', lat: 36.06, lng: 103.83, timezone: 'Asia/Shanghai', province: true },
  { code: '63', name: '青海省', lat: 36.62, lng: 101.78, timezone: 'Asia/Shanghai', province: true },
  { code: '64', name: '宁夏回族自治区', lat: 38.47, lng: 106.28, timezone: 'Asia/Shanghai', province: true },
  { code: '65', name: '新疆维吾尔自治区', lat: 43.79, lng: 87.63, timezone: 'Asia/Shanghai', province: true },
  { code: '71', name: '台湾省', lat: 25.03, lng: 121.56, timezone: 'Asia/Taipei', province: true },
  { code: '81', name: '香港特别行政区', lat: 22.32, lng: 114.17, timezone: 'Asia/Hong_Kong', province: true },
  { code: '82', name: '澳门特别行政区', lat: 22.2, lng: 113.55, timezone: 'Asia/Macau', province: true },
]

/** 常见地级市（键为 4 位行政区划前缀） */
export const CITIES: RegionEntry[] = [
  { code: '1101', name: '北京市', lat: 39.9, lng: 116.41, timezone: 'Asia/Shanghai' },
  { code: '1201', name: '天津市', lat: 39.08, lng: 117.2, timezone: 'Asia/Shanghai' },
  { code: '1301', name: '石家庄市', lat: 38.04, lng: 114.51, timezone: 'Asia/Shanghai' },
  { code: '1302', name: '唐山市', lat: 39.63, lng: 118.18, timezone: 'Asia/Shanghai' },
  { code: '1306', name: '保定市', lat: 38.87, lng: 115.46, timezone: 'Asia/Shanghai' },
  { code: '1401', name: '太原市', lat: 37.87, lng: 112.55, timezone: 'Asia/Shanghai' },
  { code: '1402', name: '大同市', lat: 40.09, lng: 113.3, timezone: 'Asia/Shanghai' },
  { code: '1501', name: '呼和浩特市', lat: 40.82, lng: 111.75, timezone: 'Asia/Shanghai' },
  { code: '1502', name: '包头市', lat: 40.66, lng: 109.84, timezone: 'Asia/Shanghai' },
  { code: '2101', name: '沈阳市', lat: 41.8, lng: 123.43, timezone: 'Asia/Shanghai' },
  { code: '2102', name: '大连市', lat: 38.91, lng: 121.61, timezone: 'Asia/Shanghai' },
  { code: '2103', name: '鞍山市', lat: 41.11, lng: 122.99, timezone: 'Asia/Shanghai' },
  { code: '2201', name: '长春市', lat: 43.9, lng: 125.32, timezone: 'Asia/Shanghai' },
  { code: '2202', name: '吉林市', lat: 43.84, lng: 126.55, timezone: 'Asia/Shanghai' },
  { code: '2301', name: '哈尔滨市', lat: 45.8, lng: 126.53, timezone: 'Asia/Shanghai' },
  { code: '2306', name: '大庆市', lat: 46.59, lng: 125.1, timezone: 'Asia/Shanghai' },
  { code: '3101', name: '上海市', lat: 31.23, lng: 121.47, timezone: 'Asia/Shanghai' },
  { code: '3201', name: '南京市', lat: 32.06, lng: 118.8, timezone: 'Asia/Shanghai' },
  { code: '3202', name: '无锡市', lat: 31.49, lng: 120.31, timezone: 'Asia/Shanghai' },
  { code: '3203', name: '徐州市', lat: 34.26, lng: 117.28, timezone: 'Asia/Shanghai' },
  { code: '3205', name: '苏州市', lat: 31.3, lng: 120.58, timezone: 'Asia/Shanghai' },
  { code: '3206', name: '南通市', lat: 31.98, lng: 120.89, timezone: 'Asia/Shanghai' },
  { code: '3210', name: '扬州市', lat: 32.39, lng: 119.41, timezone: 'Asia/Shanghai' },
  { code: '3301', name: '杭州市', lat: 30.27, lng: 120.15, timezone: 'Asia/Shanghai' },
  { code: '3302', name: '宁波市', lat: 29.87, lng: 121.55, timezone: 'Asia/Shanghai' },
  { code: '3303', name: '温州市', lat: 27.99, lng: 120.7, timezone: 'Asia/Shanghai' },
  { code: '3304', name: '嘉兴市', lat: 30.75, lng: 120.76, timezone: 'Asia/Shanghai' },
  { code: '3306', name: '绍兴市', lat: 29.99, lng: 120.58, timezone: 'Asia/Shanghai' },
  { code: '3307', name: '金华市', lat: 29.08, lng: 119.65, timezone: 'Asia/Shanghai' },
  { code: '3401', name: '合肥市', lat: 31.86, lng: 117.28, timezone: 'Asia/Shanghai' },
  { code: '3402', name: '芜湖市', lat: 31.35, lng: 118.43, timezone: 'Asia/Shanghai' },
  { code: '3501', name: '福州市', lat: 26.07, lng: 119.3, timezone: 'Asia/Shanghai' },
  { code: '3502', name: '厦门市', lat: 24.48, lng: 118.09, timezone: 'Asia/Shanghai' },
  { code: '3505', name: '泉州市', lat: 24.87, lng: 118.68, timezone: 'Asia/Shanghai' },
  { code: '3601', name: '南昌市', lat: 28.68, lng: 115.86, timezone: 'Asia/Shanghai' },
  { code: '3607', name: '赣州市', lat: 25.83, lng: 114.94, timezone: 'Asia/Shanghai' },
  { code: '3701', name: '济南市', lat: 36.67, lng: 117.0, timezone: 'Asia/Shanghai' },
  { code: '3702', name: '青岛市', lat: 36.07, lng: 120.38, timezone: 'Asia/Shanghai' },
  { code: '3706', name: '烟台市', lat: 37.46, lng: 121.45, timezone: 'Asia/Shanghai' },
  { code: '3707', name: '潍坊市', lat: 36.71, lng: 119.16, timezone: 'Asia/Shanghai' },
  { code: '3708', name: '济宁市', lat: 35.41, lng: 116.59, timezone: 'Asia/Shanghai' },
  { code: '4101', name: '郑州市', lat: 34.77, lng: 113.65, timezone: 'Asia/Shanghai' },
  { code: '4103', name: '洛阳市', lat: 34.62, lng: 112.45, timezone: 'Asia/Shanghai' },
  { code: '4113', name: '南阳市', lat: 32.99, lng: 112.53, timezone: 'Asia/Shanghai' },
  { code: '4201', name: '武汉市', lat: 30.59, lng: 114.3, timezone: 'Asia/Shanghai' },
  { code: '4205', name: '宜昌市', lat: 30.69, lng: 111.29, timezone: 'Asia/Shanghai' },
  { code: '4206', name: '襄阳市', lat: 32.01, lng: 112.12, timezone: 'Asia/Shanghai' },
  { code: '4301', name: '长沙市', lat: 28.19, lng: 112.98, timezone: 'Asia/Shanghai' },
  { code: '4307', name: '常德市', lat: 29.03, lng: 111.7, timezone: 'Asia/Shanghai' },
  { code: '4401', name: '广州市', lat: 23.13, lng: 113.26, timezone: 'Asia/Shanghai' },
  { code: '4403', name: '深圳市', lat: 22.54, lng: 114.06, timezone: 'Asia/Shanghai' },
  { code: '4404', name: '珠海市', lat: 22.27, lng: 113.58, timezone: 'Asia/Shanghai' },
  { code: '4406', name: '佛山市', lat: 23.02, lng: 113.12, timezone: 'Asia/Shanghai' },
  { code: '4413', name: '惠州市', lat: 23.11, lng: 114.42, timezone: 'Asia/Shanghai' },
  { code: '4419', name: '东莞市', lat: 23.02, lng: 113.75, timezone: 'Asia/Shanghai' },
  { code: '4420', name: '中山市', lat: 22.52, lng: 113.39, timezone: 'Asia/Shanghai' },
  { code: '4451', name: '潮州市', lat: 23.66, lng: 116.62, timezone: 'Asia/Shanghai' },
  { code: '4452', name: '揭阳市', lat: 23.55, lng: 116.37, timezone: 'Asia/Shanghai' },
  { code: '4501', name: '南宁市', lat: 22.82, lng: 108.37, timezone: 'Asia/Shanghai' },
  { code: '4503', name: '桂林市', lat: 25.27, lng: 110.29, timezone: 'Asia/Shanghai' },
  { code: '4601', name: '海口市', lat: 20.04, lng: 110.32, timezone: 'Asia/Shanghai' },
  { code: '4602', name: '三亚市', lat: 18.25, lng: 109.51, timezone: 'Asia/Shanghai' },
  { code: '5001', name: '重庆市', lat: 29.56, lng: 106.55, timezone: 'Asia/Shanghai' },
  { code: '5101', name: '成都市', lat: 30.66, lng: 104.07, timezone: 'Asia/Shanghai' },
  { code: '5107', name: '绵阳市', lat: 31.47, lng: 104.68, timezone: 'Asia/Shanghai' },
  { code: '5201', name: '贵阳市', lat: 26.65, lng: 106.63, timezone: 'Asia/Shanghai' },
  { code: '5301', name: '昆明市', lat: 25.04, lng: 102.71, timezone: 'Asia/Shanghai' },
  { code: '5401', name: '拉萨市', lat: 29.65, lng: 91.14, timezone: 'Asia/Shanghai' },
  { code: '6101', name: '西安市', lat: 34.34, lng: 108.94, timezone: 'Asia/Shanghai' },
  { code: '6104', name: '咸阳市', lat: 34.33, lng: 108.71, timezone: 'Asia/Shanghai' },
  { code: '6201', name: '兰州市', lat: 36.06, lng: 103.83, timezone: 'Asia/Shanghai' },
  { code: '6301', name: '西宁市', lat: 36.62, lng: 101.78, timezone: 'Asia/Shanghai' },
  { code: '6401', name: '银川市', lat: 38.47, lng: 106.28, timezone: 'Asia/Shanghai' },
  { code: '6501', name: '乌鲁木齐市', lat: 43.79, lng: 87.63, timezone: 'Asia/Shanghai' },
  { code: '7101', name: '台北市', lat: 25.03, lng: 121.56, timezone: 'Asia/Taipei' },
  { code: '8101', name: '香港', lat: 22.32, lng: 114.17, timezone: 'Asia/Hong_Kong' },
  { code: '8201', name: '澳门', lat: 22.2, lng: 113.55, timezone: 'Asia/Macau' },
]

const CITY_MAP = new Map(CITIES.map((c) => [c.code, c]))
const PROVINCE_MAP = new Map(PROVINCES.map((p) => [p.code, p]))

export interface ResolvedRegion {
  /** 命中的最细层级名称 */
  name: string
  province: string
  lat: number
  lng: number
  timezone: string
  /** 是否为省级兜底（未匹配到具体城市） */
  approximate: boolean
}

export function resolveRegion(regionCode: string): ResolvedRegion | null {
  if (!/^\d{6}$/.test(regionCode)) return null
  const province = PROVINCE_MAP.get(regionCode.slice(0, 2))
  if (!province) return null

  const city = CITY_MAP.get(regionCode.slice(0, 4))
  if (city) {
    return {
      name: city.name,
      province: province.name,
      lat: city.lat,
      lng: city.lng,
      timezone: city.timezone,
      approximate: false,
    }
  }
  return {
    name: province.name,
    province: province.name,
    lat: province.lat,
    lng: province.lng,
    timezone: province.timezone,
    approximate: true,
  }
}
