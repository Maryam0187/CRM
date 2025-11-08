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

export const downloadDoc = ({
  title = 'Document',
  fileName = 'document.doc',
  sections = [],
  generatedAt = new Date()
}) => {
  const sectionsHtml = sections
    .map(({ heading, rows = [], content = '' }) => {
      const headingHtml = heading ? `<h2>${escapeHtml(heading)}</h2>` : '';
      const tableHtml = rows.length
        ? `<table style="${DOC_TABLE_STYLE}">
            ${DOC_TABLE_COLGROUP}
            ${buildTableRows(rows)}
           </table>`
        : '';
      return `${headingHtml}${tableHtml}${content || ''}`;
    })
    .join('');

  const docContent = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { color: #1f2937; }
          h2 { margin-top: 24px; color: #111827; }
          table { border-collapse: collapse; width: 100%; margin-top: 8px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p><strong>Generated:</strong> ${escapeHtml(generatedAt.toLocaleString())}</p>
        ${sectionsHtml}
      </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword' });
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

export const downloadSaleDoc = ({
  fileName = 'sale-summary.doc',
  saleRows = [],
  customerRows = [],
  paymentContent = '',
  title = 'Sale Summary'
}) => {
  const sections = buildSaleDocSections({ saleRows, customerRows, paymentContent });
  downloadDoc({ title, fileName, sections });
};

