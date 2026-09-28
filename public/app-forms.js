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
      notes: form.get('notes')
    };
    if (trip) {
      await api(`/api/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      closeSheet();
      await openTrip(trip.id);
      showToast('旅行已更新');
    } else {
      const created = await api('/api/trips', { method: 'POST', body: JSON.stringify(payload) });
      closeSheet();
      state.current = created;
      state.currentDayId = created.days[0]?.id || null;
      state.tab = 'itinerary';
      el.backHome.classList.remove('hidden');
      el.bottomNav.classList.remove('hidden');
      renderCurrent();
      showToast('旅行已创建');
    }
  });
  if (trip) {
    el.sheetForm.querySelector('#delete-trip').addEventListener('click', async () => {
      if (!confirm(`确定删除“${trip.title}”及全部行程和待办吗？`)) return;
      try {
        await api(`/api/trips/${trip.id}`, { method: 'DELETE' });
        closeSheet();
        await loadTrips();
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

function itemFormHtml(item = {}) {
  return `
    <div class="stack">
      <div class="field-grid">
        <label class="field"><span>时间</span><input name="itemTime" type="time" value="${attr(item.item_time || '')}" /></label>
        <label class="field"><span>类型</span>
          <select name="category">
            ${['交通','景点','餐饮','住宿','购物','其他'].map(category => `<option value="${category}" ${item.category === category ? 'selected' : ''}>${categoryMeta(category).icon} ${category}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="field"><span>行程标题 *</span><input name="title" required maxlength="160" value="${attr(item.title || '')}" placeholder="例如：清水寺" /></label>
      <label class="field"><span>地点</span><input name="location" maxlength="240" value="${attr(item.location || '')}" placeholder="地址 / 集合点 / 车站" /></label>
      <label class="field"><span>备注</span><textarea name="notes" maxlength="5000" placeholder="预约信息、交通方式、必点菜等">${escapeHtml(item.notes || '')}</textarea></label>
      <label class="field"><span>小红书链接</span><input name="xhsUrl" inputmode="url" value="${attr(item.xhs_url || '')}" placeholder="可直接粘贴小红书分享文案或链接" /></label>
      <label class="field"><span>大众点评链接</span><input name="dianpingUrl" inputmode="url" value="${attr(item.dianping_url || '')}" placeholder="可直接粘贴点评链接" /></label>
      <label class="field">
        <span>行程图片</span>
        <textarea name="imageUrls" class="image-url-input" maxlength="24000" placeholder="粘贴图片 URL，每行一张；最多 12 张">${escapeHtml((item.image_urls || []).join('\n'))}</textarea>
      </label>
      <div class="image-preview" data-image-preview>${imagePreviewHtml(item.image_urls || [])}</div>
      <p class="form-help">小红书/点评保存时会提取第一个链接；图片支持 http/https 图片 URL，可一次粘贴多行，最多 12 张。</p>
      <div class="form-actions">
        ${item.id ? '<button id="delete-item" class="button danger" type="button">删除</button>' : ''}
        <button class="button primary" type="submit">保存</button>
      </div>
    </div>
  `;
}

function openItemForm(day, item = null) {
  openSheet(item ? '编辑行程' : '添加行程', itemFormHtml(item || {}), async form => {
    const payload = {
      itemTime: form.get('itemTime'),
      category: form.get('category'),
      title: form.get('title'),
      location: form.get('location'),
      notes: form.get('notes'),
      xhsUrl: extractUrl(form.get('xhsUrl')),
      dianpingUrl: extractUrl(form.get('dianpingUrl')),
      imageUrls: extractUrls(form.get('imageUrls'), 12)
    };
    if (item) await api(`/api/items/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api(`/api/days/${day.id}/items`, { method: 'POST', body: JSON.stringify(payload) });
    closeSheet();
    await refreshCurrent();
    showToast(item ? '行程已更新' : '行程已添加');
  });
  const imageInput = el.sheetForm.querySelector('[name="imageUrls"]');
  const imagePreview = el.sheetForm.querySelector('[data-image-preview]');
  if (imageInput && imagePreview) {
    const renderImagePreview = () => {
      imagePreview.innerHTML = imagePreviewHtml(extractUrls(imageInput.value, 12));
    };
    imageInput.addEventListener('input', renderImagePreview);
    imageInput.addEventListener('paste', () => setTimeout(renderImagePreview, 0));
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
    await loadTrips();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

el.backHome.addEventListener('click', async () => {
  await loadTrips();
});

el.logout.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  showLogin();
});

el.bottomNav.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    state.tab = button.dataset.tab;
    renderCurrent();
  });
});

el.sheetClose.addEventListener('click', closeSheet);
el.sheetBackdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !el.sheet.classList.contains('hidden')) closeSheet();
});

(async function boot() {
  try {
    const auth = await api('/api/auth');
    if (!auth.authenticated) return showLogin();
    showApp();
    await loadTrips();
  } catch (error) {
    showToast(error.message, 'error');
    showLogin();
  }
})();
