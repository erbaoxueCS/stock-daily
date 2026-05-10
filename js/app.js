(function() {
  'use strict';

  let allData = null;
  let activeCategoryIdx = 0;

  // DOM refs
  const updateTimeEl = document.getElementById('updateTime');
  const summaryTextEl = document.getElementById('summaryText');
  const categoryTabsEl = document.getElementById('categoryTabs');
  const stockGridEl = document.getElementById('stockGrid');
  const emptyStateEl = document.getElementById('emptyState');
  const riskWarningEl = document.getElementById('riskWarning');
  const activeCatTitleEl = document.querySelector('#activeCategoryTitle h2');
  const activeCatDescEl = document.querySelector('#activeCategoryTitle p');

  // ============ Data Loading ============

  async function loadData() {
    try {
      const resp = await fetch('data/recommendations.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      allData = await resp.json();
      renderAll();
    } catch (err) {
      console.error('加载推荐数据失败:', err);
      showError('数据加载失败，请稍后刷新页面。若问题持续，可能是今日数据尚未生成。');
    }
  }

  // ============ Rendering ============

  function renderAll() {
    if (!allData) return;

    renderUpdateTime();
    renderSummary();
    renderTabs();
    renderCategory(0);
    renderRisk();
  }

  function renderUpdateTime() {
    updateTimeEl.textContent = '🕐 更新于 ' + (allData.updateTime || '--');
  }

  function renderSummary() {
    summaryTextEl.textContent = allData.marketSummary || '数据加载中...';
  }

  function renderTabs() {
    const categories = allData.categories || [];
    if (categories.length === 0) {
      categoryTabsEl.innerHTML = '';
      return;
    }

    categoryTabsEl.innerHTML = categories.map((cat, idx) => {
      const isActive = idx === activeCategoryIdx ? ' active' : '';
      return `
        <button class="tab-btn${isActive}" data-index="${idx}">
          <span class="tab-icon">${cat.icon || '📌'}</span>
          <span>${cat.name}</span>
          <span class="tab-count">${cat.stocks.length}只</span>
        </button>
      `;
    }).join('');

    // Add event listeners
    categoryTabsEl.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.index);
        if (idx !== activeCategoryIdx) {
          activeCategoryIdx = idx;
          renderTabs();
          renderCategory(idx);
        }
      });
    });
  }

  function renderCategory(idx) {
    const categories = allData.categories || [];
    if (categories.length === 0) {
      stockGridEl.innerHTML = '';
      emptyStateEl.style.display = 'block';
      activeCatTitleEl.textContent = '';
      activeCatDescEl.textContent = '';
      return;
    }

    emptyStateEl.style.display = 'none';
    const cat = categories[idx] || categories[0];

    activeCatTitleEl.textContent = (cat.icon || '') + ' ' + cat.name;
    activeCatDescEl.textContent = cat.description || '';

    const stocks = cat.stocks || [];
    if (stocks.length === 0) {
      stockGridEl.innerHTML = '<div class="empty-state"><p>该类别暂无推荐</p></div>';
      return;
    }

    stockGridEl.innerHTML = stocks.map(stock => {
      const changeClass = stock.change > 0 ? 'up' : stock.change < 0 ? 'down' : 'flat';
      const changeSign = stock.change > 0 ? '+' : '';
      return `
        <div class="stock-card">
          <div class="stock-card-header">
            <div class="stock-info">
              <div class="stock-name">${stock.name}</div>
              <div class="stock-code">${stock.code}</div>
            </div>
            <div class="stock-price-area">
              <div class="stock-price">¥${stock.price.toFixed(2)}</div>
              <span class="stock-change ${changeClass}">${changeSign}${stock.change.toFixed(2)}%</span>
            </div>
          </div>
          <div class="stock-reason">${stock.reason}</div>
        </div>
      `;
    }).join('');
  }

  function renderRisk() {
    riskWarningEl.innerHTML = `<p>${allData.riskWarning || '本推荐仅供参考，不构成投资建议。股市有风险，投资需谨慎。'}</p>`;
  }

  function showError(msg) {
    stockGridEl.innerHTML = `
      <div class="loading-card">
        <p>${msg}</p>
      </div>
    `;
    updateTimeEl.textContent = '⚠️ 数据加载失败';
    summaryTextEl.textContent = '数据暂时不可用，请稍后刷新...';
    categoryTabsEl.innerHTML = '';
    activeCatTitleEl.textContent = '';
    activeCatDescEl.textContent = '';
    riskWarningEl.innerHTML = '<p>数据获取异常，推荐内容无法显示</p>';
  }

  // ============ Init ============
  loadData();

  // Expose manual refresh
  window.refreshRecommendations = loadData;
})();
