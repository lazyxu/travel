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
      el.main.innerHTML = emptyStateHtml({ icon: 'link', title: '分享链接不可用', detail: error.message });
      return;
    }
    showLogin();
  }
})();
