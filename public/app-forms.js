function tripFormHtml(trip = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="stack">
      <label class="field"><span>旅行名称 *</span><input name="title" required maxlength="120" value="${attr(trip.title || '')}" placeholder="例如：京都红叶 5 日" /></label>
      <label class="field"><span>目的地</span><input name="destination" maxlength="160" value="${attr(trip.destination || '')}" placeholder="城市 / 地区" /></label>
      <div class="field-grid">
        <label class="field"><span>开始日期 *</span><input name="startDate" type="date" required value="${attr(String(trip.start_date || today).slice(0,10))}" /></label>
        <label class="field"><span>结束日期 *</span><input name="endDate" type="date" required value="${attr(String(trip.end_date || today).slice(0,10))}" /></label>
      </div>
      <label class="field"><span>备注</span><textarea name="notes" maxlength="5000" placeholder="旅行目标、同行人、酒店等总体信息">${escapeHtml(trip.notes || '')}</textarea></label>
      <div class="field-grid">
        <label class="field"><span>旅行总预算</span><input name="budgetTotal" type="number" min="0" step="0.01" value="${attr(trip.budget_total ?? '0')}" placeholder="0" /></label>
        <label class="field"><span>币种</span>
          <select name="currency">
            ${['CNY','USD','JPY','HKD','EUR','GBP','KRW'].map(code => `<option value="${code}" ${(trip.currency || 'CNY') === code ? 'selected' : ''}>${code}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="form-actions">
        ${trip.id ? '<button id="delete-trip" class="button danger" type="button">删除旅行</button>' : ''}
        <button class="button primary" type="submit">保存</button>
      </div>
    </div>
  `;
}

function openTripForm(trip = null) {
  openSheet(trip ? '编辑旅行' : '新建旅行', tripFormHtml(trip || {}), async form => {
    const payload = {
      title: form.get('title'),
      destination: form.get('destination'),
      startDate: form.get('startDate'),
      endDate: form.get('endDate'),
      notes: form.get('notes'),
      budgetTotal: form.get('budgetTotal'),
      currency: form.get('currency')
    };
    if (trip) {
      await api(`/api/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      closeSheet();
      await loadRoute();
      showToast('旅行已更新');
    } else {
      const created = await api('/api/trips', { method: 'POST', body: JSON.stringify(payload) });
      closeSheet();
      const firstDay = created.days[0]?.id;
      await navigate(firstDay ? `/trips/${created.trip.id}/day/${firstDay}` : `/trips/${created.trip.id}/todos`);
      showToast('旅行已创建');
    }
  });
  if (trip) {
    el.sheetForm.querySelector('#delete-trip').addEventListener('click', async () => {
      if (!confirm(`确定删除“${trip.title}”及全部行程和待办吗？`)) return;
      try {
        await api(`/api/trips/${trip.id}`, { method: 'DELETE' });
        closeSheet();
        await navigate('/');
        showToast('旅行已删除');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }
}

function openDayForm(day) {
  openSheet('编辑当天', `
    <div class="stack">
      <label class="field"><span>当天标题</span><input name="title" maxlength="120" value="${attr(day.title || '')}" placeholder="例如：岚山与嵯峨野" /></label>
      <label class="field"><span>当天备注</span><textarea name="notes" maxlength="3000" placeholder="路线提示、天气、集合点等">${escapeHtml(day.notes || '')}</textarea></label>
      <p class="form-help">路线交通方式请直接在当天时间线的两站之间设置。只有全部分段交通方式一致时，才显示全天路线。</p>
      <button class="button primary full" type="submit">保存</button>
    </div>
  `, async form => {
    await api(`/api/days/${day.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: form.get('title'), notes: form.get('notes') })
    });
    closeSheet();
    await refreshCurrent();
    showToast('当天信息已更新');
  });
}

function imagePreviewHtml(urls = []) {
  const images = Array.isArray(urls) ? urls : [];
  if (!images.length) {
    return '<div class="image-preview-empty">暂无图片，粘贴图片 URL 后会在这里预览</div>';
  }
  return `
    <div class="image-preview-grid">
      ${images.map((url, index) => `
        <a class="image-preview-link" href="${attr(url)}" target="_blank" rel="noopener noreferrer" aria-label="预览图片 ${index + 1}">
          <img src="${attr(url)}" alt="图片预览 ${index + 1}" loading="lazy" decoding="async" />
        </a>
      `).join('')}
    </div>
    <div class="image-preview-count">${images.length} / 12 张</div>
  `;
}

function itemDetailsFieldsHtml(item = {}) {
  const d = item.details || {};
  return `
    <label class="field"><span>结构化模板</span>
      <select name="detailsKind">
        <option value="" ${!d.kind ? 'selected' : ''}>普通行程</option>
        <option value="lodging" ${d.kind === 'lodging' ? 'selected' : ''}>🏨 酒店 / 住宿</option>
        <option value="flight" ${d.kind === 'flight' ? 'selected' : ''}>✈️ 飞机 / 航班</option>
        <option value="train" ${d.kind === 'train' ? 'selected' : ''}>🚄 高铁 / 火车</option>
      </select>
    </label>

    <div class="details-fields ${d.kind === 'lodging' ? '' : 'hidden'}" data-details-kind="lodging">
      <div class="field-grid">
        <label class="field"><span>酒店名称</span><input name="hotelName" maxlength="160" value="${attr(d.hotelName || '')}" /></label>
        <label class="field"><span>房型</span><input name="roomType" maxlength="160" value="${attr(d.roomType || '')}" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>入住日期</span><input name="checkInDate" type="date" value="${attr(d.checkInDate || '')}" /></label>
        <label class="field"><span>入住时间</span><input name="checkInTime" type="time" value="${attr(d.checkInTime || '')}" /></label>
      </div>
      <p class="form-help lodging-stay-help">设置跨天入住/退房后：入住当天晚上自动作为最后一站；住宿期间每天早晨自动作为第一站、夜间自动作为最后一站；退房当天早晨作为第一站。</p>
      <div class="field-grid">
        <label class="field"><span>退房日期</span><input name="checkOutDate" type="date" value="${attr(d.checkOutDate || '')}" /></label>
        <label class="field"><span>退房时间</span><input name="checkOutTime" type="time" value="${attr(d.checkOutTime || '')}" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>预订平台</span><input name="bookingPlatform" maxlength="160" value="${attr(d.bookingPlatform || '')}" /></label>
        <label class="field"><span>确认号</span><input name="lodgingConfirmationNo" maxlength="160" value="${attr(d.confirmationNo || '')}" /></label>
      </div>
      <label class="field"><span>酒店电话</span><input name="phone" maxlength="160" value="${attr(d.phone || '')}" /></label>
    </div>

    <div class="details-fields ${d.kind === 'flight' ? '' : 'hidden'}" data-details-kind="flight">
      <div class="field-grid">
        <label class="field"><span>航空公司</span><input name="airline" maxlength="160" value="${attr(d.airline || '')}" /></label>
        <label class="field"><span>航班号</span><input name="flightNo" maxlength="40" value="${attr(d.flightNo || '')}" placeholder="MU5123" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>出发日期</span><input name="flightDepartureDate" type="date" value="${attr(d.departureDate || '')}" /></label>
        <label class="field"><span>出发时间</span><input name="flightDepartureTime" type="time" value="${attr(d.departureTime || '')}" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>出发机场</span><input name="departureAirport" maxlength="160" value="${attr(d.departureAirport || '')}" /></label>
        <label class="field"><span>航站楼</span><input name="departureTerminal" maxlength="80" value="${attr(d.departureTerminal || '')}" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>到达日期</span><input name="flightArrivalDate" type="date" value="${attr(d.arrivalDate || '')}" /></label>
        <label class="field"><span>到达时间</span><input name="flightArrivalTime" type="time" value="${attr(d.arrivalTime || '')}" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>到达机场</span><input name="arrivalAirport" maxlength="160" value="${attr(d.arrivalAirport || '')}" /></label>
        <label class="field"><span>航站楼</span><input name="arrivalTerminal" maxlength="80" value="${attr(d.arrivalTerminal || '')}" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>座位</span><input name="flightSeat" maxlength="40" value="${attr(d.seat || '')}" /></label>
        <label class="field"><span>确认号</span><input name="flightConfirmationNo" maxlength="160" value="${attr(d.confirmationNo || '')}" /></label>
      </div>
    </div>

    <div class="details-fields ${d.kind === 'train' ? '' : 'hidden'}" data-details-kind="train">
      <label class="field"><span>车次</span><input name="trainNo" maxlength="40" value="${attr(d.trainNo || '')}" placeholder="G1234" /></label>
      <div class="field-grid">
        <label class="field"><span>出发日期</span><input name="trainDepartureDate" type="date" value="${attr(d.departureDate || '')}" /></label>
        <label class="field"><span>出发时间</span><input name="trainDepartureTime" type="time" value="${attr(d.departureTime || '')}" /></label>
      </div>
      <label class="field"><span>出发站</span><input name="departureStation" maxlength="160" value="${attr(d.departureStation || '')}" /></label>
      <div class="field-grid">
        <label class="field"><span>到达日期</span><input name="trainArrivalDate" type="date" value="${attr(d.arrivalDate || '')}" /></label>
        <label class="field"><span>到达时间</span><input name="trainArrivalTime" type="time" value="${attr(d.arrivalTime || '')}" /></label>
      </div>
      <label class="field"><span>到达站</span><input name="arrivalStation" maxlength="160" value="${attr(d.arrivalStation || '')}" /></label>
      <div class="field-grid">
        <label class="field"><span>车厢</span><input name="carriage" maxlength="40" value="${attr(d.carriage || '')}" /></label>
        <label class="field"><span>座位</span><input name="trainSeat" maxlength="40" value="${attr(d.seat || '')}" /></label>
      </div>
      <label class="field"><span>订单 / 确认号</span><input name="trainConfirmationNo" maxlength="160" value="${attr(d.confirmationNo || '')}" /></label>
    </div>
  `;
}

function collectItemDetails(form) {
  const kind = String(form.get('detailsKind') || '');
  if (!kind) return {};

  if (kind === 'lodging') {
    return {
      kind,
      hotelName: form.get('hotelName'),
      checkInDate: form.get('checkInDate'),
      checkInTime: form.get('checkInTime'),
      checkOutDate: form.get('checkOutDate'),
      checkOutTime: form.get('checkOutTime'),
      roomType: form.get('roomType'),
      phone: form.get('phone'),
      bookingPlatform: form.get('bookingPlatform'),
      confirmationNo: form.get('lodgingConfirmationNo')
    };
  }
  if (kind === 'flight') {
    return {
      kind,
      airline: form.get('airline'),
      flightNo: form.get('flightNo'),
      departureDate: form.get('flightDepartureDate'),
      departureTime: form.get('flightDepartureTime'),
      departureAirport: form.get('departureAirport'),
      departureTerminal: form.get('departureTerminal'),
      arrivalDate: form.get('flightArrivalDate'),
      arrivalTime: form.get('flightArrivalTime'),
      arrivalAirport: form.get('arrivalAirport'),
      arrivalTerminal: form.get('arrivalTerminal'),
      seat: form.get('flightSeat'),
      confirmationNo: form.get('flightConfirmationNo')
    };
  }
  return {
    kind,
    trainNo: form.get('trainNo'),
    departureDate: form.get('trainDepartureDate'),
    departureTime: form.get('trainDepartureTime'),
    departureStation: form.get('departureStation'),
    arrivalDate: form.get('trainArrivalDate'),
    arrivalTime: form.get('trainArrivalTime'),
    arrivalStation: form.get('arrivalStation'),
    carriage: form.get('carriage'),
    seat: form.get('trainSeat'),
    confirmationNo: form.get('trainConfirmationNo')
  };
}

function initialExpenseFieldsHtml(item = {}) {
  if (item.id) return '';
  return `
    <details class="inline-expense-create">
      <summary>同时记录费用（可选）</summary>
      <div class="field-grid">
        <label class="field"><span>金额</span><input name="initialExpenseAmount" type="number" min="0" step="0.01" placeholder="0.00" /></label>
        <label class="field"><span>分类</span>
          <select name="initialExpenseCategory">
            <option value="交通">交通</option>
            <option value="住宿">住宿</option>
            <option value="餐饮">餐饮</option>
            <option value="门票">门票</option>
            <option value="购物">购物</option>
            <option value="其他">其他</option>
          </select>
        </label>
      </div>
      <label class="check-field"><input name="initialExpensePaid" type="checkbox" /><span>已支付</span></label>
    </details>
  `;
}

function itemFormHtml(item = {}, currentDayId = state.currentDayId) {
  const startTime = item.start_time || item.item_time || '';
  const references = itemReferenceEntries(item);
  const selectedDayId = String(item.day_id || currentDayId || '');
  return `
    <div class="stack">
      <div class="field-grid">
        <label class="field"><span>开始时间</span><input name="startTime" type="time" value="${attr(startTime)}" /></label>
        <label class="field"><span>结束时间</span><input name="endTime" type="time" value="${attr(item.end_time || '')}" /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>类型</span>
          <select name="category">
            ${['交通','景点','餐饮','住宿','购物','其他'].map(category => `<option value="${category}" ${item.category === category ? 'selected' : ''}>${categoryMeta(category).icon} ${category}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>所在日期</span>
          <select name="targetDayId">
            ${state.current.days.map(target => `<option value="${target.id}" ${String(target.id) === selectedDayId ? 'selected' : ''}>D${dayNumber(target.day_date, state.current.trip.start_date)} · ${formatDate(target.day_date)}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="field"><span>行程标题 *</span><input name="title" required maxlength="160" value="${attr(item.title || '')}" placeholder="例如：清水寺" /></label>
      ${itemDetailsFieldsHtml(item)}
      <div class="poi-search-box">
        <div class="poi-search-head"><strong>搜索百度地点</strong><span>选择后自动定位</span></div>
        <div class="poi-search-row">
          <input name="poiQuery" maxlength="45" placeholder="输入景点、餐厅、酒店等" />
          <input name="poiRegion" maxlength="50" value="${attr(state.current?.trip?.destination || '')}" placeholder="城市，如：杭州" />
          <button id="poi-search-button" class="button ghost small" type="button">搜索</button>
        </div>
        <div class="poi-results hidden" data-poi-results></div>
      </div>
      <label class="field"><span>地点名称</span><input name="locationName" maxlength="160" value="${attr(item.location_name || '')}" placeholder="例如：灵隐寺、西湖全季酒店" /></label>
      <label class="field"><span>地址</span><input name="location" maxlength="240" value="${attr(item.location || '')}" placeholder="例如：杭州市西湖区法云弄1号" /></label>
      <div class="baidu-link-box">
        <div class="baidu-link-head"><strong>百度地图链接</strong><span>可直接粘贴百度分享链接</span></div>
        <div class="baidu-link-row">
          <input name="baiduMapLink" inputmode="url" placeholder="粘贴百度地图分享链接或 baidumap:// 链接" />
          <button id="baidu-link-parse" class="button ghost small" type="button">解析</button>
        </div>
        <div class="location-map-action" data-location-map-action>
          ${baiduPointUrl(item) ? `<a class="map-link" href="${attr(baiduPointUrl(item))}" >在百度地图打开 ↗</a>` : '<span>尚未定位；可搜索地点或粘贴百度地图链接</span>'}
        </div>
      </div>
      <input name="locationUid" type="hidden" value="${attr(item.location_uid || '')}" />
      <input name="latitude" type="hidden" value="${attr(item.latitude ?? '')}" />
      <input name="longitude" type="hidden" value="${attr(item.longitude ?? '')}" />
      <input name="coordType" type="hidden" value="${attr(item.coord_type || 'bd09ll')}" />
      <label class="field"><span>备注</span><textarea name="notes" maxlength="5000" placeholder="预约信息、交通方式、必点菜等">${escapeHtml(item.notes || '')}</textarea></label>
      ${referenceEditorHtml(references)}
      <div class="field">
        <span>行程图片</span>
        <div class="image-upload-row">
          <label class="button ghost small image-upload-button">
            📷 从相册添加
            <input name="imageFiles" type="file" accept="image/*" multiple hidden />
          </label>
          <span class="image-upload-status" data-image-upload-status>浏览器会先压缩再上传</span>
        </div>
        <textarea name="imageUrls" class="image-url-input" maxlength="24000" placeholder="也可粘贴外部图片 URL，每行一张；最多 12 张">${escapeHtml((item.image_urls || []).join('\n'))}</textarea>
      </div>
      <div class="image-preview" data-image-preview>${imagePreviewHtml(item.image_urls || [])}</div>
      <p class="form-help">手机相册图片会压缩到最长边约 1600px 后上传到你自己的服务器；也支持外部 http/https 图片 URL。</p>
      ${initialExpenseFieldsHtml(item)}
      <div class="form-actions">
        ${item.id ? '<button id="delete-item" class="button danger" type="button">删除</button>' : ''}
        <button class="button primary" type="submit">保存</button>
      </div>
    </div>
  `;
}

function openItemForm(day, item = null) {
  openSheet(item ? '编辑行程' : '添加行程', itemFormHtml(item || {}, day.id), async form => {
    const payload = {
      startTime: form.get('startTime'),
      endTime: form.get('endTime'),
      category: form.get('category'),
      title: form.get('title'),
      locationName: form.get('locationName'),
      locationUid: form.get('locationUid'),
      location: form.get('location'),
      latitude: form.get('latitude'),
      longitude: form.get('longitude'),
      coordType: form.get('coordType'),
      notes: form.get('notes'),
      references: collectReferenceEntries(form),
      imageUrls: extractImageRefs(form.get('imageUrls'), 12),
      details: collectItemDetails(form)
    };
    if (!item) {
      const initialAmount = Number(form.get('initialExpenseAmount') || 0);
      if (initialAmount > 0) {
        payload.expense = {
          amount: initialAmount,
          category: form.get('initialExpenseCategory') || '其他',
          paid: form.get('initialExpensePaid') === 'on',
          notes: ''
        };
      }
    }
    const targetDayId = String(form.get('targetDayId') || day.id);
    let savedItem = item;
    if (item) {
      savedItem = await api(`/api/items/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (targetDayId !== String(item.day_id)) {
        await api(`/api/items/${item.id}/move`, {
          method: 'PUT',
          body: JSON.stringify({ targetDayId, position: 999999 })
        });
      }
    } else {
      savedItem = await api(`/api/days/${targetDayId}/items`, { method: 'POST', body: JSON.stringify(payload) });
    }
    closeSheet();
    if (targetDayId !== String(state.currentDayId)) {
      await navigate(`/trips/${state.current.trip.id}/day/${targetDayId}`);
    } else {
      await refreshCurrent();
    }
    showToast(item ? '行程已更新' : '行程已添加');
  });

  const detailsKindSelect = el.sheetForm.querySelector('[name="detailsKind"]');
  const categorySelect = el.sheetForm.querySelector('[name="category"]');
  const updateDetailsKind = () => {
    const kind = detailsKindSelect?.value || '';
    el.sheetForm.querySelectorAll('[data-details-kind]').forEach(section => {
      section.classList.toggle('hidden', section.dataset.detailsKind !== kind);
    });
    if (categorySelect && kind === 'lodging') categorySelect.value = '住宿';
    if (categorySelect && (kind === 'flight' || kind === 'train')) categorySelect.value = '交通';
  };
  detailsKindSelect?.addEventListener('change', updateDetailsKind);
  bindReferenceEditor();

  const locationNameInput = el.sheetForm.querySelector('[name="locationName"]');
  const locationInput = el.sheetForm.querySelector('[name="location"]');
  const locationUidInput = el.sheetForm.querySelector('[name="locationUid"]');
  const latInput = el.sheetForm.querySelector('[name="latitude"]');
  const lngInput = el.sheetForm.querySelector('[name="longitude"]');
  const coordInput = el.sheetForm.querySelector('[name="coordType"]');
  const locationMapAction = el.sheetForm.querySelector('[data-location-map-action]');
  const baiduLinkInput = el.sheetForm.querySelector('[name="baiduMapLink"]');
  const baiduLinkParseButton = el.sheetForm.querySelector('#baidu-link-parse');

  const updateLocationMapAction = () => {
    if (!locationMapAction) return;
    const temp = {
      title: el.sheetForm.querySelector('[name="title"]')?.value || '',
      location_name: locationNameInput?.value || '',
      location: locationInput?.value || '',
      latitude: latInput?.value || '',
      longitude: lngInput?.value || '',
      coord_type: coordInput?.value || 'bd09ll'
    };
    const url = baiduPointUrl(temp);
    locationMapAction.innerHTML = url
      ? `<a class="map-link" href="${attr(url)}" >在百度地图打开 ↗</a>`
      : '<span>尚未定位；可搜索地点或粘贴百度地图链接</span>';
  };

  const parseBaiduLink = async () => {
    const value = baiduLinkInput?.value?.trim();
    if (!value) return showToast('请先粘贴百度地图链接', 'error');
    const region = el.sheetForm.querySelector('[name="poiRegion"]')?.value?.trim() || state.current?.trip?.destination || '';
    baiduLinkParseButton.disabled = true;
    baiduLinkParseButton.textContent = '解析中…';
    try {
      const parsed = await api('/api/baidu/parse-link', {
        method: 'POST',
        body: JSON.stringify({ value, region })
      });
      if (parsed.name && locationNameInput) locationNameInput.value = parsed.name;
      if (parsed.address && locationInput) locationInput.value = parsed.address;
      if (locationUidInput) locationUidInput.value = parsed.uid || '';
      if (parsed.location) {
        if (latInput) latInput.value = parsed.location.lat;
        if (lngInput) lngInput.value = parsed.location.lng;
        if (coordInput) coordInput.value = parsed.coordType || 'bd09ll';
        updateLocationMapAction();
        showToast('百度地图位置已解析');
      } else {
        updateLocationMapAction();
        showToast('已识别地点，但链接没有可用坐标；请用地点搜索确认定位', 'error');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      baiduLinkParseButton.disabled = false;
      baiduLinkParseButton.textContent = '解析';
    }
  };

  baiduLinkParseButton?.addEventListener('click', parseBaiduLink);
  baiduLinkInput?.addEventListener('paste', () => setTimeout(() => {
    if (baiduLinkInput.value.trim()) parseBaiduLink();
  }, 0));
  locationNameInput?.addEventListener('input', updateLocationMapAction);
  locationInput?.addEventListener('input', updateLocationMapAction);

  const poiSearchButton = el.sheetForm.querySelector('#poi-search-button');
  const poiResults = el.sheetForm.querySelector('[data-poi-results]');
  if (poiSearchButton && poiResults) {
    poiSearchButton.addEventListener('click', async () => {
      const query = el.sheetForm.querySelector('[name="poiQuery"]')?.value?.trim();
      const region = el.sheetForm.querySelector('[name="poiRegion"]')?.value?.trim();
      if (!query || !region) {
        showToast('请填写搜索关键词和城市', 'error');
        return;
      }
      poiSearchButton.disabled = true;
      poiSearchButton.textContent = '搜索中…';
      try {
        const params = new URLSearchParams({ query, region });
        const data = await api(`/api/baidu/poi/search?${params.toString()}`);
        const results = data?.results || [];
        poiResults.classList.remove('hidden');
        poiResults.innerHTML = results.length ? results.map((poi, index) => `
          <button class="poi-result" type="button" data-poi-index="${index}">
            <strong>${escapeHtml(poi.name)}</strong>
            <span>${escapeHtml([poi.city, poi.district, poi.address].filter(Boolean).join(' · '))}</span>
          </button>
        `).join('') : '<div class="poi-empty">没有找到匹配地点</div>';
        poiResults.querySelectorAll('[data-poi-index]').forEach(button => {
          button.addEventListener('click', () => {
            const poi = results[Number(button.dataset.poiIndex)];
            if (!poi) return;
            const titleInput = el.sheetForm.querySelector('[name="title"]');
            const locationNameInput = el.sheetForm.querySelector('[name="locationName"]');
            const locationInput = el.sheetForm.querySelector('[name="location"]');
            const locationUidInput = el.sheetForm.querySelector('[name="locationUid"]');
            const latInput = el.sheetForm.querySelector('[name="latitude"]');
            const lngInput = el.sheetForm.querySelector('[name="longitude"]');
            const coordInput = el.sheetForm.querySelector('[name="coordType"]');
            if (titleInput && !titleInput.value.trim()) titleInput.value = poi.name || '';
            if (locationNameInput) locationNameInput.value = poi.name || '';
            if (locationInput) locationInput.value = [poi.city, poi.district, poi.address || poi.name].filter(Boolean).join(' ');
            if (locationUidInput) locationUidInput.value = poi.uid || '';
            if (latInput) latInput.value = poi.location?.lat ?? '';
            if (lngInput) lngInput.value = poi.location?.lng ?? '';
            if (coordInput) coordInput.value = 'bd09ll';
            updateLocationMapAction();
            poiResults.classList.add('hidden');
            showToast('地点已定位');
          });
        });
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        poiSearchButton.disabled = false;
        poiSearchButton.textContent = '搜索';
      }
    });
  }

  const imageInput = el.sheetForm.querySelector('[name="imageUrls"]');
  const imageFiles = el.sheetForm.querySelector('[name="imageFiles"]');
  const imagePreview = el.sheetForm.querySelector('[data-image-preview]');
  const imageUploadStatus = el.sheetForm.querySelector('[data-image-upload-status]');
  if (imageInput && imagePreview) {
    const renderImagePreview = () => { imagePreview.innerHTML = imagePreviewHtml(extractImageRefs(imageInput.value, 12)); };
    imageInput.addEventListener('input', renderImagePreview);
    imageInput.addEventListener('paste', () => setTimeout(renderImagePreview, 0));

    imageFiles?.addEventListener('change', async () => {
      const files = [...(imageFiles.files || [])];
      if (!files.length) return;
      let refs = extractImageRefs(imageInput.value, 12);
      if (refs.length + files.length > 12) {
        showToast('每条行程最多 12 张图片', 'error');
        imageFiles.value = '';
        return;
      }

      imageFiles.disabled = true;
      try {
        for (let index = 0; index < files.length; index += 1) {
          if (imageUploadStatus) imageUploadStatus.textContent = `正在处理 ${index + 1}/${files.length}…`;
          const blob = await compressImageFile(files[index]);
          const url = await uploadImageBlob(blob);
          refs.push(url);
          refs = [...new Set(refs)].slice(0, 12);
          imageInput.value = refs.join('\n');
          renderImagePreview();
        }
        if (imageUploadStatus) imageUploadStatus.textContent = `已添加 ${files.length} 张图片`;
        showToast('图片已上传');
      } catch (error) {
        if (imageUploadStatus) imageUploadStatus.textContent = '上传失败';
        showToast(error.message, 'error');
      } finally {
        imageFiles.disabled = false;
        imageFiles.value = '';
      }
    });
  }

  if (item) {
    el.sheetForm.querySelector('#delete-item').addEventListener('click', async () => {
      if (!confirm(`确定删除“${item.title}”吗？`)) return;
      try {
        await api(`/api/items/${item.id}`, { method: 'DELETE' });
        closeSheet();
        await refreshCurrent();
        showToast('行程已删除');
      } catch (error) { showToast(error.message, 'error'); }
    });
  }
}

function expenseFormHtml(expense = {}, linkedItem = null) {
  const trip = state.current.trip;
  const allItems = state.current.days.flatMap(day => day.items.map(item => ({
    ...item,
    day_date: day.day_date
  })));
  return `
    <div class="stack">
      <label class="field"><span>费用名称 *</span><input name="title" required maxlength="160" value="${attr(expense.title || '')}" placeholder="例如：酒店预付款" /></label>
      <div class="field-grid">
        <label class="field"><span>金额 *</span><input name="amount" type="number" min="0" step="0.01" required value="${attr(expense.amount ?? '')}" placeholder="0.00" /></label>
        <label class="field"><span>币种</span><input value="${attr(trip.currency || 'CNY')}" disabled /></label>
      </div>
      <div class="field-grid">
        <label class="field"><span>分类</span>
          <select name="category">
            ${['交通','住宿','餐饮','门票','购物','其他'].map(category => `<option value="${category}" ${expense.category === category ? 'selected' : ''}>${category}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>日期</span><input name="expenseDate" type="date" value="${attr(String(expense.expense_date || '').slice(0, 10))}" /></label>
      </div>
      ${linkedItem ? `
        <div class="linked-expense-item">关联行程：<strong>${escapeHtml(linkedItem.title)}</strong></div>
        <input name="itemId" type="hidden" value="${attr(linkedItem.id)}" />
      ` : `
        <label class="field"><span>关联行程</span>
          <select name="itemId">
            <option value="">不关联</option>
            ${allItems.map(item => `<option value="${item.id}" ${String(expense.item_id || '') === String(item.id) ? 'selected' : ''}>${formatDate(item.day_date)} · ${escapeHtml(item.title)}</option>`).join('')}
          </select>
        </label>
      `}
      <label class="check-field"><input name="paid" type="checkbox" ${expense.paid ? 'checked' : ''} /><span>已支付</span></label>
      <label class="field"><span>备注</span><textarea name="notes" maxlength="2000" placeholder="订单号、付款方式等">${escapeHtml(expense.notes || '')}</textarea></label>
      <div class="form-actions">
        ${expense.id ? '<button id="delete-expense" class="button danger" type="button">删除</button>' : ''}
        <button class="button primary" type="submit">保存</button>
      </div>
    </div>
  `;
}

function openExpenseForm(expense = null, linkedItem = null) {
  const linkedDay = linkedItem
    ? state.current.days.find(day => day.items.some(item => String(item.id) === String(linkedItem.id)))
    : null;
  const initial = expense || (linkedItem ? {
    title: linkedItem.title,
    category: linkedItem.category === '景点' ? '门票' : linkedItem.category,
    expense_date: linkedDay?.day_date || '',
    item_id: linkedItem.id,
    paid: false
  } : {});
  openSheet(expense ? '编辑费用' : '添加费用', expenseFormHtml(initial, linkedItem), async form => {
    const payload = {
      title: form.get('title'),
      amount: form.get('amount'),
      category: form.get('category'),
      expenseDate: form.get('expenseDate'),
      itemId: form.get('itemId'),
      paid: form.get('paid') === 'on',
      notes: form.get('notes')
    };
    if (expense) {
      await api(`/api/expenses/${expense.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api(`/api/trips/${state.current.trip.id}/expenses`, { method: 'POST', body: JSON.stringify(payload) });
    }
    closeSheet();
    await refreshCurrent();
    showToast(expense ? '费用已更新' : '费用已添加');
  });

  if (expense) {
    el.sheetForm.querySelector('#delete-expense').addEventListener('click', async () => {
      if (!confirm(`确定删除“${expense.title}”吗？`)) return;
      try {
        await api(`/api/expenses/${expense.id}`, { method: 'DELETE' });
        closeSheet();
        await refreshCurrent();
        showToast('费用已删除');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }
}

function todoFormHtml(todo = {}) {
  return `
    <div class="stack">
      <label class="field"><span>待办 *</span><input name="title" required maxlength="200" value="${attr(todo.title || '')}" placeholder="例如：预订机场接送" /></label>
      <label class="field"><span>截止日期</span><input name="dueDate" type="date" value="${attr(String(todo.due_date || '').slice(0,10))}" /></label>
      <label class="field"><span>备注</span><textarea name="notes" maxlength="3000" placeholder="订单号、注意事项等">${escapeHtml(todo.notes || '')}</textarea></label>
      <div class="form-actions">
        ${todo.id ? '<button id="delete-todo" class="button danger" type="button">删除</button>' : ''}
        <button class="button primary" type="submit">保存</button>
      </div>
    </div>
  `;
}

function openTodoForm(todo = null) {
  openSheet(todo ? '编辑待办' : '添加待办', todoFormHtml(todo || {}), async form => {
    const payload = {
      title: form.get('title'),
      dueDate: form.get('dueDate'),
      notes: form.get('notes'),
      done: todo?.done || false
    };
    if (todo) await api(`/api/todos/${todo.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api(`/api/trips/${state.current.trip.id}/todos`, { method: 'POST', body: JSON.stringify(payload) });
    closeSheet();
    await refreshCurrent();
    showToast(todo ? '待办已更新' : '待办已添加');
  });
  if (todo) {
    el.sheetForm.querySelector('#delete-todo').addEventListener('click', async () => {
      if (!confirm(`确定删除“${todo.title}”吗？`)) return;
      try {
        await api(`/api/todos/${todo.id}`, { method: 'DELETE' });
        closeSheet();
        await refreshCurrent();
        showToast('待办已删除');
      } catch (error) { showToast(error.message, 'error'); }
    });
  }
}

el.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: el.loginPassword.value }) });
    el.loginPassword.value = '';
    showApp();
    await loadRoute();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

el.backHome.addEventListener('click', () => navigate('/'));

el.bottomNav.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    if (!state.current?.trip?.id) return;
    if (button.dataset.tab === 'todos') {
      navigate(`/trips/${state.current.trip.id}/todos`);
      return;
    }
    const dayId = state.currentDayId || state.current.days[0]?.id;
    if (dayId) navigate(`/trips/${state.current.trip.id}/day/${dayId}`);
  });
});

el.sheetClose.addEventListener('click', closeSheet);
el.sheetBackdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !el.sheet.classList.contains('hidden')) closeSheet();
});

window.addEventListener('popstate', () => {
  loadRoute().catch(error => showToast(error.message, 'error'));
});

(async function boot() {
  try {
    const initialRoute = parseRoute();
    if (initialRoute.name === 'share') {
      showApp();
      await loadRoute();
      return;
    }
    const auth = await api('/api/auth');
    if (!auth.authenticated) return showLogin();
    showApp();
    await loadRoute();
  } catch (error) {
    showToast(error.message, 'error');
    if (parseRoute().name === 'share') {
      showApp();
      el.main.innerHTML = `<div class="empty-state"><strong>分享链接不可用</strong><div>${escapeHtml(error.message)}</div></div>`;
      return;
    }
    showLogin();
  }
})();
