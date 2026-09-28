function legControlHtml(day, fromItem, toItem, { readonly = false } = {}) {
  const mode = legMode(day, fromItem, toItem);
  const meta = {
    driving: { icon: '🚕', label: '驾车' },
    walking: { icon: '🚶', label: '步行' },
    transit: { icon: '🚇', label: '公交' }
  }[mode] || { icon: '🚕', label: '驾车' };
  const mapUrl = baiduLegUrl(fromItem, toItem, mode);

  if (readonly) {
    return `<div class="leg-control readonly"><span class="leg-line"></span><span class="leg-mode-label">${meta.icon} ${escapeHtml(meta.label)}</span>${mapUrl ? `<a class="leg-map-link" href="${attr(mapUrl)}">百度地图 App ↗</a>` : ''}</div>`;
  }

  return `<div class="leg-control"><span class="leg-line"></span><select data-leg-mode data-from-key="${attr(itemRouteKey(fromItem))}" data-to-key="${attr(itemRouteKey(toItem))}" aria-label="两站之间交通方式"><option value="driving" ${mode === 'driving' ? 'selected' : ''}>🚕 驾车</option><option value="walking" ${mode === 'walking' ? 'selected' : ''}>🚶 步行</option><option value="transit" ${mode === 'transit' ? 'selected' : ''}>🚇 公交</option></select>${mapUrl ? `<a class="leg-map-link" href="${attr(mapUrl)}">百度地图 App ↗</a>` : ''}</div>`;
}

function dayTimelineHtml(day, { readonly = false } = {}) {
  const items = dayDisplayItems(day);
  return items.map((item, index) => {
    const card = itemCardHtml(item, { readonly });
    return index >= items.length - 1 ? card : card + legControlHtml(day, item, items[index + 1], { readonly });
  }).join('');
}

function inlineExpenseHtml(item, { readonly = false } = {}) {
  const expenses = itemExpenses(item);
  if (!expenses.length && readonly) return '';
  const currency = state.current?.trip?.currency || 'CNY';
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const rows = expenses.map(expense => `
    <button class="inline-expense-row ${expense.paid ? 'paid' : ''}" type="button"
      ${readonly ? 'disabled' : `data-edit-expense="${attr(expense.id)}" data-expense-item="${attr(item.id)}"`}>
      <span>${escapeHtml(expense.category)} · ${escapeHtml(expense.title)}</span>
      <strong>${escapeHtml(formatMoney(expense.amount, currency))}</strong>
      <em>${expense.paid ? '已支付' : '未支付'}</em>
    </button>
  `).join('');
  return `
    <div class="inline-expenses">
      <div class="inline-expense-head">
        <span>费用${expenses.length ? ` · ${escapeHtml(formatMoney(total, currency))}` : ''}</span>
        ${readonly ? '' : `<button class="card-action" type="button" data-add-expense="${attr(item.id)}">＋费用</button>`}
      </div>
      ${rows}
    </div>
  `;
}

function tripExpenseSummaryHtml() {
  const expenses = state.current?.expenses || [];
  const trip = state.current?.trip || {};
  const currency = trip.currency || 'CNY';
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const budget = Number(trip.budget_total || 0);
  const unlinked = expenses.filter(expense => !expense.item_id);
  if (!budget && !expenses.length) return '';

  return `
    <section class="trip-expense-summary">
      <div><span>预算</span><strong>${budget ? escapeHtml(formatMoney(budget, currency)) : '未设置'}</strong></div>
      <div><span>已记录</span><strong>${escapeHtml(formatMoney(total, currency))}</strong></div>
      ${unlinked.length ? `
        <div class="unlinked-expenses">
          <span>未关联费用</span>
          ${unlinked.map(expense => `<button type="button" data-unlinked-expense="${attr(expense.id)}">${escapeHtml(expense.title)} · ${escapeHtml(formatMoney(expense.amount, currency))}</button>`).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

async function bindItineraryActions(day) {
  el.main.querySelectorAll('[data-leg-mode]').forEach(select => {
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        const result = await api(`/api/days/${day.id}/leg-mode`, {
          method: 'PUT',
          body: JSON.stringify({
            fromKey: select.dataset.fromKey,
            toKey: select.dataset.toKey,
            mode: select.value
          })
        });
        day.leg_modes = result.legModes || {};
        renderItinerary();
      } catch (error) {
        showToast(error.message, 'error');
        select.disabled = false;
      }
    });
  });

  el.main.querySelectorAll('[data-add-expense]').forEach(button => {
    button.addEventListener('click', () => {
      const item = tripItemById(button.dataset.addExpense);
      if (item) openExpenseForm(null, item);
    });
  });

  el.main.querySelectorAll('[data-edit-expense]').forEach(button => {
    button.addEventListener('click', () => {
      const expense = (state.current.expenses || []).find(value => String(value.id) === button.dataset.editExpense);
      const item = tripItemById(button.dataset.expenseItem);
      if (expense) openExpenseForm(expense, item || null);
    });
  });

  el.main.querySelectorAll('[data-unlinked-expense]').forEach(button => {
    button.addEventListener('click', () => {
      const expense = (state.current.expenses || []).find(value => String(value.id) === button.dataset.unlinkedExpense);
      if (expense) openExpenseForm(expense, null);
    });
  });
}

function renderSharedTrip() {
  const { trip, days } = state.current;
  el.topbarTitle.textContent = '只读行程';
  el.backHome.classList.add('hidden');
  el.bottomNav.classList.add('hidden');

  el.main.innerHTML = `
    <section class="shared-trip-head">
      <span class="readonly-badge">只读分享</span>
      <h1>${escapeHtml(trip.title)}</h1>
      <div>${escapeHtml([trip.destination, formatRange(trip.start_date, trip.end_date)].filter(Boolean).join(' · '))}</div>
      ${trip.notes ? `<p>${escapeHtml(trip.notes)}</p>` : ''}
    </section>
    <div class="shared-days">
      ${days.map(day => `
        <section class="shared-day">
          <div class="section-head">
            <div>
              <h2>D${dayNumber(day.day_date, trip.start_date)} · ${escapeHtml(formatDate(day.day_date))}</h2>
              <div class="section-subtitle">${escapeHtml(day.title || weekday(day.day_date))}</div>
            </div>
            ${baiduDayRouteUrl(day) ? `<a class="button ghost small map-button" href="${attr(baiduDayRouteUrl(day))}">🗺 全日路线</a>` : ''}
          </div>
          <div class="timeline">
            ${dayDisplayItems(day).length ? dayTimelineHtml(day, { readonly: true }) : '<div class="empty-state"><strong>这一天暂无安排</strong></div>'}
          </div>
        </section>
      `).join('')}
    </div>
  `;
  bindReferenceActions();
}

function shareManagerHtml(shares = []) {
  return `
    <div class="stack">
      <div class="share-help">生成的链接无需登录，只能查看行程。参考链接、图片和地图仍可点击；费用、待办和确认号不会公开。</div>
      <button id="create-share-link" class="button primary full" type="button">生成只读分享链接</button>
      <div id="new-share-result"></div>
      <div class="share-list">
        ${shares.length ? shares.map(share => `
          <div class="share-row">
            <div><strong>已启用分享</strong><span>${escapeHtml(new Date(share.created_at).toLocaleString())}</span></div>
            <button class="button danger small" type="button" data-revoke-share="${attr(share.id)}">停用</button>
          </div>
        `).join('') : '<div class="image-preview-empty">当前没有有效分享链接</div>'}
      </div>
    </div>
  `;
}

async function openShareManager() {
  try {
    const tripId = state.current.trip.id;
    const shares = await api(`/api/trips/${tripId}/shares`);
    openSheet('只读分享', shareManagerHtml(shares), async () => {});

    el.sheetForm.querySelectorAll('[data-revoke-share]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await api(`/api/shares/${button.dataset.revokeShare}`, { method: 'DELETE' });
          button.closest('.share-row')?.remove();
          showToast('分享链接已停用');
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });

    el.sheetForm.querySelector('#create-share-link')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const created = await api(`/api/trips/${tripId}/shares`, { method: 'POST', body: JSON.stringify({}) });
        const url = `${window.location.origin}${created.path}`;
        const result = el.sheetForm.querySelector('#new-share-result');
        result.innerHTML = `<div class="share-created"><input readonly value="${attr(url)}" /><button id="copy-share-link" class="button ghost small" type="button">复制</button></div>`;
        result.querySelector('#copy-share-link')?.addEventListener('click', async () => {
          await copyText(url);
          showToast('分享链接已复制');
        });
        showToast('只读分享链接已生成');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function referenceEditorRowHtml(ref = {}) {
  const autoTitle = ref.autoTitle || '';
  return `
    <div class="reference-editor-row">
      <div class="reference-editor-fields">
        <div class="reference-editor-auto">
          <span>自动标题</span>
          <strong data-reference-auto-label>${escapeHtml(autoTitle || '尚未提取')}</strong>
        </div>
        <input name="refTitle" maxlength="180" value="${attr(ref.customTitle || '')}" placeholder="自定义展示标题（可选，优先显示）" />
        <input name="refValue" maxlength="3000" value="${attr(ref.value || '')}" data-initial-value="${attr(ref.value || '')}" placeholder="粘贴小红书 / 抖音 / 点评 / 微信等链接" />
        <input name="refAutoTitle" type="hidden" value="${attr(autoTitle)}" />
      </div>
      <button class="reference-remove" type="button" data-remove-reference aria-label="删除参考入口">×</button>
    </div>
  `;
}

function referenceEditorHtml(refs = []) {
  const list = refs.length ? refs : [{ customTitle: '', autoTitle: '', value: '' }];
  return `
    <div class="reference-editor" data-reference-editor>
      <div class="reference-editor-list" data-reference-list>
        ${list.map(referenceEditorRowHtml).join('')}
      </div>
      <button id="add-reference-row" class="button ghost small" type="button">＋ 添加参考入口</button>
      <p class="form-help">自定义标题优先显示；留空时才自动抓取。已提取的自动标题会缓存，后续保存不会重复访问第三方网站。</p>
    </div>
  `;
}

function collectReferenceEntries(form) {
  const customTitles = form.getAll('refTitle');
  const autoTitles = form.getAll('refAutoTitle');
  const values = form.getAll('refValue');
  const refs = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] || '').trim();
    if (!value) continue;
    refs.push({
      value,
      customTitle: String(customTitles[index] || '').trim(),
      autoTitle: String(autoTitles[index] || '').trim()
    });
    if (refs.length >= 12) break;
  }
  return refs;
}

function bindReferenceEditor() {
  const editor = el.sheetForm.querySelector('[data-reference-editor]');
  if (!editor) return;
  const list = editor.querySelector('[data-reference-list]');

  const syncButtons = () => {
    const rows = editor.querySelectorAll('.reference-editor-row');
    rows.forEach(row => {
      const button = row.querySelector('[data-remove-reference]');
      if (button) button.disabled = rows.length <= 1;
    });
  };

  editor.addEventListener('input', event => {
    const valueInput = event.target.closest('[name="refValue"]');
    if (!valueInput) return;
    const row = valueInput.closest('.reference-editor-row');
    const autoInput = row?.querySelector('[name="refAutoTitle"]');
    const autoLabel = row?.querySelector('[data-reference-auto-label]');
    if (valueInput.value.trim() !== String(valueInput.dataset.initialValue || '').trim()) {
      if (autoInput) autoInput.value = '';
      if (autoLabel) autoLabel.textContent = '链接已修改，保存后重新提取';
    }
  });

  editor.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-reference]');
    if (remove) {
      remove.closest('.reference-editor-row')?.remove();
      syncButtons();
      return;
    }
    if (event.target.closest('#add-reference-row')) {
      if (editor.querySelectorAll('.reference-editor-row').length >= 12) {
        showToast('最多 12 个参考入口', 'error');
        return;
      }
      list.insertAdjacentHTML('beforeend', referenceEditorRowHtml());
      syncButtons();
    }
  });
  syncButtons();
}
