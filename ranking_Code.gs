// =========================================================
// 志布志市はいくつ？ ランキングAPI
// Google Apps Script に貼り付けて使う
// =========================================================

// ▼ スプレッドシートのIDをここに貼り付ける
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
const RANKING_SHEET  = 'ランキング';
const LOG_SHEET      = 'ログ';

// ── エントリーポイント ─────────────────────────────────
function doPost(e) { return handleRequest_(e); }
function doGet(e)  { return handleRequest_(e); }

function handleRequest_(e) {
  let action = '';
  try {
    const body   = parseBody_(e);
    const params = (e && e.parameter) ? e.parameter : {};
    action = body.action || params.action || '';

    checkToken_(body.token || params.token || '');

    let result;
    switch (action) {
      case 'register':
        result = registerScore_(body.data || {});
        break;
      case 'ranking':
        result = getRanking_(
          body.boardSize !== undefined ? body.boardSize : params.boardSize,
          body.limit     !== undefined ? body.limit     : params.limit
        );
        break;
      default:
        throw new Error('不明なaction: ' + action);
    }

    writeLog_(action, 'success', '');
    return json_({ ok: true, action: action, result: result });

  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    writeLog_(action, 'error', msg);
    return json_({ ok: false, action: action, error: msg });
  }
}

// ── スコア登録 ─────────────────────────────────────────
function registerScore_(data) {
  if (!data.boardSize)
    throw new Error('boardSizeが必要です');
  if (!data.playerName || !String(data.playerName).trim())
    throw new Error('playerNameを入力してください');
  if (typeof data.clearTimeSec !== 'number' || isNaN(data.clearTimeSec))
    throw new Error('clearTimeSecが不正です');

  const boardSize    = parseInt(data.boardSize);
  const playerName   = String(data.playerName).trim().slice(0, 10);
  const clearTimeSec = parseFloat(parseFloat(data.clearTimeSec).toFixed(1));

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_(RANKING_SHEET);

    sheet.appendRow([
      Utilities.getUuid(),   // id
      new Date(),            // createdAt
      boardSize,             // boardSize
      playerName,            // playerName
      clearTimeSec           // clearTimeSec
    ]);

    // 登録後の順位を計算（同タイムは先着優先）
    const all = getRowsForSize_(sheet, boardSize);
    all.sort((a, b) => a.clearTimeSec - b.clearTimeSec);
    const rank = all.filter(r => r.clearTimeSec < clearTimeSec).length + 1;

    return {
      rank:         rank,
      totalPlayers: all.length
    };
  } finally {
    lock.releaseLock();
  }
}

// ── ランキング取得 ─────────────────────────────────────
function getRanking_(boardSizeParam, limitParam) {
  const boardSize = parseInt(boardSizeParam);
  const limit     = parseInt(limitParam) || 20;
  if (!boardSize || isNaN(boardSize)) throw new Error('boardSizeが必要です');

  const sheet = getSheet_(RANKING_SHEET);
  const rows  = getRowsForSize_(sheet, boardSize);
  rows.sort((a, b) => a.clearTimeSec - b.clearTimeSec);

  return rows.slice(0, limit).map(function(row, i) {
    return {
      rank:         i + 1,
      playerName:   row.playerName,
      clearTimeSec: row.clearTimeSec,
      date:         Utilities.formatDate(row.createdAt, 'Asia/Tokyo', 'MM/dd')
    };
  });
}

// ── 内部ユーティリティ ─────────────────────────────────
function getRowsForSize_(sheet, boardSize) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id           = row[0];
    var createdAt    = row[1];
    var size         = row[2];
    var playerName   = row[3];
    var clearTimeSec = row[4];
    if (!id) continue;
    if (parseInt(size) === parseInt(boardSize)) {
      rows.push({
        id:           String(id),
        createdAt:    createdAt instanceof Date ? createdAt : new Date(String(createdAt)),
        playerName:   String(playerName),
        clearTimeSec: parseFloat(clearTimeSec)
      });
    }
  }
  return rows;
}

function getSheet_(name) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('シートが見つかりません: ' + name);
  return sheet;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var correct = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!correct) throw new Error('API_TOKENが未設定です');
  if (token !== correct) throw new Error('認証に失敗しました');
}

function writeLog_(action, status, message) {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(LOG_SHEET);
    if (!sheet) return;
    sheet.appendRow([new Date(), action, status, message || '']);
  } catch (e) {
    // ログ失敗でAPI本体を止めない
  }
}

// ── 動作テスト（GASエディタから手動実行） ──────────────
function testRegister() {
  var result = registerScore_({
    boardSize:    10,
    playerName:   'テスト太郎',
    clearTimeSec: 23.4
  });
  Logger.log(JSON.stringify(result, null, 2));
}

function testRanking() {
  var result = getRanking_(10, 20);
  Logger.log(JSON.stringify(result, null, 2));
}
