/**
 * puzzlelist.js - 星罗六合 公共页面逻辑（增强调试版）
 * 支持首页和子页面，增加详细日志便于排查。
 */
(function() {
    'use strict';

    console.log('[puzzlelist] 开始执行');

    if (typeof window.STAR_SLUGS === 'undefined') {
        console.error('[puzzlelist] config.js 未加载或变量未暴露！');
        return;
    }

    const POINT_COUNT = window.STAR_SLUGS.length;
    const META_COUNT = window.META_SLUGS.length;
    const currentPage = window.location.pathname.split('/').pop() || '';

    console.log('[puzzlelist] 当前页面:', currentPage);
    console.log('[puzzlelist] STAR_SLUGS 长度:', POINT_COUNT);

    const isIndexPage = (currentPage === 'index.html' || currentPage === '');
    const isStarPage = /^star([A-K])\.html$/i.test(currentPage);
    const isMetaPage = /^meta([A-F])\.html$/i.test(currentPage);

    let currentStarIndex = -1;
    let currentMetaIndex = -1;

    if (isStarPage) {
        const match = currentPage.match(/^star([A-K])\.html$/i);
        const idx = match[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < POINT_COUNT) currentStarIndex = idx;
    } else if (isMetaPage) {
        const match = currentPage.match(/^meta([A-F])\.html$/i);
        const idx = match[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < META_COUNT) currentMetaIndex = idx;
    }

    console.log('[puzzlelist] 当前索引: star=', currentStarIndex, 'meta=', currentMetaIndex);

    let UNLOCK_KEY = 'unknown';
    if (currentStarIndex !== -1) {
        UNLOCK_KEY = window.getUnlockKey(currentStarIndex);
    } else if (currentMetaIndex !== -1) {
        UNLOCK_KEY = window.META_SLUGS[currentMetaIndex] + '_unlocked';
    }
    console.log('[puzzlelist] UNLOCK_KEY =', UNLOCK_KEY);

    // ---------- 子页面侧边栏渲染 ----------
    function renderNav() {
        const container = document.getElementById('navList');
        if (!container) {
            console.warn('[puzzlelist] 没有 #navList 元素，跳过侧边栏渲染');
            return;
        }
        console.log('[puzzlelist] 开始渲染侧边栏，容器:', container);

        container.innerHTML = '';
        console.log('[puzzlelist] 已清空容器');

        // 1. 生成 Star 列表
        console.log('[puzzlelist] 准备添加', POINT_COUNT, '个 star 项');
        for (let i = 0; i < POINT_COUNT; i++) {
            try {
                const unlocked = localStorage.getItem(window.getUnlockKey(i)) === 'true';
                const name = window.LEVEL_NAMES[i] || ('第' + (i + 1) + '关');
                const isActive = (i === currentStarIndex && currentMetaIndex === -1);
                const item = document.createElement('div');
                item.className = 'nav-item' + (isActive ? ' active' : '');
                item.dataset.index = i;
                item.innerHTML = `
                    <span class="status${unlocked ? ' done' : ''}">${unlocked ? '✅' : '☐'}</span>
                    <span class="name">${name}</span>
                    <span class="hint-arrow">→</span>
                `;
                item.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const idx = parseInt(this.dataset.index, 10);
                    if (!isNaN(idx)) window.location.href = window.getStarPath(idx);
                });
                container.appendChild(item);
                console.log('[puzzlelist] 添加 star 项:', i, name);
            } catch (e) {
                console.error('[puzzlelist] 添加 star 项时出错 (i=' + i + '):', e);
            }
        }

        // 2. Meta 列表（根据 lineCount）
        const lineCount = parseInt(localStorage.getItem('lineCount') || '0', 10);
        console.log('[puzzlelist] lineCount =', lineCount);
        if (lineCount > 0) {
            const divider = document.createElement('hr');
            divider.className = 'nav-divider';
            container.appendChild(divider);

            const metaLabel = document.createElement('div');
            metaLabel.className = 'nav-meta-label';
            metaLabel.textContent = '✦ 阵法共鸣';
            container.appendChild(metaLabel);

            const showCount = Math.min(lineCount, META_COUNT);
            for (let i = 0; i < showCount; i++) {
                try {
                    const unlocked = localStorage.getItem(window.META_SLUGS[i] + '_unlocked') === 'true';
                    const name = window.META_NAMES[i];
                    const isActive = (i === currentMetaIndex);
                    const item = document.createElement('div');
                    item.className = 'nav-item' + (isActive ? ' active' : '');
                    item.dataset.index = i;
                    item.innerHTML = `
                        <span class="status${unlocked ? ' done' : ''}">${unlocked ? '✅' : '☐'}</span>
                        <span class="name">${name}</span>
                        <span class="hint-arrow">→</span>
                    `;
                    item.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const idx = parseInt(this.dataset.index, 10);
                        if (!isNaN(idx)) window.location.href = window.getMetaPath(idx);
                    });
                    container.appendChild(item);
                    console.log('[puzzlelist] 添加 meta 项:', i, name);
                } catch (e) {
                    console.error('[puzzlelist] 添加 meta 项时出错 (i=' + i + '):', e);
                }
            }
        }

        console.log('[puzzlelist] 侧边栏渲染完成，当前子节点数:', container.children.length);
    }

    // ---------- 首页列表渲染 ----------
    function renderIndexList() {
        const container = document.getElementById('levelList');
        if (!container) {
            console.warn('[puzzlelist] 没有 #levelList 元素，跳过首页列表渲染');
            return;
        }
        console.log('[puzzlelist] 开始渲染首页列表');

        // 清空容器，但保留可能由 game.js 添加的其他内容？我们只管理 .level-items 和 .meta-items
        // 为了安全，我们删除所有子元素并重新构建
        container.innerHTML = '';

        const starContainer = document.createElement('div');
        starContainer.className = 'level-items';
        starContainer.id = 'starLevelItems';

        for (let i = 0; i < POINT_COUNT; i++) {
            try {
                const unlocked = localStorage.getItem(window.getUnlockKey(i)) === 'true';
                const name = window.LEVEL_NAMES[i] || ('第' + (i + 1) + '关');
                const item = document.createElement('div');
                item.className = 'level-item';
                item.dataset.index = i;
                item.innerHTML = `
                    <span class="status${unlocked ? ' done' : ''}">${unlocked ? '✅' : '☐'}</span>
                    <span class="name">${name}</span>
                    <span class="hint-arrow">→</span>
                `;
                item.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const idx = parseInt(this.dataset.index, 10);
                    if (!isNaN(idx)) window.location.href = window.getStarPath(idx);
                });
                starContainer.appendChild(item);
            } catch (e) {
                console.error('[puzzlelist] 首页 star 项出错 (i=' + i + '):', e);
            }
        }
        container.appendChild(starContainer);

        const lineCount = parseInt(localStorage.getItem('lineCount') || '0', 10);
        const metaContainer = document.createElement('div');
        metaContainer.className = 'meta-items' + (lineCount > 0 ? ' visible' : '');
        metaContainer.id = 'metaLevelItems';

        if (lineCount > 0) {
            const showCount = Math.min(lineCount, META_COUNT);
            for (let i = 0; i < showCount; i++) {
                try {
                    const unlocked = localStorage.getItem(window.META_SLUGS[i] + '_unlocked') === 'true';
                    const name = window.META_NAMES[i];
                    const item = document.createElement('div');
                    item.className = 'level-item meta-item';
                    item.dataset.index = i;
                    item.innerHTML = `
                        <span class="status${unlocked ? ' done' : ''}">${unlocked ? '✅' : '☐'}</span>
                        <span class="name">${name}</span>
                        <span class="hint-arrow">→</span>
                    `;
                    item.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const idx = parseInt(this.dataset.index, 10);
                        if (!isNaN(idx)) window.location.href = window.getMetaPath(idx);
                    });
                    metaContainer.appendChild(item);
                } catch (e) {
                    console.error('[puzzlelist] 首页 meta 项出错 (i=' + i + '):', e);
                }
            }
        }
        container.appendChild(metaContainer);

        console.log('[puzzlelist] 首页列表渲染完成');
    }

    // ---------- 子页面功能 ----------
    function setPageTitle() {
        const titleEl = document.getElementById('pageTitle');
        if (!titleEl) return;
        let displayName = '';
        if (currentStarIndex !== -1) {
            displayName = window.LEVEL_NAMES[currentStarIndex] || ('第' + (currentStarIndex + 1) + '关');
        } else if (currentMetaIndex !== -1) {
            displayName = window.META_NAMES[currentMetaIndex] || ('共鸣·' + (currentMetaIndex + 1));
        } else {
            displayName = '未羊秘境';
        }
        titleEl.textContent = displayName;
        document.title = displayName + ' · 星罗六合';
        console.log('[puzzlelist] 设置页面标题:', displayName);
    }

    function checkUnlocked() {
        const inputEl = document.getElementById('answerInput');
        const submitBtn = document.getElementById('submitBtn');
        if (!inputEl || !submitBtn) return false;
        const unlocked = localStorage.getItem(UNLOCK_KEY) === 'true';
        if (unlocked) {
            inputEl.disabled = true;
            inputEl.placeholder = '✓ 已通关';
            submitBtn.disabled = true;
        } else {
            inputEl.disabled = false;
            inputEl.placeholder = '输入通关密语…';
            submitBtn.disabled = false;
        }
        console.log('[puzzlelist] 检查解锁状态:', unlocked ? '已解锁' : '未解锁');
        return unlocked;
    }

    function tryUnlock() {
        const inputEl = document.getElementById('answerInput');
        if (!inputEl) return;
        if (localStorage.getItem(UNLOCK_KEY) === 'true') {
            inputEl.placeholder = '✓ 已通关';
            return;
        }
        if (inputEl.value.trim() === 'answer') {
            localStorage.setItem(UNLOCK_KEY, 'true');
            inputEl.disabled = true;
            inputEl.placeholder = '✓ 已通关';
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) submitBtn.disabled = true;
            renderNav();
        } else {
            inputEl.value = '';
            inputEl.focus();
            inputEl.style.borderColor = 'rgba(220,80,80,0.5)';
            setTimeout(() => { inputEl.style.borderColor = ''; }, 500);
        }
    }

    function goBack() {
        window.location.href = '../index.html';
    }

    // ---------- 根据页面类型执行初始化 ----------
    if (isIndexPage) {
        console.log('[puzzlelist] 首页模式');
        renderIndexList();
        // 暴露刷新函数给 game.js 调用
        window.refreshIndexList = function() {
            renderIndexList();
        };
    } else if (isStarPage || isMetaPage) {
        console.log('[puzzlelist] 子页面模式');
        setPageTitle();
        renderNav();
        checkUnlocked();

        // 绑定事件
        const inputEl = document.getElementById('answerInput');
        const submitBtn = document.getElementById('submitBtn');
        const backBtn = document.getElementById('backBtn');

        if (submitBtn) submitBtn.addEventListener('click', tryUnlock);
        if (inputEl) {
            inputEl.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    tryUnlock();
                }
            });
        }
        if (backBtn) backBtn.addEventListener('click', goBack);

        function refresh() {
            checkUnlocked();
            renderNav();
        }
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') refresh();
        });
        window.addEventListener('focus', refresh);
    } else {
        console.warn('[puzzlelist] 未知页面类型，不执行任何操作');
    }

    console.log('[puzzlelist] 初始化完成');
})();