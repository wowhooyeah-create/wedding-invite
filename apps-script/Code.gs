/**
 * 婚禮 RSVP 表單後端（Google Apps Script Web App）
 *
 * 這支程式只做一件事：收到前端 fetch 送來的 JSON，檢查基本欄位，
 * 寫進目前試算表的第一個工作表（當作資料表），每次送出都新增一列、不覆蓋。
 *
 * 部署步驟與「統計」工作表說明見同資料夾的 README.md。
 */

// Sheet 欄位順序：appendRow 會照這個順序把值放進對應欄位
// A            B     C         D               E       F           G           H     I          J           K               L     M      N        O         P
// timestamp    name  relation  relation_other  attend  party_size  party_note  diet  diet_note  kids_chair  kids_tableware  cake  phone  address  blessing  user_agent
const COLUMNS = [
  'timestamp',
  'name',
  'relation',
  'relation_other',
  'attend',
  'party_size',
  'party_note',
  'diet',
  'diet_note',
  'kids_chair',
  'kids_tableware',
  'cake',
  'phone',
  'address',
  'blessing',
  'user_agent',
];

/**
 * Web App 的 POST 進入點。前端用 text/plain 送 JSON 字串（避開 CORS preflight）。
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'empty request body' });
    }

    const data = JSON.parse(e.postData.contents);

    // 蜜罐欄位：一般使用者看不到這欄，有值代表是機器人。
    // 不回傳錯誤（避免機器人再嘗試其他寫法），直接假裝成功、但不寫入試算表。
    if (data.website) {
      return jsonResponse({ ok: true });
    }

    // 最後一道必填檢查：前端已經擋過一次，這裡是防止有人繞過前端直接打 API
    if (!data.name || !data.phone || !data.attend) {
      return jsonResponse({ ok: false, error: 'missing required fields: name / phone / attend' });
    }

    const sheet = getDataSheet();
    ensureHeaderRow(sheet);

    const row = COLUMNS.map(function (key) {
      if (key === 'timestamp') return new Date();
      const value = data[key];
      return value === undefined || value === null ? '' : value;
    });
    sheet.appendRow(row);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** 資料表固定用試算表裡的第一個工作表，Chian 不用另外重新命名 */
function getDataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets()[0];
}

/** 第一次送出前，如果資料表還是空的，先補上表頭 */
function ensureHeaderRow(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 手動執行一次即可：建立（或重建）「統計」工作表與公式。
 * 在 Apps Script 編輯器上方的函式下拉選單選 setupStatsSheet，按執行。
 * 之後公式會照試算表原生規則自動隨資料更新，不用每次重跑。
 */
function setupStatsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = getDataSheet();
  const dataName = dataSheet.getName();

  const existing = ss.getSheetByName('統計');
  if (existing) {
    ss.deleteSheet(existing);
  }
  const stats = ss.insertSheet('統計');

  const rows = [
    ['項目', '數值', '說明'],
    ['出席組數', "=COUNTIF('" + dataName + "'!E:E,\"attend\")", '勾選「出席」的回覆筆數'],
    [
      '出席總人數',
      "=SUMPRODUCT(('" +
        dataName +
        "'!E2:E999=\"attend\")*IFERROR(VALUE(SUBSTITUTE('" +
        dataName +
        "'!F2:F999,\"+\",\"\")),0))",
      '出席人數加總（4+ 以 4 人計，如需精算請看 party_note 欄）',
    ],
    ['葷食人數', "=COUNTIFS('" + dataName + "'!E:E,\"attend\",'" + dataName + "'!H:H,\"meat\")", ''],
    ['全素／蛋奶素人數', "=COUNTIFS('" + dataName + "'!E:E,\"attend\",'" + dataName + "'!H:H,\"veg\")", ''],
    ['其他飲食人數', "=COUNTIFS('" + dataName + "'!E:E,\"attend\",'" + dataName + "'!H:H,\"other\")", '詳細需求看 diet_note 欄'],
    ['兒童椅張數', "=SUM('" + dataName + "'!J:J)", ''],
    ['兒童餐具份數', "=SUM('" + dataName + "'!K:K)", ''],
  ];
  stats.getRange(1, 1, rows.length, 3).setValues(rows);

  stats.getRange('A11').setValue('喜餅郵寄清單（姓名 / 電話 / 地址）');
  stats
    .getRange('A12')
    .setFormula("=QUERY('" + dataName + "'!A:P,\"select B, M, N where L = 'mail'\", 0)");

  stats.autoResizeColumns(1, 3);
}
