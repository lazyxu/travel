function legControlHtml(day, fromItem, toItem, { readonly = false } = {}) {
  const mode = legMode(day, fromItem, toItem);
  const modes = {
    driving: { icon: '🚕', label: '驾车' },
    walking: { icon: '🚶', label: '步行' },
    transit: { icon: '🚇', label: '公交' }
  };
  const meta = modes[mode] || modes.driving;
  const mapUrl = baiduLegUrl(fromItem, toItem, mode);
  const fromKey = itemRouteKey(fromItem);
  const toKey = itemRouteKey(toItem);

  if (readonly) {
    return `
      <div class="leg-control readonly">
        <span class="leg-line"></span>
        <span class="leg-route-chip static">${meta.icon}<strong>${escapeHtml(meta.label)}</strong></span>
        ${mapUrl ? `<a class="leg-map-link" href="${attr(mapUrl)}" aria-label="在百度地图打开这段路线">路线 ↗</a>` : '<span class="leg-map-unavailable">未定位</span>'}
      </div>
    `;
  }

  return `
    <div class="leg-control" data-leg-drop data-from-key="${attr(fromKey)}" data-to-key="${attr(toKey)}">
      <span class="leg-line"></span>
      <details class="leg-mode-menu">
        <summary class="leg-route-chip" aria-label="修改交通方式">${meta.icon}<strong>${escapeHtml(meta.label)}</strong><span>⌄</span></summary>
        <div class="leg-mode-options">
          ${Object.entries(modes).map(([value, option]) => `
            <button type="button"
                    class="${value === mode ? 'active' : ''}"
                    data-leg-mode-value="${value}"
                    data-from-key="${attr(fromKey)}"
                    data-to-key="${attr(toKey)}">
              <span>${option.icon}</span><strong>${escapeHtml(option.label)}</strong>${value === mode ? '<em>当前</em>' : ''}
            </button>
          `).join('')}
        </div>
      </details>
      ${mapUrl ? `<a class="leg-map-link" href="${attr(mapUrl)}" aria-label="在百度地图打开这段路线">路线 ↗</a>` : '<span class="leg-map-unavailable">未定位</span>'}
    </div>
  `;
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
  if (!expenses.length) return '';
  const currency = state.current?.trip?.currency || 'CNY';
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const paidCount = expenses.filter(expense => expense.paid).length;
  return `
    <div class="inline-expense-summary">
      <span>${escapeHtml(formatMoney(total, currency))}</span>
      <em>${expenses.length} 笔${paidCount ? ` · 已付 ${paidCount}` : ''}</em>
    </div>
  `;
}

function tripExpenseSummaryHtml() {
  const expenses = state.current?.expenses || [];
  const trip = state.current?.trip || {};
  const currency = trip.currency || 'CNY';
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const budget = Number(trip.budget_total || 0);
  const remaining = budget - total;
  const overBudget = budget > 0 && remaining < 0;
  const usedPercent = budget > 0 ? Math.max(0, Math.round((total / budget) * 100)) : 0;
  const progressPercent = Math.min(100, usedPercent);
  const unlinked = expenses.filter(expense => !expense.item_id);
  if (!budget && !expenses.length) return '';

  return `
    <section class="trip-expense-summary ${overBudget ? 'over-budget' : ''}">
      <div class="expense-summary-stat"><span>预算</span><strong>${budget ? escapeHtml(formatMoney(budget, currency)) : '未设置'}</strong></div>
      <div class="expense-summary-stat"><span>已记录</span><strong>${escapeHtml(formatMoney(total, currency))}</strong></div>
      ${budget ? `<div class="expense-summary-stat"><span>${overBudget ? '超出' : '剩余'}</span><strong>${escapeHtml(formatMoney(Math.abs(remaining), currency))}</strong></div>` : ''}
      ${budget ? `
        <div class="expense-summary-progress" aria-label="预算使用 ${usedPercent}%">
          <div class="expense-summary-progress-copy"><span>预算使用</span><strong>${usedPercent}%</strong></div>
          <div class="expense-summary-track"><i style="width: ${progressPercent}%"></i></div>
        </div>
      ` : ''}
      ${unlinked.length ? `
        <div class="unlinked-expenses">
          <span>未关联费用</span>
          ${unlinked.map(expense => `<button type="button" data-unlinked-expense="${attr(expense.id)}">${escapeHtml(expense.title)} · ${escapeHtml(formatMoney(expense.amount, currency))}</button>`).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

async function bindDisclosureMenus(root = el.main) {
  const menus = [...root.querySelectorAll('.item-action-menu, .leg-mode-menu, .day-action-menu, .trip-action-menu')];
  menus.forEach(menu => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      menus.forEach(other => {
        if (other !== menu) other.removeAttribute('open');
      });
    });
    menu.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => menu.removeAttribute('open'));
    });
  });

  if (!root.dataset.disclosureOutsideBound) {
    root.dataset.disclosureOutsideBound = '1';
    root.addEventListener('click', event => {
      root.querySelectorAll('.item-action-menu[open], .leg-mode-menu[open], .day-action-menu[open], .trip-action-menu[open]').forEach(menu => {
        if (!menu.contains(event.target)) menu.removeAttribute('open');
      });
    });
  }
}

function bindItineraryActions(day) {
  el.main.querySelectorAll('[data-leg-mode-value]').forEach(button => {
    button.addEventListener('click', async () => {
      const group = button.closest('[data-leg-drop]');
      group?.querySelectorAll('[data-leg-mode-value]').forEach(node => { node.disabled = true; });
      try {
        const result = await api(`/api/days/${day.id}/leg-mode`, {
          method: 'PUT',
          body: JSON.stringify({
            fromKey: button.dataset.fromKey,
            toKey: button.dataset.toKey,
            mode: button.dataset.legModeValue
          })
        });
        day.leg_modes = result.legModes || {};
        renderItinerary();
      } catch (error) {
        showToast(error.message, 'error');
        group?.querySelectorAll('[data-leg-mode-value]').forEach(node => { node.disabled = false; });
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

function ensureImageViewer() {
  let viewer = document.querySelector('#image-viewer');
  if (viewer) return viewer;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="image-viewer" class="image-viewer hidden" role="dialog" aria-modal="true" aria-label="图片预览">
      <button class="image-viewer-close" type="button" data-image-viewer-close aria-label="关闭">×</button>
      <button class="image-viewer-nav prev" type="button" data-image-viewer-prev aria-label="上一张">‹</button>
      <div class="image-viewer-stage" data-image-viewer-stage>
        <img data-image-viewer-img alt="" />
      </div>
      <button class="image-viewer-nav next" type="button" data-image-viewer-next aria-label="下一张">›</button>
      <div class="image-viewer-counter" data-image-viewer-counter></div>
    </div>
  `);
  viewer = document.querySelector('#image-viewer');
  viewer.querySelector('[data-image-viewer-close]')?.addEventListener('click', closeImageViewer);
  viewer.addEventListener('click', event => {
    if (event.target === viewer) closeImageViewer();
  });
  document.addEventListener('keydown', event => {
    if (viewer.classList.contains('hidden')) return;
    if (event.key === 'Escape') closeImageViewer();
    if (event.key === 'ArrowLeft') imageViewerStep(-1);
    if (event.key === 'ArrowRight') imageViewerStep(1);
  });
  return viewer;
}

const imageViewerState = { images: [], index: 0, title: '' };

function renderImageViewer() {
  const viewer = ensureImageViewer();
  const image = viewer.querySelector('[data-image-viewer-img]');
  const counter = viewer.querySelector('[data-image-viewer-counter]');
  const url = imageViewerState.images[imageViewerState.index] || '';
  image.src = url;
  image.alt = `${imageViewerState.title || '行程图片'} ${imageViewerState.index + 1}`;
  counter.textContent = `${imageViewerState.index + 1} / ${imageViewerState.images.length}`;
  viewer.querySelector('[data-image-viewer-prev]').classList.toggle('hidden', imageViewerState.images.length <= 1);
  viewer.querySelector('[data-image-viewer-next]').classList.toggle('hidden', imageViewerState.images.length <= 1);
}

function imageViewerStep(delta) {
  const total = imageViewerState.images.length;
  if (total <= 1) return;
  imageViewerState.index = (imageViewerState.index + delta + total) % total;
  renderImageViewer();
}

function openImageViewer(images, index = 0, title = '') {
  imageViewerState.images = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!imageViewerState.images.length) return;
  imageViewerState.index = Math.max(0, Math.min(Number(index) || 0, imageViewerState.images.length - 1));
  imageViewerState.title = title || '';
  const viewer = ensureImageViewer();
  viewer.classList.remove('hidden');
  document.body.classList.add('image-viewer-open');
  syncDialogBodyLock();
  renderImageViewer();
  focusDialogInitial(viewer, viewer.querySelector('[data-image-viewer-close]'));

  const stage = viewer.querySelector('[data-image-viewer-stage]');
  let startX = null;
  stage.onpointerdown = event => {
    startX = event.clientX;
    try { stage.setPointerCapture?.(event.pointerId); } catch {}
  };
  stage.onpointerup = event => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    startX = null;
    if (Math.abs(delta) >= 45) imageViewerStep(delta > 0 ? -1 : 1);
  };
  viewer.querySelector('[data-image-viewer-prev]').onclick = () => imageViewerStep(-1);
  viewer.querySelector('[data-image-viewer-next]').onclick = () => imageViewerStep(1);
}

function closeImageViewer() {
  const viewer = document.querySelector('#image-viewer');
  if (!viewer || viewer.classList.contains('hidden')) return;
  viewer.classList.add('hidden');
  viewer.querySelector('[data-image-viewer-img]')?.removeAttribute('src');
  document.body.classList.remove('image-viewer-open');
  syncDialogBodyLock();
  restoreDialogFocus(viewer);
}

function bindImageViewerActions() {
  el.main.querySelectorAll('[data-gallery-item]').forEach(button => {
    button.addEventListener('click', () => {
      const item = tripItemById(button.dataset.galleryItem);
      if (!item) return;
      openImageViewer(item.image_urls || [], Number(button.dataset.galleryIndex || 0), item.title || '');
    });
  });
}

function renderSharedTrip() {
  const { trip, days } = state.current;
  const status = tripStatusMeta(trip);
  el.topbarTitle.textContent = '只读行程';
  el.backHome.classList.add('hidden');
  el.bottomNav.classList.add('hidden');

  el.main.innerHTML = `
    <section class="shared-trip-head shared-trip-head-${status.kind}">
      <div class="shared-trip-badges">
        <span class="readonly-badge">只读分享</span>
        <span class="trip-status trip-status-${status.kind}">${escapeHtml(status.label)}</span>
      </div>
      <h1>${escapeHtml(trip.title)}</h1>
      <div class="shared-trip-meta">${escapeHtml([trip.destination, formatRange(trip.start_date, trip.end_date)].filter(Boolean).join(' · '))}</div>
      ${status.kind === 'active' && status.progress !== null ? `<div class="trip-progress shared-trip-progress" aria-label="旅行进度 ${status.progress}%"><i style="width: ${status.progress}%"></i></div>` : ''}
      ${trip.notes ? `<p>${escapeHtml(trip.notes)}</p>` : ''}
    </section>
    <div class="shared-days">
      ${days.map(day => {
        const isToday = String(day.day_date || '').slice(0, 10) === localDateKey();
        return `
          <section class="shared-day ${isToday ? 'today' : ''}">
            <div class="section-head shared-day-head">
              <div>
                <div class="shared-day-title-row">
                  <h2>D${dayNumber(day.day_date, trip.start_date)} · ${escapeHtml(formatDate(day.day_date))}</h2>
                  ${isToday ? '<span class="shared-today-badge">今天</span>' : ''}
                </div>
                <div class="section-subtitle">${escapeHtml(day.title || weekday(day.day_date))}</div>
              </div>
              ${baiduDayRouteUrl(day) ? `<a class="button ghost small map-button" href="${attr(baiduDayRouteUrl(day))}">${escapeHtml(dayRouteLabel(day))}</a>` : ''}
            </div>
            <div class="timeline">
              ${dayDisplayItems(day).length ? dayTimelineHtml(day, { readonly: true }) : emptyStateHtml({ icon: 'calendar', title: '这一天暂无安排' })}
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;
  bindReferenceActions();
}

function shareSettingsFieldsHtml(settings = {}) {
  const merged = {
    notes: false,
    images: true,
    links: true,
    hotelPhone: false,
    expenses: false,
    ...settings
  };
  const option = (name, label, help) => `
    <label class="share-setting-row">
      <input type="checkbox" name="${name}" ${merged[name] ? 'checked' : ''} />
      <span><strong>${label}</strong><small>${help}</small></span>
    </label>
  `;
  return `
    <div class="share-settings">
      ${option('images', '图片', '共享行程图片')}
      ${option('links', '链接', '共享小红书、点评、微信等链接')}
      ${option('notes', '备注', '共享旅行、当天、行程及费用备注')}
      ${option('hotelPhone', '酒店电话', '共享住宿记录里的联系电话')}
      ${option('expenses', '费用', '共享金额、分类及是否已支付')}
    </div>
  `;
}

function collectShareSettings() {
  return Object.fromEntries(
    ['notes', 'images', 'links', 'hotelPhone', 'expenses'].map(name => [
      name,
      Boolean(el.sheetForm.querySelector(`[name="${name}"]`)?.checked)
    ])
  );
}

function shareManagerHtml(shares = []) {
  const current = shares[0] || null;
  return `
    <div class="stack share-manager">
      <div class="share-help">
        <strong>只读分享</strong>
        <span>分享页无需登录，只能查看。确认号始终不公开。</span>
      </div>

      ${current ? `
        <div class="active-share-status">
          <div class="active-share-head"><span></span><strong>分享已开启</strong></div>
          <span>创建于 ${escapeHtml(new Date(current.created_at).toLocaleString())}</span>
          <small>服务器只保存链接 token 的哈希。若需要再次复制链接，请重新生成；旧链接会立即失效。</small>
        </div>
      ` : ''}

      <section class="share-manager-section">
        <div class="share-manager-section-head">
          <strong>分享内容</strong>
          <span>选择对方可以看到的信息</span>
        </div>
        ${shareSettingsFieldsHtml(current?.settings)}
        ${current ? '<button id="save-share-settings" class="button ghost full" type="button">保存分享内容</button>' : ''}
      </section>

      <section class="share-manager-section">
        <div class="share-manager-section-head">
          <strong>分享链接</strong>
          <span>${current ? '重新生成后，旧链接立即失效' : '生成后请立即复制保存'}</span>
        </div>
        <button id="create-share-link" class="button primary full" type="button">${current ? '重新生成分享链接' : '生成只读分享链接'}</button>
        <div id="new-share-result"></div>
      </section>

      ${current ? `
        <section class="share-danger-zone">
          <div>
            <strong>关闭分享</strong>
            <span>关闭后，当前分享链接将无法继续访问。</span>
          </div>
          <button id="disable-share-link" class="button danger small" type="button" data-share-id="${attr(current.id)}">关闭</button>
        </section>
      ` : ''}
    </div>
  `;
}

async function openShareManager() {
  try {
    const tripId = state.current.trip.id;
    let shares = await api(`/api/trips/${tripId}/shares`);
    let current = shares[0] || null;
    openSheet('只读分享', shareManagerHtml(shares), async () => {});

    const saveSettings = async () => {
      if (!current) return;
      current = await api(`/api/shares/${current.id}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ settings: collectShareSettings() })
      });
      showToast('分享设置已保存');
    };

    el.sheetForm.querySelector('#save-share-settings')?.addEventListener('click', () => {
      saveSettings().catch(error => showToast(error.message, 'error'));
    });

    el.sheetForm.querySelector('#disable-share-link')?.addEventListener('click', async event => {
      if (!await confirmAction({
        title: '关闭分享？',
        message: '关闭后，当前分享链接将立即失效，其他人将无法继续访问。',
        confirmLabel: '关闭分享'
      })) return;
      const button = event.currentTarget;
      setButtonBusy(button, true, '关闭中…');
      try {
        const id = button.dataset.shareId;
        await api(`/api/shares/${id}`, { method: 'DELETE' });
        closeSheet(true);
        showToast('分享已关闭');
      } catch (error) {
        setButtonBusy(button, false);
        showToast(error.message, 'error');
      }
    });

    el.sheetForm.querySelector('#create-share-link')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      setButtonBusy(button, true, current ? '重新生成中…' : '生成中…');
      try {
        const created = await api(`/api/trips/${tripId}/shares`, {
          method: 'POST',
          body: JSON.stringify({ settings: collectShareSettings() })
        });
        current = created;
        const url = `${window.location.origin}${created.path}`;
        const result = el.sheetForm.querySelector('#new-share-result');
        result.innerHTML = `
          <div class="share-created">
            <input readonly value="${attr(url)}" />
            <button id="copy-share-link" class="button ghost small" type="button">复制</button>
          </div>
          <div class="share-created-help">请现在保存这个链接。再次打开分享设置时不会显示明文 token。</div>
        `;

        const copyButton = result.querySelector('#copy-share-link');
        copyButton?.addEventListener('click', async () => {
          try {
            await copyText(url);
            showToast('分享链接已复制');
          } catch {
            showToast('自动复制失败，请长按或手动复制链接', 'error');
          }
        });

        let copied = false;
        try {
          await copyText(url);
          copied = true;
        } catch {}
        showToast(copied ? '分享链接已生成并复制' : '分享链接已生成，请点击复制');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setButtonBusy(button, false);
        button.textContent = current ? '重新生成分享链接' : '生成只读分享链接';
      }
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function referenceEditorRowHtml(ref = {}, index = 0) {
  const value = ref.value || ref.url || '';
  const platform = ref.platform || detectReferencePlatform(value);
  const meta = referencePlatformMeta(platform);
  const title = ref.customTitle || ref.autoTitle || meta.label;
  const autoTitle = ref.autoTitle || '';
  return `
    <div class="reference-analysis-card" data-reference-row data-reference-index="${index}">
      <input name="refTitle" type="hidden" value="${attr(ref.customTitle || '')}" />
      <input name="refAutoTitle" type="hidden" value="${attr(autoTitle)}" />
      <input name="refValue" type="hidden" value="${attr(value)}" />
      <input name="refPlatform" type="hidden" value="${attr(platform)}" />
      <input name="refAppUrl" type="hidden" value="${attr(ref.appUrl || '')}" />
      <div class="reference-analysis-icon">${meta.icon}</div>
      <div class="reference-analysis-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(meta.label)} · ${escapeHtml(value)}</span>
      </div>
      <button class="button ghost small" type="button" data-edit-reference>编辑</button>
      <button class="reference-remove" type="button" data-remove-reference aria-label="删除链接">×</button>
    </div>
  `;
}

function referenceEditorHtml(refs = []) {
  const list = Array.isArray(refs) ? refs : [];
  return `
    <div class="reference-editor" data-reference-editor>
      <div class="reference-editor-list" data-reference-list>
        ${list.length ? list.map(referenceEditorRowHtml).join('') : '<div class="reference-editor-empty" data-reference-empty>还没有链接</div>'}
      </div>
      <button class="button ghost small" type="button" data-add-reference>＋ 添加链接</button>
      <p class="form-help">每个链接都会先自动分析平台和标题，再由你确认或修改；百度地图链接会自动识别为位置。</p>
    </div>
  `;
}

function collectReferenceEntries(form) {
  const customTitles = form.getAll('refTitle');
  const autoTitles = form.getAll('refAutoTitle');
  const values = form.getAll('refValue');
  const platforms = form.getAll('refPlatform');
  const appUrls = form.getAll('refAppUrl');
  const refs = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] || '').trim();
    if (!value) continue;
    refs.push({
      value,
      customTitle: String(customTitles[index] || '').trim(),
      autoTitle: String(autoTitles[index] || '').trim(),
      platform: String(platforms[index] || '').trim(),
      appUrl: String(appUrls[index] || '').trim()
    });
    if (refs.length >= 12) break;
  }
  return refs;
}

function imageEditorCardHtml(url, index) {
  return `
    <div class="image-editor-card" data-image-index="${index}">
      <img src="${attr(url)}" alt="行程图片 ${index + 1}" loading="lazy" decoding="async" />
      <button class="image-editor-drag" type="button" data-image-drag aria-label="拖动图片排序">⋮⋮</button>
      <button class="image-editor-remove" type="button" data-image-remove aria-label="删除图片">×</button>
    </div>
  `;
}

function imageEditorHtml(urls = []) {
  const images = Array.isArray(urls) ? urls : [];
  return `
    <div class="image-editor" data-image-editor>
      <input name="imageUrls" type="hidden" value="${attr(images.join('\\n'))}" />
      <div class="image-editor-toolbar">
        <label class="button ghost small image-upload-button">
          📷 从相册添加
          <input name="imageFiles" type="file" accept="image/*" multiple hidden />
        </label>
        <div class="image-remote-row">
          <input name="imageRemoteUrl" inputmode="url" placeholder="网络图片 URL" />
          <button class="button ghost small" type="button" data-add-image-url>添加</button>
        </div>
      </div>
      <div class="image-upload-status" data-image-upload-status>最多 12 张；拖动缩略图可排序</div>
      <div class="image-editor-grid" data-image-editor-grid>
        ${images.length ? images.map(imageEditorCardHtml).join('') : '<div class="image-preview-empty">暂无图片</div>'}
      </div>
    </div>
  `;
}
