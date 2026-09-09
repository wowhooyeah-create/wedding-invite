// src/rsvp.ts
// RSVP 表單：條件邏輯（顯示/隱藏＋清值）、驗證訊息、蜜罐、送出（loading／成功／失敗三態）。

type Attend = 'attend' | 'gift-only' | 'absent';
type Cake = 'onsite' | 'mail' | 'none';

const RELATION_LABEL: Record<string, string> = {
  groom: '男方親友',
  bride: '女方親友',
  mutual: '共同朋友',
  other: '其他',
};

const DIET_LABEL: Record<string, string> = {
  meat: '葷食',
  veg: '全素／蛋奶素',
  other: '其他',
};

const CAKE_LABEL: Record<Cake, string> = {
  onsite: '現場領取',
  mail: '郵寄',
  none: '不需要',
};

const ATTEND_LABEL: Record<Attend, string> = {
  attend: '出席',
  'gift-only': '禮到人不到',
  absent: '無法出席',
};

/** 取得表單內某個 radio group 目前選中的值 */
function getRadioValue(form: HTMLFormElement, name: string): string {
  const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return el?.value ?? '';
}

/** 顯示/隱藏某個 data-conditional 區塊，並在隱藏時清空底下的欄位 */
function setConditionalVisible(form: HTMLFormElement, key: string, visible: boolean): void {
  const el = form.querySelector<HTMLElement>(`[data-conditional="${key}"]`);
  if (!el) return;
  el.hidden = !visible;
  if (!visible) {
    el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((field) => {
      if (field instanceof HTMLInputElement && (field.type === 'radio' || field.type === 'checkbox')) {
        field.checked = false;
      } else {
        field.value = '';
      }
      field.required = false;
      field.setCustomValidity('');
    });
  }
}

function initRsvpForm(): void {
  const form = document.querySelector<HTMLFormElement>('#rsvp-form');
  const card = document.querySelector<HTMLElement>('#rsvp-card');
  if (!form || !card) return;

  const submitBtn = form.querySelector<HTMLButtonElement>('#rsvp-submit');
  const formErrorEl = form.querySelector<HTMLParagraphElement>('#rsvp-form-error');
  const successEl = document.querySelector<HTMLElement>('#rsvp-success');
  const successSummaryEl = document.querySelector<HTMLElement>('#rsvp-success-summary');
  const errorStateEl = document.querySelector<HTMLElement>('#rsvp-error');
  const retryBtn = document.querySelector<HTMLButtonElement>('#rsvp-retry');

  const phoneInput = form.querySelector<HTMLInputElement>('#phone');
  const addressInput = form.querySelector<HTMLInputElement>('#address');
  const addressAsterisk = form.querySelector<HTMLElement>('[data-conditional="address-required"]');
  const partySizeNoteInput = form.querySelector<HTMLInputElement>('#party_note');
  const dietNoteInput = form.querySelector<HTMLInputElement>('#diet_note');

  const PHONE_PATTERN = /^[0-9+\-() ]{8,}$/;

  // ---------- 條件邏輯 ----------

  // q2 關係：選「其他」才顯示補充欄位
  form.querySelectorAll<HTMLInputElement>('input[name="relation"]').forEach((input) => {
    input.addEventListener('change', () => {
      setConditionalVisible(form, 'relation-other', input.value === 'other' && input.checked);
    });
  });

  // q3 是否出席：只有「出席」才顯示人數／飲食／兒童椅整塊，其餘兩個選項要隱藏並清空
  form.querySelectorAll<HTMLInputElement>('input[name="attend"]').forEach((input) => {
    input.addEventListener('change', () => {
      const attend = getRadioValue(form, 'attend') as Attend;
      const showDetail = attend === 'attend';
      setConditionalVisible(form, 'attend-detail', showDetail);

      // 出席才把人數／飲食設為必填（radio group 只要組內任一顆有 required 瀏覽器就會要求選擇）
      const partySizeFirst = form.querySelector<HTMLInputElement>('input[name="party_size"]');
      const dietFirst = form.querySelector<HTMLInputElement>('input[name="diet"]');
      if (partySizeFirst) partySizeFirst.required = showDetail;
      if (dietFirst) dietFirst.required = showDetail;
    });
  });

  // q4 出席人數：4 人以上才展開備註欄
  form.querySelectorAll<HTMLInputElement>('input[name="party_size"]').forEach((input) => {
    input.addEventListener('change', () => {
      setConditionalVisible(form, 'party-note', getRadioValue(form, 'party_size') === '4+');
    });
  });

  // q5 飲食：選「其他」才展開備註欄，且備註轉為必填
  form.querySelectorAll<HTMLInputElement>('input[name="diet"]').forEach((input) => {
    input.addEventListener('change', () => {
      const isOther = getRadioValue(form, 'diet') === 'other';
      setConditionalVisible(form, 'diet-note', isOther);
      if (dietNoteInput) dietNoteInput.required = isOther;
    });
  });

  // q6 兒童椅／餐具：選「需要」才展開兩個數字欄
  form.querySelectorAll<HTMLInputElement>('input[name="kids_need"]').forEach((input) => {
    input.addEventListener('change', () => {
      setConditionalVisible(form, 'kids-detail', getRadioValue(form, 'kids_need') === 'yes');
    });
  });

  // q7 喜餅：選「郵寄」地址才轉必填
  form.querySelectorAll<HTMLInputElement>('input[name="cake"]').forEach((input) => {
    input.addEventListener('change', () => {
      const isMail = getRadioValue(form, 'cake') === 'mail';
      if (addressInput) addressInput.required = isMail;
      if (addressAsterisk) addressAsterisk.hidden = !isMail;
    });
  });

  // ---------- 驗證訊息（中文） ----------

  function bindCustomValidity(input: HTMLInputElement | HTMLTextAreaElement, requiredMsg: string): void {
    input.addEventListener('invalid', () => {
      if (input.validity.valueMissing) {
        input.setCustomValidity(requiredMsg);
      } else if ('validity' in input && (input as HTMLInputElement).validity.patternMismatch) {
        input.setCustomValidity('格式不正確，請確認電話號碼');
      } else {
        input.setCustomValidity('');
      }
    });
    input.addEventListener('input', () => {
      input.setCustomValidity('');
      input.classList.add('touched');
    });
  }

  const nameInput = form.querySelector<HTMLInputElement>('#name');
  if (nameInput) bindCustomValidity(nameInput, '請填寫姓名');
  if (phoneInput) {
    phoneInput.setAttribute('pattern', PHONE_PATTERN.source);
    bindCustomValidity(phoneInput, '請填寫聯絡電話');
  }
  if (addressInput) bindCustomValidity(addressInput, '選擇郵寄喜餅時，請填寫地址');
  if (dietNoteInput) bindCustomValidity(dietNoteInput, '請說明飲食需求');
  if (partySizeNoteInput) bindCustomValidity(partySizeNoteInput, '請列出同行者姓名');

  form.querySelectorAll<HTMLInputElement>('input[type="radio"][required]').forEach((input) => {
    input.addEventListener('invalid', () => {
      input.setCustomValidity('請選擇一個選項');
    });
    input.addEventListener('change', () => {
      form.querySelectorAll<HTMLInputElement>(`input[name="${input.name}"]`).forEach((el) => {
        el.setCustomValidity('');
      });
    });
  });

  // ---------- 送出 ----------

  function setBusy(busy: boolean): void {
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    submitBtn.setAttribute('aria-busy', String(busy));
  }

  function showState(state: 'form' | 'success' | 'error'): void {
    form!.hidden = state !== 'form';
    if (successEl) successEl.hidden = state !== 'success';
    if (errorStateEl) errorStateEl.hidden = state !== 'error';
  }

  function buildPayload(): Record<string, string> {
    const formData = new FormData(form!);
    const payload: Record<string, string> = {};
    formData.forEach((value, key) => {
      payload[key] = String(value);
    });
    payload.user_agent = navigator.userAgent;
    return payload;
  }

  function buildSummary(payload: Record<string, string>): string {
    const attend = payload.attend as Attend;
    const relationLabel = RELATION_LABEL[payload.relation] ?? payload.relation;
    const relationExtra = payload.relation === 'other' && payload.relation_other ? `（${payload.relation_other}）` : '';
    const lines: string[] = [
      `身份：${relationLabel}${relationExtra}`,
      `出席狀態：${ATTEND_LABEL[attend] ?? payload.attend}`,
    ];

    if (attend === 'attend') {
      const partySize = payload.party_size === '4+' ? '4 人以上' : `${payload.party_size} 人`;
      lines.push(`出席人數：${partySize}`);
      const dietLabel = DIET_LABEL[payload.diet] ?? payload.diet;
      lines.push(`飲食：${dietLabel}${payload.diet === 'other' && payload.diet_note ? `（${payload.diet_note}）` : ''}`);
      if (payload.kids_need === 'yes') {
        lines.push(`兒童椅：${payload.kids_chair || 0} 張・兒童餐具：${payload.kids_tableware || 0} 份`);
      }
    }

    const cake = payload.cake as Cake;
    lines.push(`喜餅：${CAKE_LABEL[cake] ?? payload.cake}${cake === 'mail' ? `（將郵寄至：${payload.address}）` : ''}`);

    return lines.join('\n');
  }

  async function submitPayload(payload: Record<string, string>): Promise<void> {
    const endpoint = import.meta.env.VITE_RSVP_ENDPOINT;

    // 開發模式：沒設定 endpoint 時，印出 payload 並模擬 800ms 後成功，方便本機測試不用真的部署 Apps Script
    if (!endpoint) {
      console.info('[rsvp] VITE_RSVP_ENDPOINT 未設定，模擬送出（本機開發模式）：', payload);
      await new Promise((resolve) => setTimeout(resolve, 800));
      return;
    }

    // 用 text/plain 送出 JSON，避免瀏覽器對 Apps Script 端點發出 CORS preflight
    const response = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = (await response.json()) as { ok: boolean; error?: string };
    if (!result.ok) {
      throw new Error(result.error ?? 'unknown error');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (formErrorEl) formErrorEl.hidden = true;

    // 蜜罐：一般使用者不會填到這欄，有值代表是機器人，靜默丟棄（假裝成功即可，不需要讓對方知道被擋）
    const honeypot = form.querySelector<HTMLInputElement>('#website');
    if (honeypot?.value) {
      showState('success');
      if (successSummaryEl) successSummaryEl.textContent = '';
      return;
    }

    if (!form.reportValidity()) {
      return;
    }

    const payload = buildPayload();

    setBusy(true);
    submitPayload(payload)
      .then(() => {
        if (successSummaryEl) successSummaryEl.textContent = buildSummary(payload);
        showState('success');
      })
      .catch((err) => {
        console.error('[rsvp] 送出失敗：', err);
        showState('error');
      })
      .finally(() => {
        setBusy(false);
      });
  });

  retryBtn?.addEventListener('click', () => {
    showState('form');
  });
}

initRsvpForm();
