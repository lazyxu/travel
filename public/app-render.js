function renderHome() {
  state.current = null;
  state.currentDayId = null;
  el.topbarTitle.textContent = '旅行计划';
  el.backHome.classList.add('hidden');
  el.bottomNav.classList.add('hidden');

  el.main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>去哪里？</h1>
        <p>${state.trips.length ? `已经规划 ${state.trips.length} 段旅程` : '先创建一段新的旅行'}</p>
      </div>
      <button id="create-trip" class="button primary small" type="button">＋ 新旅行</button>
    </div>
    <div class="trip-grid">
      ${state.trips.map(trip => `
        <article class="trip-card" data-trip-id="${attr(trip.id)}">
          <h3>${escapeHtml(trip.title)}</h3>
          <div class="trip-meta">${trip.destination ? `${escapeHtml(trip.destination)} · ` : ''}${escapeHtml(formatRange(trip.start_date, trip.end_date))}</div>
          <div class="trip-stats">
            <span class="pill">⌁ ${trip.item_count} 项行程</span>
            <span class="pill">✓ ${trip.todo_count} 项待办</span>
          </div>
        </article>
      `).join('')}
    </div>
    ${state.trips.length ? '' : `
      <div class="empty-state">
        <div class="empty-icon">⌁</div>
        <strong>还没有旅行计划</strong>
        <div>创建后可以按天安排行程、保存小红书/大众点评链接和准备待办。</div>
      </div>
    `}
  `;

  el.main.querySelector('#create-trip').addEventListener('click', () => openTripForm());
  el.main.querySelectorAll('[data-trip-id]').forEach(card => {
    card.addEventListener('click', () => navigate(`/trips/${card.dataset.tripId}`));
  });
}

async function openTrip(id) {
  await navigate(`/trips/${id}`);
}

async function refreshCurrent() {
  if (!state.current?.trip?.id) return;
  const id = state.current.trip.id;
  state.current = await api(`/api/trips/${id}`);
  if (state.tab === 'itinerary' && !state.current.days.some(day => String(day.id) === String(state.currentDayId))) {
    state.currentDayId = state.current.days[0]?.id || null;
  }
  syncCurrentUrl({ replace: true });
  renderCurrent();
}

function renderCurrent() {
  if (!state.current) return renderHome();
  el.topbarTitle.textContent = state.tab === 'today'
    ? '今天'
    : state.tab === 'todos'
      ? '旅行待办'
      : state.tab === 'expenses'
        ? '费用预算'
        : '每日行程';
  el.bottomNav.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
  });
  if (state.tab === 'today') renderToday();
  else if (state.tab === 'todos') renderTodos();
  else if (state.tab === 'expenses') renderExpenses();
  else renderItinerary();
}

function heroHtml() {
  const trip = state.current.trip;
  return `
    <section class="trip-summary">
      <div class="trip-summary-copy">
        <strong class="trip-summary-title">${escapeHtml(trip.title)}</strong>
        <div class="trip-summary-meta">${escapeHtml([trip.destination, formatRange(trip.start_date, trip.end_date)].filter(Boolean).join(' · '))}</div>
        ${trip.notes ? `<div class="trip-summary-notes">${escapeHtml(trip.notes)}</div>` : ''}
      </div>
      <button id="edit-trip" class="button ghost small" type="button">编辑</button>
    </section>
  `;
}

function renderItinerary() {
  const { trip, days } = state.current;
  const day = days.find(item => String(item.id) === String(state.currentDayId)) || days[0];
  if (day) state.currentDayId = day.id;

  el.main.innerHTML = `
    ${heroHtml()}
    <div class="day-tabs">
      ${days.map(item => `
        <button class="day-tab ${String(item.id) === String(state.currentDayId) ? 'active' : ''}" data-day-id="${attr(item.id)}" type="button">
          <strong>D${dayNumber(item.day_date, trip.start_date)} · ${escapeHtml(formatDate(item.day_date))}</strong>
          <span>${escapeHtml(item.title || weekday(item.day_date))}</span>
        </button>
      `).join('')}
    </div>
    ${day ? `
      <div class="section-head">
        <div>
          <h2>${escapeHtml(day.title || `${formatDate(day.day_date)} ${weekday(day.day_date)}`)}</h2>
          ${day.notes ? `<div class="section-subtitle">${escapeHtml(day.notes)}</div>` : ''}
        </div>
        <div class="section-actions">
          <label class="route-mode-control" title="百度地图路线模式">
            <select id="route-mode-select" aria-label="路线模式">
              ${Object.entries(ROUTE_MODE_META).map(([value, meta]) => `<option value="${value}" ${(day.route_mode || 'driving') === value ? 'selected' : ''}>${meta.icon} ${meta.label}</option>`).join('')}
            </select>
          </label>
          ${baiduDayRouteUrl(day) ? `<a class="button ghost small map-button" href="${attr(baiduDayRouteUrl(day))}" target="_blank" rel="noopener noreferrer">🗺 地图路线</a>` : ''}
          <button id="edit-day" class="button ghost small" type="button">编辑当天</button>
        </div>
      </div>
      <div class="timeline">
        ${day.items.length ? day.items.map(item => itemCardHtml(item)).join('') : `
          <div class="empty-state">
            <div class="empty-icon">＋</div>
            <strong>这一天还没有安排</strong>
            <div>添加景点、餐厅、交通或住宿，并把参考链接和图片一起保存。</div>
          </div>
        `}
      </div>
      <button id="add-item" class="fab" type="button" aria-label="添加行程">＋</button>
    ` : '<div class="empty-state"><strong>暂无日期</strong></div>'}
  `;

  bindHero();
  bindReferenceActions();
  el.main.querySelectorAll('[data-day-id]').forEach(button => {
    button.addEventListener('click', () => {
      navigate(`/trips/${state.current.trip.id}/day/${button.dataset.dayId}`);
    });
  });
  if (day) {
    el.main.querySelector('#edit-day').addEventListener('click', () => openDayForm(day));
    el.main.querySelector('#add-item').addEventListener('click', () => openItemForm(day));
    const routeModeSelect = el.main.querySelector('#route-mode-select');
    routeModeSelect?.addEventListener('change', async () => {
      routeModeSelect.disabled = true;
      try {
        await api(`/api/days/${day.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: day.title || '',
            notes: day.notes || '',
            routeMode: routeModeSelect.value
          })
        });
        day.route_mode = routeModeSelect.value;
        renderItinerary();
      } catch (error) {
        showToast(error.message, 'error');
        routeModeSelect.disabled = false;
      }
    });
    bindItinerarySorting(day);
    el.main.querySelectorAll('[data-edit-item]').forEach(button => {
      button.addEventListener('click', () => {
        const item = day.items.find(x => String(x.id) === button.dataset.editItem);
        if (item) openItemForm(day, item);
      });
    });
  }
}

function structuredDetailsHtml(item) {
  const d = item?.details || {};
  if (!d.kind) return '';

  if (d.kind === 'lodging') {
    return `
      <div class="structured-card lodging">
        <div class="structured-title">🏨 ${escapeHtml(d.hotelName || item.title || '住宿')}</div>
        <div class="structured-grid">
          ${(d.checkInDate || d.checkInTime) ? `<div><span>入住</span><strong>${escapeHtml([d.checkInDate, d.checkInTime].filter(Boolean).join(' '))}</strong></div>` : ''}
          ${(d.checkOutDate || d.checkOutTime) ? `<div><span>退房</span><strong>${escapeHtml([d.checkOutDate, d.checkOutTime].filter(Boolean).join(' '))}</strong></div>` : ''}
          ${d.roomType ? `<div><span>房型</span><strong>${escapeHtml(d.roomType)}</strong></div>` : ''}
          ${d.bookingPlatform ? `<div><span>预订</span><strong>${escapeHtml(d.bookingPlatform)}</strong></div>` : ''}
          ${d.confirmationNo ? `<div><span>确认号</span><strong>${escapeHtml(d.confirmationNo)}</strong></div>` : ''}
          ${d.phone ? `<div><span>电话</span><strong>${escapeHtml(d.phone)}</strong></div>` : ''}
        </div>
      </div>
    `;
  }

  if (d.kind === 'flight') {
    return `
      <div class="structured-card flight">
        <div class="structured-title">✈️ ${escapeHtml([d.airline, d.flightNo].filter(Boolean).join(' ') || item.title)}</div>
        <div class="transport-route">
          <div><strong>${escapeHtml(d.departureAirport || '出发')}</strong><span>${escapeHtml([d.departureDate, d.departureTime, d.departureTerminal].filter(Boolean).join(' · '))}</span></div>
          <div class="transport-arrow">→</div>
          <div><strong>${escapeHtml(d.arrivalAirport || '到达')}</strong><span>${escapeHtml([d.arrivalDate, d.arrivalTime, d.arrivalTerminal].filter(Boolean).join(' · '))}</span></div>
        </div>
        ${(d.seat || d.confirmationNo) ? `<div class="structured-foot">${d.seat ? `座位 ${escapeHtml(d.seat)}` : ''}${d.seat && d.confirmationNo ? ' · ' : ''}${d.confirmationNo ? `确认号 ${escapeHtml(d.confirmationNo)}` : ''}</div>` : ''}
      </div>
    `;
  }

  if (d.kind === 'train') {
    return `
      <div class="structured-card train">
        <div class="structured-title">🚄 ${escapeHtml(d.trainNo || item.title)}</div>
        <div class="transport-route">
          <div><strong>${escapeHtml(d.departureStation || '出发')}</strong><span>${escapeHtml([d.departureDate, d.departureTime].filter(Boolean).join(' · '))}</span></div>
          <div class="transport-arrow">→</div>
          <div><strong>${escapeHtml(d.arrivalStation || '到达')}</strong><span>${escapeHtml([d.arrivalDate, d.arrivalTime].filter(Boolean).join(' · '))}</span></div>
        </div>
        ${(d.carriage || d.seat || d.confirmationNo) ? `<div class="structured-foot">${[d.carriage ? `${escapeHtml(d.carriage)}车` : '', d.seat ? `${escapeHtml(d.seat)}座` : '', d.confirmationNo ? `确认号 ${escapeHtml(d.confirmationNo)}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
      </div>
    `;
  }

  return '';
}

function itemCardHtml(item) {
  const category = categoryMeta(item.category);
  const images = Array.isArray(item.image_urls) ? item.image_urls : [];
  const links = Array.isArray(item.links) ? item.links : [];
  const mapUrl = baiduPointUrl(item);
  const displayLocation = itemLocationLabel(item);
  return `
    <article class="timeline-card" data-item-id="${attr(item.id)}">
      <div class="timeline-time ${(item.start_time || item.item_time) ? '' : 'muted'}">${escapeHtml(formatItemTime(item))}</div>
      <div class="timeline-content">
        <div class="timeline-top">
          <span class="category"><span class="category-icon" aria-hidden="true">${category.icon}</span>${escapeHtml(category.label)}</span>
          <div class="card-actions">
            <button class="drag-handle" type="button" data-drag-handle aria-label="拖动排序">⋮⋮</button>
            <button class="card-action" type="button" data-edit-item="${attr(item.id)}" aria-label="编辑">编辑</button>
          </div>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        ${structuredDetailsHtml(item)}
        ${displayLocation ? `<div class="location">📍 ${escapeHtml(displayLocation)}</div>` : ''}
        ${item.location_name && item.location && item.location_name !== item.location ? `<div class="location-address">${escapeHtml(item.location)}</div>` : ''}
        ${mapUrl ? `<div class="map-row"><a class="map-link" href="${attr(mapUrl)}" target="_blank" rel="noopener noreferrer">百度地图打开 ↗</a></div>` : ''}
        ${images.length ? `
          <div class="item-gallery item-gallery-${Math.min(images.length, 3)}">
            ${images.slice(0, 6).map((url, index) => `
              <a class="item-image-link" href="${attr(url)}" target="_blank" rel="noopener noreferrer" aria-label="查看图片 ${index + 1}">
                <img class="item-image" src="${attr(url)}" alt="${attr(item.title)} 图片 ${index + 1}" loading="lazy" decoding="async" />
                ${index === 5 && images.length > 6 ? `<span class="image-more">+${images.length - 6}</span>` : ''}
              </a>
            `).join('')}
          </div>
        ` : ''}
        ${item.notes ? `<div class="item-notes">${escapeHtml(item.notes)}</div>` : ''}
        ${links.length ? `
          <div class="link-row">
            ${links.map(link => {
              const platform = referencePlatformMeta(link.platform);
              const label = `${platform.icon} ${link.title || platform.label}`;
              if (link.kind === 'copy') {
                return `<button class="link-chip generic platform-${attr(link.platform || 'web')}" type="button" data-copy-reference="${attr(link.value || '')}">${escapeHtml(label)} · 复制</button>`;
              }
              const href = link.url || link.value || '';
              return `<a class="link-chip generic platform-${attr(link.platform || 'web')}" href="${attr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
            }).join('')}
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function renderToday() {
  const { trip, days } = state.current;
  const todayKey = localDateKey();
  const todayDay = days.find(day => String(day.day_date).slice(0, 10) === todayKey);
  const nowTime = localTimeKey();

  if (!todayDay) {
    const delta = daysBetween(todayKey, trip.start_date);
    const finished = todayKey > String(trip.end_date).slice(0, 10);
    const target = finished ? days[days.length - 1] : days[0];
    el.main.innerHTML = `
      ${heroHtml()}
      <section class="today-empty">
        <div class="today-date">${escapeHtml(formatDate(todayKey))}</div>
        <div class="today-empty-icon">${finished ? '🏁' : '🧳'}</div>
        <h2>${finished ? '这次旅行已经结束' : delta > 0 ? `还有 ${delta} 天出发` : '今天不在旅行日期内'}</h2>
        <p>${finished ? '可以回看最后一天的行程。' : '今天模式会在旅行日期到来后自动显示当天安排。'}</p>
        ${target ? `<button id="today-open-target" class="button primary" type="button">${finished ? '查看最后一天' : '查看第一天'}</button>` : ''}
      </section>
    `;
    bindHero();
    el.main.querySelector('#today-open-target')?.addEventListener('click', () => navigate(`/trips/${trip.id}/day/${target.id}`));
    return;
  }

  state.currentDayId = todayDay.id;
  const timed = todayDay.items.filter(item => item.start_time || item.item_time);
  const active = timed.find(item => {
    const start = item.start_time || item.item_time;
    const end = item.end_time || start;
    return start <= nowTime && nowTime <= end;
  });
  const next = active || timed.find(item => (item.start_time || item.item_time) >= nowTime) || null;
  const nextLabel = active ? '正在进行' : next ? '下一项' : '今天行程已完成';

  el.main.innerHTML = `
    ${heroHtml()}
    <section class="today-head">
      <div>
        <div class="today-kicker">TODAY · D${dayNumber(todayDay.day_date, trip.start_date)}</div>
        <h1>${escapeHtml(formatDate(todayDay.day_date))} · ${escapeHtml(todayDay.title || weekday(todayDay.day_date))}</h1>
        ${todayDay.notes ? `<p>${escapeHtml(todayDay.notes)}</p>` : ''}
      </div>
      <button id="today-open-day" class="button ghost small" type="button">完整当天</button>
    </section>
    <section class="next-card ${active ? 'active' : ''}">
      <div class="next-label">${nextLabel}</div>
      ${next ? `
        <div class="next-time">${escapeHtml(formatItemTime(next))}</div>
        <strong>${escapeHtml(next.title)}</strong>
        ${itemLocationLabel(next) ? `<span>📍 ${escapeHtml(itemLocationLabel(next))}</span>` : ''}
        ${baiduPointUrl(next) ? `<a href="${attr(baiduPointUrl(next))}" target="_blank" rel="noopener noreferrer">百度地图打开 ↗</a>` : ''}
      ` : '<strong>今天没有后续定时行程</strong>'}
    </section>
    <div class="section-head">
      <div><h2>今天全部安排</h2><div class="section-subtitle">${todayDay.items.length} 项</div></div>
      ${baiduDayRouteUrl(todayDay) ? `<a class="button ghost small map-button" href="${attr(baiduDayRouteUrl(todayDay))}" target="_blank" rel="noopener noreferrer">🗺 当天路线</a>` : ''}
    </div>
    <div class="timeline today-timeline">
      ${todayDay.items.length ? todayDay.items.map(item => itemCardHtml(item)).join('') : '<div class="empty-state"><strong>今天没有安排</strong></div>'}
    </div>
  `;

  bindHero();
  bindReferenceActions();
  el.main.querySelector('#today-open-day')?.addEventListener('click', () => navigate(`/trips/${trip.id}/day/${todayDay.id}`));
  el.main.querySelectorAll('[data-edit-item]').forEach(button => {
    button.addEventListener('click', () => {
      const item = todayDay.items.find(x => String(x.id) === button.dataset.editItem);
      if (item) openItemForm(todayDay, item);
    });
  });
}

function renderTodos() {
  const { todos } = state.current;
  const remaining = todos.filter(todo => !todo.done).length;
  el.main.innerHTML = `
    ${heroHtml()}
    <div class="section-head">
      <div>
        <h2>旅行待办</h2>
        <div class="section-subtitle">${remaining ? `还有 ${remaining} 项未完成` : '准备工作已完成'}</div>
      </div>
      <button id="add-todo" class="button primary small" type="button">＋ 添加</button>
    </div>
    <div class="todo-list">
      ${todos.length ? todos.map(todo => todoHtml(todo)).join('') : `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <strong>还没有待办</strong>
          <div>可以记录订票、订酒店、签证、行李和预约事项。</div>
        </div>
      `}
    </div>
  `;
  bindHero();
  bindReferenceActions();
  el.main.querySelector('#add-todo').addEventListener('click', () => openTodoForm());
  el.main.querySelectorAll('[data-todo-check]').forEach(input => {
    input.addEventListener('change', async () => {
      const todo = state.current.todos.find(x => String(x.id) === input.dataset.todoCheck);
      if (!todo) return;
      try {
        await api(`/api/todos/${todo.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: todo.title,
            notes: todo.notes,
            dueDate: todo.due_date || '',
            done: input.checked
          })
        });
        await refreshCurrent();
      } catch (error) {
        input.checked = !input.checked;
        showToast(error.message, 'error');
      }
    });
  });
  el.main.querySelectorAll('[data-edit-todo]').forEach(button => {
    button.addEventListener('click', () => {
      const todo = state.current.todos.find(x => String(x.id) === button.dataset.editTodo);
      if (todo) openTodoForm(todo);
    });
  });
}

function renderExpenses() {
  const { trip, expenses = [] } = state.current;
  const currency = trip.currency || 'CNY';
  const budget = Number(trip.budget_total || 0);
  const planned = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const paid = expenses.filter(expense => expense.paid).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const remaining = budget - planned;
  const categories = [...new Set(expenses.map(expense => expense.category))];

  el.main.innerHTML = `
    ${heroHtml()}
    <section class="budget-summary">
      <div class="budget-card primary"><span>总预算</span><strong>${budget > 0 ? escapeHtml(formatMoney(budget, currency)) : '未设置'}</strong></div>
      <div class="budget-card"><span>已计划</span><strong>${escapeHtml(formatMoney(planned, currency))}</strong></div>
      <div class="budget-card"><span>已支付</span><strong>${escapeHtml(formatMoney(paid, currency))}</strong></div>
      <div class="budget-card ${remaining < 0 ? 'over' : ''}"><span>预算剩余</span><strong>${budget > 0 ? escapeHtml(formatMoney(remaining, currency)) : '—'}</strong></div>
    </section>
    ${categories.length ? `
      <div class="expense-category-row">
        ${categories.map(category => {
          const total = expenses.filter(expense => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
          return `<span class="pill">${escapeHtml(category)} · ${escapeHtml(formatMoney(total, currency))}</span>`;
        }).join('')}
      </div>
    ` : ''}
    <div class="section-head">
      <div><h2>费用明细</h2><div class="section-subtitle">${expenses.length} 笔</div></div>
      <button id="add-expense" class="button primary small" type="button">＋ 添加</button>
    </div>
    <div class="expense-list">
      ${expenses.length ? expenses.map(expense => expenseHtml(expense, currency)).join('') : `
        <div class="empty-state"><div class="empty-icon">¥</div><strong>还没有费用</strong><div>可以记录酒店、交通、餐饮、门票和购物预算。</div></div>
      `}
    </div>
  `;

  bindHero();
  el.main.querySelector('#add-expense').addEventListener('click', () => openExpenseForm());
  el.main.querySelectorAll('[data-edit-expense]').forEach(button => {
    button.addEventListener('click', () => {
      const expense = expenses.find(item => String(item.id) === button.dataset.editExpense);
      if (expense) openExpenseForm(expense);
    });
  });
}

function expenseHtml(expense, currency) {
  return `
    <article class="expense-card ${expense.paid ? 'paid' : ''}">
      <div class="expense-main">
        <div class="expense-top">
          <span class="category">${escapeHtml(expense.category)}</span>
          <span class="expense-paid">${expense.paid ? '已支付' : '未支付'}</span>
        </div>
        <strong>${escapeHtml(expense.title)}</strong>
        <div class="expense-meta">${expense.expense_date ? escapeHtml(formatDate(expense.expense_date)) : '未指定日期'}${expense.notes ? ` · ${escapeHtml(expense.notes)}` : ''}</div>
      </div>
      <div class="expense-side">
        <strong>${escapeHtml(formatMoney(expense.amount, currency))}</strong>
        <button class="card-action" type="button" data-edit-expense="${attr(expense.id)}">编辑</button>
      </div>
    </article>
  `;
}

function todoHtml(todo) {
  return `
    <article class="todo-card ${todo.done ? 'done' : ''}">
      <input class="todo-check" type="checkbox" ${todo.done ? 'checked' : ''} data-todo-check="${attr(todo.id)}" aria-label="完成待办" />
      <div>
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        ${todo.due_date ? `<div class="todo-meta">截止 ${escapeHtml(formatDate(todo.due_date))}</div>` : ''}
        ${todo.notes ? `<div class="todo-notes">${escapeHtml(todo.notes)}</div>` : ''}
      </div>
      <button class="card-action" type="button" data-edit-todo="${attr(todo.id)}">编辑</button>
    </article>
  `;
}

function bindHero() {
  el.main.querySelector('#edit-trip')?.addEventListener('click', () => openTripForm(state.current.trip));
}


function bindReferenceActions() {
  el.main.querySelectorAll('[data-copy-reference]').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await copyText(button.dataset.copyReference || '');
        showToast('微信小程序口令已复制');
      } catch {
        showToast('复制失败，请手动复制', 'error');
      }
    });
  });
}

function bindItinerarySorting(day) {
  const timeline = el.main.querySelector('.timeline');
  if (!timeline || !day.items?.length) return;

  const makeDayTargets = () => {
    const bar = document.createElement('div');
    bar.className = 'drag-day-targets';
    bar.innerHTML = `
      <span class="drag-day-label">移动到</span>
      <div class="drag-day-list">
        ${state.current.days.map(target => `
          <button class="drag-day-target ${String(target.id) === String(day.id) ? 'current' : ''}"
                  type="button"
                  data-sort-day="${attr(target.id)}">
            D${dayNumber(target.day_date, state.current.trip.start_date)}
          </button>
        `).join('')}
      </div>
    `;
    document.body.appendChild(bar);
    return bar;
  };

  el.main.querySelectorAll('[data-drag-handle]').forEach(handle => {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      try { handle.setPointerCapture?.(event.pointerId); } catch {}
      navigator.vibrate?.(12);

      const card = handle.closest('[data-item-id]');
      if (!card) return;
      const itemId = card.dataset.itemId;
      let targetDayId = String(day.id);
      const targets = makeDayTargets();
      card.classList.add('sorting-card');
      document.body.classList.add('sorting-itinerary');

      const updateDayTarget = element => {
        const target = element?.closest?.('[data-sort-day]');
        if (!target) return false;
        targetDayId = target.dataset.sortDay;
        targets.querySelectorAll('[data-sort-day]').forEach(button => {
          button.classList.toggle('drop-active', button.dataset.sortDay === targetDayId);
        });
        return true;
      };

      const onMove = moveEvent => {
        if (moveEvent.pointerId !== event.pointerId) return;
        moveEvent.preventDefault();
        const edge = 86;
        if (moveEvent.clientY < edge) window.scrollBy({ top: -14, behavior: 'auto' });
        else if (moveEvent.clientY > window.innerHeight - edge) window.scrollBy({ top: 14, behavior: 'auto' });
        const stack = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
        if (stack.some(updateDayTarget)) return;

        targetDayId = String(day.id);
        targets.querySelectorAll('[data-sort-day]').forEach(button => button.classList.remove('drop-active'));
        const targetCard = stack.find(node => node?.matches?.('.timeline-card[data-item-id]'));
        if (!targetCard || targetCard === card || targetCard.parentElement !== timeline) return;
        const rect = targetCard.getBoundingClientRect();
        const after = moveEvent.clientY > rect.top + rect.height / 2;
        timeline.insertBefore(card, after ? targetCard.nextSibling : targetCard);
      };

      const finish = async upEvent => {
        if (upEvent.pointerId !== event.pointerId) return;
        window.removeEventListener('pointermove', onMove, { capture: true });
        window.removeEventListener('pointerup', finish, { capture: true });
        window.removeEventListener('pointercancel', finish, { capture: true });
        try { handle.releasePointerCapture?.(event.pointerId); } catch {}
        card.classList.remove('sorting-card');
        document.body.classList.remove('sorting-itinerary');
        targets.remove();

        try {
          if (targetDayId !== String(day.id)) {
            await api(`/api/items/${itemId}/move`, {
              method: 'PUT',
              body: JSON.stringify({ targetDayId, position: 999999 })
            });
            await navigate(`/trips/${state.current.trip.id}/day/${targetDayId}`);
            showToast('行程已移动');
            return;
          }

          const itemIds = [...timeline.querySelectorAll('.timeline-card[data-item-id]')].map(node => node.dataset.itemId);
          await api(`/api/days/${day.id}/items/order`, {
            method: 'PUT',
            body: JSON.stringify({ itemIds })
          });
          await refreshCurrent();
          showToast('行程顺序已保存');
        } catch (error) {
          showToast(error.message, 'error');
          await refreshCurrent();
        }
      };

      window.addEventListener('pointermove', onMove, { capture: true, passive: false });
      window.addEventListener('pointerup', finish, { capture: true });
      window.addEventListener('pointercancel', finish, { capture: true });
    });
  });
}
