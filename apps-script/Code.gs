/**
 * 婚禮 RSVP 表單後端（Google Apps Script Web App）
 *
 * 這支程式只做一件事：收到前端 fetch 送來的 JSON，檢查基本欄位，
 * 寫進目前試算表的第一個工作表（當作資料表），每次送出都新增一列、不覆蓋。
 *
 * 前端（src/rsvp.ts）送出的欄位值維持代碼（groom / attend / meat 這種英文代碼），
 * 完全不動前端。中文化只在這支後端做：寫入試算表前，把代碼翻成中文文字，
 * 這樣 Chian 平常打開試算表看到的就是「男方親友」「出席」「葷食」而不是代碼。
 *
 * 部署步驟與「統計」工作表說明見同資料夾的 README.md。
 */

// Sheet 欄位順序：appendRow 會照這個順序把值放進對應欄位
// A            B     C         D               E       F           G           H     I          J           K               L     M      N        O         P
// timestamp    name  relation  relation_other  attend  party_size  party_note  diet  diet_note  kids_chair  kids_tableware  cake  phone  address  blessing  user_agent
//
// 對照試算表欄位中文標題（HEADERS，跟下面 COLUMNS 一一對應，順序不能改）：
// 填寫時間 姓名 與新人關係 關係補充 出席狀態 出席人數 同行者備註 飲食 飲食補充 兒童椅（張） 兒童餐具（份） 喜餅領取 聯絡電話 郵寄地址 祝福與備註 瀏覽器
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

// 試算表第一列的中文標題，跟 COLUMNS 順序一一對應
const HEADERS = [
  '填寫時間',
  '姓名',
  '與新人關係',
  '關係補充',
  '出席狀態',
  '出席人數',
  '同行者備註',
  '飲食',
  '飲食補充',
  '兒童椅（張）',
  '兒童餐具（份）',
  '喜餅領取',
  '聯絡電話',
  '郵寄地址',
  '祝福與備註',
  '瀏覽器',
];

// ---------- 代碼 → 中文對照表 ----------
// 前端送來的仍是這些英文代碼，這裡只負責寫入試算表前翻成中文。
// 找不到對應的代碼就原樣寫入（不丟資料），方便日後回頭查是哪個代碼沒對到。

const RELATION_MAP = {
  groom: '男方親友',
  bride: '女方親友',
  mutual: '共同朋友',
  other: '其他',
};

const ATTEND_MAP = {
  attend: '出席',
  'gift-only': '禮到人不到',
  absent: '無法出席',
};

// party_size 的 1／2／3 照寫，只有 4+ 需要翻譯，所以對照表只列這一項
const PARTY_SIZE_MAP = {
  '4+': '4 人以上',
};

const DIET_MAP = {
  meat: '葷食',
  veg: '全素／蛋奶素',
  other: '其他',
};

const CAKE_MAP = {
  onsite: '現場領取',
  mail: '郵寄',
  none: '不需要',
};

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
    // 注意：這裡檢查的還是前端送來的原始代碼欄位，跟中文化無關
    if (!data.name || !data.phone || !data.attend) {
      return jsonResponse({ ok: false, error: 'missing required fields: name / phone / attend' });
    }

    const sheet = getDataSheet();
    ensureHeaderRow(sheet);

    const row = COLUMNS.map(function (key) {
      if (key === 'timestamp') return new Date();
      return translateValue(key, data[key]);
    });
    sheet.appendRow(row);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 把前端送來的單一欄位值，依照欄位種類翻成中文寫入試算表。
 * - relation / attend / party_size / diet / cake：查對照表，查不到就原樣寫入
 * - kids_chair / kids_tableware：空字串維持空白，不要變成 0
 * - 其他欄位（姓名、電話、地址、備註等自由填寫文字）：原樣寫入
 */
function translateValue(key, rawValue) {
  if (rawValue === undefined || rawValue === null) return '';
  const value = String(rawValue);

  switch (key) {
    case 'relation':
      return RELATION_MAP[value] || value;
    case 'attend':
      return ATTEND_MAP[value] || value;
    case 'party_size':
      return PARTY_SIZE_MAP[value] || value;
    case 'diet':
      return DIET_MAP[value] || value;
    case 'cake':
      return CAKE_MAP[value] || value;
    case 'kids_chair':
    case 'kids_tableware':
      return normalizeCount(value);
    default:
      return value;
  }
}

/** 數字欄位：空字串維持空字串（不要寫成 0），有值就轉成數字方便統計表 SUM */
function normalizeCount(value) {
  if (value === '') return '';
  const n = Number(value);
  return isNaN(n) ? value : n;
}

/** 資料表固定用試算表裡的第一個工作表，Chian 不用另外重新命名 */
function getDataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets()[0];
}

/**
 * 確保第一列是中文表頭（HEADERS），不動任何資料列。
 * - 工作表整個是空的：直接補上一列中文表頭。
 * - 工作表已經有東西：讀第一列，
 *   - A1 是 `timestamp`（舊版英文表頭）→ 覆蓋成中文表頭。
 *   - 第一列跟 HEADERS 不完全一樣，而且 A1 看起來不是日期（代表第一列本來就是某種表頭，
 *     不是資料列的 timestamp）→ 覆蓋成中文表頭。
 *   - 第一列已經跟 HEADERS 一模一樣（已經是中文表頭）→ 不動。
 *   - 其餘情況（例如 A1 是日期，代表第一列其實是資料列，沒有表頭）→ 不動，避免把資料列蓋掉。
 */
function ensureHeaderRow(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }

  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const firstCell = firstRow[0];

  const isOldEnglishHeader = firstCell === 'timestamp';
  const matchesCurrentHeaders = HEADERS.every(function (header, index) {
    return firstRow[index] === header;
  });
  const firstCellLooksLikeDate = firstCell instanceof Date;

  if (isOldEnglishHeader || (!matchesCurrentHeaders && !firstCellLooksLikeDate)) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 手動執行一次即可：建立（或重建）「統計」工作表與公式。
 * 在 Apps Script 編輯器上方的函式下拉選單選 setupStatsSheet，按執行。
 * 之後公式會照試算表原生規則自動隨資料更新，不用每次重跑；
 * 只有想清空重建統計表格式時才需要再跑一次（會先 clear() 清掉舊內容再重建，避免舊公式殘留）。
 *
 * 統計工作表版面配置（各區塊彼此不重疊，都能往下無限長）：
 *   A:C  統計數字（出席組數、出席總人數、各飲食人數、兒童椅／餐具張數）
 *   E:G  喜餅郵寄清單（姓名 / 電話 / 地址）
 *   I:P  出席名單（姓名、關係、人數、飲食、兒童椅、餐具、電話、備註）
 *   R:V  禮到人不到／無法出席名單（姓名、關係、出席狀態、喜餅領取、電話）
 */
function setupStatsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = getDataSheet();
  const dataName = dataSheet.getName();

  let stats = ss.getSheetByName('統計');
  if (!stats) {
    stats = ss.insertSheet('統計');
  } else {
    // 重跑時清掉舊內容再重建，避免舊公式殘留（例如欄位改過但公式沒跟著換）
    stats.clear();
  }

  // ---------- A:C 統計數字 ----------
  const rows = [
    ['項目', '數值', '說明'],
    ['出席組數', "=COUNTIF('" + dataName + "'!E:E,\"出席\")", '出席狀態為「出席」的回覆筆數'],
    [
      '出席總人數',
      "=SUMPRODUCT(('" +
        dataName +
        "'!E2:E999=\"出席\")*IFERROR(VALUE(SUBSTITUTE('" +
        dataName +
        "'!F2:F999,\"4 人以上\",\"4\")),0))",
      '出席人數加總（4 人以上以 4 人計，如需精算請看同行者備註欄）',
    ],
    ['葷食人數', "=COUNTIFS('" + dataName + "'!E:E,\"出席\",'" + dataName + "'!H:H,\"葷食\")", ''],
    ['全素／蛋奶素人數', "=COUNTIFS('" + dataName + "'!E:E,\"出席\",'" + dataName + "'!H:H,\"全素／蛋奶素\")", ''],
    ['其他飲食人數', "=COUNTIFS('" + dataName + "'!E:E,\"出席\",'" + dataName + "'!H:H,\"其他\")", '詳細需求看飲食補充欄'],
    ['兒童椅張數', "=SUM('" + dataName + "'!J:J)", ''],
    ['兒童餐具份數', "=SUM('" + dataName + "'!K:K)", ''],
  ];
  stats.getRange(1, 1, rows.length, 3).setValues(rows);

  // ---------- E:G 喜餅郵寄清單 ----------
  stats.getRange('E1').setValue('喜餅郵寄清單（姓名 / 電話 / 地址）');
  stats
    .getRange('E2')
    .setFormula("=QUERY('" + dataName + "'!A:P,\"select B, M, N where L = '郵寄'\", 1)");

  // ---------- I:P 出席名單 ----------
  stats.getRange('I1').setValue('出席名單');
  stats.getRange('I2:P2').setValues([['姓名', '關係', '人數', '飲食', '兒童椅', '餐具', '電話', '備註']]);
  stats
    .getRange('I3')
    .setFormula(
      "=QUERY('" + dataName + "'!A:P,\"select B, C, F, H, J, K, M, O where E = '出席' order by A\", 1)"
    );

  // ---------- R:V 禮到人不到／無法出席名單 ----------
  stats.getRange('R1').setValue('禮到人不到／無法出席名單');
  stats.getRange('R2:V2').setValues([['姓名', '關係', '出席狀態', '喜餅領取', '電話']]);
  stats
    .getRange('R3')
    .setFormula(
      "=QUERY('" + dataName + "'!A:P,\"select B, C, E, L, M where E <> '出席' and B <> ''\", 1)"
    );

  stats.autoResizeColumns(1, 22);
}
