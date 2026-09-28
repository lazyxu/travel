import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enumerateDates,
  normalizeCoordinate,
  normalizeCurrency,
  normalizeItemDetails,
  normalizeMoney,
  normalizeReferences,
  normalizeRouteMode,
  normalizeTime,
  normalizeTimeRange,
  normalizeUrlList,
  optionalUrl
} from '../src/lib.js';
import { deriveHotelName, detectBookingPlatform, detectPlatform, dianpingAppUrl, extractContentTitle, extractDianpingShopId, extractHtmlTitle, isPrivateAddress } from '../src/link-preview.js';
import { normalizeBaiduPoiPayload, parseBaiduMapLink } from '../src/baidu.js';
import { analyzeOrderText } from '../src/order-parser.js';

test('enumerateDates includes both ends', () => {
  assert.deepEqual(enumerateDates('2026-10-01', '2026-10-03'), ['2026-10-01', '2026-10-02', '2026-10-03']);
});
test('enumerateDates rejects reversed ranges', () => {
  assert.throws(() => enumerateDates('2026-10-03', '2026-10-01'));
});
test('normalizeTime validates HH:MM', () => {
  assert.equal(normalizeTime('09:30'), '09:30');
  assert.throws(() => normalizeTime('25:00'));
});
test('normalizeTimeRange supports point and range times', () => {
  assert.deepEqual(normalizeTimeRange('09:30', ''), { startTime: '09:30', endTime: '' });
  assert.deepEqual(normalizeTimeRange('09:30', '11:00'), { startTime: '09:30', endTime: '11:00' });
  assert.throws(() => normalizeTimeRange('', '11:00'));
  assert.throws(() => normalizeTimeRange('12:00', '11:00'));
});
test('optionalUrl only accepts http(s)', () => {
  assert.equal(optionalUrl('', '链接'), '');
  assert.match(optionalUrl('https://www.xiaohongshu.com/explore/1', '链接'), /^https:/);
  assert.throws(() => optionalUrl('javascript:alert(1)', '链接'));
});
test('normalizeUrlList normalizes image URL lists', () => {
  assert.deepEqual(normalizeUrlList(['https://example.com/a.jpg', 'https://example.com/a.jpg']), ['https://example.com/a.jpg']);
});
test('normalizeReferences supports URLs and WeChat mini programs', () => {
  assert.deepEqual(normalizeReferences(['https://v.douyin.com/abc', '#小程序://某商家/abcdef']).map(x => x.kind), ['url', 'copy']);
  assert.equal(normalizeReferences(['weixin://dl/business/?t=abc'])[0].kind, 'uri');
  assert.throws(() => normalizeReferences(['普通文本']));
});
test('coordinates validate legal ranges', () => {
  assert.equal(normalizeCoordinate('30.274084', '纬度', -90, 90), 30.274084);
  assert.equal(normalizeCoordinate('', '纬度', -90, 90), null);
  assert.throws(() => normalizeCoordinate('100', '纬度', -90, 90));
});
test('HTML title extraction prefers Open Graph title', () => {
  assert.equal(extractHtmlTitle('<meta property="og:title" content="景点 · 推荐"><title>Fallback</title>'), '景点 · 推荐');
});
test('platform detection supports common travel reference sources', () => {
  assert.equal(detectPlatform('https://www.xiaohongshu.com/explore/1'), 'xhs');
  assert.equal(detectPlatform('https://v.douyin.com/abc'), 'douyin');
  assert.equal(detectPlatform('https://www.meituan.com/foo'), 'meituan');
  assert.equal(detectPlatform('https://www.dianping.com/shop/1'), 'dianping');
  assert.equal(detectPlatform('https://www.goofish.com/item/1'), 'xianyu');
  assert.equal(detectPlatform('#小程序://某商家/abc'), 'wechat');
  assert.equal(detectPlatform('https://wxaurl.cn/AbCdEf'), 'wechat');
});
test('private address detection blocks local networks', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('192.168.1.1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});
test('Baidu POI payload normalization keeps location data', () => {
  assert.deepEqual(normalizeBaiduPoiPayload({
    result: [{ uid: '1', name: '西湖', city: '杭州市', district: '西湖区', location: { lat: 30.25, lng: 120.15 } }]
  })[0].location, { lat: 30.25, lng: 120.15 });
});


test('image URL list accepts local uploaded image references', () => {
  assert.deepEqual(
    normalizeUrlList(['/uploads/123-file.jpg', 'https://example.com/a.jpg']),
    ['/uploads/123-file.jpg', 'https://example.com/a.jpg']
  );
  assert.throws(() => normalizeUrlList(['/etc/passwd']));
});

test('route mode validates supported Baidu modes', () => {
  assert.equal(normalizeRouteMode('walking'), 'walking');
  assert.equal(normalizeRouteMode(''), 'driving');
  assert.throws(() => normalizeRouteMode('flight'));
});


test('money and currency validation', () => {
  assert.equal(normalizeMoney('123.456', '预算'), '123.46');
  assert.equal(normalizeMoney('', '预算'), '0.00');
  assert.throws(() => normalizeMoney('-1', '预算'));
  assert.equal(normalizeCurrency('jpy'), 'JPY');
  assert.throws(() => normalizeCurrency('BTC'));
});

test('structured itinerary details are sanitized', () => {
  assert.deepEqual(
    normalizeItemDetails({ kind: 'flight', flightNo: 'MU5123', seat: '21A', unexpected: 'drop' }),
    {
      kind: 'flight',
      airline: '',
      flightNo: 'MU5123',
      departureDate: '',
      departureTime: '',
      departureAirport: '',
      departureTerminal: '',
      arrivalDate: '',
      arrivalTime: '',
      arrivalAirport: '',
      arrivalTerminal: '',
      seat: '21A',
      confirmationNo: ''
    }
  );
  assert.throws(() => normalizeItemDetails({ kind: 'spaceship' }));
});


test('Baidu map URI parsing extracts location and readable fields', () => {
  const web = parseBaiduMapLink('https://api.map.baidu.com/marker?location=30.25,120.15&title=%E8%A5%BF%E6%B9%96&content=%E6%9D%AD%E5%B7%9E&coord_type=bd09ll&output=html&src=x');
  assert.deepEqual(web.location, { lat: 30.25, lng: 120.15 });
  assert.equal(web.name, '西湖');
  assert.equal(parseBaiduMapLink('https://api.map.baidu.com/marker?location=30.25,120.15&title=%E8%A5%BF%E6%B9%96&uid=abc123').uid, 'abc123');
  const app = parseBaiduMapLink('baidumap://map/marker?location=39.9,116.4&title=%E5%A4%A9%E5%AE%89%E9%97%A8&content=%E5%8C%97%E4%BA%AC&coord_type=gcj02');
  assert.equal(app.address, '北京');
  assert.equal(app.coordType, 'gcj02');
});

test('Baidu map parser rejects unrelated domains', () => {
  assert.equal(parseBaiduMapLink('https://example.com/?location=30,120'), null);
});


test('reference titles support explicit display titles', () => {
  const refs = normalizeReferences([
    { value: 'https://www.xiaohongshu.com/explore/1', title: '我的攻略标题' },
    '餐厅必点 | https://www.dianping.com/shop/1'
  ]);
  assert.equal(refs[0].customTitle, '我的攻略标题');
  assert.equal(normalizeReferences([{ value: 'https://example.com/a', autoTitle: '自动标题' }])[0].autoTitle, '自动标题');
  assert.equal(refs[1].customTitle, '餐厅必点');
});


test('content title extraction strips platform chrome', () => {
  assert.equal(
    extractContentTitle('<meta property="og:title" content="杭州周末路线 - 小红书">', 'xhs'),
    '杭州周末路线'
  );
  assert.equal(
    extractContentTitle('<script type="application/ld+json">{"headline":"西湖一日游攻略","name":"小红书"}</script>', 'xhs'),
    '西湖一日游攻略'
  );
});


test('Dianping links generate app deep links', () => {
  assert.equal(extractDianpingShopId('https://www.dianping.com/shop/GxJZ4urc9TnKE3kY'), 'GxJZ4urc9TnKE3kY');
  assert.equal(extractDianpingShopId('https://m.dianping.com/shop/H9wHsyrJkbVJWu2g'), 'H9wHsyrJkbVJWu2g');
  assert.equal(
    dianpingAppUrl('https://www.dianping.com/shop/1859284', '上海来福士广场'),
    'dianping://shopinfo?id=1859284'
  );
  assert.equal(
    dianpingAppUrl('https://dpurl.cn/abc', '杭州餐厅'),
    'dianping://searchshoplist?keyword=%E6%9D%AD%E5%B7%9E%E9%A4%90%E5%8E%85'
  );
  assert.equal(
    dianpingAppUrl('https://dpurl.cn/abc', '短链标题', 'https://www.dianping.com/shop/H9wHsyrJkbVJWu2g'),
    'dianping://shopinfo?id=H9wHsyrJkbVJWu2g'
  );
});


test('hotel booking platforms and names are normalized', () => {
  assert.equal(detectBookingPlatform('https://www.hworld.com/hotel/123'), '华住会');
  assert.equal(detectBookingPlatform('https://hotels.ctrip.com/hotels/123.html'), '携程');
  assert.equal(deriveHotelName('杭州西湖全季酒店 - 华住会', '华住会'), '杭州西湖全季酒店');
  assert.equal(deriveHotelName('上海静安酒店 | Booking.com', 'Booking.com'), '上海静安酒店');
});

test('lodging details accept booking URL', () => {
  const details = normalizeItemDetails({
    kind: 'lodging',
    hotelName: '全季酒店',
    bookingPlatform: '华住会',
    bookingUrl: 'https://www.hworld.com/hotel/123'
  });
  assert.equal(details.bookingPlatform, '华住会');
  assert.match(details.bookingUrl, /^https:\/\//);
});


test('order text parser extracts hotel flight and train fields', () => {
  const hotel = analyzeOrderText({
    kind: 'lodging',
    anchorDate: '2026-10-01',
    text: '酒店名称：杭州西湖全季酒店\n入住：10月2日 14:00\n离店：10月3日 12:00\n房型：高级大床房\n订单号：HZ123'
  });
  assert.equal(hotel.details.hotelName, '杭州西湖全季酒店');
  assert.equal(hotel.details.checkInDate, '2026-10-02');
  assert.equal(hotel.details.checkInTime, '14:00');
  assert.equal(hotel.details.confirmationNo, 'HZ123');

  const flight = analyzeOrderText({
    kind: 'flight',
    anchorDate: '2026-10-01',
    text: '航班号：MU5123\n出发机场：杭州萧山国际机场\n出发：10月2日 08:20\n到达机场：北京首都国际机场\n到达：10月2日 10:35\n座位：21A'
  });
  assert.equal(flight.details.flightNo, 'MU5123');
  assert.equal(flight.details.departureTime, '08:20');
  assert.equal(flight.details.arrivalTime, '10:35');

  const train = analyzeOrderText({
    kind: 'train',
    anchorDate: '2026-10-01',
    text: '车次：G1234\n出发站：杭州东\n出发：10月2日 09:00\n到达站：上海虹桥\n到达：10月2日 10:05\n车厢：03车\n座位：12A'
  });
  assert.equal(train.details.trainNo, 'G1234');
  assert.equal(train.details.departureStation, '杭州东');
  assert.equal(train.details.carriage, '03');
});


test('dining candidates preserve order and selection', () => {
  const details = normalizeItemDetails({
    kind: 'dining',
    selectedCandidateId: 'b',
    candidates: [
      { id: 'a', name: 'A店', latitude: 30.1, longitude: 120.1, coordType: 'bd09ll' },
      { id: 'b', name: 'B店', latitude: 30.2, longitude: 120.2, coordType: 'bd09ll' }
    ]
  });
  assert.deepEqual(details.candidates.map(candidate => candidate.id), ['a', 'b']);
  assert.equal(details.selectedCandidateId, 'b');
});
