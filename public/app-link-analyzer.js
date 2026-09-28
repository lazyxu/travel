const LINK_PLATFORM_ICONS = {
  baidu: '📍',
  wechat: '💬',
  douyin: '🎵',
  meituan: '🍜',
  dianping: '🍽️',
  xhs: '📕',
  xianyu: '🐟',
  web: '🔗'
};

function ensureLinkAnalyzer() {
  let modal = document.querySelector('#link-analyzer');
  if (modal) return modal;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="link-analyzer-backdrop" class="link-analyzer-backdrop hidden"></div>
    <section id="link-analyzer" class="link-analyzer hidden" role="dialog" aria-modal="true">
      <div class="sheet-grabber"></div>
      <div class="sheet-head">
        <h2 id="link-analyzer-title">分析链接</h2>
        <button id="link-analyzer-close" class="icon-button" type="button" aria-label="关闭">×</button>
      </div>
      <form id="link-analyzer-form" class="link-analyzer-body"></form>
    </section>
  `);

  modal = document.querySelector('#link-analyzer');
  document.querySelector('#link-analyzer-close')?.addEventListener('click', () => closeLinkAnalyzer());
  document.querySelector('#link-analyzer-backdrop')?.addEventListener('click', () => closeLinkAnalyzer());
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || modal.classList.contains('hidden')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeLinkAnalyzer();
  }, true);

  return modal;
}

function closeLinkAnalyzer(force = false) {
  const modal = document.querySelector('#link-analyzer');
  const form = document.querySelector('#link-analyzer-form');
  if (!modal || modal.classList.contains('hidden')) return true;
  if (!force && form?.dataset.dirty === '1' && !confirm('链接分析结果有未保存修改，确定放弃吗？')) return false;
  modal.classList.add('hidden');
  document.querySelector('#link-analyzer-backdrop')?.classList.add('hidden');
  if (form) {
    form.innerHTML = '';
    form.onsubmit = null;
    form.dataset.dirty = '0';
  }
  return true;
}

function linkAnalysisReferenceResultHtml(result) {
  const reference = result.reference || {};
  const analysis = result.analysis || {};
  const platform = analysis.platform || reference.platform || 'web';
  const icon = LINK_PLATFORM_ICONS[platform] || '🔗';
  return `
    <input name="analysisType" type="hidden" value="reference" />
    <input name="analysisPlatform" type="hidden" value="${attr(platform)}" />
    <input name="analysisAutoTitle" type="hidden" value="${attr(analysis.autoTitle || reference.autoTitle || reference.title || '')}" />
    <input name="analysisAppUrl" type="hidden" value="${attr(analysis.appUrl || reference.appUrl || '')}" />
    <div class="link-analysis-kind"><span>${icon}</span><strong>${escapeHtml(analysis.platformLabel || referencePlatformMeta(platform).label)}</strong><em>链接</em></div>
    <div class="link-analysis-readonly"><span>自动标题</span><strong>${escapeHtml(analysis.autoTitle || reference.autoTitle || reference.title || '未提取到标题')}</strong></div>
    <label class="field"><span>展示标题</span><input name="analysisDisplayTitle" maxlength="180" value="${attr(reference.customTitle || analysis.displayTitle || '')}" placeholder="可手动调整；留空则使用自动标题" /></label>
    <div class="link-analysis-open"><span>打开方式</span><strong>${analysis.openMode === 'app' ? 'App' : analysis.openMode === 'copy' ? '复制口令' : '网页'}</strong></div>
  `;
}

function linkAnalysisLocationResultHtml(result) {
  const location = result.location || {};
  return `
    <input name="analysisType" type="hidden" value="location" />
    <input name="analysisLocationUid" type="hidden" value="${attr(location.uid || '')}" />
    <input name="analysisLatitude" type="hidden" value="${attr(location.latitude ?? '')}" />
    <input name="analysisLongitude" type="hidden" value="${attr(location.longitude ?? '')}" />
    <input name="analysisCoordType" type="hidden" value="${attr(location.coordType || 'bd09ll')}" />
    <div class="link-analysis-kind"><span>📍</span><strong>百度地图</strong><em>位置</em></div>
    <label class="field"><span>位置名称</span><input name="analysisLocationName" maxlength="160" value="${attr(location.name || '')}" placeholder="例如：灵隐寺" /></label>
    <label class="field"><span>可读地址</span><input name="analysisAddress" maxlength="240" value="${attr(location.address || '')}" placeholder="例如：杭州市西湖区法云弄1号" /></label>
    <div class="link-analysis-readonly"><span>定位状态</span><strong>${location.latitude !== null && location.latitude !== undefined ? '已定位' : '未获得坐标，可手动保留名称/地址'}</strong></div>
  `;
}

function linkAnalysisBookingResultHtml(result) {
  const lodging = result.lodging || {};
  const reference = result.reference || {};
  const analysis = result.analysis || {};
  return `
    <input name="analysisType" type="hidden" value="booking" />
    <input name="analysisAutoTitle" type="hidden" value="${attr(analysis.autoTitle || reference.autoTitle || reference.title || '')}" />
    <input name="analysisLocationUid" type="hidden" value="${attr(lodging.locationUid || '')}" />
    <input name="analysisLatitude" type="hidden" value="${attr(lodging.latitude ?? '')}" />
    <input name="analysisLongitude" type="hidden" value="${attr(lodging.longitude ?? '')}" />
    <input name="analysisCoordType" type="hidden" value="${attr(lodging.coordType || 'bd09ll')}" />
    <div class="link-analysis-kind"><span>🏨</span><strong>${escapeHtml(lodging.bookingPlatform || analysis.platformLabel || '酒店预订')}</strong><em>住宿预订</em></div>
    <div class="link-analysis-readonly"><span>自动标题</span><strong>${escapeHtml(analysis.autoTitle || reference.autoTitle || reference.title || '未提取到标题')}</strong></div>
    <label class="field"><span>酒店名称</span><input name="analysisHotelName" maxlength="160" value="${attr(lodging.hotelName || '')}" /></label>
    <label class="field"><span>预订平台</span><input name="analysisBookingPlatform" maxlength="160" value="${attr(lodging.bookingPlatform || '')}" /></label>
    <label class="field"><span>位置名称</span><input name="analysisLocationName" maxlength="160" value="${attr(lodging.locationName || lodging.hotelName || '')}" /></label>
    <label class="field"><span>地址</span><input name="analysisAddress" maxlength="240" value="${attr(lodging.address || '')}" /></label>
  `;
}

function linkAnalysisResultHtml(result) {
  if (result?.type === 'location') return linkAnalysisLocationResultHtml(result);
  if (result?.type === 'booking') return linkAnalysisBookingResultHtml(result);
  return linkAnalysisReferenceResultHtml(result || {});
}

function linkAnalysisInitialResult(context, initial = {}) {
  if (initial.type === 'location') return initial;
  if (context === 'lodging' && (initial.bookingUrl || initial.value)) {
    return {
      type: 'booking',
      value: initial.bookingUrl || initial.value,
      analysis: {
        platformLabel: initial.bookingPlatform || '酒店预订',
        autoTitle: initial.autoTitle || initial.hotelName || ''
      },
      reference: {
        value: initial.bookingUrl || initial.value,
        autoTitle: initial.autoTitle || ''
      },
      lodging: {
        bookingPlatform: initial.bookingPlatform || '',
        bookingUrl: initial.bookingUrl || initial.value,
        hotelName: initial.hotelName || '',
        locationName: initial.locationName || '',
        address: initial.address || '',
        locationUid: initial.locationUid || '',
        latitude: initial.latitude ?? null,
        longitude: initial.longitude ?? null,
        coordType: initial.coordType || 'bd09ll'
      }
    };
  }
  if (initial.value) {
    return {
      type: 'reference',
      value: initial.value,
      analysis: {
        platform: initial.platform || detectReferencePlatform(initial.value),
        platformLabel: referencePlatformMeta(initial.platform || detectReferencePlatform(initial.value)).label,
        autoTitle: initial.autoTitle || '',
        displayTitle: initial.customTitle || '',
        appUrl: initial.appUrl || '',
        openMode: initial.appUrl ? 'app' : 'web'
      },
      reference: {
        value: initial.value,
        customTitle: initial.customTitle || '',
        autoTitle: initial.autoTitle || '',
        platform: initial.platform || detectReferencePlatform(initial.value),
        appUrl: initial.appUrl || ''
      }
    };
  }
  return null;
}

function openLinkAnalyzer({ context = 'reference', initial = {}, region = '', title = '添加链接', onApply }) {
  const modal = ensureLinkAnalyzer();
  const form = document.querySelector('#link-analyzer-form');
  const initialResult = linkAnalysisInitialResult(context, initial);

  document.querySelector('#link-analyzer-title').textContent = title;
  form.innerHTML = `
    <div class="stack">
      <div class="link-analysis-step">
        <span>1</span>
        <div><strong>粘贴链接</strong><small>系统会自动判断链接属于位置、酒店预订还是普通链接</small></div>
      </div>
      <div class="link-analysis-input-row">
        <input name="linkValue" inputmode="url" value="${attr(initial.bookingUrl || initial.value || '')}" placeholder="粘贴链接…" autocomplete="off" />
        <button class="button primary small" type="button" data-link-analyze>分析</button>
      </div>
      <div class="link-analysis-status" data-link-analysis-status>${initialResult ? '已加载现有信息，可重新分析' : '粘贴链接后自动分析'}</div>
      <div class="link-analysis-result ${initialResult ? '' : 'hidden'}" data-link-analysis-result>
        ${initialResult ? linkAnalysisResultHtml(initialResult) : ''}
      </div>
      <div class="link-analysis-actions ${initialResult ? '' : 'hidden'}" data-link-analysis-actions>
        <button class="button primary full" type="submit">应用分析结果</button>
      </div>
    </div>
  `;
  form.dataset.dirty = '0';
  form.dataset.hasAnalysis = initialResult ? '1' : '0';

  const resultBox = form.querySelector('[data-link-analysis-result]');
  const actionBox = form.querySelector('[data-link-analysis-actions]');
  const status = form.querySelector('[data-link-analysis-status]');
  const valueInput = form.querySelector('[name="linkValue"]');
  const analyzeButton = form.querySelector('[data-link-analyze]');

  const runAnalysis = async () => {
    const value = valueInput.value.trim();
    if (!value) return showToast('请先粘贴链接', 'error');
    analyzeButton.disabled = true;
    analyzeButton.textContent = '分析中…';
    status.textContent = '正在识别平台和内容…';
    try {
      const result = await api('/api/links/analyze', {
        method: 'POST',
        body: JSON.stringify({
          value,
          context,
          region: region || state.current?.trip?.destination || ''
        })
      });
      resultBox.innerHTML = linkAnalysisResultHtml(result);
      resultBox.classList.remove('hidden');
      actionBox.classList.remove('hidden');
      form.dataset.hasAnalysis = '1';
      form.dataset.dirty = '1';
      status.textContent = result.type === 'location'
        ? '已识别为位置，请确认位置名称和地址'
        : result.type === 'booking'
          ? '已识别为住宿预订，请确认酒店信息'
          : '已分析链接，请确认展示标题';
    } catch (error) {
      form.dataset.hasAnalysis = '0';
      actionBox.classList.add('hidden');
      status.textContent = error.message;
      showToast(error.message, 'error');
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.textContent = '分析';
    }
  };

  analyzeButton.addEventListener('click', () => runAnalysis());
  valueInput.addEventListener('paste', () => {
    setTimeout(() => {
      if (valueInput.value.trim()) runAnalysis();
    }, 0);
  });
  valueInput.addEventListener('input', () => {
    if (form.dataset.hasAnalysis === '1') status.textContent = '链接已修改，请重新分析';
  });
  form.addEventListener('input', event => {
    if (event.target !== valueInput) form.dataset.dirty = '1';
  });

  form.onsubmit = async event => {
    event.preventDefault();
    if (form.dataset.hasAnalysis !== '1') return runAnalysis();
    const data = new FormData(form);
    const type = String(data.get('analysisType') || 'reference');
    const value = valueInput.value.trim();

    let result;
    if (type === 'location') {
      result = {
        type,
        value,
        location: {
          name: String(data.get('analysisLocationName') || '').trim(),
          address: String(data.get('analysisAddress') || '').trim(),
          uid: String(data.get('analysisLocationUid') || '').trim(),
          latitude: data.get('analysisLatitude') === '' ? null : Number(data.get('analysisLatitude')),
          longitude: data.get('analysisLongitude') === '' ? null : Number(data.get('analysisLongitude')),
          coordType: String(data.get('analysisCoordType') || 'bd09ll')
        }
      };
    } else if (type === 'booking') {
      result = {
        type,
        value,
        reference: {
          value,
          customTitle: '',
          autoTitle: String(data.get('analysisAutoTitle') || '').trim()
        },
        lodging: {
          bookingUrl: value,
          bookingPlatform: String(data.get('analysisBookingPlatform') || '').trim(),
          hotelName: String(data.get('analysisHotelName') || '').trim(),
          locationName: String(data.get('analysisLocationName') || '').trim(),
          address: String(data.get('analysisAddress') || '').trim(),
          locationUid: String(data.get('analysisLocationUid') || '').trim(),
          latitude: data.get('analysisLatitude') === '' ? null : Number(data.get('analysisLatitude')),
          longitude: data.get('analysisLongitude') === '' ? null : Number(data.get('analysisLongitude')),
          coordType: String(data.get('analysisCoordType') || 'bd09ll')
        }
      };
    } else {
      result = {
        type: 'reference',
        value,
        reference: {
          value,
          customTitle: String(data.get('analysisDisplayTitle') || '').trim(),
          autoTitle: String(data.get('analysisAutoTitle') || '').trim(),
          platform: String(data.get('analysisPlatform') || detectReferencePlatform(value)),
          appUrl: String(data.get('analysisAppUrl') || '').trim()
        }
      };
    }

    await onApply?.(result);
    closeLinkAnalyzer(true);
  };

  document.querySelector('#link-analyzer-backdrop').classList.remove('hidden');
  modal.classList.remove('hidden');
  setTimeout(() => valueInput.focus(), 50);
  return form;
}
