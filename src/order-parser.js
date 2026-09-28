function clean(value) {
  return String(value || '').replace(/[\u00a0\u3000]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function normalizeText(value) {
  return String(value || '').replace(/\r/g, '\n').split('\n').map(clean).filter(Boolean).join('\n');
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labeled(text, labels, max = 160) {
  const pattern = labels.map(escapeRe).join('|');
  const match = text.match(new RegExp('(?:^|\\n)(?:' + pattern + ')\\s*[:：]?\\s*([^\\n]+)', 'i'));
  return clean(match?.[1] || '').slice(0, max);
}

function dateToken(value, anchorDate = '') {
  const raw = clean(value);
  if (!raw) return '';
  const fallbackYear = /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ? Number(anchorDate.slice(0, 4)) : new Date().getFullYear();
  let match = raw.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/);
  if (!match) {
    const short = raw.match(/(?:^|\D)(\d{1,2})[月\-/.](\d{1,2})日?(?:\D|$)/);
    if (short) match = [short[0], String(fallbackYear), short[1], short[2]];
  }
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function timeToken(value) {
  const raw = clean(value);
  if (!raw) return '';
  const match = raw.match(/(?:^|\D)([01]?\d|2[0-3])(?:[:：点时])([0-5]\d)?/);
  if (!match) return '';
  return String(Number(match[1])).padStart(2, '0') + ':' + String(Number(match[2] || 0)).padStart(2, '0');
}

function confirmation(text) {
  return labeled(text, ['确认号', '预订号', '订单号', '订单编号', 'Booking ID', 'Confirmation'], 160);
}

function detectKind(text, requestedKind = '') {
  if (['lodging', 'flight', 'train'].includes(requestedKind)) return requestedKind;
  if (/航班|航空|登机|机场|航站楼|Flight/i.test(text)) return 'flight';
  if (/高铁|动车|火车|车次|车厢|检票口|候车|(?:^|\D)[GDCZTK]\d{1,5}(?:\D|$)/i.test(text)) return 'train';
  return 'lodging';
}

function routeAroundArrow(text) {
  const flat = text.replace(/\n/g, ' ');
  const match = flat.match(/([^，,;；]{2,40})\s*(?:→|->|—>|到|至)\s*([^，,;；]{2,40})/);
  return match ? [clean(match[1]), clean(match[2])] : ['', ''];
}

function firstDate(text, anchorDate) { return dateToken(text, anchorDate); }
function firstTime(text) { return timeToken(text); }

function parseLodging(text, anchorDate) {
  const lines = text.split('\n');
  let hotelName = labeled(text, ['酒店名称', '酒店', '住宿', 'Hotel'], 160);
  if (!hotelName) hotelName = clean(lines.find(line => /酒店|宾馆|客栈|民宿|全季|汉庭|桔子|亚朵|希尔顿|万豪|凯悦|洲际|假日|诺富特|美居|丽枫/i.test(line)) || '').slice(0, 160);
  const checkInLine = labeled(text, ['入住时间', '入住日期', '入住', 'Check-in'], 120);
  const checkOutLine = labeled(text, ['退房时间', '离店时间', '退房日期', '离店日期', '退房', '离店', 'Check-out'], 120);
  return {
    kind: 'lodging',
    hotelName,
    checkInDate: dateToken(checkInLine, anchorDate) || firstDate(text, anchorDate),
    checkInTime: timeToken(checkInLine),
    checkOutDate: dateToken(checkOutLine, anchorDate),
    checkOutTime: timeToken(checkOutLine),
    roomType: labeled(text, ['房型', '房间', 'Room'], 160),
    phone: labeled(text, ['酒店电话', '联系电话', '电话', 'Tel'], 80),
    bookingPlatform: labeled(text, ['预订平台', '平台'], 80),
    confirmationNo: confirmation(text)
  };
}

function parseFlight(text, anchorDate) {
  const flat = text.replace(/\n/g, ' ');
  const flightNo = labeled(text, ['航班号', '航班', 'Flight'], 40) || clean(flat.match(/(?:^|\s)([A-Z0-9]{2}\s?\d{3,4})(?:\s|$)/i)?.[1] || '').replace(/\s+/g, '').toUpperCase();
  const departureLine = labeled(text, ['出发', '起飞', '出发信息', 'Departure'], 240);
  const arrivalLine = labeled(text, ['到达', '抵达', '到达信息', 'Arrival'], 240);
  const [arrowFrom, arrowTo] = routeAroundArrow(text);
  return {
    kind: 'flight',
    airline: labeled(text, ['航空公司', '航司', '承运人'], 120),
    flightNo,
    departureDate: dateToken(departureLine, anchorDate) || firstDate(text, anchorDate),
    departureTime: timeToken(departureLine) || firstTime(text),
    departureAirport: labeled(text, ['出发机场', '起飞机场'], 160) || arrowFrom,
    departureTerminal: labeled(text, ['出发航站楼', '起飞航站楼', '出发航站'], 80),
    arrivalDate: dateToken(arrivalLine, anchorDate),
    arrivalTime: timeToken(arrivalLine),
    arrivalAirport: labeled(text, ['到达机场', '抵达机场'], 160) || arrowTo,
    arrivalTerminal: labeled(text, ['到达航站楼', '抵达航站楼', '到达航站'], 80),
    seat: labeled(text, ['座位', '座位号', 'Seat'], 40),
    confirmationNo: confirmation(text)
  };
}

function parseTrain(text, anchorDate) {
  const flat = text.replace(/\n/g, ' ');
  const trainNo = labeled(text, ['车次', '列车'], 40) || clean(flat.match(/(?:^|\s)([GDCZTK]\d{1,5})(?:\s|$)/i)?.[1] || '').toUpperCase();
  const departureLine = labeled(text, ['出发', '发车', '乘车', 'Departure'], 240);
  const arrivalLine = labeled(text, ['到达', '抵达', 'Arrival'], 240);
  const [arrowFrom, arrowTo] = routeAroundArrow(text);
  return {
    kind: 'train',
    trainNo,
    departureDate: dateToken(departureLine, anchorDate) || firstDate(text, anchorDate),
    departureTime: timeToken(departureLine) || firstTime(text),
    departureStation: labeled(text, ['出发站', '始发站', '乘车站'], 160) || arrowFrom,
    arrivalDate: dateToken(arrivalLine, anchorDate),
    arrivalTime: timeToken(arrivalLine),
    arrivalStation: labeled(text, ['到达站', '终点站', '抵达站'], 160) || arrowTo,
    carriage: labeled(text, ['车厢', '车厢号'], 40).replace(/车厢$|车$/g, ''),
    seat: labeled(text, ['座位', '座位号'], 40).replace(/座$/g, ''),
    confirmationNo: confirmation(text)
  };
}

export function analyzeOrderText({ text, kind = '', anchorDate = '' } = {}) {
  const normalized = normalizeText(text).slice(0, 20000);
  if (!normalized) throw new Error('订单文本不能为空');
  const resolvedKind = detectKind(normalized, kind);
  const details = resolvedKind === 'flight' ? parseFlight(normalized, anchorDate) : resolvedKind === 'train' ? parseTrain(normalized, anchorDate) : parseLodging(normalized, anchorDate);
  const populated = Object.entries(details).filter(([key, value]) => key !== 'kind' && value).length;
  return { kind: resolvedKind, details, confidence: populated >= 5 ? 'high' : populated >= 2 ? 'medium' : 'low' };
}
