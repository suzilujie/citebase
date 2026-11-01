// Generates the sample PDF used by the demo and the eval set.
//
// Why hand-rolled instead of a pdf library: the file only needs a text layer and
// real page breaks, and the standard Helvetica font keeps the file ASCII-only.
// Chinese needs an embedded CID font, so this sample is deliberately English —
// which also proves the pipeline handles a mixed-language corpus.

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;
const LEADING = 15;
const MAX_CHARS = 86;
const LINES_PER_PAGE = 44;

const OUT = `${import.meta.dir}/../../evals/docs/invoice-guide.pdf`;

const LINES: string[] = [
  'Invoice Processing Guide',
  'Xinglan Technology Co., Ltd. - Finance Operations / Accounts Payable',
  'Version 3.2 - Effective 1 April 2025',
  '',
  '1. Scope',
  'This guide describes how accounts payable processes vendor invoices for goods and',
  'services purchased against a purchase order. Employee expense claims are handled by',
  'the expense policy and are out of scope here.',
  '',
  '2. Submission window',
  'Invoices must be submitted through the AP portal within 45 days of the invoice date.',
  'Invoices received after the 45-day window are returned to the vendor and must be',
  're-issued with a current invoice date. The portal accepts PDF files up to 10 MB;',
  'scanned images without a text layer are rejected automatically.',
  '',
  '3. Required fields',
  'Every invoice must state the vendor legal name, invoice number, invoice date,',
  'purchase order number, subtotal, tax amount, total amount and the six-digit cost',
  'center. An invoice without a purchase order number is placed on hold until a',
  'matching PO is created. Holds longer than 15 business days are escalated to the',
  'finance controller.',
  '',
  '4. Approval matrix',
  'Invoices under USD 1,000 are approved by the team lead.',
  'Invoices from USD 1,000 to USD 10,000 are approved by the department head.',
  'Invoices above USD 10,000 require approval from the CFO.',
  'Approval must be completed within 5 business days, otherwise the request is',
  're-assigned to the next level in the matrix.',
  '',
  'Every approved invoice keeps an audit trail: approver name, timestamp and the',
  'purchase order it was matched against.',
  '',
  '5. Payment terms',
  'The standard payment term is Net 30 from the approval date, not from the invoice',
  'date. A 2% early payment discount applies when an approved invoice is paid within',
  '10 days of approval. Payments are executed every Tuesday and Thursday through the',
  'banking partner.',
  '',
  'Vendors requesting a change of bank details must submit a signed form; the change',
  'takes effect only after a callback verification by the treasury team.',
  '',
  '6. Duplicate invoices',
  'The system detects a duplicate when the vendor name and the invoice number both',
  'match an existing record, regardless of amount or submission date. Duplicates are',
  'blocked automatically and listed in the weekly exception report for the AP manager.',
  'Re-submitting a blocked invoice never creates a second record.',
  '',
  '7. Currency and exchange rates',
  'Foreign currency invoices are converted at the exchange rate published on the',
  'invoice date. A tolerance of 1.5% is allowed for rate differences; anything above',
  'that requires a written explanation attached to the invoice record.',
  '',
  '8. Late payment',
  'Overdue invoices accrue interest at 0.05% per day, counted from the day after the',
  'due date. Interest is paid only when the delay is caused by the company, not when',
  'the vendor submitted incomplete documents.',
  '',
  '9. Exceptions',
  'Prepaid expenses are handled by the expense policy. Questions about a specific',
  'invoice should be raised as an AP ticket and are answered within one business day.',
];

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(line: string): string[] {
  if (line.length <= MAX_CHARS) return [line];
  const words = line.split(' ');
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > MAX_CHARS) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

function contentStream(lines: string[]): string {
  const body = lines.map((l) => `(${escapePdf(l)}) Tj T*`).join('\n');
  return `BT\n/F1 11 Tf\n${LEADING} TL\n1 0 0 1 ${MARGIN} ${PAGE_H - MARGIN} Tm\n${body}\nET`;
}

export function buildPdf(lines: string[]): Uint8Array {
  const wrapped = lines.flatMap(wrap);
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += LINES_PER_PAGE) {
    pages.push(wrapped.slice(i, i + LINES_PER_PAGE));
  }

  // Object 1 = catalog, 2 = page tree, then a page/content pair per page, and
  // the font last so its number is stable.
  const fontObj = 3 + pages.length * 2;
  const objects: string[] = [];
  const kids: number[] = [];

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';

  pages.forEach((pageLines, i) => {
    const pageObj = 3 + i * 2;
    const contentObj = pageObj + 1;
    kids.push(pageObj);

    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`;

    const stream = contentStream(pageLines);
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  objects[2] = `<< /Type /Pages /Kids [${kids.map((n) => `${n} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  objects[fontObj] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n <= fontObj; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }

  const xrefStart = out.length;
  out += `xref\n0 ${fontObj + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= fontObj; n++) {
    out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${fontObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(out);
}

/** Writes the sample PDF once; an existing file is never overwritten. */
export async function ensureSamplePdf(): Promise<string> {
  const file = Bun.file(OUT);
  if (await file.exists()) return OUT;
  await Bun.write(OUT, buildPdf(LINES));
  return OUT;
}

if (import.meta.main) {
  const path = await ensureSamplePdf();
  console.log(`[make:pdf] sample invoice guide ready: ${path}`);
}
