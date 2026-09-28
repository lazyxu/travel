const ITEM_EDITOR_TYPES = {
  attraction: { label: '景点', icon: '📍', category: '景点', kind: '' },
  dining: { label: '餐饮', icon: '🍜', category: '餐饮', kind: '' },
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
  return '';
}

function itemEditorLocationSummary(form) {
  const name = form.querySelector('[name="locationName"]')?.value || '';
  const address = form.querySelector('[name="location"]')?.value || '';
  return [name, address && address !== name ? address : ''].filter(Boolean).join(' · ') || '未添加地点';
}

function itemEditorReferenceSummary(refs = []) {
  if (!refs.length) return '未添加参考入口';
  const labels = refs.slice(0, 2).map(ref => ref.customTitle || ref.autoTitle || '').filter(Boolean);
  return `${refs.length} 个参考${labels.length ? ` · ${labels.join('、')}` : ''}`;
}

function itemEditorImageSummary(urls = []) {
  return urls.length ? `${urls.length} 张图片` : '未添加图片';
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
  document.querySelector('#item-subsheet-close')?.addEventListener('click', closeItemSubsheet);
  document.querySelector('#item-subsheet-backdrop')?.addEventListener('click', closeItemSubsheet);

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

function closeItemSubsheet() {
  const sheet = document.querySelector('#item-subsheet');
  const form = document.querySelector('#item-subsheet-form');
  sheet?.classList.add('hidden');
  document.querySelector('#item-subsheet-backdrop')?.classList.add('hidden');
  if (form) {
    form.innerHTML = '';
    form.onsubmit = null;
  }
}

function itemEditorDetailsFormHtml(kind, details = {}) {
  if (kind === 'lodging') {
    return `
      <div class="stack">
        <label class="field"><span>酒店名称</span><input name="hotelName" maxlength="160" value="${attr(details.hotelName || '')}" /></label>
        <div class="field-grid">
          <label class="field"><span>入住日期</span><input name="checkInDate" type="date" value="${attr(details.checkInDate || '')}" /></label>
          <label class="field"><span>入住时间</span><input name="checkInTime" type="time" value="${attr(details.checkInTime || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>退房日期</span><input name="checkOutDate" type="date" value="${attr(details.checkOutDate || '')}" /></label>
          <label class="field"><span>退房时间</span><input name="checkOutTime" type="time" value="${attr(details.checkOutTime || '')}" /></label>
        </div>
        <label class="field"><span>房型</span><input name="roomType" maxlength="160" value="${attr(details.roomType || '')}" /></label>
        <div class="field-grid">
          <label class="field"><span>预订平台</span><input name="bookingPlatform" maxlength="160" value="${attr(details.bookingPlatform || '')}" /></label>
          <label class="field"><span>确认号</span><input name="confirmationNo" maxlength="160" value="${attr(details.confirmationNo || '')}" /></label>
        </div>
        <label class="field"><span>酒店电话</span><input name="phone" maxlength="160" value="${attr(details.phone || '')}" /></label>
        <p class="form-help">跨天酒店会自动成为住宿期间每天早上的第一站和晚上的最后一站。</p>
        <button class="button primary full" type="submit">完成</button>
      </div>
    `;
  }

  if (kind === 'flight') {
    return `
      <div class="stack">
        <div class="field-grid">
          <label class="field"><span>航空公司</span><input name="airline" maxlength="160" value="${attr(details.airline || '')}" /></label>
          <label class="field"><span>航班号</span><input name="flightNo" maxlength="40" value="${attr(details.flightNo || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>出发日期</span><input name="departureDate" type="date" value="${attr(details.departureDate || '')}" /></label>
          <label class="field"><span>出发时间</span><input name="departureTime" type="time" value="${attr(details.departureTime || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>出发机场</span><input name="departureAirport" maxlength="160" value="${attr(details.departureAirport || '')}" /></label>
          <label class="field"><span>航站楼</span><input name="departureTerminal" maxlength="80" value="${attr(details.departureTerminal || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>到达日期</span><input name="arrivalDate" type="date" value="${attr(details.arrivalDate || '')}" /></label>
          <label class="field"><span>到达时间</span><input name="arrivalTime" type="time" value="${attr(details.arrivalTime || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>到达机场</span><input name="arrivalAirport" maxlength="160" value="${attr(details.arrivalAirport || '')}" /></label>
          <label class="field"><span>航站楼</span><input name="arrivalTerminal" maxlength="80" value="${attr(details.arrivalTerminal || '')}" /></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>座位</span><input name="seat" maxlength="40" value="${attr(details.seat || '')}" /></label>
          <label class="field"><span>确认号</span><input name="confirmationNo" maxlength="160" value="${attr(details.confirmationNo || '')}" /></label>
        </div>
        <button class="button primary full" type="submit">完成</button>
      </div>
    `;
  }

  return `
    <div class="stack">
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
      <div class="field-grid">
        <label class="field"><span>车厢</span><input name="carriage" maxlength="40" value="${attr(details.carriage || '')}" /></label>
        <label class="field"><span>座位</span><input name="seat" maxlength="40" value="${attr(details.seat || '')}" /></label>
      </div>
      <label class="field"><span>订单 / 确认号</span><input name="confirmationNo" maxlength="160" value="${attr(details.confirmationNo || '')}" /></label>
      <button class="button primary full" type="submit">完成</button>
    </div>
  `;
}

function itemEditorCollectDetails(kind, formData) {
  const value = name => String(formData.get(name) || '').trim();
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

function itemEditorLocationFormHtml(mainForm) {
  const value = name => mainForm.querySelector(`[name="${name}"]`)?.value || '';
  const temp = {
    title: mainForm.querySelector('[name="title"]')?.value || '',
    location_name: value('locationName'),
    location: value('location'),
    latitude: value('latitude'),
    longitude: value('longitude'),
    coord_type: value('coordType') || 'bd09ll'
  };
  const mapUrl = baiduPointUrl(temp);
  return `
    <div class="stack">
      <div class="poi-search-box">
        <div class="poi-search-head"><strong>搜索百度地点</strong><span>选择后自动定位</span></div>
        <div class="poi-search-row">
          <input name="poiQuery" maxlength="45" placeholder="景点、餐厅、酒店等" />
          <input name="poiRegion" maxlength="50" value="${attr(state.current?.trip?.destination || '')}" placeholder="城市" />
          <button class="button ghost small" type="button" data-location-search>搜索</button>
        </div>
        <div class="poi-results hidden" data-location-results></div>
      </div>
      <label class="field"><span>地点名称</span><input name="locationName" maxlength="160" value="${attr(value('locationName'))}" placeholder="例如：灵隐寺" /></label>
      <label class="field"><span>地址</span><input name="location" maxlength="240" value="${attr(value('location'))}" placeholder="可读地址" /></label>
      <div class="baidu-link-box">
        <div class="baidu-link-head"><strong>百度地图链接</strong><span>可直接粘贴分享链接</span></div>
        <div class="baidu-link-row">
          <input name="baiduMapLink" inputmode="url" placeholder="百度地图分享链接" />
          <button class="button ghost small" type="button" data-location-parse>解析</button>
        </div>
        <div class="location-map-action" data-location-map-action>
          ${mapUrl ? `<a class="map-link" href="${attr(mapUrl)}">在百度地图打开 ↗</a>` : '<span>尚未定位</span>'}
        </div>
      </div>
      <input name="locationUid" type="hidden" value="${attr(value('locationUid'))}" />
      <input name="latitude" type="hidden" value="${attr(value('latitude'))}" />
      <input name="longitude" type="hidden" value="${attr(value('longitude'))}" />
      <input name="coordType" type="hidden" value="${attr(value('coordType') || 'bd09ll')}" />
      <div class="form-actions">
        <button class="button danger" type="button" data-clear-location>清除地点</button>
        <button class="button primary" type="submit">完成</button>
      </div>
    </div>
  `;
}

function bindItemLocationEditor(subForm, mainForm) {
  const field = name => subForm.querySelector(`[name="${name}"]`);
  const mapAction = subForm.querySelector('[data-location-map-action]');

  const updateMapAction = () => {
    const temp = {
      title: mainForm.querySelector('[name="title"]')?.value || '',
      location_name: field('locationName')?.value || '',
      location: field('location')?.value || '',
      latitude: field('latitude')?.value || '',
      longitude: field('longitude')?.value || '',
      coord_type: field('coordType')?.value || 'bd09ll'
    };
    const url = baiduPointUrl(temp);
    mapAction.innerHTML = url ? `<a class="map-link" href="${attr(url)}">在百度地图打开 ↗</a>` : '<span>尚未定位</span>';
  };

  subForm.querySelector('[data-location-parse]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const value = field('baiduMapLink')?.value?.trim();
    if (!value) return showToast('请先粘贴百度地图链接', 'error');
    const region = field('poiRegion')?.value?.trim() || state.current?.trip?.destination || '';
    button.disabled = true;
    button.textContent = '解析中…';
    try {
      const parsed = await api('/api/baidu/parse-link', {
        method: 'POST',
        body: JSON.stringify({ value, region })
      });
      if (parsed.name) field('locationName').value = parsed.name;
      if (parsed.address) field('location').value = parsed.address;
      field('locationUid').value = parsed.uid || '';
      if (parsed.location) {
        field('latitude').value = parsed.location.lat;
        field('longitude').value = parsed.location.lng;
        field('coordType').value = parsed.coordType || 'bd09ll';
      }
      updateMapAction();
      showToast(parsed.location ? '百度地图位置已解析' : '已识别地点，请搜索确认定位');
    } finally {
      button.disabled = false;
      button.textContent = '解析';
    }
  });

  subForm.querySelector('[data-location-search]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const query = field('poiQuery')?.value?.trim();
    const region = field('poiRegion')?.value?.trim();
    if (!query || !region) return showToast('请填写搜索关键词和城市', 'error');
    button.disabled = true;
    button.textContent = '搜索中…';
    try {
      const params = new URLSearchParams({ query, region });
      const data = await api(`/api/baidu/poi/search?${params.toString()}`);
      const results = data?.results || [];
      const box = subForm.querySelector('[data-location-results]');
      box.classList.remove('hidden');
      box.innerHTML = results.length ? results.map((poi, index) => `
        <button class="poi-result" type="button" data-poi-index="${index}">
          <strong>${escapeHtml(poi.name)}</strong>
          <span>${escapeHtml([poi.city, poi.district, poi.address].filter(Boolean).join(' · '))}</span>
        </button>
      `).join('') : '<div class="poi-empty">没有找到匹配地点</div>';

      box.querySelectorAll('[data-poi-index]').forEach(resultButton => {
        resultButton.addEventListener('click', () => {
          const poi = results[Number(resultButton.dataset.poiIndex)];
          if (!poi) return;
          field('locationName').value = poi.name || '';
          field('location').value = [poi.city, poi.district, poi.address || poi.name].filter(Boolean).join(' ');
          field('locationUid').value = poi.uid || '';
          field('latitude').value = poi.location?.lat ?? '';
          field('longitude').value = poi.location?.lng ?? '';
          field('coordType').value = 'bd09ll';
          if (!mainForm.querySelector('[name="title"]').value.trim()) {
            mainForm.querySelector('[name="title"]').value = poi.name || '';
          }
          box.classList.add('hidden');
          updateMapAction();
        });
      });
    } finally {
      button.disabled = false;
      button.textContent = '搜索';
    }
  });

  subForm.querySelector('[data-clear-location]')?.addEventListener('click', () => {
    ['locationName', 'location', 'locationUid', 'latitude', 'longitude'].forEach(name => { field(name).value = ''; });
    field('coordType').value = 'bd09ll';
    updateMapAction();
  });
}

function bindReferenceEditorWithin(root) {
  const editor = root.querySelector('[data-reference-editor]');
  if (!editor) return;
  const list = editor.querySelector('[data-reference-list]');

  const sync = () => {
    const rows = editor.querySelectorAll('.reference-editor-row');
    rows.forEach(row => {
      const remove = row.querySelector('[data-remove-reference]');
      if (remove) remove.disabled = rows.length <= 1;
    });
  };

  editor.addEventListener('input', event => {
    const valueInput = event.target.closest('[name="refValue"]');
    if (!valueInput) return;
    const row = valueInput.closest('.reference-editor-row');
    if (valueInput.value.trim() !== String(valueInput.dataset.initialValue || '').trim()) {
      const auto = row?.querySelector('[name="refAutoTitle"]');
      const label = row?.querySelector('[data-reference-auto-label]');
      if (auto) auto.value = '';
      if (label) label.textContent = '链接已修改，保存后重新提取';
    }
  });

  editor.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-reference]');
    if (remove) {
      remove.closest('.reference-editor-row')?.remove();
      sync();
      return;
    }
    if (event.target.closest('#add-reference-row')) {
      if (editor.querySelectorAll('.reference-editor-row').length >= 12) return showToast('最多 12 个参考入口', 'error');
      list.insertAdjacentHTML('beforeend', referenceEditorRowHtml());
      sync();
    }
  });
  sync();
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
        render();
      }
    } finally {
      filesInput.disabled = false;
      filesInput.value = '';
      render();
    }
  });
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
          title: '地点',
          summary: hasLocation ? [item.location_name, item.location].filter(Boolean).join(' · ') : '未添加地点',
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
          title: '参考入口',
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
          summary: '未添加费用',
          active: false,
          action: '添加',
          hidden: Boolean(item.id)
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

  mainForm.querySelectorAll('[data-open-addon]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.openAddon;

      if (id === 'details') {
        const meta = ITEM_EDITOR_TYPES[typeSelect.value] || ITEM_EDITOR_TYPES.other;
        if (!meta.kind) return;
        const current = safeJsonParse(detailsInput.value, { kind: meta.kind });
        openItemSubsheet(`${meta.icon} ${meta.label}信息`, itemEditorDetailsFormHtml(meta.kind, current), async data => {
          const next = itemEditorCollectDetails(meta.kind, data);
          detailsInput.value = JSON.stringify(next);

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
          closeItemSubsheet();
        });
        return;
      }

      if (id === 'location') {
        const subForm = openItemSubsheet('📍 地点', itemEditorLocationFormHtml(mainForm), async (_data, form) => {
          ['locationName', 'locationUid', 'location', 'latitude', 'longitude', 'coordType'].forEach(name => {
            const source = form.querySelector(`[name="${name}"]`);
            const target = mainForm.querySelector(`[name="${name}"]`);
            if (source && target) target.value = source.value;
          });
          const hasLocation = Boolean(mainForm.querySelector('[name="locationName"]').value || mainForm.querySelector('[name="location"]').value || mainForm.querySelector('[name="latitude"]').value);
          updateCompactItemAddon(mainForm, 'location', itemEditorLocationSummary(mainForm), hasLocation, hasLocation ? '编辑' : '添加');
          closeItemSubsheet();
        });
        bindItemLocationEditor(subForm, mainForm);
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
          closeItemSubsheet();
        });
        subForm.querySelector('[data-clear-note]')?.addEventListener('click', () => {
          subForm.querySelector('[name="notes"]').value = '';
        });
        return;
      }

      if (id === 'references') {
        const current = safeJsonParse(mainForm.querySelector('[name="referencesJson"]').value, []);
        const subForm = openItemSubsheet('🔗 参考入口', `
          <div class="stack">
            ${referenceEditorHtml(current)}
            <button class="button primary full" type="submit">完成</button>
          </div>
        `, async data => {
          const refs = collectReferenceEntries(data);
          mainForm.querySelector('[name="referencesJson"]').value = JSON.stringify(refs);
          updateCompactItemAddon(mainForm, 'references', itemEditorReferenceSummary(refs), refs.length > 0, refs.length ? '管理' : '添加');
          closeItemSubsheet();
        });
        bindReferenceEditorWithin(subForm);
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
          closeItemSubsheet();
        });
        bindImageEditorWithin(subForm);
        return;
      }

      if (id === 'expense') {
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
          closeItemSubsheet();
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

    closeItemSubsheet();
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
        closeItemSubsheet();
        closeSheet();
        await refreshCurrent();
        showToast('行程已删除');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }
}
