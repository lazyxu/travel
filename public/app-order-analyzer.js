const ORDER_FIELD_SPECS = {
  lodging: [
    ['hotelName', '酒店名称', 'text'], ['checkInDate', '入住日期', 'date'], ['checkInTime', '入住时间', 'time'],
    ['checkOutDate', '退房日期', 'date'], ['checkOutTime', '退房时间', 'time'], ['roomType', '房型', 'text'],
    ['phone', '酒店电话', 'text'], ['bookingPlatform', '预订平台', 'text'], ['confirmationNo', '确认号 / 订单号', 'text']
  ],
  flight: [
    ['airline', '航空公司', 'text'], ['flightNo', '航班号', 'text'], ['departureDate', '出发日期', 'date'],
    ['departureTime', '出发时间', 'time'], ['departureAirport', '出发机场', 'text'], ['departureTerminal', '出发航站楼', 'text'],
    ['arrivalDate', '到达日期', 'date'], ['arrivalTime', '到达时间', 'time'], ['arrivalAirport', '到达机场', 'text'],
    ['arrivalTerminal', '到达航站楼', 'text'], ['seat', '座位', 'text'], ['confirmationNo', '确认号 / 订单号', 'text']
  ],
  train: [
    ['trainNo', '车次', 'text'], ['departureDate', '出发日期', 'date'], ['departureTime', '出发时间', 'time'],
    ['departureStation', '出发站', 'text'], ['arrivalDate', '到达日期', 'date'], ['arrivalTime', '到达时间', 'time'],
    ['arrivalStation', '到达站', 'text'], ['carriage', '车厢', 'text'], ['seat', '座位', 'text'],
    ['confirmationNo', '订单号', 'text']
  ]
};

function ensureOrderAnalyzer() {
  let modal = document.querySelector('#order-analyzer');
  if (modal) return modal;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="order-analyzer-backdrop" class="order-analyzer-backdrop hidden"></div>
    <section id="order-analyzer" class="order-analyzer hidden" role="dialog" aria-modal="true" aria-labelledby="order-analyzer-title">
      <div class="sheet-grabber"></div>
      <div class="sheet-head">
        <h2 id="order-analyzer-title">解析订单文本</h2>
        <button id="order-analyzer-close" class="icon-button" type="button" aria-label="关闭">×</button>
      </div>
      <form id="order-analyzer-form" class="order-analyzer-body"></form>
    </section>
  `);
  modal = document.querySelector('#order-analyzer');
  document.querySelector('#order-analyzer-close')?.addEventListener('click', () => closeOrderAnalyzer());
  document.querySelector('#order-analyzer-backdrop')?.addEventListener('click', () => closeOrderAnalyzer());
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || modal.classList.contains('hidden')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeOrderAnalyzer();
  }, true);
  return modal;
}

function closeOrderAnalyzer(force = false) {
  const modal = document.querySelector('#order-analyzer');
  const form = document.querySelector('#order-analyzer-form');
  if (!modal || modal.classList.contains('hidden')) return true;
  if (!force && form?.dataset.dirty === '1' && !confirm('解析结果有未保存修改，确定放弃吗？')) return false;
  modal.classList.add('hidden');
  document.querySelector('#order-analyzer-backdrop')?.classList.add('hidden');
  if (form) { form.innerHTML = ''; form.onsubmit = null; form.dataset.dirty = '0'; }
  syncDialogBodyLock();
  restoreDialogFocus(modal);
  return true;
}

function orderResultFieldsHtml(kind, details = {}) {
  const specs = ORDER_FIELD_SPECS[kind] || [];
  return specs.map(([name, label, type]) => `
    <label class="field"><span>${escapeHtml(label)}</span><input name="order-${attr(name)}" type="${attr(type)}" value="${attr(details[name] || '')}" /></label>
  `).join('');
}

function collectOrderResult(form, kind) {
  const details = { kind };
  for (const [name] of ORDER_FIELD_SPECS[kind] || []) {
    details[name] = String(form.querySelector(`[name="order-${name}"]`)?.value || '').trim();
  }
  return details;
}

function openOrderAnalyzer({ kind, anchorDate = '', title = '解析订单文本', onApply }) {
  const modal = ensureOrderAnalyzer();
  const form = document.querySelector('#order-analyzer-form');
  document.querySelector('#order-analyzer-title').textContent = title;
  form.innerHTML = `
    <div class="stack">
      <div class="order-analysis-step"><span>1</span><div><strong>粘贴确认短信或订单文本</strong><small>不会直接覆盖，先分析再让你手动调整</small></div></div>
      <label class="field"><span>订单 / 短信文本</span><textarea name="orderText" maxlength="20000" rows="8" placeholder="把酒店、航班或高铁确认短信/订单内容粘贴到这里…"></textarea></label>
      <button class="button primary full" type="button" data-order-analyze>自动解析</button>
      <div class="order-analysis-status" data-order-status>等待粘贴内容</div>
      <div class="order-analysis-fields hidden" data-order-fields></div>
      <button class="button primary full hidden" type="submit" data-order-apply>应用解析结果</button>
    </div>
  `;
  form.dataset.dirty = '0';
  const textInput = form.querySelector('[name="orderText"]');
  const analyzeButton = form.querySelector('[data-order-analyze]');
  const status = form.querySelector('[data-order-status]');
  const fields = form.querySelector('[data-order-fields]');
  const apply = form.querySelector('[data-order-apply]');

  const run = async () => {
    const text = textInput.value.trim();
    if (!text) return showToast('请先粘贴订单或短信内容', 'error');
    analyzeButton.disabled = true;
    analyzeButton.textContent = '解析中…';
    status.textContent = '正在提取结构化字段…';
    try {
      const result = await api('/api/orders/analyze', {
        method: 'POST',
        body: JSON.stringify({ text, kind, anchorDate })
      });
      fields.innerHTML = orderResultFieldsHtml(result.kind, result.details);
      fields.classList.remove('hidden');
      apply.classList.remove('hidden');
      form.dataset.parsedKind = result.kind;
      form.dataset.dirty = '1';
      status.textContent = result.confidence === 'high' ? '识别结果较完整，请确认后应用' : result.confidence === 'medium' ? '已识别部分字段，请补充后应用' : '只识别到少量字段，请手动补充';
    } catch (error) {
      status.textContent = error.message;
      showToast(error.message, 'error');
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.textContent = '自动解析';
    }
  };

  analyzeButton.addEventListener('click', run);
  textInput.addEventListener('paste', () => setTimeout(() => { if (textInput.value.trim()) run(); }, 0));
  form.addEventListener('input', event => { if (event.target !== textInput) form.dataset.dirty = '1'; });
  form.onsubmit = async event => {
    event.preventDefault();
    const parsedKind = form.dataset.parsedKind || kind;
    const details = collectOrderResult(form, parsedKind);
    await onApply?.(details);
    closeOrderAnalyzer(true);
  };

  document.querySelector('#order-analyzer-backdrop').classList.remove('hidden');
  modal.classList.remove('hidden');
  syncDialogBodyLock();
  focusDialogInitial(modal, textInput);
  return form;
}
