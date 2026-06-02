'use strict';

// ── State ──────────────────────────────────────────────
let board = null;
let answers = null;
let boardSize = 10;
let answered = false;

// ── DOM ────────────────────────────────────────────────
const boardSizeEl   = document.getElementById('boardSize');
const startBtn      = document.getElementById('startBtn');
const regenBtn      = document.getElementById('regenBtn');
const resetBtn      = document.getElementById('resetBtn');
const gameSection   = document.getElementById('gameSection');
const boardEl       = document.getElementById('board');
const svgOverlay    = document.getElementById('svgOverlay');
const boardWrapper  = document.getElementById('boardWrapper');
const answerInput   = document.getElementById('answerInput');
const submitBtn     = document.getElementById('submitBtn');
const errorMsg      = document.getElementById('errorMsg');
const resultSection = document.getElementById('resultSection');
const userAnswerEl  = document.getElementById('userAnswerEl');
const correctAnswerEl = document.getElementById('correctAnswerEl');
const verdictEl     = document.getElementById('verdictEl');
const messageEl     = document.getElementById('messageEl');
const nextBtn       = document.getElementById('nextBtn');

// 答え合わせ線の色（最大10色でサイクル）
const LINE_COLORS = [
    '#e53935', '#1e88e5', '#43a047', '#fb8c00',
    '#8e24aa', '#00acc1', '#e91e63', '#f9a825',
    '#00897b', '#6d4c41',
];

// ── イベント ───────────────────────────────────────────
startBtn.addEventListener('click', startGame);
regenBtn.addEventListener('click', newBoard);
resetBtn.addEventListener('click', resetAnswer);
submitBtn.addEventListener('click', submitAnswer);
nextBtn.addEventListener('click', newBoard);
answerInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (!board) return;
        renderBoard(board);
        if (answered) requestAnimationFrame(() => drawAnswerLines(answers));
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
    const size = b.length;
    const target = ['志', '布', '志', '市'];
    const dirs = [
        [ 0,  1], // →
        [ 0, -1], // ←
        [ 1,  0], // ↓
        [-1,  0], // ↑
        [ 1,  1], // ↘
        [-1, -1], // ↖
        [-1,  1], // ↗
        [ 1, -1], // ↙
    ];
    const result = [];

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (b[r][c] !== '志') continue;

            for (const [dr, dc] of dirs) {
                let valid = true;
                for (let i = 0; i < 4; i++) {
                    const nr = r + dr * i;
                    const nc = c + dc * i;
                    if (nr < 0 || nr >= size || nc < 0 || nc >= size || b[nr][nc] !== target[i]) {
                        valid = false;
                        break;
                    }
                }
                if (valid) {
                    result.push({
                        startRow: r,
                        startCol: c,
                        endRow: r + dr * 3,
                        endCol: c + dc * 3,
                    });
                }
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
    const cs = calcCellSize(size);
    const fs = Math.max(Math.floor(cs * 0.55), 11);

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

// ── SVG 矢印描画 ───────────────────────────────────────
function drawAnswerLines(ans) {
    svgOverlay.innerHTML = '';
    if (!ans.length) return;

    const wRect = boardWrapper.getBoundingClientRect();
    svgOverlay.setAttribute('width',   wRect.width);
    svgOverlay.setAttribute('height',  wRect.height);
    svgOverlay.setAttribute('viewBox', `0 0 ${wRect.width} ${wRect.height}`);

    ans.forEach((a, idx) => {
        const color = LINE_COLORS[idx % LINE_COLORS.length];

        const startEl = boardEl.querySelector(`[data-row="${a.startRow}"][data-col="${a.startCol}"]`);
        const endEl   = boardEl.querySelector(`[data-row="${a.endRow}"][data-col="${a.endCol}"]`);
        if (!startEl || !endEl) return;

        const sr = startEl.getBoundingClientRect();
        const er = endEl.getBoundingClientRect();
        const x1 = sr.left - wRect.left + sr.width  / 2;
        const y1 = sr.top  - wRect.top  + sr.height / 2;
        const x2 = er.left - wRect.left + er.width  / 2;
        const y2 = er.top  - wRect.top  + er.height / 2;

        drawArrow(x1, y1, x2, y2, color);
    });
}

// 矢印を手動描画（SVG marker url() を使わず全ブラウザで動作）
function drawArrow(x1, y1, x2, y2, color) {
    const ARROW_LEN = 10;
    const ARROW_WID = 5.5;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // 線（矢印頭の手前で止める）
    const lx2 = x2 - ARROW_LEN * 0.65 * Math.cos(angle);
    const ly2 = y2 - ARROW_LEN * 0.65 * Math.sin(angle);
    svgOverlay.appendChild(svgEl('line', {
        x1, y1, x2: lx2, y2: ly2,
        stroke: color, 'stroke-width': 3.5,
        'stroke-opacity': .85, 'stroke-linecap': 'round',
    }));

    // 矢印頭（ポリゴン）
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

    // 始点マーカー（丸）
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
    board   = generateBoard(boardSize);
    answers = findAnswers(board);
    answered = false;

    renderBoard(board);

    answerInput.value    = '';
    answerInput.disabled = false;
    submitBtn.disabled   = false;
    errorMsg.hidden      = true;
    resultSection.hidden = true;
    svgOverlay.innerHTML = '';

    regenBtn.disabled = false;
    resetBtn.disabled = false;
}

function resetAnswer() {
    if (!board) return;
    answerInput.value    = '';
    answerInput.disabled = false;
    submitBtn.disabled   = false;
    errorMsg.hidden      = true;
    resultSection.hidden = true;
    svgOverlay.innerHTML = '';
    answered = false;
}

function submitAnswer() {
    const raw = answerInput.value.trim();

    if (raw === '') {
        showError('個数を入力してください');
        return;
    }
    if (!/^\d+$/.test(raw)) {
        showError('0以上の整数で入力してください（小数・マイナス不可）');
        return;
    }

    const userNum    = parseInt(raw, 10);
    const correctNum = answers.length;
    const isCorrect  = userNum === correctNum;
    answered = true;

    userAnswerEl.textContent    = `${userNum}個`;
    correctAnswerEl.textContent = `${correctNum}個`;
    verdictEl.textContent  = isCorrect ? '正解！' : '不正解';
    verdictEl.className    = `verdict ${isCorrect ? 'correct' : 'wrong'}`;
    messageEl.textContent  = buildMessage(isCorrect, userNum, correctNum);

    resultSection.hidden = false;
    answerInput.disabled = true;
    submitBtn.disabled   = true;
    errorMsg.hidden      = true;

    requestAnimationFrame(() => {
        drawAnswerLines(answers);
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function buildMessage(isCorrect, user, ans) {
    if (isCorrect) {
        if (ans === 0) return '0個を正確に当てました！見事な観察力です。';
        if (ans === 1) return '正確に1個を見つけました！';
        if (ans >= 8)  return `全${ans}個！難問を完璧に攻略しましたね。`;
        return `全${ans}個を正確に数えました！すごい！`;
    }
    if (ans === 0)           return '実は1個もありませんでした。志布志市は隠れていませんでした！';
    if (user === 0 && ans > 0) return `実は${ans}個隠れていました。盤面を確認してみましょう。`;
    const diff = user - ans;
    if (diff > 0) return `${diff}個多かったです。正解箇所を確認しましょう。`;
    return `あと${-diff}個足りませんでした。正解箇所を確認しましょう。`;
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
}
