function renderHome() {
  state.current = null;
  state.currentDayId = null;
  el.topbarTitle.textContent = '我的旅行';
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
    card.addEventListener('click', () => openTrip(card.dataset.tripId));
  });
}

async function openTrip(id) {
  state.current = await api(`/api/trips/${id}`);
  if (!state.currentDayId || !state.current.days.some(day => String(day.id) === String(state.currentDayId))) {
    state.currentDayId = state.current.days[0]?.id || null;
  }
  state.tab = 'itinerary';
  el.backHome.classList.remove('hidden');
  el.bottomNav.classList.remove('hidden');
  renderCurrent();
}

async function refreshCurrent() {
  if (!state.current?.trip?.id) return;
  const id = state.current.trip.id;
  state.current = await api(`/api/trips/${id}`);
  if (!state.current.days.some(day => String(day.id) === String(state.currentDayId))) {
    state.currentDayId = state.current.days[0]?.id || null;
  }
  renderCurrent();
}

function renderCurrent() {
  if (!state.current) return renderHome();
  el.topbarTitle.textContent = state.current.trip.title;
  el.bottomNav.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
  });
  if (state.tab === 'todos') renderTodos();
  else renderItinerary();
}

function heroHtml() {
  const trip = state.current.trip;
  return `
    <section class="hero">
      <div class="hero-row">
        <div>
          <p>${escapeHtml(trip.destination || '目的地待定')}</p>
          <h1>${escapeHtml(trip.title)}</h1>
          <p>${escapeHtml(formatRange(trip.start_date, trip.end_date))}</p>
        </div>
        <button id="edit-trip" class="icon-button" type="button" aria-label="编辑旅行">⋯</button>
      </div>
      ${trip.notes ? `<p class="hero-notes">${escapeHtml(trip.notes)}</p>` : ''}
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
        <button id="edit-day" class="button ghost small" type="button">编辑当天</button>
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
  el.main.querySelectorAll('[data-day-id]').forEach(button => {
    button.addEventListener('click', () => {
      state.currentDayId = button.dataset.dayId;
      renderItinerary();
    });
  });
  if (day) {
    el.main.querySelector('#edit-day').addEventListener('click', () => openDayForm(day));
    el.main.querySelector('#add-item').addEventListener('click', () => openItemForm(day));
    el.main.querySelectorAll('[data-edit-item]').forEach(button => {
      button.addEventListener('click', () => {
        const item = day.items.find(x => String(x.id) === button.dataset.editItem);
        if (item) openItemForm(day, item);
      });
    });
  }
}

function itemCardHtml(item) {
  const category = categoryMeta(item.category);
  const images = Array.isArray(item.image_urls) ? item.image_urls : [];
  return `
    <article class="timeline-card">
      <div class="timeline-time ${item.item_time ? '' : 'muted'}">${escapeHtml(item.item_time || '待定')}</div>
      <div class="timeline-content">
        <div class="timeline-top">
          <span class="category"><span class="category-icon" aria-hidden="true">${category.icon}</span>${escapeHtml(category.label)}</span>
          <div class="card-actions">
            <button class="card-action" type="button" data-edit-item="${attr(item.id)}" aria-label="编辑">编辑</button>
          </div>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.location ? `<div class="location">📍 ${escapeHtml(item.location)}</div>` : ''}
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
        ${(item.xhs_url || item.dianping_url) ? `
          <div class="link-row">
            ${item.xhs_url ? `<a class="link-chip" href="${attr(item.xhs_url)}" target="_blank" rel="noopener noreferrer">小红书 ↗</a>` : ''}
            ${item.dianping_url ? `<a class="link-chip dp" href="${attr(item.dianping_url)}" target="_blank" rel="noopener noreferrer">大众点评 ↗</a>` : ''}
          </div>
        ` : ''}
      </div>
    </article>
  `;
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

