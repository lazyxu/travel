function renderHome() {
  state.current = null;
  state.currentDayId = null;
  state.sortingDayId = null;
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
      ${[...state.trips].sort((a, b) => tripSortValue(a).localeCompare(tripSortValue(b))).map(trip => {
        const status = tripStatusMeta(trip);
        return `
          <article class="trip-card trip-card-${status.kind}" data-trip-id="${attr(trip.id)}" role="button" tabindex="0" aria-label="打开旅行：${attr(trip.title)}">
            <div class="trip-card-head">
              <h3>${escapeHtml(trip.title)}</h3>
              <span class="trip-status trip-status-${status.kind}">${escapeHtml(status.label)}</span>
            </div>
            <div class="trip-meta">${trip.destination ? `${escapeHtml(trip.destination)} · ` : ''}${escapeHtml(formatRange(trip.start_date, trip.end_date))}</div>
            ${status.kind === 'active' && status.progress !== null ? `<div class="trip-progress" aria-label="旅行进度 ${status.progress}%"><i style="width: ${status.progress}%"></i></div>` : ''}
            <div class="trip-stats">
              <span class="pill">⌁ ${trip.item_count} 项行程</span>
              <span class="pill">✓ ${trip.todo_count} 项待办</span>
            </div>
          </article>
        `;
      }).join('')}
    </div>
    ${state.trips.length ? '' : emptyStateHtml({
      icon: 'trip',
      title: '还没有旅行计划',
      detail: '创建后可以按天安排行程、保存链接和准备待办。'
    })}
  `;

  el.main.querySelector('#create-trip').addEventListener('click', () => openTripForm());
  el.main.querySelectorAll('[data-trip-id]').forEach(card => {
    const open = () => navigate(`/trips/${card.dataset.tripId}`);
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });
}

async function openTrip(id) {
  await navigate(`/trips/${id}`);
}

async function refreshCurrent() {
  if (!state.current?.trip?.id) return;
  const id = state.current.trip.id;
  const path = window.location.pathname;
  const current = await api(`/api/trips/${id}`);

  if (window.location.pathname !== path) return;
  if (String(state.current?.trip?.id || '') !== String(id)) return;

  state.current = current;
  if (state.tab === 'itinerary' && !state.current.days.some(day => String(day.id) === String(state.currentDayId))) {
    state.currentDayId = defaultTripDay(state.current.days)?.id || null;
  }
  syncCurrentUrl({ replace: true });
  renderCurrent();
}

function renderCurrent() {
  if (!state.current) return renderHome();
  el.topbarTitle.textContent = state.tab === 'todos' ? '旅行待办' : '每日行程';
  el.bottomNav.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
  });
  if (state.tab === 'todos') renderTodos();
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
      <div class="trip-summary-actions">
        <details class="item-action-menu trip-action-menu">
          <summary class="card-more trip-more" aria-label="旅行更多操作">•••</summary>
          <div class="item-action-popover">
            <button id="share-trip" type="button">分享旅行</button>
            <button id="edit-trip" type="button">编辑旅行</button>
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderItinerary() {
  const { trip, days } = state.current;
  const day = days.find(item => String(item.id) === String(state.currentDayId)) || days[0];
  if (day) state.currentDayId = day.id;

  el.main.innerHTML = `
    ${heroHtml()}
    ${tripExpenseSummaryHtml()}
    <div class="day-tabs" role="tablist" aria-label="旅行日期">
      ${days.map(item => {
        const isToday = String(item.day_date || '').slice(0, 10) === localDateKey();
        return `
          <button class="day-tab ${String(item.id) === String(state.currentDayId) ? 'active' : ''} ${isToday ? 'today' : ''}" data-day-id="${attr(item.id)}" type="button" role="tab" aria-selected="${String(item.id) === String(state.currentDayId) ? 'true' : 'false'}">
            <strong>D${dayNumber(item.day_date, trip.start_date)} · ${escapeHtml(formatDate(item.day_date))}</strong>
            <span>${isToday ? '今天 · ' : ''}${escapeHtml(item.title || weekday(item.day_date))}</span>
          </button>
        `;
      }).join('')}
    </div>
    ${day ? `
      <div class="section-head itinerary-section-head">
        <div>
          <h2>${escapeHtml(day.title || `${formatDate(day.day_date)} ${weekday(day.day_date)}`)}</h2>
          ${day.notes ? `<div class="section-subtitle">${escapeHtml(day.notes)}</div>` : ''}
        </div>
        <div class="section-actions">
          ${baiduDayRouteUrl(day) ? `<a class="button ghost small map-button" href="${attr(baiduDayRouteUrl(day))}">${escapeHtml(dayRouteLabel(day))}</a>` : ''}
          ${String(state.sortingDayId) === String(day.id) ? `
            <button id="toggle-sort" class="button ghost small active" type="button">完成排序</button>
          ` : `
            <details class="item-action-menu day-action-menu">
              <summary class="card-more day-more" aria-label="当天更多操作">•••</summary>
              <div class="item-action-popover">
                ${day.items?.length ? '<button id="toggle-sort" type="button">调整顺序</button>' : ''}
                <button id="edit-day" type="button">编辑当天</button>
              </div>
            </details>
          `}
        </div>
      </div>
      <div class="timeline ${String(state.sortingDayId) === String(day.id) ? 'reorder-mode' : ''}">
        ${dayDisplayItems(day).length ? dayTimelineHtml(day) : emptyStateHtml({
          icon: 'add',
          title: '这一天还没有安排',
          detail: '添加景点、餐厅、交通或住宿，并把链接和图片一起保存。'
        })}
      </div>
      <button id="add-item" class="fab" type="button" aria-label="添加行程">＋</button>
    ` : emptyStateHtml({ icon: 'calendar', title: '暂无日期', detail: '先为旅行设置出发和结束日期。' })}
  `;

  const dayTabs = el.main.querySelector('.day-tabs');
  const activeDayTab = dayTabs?.querySelector('.day-tab.active');
  if (dayTabs && activeDayTab) {
    requestAnimationFrame(() => {
      const left = activeDayTab.offsetLeft;
      const right = left + activeDayTab.offsetWidth;
      const visibleLeft = dayTabs.scrollLeft + 8;
      const visibleRight = dayTabs.scrollLeft + dayTabs.clientWidth - 8;
      if (left < visibleLeft || right > visibleRight) {
        const maxScroll = Math.max(0, dayTabs.scrollWidth - dayTabs.clientWidth);
        const centered = left - (dayTabs.clientWidth - activeDayTab.offsetWidth) / 2;
        dayTabs.scrollTo({ left: Math.max(0, Math.min(maxScroll, centered)), behavior: 'smooth' });
      }
    });
  }

  bindHero();
  bindReferenceActions();
  bindDisclosureMenus();
  el.main.querySelectorAll('[data-day-id]').forEach(button => {
    button.addEventListener('click', () => {
      navigate(`/trips/${state.current.trip.id}/day/${button.dataset.dayId}`);
    });
  });
  if (day) {
    el.main.querySelector('#edit-day')?.addEventListener('click', () => openDayForm(day));
    el.main.querySelector('#add-item').addEventListener('click', () => openItemForm(day));
    el.main.querySelector('#toggle-sort')?.addEventListener('click', () => {
      state.sortingDayId = String(state.sortingDayId) === String(day.id) ? null : day.id;
      renderItinerary();
    });
    bindItinerarySorting(day);
    bindItineraryActions(day);
    el.main.querySelectorAll('[data-choose-dining]').forEach(button => {
      button.addEventListener('click', () => {
        const item = tripItemById(button.dataset.chooseDining);
        if (item) openDiningQuickSelect(item);
      });
    });
    el.main.querySelectorAll('[data-edit-item]').forEach(button => {
      button.addEventListener('click', () => {
        const item = tripItemById(button.dataset.editItem);
        if (item) openItemForm(day, item);
      });
    });
  }
}

function structuredDetailsHtml(item) {
  const d = item?.details || {};
  if (!d.kind) return '';

  if (d.kind === 'dining') {
    const candidates = Array.isArray(d.candidates) ? d.candidates : [];
    const first = candidates[0];
    const selected = candidates.find(candidate => candidate.id === d.selectedCandidateId);
    if (!candidates.length) return '';
    return `
      <div class="dining-summary">
        <strong>候选 ${candidates.length} 家</strong>
        <span>📍 路线：${escapeHtml(first?.name || '第1家')}</span>
        ${selected ? `<span>✓ 已选：${escapeHtml(selected.name || '候选餐厅')}</span>` : ''}
        ${first && (first.latitude === null || first.latitude === undefined) ? '<span>⚠ 第1家未定位</span>' : ''}
      </div>
    `;
  }

  if (d.kind === 'lodging') {
    const detailTitle = d.hotelName || '';
    return `
      <div class="structured-card lodging">
        ${detailTitle && detailTitle !== item.title ? `<div class="structured-title">🏨 ${escapeHtml(detailTitle)}</div>` : ''}
        <div class="structured-grid">
          ${(d.checkInDate || d.checkInTime) ? `<div><span>入住</span><strong>${escapeHtml(formatStructuredDateTime(d.checkInDate, d.checkInTime))}</strong></div>` : ''}
          ${(d.checkOutDate || d.checkOutTime) ? `<div><span>退房</span><strong>${escapeHtml(formatStructuredDateTime(d.checkOutDate, d.checkOutTime))}</strong></div>` : ''}
          ${d.roomType ? `<div><span>房型</span><strong>${escapeHtml(d.roomType)}</strong></div>` : ''}
          ${d.bookingPlatform ? `<div><span>预订</span><strong>${escapeHtml(d.bookingPlatform)}</strong></div>` : ''}
          ${d.bookingUrl ? `<div class="structured-wide"><span>预订链接</span><a class="booking-link" href="${attr(d.bookingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.bookingPlatform || '打开预订')} ↗</a></div>` : ''}
          ${d.confirmationNo ? `<div><span>确认号</span><strong>${escapeHtml(d.confirmationNo)}</strong></div>` : ''}
          ${d.phone ? `<div><span>电话</span><strong>${escapeHtml(d.phone)}</strong></div>` : ''}
        </div>
      </div>
    `;
  }

  if (d.kind === 'flight') {
    const detailTitle = [d.airline, d.flightNo].filter(Boolean).join(' ');
    return `
      <div class="structured-card flight">
        ${detailTitle && detailTitle !== item.title ? `<div class="structured-title">✈️ ${escapeHtml(detailTitle)}</div>` : ''}
        <div class="transport-route">
          <div><strong>${escapeHtml(d.departureAirport || '出发')}</strong><span>${escapeHtml([formatStructuredDateTime(d.departureDate, d.departureTime), d.departureTerminal].filter(Boolean).join(' · '))}</span></div>
          <div class="transport-arrow">→</div>
          <div><strong>${escapeHtml(d.arrivalAirport || '到达')}</strong><span>${escapeHtml([formatStructuredDateTime(d.arrivalDate, d.arrivalTime), d.arrivalTerminal].filter(Boolean).join(' · '))}</span></div>
        </div>
        ${(d.seat || d.confirmationNo) ? `<div class="structured-foot">${d.seat ? `座位 ${escapeHtml(d.seat)}` : ''}${d.seat && d.confirmationNo ? ' · ' : ''}${d.confirmationNo ? `确认号 ${escapeHtml(d.confirmationNo)}` : ''}</div>` : ''}
      </div>
    `;
  }

  if (d.kind === 'train') {
    const detailTitle = d.trainNo || '';
    return `
      <div class="structured-card train">
        ${detailTitle && detailTitle !== item.title ? `<div class="structured-title">🚄 ${escapeHtml(detailTitle)}</div>` : ''}
        <div class="transport-route">
          <div><strong>${escapeHtml(d.departureStation || '出发')}</strong><span>${escapeHtml(formatStructuredDateTime(d.departureDate, d.departureTime))}</span></div>
          <div class="transport-arrow">→</div>
          <div><strong>${escapeHtml(d.arrivalStation || '到达')}</strong><span>${escapeHtml(formatStructuredDateTime(d.arrivalDate, d.arrivalTime))}</span></div>
        </div>
        ${(d.carriage || d.seat || d.confirmationNo) ? `<div class="structured-foot">${[d.carriage ? `${escapeHtml(d.carriage)}车` : '', d.seat ? `${escapeHtml(d.seat)}座` : '', d.confirmationNo ? `确认号 ${escapeHtml(d.confirmationNo)}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
      </div>
    `;
  }

  return '';
}

function hotelStayAnchorHtml(item, { readonly = false } = {}) {
  const hotelName = item.details?.hotelName || itemLocationLabel(item) || item.title || '酒店';
  const roleLabel = item._stayRole === 'morning' ? '从酒店出发' : '回酒店';
  const showExpense = item._stayRole === 'night'
    && item.details?.checkInDate
    && String(item._virtualKey || '').endsWith(item.details.checkInDate);
  return `
    <article class="timeline-card hotel-stay-anchor ${item._stayRole || ''}" data-virtual-stay="${attr(item._virtualKey || '')}">
      <div class="timeline-time hotel-stay-time">${escapeHtml(item._stayTime || (item._stayRole === 'morning' ? '早晨' : '夜间'))}</div>
      <div class="timeline-content">
        <div class="timeline-top">
          <span class="category"><span class="category-icon">🏨</span>${roleLabel}</span>
          ${readonly ? '' : `<div class="card-actions">
            <details class="item-action-menu">
              <summary class="card-more" aria-label="更多操作">•••</summary>
              <div class="item-action-popover">
                <button type="button" data-edit-item="${attr(item.id)}">编辑酒店</button>
              </div>
            </details>
          </div>`}
        </div>
        <h3>${escapeHtml(hotelName)}</h3>
        ${itemLocationLabel(item) && itemLocationLabel(item) !== hotelName ? `<div class="location">📍 ${escapeHtml(itemLocationLabel(item))}</div>` : ''}
        ${item.details?.bookingUrl ? `<div class="hotel-booking-row"><a class="booking-link" href="${attr(item.details.bookingUrl)}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(item.details.bookingPlatform || '酒店预订')} ↗</a></div>` : ''}
        ${showExpense ? inlineExpenseHtml(item, { readonly }) : ''}
      </div>
    </article>
  `;
}

function itemCardHtml(item, { readonly = false } = {}) {
  if (item?._virtualStay) return hotelStayAnchorHtml(item, { readonly });
  const category = itemCategoryMeta(item);
  const images = Array.isArray(item.image_urls) ? item.image_urls : [];
  const links = Array.isArray(item.links) ? item.links : [];
  const displayLocation = itemLocationLabel(item);
  return `
    <article class="timeline-card" data-item-id="${attr(item.id)}">
      <div class="timeline-time ${(item.start_time || item.item_time) ? '' : 'muted'}">${escapeHtml(formatItemTime(item))}</div>
      <div class="timeline-content">
        <div class="timeline-top">
          <span class="category"><span class="category-icon" aria-hidden="true">${category.icon}</span>${escapeHtml(category.label)}</span>
          ${readonly ? '' : `<div class="card-actions">
            <button class="drag-handle" type="button" data-drag-handle aria-label="拖动排序">⋮⋮</button>
            <details class="item-action-menu">
              <summary class="card-more" aria-label="更多操作">•••</summary>
              <div class="item-action-popover">
                ${item.details?.kind === 'dining' && item.details?.candidates?.length ? `<button type="button" data-choose-dining="${attr(item.id)}">选择餐厅</button>` : ''}
                <button type="button" data-edit-item="${attr(item.id)}">编辑行程</button>
              </div>
            </details>
          </div>`}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        ${structuredDetailsHtml(item)}
        ${displayLocation ? `<div class="location">📍 ${escapeHtml(displayLocation)}</div>` : ''}
        ${images.length ? `
          <div class="item-gallery item-gallery-${Math.min(images.length, 3)}">
            ${images.slice(0, 3).map((url, index) => `
              <button class="item-image-link" type="button" data-gallery-item="${attr(item.id)}" data-gallery-index="${index}" aria-label="查看图片 ${index + 1}">
                <img class="item-image" src="${attr(url)}" alt="${attr(item.title)} 图片 ${index + 1}" loading="lazy" decoding="async" />
                ${index === 2 && images.length > 3 ? `<span class="image-more">+${images.length - 3}</span>` : ''}
              </button>
            `).join('')}
          </div>
        ` : ''}
        ${item.notes ? `<div class="item-notes">${escapeHtml(item.notes)}</div>` : ''}
        ${links.length ? `
          <div class="link-row">
            ${links.map(link => {
              const action = referenceActionMeta(link);
              if (action.type === 'wechat-copy-open') {
                return `<button class="link-chip generic platform-wechat" type="button" data-copy-open-wechat="${attr(action.value)}">${escapeHtml(action.label)}</button>`;
              }
              if (action.type === 'copy') {
                return `<button class="link-chip generic platform-${attr(action.platform)}" type="button" data-copy-reference="${attr(action.value)}">${escapeHtml(action.label)}</button>`;
              }
              if (action.type === 'wechat-scheme') {
                return `<button class="link-chip generic platform-wechat" type="button" data-open-wechat-scheme="${attr(action.href)}">${escapeHtml(action.label)}</button>`;
              }
              if (action.type === 'app') {
                return `<a class="link-chip generic platform-${attr(action.platform)} app-deep-link" href="${attr(action.href)}">${escapeHtml(action.label)}</a>`;
              }
              return `<a class="link-chip generic platform-${attr(action.platform)}" href="${attr(action.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(action.label)}</a>`;
            }).join('')}
          </div>
        ` : ''}
        ${inlineExpenseHtml(item, { readonly })}
      </div>
    </article>
  `;
}

function renderTodos() {
  const { todos } = state.current;
  const pending = todos
    .filter(todo => !todo.done)
    .sort((a, b) => {
      const aDue = String(a.due_date || '9999-12-31').slice(0, 10);
      const bDue = String(b.due_date || '9999-12-31').slice(0, 10);
      return aDue.localeCompare(bDue) || Number(a.id || 0) - Number(b.id || 0);
    });
  const completed = todos.filter(todo => todo.done);
  const total = todos.length;
  const doneCount = completed.length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;
  const overdueCount = pending.filter(todo => todoDueMeta(todo).kind === 'overdue').length;

  el.main.innerHTML = `
    ${heroHtml()}
    <section class="todo-overview">
      <div class="todo-overview-copy">
        <span>准备进度</span>
        <strong>${total ? `${doneCount} / ${total}` : '还没有待办'}</strong>
        <small>${overdueCount ? `${overdueCount} 项已逾期` : pending.length ? `还有 ${pending.length} 项待完成` : total ? '准备工作已完成' : '先记录需要提前准备的事项'}</small>
      </div>
      <div class="todo-progress-value">${progress}%</div>
      <div class="todo-progress-track"><i style="width: ${progress}%"></i></div>
    </section>

    <div class="section-head todo-section-head">
      <div>
        <h2>待完成</h2>
        <div class="section-subtitle">${pending.length ? `${pending.length} 项` : '没有未完成事项'}</div>
      </div>
      <button id="add-todo" class="button primary small" type="button">＋ 添加</button>
    </div>

    <div class="todo-list todo-pending-list">
      ${pending.length ? pending.map(todo => todoHtml(todo)).join('') : `
        <div class="todo-all-done">
          <span>✓</span>
          <div><strong>${total ? '准备工作已完成' : '还没有待办'}</strong><small>${total ? '可以安心出发了' : '可以记录订票、订酒店、签证、行李和预约事项'}</small></div>
        </div>
      `}
    </div>

    ${completed.length ? `
      <details class="todo-completed-group" ${pending.length ? '' : 'open'}>
        <summary>
          <span>已完成</span>
          <strong>${completed.length}</strong>
          <em>⌄</em>
        </summary>
        <div class="todo-list todo-completed-list">
          ${completed.map(todo => todoHtml(todo)).join('')}
        </div>
      </details>
    ` : ''}
  `;

  bindHero();
  bindReferenceActions();
  bindDisclosureMenus();
  el.main.querySelector('#add-todo').addEventListener('click', () => openTodoForm());
  el.main.querySelectorAll('[data-todo-check]').forEach(input => {
    input.addEventListener('change', async () => {
      const todo = state.current.todos.find(x => String(x.id) === input.dataset.todoCheck);
      if (!todo) return;
      input.disabled = true;
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
        input.disabled = false;
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

function todoHtml(todo) {
  const due = todoDueMeta(todo);
  return `
    <article class="todo-card ${todo.done ? 'done' : ''} ${due.kind !== 'none' && due.kind !== 'done' ? `due-${due.kind}` : ''}">
      <input class="todo-check" type="checkbox" ${todo.done ? 'checked' : ''} data-todo-check="${attr(todo.id)}" aria-label="${todo.done ? '标记为未完成' : '标记为已完成'}" />
      <div class="todo-copy">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        ${due.label && !todo.done ? `<div class="todo-due todo-due-${due.kind}">${escapeHtml(due.label)}</div>` : ''}
        ${todo.notes ? `<div class="todo-notes">${escapeHtml(todo.notes)}</div>` : ''}
      </div>
      <div class="todo-actions">
        <details class="item-action-menu">
          <summary class="card-more" aria-label="更多操作">•••</summary>
          <div class="item-action-popover">
            <button type="button" data-edit-todo="${attr(todo.id)}">编辑待办</button>
          </div>
        </details>
      </div>
    </article>
  `;
}

function bindHero() {
  el.main.querySelector('#edit-trip')?.addEventListener('click', () => openTripForm(state.current.trip));
  el.main.querySelector('#share-trip')?.addEventListener('click', () => openShareManager());
}


function bindReferenceActions() {
  bindImageViewerActions();

  el.main.querySelectorAll('[data-copy-open-wechat]').forEach(button => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copyOpenWechat || '';
      if (!value) return;
      try {
        await copyText(value);
        showToast('小程序口令已复制，正在打开微信');
      } catch {
        showToast('复制小程序口令失败', 'error');
        return;
      }
      if (!isWeChatBrowser()) {
        setTimeout(() => { window.location.href = 'weixin://'; }, 80);
      }
    });
  });

  el.main.querySelectorAll('[data-open-wechat-scheme]').forEach(button => {
    button.addEventListener('click', async () => {
      const value = button.dataset.openWechatScheme || '';
      if (!value) return;
      if (isWeChatBrowser()) {
        try {
          await copyText(value);
          showToast('微信内网页不能直接用 URL Scheme 打开任意小程序，链接已复制');
        } catch {
          showToast('微信内请复制链接后在外部浏览器打开', 'error');
        }
        return;
      }
      window.location.href = value;
    });
  });

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

  const makeDragPreview = (card, event) => {
    const rect = card.getBoundingClientRect();
    const preview = card.cloneNode(true);
    preview.classList.remove('sorting-card');
    preview.classList.add('drag-card-preview');
    preview.removeAttribute('data-item-id');
    preview.setAttribute('aria-hidden', 'true');
    preview.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    preview.querySelectorAll('button, a, input, select, textarea').forEach(node => node.setAttribute('tabindex', '-1'));
    preview.style.width = `${rect.width}px`;
    preview.style.maxHeight = `${Math.min(rect.height, window.innerHeight * 0.68)}px`;
    document.body.appendChild(preview);

    const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const move = (x, y) => {
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, x - offsetX));
      const visibleHeight = Math.min(rect.height, window.innerHeight * 0.68);
      const top = Math.max(8, Math.min(window.innerHeight - visibleHeight - 8, y - offsetY));
      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
    };
    move(event.clientX, event.clientY);
    return { preview, move };
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
      const visibleIds = [...timeline.querySelectorAll('.timeline-card[data-item-id]')].map(node => node.dataset.itemId);
      const remainingIds = visibleIds.filter(id => id !== itemId);
      let dropIndex = Math.max(0, visibleIds.indexOf(itemId));
      let targetDayId = String(day.id);

      const targets = makeDayTargets();
      const indicator = document.createElement('div');
      indicator.className = 'drag-drop-indicator';
      const { preview, move: movePreview } = makeDragPreview(card, event);

      card.classList.add('sorting-card');
      document.body.classList.add('sorting-itinerary');

      const clearDayTargets = () => {
        targets.querySelectorAll('[data-sort-day]').forEach(button => button.classList.remove('drop-active'));
      };
      const clearLegTargets = () => {
        timeline.querySelectorAll('[data-leg-drop].drag-leg-hover').forEach(node => node.classList.remove('drag-leg-hover'));
      };

      const placeIndicator = (targetCard, after) => {
        const targetIndex = remainingIds.indexOf(targetCard.dataset.itemId);
        if (targetIndex < 0) return;
        dropIndex = targetIndex + (after ? 1 : 0);

        if (after) {
          const leg = targetCard.nextElementSibling?.classList.contains('leg-control')
            ? targetCard.nextElementSibling
            : null;
          timeline.insertBefore(indicator, leg ? leg.nextSibling : targetCard.nextSibling);
        } else {
          timeline.insertBefore(indicator, targetCard);
        }
      };

      const onMove = moveEvent => {
        if (moveEvent.pointerId !== event.pointerId) return;
        moveEvent.preventDefault();
        movePreview(moveEvent.clientX, moveEvent.clientY);

        const edge = 86;
        if (moveEvent.clientY < edge) window.scrollBy({ top: -14, behavior: 'auto' });
        else if (moveEvent.clientY > window.innerHeight - edge) window.scrollBy({ top: 14, behavior: 'auto' });

        const stack = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
        const dayTarget = stack.map(node => node?.closest?.('[data-sort-day]')).find(Boolean);
        if (dayTarget) {
          targetDayId = dayTarget.dataset.sortDay;
          indicator.remove();
          clearDayTargets();
          clearLegTargets();
          dayTarget.classList.add('drop-active');
          return;
        }

        targetDayId = String(day.id);
        clearDayTargets();
        clearLegTargets();

        const legTarget = stack.map(node => node?.closest?.('[data-leg-drop]')).find(Boolean);
        if (legTarget && timeline.contains(legTarget)) {
          const toId = String(legTarget.dataset.toKey || '').match(/^item:(\d+)$/)?.[1] || '';
          const fromId = String(legTarget.dataset.fromKey || '').match(/^item:(\d+)$/)?.[1] || '';
          if (toId && remainingIds.includes(toId)) {
            dropIndex = remainingIds.indexOf(toId);
            timeline.insertBefore(indicator, legTarget);
          } else if (fromId && remainingIds.includes(fromId)) {
            dropIndex = remainingIds.indexOf(fromId) + 1;
            timeline.insertBefore(indicator, legTarget.nextSibling);
          }
          legTarget.classList.add('drag-leg-hover');
          return;
        }

        const targetCard = stack.find(node =>
          node?.matches?.('.timeline-card[data-item-id]')
          && node !== card
          && node.parentElement === timeline
        );
        if (!targetCard) return;

        const rect = targetCard.getBoundingClientRect();
        placeIndicator(targetCard, moveEvent.clientY > rect.top + rect.height / 2);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove, { capture: true });
        window.removeEventListener('pointerup', finish, { capture: true });
        window.removeEventListener('pointercancel', finish, { capture: true });
        try { handle.releasePointerCapture?.(event.pointerId); } catch {}
        card.classList.remove('sorting-card');
        document.body.classList.remove('sorting-itinerary');
        clearLegTargets();
        indicator.remove();
        preview.remove();
        targets.remove();
      };

      const finish = async upEvent => {
        if (upEvent.pointerId !== event.pointerId) return;
        const cancelled = upEvent.type === 'pointercancel';
        cleanup();
        if (cancelled) return;

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

          const orderedVisible = [...remainingIds];
          orderedVisible.splice(Math.max(0, Math.min(dropIndex, orderedVisible.length)), 0, itemId);

          const visibleSet = new Set(visibleIds);
          let visibleIndex = 0;
          const itemIds = day.items.map(item => {
            const id = String(item.id);
            if (!visibleSet.has(id)) return id;
            return orderedVisible[visibleIndex++];
          });

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

