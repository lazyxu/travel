const ITEM_EDITOR_TYPES = {
  attraction: { label: '景点', icon: '📍', category: '景点', kind: '' },
  dining: { label: '餐饮', icon: '🍜', category: '餐饮', kind: 'dining' },
  shopping: { label: '购物', icon: '🛍️', category: '购物', kind: '' },
  lodging: { label: '酒店', icon: '🏨', category: '住宿', kind: 'lodging' },
  flight: { label: '航班', icon: '✈️', category: '交通', kind: 'flight' },
  train: { label: '高铁 / 火车', icon: '🚄', category: '交通', kind: 'train' },
  transport: { label: '交通', icon: '🚆', category: '交通', kind: '' },
  other: { label: '其他', icon: '📝', category: '其他', kind: '' }
};

function itemEditorTypeFor(item = {}) {
  const kind = item.details?.kind || '';
  if (kind === 'lodging') return 'lodging';
  if (kind === 'flight') return 'flight';
  if (kind === 'train') return 'train';
  if (kind === 'dining') return 'dining';
  if (item.category === '景点') return 'attraction';
  if (item.category === '餐饮') return 'dining';
  if (item.category === '购物') return 'shopping';
  if (item.category === '住宿') return 'lodging';
  if (item.category === '交通') return 'transport';
  return 'other';
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function itemEditorSummaryText(value, emptyText = '未添加') {
  const text = String(value || '').trim();
  return text || emptyText;
}

function itemEditorAddonHtml({ id, icon, title, summary, active = false, action = '添加', hidden = false }) {
  return `
    <div class="item-addon-card ${active ? 'active' : ''} ${hidden ? 'hidden' : ''}" data-addon-card="${attr(id)}">
      <div class="item-addon-icon">${icon}</div>
      <div class="item-addon-copy">
        <strong>${escapeHtml(title)}</strong>
        <span data-addon-summary="${attr(id)}">${escapeHtml(summary)}</span>
      </div>
      <button class="button ghost small item-addon-action" type="button" data-open-addon="${attr(id)}">${escapeHtml(action)}</button>
    </div>
  `;
}

function itemEditorDetailsSummary(typeValue, details = {}) {
  if (typeValue === 'lodging') {
    const name = details.hotelName || '';
    const dates = [details.checkInDate, details.checkOutDate].filter(Boolean).join(' → ');
    return [name, dates].filter(Boolean).join(' · ') || '添加入住、退房、房型等';
  }
  if (typeValue === 'flight') {
    const head = [details.airline, details.flightNo].filter(Boolean).join(' ');
    const route = [details.departureAirport, details.arrivalAirport].filter(Boolean).join(' → ');
    return [head, route].filter(Boolean).join(' · ') || '添加航班号、机场、时间等';
  }
  if (typeValue === 'train') {
    const route = [details.departureStation, details.arrivalStation].filter(Boolean).join(' → ');
    return [details.trainNo, route].filter(Boolean).join(' · ') || '添加车次、车站、座位等';
  }
  if (typeValue === 'dining') {
    const candidates = Array.isArray(details.candidates) ? details.candidates : [];
    const selected = candidates.find(candidate => candidate.id === details.selectedCandidateId);
    if (!candidates.length) return '添加多家候选餐厅，到时再选';
    return `${candidates.length} 家候选 · 路线按 ${candidates[0]?.name || '第1家'}${selected ? ` · 已选 ${selected.name}` : ''}`;
  }
  return '';
}

function itemEditorLocationSummary(form) {
  const name = form.querySelector('[name="locationName"]')?.value || '';
  const address = form.querySelector('[name="location"]')?.value || '';
  return [name, address && address !== name ? address : ''].filter(Boolean).join(' · ') || '未添加位置';
}

function itemEditorReferenceSummary(refs = []) {
  if (!refs.length) return '未添加链接';
  const labels = refs.slice(0, 2).map(ref => ref.customTitle || ref.autoTitle || '').filter(Boolean);
  return `${refs.length} 个链接${labels.length ? ` · ${labels.join('、')}` : ''}`;
}

function itemEditorImageSummary(urls = []) {
  return urls.length ? `${urls.length} 张图片` : '未添加图片';
}

function applyAnalyzedLocationToItemForm(mainForm, result) {
  const location = result?.location || result?.lodging || {};
  const set = (name, value) => {
    const input = mainForm.querySelector(`[name="${name}"]`);
    if (input) input.value = value ?? '';
  };
  set('locationName', location.name || location.locationName || location.hotelName || '');
  set('location', location.address || '');
  set('locationUid', location.uid || location.locationUid || '');
  set('latitude', location.latitude ?? '');
  set('longitude', location.longitude ?? '');
  set('coordType', location.coordType || 'bd09ll');

  const title = mainForm.querySelector('[name="title"]');
  if (title && !title.value.trim() && (location.name || location.locationName || location.hotelName)) {
    title.value = location.name || location.locationName || location.hotelName;
  }

  const hasLocation = Boolean(
    mainForm.querySelector('[name="locationName"]')?.value ||
    mainForm.querySelector('[name="location"]')?.value ||
    mainForm.querySelector('[name="latitude"]')?.value
  );
  updateCompactItemAddon(
    mainForm,
    'location',
    itemEditorLocationSummary(mainForm),
    hasLocation,
    hasLocation ? '编辑' : '添加'
  );
}

function applyDiningFirstCandidateToItemForm(mainForm, details) {
  const first = Array.isArray(details?.candidates) ? details.candidates[0] : null;
  if (!first) return;
  applyAnalyzedLocationToItemForm(mainForm, {
    type: 'location',
    location: {
      name: first.name || '',
      address: first.address || '',
      uid: first.locationUid || '',
      latitude: first.latitude ?? null,
      longitude: first.longitude ?? null,
      coordType: first.coordType || 'bd09ll'
    }
  });
}

function itemEditorNoteSummary(note = '') {
  const text = String(note || '').trim().replace(/\s+/g, ' ');
  return text ? (text.length > 46 ? `${text.slice(0, 46)}…` : text) : '未添加备注';
}

function ensureItemSubsheet() {
  let sheet = document.querySelector('#item-subsheet');
  if (sheet) return sheet;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="item-subsheet-backdrop" class="item-subsheet-backdrop hidden"></div>
    <section id="item-subsheet" class="item-subsheet hidden" aria-modal="true" role="dialog">
      <div class="sheet-grabber"></div>
      <div class="sheet-head">
        <h2 id="item-subsheet-title"></h2>
        <button id="item-subsheet-close" class="icon-button" type="button" aria-label="关闭">×</button>
      </div>
      <form id="item-subsheet-form" class="item-subsheet-body"></form>
    </section>
  `);

  sheet = document.querySelector('#item-subsheet');
  document.querySelector('#item-subsheet-close')?.addEventListener('click', () => closeItemSubsheet());
  document.querySelector('#item-subsheet-backdrop')?.addEventListener('click', () => closeItemSubsheet());

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || sheet.classList.contains('hidden')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeItemSubsheet();
  }, true);

  return sheet;
}

function openItemSubsheet(title, body, onSubmit) {
  const sheet = ensureItemSubsheet();
  const form = document.querySelector('#item-subsheet-form');
  document.querySelector('#item-subsheet-title').textContent = title;
  form.innerHTML = body;
  form.dataset.dirty = '0';
  form.oninput = () => { form.dataset.dirty = '1'; };
  form.onchange = () => { form.dataset.dirty = '1'; };
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await onSubmit(new FormData(form), form);
    } catch (error) {
      showToast(error.message, 'error');
      if (submit) submit.disabled = false;
    }
  };
  document.querySelector('#item-subsheet-backdrop').classList.remove('hidden');
  sheet.classList.remove('hidden');
  return form;
}

function closeItemSubsheet(force = false) {
  const sheet = document.querySelector('#item-subsheet');
  const form = document.querySelector('#item-subsheet-form');
  if (!force && form?.dataset.dirty === '1') {
    if (!confirm('有尚未保存的修改，确定放弃吗？')) return false;
  }
  sheet?.classList.add('hidden');
  document.querySelector('#item-subsheet-backdrop')?.classList.add('hidden');
  if (form) {
    form.innerHTML = '';
    form.onsubmit = null;
    form.oninput = null;
    form.onchange = null;
    form.dataset.dirty = '0';
  }
  return true;
}

function itemEditorDetailsFormHtml(kind, details = {}) {
  if (kind === 'lodging') {
    const bookingSummary = details.bookingUrl
      ? [details.bookingPlatform, '已添加预订链接'].filter(Boolean).join(' · ')
      : '可粘贴华住会、携程等预订链接自动分析';
    const moreCount = [details.roomType, details.confirmationNo, details.phone].filter(Boolean).length;
    return `
      <div class="stack">
        <button class="structured-import-button" type="button" data-analyze-order>
          <span class="structured-import-icon">📋</span>
          <span class="structured-import-copy"><strong>从订单自动填充</strong><small>粘贴酒店订单或确认短信</small></span>
          <span class="structured-import-chevron">›</span>
        </button>
        <label class="field"><span>酒店名称</span><input name="hotelName" maxlength="160" value="${attr(details.hotelName || '')}" /></label>
        <div class="booking-analysis-card ${details.bookingUrl ? 'active' : ''}">
          <div class="item-addon-icon">🔗</div>
          <div class="item-addon-copy">
            <strong>预订链接</strong>
            <span data-booking-summary>${escapeHtml(bookingSummary)}</span>
          </div>
          <button class="button ghost small" type="button" data-analyze-booking>${details.bookingUrl ? '编辑' : '添加'}</button>
        </div>
        <input name="bookingPlatform" type="hidden" value="${attr(details.bookingPlatform || '')}" />
        <input name="bookingUrl" type="hidden" value="${attr(details.bookingUrl || '')}" />
        <div class="field-grid">
          <label class="field"><span>入住日期</span><input name="checkInDate" type="date" value="${attr(details.checkInDate || '')}" /></label>
          <label class="field"><span>入住时间</span><input name="checkInTime" type="time" value="${attr(details.checkInTime || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>退房日期</span><input name="checkOutDate" type="date" value="${attr(details.checkOutDate || '')}" /></label>
          <label class="field"><span>退房时间</span><input name="checkOutTime" type="time" value="${attr(details.checkOutTime || '')}" /></label>
        </div>
        <details class="structured-more" data-structured-more data-more-fields="roomType,confirmationNo,phone" data-empty-summary="房型、确认号、电话">
          <summary><span>更多信息</span><small data-more-summary>${moreCount ? `已填写 ${moreCount} 项` : '房型、确认号、电话'}</small></summary>
          <div class="structured-more-body">
            <label class="field"><span>房型</span><input name="roomType" maxlength="160" value="${attr(details.roomType || '')}" /></label>
            <div class="field-grid">
              <label class="field"><span>确认号</span><input name="confirmationNo" maxlength="160" value="${attr(details.confirmationNo || '')}" /></label>
              <label class="field"><span>酒店电话</span><input name="phone" maxlength="160" value="${attr(details.phone || '')}" /></label>
            </div>
          </div>
        </details>
        <p class="form-help">跨天酒店会自动成为住宿期间每天早上的第一站和晚上的最后一站。</p>
        <button class="button primary full" type="submit">完成</button>
      </div>
    `;
  }

  if (kind === 'flight') {
    const moreCount = [details.departureTerminal, details.arrivalTerminal, details.seat, details.confirmationNo].filter(Boolean).length;
    return `
      <div class="stack">
        <button class="structured-import-button" type="button" data-analyze-order>
          <span class="structured-import-icon">📋</span>
          <span class="structured-import-copy"><strong>从订单自动填充</strong><small>粘贴航班订单或确认短信</small></span>
          <span class="structured-import-chevron">›</span>
        </button>
        <div class="field-grid">
          <label class="field"><span>航空公司</span><input name="airline" maxlength="160" value="${attr(details.airline || '')}" /></label>
          <label class="field"><span>航班号</span><input name="flightNo" maxlength="40" value="${attr(details.flightNo || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>出发日期</span><input name="departureDate" type="date" value="${attr(details.departureDate || '')}" /></label>
          <label class="field"><span>出发时间</span><input name="departureTime" type="time" value="${attr(details.departureTime || '')}" /></label>
        </div>
        <label class="field"><span>出发机场</span><input name="departureAirport" maxlength="160" value="${attr(details.departureAirport || '')}" /></label>
        <div class="field-grid">
          <label class="field"><span>到达日期</span><input name="arrivalDate" type="date" value="${attr(details.arrivalDate || '')}" /></label>
          <label class="field"><span>到达时间</span><input name="arrivalTime" type="time" value="${attr(details.arrivalTime || '')}" /></label>
        </div>
        <label class="field"><span>到达机场</span><input name="arrivalAirport" maxlength="160" value="${attr(details.arrivalAirport || '')}" /></label>
        <details class="structured-more" data-structured-more data-more-fields="departureTerminal,arrivalTerminal,seat,confirmationNo" data-empty-summary="航站楼、座位、确认号">
          <summary><span>更多信息</span><small data-more-summary>${moreCount ? `已填写 ${moreCount} 项` : '航站楼、座位、确认号'}</small></summary>
          <div class="structured-more-body">
            <div class="field-grid">
              <label class="field"><span>出发航站楼</span><input name="departureTerminal" maxlength="80" value="${attr(details.departureTerminal || '')}" /></label>
              <label class="field"><span>到达航站楼</span><input name="arrivalTerminal" maxlength="80" value="${attr(details.arrivalTerminal || '')}" /></label>
            </div>
            <div class="field-grid">
              <label class="field"><span>座位</span><input name="seat" maxlength="40" value="${attr(details.seat || '')}" /></label>
              <label class="field"><span>确认号</span><input name="confirmationNo" maxlength="160" value="${attr(details.confirmationNo || '')}" /></label>
            </div>
          </div>
        </details>
        <button class="button primary full" type="submit">完成</button>
      </div>
    `;
  }

  if (kind === 'dining') {
    const candidates = Array.isArray(details.candidates) ? details.candidates : [];
    return `
      <div class="stack dining-candidate-manager" data-dining-manager>
        <input name="diningCandidatesJson" type="hidden" value="${attr(JSON.stringify(candidates))}" />
        <input name="selectedCandidateId" type="hidden" value="${attr(details.selectedCandidateId || '')}" />
        <div class="dining-manager-help">
          <strong>候选餐厅</strong>
          <span>可添加最多 8 家并拖动排序；列表第 1 家始终作为路线定位。点“选这家”会自动移到第 1 位。</span>
        </div>
        <div class="dining-candidate-list" data-dining-list></div>
        <button class="button ghost full" type="button" data-add-dining>＋ 添加候选餐厅链接</button>
        <button class="button primary full" type="submit">完成</button>
      </div>
    `;
  }

  const moreCount = [details.carriage, details.seat, details.confirmationNo].filter(Boolean).length;
  return `
    <div class="stack">
      <button class="structured-import-button" type="button" data-analyze-order>
        <span class="structured-import-icon">📋</span>
        <span class="structured-import-copy"><strong>从订单自动填充</strong><small>粘贴高铁 / 火车订单或确认短信</small></span>
        <span class="structured-import-chevron">›</span>
      </button>
      <label class="field"><span>车次</span><input name="trainNo" maxlength="40" value="${attr(details.trainNo || '')}" /></label>
      <div class="field-grid">
        <label class="field"><span>出发日期</span><input name="departureDate" type="date" value="${attr(details.departureDate || '')}" /></label>
        <label class="field"><span>出发时间</span><input name="departureTime" type="time" value="${attr(details.departureTime || '')}" /></label>
      </div>
      <label class="field"><span>出发站</span><input name="departureStation" maxlength="160" value="${attr(details.departureStation || '')}" /></label>
      <div class="field-grid">
        <label class="field"><span>到达日期</span><input name="arrivalDate" type="date" value="${attr(details.arrivalDate || '')}" /></label>
        <label class="field"><span>到达时间</span><input name="arrivalTime" type="time" value="${attr(details.arrivalTime || '')}" /></label>
      </div>
      <label class="field"><span>到达站</span><input name="arrivalStation" maxlength="160" value="${attr(details.arrivalStation || '')}" /></label>
      <details class="structured-more" data-structured-more data-more-fields="carriage,seat,confirmationNo" data-empty-summary="车厢、座位、确认号">
        <summary><span>更多信息</span><small data-more-summary>${moreCount ? `已填写 ${moreCount} 项` : '车厢、座位、确认号'}</small></summary>
        <div class="structured-more-body">
          <div class="field-grid">
            <label class="field"><span>车厢</span><input name="carriage" maxlength="40" value="${attr(details.carriage || '')}" /></label>
            <label class="field"><span>座位</span><input name="seat" maxlength="40" value="${attr(details.seat || '')}" /></label>
          </div>
          <label class="field"><span>订单 / 确认号</span><input name="confirmationNo" maxlength="160" value="${attr(details.confirmationNo || '')}" /></label>
        </div>
      </details>
      <button class="button primary full" type="submit">完成</button>
    </div>
  `;
}

function itemEditorCollectDetails(kind, formData) {
  const value = name => String(formData.get(name) || '').trim();
  if (kind === 'dining') {
    return {
      kind,
      selectedCandidateId: value('selectedCandidateId'),
      candidates: safeJsonParse(formData.get('diningCandidatesJson'), [])
    };
  }
  if (kind === 'lodging') {
    return {
      kind,
      hotelName: value('hotelName'),
      checkInDate: value('checkInDate'),
      checkInTime: value('checkInTime'),
      checkOutDate: value('checkOutDate'),
      checkOutTime: value('checkOutTime'),
      roomType: value('roomType'),
      phone: value('phone'),
      bookingPlatform: value('bookingPlatform'),
      bookingUrl: value('bookingUrl'),
      confirmationNo: value('confirmationNo')
    };
  }
  if (kind === 'flight') {
    return {
      kind,
      airline: value('airline'),
      flightNo: value('flightNo'),
      departureDate: value('departureDate'),
      departureTime: value('departureTime'),
      departureAirport: value('departureAirport'),
      departureTerminal: value('departureTerminal'),
      arrivalDate: value('arrivalDate'),
      arrivalTime: value('arrivalTime'),
      arrivalAirport: value('arrivalAirport'),
      arrivalTerminal: value('arrivalTerminal'),
      seat: value('seat'),
      confirmationNo: value('confirmationNo')
    };
  }
  return {
    kind: 'train',
    trainNo: value('trainNo'),
    departureDate: value('departureDate'),
    departureTime: value('departureTime'),
    departureStation: value('departureStation'),
    arrivalDate: value('arrivalDate'),
    arrivalTime: value('arrivalTime'),
    arrivalStation: value('arrivalStation'),
    carriage: value('carriage'),
    seat: value('seat'),
    confirmationNo: value('confirmationNo')
  };
}

function diningCandidateFromAnalysis(result) {
  const place = result?.location || result?.place || {};
  const reference = result?.reference || {};
  const value = result?.value || reference.value || reference.url || '';
  const name = place.name || reference.customTitle || reference.autoTitle || reference.title || '候选餐厅';
  return {
    id: 'candidate-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    name,
    address: place.address || '',
    locationUid: place.uid || place.locationUid || '',
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    coordType: place.coordType || 'bd09ll',
    sourceUrl: /^https?:\/\//i.test(value) ? value : '',
    sourceTitle: reference.customTitle || reference.autoTitle || reference.title || '',
    sourcePlatform: reference.platform || (result.type === 'location' ? 'baidu' : detectReferencePlatform(value)),
    appUrl: reference.appUrl || ''
  };
}

function diningCandidateCardHtml(candidate, index, selectedId = '') {
  const selected = candidate.id === selectedId;
  const located = candidate.latitude !== null && candidate.latitude !== undefined
    && candidate.longitude !== null && candidate.longitude !== undefined;
  const platform = candidate.sourcePlatform ? referencePlatformMeta(candidate.sourcePlatform) : null;
  return `
    <div class="dining-candidate-card ${selected ? 'selected' : ''}" data-dining-candidate data-candidate-id="${attr(candidate.id)}" data-index="${index}">
      <button class="dining-drag-handle" type="button" data-dining-drag aria-label="拖动排序">⋮⋮</button>
      <div class="dining-candidate-rank">${index + 1}</div>
      <div class="dining-candidate-copy">
        <strong>${escapeHtml(candidate.name || '候选餐厅')}</strong>
        <span>${escapeHtml(candidate.address || (located ? '已定位' : '未定位'))}</span>
        <small>${index === 0 ? '📍 路线定位' : ''}${index === 0 && platform ? ' · ' : ''}${platform ? platform.label : ''}${selected ? ' · ✓ 已选' : ''}</small>
      </div>
      <div class="dining-candidate-actions">
        <button class="button ghost small" type="button" data-select-dining>${selected ? '已选择' : '选这家'}</button>
        <button class="button ghost small" type="button" data-edit-dining>编辑</button>
        <button class="reference-remove" type="button" data-remove-dining aria-label="删除候选餐厅">×</button>
      </div>
    </div>
  `;
}

function bindDiningCandidateManager(root) {
  const manager = root.querySelector('[data-dining-manager]');
  if (!manager) return;
  const list = manager.querySelector('[data-dining-list]');
  const candidatesInput = manager.querySelector('[name="diningCandidatesJson"]');
  const selectedInput = manager.querySelector('[name="selectedCandidateId"]');
  let candidates = safeJsonParse(candidatesInput.value, []);

  const render = () => {
    candidatesInput.value = JSON.stringify(candidates);
    const selectedId = selectedInput.value || '';
    list.innerHTML = candidates.length
      ? candidates.map((candidate, index) => diningCandidateCardHtml(candidate, index, selectedId)).join('')
      : '<div class="reference-editor-empty">还没有候选餐厅</div>';
  };

  const applyCandidate = (result, existingId = '') => {
    const next = diningCandidateFromAnalysis(result);
    if (existingId) {
      const index = candidates.findIndex(candidate => candidate.id === existingId);
      if (index >= 0) next.id = existingId, candidates[index] = next;
    } else {
      if (candidates.length >= 8) return showToast('最多 8 家候选餐厅', 'error');
      candidates.push(next);
    }
    root.dataset.dirty = '1';
    render();
  };

  manager.addEventListener('click', event => {
    if (event.target.closest('[data-add-dining]')) {
      openLinkAnalyzer({
        context: 'dining',
        title: '添加候选餐厅',
        onApply: result => applyCandidate(result)
      });
      return;
    }

    const card = event.target.closest('[data-dining-candidate]');
    if (!card) return;
    const id = card.dataset.candidateId;
    const index = candidates.findIndex(candidate => candidate.id === id);
    if (index < 0) return;

    if (event.target.closest('[data-remove-dining]')) {
      candidates.splice(index, 1);
      if (selectedInput.value === id) selectedInput.value = '';
      root.dataset.dirty = '1';
      render();
      return;
    }

    if (event.target.closest('[data-select-dining]')) {
      const [chosen] = candidates.splice(index, 1);
      candidates.unshift(chosen);
      selectedInput.value = chosen.id;
      root.dataset.dirty = '1';
      render();
      return;
    }

    if (event.target.closest('[data-edit-dining]')) {
      const current = candidates[index];
      openLinkAnalyzer({
        context: 'dining',
        initial: {
          value: current.sourceUrl || '',
          customTitle: current.sourceTitle || current.name || '',
          autoTitle: current.sourceTitle || '',
          platform: current.sourcePlatform || '',
          appUrl: current.appUrl || ''
        },
        title: '编辑候选餐厅',
        onApply: result => applyCandidate(result, id)
      });
    }
  });

  manager.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-dining-drag]');
    if (!handle) return;
    const card = handle.closest('[data-dining-candidate]');
    const sourceIndex = Number(card?.dataset.index);
    if (!Number.isInteger(sourceIndex)) return;
    event.preventDefault();
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
    card.classList.add('dining-candidate-dragging');
    let targetIndex = sourceIndex;

    const move = moveEvent => {
      if (moveEvent.pointerId !== event.pointerId) return;
      moveEvent.preventDefault();
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.('[data-dining-candidate]');
      if (!target || !manager.contains(target)) return;
      const index = Number(target.dataset.index);
      if (!Number.isInteger(index)) return;
      targetIndex = index;
      list.querySelectorAll('[data-dining-candidate]').forEach(node => node.classList.toggle('dining-candidate-drop', Number(node.dataset.index) === index));
    };

    const finish = upEvent => {
      if (upEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      try { handle.releasePointerCapture?.(event.pointerId); } catch {}
      if (upEvent.type !== 'pointercancel' && sourceIndex !== targetIndex) {
        const [moved] = candidates.splice(sourceIndex, 1);
        candidates.splice(targetIndex, 0, moved);
        root.dataset.dirty = '1';
      }
      render();
    };

    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  });

  render();
}

function bindReferenceEditorWithin(root, mainForm) {
  const editor = root.querySelector('[data-reference-editor]');
  if (!editor) return;
  const list = editor.querySelector('[data-reference-list]');

  const rows = () => [...editor.querySelectorAll('[data-reference-row]')];

  const rowValue = row => ({
    value: row.querySelector('[name="refValue"]')?.value || '',
    customTitle: row.querySelector('[name="refTitle"]')?.value || '',
    autoTitle: row.querySelector('[name="refAutoTitle"]')?.value || '',
    platform: row.querySelector('[name="refPlatform"]')?.value || '',
    appUrl: row.querySelector('[name="refAppUrl"]')?.value || ''
  });

  const syncEmpty = () => {
    const empty = list.querySelector('[data-reference-empty]');
    if (!rows().length && !empty) {
      list.innerHTML = '<div class="reference-editor-empty" data-reference-empty>还没有链接</div>';
    } else if (rows().length && empty) {
      empty.remove();
    }
  };

  const applyReference = (result, existingRow = null) => {
    if (result.type === 'location') {
      applyAnalyzedLocationToItemForm(mainForm, result);
      if (existingRow) existingRow.remove();
      root.dataset.dirty = '1';
      syncEmpty();
      showToast('已识别为位置，并添加到“位置”');
      return;
    }

    const ref = result.reference || {
      value: result.value || '',
      customTitle: '',
      autoTitle: ''
    };
    const html = referenceEditorRowHtml(ref, rows().length);
    if (existingRow) existingRow.outerHTML = html;
    else {
      list.querySelector('[data-reference-empty]')?.remove();
      list.insertAdjacentHTML('beforeend', html);
    }
    root.dataset.dirty = '1';
    syncEmpty();
  };

  editor.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-reference]');
    if (remove) {
      remove.closest('[data-reference-row]')?.remove();
      root.dataset.dirty = '1';
      syncEmpty();
      return;
    }

    const edit = event.target.closest('[data-edit-reference]');
    if (edit) {
      const row = edit.closest('[data-reference-row]');
      openLinkAnalyzer({
        context: 'reference',
        initial: rowValue(row),
        title: '分析链接',
        onApply: result => applyReference(result, row)
      });
      return;
    }

    if (event.target.closest('[data-add-reference]')) {
      if (rows().length >= 12) return showToast('最多 12 个链接', 'error');
      openLinkAnalyzer({
        context: 'reference',
        title: '添加链接',
        onApply: result => applyReference(result)
      });
    }
  });

  syncEmpty();
}
function bindImageEditorWithin(root) {
  const editor = root.querySelector('[data-image-editor]');
  if (!editor) return;
  const hidden = editor.querySelector('[name="imageUrls"]');
  const grid = editor.querySelector('[data-image-editor-grid]');
  const filesInput = editor.querySelector('[name="imageFiles"]');
  const remoteInput = editor.querySelector('[name="imageRemoteUrl"]');
  const status = editor.querySelector('[data-image-upload-status]');
  let images = extractImageRefs(hidden.value, 12);

  const render = () => {
    hidden.value = images.join('\n');
    grid.innerHTML = images.length ? images.map(imageEditorCardHtml).join('') : '<div class="image-preview-empty">暂无图片</div>';
    if (status) status.textContent = `${images.length} / 12 张；拖动缩略图可排序`;
  };

  editor.addEventListener('click', event => {
    const remove = event.target.closest('[data-image-remove]');
    if (remove) {
      const index = Number(remove.closest('[data-image-index]')?.dataset.imageIndex);
      if (Number.isInteger(index)) images.splice(index, 1);
      root.dataset.dirty = '1';
      render();
      return;
    }
    if (event.target.closest('[data-add-image-url]')) {
      const raw = remoteInput?.value?.trim();
      if (!raw) return;
      const [url] = extractImageRefs(raw, 1);
      if (!url) return showToast('请输入有效的图片地址', 'error');
      if (!images.includes(url)) images.push(url);
      images = images.slice(0, 12);
      root.dataset.dirty = '1';
      remoteInput.value = '';
      render();
    }
  });

  editor.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-image-drag]');
    if (!handle) return;
    const sourceIndex = Number(handle.closest('[data-image-index]')?.dataset.imageIndex);
    if (!Number.isInteger(sourceIndex)) return;
    event.preventDefault();
    let targetIndex = sourceIndex;

    const move = moveEvent => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.('[data-image-index]');
      if (!target || !editor.contains(target)) return;
      targetIndex = Number(target.dataset.imageIndex);
      grid.querySelectorAll('.image-editor-card').forEach(card => {
        card.classList.toggle('image-editor-drop', Number(card.dataset.imageIndex) === targetIndex);
      });
    };
    const finish = upEvent => {
      if (upEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      if (upEvent.type !== 'pointercancel' && targetIndex !== sourceIndex) {
        const [moved] = images.splice(sourceIndex, 1);
        images.splice(targetIndex, 0, moved);
        root.dataset.dirty = '1';
      }
      render();
    };
    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  });

  filesInput?.addEventListener('change', async () => {
    const files = [...(filesInput.files || [])];
    if (images.length + files.length > 12) {
      filesInput.value = '';
      return showToast('每条行程最多 12 张图片', 'error');
    }
    filesInput.disabled = true;
    try {
      for (let index = 0; index < files.length; index += 1) {
        if (status) status.textContent = `正在处理 ${index + 1}/${files.length}…`;
        const blob = await compressImageFile(files[index]);
        const url = await uploadImageBlob(blob);
        if (!images.includes(url)) images.push(url);
        root.dataset.dirty = '1';
        render();
      }
    } finally {
      filesInput.disabled = false;
      filesInput.value = '';
      render();
    }
  });
}

function expenseCategoryForItem(item) {
  if (item?.details?.kind === 'lodging') return '住宿';
  if (item?.category === '景点') return '门票';
  if (['交通','住宿','餐饮','购物'].includes(item?.category)) return item.category;
  return '其他';
}

function itemExpenseSummary(item, expenses = itemExpenses(item)) {
  if (!expenses.length) return '未添加费用';
  const currency = state.current?.trip?.currency || 'CNY';
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const paidCount = expenses.filter(expense => expense.paid).length;
  return `${expenses.length} 笔 · ${formatMoney(total, currency)}${paidCount ? ` · 已付 ${paidCount}` : ''}`;
}

function existingExpenseRowHtml(expense = {}, index = 0, item = {}) {
  const category = expense.category || expenseCategoryForItem(item);
  return `
    <div class="compact-expense-row" data-expense-row data-expense-id="${attr(expense.id || '')}">
      <div class="compact-expense-head">
        <strong>费用 ${index + 1}</strong>
        <button class="reference-remove" type="button" data-remove-expense aria-label="删除费用">×</button>
      </div>
      <label class="field"><span>名称</span><input name="expenseTitle" maxlength="160" value="${attr(expense.title || item.title || '')}" /></label>
      <div class="field-grid">
        <label class="field"><span>金额</span><input name="expenseAmount" type="number" min="0" step="0.01" value="${attr(expense.amount ?? '')}" /></label>
        <label class="field"><span>分类</span>
          <select name="expenseCategory">
            ${['交通','住宿','餐饮','门票','购物','其他'].map(value => `<option value="${value}" ${category === value ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="check-field"><input name="expensePaid" type="checkbox" ${expense.paid ? 'checked' : ''} /><span>已支付</span></label>
      <label class="field"><span>备注</span><textarea name="expenseNotes" maxlength="2000">${escapeHtml(expense.notes || '')}</textarea></label>
    </div>
  `;
}

function existingExpenseManagerHtml(item, expenses = []) {
  return `
    <div class="stack compact-expense-manager" data-expense-manager>
      <div class="compact-expense-list" data-expense-list>
        ${expenses.length ? expenses.map((expense, index) => existingExpenseRowHtml(expense, index, item)).join('') : '<div class="reference-editor-empty" data-expense-empty>还没有费用</div>'}
      </div>
      <button class="button ghost small" type="button" data-add-expense-row>＋ 添加一笔</button>
      <button class="button primary full" type="submit">保存费用</button>
    </div>
  `;
}

function bindExistingExpenseManager(root, item) {
  const list = root.querySelector('[data-expense-list]');
  const rows = () => [...root.querySelectorAll('[data-expense-row]')];

  const sync = () => {
    const empty = list.querySelector('[data-expense-empty]');
    if (!rows().length && !empty) list.innerHTML = '<div class="reference-editor-empty" data-expense-empty>还没有费用</div>';
    if (rows().length && empty) empty.remove();
    rows().forEach((row, index) => {
      const title = row.querySelector('.compact-expense-head strong');
      if (title) title.textContent = `费用 ${index + 1}`;
    });
  };

  root.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-expense]');
    if (remove) {
      remove.closest('[data-expense-row]')?.remove();
      root.dataset.dirty = '1';
      sync();
      return;
    }
    if (event.target.closest('[data-add-expense-row]')) {
      list.querySelector('[data-expense-empty]')?.remove();
      list.insertAdjacentHTML('beforeend', existingExpenseRowHtml({}, rows().length, item));
      root.dataset.dirty = '1';
      sync();
    }
  });
  sync();
}

async function saveExistingItemExpenses(root, item) {
  const original = itemExpenses(item);
  const originalIds = new Set(original.map(expense => String(expense.id)));
  const keptIds = new Set();
  const day = state.current.days.find(value => value.items.some(entry => String(entry.id) === String(item.id)));
  const expenseDate = day?.day_date || '';

  for (const row of root.querySelectorAll('[data-expense-row]')) {
    const id = String(row.dataset.expenseId || '');
    const amount = Number(row.querySelector('[name="expenseAmount"]')?.value || 0);
    const title = String(row.querySelector('[name="expenseTitle"]')?.value || '').trim() || item.title;
    if (!(amount > 0)) continue;

    const payload = {
      title,
      amount,
      category: row.querySelector('[name="expenseCategory"]')?.value || expenseCategoryForItem(item),
      expenseDate,
      itemId: item.id,
      paid: Boolean(row.querySelector('[name="expensePaid"]')?.checked),
      notes: row.querySelector('[name="expenseNotes"]')?.value || ''
    };

    if (id) {
      keptIds.add(id);
      await api(`/api/expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api(`/api/trips/${state.current.trip.id}/expenses`, { method: 'POST', body: JSON.stringify(payload) });
    }
  }

  for (const id of originalIds) {
    if (!keptIds.has(id)) await api(`/api/expenses/${id}`, { method: 'DELETE' });
  }

  state.current = await api(`/api/trips/${state.current.trip.id}`);
  return itemExpenses(item);
}

function compactItemFormHtml(item = {}, currentDayId = state.currentDayId) {
  const itemType = itemEditorTypeFor(item);
  const typeMeta = ITEM_EDITOR_TYPES[itemType];
  const selectedDayId = String(item.day_id || currentDayId || '');
  const references = itemReferenceEntries(item);
  const images = item.image_urls || [];
  const notes = item.notes || '';
  const details = item.details || {};
  const hasLocation = Boolean(item.location_name || item.location || hasItemCoordinates(item));
  const existingExpenses = item.id ? itemExpenses(item) : [];

  return `
    <div class="stack item-editor-main">
      <label class="field"><span>行程标题 *</span><input name="title" required maxlength="160" value="${attr(item.title || '')}" placeholder="例如：清水寺" /></label>

      <div class="field-grid item-editor-primary-grid">
        <label class="field"><span>所在日期</span>
          <select name="targetDayId">
            ${state.current.days.map(target => `<option value="${target.id}" ${String(target.id) === selectedDayId ? 'selected' : ''}>D${dayNumber(target.day_date, state.current.trip.start_date)} · ${formatDate(target.day_date)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>行程类型</span>
          <select name="itemType">
            ${Object.entries(ITEM_EDITOR_TYPES).map(([value, meta]) => `<option value="${value}" ${value === itemType ? 'selected' : ''}>${meta.icon} ${meta.label}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="field-grid">
        <label class="field"><span>开始时间</span><input name="startTime" type="time" value="${attr(item.start_time || item.item_time || '')}" /></label>
        <label class="field"><span>结束时间</span><input name="endTime" type="time" value="${attr(item.end_time || '')}" /></label>
      </div>

      <input name="detailsJson" type="hidden" value="${attr(JSON.stringify(details))}" />
      <input name="locationName" type="hidden" value="${attr(item.location_name || '')}" />
      <input name="locationUid" type="hidden" value="${attr(item.location_uid || '')}" />
      <input name="location" type="hidden" value="${attr(item.location || '')}" />
      <input name="latitude" type="hidden" value="${attr(item.latitude ?? '')}" />
      <input name="longitude" type="hidden" value="${attr(item.longitude ?? '')}" />
      <input name="coordType" type="hidden" value="${attr(item.coord_type || 'bd09ll')}" />
      <textarea name="notes" hidden>${escapeHtml(notes)}</textarea>
      <input name="referencesJson" type="hidden" value="${attr(JSON.stringify(references))}" />
      <input name="imageUrls" type="hidden" value="${attr(images.join('\n'))}" />
      <input name="initialExpenseJson" type="hidden" value="" />

      <div class="item-addon-list">
        ${itemEditorAddonHtml({
          id: 'details',
          icon: typeMeta.icon,
          title: `${typeMeta.label}信息`,
          summary: itemEditorDetailsSummary(itemType, details),
          active: Boolean(details?.kind),
          action: details?.kind ? '编辑' : '添加',
          hidden: !typeMeta.kind
        })}
        ${itemEditorAddonHtml({
          id: 'location',
          icon: '📍',
          title: '位置',
          summary: hasLocation ? [item.location_name, item.location].filter(Boolean).join(' · ') : '未添加位置',
          active: hasLocation,
          action: hasLocation ? '编辑' : '添加'
        })}
        ${itemEditorAddonHtml({
          id: 'notes',
          icon: '📝',
          title: '备注',
          summary: itemEditorNoteSummary(notes),
          active: Boolean(notes.trim()),
          action: notes.trim() ? '编辑' : '添加'
        })}
        ${itemEditorAddonHtml({
          id: 'references',
          icon: '🔗',
          title: '链接',
          summary: itemEditorReferenceSummary(references),
          active: references.length > 0,
          action: references.length ? '管理' : '添加'
        })}
        ${itemEditorAddonHtml({
          id: 'images',
          icon: '🖼️',
          title: '图片',
          summary: itemEditorImageSummary(images),
          active: images.length > 0,
          action: images.length ? '管理' : '添加'
        })}
        ${itemEditorAddonHtml({
          id: 'expense',
          icon: '¥',
          title: '费用',
          summary: item.id ? itemExpenseSummary(item, existingExpenses) : '未添加费用',
          active: item.id ? existingExpenses.length > 0 : false,
          action: item.id ? (existingExpenses.length ? '管理' : '添加') : '添加',
          hidden: false
        })}
      </div>

      <div class="form-actions">
        ${item.id ? '<button id="delete-item" class="button danger" type="button">删除</button>' : ''}
        <button class="button primary" type="submit">保存</button>
      </div>
    </div>
  `;
}

function updateCompactItemAddon(mainForm, id, summary, active, action) {
  const card = mainForm.querySelector(`[data-addon-card="${id}"]`);
  if (!card) return;
  card.classList.toggle('active', Boolean(active));
  const summaryNode = card.querySelector(`[data-addon-summary="${id}"]`);
  if (summaryNode) summaryNode.textContent = summary;
  const button = card.querySelector(`[data-open-addon="${id}"]`);
  if (button && action) button.textContent = action;
}

function refreshStructuredMoreSummary(root) {
  root.querySelectorAll('[data-structured-more]').forEach(group => {
    const fields = String(group.dataset.moreFields || '').split(',').map(value => value.trim()).filter(Boolean);
    const count = fields.filter(name => String(root.querySelector(`[name="${name}"]`)?.value || '').trim()).length;
    const summary = group.querySelector('[data-more-summary]');
    if (summary) summary.textContent = count ? `已填写 ${count} 项` : (group.dataset.emptySummary || '更多信息');
  });
}

function bindCompactItemEditor(mainForm, item) {
  const typeSelect = mainForm.querySelector('[name="itemType"]');
  const detailsInput = mainForm.querySelector('[name="detailsJson"]');

  const syncTypeCard = () => {
    const meta = ITEM_EDITOR_TYPES[typeSelect.value] || ITEM_EDITOR_TYPES.other;
    const card = mainForm.querySelector('[data-addon-card="details"]');
    const details = safeJsonParse(detailsInput.value, {});
    if (!meta.kind) {
      card?.classList.add('hidden');
      return;
    }
    card?.classList.remove('hidden');
    if (details.kind !== meta.kind) {
      detailsInput.value = JSON.stringify({ kind: meta.kind });
    }
    const current = safeJsonParse(detailsInput.value, { kind: meta.kind });
    card.querySelector('.item-addon-icon').textContent = meta.icon;
    card.querySelector('.item-addon-copy strong').textContent = `${meta.label}信息`;
    updateCompactItemAddon(mainForm, 'details', itemEditorDetailsSummary(typeSelect.value, current), Object.keys(current).some(key => key !== 'kind' && current[key]), Object.keys(current).some(key => key !== 'kind' && current[key]) ? '编辑' : '添加');
  };

  typeSelect.addEventListener('change', syncTypeCard);
  syncTypeCard();

  mainForm.querySelectorAll('[data-addon-card]').forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('button, a, input, select, textarea')) return;
      card.querySelector('[data-open-addon]')?.click();
    });
  });

  mainForm.querySelectorAll('[data-open-addon]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.openAddon;

      if (id === 'details') {
        const meta = ITEM_EDITOR_TYPES[typeSelect.value] || ITEM_EDITOR_TYPES.other;
        if (!meta.kind) return;
        const current = safeJsonParse(detailsInput.value, { kind: meta.kind });
        const detailSubForm = openItemSubsheet(`${meta.icon} ${meta.label}信息`, itemEditorDetailsFormHtml(meta.kind, current), async data => {
          const next = itemEditorCollectDetails(meta.kind, data);
          detailsInput.value = JSON.stringify(next);
          if (meta.kind === 'dining') applyDiningFirstCandidateToItemForm(mainForm, next);

          const titleInput = mainForm.querySelector('[name="title"]');
          const startInput = mainForm.querySelector('[name="startTime"]');
          const endInput = mainForm.querySelector('[name="endTime"]');

          if (titleInput && !titleInput.value.trim()) {
            if (meta.kind === 'lodging' && next.hotelName) titleInput.value = next.hotelName;
            if (meta.kind === 'flight') {
              const title = [next.airline, next.flightNo].filter(Boolean).join(' ');
              if (title) titleInput.value = title;
            }
            if (meta.kind === 'train' && next.trainNo) titleInput.value = next.trainNo;
          }

          if ((meta.kind === 'flight' || meta.kind === 'train')) {
            if (startInput && !startInput.value && next.departureTime) startInput.value = next.departureTime;
            if (endInput && !endInput.value && next.arrivalTime) endInput.value = next.arrivalTime;
          }

          updateCompactItemAddon(mainForm, 'details', itemEditorDetailsSummary(typeSelect.value, next), true, '编辑');
          closeItemSubsheet(true);
        });

        refreshStructuredMoreSummary(detailSubForm);
        detailSubForm.addEventListener('input', () => refreshStructuredMoreSummary(detailSubForm));

        if (meta.kind === 'dining') {
          bindDiningCandidateManager(detailSubForm);
        }

        if (['lodging', 'flight', 'train'].includes(meta.kind)) {
          detailSubForm.querySelector('[data-analyze-order]')?.addEventListener('click', () => {
            const selectedDayId = mainForm.querySelector('[name="targetDayId"]')?.value || '';
            const selectedDay = state.current.days.find(day => String(day.id) === String(selectedDayId));
            openOrderAnalyzer({
              kind: meta.kind,
              anchorDate: String(selectedDay?.day_date || state.current.trip.start_date || '').slice(0, 10),
              title: meta.kind === 'lodging' ? '解析酒店订单 / 短信' : meta.kind === 'flight' ? '解析航班订单 / 短信' : '解析高铁 / 火车订单',
              onApply: details => {
                for (const [key, value] of Object.entries(details || {})) {
                  if (key === 'kind') continue;
                  const input = detailSubForm.querySelector(`[name="${key}"]`);
                  if (input && value !== undefined && value !== null && String(value) !== '') input.value = value;
                }
                refreshStructuredMoreSummary(detailSubForm);
                detailSubForm.dataset.dirty = '1';
              }
            });
          });
        }

        if (meta.kind === 'lodging') {
          detailSubForm.querySelector('[data-analyze-booking]')?.addEventListener('click', () => {
            openLinkAnalyzer({
              context: 'lodging',
              title: detailSubForm.querySelector('[name="bookingUrl"]')?.value ? '编辑预订链接' : '添加预订链接',
              initial: {
                bookingUrl: detailSubForm.querySelector('[name="bookingUrl"]')?.value || '',
                bookingPlatform: detailSubForm.querySelector('[name="bookingPlatform"]')?.value || '',
                hotelName: detailSubForm.querySelector('[name="hotelName"]')?.value || ''
              },
              onApply: result => {
                if (result.type === 'location') {
                  applyAnalyzedLocationToItemForm(mainForm, result);
                  const hotelName = result.location?.name || '';
                  if (hotelName && !detailSubForm.querySelector('[name="hotelName"]').value.trim()) {
                    detailSubForm.querySelector('[name="hotelName"]').value = hotelName;
                  }
                  detailSubForm.dataset.dirty = '1';
                  return;
                }
                if (result.type !== 'booking') throw new Error('这个链接没有识别为酒店预订链接');
                const lodging = result.lodging || {};
                detailSubForm.querySelector('[name="bookingUrl"]').value = lodging.bookingUrl || result.value || '';
                detailSubForm.querySelector('[name="bookingPlatform"]').value = lodging.bookingPlatform || '';
                if (lodging.hotelName) detailSubForm.querySelector('[name="hotelName"]').value = lodging.hotelName;
                const summary = detailSubForm.querySelector('[data-booking-summary]');
                if (summary) summary.textContent = [lodging.bookingPlatform, lodging.hotelName].filter(Boolean).join(' · ') || '已添加预订链接';
                if (lodging.locationName || lodging.address || lodging.latitude !== null) {
                  applyAnalyzedLocationToItemForm(mainForm, { type: 'location', location: {
                    name: lodging.locationName || lodging.hotelName || '',
                    address: lodging.address || '',
                    uid: lodging.locationUid || '',
                    latitude: lodging.latitude ?? null,
                    longitude: lodging.longitude ?? null,
                    coordType: lodging.coordType || 'bd09ll'
                  }});
                }
                detailSubForm.dataset.dirty = '1';
              }
            });
          });
        }
        return;
      }

      if (id === 'location') {
        const current = {
          type: 'location',
          location: {
            name: mainForm.querySelector('[name="locationName"]')?.value || '',
            address: mainForm.querySelector('[name="location"]')?.value || '',
            uid: mainForm.querySelector('[name="locationUid"]')?.value || '',
            latitude: mainForm.querySelector('[name="latitude"]')?.value || null,
            longitude: mainForm.querySelector('[name="longitude"]')?.value || null,
            coordType: mainForm.querySelector('[name="coordType"]')?.value || 'bd09ll'
          }
        };
        openLinkAnalyzer({
          context: 'location',
          initial: current,
          title: current.location.name || current.location.address ? '编辑位置' : '添加位置',
          onApply: result => {
            if (result.type !== 'location') throw new Error('这个链接没有识别为位置');
            applyAnalyzedLocationToItemForm(mainForm, result);
          }
        });
        return;
      }

      if (id === 'notes') {
        const current = mainForm.querySelector('[name="notes"]').value || '';
        const subForm = openItemSubsheet('📝 备注', `
          <div class="stack">
            <label class="field"><span>备注</span><textarea name="notes" maxlength="5000" placeholder="预约信息、交通提示、必点菜等">${escapeHtml(current)}</textarea></label>
            <div class="form-actions">
              <button class="button danger" type="button" data-clear-note>清除</button>
              <button class="button primary" type="submit">完成</button>
            </div>
          </div>
        `, async data => {
          const value = String(data.get('notes') || '');
          mainForm.querySelector('[name="notes"]').value = value;
          updateCompactItemAddon(mainForm, 'notes', itemEditorNoteSummary(value), Boolean(value.trim()), value.trim() ? '编辑' : '添加');
          closeItemSubsheet(true);
        });
        subForm.querySelector('[data-clear-note]')?.addEventListener('click', () => {
          subForm.querySelector('[name="notes"]').value = '';
        });
        return;
      }

      if (id === 'references') {
        const current = safeJsonParse(mainForm.querySelector('[name="referencesJson"]').value, []);
        const subForm = openItemSubsheet('🔗 链接', `
          <div class="stack">
            ${referenceEditorHtml(current)}
            <button class="button primary full" type="submit">完成</button>
          </div>
        `, async data => {
          const refs = collectReferenceEntries(data);
          mainForm.querySelector('[name="referencesJson"]').value = JSON.stringify(refs);
          updateCompactItemAddon(mainForm, 'references', itemEditorReferenceSummary(refs), refs.length > 0, refs.length ? '管理' : '添加');
          closeItemSubsheet(true);
        });
        bindReferenceEditorWithin(subForm, mainForm);
        return;
      }

      if (id === 'images') {
        const current = extractImageRefs(mainForm.querySelector('[name="imageUrls"]').value, 12);
        const subForm = openItemSubsheet('🖼️ 图片', `
          <div class="stack">
            ${imageEditorHtml(current)}
            <button class="button primary full" type="submit">完成</button>
          </div>
        `, async data => {
          const images = extractImageRefs(data.get('imageUrls'), 12);
          mainForm.querySelector('[name="imageUrls"]').value = images.join('\n');
          updateCompactItemAddon(mainForm, 'images', itemEditorImageSummary(images), images.length > 0, images.length ? '管理' : '添加');
          closeItemSubsheet(true);
        });
        bindImageEditorWithin(subForm);
        return;
      }

      if (id === 'expense') {
        if (item.id) {
          const currentExpenses = itemExpenses(item);
          const subForm = openItemSubsheet('¥ 费用', existingExpenseManagerHtml(item, currentExpenses), async (_data, form) => {
            const saved = await saveExistingItemExpenses(form, item);
            updateCompactItemAddon(
              mainForm,
              'expense',
              itemExpenseSummary(item, saved),
              saved.length > 0,
              saved.length ? '管理' : '添加'
            );
            closeItemSubsheet(true);
          });
          bindExistingExpenseManager(subForm, item);
          return;
        }

        const current = safeJsonParse(mainForm.querySelector('[name="initialExpenseJson"]').value, {});
        const currency = state.current?.trip?.currency || 'CNY';
        const subForm = openItemSubsheet('¥ 费用', `
          <div class="stack">
            <div class="field-grid">
              <label class="field"><span>金额</span><input name="amount" type="number" min="0" step="0.01" value="${attr(current.amount || '')}" placeholder="0.00" /></label>
              <label class="field"><span>币种</span><input value="${attr(currency)}" disabled /></label>
            </div>
            <label class="field"><span>分类</span>
              <select name="category">
                ${['交通','住宿','餐饮','门票','购物','其他'].map(category => `<option value="${category}" ${current.category === category ? 'selected' : ''}>${category}</option>`).join('')}
              </select>
            </label>
            <label class="check-field"><input name="paid" type="checkbox" ${current.paid ? 'checked' : ''} /><span>已支付</span></label>
            <label class="field"><span>备注</span><textarea name="expenseNotes" maxlength="2000">${escapeHtml(current.notes || '')}</textarea></label>
            <div class="form-actions">
              <button class="button danger" type="button" data-clear-expense>清除</button>
              <button class="button primary" type="submit">完成</button>
            </div>
          </div>
        `, async data => {
          const amount = Number(data.get('amount') || 0);
          const next = amount > 0 ? {
            amount,
            category: String(data.get('category') || '其他'),
            paid: data.get('paid') === 'on',
            notes: String(data.get('expenseNotes') || '')
          } : {};
          mainForm.querySelector('[name="initialExpenseJson"]').value = JSON.stringify(next);
          const summary = amount > 0 ? `${formatMoney(amount, currency)} · ${next.category}${next.paid ? ' · 已支付' : ''}` : '未添加费用';
          updateCompactItemAddon(mainForm, 'expense', summary, amount > 0, amount > 0 ? '编辑' : '添加');
          closeItemSubsheet(true);
        });
        subForm.querySelector('[data-clear-expense]')?.addEventListener('click', () => {
          subForm.querySelector('[name="amount"]').value = '';
          subForm.querySelector('[name="expenseNotes"]').value = '';
          const paid = subForm.querySelector('[name="paid"]');
          if (paid) paid.checked = false;
        });
      }
    });
  });
}

function openDiningQuickSelect(item) {
  const candidates = Array.isArray(item?.details?.candidates) ? item.details.candidates : [];
  if (!candidates.length) return showToast('还没有候选餐厅', 'error');

  const body = `
    <div class="stack">
      <div class="dining-manager-help">
        <strong>选择最终餐厅</strong>
        <span>选中后会自动移到第 1 位；第 1 家始终作为路线定位。</span>
      </div>
      <div class="dining-quick-list">
        ${candidates.map((candidate, index) => `
          <button class="dining-quick-option ${candidate.id === item.details.selectedCandidateId ? 'selected' : ''}" type="button" data-quick-dining="${attr(candidate.id)}">
            <span class="dining-candidate-rank">${index + 1}</span>
            <span class="dining-quick-copy">
              <strong>${escapeHtml(candidate.name || '候选餐厅')}</strong>
              <small>${escapeHtml(candidate.address || (candidate.latitude !== null && candidate.latitude !== undefined ? '已定位' : '未定位'))}</small>
            </span>
            <em>${index === 0 ? '📍 路线' : ''}${candidate.id === item.details.selectedCandidateId ? ' · ✓ 已选' : ''}</em>
          </button>
        `).join('')}
      </div>
      <button class="button ghost full" type="button" data-manage-dining>管理候选与排序</button>
    </div>
  `;

  const subForm = openItemSubsheet('🍜 选餐厅', body, async () => {});
  subForm.querySelectorAll('[data-quick-dining]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/api/items/${item.id}/dining-selection`, {
          method: 'PUT',
          body: JSON.stringify({ candidateId: button.dataset.quickDining })
        });
        closeItemSubsheet(true);
        await refreshCurrent();
        showToast('已选择餐厅，并设为路线第1家');
      } catch (error) {
        button.disabled = false;
        showToast(error.message, 'error');
      }
    });
  });
  subForm.querySelector('[data-manage-dining]')?.addEventListener('click', () => {
    closeItemSubsheet(true);
    const day = state.current.days.find(day => day.items.some(entry => String(entry.id) === String(item.id)));
    if (day) openItemForm(day, item);
  });
}

function openItemForm(day, item = null) {
  openSheet(item ? '编辑行程' : '添加行程', compactItemFormHtml(item || {}, day.id), async formData => {
    const mainForm = el.sheetForm;
    const typeValue = String(formData.get('itemType') || 'other');
    const typeMeta = ITEM_EDITOR_TYPES[typeValue] || ITEM_EDITOR_TYPES.other;
    const detailsRaw = safeJsonParse(formData.get('detailsJson'), {});
    const details = typeMeta.kind
      ? { ...detailsRaw, kind: typeMeta.kind }
      : {};
    const references = safeJsonParse(formData.get('referencesJson'), []);
    const images = extractImageRefs(formData.get('imageUrls'), 12);

    const payload = {
      startTime: formData.get('startTime'),
      endTime: formData.get('endTime'),
      category: typeMeta.category,
      title: formData.get('title'),
      locationName: formData.get('locationName'),
      locationUid: formData.get('locationUid'),
      location: formData.get('location'),
      latitude: formData.get('latitude'),
      longitude: formData.get('longitude'),
      coordType: formData.get('coordType'),
      notes: formData.get('notes'),
      references,
      imageUrls: images,
      details
    };

    if (!item) {
      const expense = safeJsonParse(formData.get('initialExpenseJson'), {});
      if (Number(expense.amount || 0) > 0) payload.expense = expense;
    }

    const targetDayId = String(formData.get('targetDayId') || day.id);
    if (item) {
      await api(`/api/items/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (targetDayId !== String(item.day_id)) {
        await api(`/api/items/${item.id}/move`, {
          method: 'PUT',
          body: JSON.stringify({ targetDayId, position: 999999 })
        });
      }
    } else {
      await api(`/api/days/${targetDayId}/items`, { method: 'POST', body: JSON.stringify(payload) });
    }

    closeItemSubsheet(true);
    closeSheet();
    if (targetDayId !== String(state.currentDayId)) {
      await navigate(`/trips/${state.current.trip.id}/day/${targetDayId}`);
    } else {
      await refreshCurrent();
    }
    showToast(item ? '行程已更新' : '行程已添加');
  });

  const mainForm = el.sheetForm;
  bindCompactItemEditor(mainForm, item || {});

  if (item) {
    mainForm.querySelector('#delete-item')?.addEventListener('click', async () => {
      if (!confirm(`确定删除“${item.title}”吗？`)) return;
      try {
        await api(`/api/items/${item.id}`, { method: 'DELETE' });
        closeItemSubsheet(true);
        closeSheet();
        await refreshCurrent();
        showToast('行程已删除');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }
}
