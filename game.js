// ================================================================
//  game.js  —  未羊秘境 · 星罗六合阵 核心逻辑
//  依赖：config.js（提供 STAR_SLUGS, META_SLUGS, LEVEL_NAMES,
//        META_NAMES, getStarPath, getMetaPath, getUnlockKey）
// ================================================================

(function() {
    'use strict';

    // ---------- 固定参数 ----------
    const POINT_COUNT = 11;
    const POINT_SIZE = 22;
    const COLLINEAR_THRESHOLD = 3;

    // ---------- DOM 引用 ----------
    const canvas = document.getElementById('canvasArea');
    const lineCanvas = document.getElementById('lineCanvas');
    const ctx = lineCanvas.getContext('2d');
    const completionSpan = document.getElementById('completionCount');
    const levelListEl = document.getElementById('levelList');
    const resetBtn = document.getElementById('resetBtn');
    const debugResetBtn = document.getElementById('debugResetBtn');

    // ---------- 状态 ----------
    const points = [];
    let initialPositions = [];
    let dragState = null;
    let resizeTimer = null;

    // ==============================================================
    //  存储工具（位置、解锁状态）
    // ==============================================================
    const STORAGE_KEY_POSITIONS = 'star_positions';
    const STORAGE_KEY_INITIAL = 'star_positions_initial';

    function savePositionsToStorage() {
        const data = points.map(p => ({ x: p.x, y: p.y }));
        try { localStorage.setItem(STORAGE_KEY_POSITIONS, JSON.stringify(data)); } catch (e) {}
    }

    function loadPositionsFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_POSITIONS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length === POINT_COUNT) {
                    return parsed;
                }
            }
        } catch (e) {}
        return null;
    }

    function saveInitialPositionsToStorage() {
        try { localStorage.setItem(STORAGE_KEY_INITIAL, JSON.stringify(initialPositions)); } catch (e) {}
    }

    function loadInitialPositionsFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_INITIAL);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length === POINT_COUNT) {
                    return parsed;
                }
            }
        } catch (e) {}
        return null;
    }

    function saveContainerMeta() {
        try {
            localStorage.setItem('star_positions_meta', JSON.stringify({
                width: canvas.clientWidth,
                height: canvas.clientHeight
            }));
        } catch (e) {}
    }

    // 根据当前容器尺寸适配保存的位置（按比例缩放）
    function adaptPositionsToContainer(savedPositions, currentWidth, currentHeight) {
        let savedWidth = currentWidth, savedHeight = currentHeight;
        try {
            const meta = localStorage.getItem('star_positions_meta');
            if (meta) {
                const m = JSON.parse(meta);
                if (m.width && m.height) {
                    savedWidth = m.width;
                    savedHeight = m.height;
                }
            }
        } catch (e) {}

        const scaleX = currentWidth / savedWidth;
        const scaleY = currentHeight / savedHeight;
        const half = POINT_SIZE / 2;
        const maxX = currentWidth - half;
        const maxY = currentHeight - half;

        return savedPositions.map(p => {
            let x = p.x * scaleX;
            let y = p.y * scaleY;
            x = Math.max(half, Math.min(maxX, x));
            y = Math.max(half, Math.min(maxY, y));
            return { x, y };
        });
    }

    // -------- 解锁状态 --------
    function loadUnlockStates() {
        const states = [];
        for (let i = 0; i < POINT_COUNT; i++) {
            const val = localStorage.getItem(window.getUnlockKey(i));
            states.push(val === 'true');
        }
        return states;
    }

    function refreshUnlockStates() {
        const states = loadUnlockStates();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const shouldUnlock = states[i] || false;
            if (p.unlocked !== shouldUnlock) {
                p.unlocked = shouldUnlock;
                if (shouldUnlock) {
                    p.el.classList.add('unlocked');
                    p.el.classList.remove('just-unlocked');
                    p.el.classList.add('just-unlocked');
                    setTimeout(() => p.el.classList.remove('just-unlocked'), 700);
                } else {
                    p.el.classList.remove('unlocked', 'just-unlocked');
                }
            }
        }
        updateLevelList();
        updateLines();
    }

    // ==============================================================
    //  位置生成
    // ==============================================================
    function generatePositions(count, containerWidth, containerHeight) {
        const positions = [];
        const cx = containerWidth / 2;
        const cy = containerHeight / 2;
        const radius = Math.min(containerWidth, containerHeight) * 0.36;

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
            let x = cx + radius * Math.cos(angle);
            let y = cy + radius * Math.sin(angle);
            const half = POINT_SIZE / 2;
            x = Math.max(half, Math.min(containerWidth - half, x));
            y = Math.max(half, Math.min(containerHeight - half, y));
            positions.push({ x, y });
        }
        return positions;
    }

    // ==============================================================
    //  画布尺寸管理
    // ==============================================================
    function ensureCanvasSize() {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (lineCanvas.width !== w || lineCanvas.height !== h) {
            lineCanvas.width = w;
            lineCanvas.height = h;
        }
    }

    // ==============================================================
    //  共线检测与绘制
    // ==============================================================
    function detectCollinearLines(pts) {
        const n = pts.length;
        const candidates = [];

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const p1 = pts[i];
                const p2 = pts[j];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) continue;

                const A = dy;
                const B = -dx;
                const C = -(A * p1.x + B * p1.y);
                const norm = Math.sqrt(A * A + B * B);
                if (norm < 1e-6) continue;
                const a = A / norm;
                const b = B / norm;
                const c = C / norm;

                const indices = [];
                for (let m = 0; m < n; m++) {
                    const p = pts[m];
                    const dist = Math.abs(a * p.x + b * p.y + c);
                    if (dist < COLLINEAR_THRESHOLD) {
                        indices.push(m);
                    }
                }
                if (indices.length >= 4) {
                    candidates.push(new Set(indices));
                }
            }
        }

        // 合并重叠线条
        let merged = [];
        for (let set of candidates) {
            let mergedWith = false;
            for (let i = 0; i < merged.length; i++) {
                const existing = merged[i];
                let intersectCount = 0;
                for (let idx of set) {
                    if (existing.has(idx)) intersectCount++;
                }
                if (intersectCount >= 2) {
                    for (let idx of set) {
                        existing.add(idx);
                    }
                    mergedWith = true;
                    break;
                }
            }
            if (!mergedWith) {
                merged.push(new Set(set));
            }
        }

        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < merged.length; i++) {
                for (let j = i + 1; j < merged.length; j++) {
                    const setA = merged[i];
                    const setB = merged[j];
                    let intersectCount = 0;
                    for (let idx of setA) {
                        if (setB.has(idx)) intersectCount++;
                    }
                    if (intersectCount >= 2) {
                        for (let idx of setB) {
                            setA.add(idx);
                        }
                        merged.splice(j, 1);
                        changed = true;
                        break;
                    }
                }
                if (changed) break;
            }
        }

        return merged;
    }

    function drawLines(lines, pts) {
        ensureCanvasSize();
        ctx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
        if (lines.length === 0) return;

        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 0.85;

        for (let set of lines) {
            const arr = Array.from(set);
            if (arr.length < 2) continue;
            const pointList = arr.map(idx => pts[idx]);
            let maxDist = -1;
            let p1 = pointList[0], p2 = pointList[0];
            for (let i = 0; i < pointList.length; i++) {
                for (let j = i + 1; j < pointList.length; j++) {
                    const d = Math.hypot(pointList[i].x - pointList[j].x, pointList[i].y - pointList[j].y);
                    if (d > maxDist) {
                        maxDist = d;
                        p1 = pointList[i];
                        p2 = pointList[j];
                    }
                }
            }
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 1) continue;
            const ex = dx / len;
            const ey = dy / len;
            const extend = 25;
            const x1 = p1.x - ex * extend;
            const y1 = p1.y - ey * extend;
            const x2 = p2.x + ex * extend;
            const y2 = p2.y + ey * extend;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.restore();
    }

    function updateLines() {
        const pts = points.map(p => ({ x: p.x, y: p.y, id: p.id }));
        const lines = detectCollinearLines(pts);
        drawLines(lines, pts);
        const count = lines.length;
        completionSpan.textContent = count;
        localStorage.setItem('lineCount', count);
        renderMetaItems(count);
    }

    // ==============================================================
    //  渲染关卡列表 & Meta
    // ==============================================================
    function renderMetaItems(lineCount) {
        const metaContainer = document.getElementById('metaItems');
        if (!metaContainer) return;
        metaContainer.innerHTML = '';

        if (lineCount === 0) {
            metaContainer.classList.remove('visible');
            return;
        }

        metaContainer.classList.add('visible');
        const showCount = Math.min(lineCount, window.META_SLUGS.length);
        for (let i = 0; i < showCount; i++) {
            const unlocked = localStorage.getItem(window.META_SLUGS[i] + '_unlocked') === 'true';

            const item = document.createElement('div');
            item.className = 'level-item meta-item';
            item.dataset.metaIndex = i;

            const statusSpan = document.createElement('span');
            statusSpan.className = 'status' + (unlocked ? ' done' : '');
            statusSpan.textContent = unlocked ? '✅' : '☐';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = window.META_NAMES[i];

            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'hint-arrow';
            arrowSpan.textContent = '→';

            item.appendChild(statusSpan);
            item.appendChild(nameSpan);
            item.appendChild(arrowSpan);

            item.addEventListener('click', function(e) {
                e.stopPropagation();
                const idx = parseInt(this.dataset.metaIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < window.META_SLUGS.length) {
                    window.location.href = window.getMetaPath(idx);
                }
            });

            metaContainer.appendChild(item);
        }
    }

    function updateLevelList() {
        const levelContainer = document.getElementById('levelItems');
        if (!levelContainer) return;
        levelContainer.innerHTML = '';

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const item = document.createElement('div');
            item.className = 'level-item';
            item.dataset.pointIndex = i;

            const statusSpan = document.createElement('span');
            statusSpan.className = 'status';
            if (p.unlocked) {
                statusSpan.textContent = '✅';
                statusSpan.classList.add('done');
            } else {
                statusSpan.textContent = '☐';
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = window.LEVEL_NAMES[i] || ('第' + (i + 1) + '关');

            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'hint-arrow';
            arrowSpan.textContent = '→';

            item.appendChild(statusSpan);
            item.appendChild(nameSpan);
            item.appendChild(arrowSpan);

            item.addEventListener('click', function(e) {
                e.stopPropagation();
                const idx = parseInt(this.dataset.pointIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < window.STAR_SLUGS.length) {
                    window.location.href = window.getStarPath(idx);
                }
            });

            levelContainer.appendChild(item);
        }
    }

    // ==============================================================
    //  重置位置
    // ==============================================================
    function resetPositions() {
        if (!initialPositions.length) return;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            p.x = initialPositions[i].x;
            p.y = initialPositions[i].y;
            p.el.style.left = p.x + 'px';
            p.el.style.top = p.y + 'px';
            p.el.classList.remove('dragging', 'just-unlocked');
        }
        savePositionsToStorage();
        saveContainerMeta();
        updateLines();
        updateLevelList();
    }

    // ==============================================================
    //  点交互（点击 / 拖拽）
    // ==============================================================
    function handlePointClick(e) {
        e.stopPropagation();
        const el = e.currentTarget;
        const index = parseInt(el.dataset.index, 10);
        if (isNaN(index) || index < 0 || index >= points.length) return;
        if (dragState && dragState.pointIndex === index && dragState.started) return;
        if (window.__justDragged) return;

        const path = window.getStarPath(index);
        if (path !== '#') window.location.href = path;
    }

    function handleMouseDown(e) {
        const el = e.currentTarget;
        const index = parseInt(el.dataset.index, 10);
        const point = points[index];
        if (!point || !point.unlocked) return;

        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.clientWidth / rect.width;
        const scaleY = canvas.clientHeight / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        dragState = {
            pointIndex: index,
            offsetX: point.x - mouseX,
            offsetY: point.y - mouseY,
            started: false,
        };

        el.classList.add('dragging');
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e) {
        if (!dragState) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.clientWidth / rect.width;
        const scaleY = canvas.clientHeight / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        const idx = dragState.pointIndex;
        const point = points[idx];
        if (!point) return;

        dragState.started = true;

        let newX = mouseX + dragState.offsetX;
        let newY = mouseY + dragState.offsetY;

        const half = POINT_SIZE / 2;
        const maxX = canvas.clientWidth - half;
        const maxY = canvas.clientHeight - half;
        newX = Math.max(half, Math.min(maxX, newX));
        newY = Math.max(half, Math.min(maxY, newY));

        point.x = newX;
        point.y = newY;
        point.el.style.left = newX + 'px';
        point.el.style.top = newY + 'px';

        updateLines();
    }

    function handleMouseUp(e) {
        if (!dragState) return;
        const idx = dragState.pointIndex;
        const point = points[idx];
        if (point) {
            point.el.classList.remove('dragging');
        }
        const wasDragging = dragState.started;
        dragState = null;
        if (wasDragging) {
            savePositionsToStorage();
            saveContainerMeta();
            window.__justDragged = true;
            setTimeout(() => { window.__justDragged = false; }, 50);
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        updateLines();
    }

    // ==============================================================
    //  创建阵点
    // ==============================================================
    function createPoints() {
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;

        // 生成初始位置
        const genPositions = generatePositions(POINT_COUNT, cw, ch);
        initialPositions = genPositions.slice();
        saveInitialPositionsToStorage();

        // 尝试从存储加载用户保存的位置
        let savedPositions = loadPositionsFromStorage();
        let finalPositions = null;

        if (savedPositions) {
            finalPositions = adaptPositionsToContainer(savedPositions, cw, ch);
        } else {
            finalPositions = genPositions.slice();
        }

        saveContainerMeta();

        // 清除旧点
        canvas.querySelectorAll('.point').forEach(el => el.remove());
        points.length = 0;

        const unlockStates = loadUnlockStates();

        for (let i = 0; i < POINT_COUNT; i++) {
            const pos = finalPositions[i];
            const el = document.createElement('div');
            el.className = 'point';
            el.dataset.index = i;
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';
            el.title = window.LEVEL_NAMES[i] || ('第' + (i + 1) + '关');

            const unlocked = unlockStates[i] || false;
            const pointData = { el, x: pos.x, y: pos.y, unlocked, id: i };
            points.push(pointData);

            if (unlocked) el.classList.add('unlocked');

            el.addEventListener('click', handlePointClick);
            el.addEventListener('mousedown', handleMouseDown);
            canvas.appendChild(el);
        }

        updateLevelList();
        updateLines();
    }

    // ==============================================================
    //  窗口自适应
    // ==============================================================
    function handleResize() {
        if (resizeTimer) {
            cancelAnimationFrame(resizeTimer);
            resizeTimer = null;
        }
        resizeTimer = requestAnimationFrame(() => {
            const cw = canvas.clientWidth;
            const ch = canvas.clientHeight;

            const unlockStates = points.map(p => p.unlocked);
            canvas.querySelectorAll('.point').forEach(el => el.remove());
            points.length = 0;

            let savedPositions = loadPositionsFromStorage();
            let finalPositions = null;

            if (savedPositions) {
                finalPositions = adaptPositionsToContainer(savedPositions, cw, ch);
            } else if (initialPositions.length === POINT_COUNT) {
                finalPositions = adaptPositionsToContainer(initialPositions, cw, ch);
            } else {
                finalPositions = generatePositions(POINT_COUNT, cw, ch);
            }

            saveContainerMeta();

            for (let i = 0; i < POINT_COUNT; i++) {
                const pos = finalPositions[i];
                const el = document.createElement('div');
                el.className = 'point';
                el.dataset.index = i;
                el.style.left = pos.x + 'px';
                el.style.top = pos.y + 'px';
                el.title = window.LEVEL_NAMES[i] || ('第' + (i + 1) + '关');

                const unlocked = unlockStates[i] || false;
                const pointData = { el, x: pos.x, y: pos.y, unlocked, id: i };
                points.push(pointData);

                if (unlocked) el.classList.add('unlocked');

                el.addEventListener('click', handlePointClick);
                el.addEventListener('mousedown', handleMouseDown);
                canvas.appendChild(el);
            }

            if (initialPositions.length !== POINT_COUNT) {
                const gen = generatePositions(POINT_COUNT, cw, ch);
                initialPositions = gen.slice();
                saveInitialPositionsToStorage();
            }

            ensureCanvasSize();
            updateLevelList();
            updateLines();
            resizeTimer = null;
        });
    }

    // ==============================================================
    //  初始化容器（levelItems + metaItems）
    // ==============================================================
    function initContainers() {
        levelListEl.innerHTML = '';
        const levelContainer = document.createElement('div');
        levelContainer.id = 'levelItems';
        levelContainer.className = 'level-items';
        const metaContainer = document.createElement('div');
        metaContainer.id = 'metaItems';
        metaContainer.className = 'meta-items';
        levelListEl.appendChild(levelContainer);
        levelListEl.appendChild(metaContainer);
    }

    // ==============================================================
    //  启动
    // ==============================================================
    function init() {
        initContainers();
        ensureCanvasSize();

        // 加载初始位置
        const storedInitial = loadInitialPositionsFromStorage();
        if (storedInitial && storedInitial.length === POINT_COUNT) {
            initialPositions = storedInitial.slice();
        } else {
            const cw = canvas.clientWidth;
            const ch = canvas.clientHeight;
            const gen = generatePositions(POINT_COUNT, cw, ch);
            initialPositions = gen.slice();
            saveInitialPositionsToStorage();
        }

        createPoints();
        refreshUnlockStates();

        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => handleResize());
            ro.observe(canvas);
        } else {
            window.addEventListener('resize', handleResize);
        }

        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') refreshUnlockStates();
        });
        window.addEventListener('focus', function() {
            refreshUnlockStates();
        });

        requestAnimationFrame(() => {
            ensureCanvasSize();
            updateLines();
        });

        resetBtn.addEventListener('click', resetPositions);

        // 调试按钮：重置所有进度
        if (debugResetBtn) {
            debugResetBtn.addEventListener('click', function() {
                if (confirm('确定要重置所有关卡开启状态和星星位置吗？此操作不可撤销！')) {
                    for (let i = 0; i < POINT_COUNT; i++) {
                        localStorage.removeItem(window.getUnlockKey(i));
                    }
                    if (window.META_SLUGS) {
                        for (let i = 0; i < window.META_SLUGS.length; i++) {
                            localStorage.removeItem(window.META_SLUGS[i] + '_unlocked');
                        }
                    }
                    localStorage.removeItem(STORAGE_KEY_POSITIONS);
                    localStorage.removeItem(STORAGE_KEY_INITIAL);
                    localStorage.removeItem('star_positions_meta');
                    localStorage.removeItem('lineCount');
                    location.reload();
                }
            });
        }

        // 暴露调试接口
        window.__points = points;
        window.__refreshUnlock = refreshUnlockStates;
    }

    // 当页面完全加载后执行
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();