'use strict';

// ── State ──────────────────────────────────────────────
let board        = null;
let answers      = null;
let boardSize    = 10;
let answered     = false;
let pendingCells = [];
let pendingDir   = null;
let foundIndices = [];
let gameFinished = false;

// タイマー
let timerInterval  = null;
let timerStartTime = null;

// ── DOM ────────────────────────────────────────────────
const boardSizeEl        = document.getElementById('boardSize');
const startBtn           = document.getElementById('startBtn');
const regenBtn           = document.getElementById('regenBtn');
const resetBtn           = document.getElementById('resetBtn');
const gameSection        = document.getElementById('gameSection');
const boardEl            = document.getElementById('board');
const svgOverlay         = document.getElementById('svgOverlay');
const boardWrapper       = document.getElementById('boardWrapper');
const foundCountEl       = document.getElementById('foundCountEl');
const timerEl            = document.getElementById('timerEl');
const clearBtn           = document.getElementById('clearBtn');
const finishBtn          = document.getElementById('finishBtn');
const errorMsg           = document.getElementById('errorMsg');
const resultSection      = document.getElementById('resultSection');
const foundCountResultEl = document.getElementById('foundCountResultEl');
const totalCountResultEl = document.getElementById('totalCountResultEl');
const clearTimeEl        = document.getElementById('clearTimeEl');
const verdictEl          = document.getElementById('verdictEl');
const messageEl          = document.getElementById('messageEl');
const nextBtn            = document.getElementById('nextBtn');
const shareBtn           = document.getElementById('shareBtn');

// 矢印の色（最大10色でサイクル）
const LINE_COLORS = [
    '#e53935', '#1e88e5', '#43a047', '#fb8c00',
    '#8e24aa', '#00acc1', '#e91e63', '#f9a825',
    '#00897b', '#6d4c41',
];

// ── ターゲット個数（期待値の四捨五入、最低1個） ──────────
// E(N) = 4(N-3)(2N-3)/81
function getTargetCount(n) {
    const expected = 4 * (n - 3) * (2 * n - 3) / 81;
    return Math.max(1, Math.round(expected));
}

// ── タイマー ───────────────────────────────────────────
function startTimer() {
    stopTimer();
    timerStartTime = performance.now();
    timerEl.textContent = '0.0';
    timerInterval = setInterval(() => {
        const sec = (performance.now() - timerStartTime) / 1000;
        timerEl.textContent = sec.toFixed(1);
    }, 100);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (timerStartTime === null) return 0;
    return (performance.now() - timerStartTime) / 1000;
}

// ── イベント ───────────────────────────────────────────
startBtn.addEventListener('click', startGame);
regenBtn.addEventListener('click', newBoard);
resetBtn.addEventListener('click', newBoard);
finishBtn.addEventListener('click', finishGame);
clearBtn.addEventListener('click', () => clearPending());
nextBtn.addEventListener('click', newBoard);

boardEl.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell || gameFinished) return;
    handleCellClick(
        parseInt(cell.dataset.row, 10),
        parseInt(cell.dataset.col, 10)
    );
});

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (!board) return;
        renderBoard(board);
        requestAnimationFrame(() => {
            reapplyCellClasses();
            foundIndices.forEach((ansIdx, i) =>
                drawSingleArrow(answers[ansIdx], LINE_COLORS[i % LINE_COLORS.length])
            );
            if (gameFinished) {
                answers.forEach((a, i) => {
                    if (!foundIndices.includes(i)) drawSingleArrow(a, '#aaaaaa');
                });
            }
        });
    }, 150);
});

// ── 盤面生成 ───────────────────────────────────────────
function generateBoard(size) {
    const chars = ['志', '布', '市'];
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => chars[Math.floor(Math.random() * 3)])
    );
}

// ── 正解探索（8方向） ──────────────────────────────────
function findAnswers(b) {
    const size   = b.length;
    const target = ['志', '布', '志', '市'];
    const dirs   = [
        [ 0,  1], [ 0, -1], [ 1,  0], [-1,  0],
        [ 1,  1], [-1, -1], [-1,  1], [ 1, -1],
    ];
    const result = [];

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (b[r][c] !== '志') continue;
            for (const [dr, dc] of dirs) {
                let valid = true;
                for (let i = 0; i < 4; i++) {
                    const nr = r + dr * i, nc = c + dc * i;
                    if (nr < 0 || nr >= size || nc < 0 || nc >= size || b[nr][nc] !== target[i]) {
                        valid = false; break;
                    }
                }
                if (valid) result.push({
                    startRow: r, startCol: c,
                    endRow: r + dr * 3, endCol: c + dc * 3,
                });
            }
        }
    }
    return result;
}

// ── セルサイズ計算 ─────────────────────────────────────
function calcCellSize(size) {
    const maxW = Math.min(window.innerWidth - 40, 620);
    return Math.max(Math.floor((maxW - 4) / size), 20);
}

// ── 盤面描画 ───────────────────────────────────────────
function renderBoard(b) {
    const size = b.length;
    const cs   = calcCellSize(size);
    const fs   = Math.max(Math.floor(cs * 0.55), 11);

    boardEl.style.gridTemplateColumns = `repeat(${size}, ${cs}px)`;
    boardEl.style.gridTemplateRows    = `repeat(${size}, ${cs}px)`;
    boardEl.innerHTML = '';

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.textContent = b[r][c];
            cell.style.width    = `${cs}px`;
            cell.style.height   = `${cs}px`;
            cell.style.fontSize = `${fs}px`;
            cell.dataset.row = r;
            cell.dataset.col = c;
            boardEl.appendChild(cell);
        }
    }
    svgOverlay.innerHTML = '';
}

// ── ユーティリティ ─────────────────────────────────────
function getCellEl(r, c) {
    return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function getCells4(ans) {
    const dr = Math.sign(ans.endRow - ans.startRow);
    const dc = Math.sign(ans.endCol - ans.startCol);
    return Array.from({ length: 4 }, (_, i) =>
        getCellEl(ans.startRow + dr * i, ans.startCol + dc * i)
    );
}

function ensureSvgSize() {
    const r = boardWrapper.getBoundingClientRect();
    if (r.width === 0) return;
    svgOverlay.setAttribute('width',   r.width);
    svgOverlay.setAttribute('height',  r.height);
    svgOverlay.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
}

function updateFoundCounter() {
    foundCountEl.textContent = `${foundIndices.length} / ${answers.length}`;
}

function reapplyCellClasses() {
    foundIndices.forEach((ansIdx, i) => {
        const color = LINE_COLORS[i % LINE_COLORS.length];
        getCells4(answers[ansIdx]).forEach(el => {
            if (!el) return;
            el.classList.add('found');
            el.style.setProperty('--found-color', color);
        });
    });
    if (gameFinished) {
        answers.forEach((a, i) => {
            if (foundIndices.includes(i)) return;
            getCells4(a).forEach(el => {
                if (!el || el.classList.contains('found')) return;
                el.classList.add('missed');
            });
        });
    }
}

// ── 選択管理 ───────────────────────────────────────────
function clearPending() {
    pendingCells = [];
    pendingDir   = null;
    boardEl.querySelectorAll('.cell.pending').forEach(el =>
        el.classList.remove('pending')
    );
}

function applyPendingStyles() {
    boardEl.querySelectorAll('.cell.pending').forEach(el =>
        el.classList.remove('pending')
    );
    pendingCells.forEach(({ r, c }) => getCellEl(r, c)?.classList.add('pending'));
}

function flashPending(type) {
    const cls = type === 'duplicate' ? 'flash-duplicate' : 'flash-error';
    const targets = pendingCells.map(({ r, c }) => getCellEl(r, c)).filter(Boolean);
    targets.forEach(el => { el.classList.remove('pending'); el.classList.add(cls); });
    setTimeout(() => {
        clearPending();
        targets.forEach(el => el.classList.remove(cls));
    }, 500);
}

// ── セルクリックハンドラ ───────────────────────────────
function handleCellClick(r, c) {
    if (pendingCells.length === 0) {
        if (board[r][c] !== '志') return;
        pendingCells = [{ r, c }];
        pendingDir   = null;
        applyPendingStyles();
        return;
    }

    if (pendingCells.some(p => p.r === r && p.c === c)) {
        clearPending();
        return;
    }

    const last = pendingCells[pendingCells.length - 1];
    const dr   = r - last.r;
    const dc   = c - last.c;

    if (pendingCells.length === 1) {
        if (Math.abs(dr) > 1 || Math.abs(dc) > 1) { clearPending(); return; }
        if (board[r][c] !== '布') { flashPending('error'); return; }
        pendingDir = { dr, dc };
        pendingCells.push({ r, c });
        applyPendingStyles();
        return;
    }

    const expectedChar = ['志', '布', '志', '市'][pendingCells.length];
    if (dr !== pendingDir.dr || dc !== pendingDir.dc) { flashPending('error'); return; }
    if (board[r][c] !== expectedChar) { flashPending('error'); return; }

    pendingCells.push({ r, c });
    applyPendingStyles();

    if (pendingCells.length === 4) validateAndConfirm();
}

function validateAndConfirm() {
    const s = pendingCells[0], e = pendingCells[3];
    const matchIdx = answers.findIndex(a =>
        a.startRow === s.r && a.startCol === s.c &&
        a.endRow   === e.r && a.endCol   === e.c
    );
    if (matchIdx === -1)                 { flashPending('error');     return; }
    if (foundIndices.includes(matchIdx)) { flashPending('duplicate'); return; }
    confirmFound(matchIdx);
}

function confirmFound(matchIdx) {
    foundIndices.push(matchIdx);
    const color = LINE_COLORS[(foundIndices.length - 1) % LINE_COLORS.length];

    pendingCells.forEach(({ r, c }) => {
        const el = getCellEl(r, c);
        if (!el) return;
        el.classList.remove('pending');
        el.classList.add('found');
        el.style.setProperty('--found-color', color);
    });

    drawSingleArrow(answers[matchIdx], color);
    updateFoundCounter();
    clearPending();

    // 全発見 → 自動クリア（少し間を置いてから）
    if (foundIndices.length === answers.length) {
        setTimeout(finishGame, 300);
    }
}

// ── SVG 矢印描画 ───────────────────────────────────────
function drawSingleArrow(ans, color) {
    ensureSvgSize();
    const wRect   = boardWrapper.getBoundingClientRect();
    const startEl = getCellEl(ans.startRow, ans.startCol);
    const endEl   = getCellEl(ans.endRow,   ans.endCol);
    if (!startEl || !endEl) return;
    const sr = startEl.getBoundingClientRect();
    const er = endEl.getBoundingClientRect();
    drawArrow(
        sr.left - wRect.left + sr.width  / 2,
        sr.top  - wRect.top  + sr.height / 2,
        er.left - wRect.left + er.width  / 2,
        er.top  - wRect.top  + er.height / 2,
        color
    );
}

function drawArrow(x1, y1, x2, y2, color) {
    const ARROW_LEN = 10;
    const ARROW_WID = 5.5;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const lx2 = x2 - ARROW_LEN * 0.65 * Math.cos(angle);
    const ly2 = y2 - ARROW_LEN * 0.65 * Math.sin(angle);
    svgOverlay.appendChild(svgEl('line', {
        x1, y1, x2: lx2, y2: ly2,
        stroke: color, 'stroke-width': 3.5,
        'stroke-opacity': .85, 'stroke-linecap': 'round',
    }));

    const bx = x2 - ARROW_LEN * Math.cos(angle);
    const by = y2 - ARROW_LEN * Math.sin(angle);
    const lx = bx - ARROW_WID * Math.sin(angle);
    const ly = by + ARROW_WID * Math.cos(angle);
    const rx = bx + ARROW_WID * Math.sin(angle);
    const ry = by - ARROW_WID * Math.cos(angle);
    svgOverlay.appendChild(svgEl('polygon', {
        points: `${x2},${y2} ${lx},${ly} ${rx},${ry}`,
        fill: color, 'fill-opacity': .85,
    }));

    svgOverlay.appendChild(svgEl('circle', {
        cx: x1, cy: y1, r: 5,
        fill: color, 'fill-opacity': .85,
    }));
}

function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

// ── ゲームフロー ───────────────────────────────────────
function startGame() {
    boardSize = parseInt(boardSizeEl.value, 10);
    gameSection.hidden = false;
    newBoard();
    gameSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function newBoard() {
    stopTimer();

    // ターゲット個数になるまで盤面を再生成
    const target = getTargetCount(boardSize);
    let attempts = 0;
    do {
        board   = generateBoard(boardSize);
        answers = findAnswers(board);
        attempts++;
    } while (answers.length !== target && attempts < 2000);

    answered     = false;
    pendingCells = [];
    pendingDir   = null;
    foundIndices = [];
    gameFinished = false;

    renderBoard(board);

    errorMsg.hidden      = true;
    resultSection.hidden = true;
    shareBtn.hidden      = true;
    finishBtn.disabled   = false;
    clearBtn.disabled    = false;
    regenBtn.disabled    = false;
    resetBtn.disabled    = false;
    updateFoundCounter();

    startTimer();
}

function finishGame() {
    if (gameFinished) return;
    gameFinished = true;
    answered     = true;

    const clearSec = stopTimer();

    clearPending();
    finishBtn.disabled = true;
    clearBtn.disabled  = true;

    // タイマーを最終値で固定表示
    timerEl.textContent = clearSec.toFixed(1);

    const total     = answers.length;
    const found     = foundIndices.length;
    const isCorrect = found === total;

    // 見逃し分をグレーで描画
    answers.forEach((a, i) => {
        if (foundIndices.includes(i)) return;
        drawSingleArrow(a, '#aaaaaa');
        getCells4(a).forEach(el => {
            if (!el || el.classList.contains('found')) return;
            el.classList.add('missed');
        });
    });

    foundCountResultEl.textContent = `${found}個`;
    totalCountResultEl.textContent = `${total}個`;
    clearTimeEl.textContent        = `${clearSec.toFixed(1)}秒`;
    verdictEl.textContent = isCorrect ? 'クリア！' : 'ギブアップ';
    verdictEl.className   = `verdict ${isCorrect ? 'correct' : 'wrong'}`;
    messageEl.textContent = buildMessage(isCorrect, found, total, clearSec);
    resultSection.hidden  = false;

    shareBtn.href   = buildShareUrl(isCorrect, found, total, clearSec);
    shareBtn.hidden = false;

    requestAnimationFrame(() =>
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    );
}

function buildMessage(isCorrect, found, total, sec) {
    if (isCorrect) {
        const s = sec.toFixed(1);
        if (sec < 30)  return `${s}秒！驚異的なスピードです！`;
        if (sec < 60)  return `${s}秒でクリア！素晴らしい！`;
        if (sec < 120) return `${s}秒でクリア！`;
        return `${s}秒でクリア。次はもっと速く！`;
    }
    const missed = total - found;
    if (found === 0) return `${total}個すべて見逃しました。グレーの箇所を確認しましょう。`;
    if (missed === 1) return `惜しい！あと1個見つけられませんでした。`;
    return `あと${missed}個残っていました。グレーの箇所を確認しましょう。`;
}

function buildShareUrl(isCorrect, found, total, sec) {
    const appUrl = 'https://shibushishi-ikutsu.vercel.app/';
    let text;
    if (isCorrect) {
        text = `【志布志市はいくつ？】${boardSize}×${boardSize}の盤面（${total}個）を${sec.toFixed(1)}秒でクリア！`;
    } else {
        text = `【志布志市はいくつ？】${boardSize}×${boardSize}の盤面で${found}/${total}個発見（ギブアップ）`;
    }
    text += '\n#志布志市はいくつ';
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(appUrl)}`;
}
