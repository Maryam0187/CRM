export const escapeHtml = (value) => {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const buildTableRows = (rows = []) =>
  rows
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding: 6px 12px; border: 1px solid #d1d5db; background-color: #f3f4f6; width: 50%; font-weight: 600;">${escapeHtml(label)}</td>
          <td style="padding: 6px 12px; border: 1px solid #d1d5db; width: 50%; word-break: break-word;">${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join('');

export const DOC_TABLE_STYLE = 'border-collapse: collapse; width: 100%; table-layout: fixed; margin-top: 8px;';
export const DOC_TABLE_COLGROUP = '<colgroup><col style="width:50%" /><col style="width:50%" /></colgroup>';

const normalizeValue = (value, fallback = 'N/A') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? fallback : trimmed;
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : fallback;
  }
  return String(value);
};

/** Normalize line endings and common “soft” breaks so they become real \n before export. */
const normalizeLineBreaksInText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
};

/**
 * Escape for HTML and turn newlines into <br /> so Word/HTML-based .doc opens show line breaks
 * (Word often ignores white-space: pre-line on paragraphs).
 */
const escapeHtmlWithLineBreaks = (value) => {
  if (value === null || value === undefined) return 'N/A';
  const normalized = normalizeLineBreaksInText(value).trim();
  if (normalized === '') return 'N/A';
  return escapeHtml(normalized).replace(/\n/g, '<br />');
};

const stripHtmlToText = (value) =>
  normalizeValue(value, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const TAG_DISPLAY_NAMES = {
  verification: 'Verified',
  process: 'Processed',
  'payment-info': 'Payment Info'
};

const formatSaleTagsForDownload = (sale = {}) => {
  const raw = sale.tags;
  let tags = [];
  if (Array.isArray(raw)) {
    tags = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (!tags.length) return '';
  const unique = [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
  return unique
    .map((tag) => TAG_DISPLAY_NAMES[tag] || tag.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(', ');
};

/**
 * Sale notes are stored as JSON objects joined by "|||" (see AddSale parseNotes).
 * Expand into a readable layout for the download document.
 */
const parseSaleNotesEntries = (notesString) => {
  if (notesString === null || notesString === undefined || String(notesString).trim() === '') {
    return [];
  }
  const entries = String(notesString)
    .split('|||')
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return {
          id: null,
          timestamp: 'Legacy',
          note: trimmed,
          appointment: null
        };
      }
    })
    .filter(Boolean);

  const entryTime = (entry) => {
    const d = new Date(entry.timestamp);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  };

  return entries.sort((a, b) => entryTime(b) - entryTime(a));
};

const formatNoteDateTimeForDownload = (timestamp) => {
  if (timestamp === null || timestamp === undefined || timestamp === '' || timestamp === 'Legacy') {
    return null;
  }
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) {
    return String(timestamp);
  }
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const getNoteEntryUserName = (entry) =>
  String(entry.userName || entry.user_name || '').trim();

const formatNotesForDownload = (notesString) => {
  const entries = parseSaleNotesEntries(notesString);
  if (!entries.length) return '';

  return entries
    .map((entry, index) => {
      const lines = [`Note ${index + 1}`];
      const ts = entry.timestamp;
      if (ts && ts !== 'Legacy') {
        const formatted = formatNoteDateTimeForDownload(ts);
        lines.push(`Date & time: ${formatted || String(ts)}`);
      } else if (ts === 'Legacy') {
        lines.push('Date & time: (not recorded)');
      }

      const userName = getNoteEntryUserName(entry);
      if (userName) {
        lines.push(`User: ${userName}`);
      }

      if (entry.note !== undefined && entry.note !== null && String(entry.note).trim() !== '') {
        lines.push('Note:');
        lines.push(String(entry.note).trim());
      }

      if (entry.appointment) {
        lines.push(`Appointment: ${entry.appointment}`);
      }

      if (Array.isArray(entry.comments) && entry.comments.length) {
        lines.push('Replies:');
        entry.comments.forEach((comment, cIdx) => {
          const cTs = formatNoteDateTimeForDownload(comment.timestamp) || String(comment.timestamp || '').trim() || '(not recorded)';
          const cUser = String(comment.userName || comment.user_name || '').trim() || 'Unknown user';
          lines.push(`  ${cIdx + 1}. Date & time: ${cTs}`);
          lines.push(`     User: ${cUser}`);
          lines.push(`     Note: ${String(comment.comment || '').trim()}`);
        });
      }

      return lines.join('\n');
    })
    .join('\n\n');
};

/**
 * Load full payment records for a sale (cards, banks, cheques, payment emails) via GET /api/payments?saleId=.
 * Returns the payments payload for the matching saleId, or null if unavailable.
 */
export async function fetchSalePaymentDetailsForDownload(apiClient, saleId) {
  if (apiClient == null || saleId === null || saleId === undefined || saleId === '') {
    return null;
  }
  const id = parseInt(String(saleId), 10);
  if (Number.isNaN(id)) return null;
  try {
    const res = await apiClient.get(`/api/payments?saleId=${id}&exportDocument=true`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !Array.isArray(data.payments)) {
      return null;
    }
    return data.payments.find((p) => Number(p.saleId) === id) || null;
  } catch {
    return null;
  }
}

const paymentDetailRow = (label, value, multiline = false) => {
  if (multiline) {
    const inner = escapeHtmlWithLineBreaks(value);
    if (inner === 'N/A') return '';
    return `<p class="line"><strong>${escapeHtml(label)}:</strong> <span class="multiline-body">${inner}</span></p>`;
  }
  const normalized = normalizeValue(value);
  if (normalized === 'N/A') return '';
  return `<p class="line"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(normalized)}</p>`;
};

const formatPaymentComments = (comments) => {
  if (!Array.isArray(comments) || comments.length === 0) return '';
  return comments
    .map((c, idx) => {
      const author = (c.userName || c.user_name || '').trim() || 'Unknown';
      const text = (c.text || c.comment || '').trim();
      return `${idx + 1}. ${author}: ${text}`;
    })
    .join('\n');
};

const buildPaymentsInfoSectionHtml = (paymentInfo) => {
  if (!paymentInfo) return '';
  const parts = [];

  const cards = paymentInfo.cards || [];
  if (cards.length) {
    parts.push('<h2 class="section-heading">Cards on file</h2>');
    cards.forEach((c, i) => {
      parts.push(`<p class="line section-subheading"><strong>Card ${i + 1}</strong></p>`);
      parts.push(paymentDetailRow('Provider', c.provider));
      parts.push(paymentDetailRow('Card type', c.cardType));
      parts.push(paymentDetailRow('Name on card', c.customerName));
      parts.push(paymentDetailRow('Card number', c.cardNumber));
      parts.push(paymentDetailRow('Expiry', c.expiryDate));
      parts.push(paymentDetailRow('CVV', c.cvv));
      parts.push(paymentDetailRow('Status', c.status));
      parts.push(paymentDetailRow('Created', c.createdDate || c.created_at));
      parts.push(paymentDetailRow('Added by', c.addedByUserName));
      const cmt = formatPaymentComments(c.comments);
      if (cmt) parts.push(paymentDetailRow('Comments', cmt, true));
    });
  }

  const banks = paymentInfo.banks || [];
  if (banks.length) {
    parts.push('<h2 class="section-heading">Bank accounts on file</h2>');
    banks.forEach((b, i) => {
      parts.push(`<p class="line section-subheading"><strong>Bank ${i + 1}</strong></p>`);
      parts.push(paymentDetailRow('Bank name', b.bankName));
      parts.push(paymentDetailRow('Account holder', b.accountHolder));
      parts.push(paymentDetailRow('Account number', b.accountNumber));
      parts.push(paymentDetailRow('Routing number', b.routingNumber));
      parts.push(paymentDetailRow('Check number', b.checkNumber));
      parts.push(paymentDetailRow('Driver license', b.driverLicense));
      parts.push(paymentDetailRow('Name on license', b.nameOnLicense));
      parts.push(paymentDetailRow('State / ID', b.stateId));
      parts.push(paymentDetailRow('Status', b.status));
      parts.push(paymentDetailRow('Created', b.createdDate || b.created_at));
      parts.push(paymentDetailRow('Added by', b.addedByUserName));
      const cmt = formatPaymentComments(b.comments);
      if (cmt) parts.push(paymentDetailRow('Comments', cmt, true));
    });
  }

  const chequesE = paymentInfo.chequesElectronic || [];
  if (chequesE.length) {
    parts.push('<h2 class="section-heading">Electronic cheques</h2>');
    chequesE.forEach((q, i) => {
      parts.push(`<p class="line section-subheading"><strong>Electronic cheque ${i + 1}</strong></p>`);
      parts.push(paymentDetailRow('Bank name', q.bankName));
      parts.push(paymentDetailRow('Routing number', q.routingNumber));
      parts.push(paymentDetailRow('Account number', q.accountNumber));
      parts.push(paymentDetailRow('Cheque number', q.chequeNumber));
      parts.push(paymentDetailRow('Name on cheque', q.nameOnCheque));
      parts.push(paymentDetailRow('State', q.state));
      parts.push(paymentDetailRow('Status', q.status));
      parts.push(paymentDetailRow('Notes', q.notes, true));
      parts.push(paymentDetailRow('Created', q.createdDate || q.created_at));
      parts.push(paymentDetailRow('Added by', q.addedByUserName));
      const cmt = formatPaymentComments(q.comments);
      if (cmt) parts.push(paymentDetailRow('Comments', cmt, true));
    });
  }

  const chequesM = paymentInfo.chequesMail || [];
  if (chequesM.length) {
    parts.push('<h2 class="section-heading">Mail cheques</h2>');
    chequesM.forEach((q, i) => {
      parts.push(`<p class="line section-subheading"><strong>Mail cheque ${i + 1}</strong></p>`);
      parts.push(paymentDetailRow('Bank name', q.bankName));
      parts.push(paymentDetailRow('Cheque number', q.chequeNumber));
      parts.push(paymentDetailRow('Name on cheque', q.nameOnCheque));
      parts.push(paymentDetailRow('Status', q.status));
      parts.push(paymentDetailRow('Notes', q.notes, true));
      parts.push(paymentDetailRow('Created', q.createdDate || q.created_at));
      parts.push(paymentDetailRow('Added by', q.addedByUserName));
      const cmt = formatPaymentComments(q.comments);
      if (cmt) parts.push(paymentDetailRow('Comments', cmt, true));
    });
  }

  const emails = paymentInfo.paymentEmails || [];
  if (emails.length) {
    parts.push('<h2 class="section-heading">Payment emails</h2>');
    emails.forEach((e, i) => {
      parts.push(`<p class="line section-subheading"><strong>Payment email ${i + 1}</strong></p>`);
      parts.push(paymentDetailRow('Email address', e.emailAddress));
      parts.push(paymentDetailRow('Invoice link', e.invoiceLink));
      parts.push(paymentDetailRow('Sent at', e.sentAt));
      parts.push(paymentDetailRow('Status', e.status));
      parts.push(paymentDetailRow('Notes', e.notes, true));
      parts.push(paymentDetailRow('Created', e.createdDate || e.created_at));
      parts.push(paymentDetailRow('Added by', e.addedByUserName));
      const cmt = formatPaymentComments(e.comments);
      if (cmt) parts.push(paymentDetailRow('Comments', cmt, true));
    });
  }

  const html = parts.join('');
  if (!html) {
    return '<h2 class="section-heading">Payment details</h2><p class="line">No payment methods on file for this sale.</p>';
  }
  return html;
};

const isEmptyReceiverValue = (val) => {
  const t = String(val ?? '').trim();
  return (
    t === '' ||
    t === 'N/A' ||
    t === 'n/a' ||
    t === 'null' ||
    t === 'undefined' ||
    t === '—' ||
    t === '-' ||
    t === 'NIL'
  );
};

/** Drop "Label: value" lines when value is empty / N/A / null-ish; drop blank lines */
const filterReceiverDetailText = (text) => {
  if (text == null) return '';
  const lines = normalizeLineBreaksInText(text).split('\n');
  const kept = lines.filter((line) => {
    const t = String(line).trim();
    if (!t) return false;
    const m = t.match(/^([^:]+):\s*(.*)$/);
    if (!m) return true;
    return !isEmptyReceiverValue(m[2]);
  });
  return kept.join('\n').trim();
};

/** Sum of receiver type counts, else parsed NoReceiver when receivers map is empty */
const getReceiverUnitTotal = (sale = {}) => {
  const receivers = sale?.receivers;
  if (receivers && typeof receivers === 'object' && !Array.isArray(receivers)) {
    const keys = Object.keys(receivers);
    if (keys.length) {
      return keys.reduce((acc, k) => acc + (Number(receivers[k]) || 0), 0);
    }
  }
  const raw = sale?.NoReceiver ?? sale?.noReceiver;
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * Export line: grand total plus each receiver type count, e.g. "7 total — DVR: 2; Genie: 5".
 * If there is no receivers map, falls back to NoReceiver only, e.g. "7 total".
 */
const getReceiverCountSummaryForDownload = (sale = {}) => {
  const receivers = sale?.receivers;
  if (receivers && typeof receivers === 'object' && !Array.isArray(receivers)) {
    const keys = Object.keys(receivers).filter((k) => k != null && String(k).trim() !== '');
    if (keys.length) {
      const sorted = [...keys].sort((a, b) => String(a).localeCompare(String(b)));
      const total = sorted.reduce((acc, k) => acc + (Number(receivers[k]) || 0), 0);
      const perType = sorted.map((k) => `${k}: ${Number(receivers[k]) || 0}`).join('; ');
      return `${total} total — ${perType}`;
    }
  }
  const n = getReceiverUnitTotal(sale);
  return n == null ? null : `${n} total`;
};

const getReceiverEntries = (sale = {}) => {
  const receivers = sale.receivers || {};
  const receiversInfo = sale.receiversInfo || {};

  return Object.keys(receivers).flatMap((receiverName) => {
    const count = Number(receivers[receiverName]) || 0;
    const sections = [];

    for (let index = 1; index <= count; index += 1) {
      const templateKey = `${receiverName}_${index}`;
      const raw = receiversInfo[templateKey];
      if (raw == null) continue;
      const asString = typeof raw === 'string' ? raw : String(raw);
      if (asString.trim() === '') continue;
      const cleaned = filterReceiverDetailText(asString);
      if (!cleaned) continue;
      const block = [`System Information ${index}`, cleaned].join('\n');
      sections.push(block);
    }

    if (!sections.length) {
      return [];
    }

    return [
      {
        label: `${receiverName} Receiver Details`,
        value: sections.join('\n\n'),
        multiline: true,
        /** Body lines indented like the previous HTML export (tab-style block) */
        indentMultilineBody: true
      }
    ];
  });
};

const buildPaymentsInfoSections = (paymentInfo) => {
  if (!paymentInfo) return [];
  const sections = [];

  const cards = paymentInfo.cards || [];
  if (cards.length) {
    sections.push({
      heading: 'Cards on file',
      rows: cards.flatMap((c, i) => {
        const cmt = formatPaymentComments(c.comments);
        return [
          { label: `Card ${i + 1}`, value: '' },
          { label: 'Provider', value: c.provider },
          { label: 'Card type', value: c.cardType },
          { label: 'Name on card', value: c.customerName },
          { label: 'Card number', value: c.cardNumber },
          { label: 'Expiry', value: c.expiryDate },
          { label: 'CVV', value: c.cvv },
          { label: 'Status', value: c.status },
          { label: 'Created', value: c.createdDate || c.created_at },
          { label: 'Added by', value: c.addedByUserName },
          { label: 'Comments', value: cmt, multiline: true }
        ];
      })
    });
  }

  const banks = paymentInfo.banks || [];
  if (banks.length) {
    sections.push({
      heading: 'Bank accounts on file',
      rows: banks.flatMap((b, i) => {
        const cmt = formatPaymentComments(b.comments);
        return [
          { label: `Bank ${i + 1}`, value: '' },
          { label: 'Bank name', value: b.bankName },
          { label: 'Account holder', value: b.accountHolder },
          { label: 'Account number', value: b.accountNumber },
          { label: 'Routing number', value: b.routingNumber },
          { label: 'Check number', value: b.checkNumber },
          { label: 'Driver license', value: b.driverLicense },
          { label: 'Name on license', value: b.nameOnLicense },
          { label: 'State / ID', value: b.stateId },
          { label: 'Status', value: b.status },
          { label: 'Created', value: b.createdDate || b.created_at },
          { label: 'Added by', value: b.addedByUserName },
          { label: 'Comments', value: cmt, multiline: true }
        ];
      })
    });
  }

  const chequesE = paymentInfo.chequesElectronic || [];
  if (chequesE.length) {
    sections.push({
      heading: 'Electronic cheques',
      rows: chequesE.flatMap((q, i) => {
        const cmt = formatPaymentComments(q.comments);
        return [
          { label: `Electronic cheque ${i + 1}`, value: '' },
          { label: 'Bank name', value: q.bankName },
          { label: 'Routing number', value: q.routingNumber },
          { label: 'Account number', value: q.accountNumber },
          { label: 'Cheque number', value: q.chequeNumber },
          { label: 'Name on cheque', value: q.nameOnCheque },
          { label: 'State', value: q.state },
          { label: 'Status', value: q.status },
          { label: 'Notes', value: q.notes, multiline: true },
          { label: 'Created', value: q.createdDate || q.created_at },
          { label: 'Added by', value: q.addedByUserName },
          { label: 'Comments', value: cmt, multiline: true }
        ];
      })
    });
  }

  const chequesM = paymentInfo.chequesMail || [];
  if (chequesM.length) {
    sections.push({
      heading: 'Mail cheques',
      rows: chequesM.flatMap((q, i) => {
        const cmt = formatPaymentComments(q.comments);
        return [
          { label: `Mail cheque ${i + 1}`, value: '' },
          { label: 'Bank name', value: q.bankName },
          { label: 'Cheque number', value: q.chequeNumber },
          { label: 'Name on cheque', value: q.nameOnCheque },
          { label: 'Status', value: q.status },
          { label: 'Notes', value: q.notes, multiline: true },
          { label: 'Created', value: q.createdDate || q.created_at },
          { label: 'Added by', value: q.addedByUserName },
          { label: 'Comments', value: cmt, multiline: true }
        ];
      })
    });
  }

  const emails = paymentInfo.paymentEmails || [];
  if (emails.length) {
    sections.push({
      heading: 'Payment emails',
      rows: emails.flatMap((e, i) => {
        const cmt = formatPaymentComments(e.comments);
        return [
          { label: `Payment email ${i + 1}`, value: '' },
          { label: 'Email address', value: e.emailAddress },
          { label: 'Invoice link', value: e.invoiceLink },
          { label: 'Sent at', value: e.sentAt },
          { label: 'Status', value: e.status },
          { label: 'Notes', value: e.notes, multiline: true },
          { label: 'Created', value: e.createdDate || e.created_at },
          { label: 'Added by', value: e.addedByUserName },
          { label: 'Comments', value: cmt, multiline: true }
        ];
      })
    });
  }

  return sections;
};

const buildSaleDocRows = ({ sale = {}, customer = {}, card = {}, bank = {}, paymentsInfo = null }) => {
  const fullName = normalizeValue(
    customer.fullName ||
      [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      card.customerName ||
      bank.accountHolder
  );
  const spokeTo = normalizeValue(sale.spokeTo || sale.spoke_to, '');
  const customerLine = spokeTo ? `${fullName} (${spokeTo})` : fullName;
  const tvCount = sale.numberOfTv || sale.NoFTV || sale.numberOfTV;
  const dueOn = sale.dueOn || sale.dueonDate || sale.dueDate;
  const balance = sale.balance;
  const currentBill = sale.currentBill || sale.regularBill;
  const quotedBill = sale.quotedBill || sale.promotionalBill || sale.regularBill;
  const receiverRows = getReceiverEntries(sale);
  const receiverCountSummary = getReceiverCountSummaryForDownload(sale);

  const coreRows = [
    { label: 'Customer', value: customerLine },
    { label: 'Home', value: customer.landline || customer.homePhone || customer.phone },
    { label: 'Phone', value: customer.phone },
    { label: 'Address', value: customer.address, multiline: true },
    { label: 'City', value: customer.city },
    { label: 'State', value: customer.state },
    { label: 'Zipcode', value: customer.zipcode || customer.zipCode },
    { label: 'Mailing Address', value: customer.mailingAddress, multiline: true },
    { label: 'Customer Feedback', value: customer.customerFeedback, multiline: true },
    { label: 'Spoke To', value: sale.spokeTo || sale.spoke_to },
    { label: 'Carrier', value: sale.carrier },
    { label: 'Package', value: sale.newPackage || sale.basicPackage },
    { label: 'Package Status', value: sale.basicPackageStatus },
    { label: 'Account #', value: sale.accountNumber || sale.AccNumber || sale.accountNo },
    { label: 'Account Holder', value: sale.AccHolder || bank.accountHolder || bank.account_holder },
    { label: 'Bundle', value: sale.bundle },
    { label: 'Company', value: sale.company },
    { label: 'Number of TV', value: tvCount },
    { label: 'Number of Receivers', value: sale.NoReceiver },
    ...(receiverCountSummary != null ? [{ label: 'Total receiver count', value: receiverCountSummary }] : []),
    ...receiverRows,
    { label: 'PIN', value: sale.pinCode || sale.pin_code },
    { label: 'PIN Status', value: sale.pin_code_status },
    { label: 'SSN Name', value: sale.ssnName },
    { label: 'SSN', value: sale.ssnNumber },
    { label: 'SSN Status', value: sale.ssn_number_status },
    { label: 'Balance', value: `${normalizeValue(balance)}${normalizeValue(dueOn, '') !== '' ? ` due on ${normalizeValue(dueOn)}` : ''}` },
    { label: 'Current Bill', value: currentBill },
    { label: 'Quoted Bill', value: quotedBill },
    { label: 'Charge', value: sale.charge },
    { label: 'Verified On', value: sale.verifiedOn },
    { label: 'Last Payment', value: sale.lastPayment },
    { label: 'Last Payment Date', value: sale.lastPaymentDate },
    { label: 'Breakdown', value: sale.breakdown, multiline: true, indentMultilineBody: true },
    { label: 'Additional Info', value: sale.additionalInfo, multiline: true, indentMultilineBody: true },
    { label: 'Notes', value: formatNotesForDownload(sale.notes), multiline: true, indentMultilineBody: true },
    { label: 'Tech Visit Date', value: sale.techVisitDate },
    { label: 'Tech Visit Time', value: sale.techVisitTime },
    { label: 'Appointment Date Time', value: sale.appointmentDateTime },
    { label: 'Security Question', value: sale.question, multiline: true },
    { label: 'Security Answer', value: sale.answer, multiline: true }
  ];

  const formPaymentRows = [
    { label: 'Visa', value: card.cardNumber || card.maskedCardNumber || card.masked_card_number },
    { label: 'Exp.', value: card.expiryDate || card.expiry_date },
    { label: 'CVV', value: card.cvv },
    { label: 'Name on the Card', value: card.customerName },
    { label: 'Card Type', value: card.cardType || card.card_type },
    { label: 'Card Provider', value: card.provider },
    { label: 'Routing #', value: bank.routingNumber || bank.routing_number },
    { label: 'Account #', value: bank.accountNumber || bank.maskedAccountNumber || bank.masked_account_number },
    { label: 'Check #', value: bank.checkNumber || bank.check_number },
    { label: 'Bank', value: bank.bankName || bank.bank_name },
    { label: 'A/C Holder', value: bank.accountHolder || bank.account_holder },
    { label: 'Bank / ID state', value: bank.stateId || bank.state }
  ];

  return paymentsInfo ? coreRows : [...coreRows, ...formPaymentRows];
};

const createDocxBlob = async ({ title = 'Document', generatedAt = new Date(), meta = [], sections = [] }) => {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const paragraphSpacing = { after: 120, line: 360 };

  /** One paragraph with Word line breaks — avoids extra paragraph spacing between wrapped lines */
  const paragraphFromMultilineLabel = (label, rawText) => {
    const normalized = normalizeLineBreaksInText(rawText).trim();
    if (!normalized) return null;
    const lines = normalized.split('\n');
    const runs = [];
    if (label != null && String(label).trim() !== '') {
      runs.push(new TextRun({ text: `${String(label).trim()}: `, bold: true }));
    }
    runs.push(new TextRun(lines[0] || ''));
    for (let i = 1; i < lines.length; i += 1) {
      runs.push(new TextRun({ break: 1 }));
      runs.push(new TextRun(lines[i] || ''));
    }
    return new Paragraph({ spacing: paragraphSpacing, children: runs });
  };

  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, spacing: paragraphSpacing }),
    new Paragraph({
      spacing: paragraphSpacing,
      children: [new TextRun({ text: 'Generated: ', bold: true }), new TextRun(String(generatedAt.toLocaleString()))]
    })
  ];

  meta.forEach((line) => {
    if (line && String(line).trim()) {
      children.push(new Paragraph({ text: String(line).trim(), spacing: paragraphSpacing }));
    }
  });

  sections.forEach((section) => {
    if (section.heading) {
      children.push(new Paragraph({ text: String(section.heading), heading: HeadingLevel.HEADING_2, spacing: paragraphSpacing }));
    }
    (section.rows || []).forEach(({ label, value, multiline = false, indentMultilineBody = false }) => {
      if (multiline) {
        const normalized = normalizeLineBreaksInText(value).trim();
        if (!normalized) return;
        if (indentMultilineBody) {
          children.push(
            new Paragraph({
              spacing: { ...paragraphSpacing, after: 60 },
              children: [new TextRun({ text: `${String(label).trim()}:`, bold: true })]
            })
          );
          const lines = normalized.split('\n');
          const bodyRuns = [];
          lines.forEach((line, i) => {
            if (i > 0) bodyRuns.push(new TextRun({ break: 1 }));
            const trimmedLeadTabs = String(line || '').replace(/^\t+/, '');
            bodyRuns.push(new TextRun(trimmedLeadTabs));
          });
          children.push(
            new Paragraph({
              spacing: paragraphSpacing,
              indent: { left: 360 },
              children: bodyRuns
            })
          );
        } else {
          const p = paragraphFromMultilineLabel(label, value);
          if (p) children.push(p);
        }
      } else {
        const normalized = normalizeValue(value, '');
        if (!normalized) return;
        children.push(
          new Paragraph({
            spacing: paragraphSpacing,
            children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(String(normalized))]
          })
        );
      }
    });
    if (section.content) {
      const text = stripHtmlToText(section.content);
      if (text) {
        const p = paragraphFromMultilineLabel('', text);
        if (p) children.push(p);
      }
    }
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
};

const buildSaleDownloadHtml = ({
  title = 'Sale Summary',
  generatedAt = new Date(),
  sale = {},
  customer = {},
  card = {},
  bank = {},
  paymentsInfo = null
}) => {
  sale = sale || {};
  customer = customer || {};
  card = card || {};
  bank = bank || {};

  const fullName = normalizeValue(
    customer.fullName ||
      [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      card.customerName ||
      bank.accountHolder
  );
  const spokeTo = normalizeValue(sale.spokeTo || sale.spoke_to, '');
  const customerLine = spokeTo ? `${fullName} (${spokeTo})` : fullName;
  const streetAddress = customer.address;
  const tvCount = sale.numberOfTv || sale.NoFTV || sale.numberOfTV;
  const dueOn = sale.dueOn || sale.dueonDate || sale.dueDate;
  const balance = sale.balance;
  const currentBill = sale.currentBill || sale.regularBill;
  const quotedBill = sale.quotedBill || sale.promotionalBill || sale.regularBill;
  const saleTags = formatSaleTagsForDownload(sale);
  const receiverRows = getReceiverEntries(sale);
  const receiverCountSummary = getReceiverCountSummaryForDownload(sale);
  const coreRows = [
    { label: 'Customer', value: customerLine },
    { label: 'Home', value: customer.landline || customer.homePhone || customer.phone },
    { label: 'Phone', value: customer.phone },
    { label: 'Address', value: streetAddress, multiline: true },
    { label: 'City', value: customer.city },
    { label: 'State', value: customer.state },
    { label: 'Zipcode', value: customer.zipcode || customer.zipCode },
    { label: 'Mailing Address', value: customer.mailingAddress, multiline: true },
    { label: 'Customer Feedback', value: customer.customerFeedback, multiline: true },
    { label: 'Spoke To', value: sale.spokeTo || sale.spoke_to },
    { label: 'Carrier', value: sale.carrier },
    { label: 'Package', value: sale.newPackage || sale.basicPackage },
    { label: 'Package Status', value: sale.basicPackageStatus },
    { label: 'Account #', value: sale.accountNumber || sale.AccNumber || sale.accountNo },
    { label: 'Account Holder', value: sale.AccHolder || bank.accountHolder || bank.account_holder },
    { label: 'Bundle', value: sale.bundle },
    { label: 'Company', value: sale.company },
    { label: 'Number of TV', value: tvCount },
    { label: 'Number of Receivers', value: sale.NoReceiver },
    ...(receiverCountSummary != null ? [{ label: 'Total receiver count', value: receiverCountSummary }] : []),
    ...receiverRows,
    { label: 'PIN', value: sale.pinCode || sale.pin_code },
    { label: 'PIN Status', value: sale.pin_code_status },
    { label: 'SSN Name', value: sale.ssnName },
    { label: 'SSN', value: sale.ssnNumber },
    { label: 'SSN Status', value: sale.ssn_number_status },
    {
      label: 'Balance',
      value: `${normalizeValue(balance)}${normalizeValue(dueOn, '') !== '' ? ` due on ${normalizeValue(dueOn)}` : ''}`
    },
    { label: 'Current Bill', value: currentBill },
    { label: 'Quoted Bill', value: quotedBill },
    { label: 'Charge', value: sale.charge },
    { label: 'Verified On', value: sale.verifiedOn },
    { label: 'Last Payment', value: sale.lastPayment },
    { label: 'Last Payment Date', value: sale.lastPaymentDate },
    { label: 'Breakdown', value: sale.breakdown, multiline: true, indentMultilineBody: true },
    { label: 'Additional Info', value: sale.additionalInfo, multiline: true, indentMultilineBody: true },
    { label: 'Notes', value: formatNotesForDownload(sale.notes), multiline: true, indentMultilineBody: true },
    { label: 'Tech Visit Date', value: sale.techVisitDate },
    { label: 'Tech Visit Time', value: sale.techVisitTime },
    { label: 'Appointment Date Time', value: sale.appointmentDateTime },
    { label: 'Security Question', value: sale.question, multiline: true },
    { label: 'Security Answer', value: sale.answer, multiline: true }
  ];

  const formPaymentRows = [
    { label: 'Visa', value: card.cardNumber || card.maskedCardNumber || card.masked_card_number },
    { label: 'Exp.', value: card.expiryDate || card.expiry_date },
    { label: 'CVV', value: card.cvv },
    { label: 'Name on the Card', value: card.customerName },
    { label: 'Card Type', value: card.cardType || card.card_type },
    { label: 'Card Provider', value: card.provider },
    { label: 'Routing #', value: bank.routingNumber || bank.routing_number },
    { label: 'Account #', value: bank.accountNumber || bank.maskedAccountNumber || bank.masked_account_number },
    { label: 'Check #', value: bank.checkNumber || bank.check_number },
    { label: 'Bank', value: bank.bankName || bank.bank_name },
    { label: 'A/C Holder', value: bank.accountHolder || bank.account_holder },
    { label: 'Bank / ID state', value: bank.stateId || bank.state }
  ];

  const rows = paymentsInfo ? [...coreRows] : [...coreRows, ...formPaymentRows];

  const contentHtml = rows
    .map(({ label, value, multiline = false, indentMultilineBody = false }) => {
      if (multiline) {
        const inner = escapeHtmlWithLineBreaks(value);
        if (inner === 'N/A') return '';
        if (indentMultilineBody) {
          return `<p class="line"><strong>${escapeHtml(label)}:</strong></p><div class="line multiline-indented"><span class="multiline-body">${inner}</span></div>`;
        }
        return `<p class="line"><strong>${escapeHtml(label)}:</strong> <span class="multiline-body">${inner}</span></p>`;
      }
      const normalized = normalizeValue(value);
      if (normalized === 'N/A') return '';
      return `<p class="line"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(normalized)}</p>`;
    })
    .filter(Boolean)
    .join('');

  const paymentsSectionHtml = paymentsInfo ? buildPaymentsInfoSectionHtml(paymentsInfo) : '';
  const tagsMetaHtml = saleTags
    ? `<p class="meta"><strong>Tags:</strong> ${escapeHtml(saleTags)}</p>`
    : '';

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: "Times New Roman", Times, serif;
            font-size: 12pt;
            line-height: 1.3;
            color: #000000;
            margin: 24px;
            white-space: normal;
          }
          h1 {
            font-size: 16pt;
            margin: 0 0 16px 0;
            font-weight: 700;
          }
          h2.section-heading {
            font-size: 14pt;
            margin: 22px 0 8px 0;
            font-weight: 700;
          }
          p.section-subheading {
            margin: 12px 0 4px 0;
          }
          .meta {
            margin: 0 0 18px 0;
          }
          .line {
            margin: 0 0 6px 0;
          }
          .multiline-body {
            display: inline;
          }
          .multiline-indented {
            margin: 0 0 6px 0;
            padding-left: 0.35in;
          }
          .spacer {
            margin: 0 0 10px 0;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta"><strong>Generated:</strong> ${escapeHtml(generatedAt.toLocaleString())}</p>
        ${tagsMetaHtml}
        ${contentHtml}
        ${paymentsSectionHtml}
      </body>
    </html>
  `;
};

export const downloadDoc = async ({
  title = 'Document',
  fileName = 'document.docx',
  sections = [],
  generatedAt = new Date()
}) => {
  const blob = await createDocxBlob({ title, generatedAt, sections });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const buildSaleDocSections = ({
  saleRows = [],
  customerRows = [],
  paymentContent = ''
}) => {
  const sections = [];

  if (saleRows.length) {
    sections.push({
      heading: 'Sale Details',
      rows: saleRows
    });
  }

  if (customerRows.length) {
    sections.push({
      heading: 'Customer Information',
      rows: customerRows
    });
  }

  const defaultPaymentContent = `<table style="${DOC_TABLE_STYLE}">
    ${DOC_TABLE_COLGROUP}
    ${buildTableRows([{ label: 'Payment Details', value: 'No payment information provided' }])}
  </table>`;

  sections.push({
    heading: 'Payment Details',
    content: paymentContent || defaultPaymentContent
  });

  return sections;
};

export const downloadSaleDoc = async ({
  fileName = 'sale-summary.docx',
  saleRows = [],
  customerRows = [],
  paymentContent = '',
  title = 'Sale Summary',
  sale = null,
  customer = null,
  card = null,
  bank = null,
  paymentsInfo = null
}) => {
  if (sale || customer || card || bank || paymentsInfo) {
    const saleId = sale?.id || sale?.saleId || sale?.sale_id || sale?.uuid || 'id';
    const agent = (sale && sale.agent) || {};
    const agentName =
      `${agent.firstName || agent.first_name || ''} ${agent.lastName || agent.last_name || ''}`.trim() || 'Unknown';
    const titleWithSaleId = `${saleId} sale ${agentName}`;
    const rows = buildSaleDocRows({
      sale: sale || {},
      customer: customer || {},
      card: card || {},
      bank: bank || {},
      paymentsInfo
    });
    const tags = formatSaleTagsForDownload(sale || {});
    const paymentSections = buildPaymentsInfoSections(paymentsInfo);
    const blob = await createDocxBlob({
      title: titleWithSaleId,
      generatedAt: new Date(),
      meta: tags ? [`Tags: ${tags}`] : [],
      sections: [
        { heading: 'Sale Summary', rows },
        ...paymentSections
      ]
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const normalizedPaymentContent = paymentContent ? stripHtmlToText(paymentContent) : '';
  const sections = buildSaleDocSections({
    saleRows,
    customerRows,
    paymentContent: normalizedPaymentContent
      ? `<p style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; white-space: pre-line;">${escapeHtml(normalizedPaymentContent)}</p>`
      : ''
  });
  await downloadDoc({ title, fileName, sections });
};

