const path = require('path');
const zlib = require('zlib');

const XML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(str) {
  return String(str).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, ent) => {
    if (ent.startsWith('#x')) return String.fromCodePoint(parseInt(ent.slice(2), 16));
    if (ent.startsWith('#')) return String.fromCodePoint(parseInt(ent.slice(1), 10));
    return XML_ENTITIES[ent] || _;
  });
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

function parseCsvText(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    const err = new Error('Malformed CSV: unclosed quote found.');
    err.status = 400;
    throw err;
  }

  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

function readZipEntries(buffer) {
  // Locate End of Central Directory (PK\x05\x06)
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    const err = new Error('Invalid Excel (.xlsx) file structure.');
    err.status = 400;
    throw err;
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries && ptr + 46 <= buffer.length; idx++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const fileName = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > buffer.length) continue;
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;

    const lNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const slice = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.set(fileName, slice);
    } else if (method === 8) {
      entries.set(fileName, zlib.inflateRawSync(slice));
    }
  }
  return entries;
}

function colRefToIndex(ref) {
  const letters = String(ref || '').replace(/[0-9]/g, '').toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let combined = '';
    let tMatch;
    while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
      combined += decodeXml(tMatch[1]);
    }
    strings.push(combined);
  }
  return strings;
}

function parseXlsxBuffer(buffer) {
  const entries = readZipEntries(buffer);
  const sharedStringsXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const sharedStrings = parseSharedStrings(sharedStringsXml);

  let sheetBuf = entries.get('xl/worksheets/sheet1.xml');
  if (!sheetBuf) {
    for (const [name, buf] of entries.entries()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) {
        sheetBuf = buf;
        break;
      }
    }
  }
  if (!sheetBuf) {
    const err = new Error('No worksheet found inside the Excel (.xlsx) file.');
    err.status = 400;
    throw err;
  }

  const sheetXml = sheetBuf.toString('utf8');
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowCells = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2];
      const rMatch = /\br="([A-Za-z]+\d+)"/.exec(attrs);
      const tMatch = /\bt="([^"]+)"/.exec(attrs);
      const colIdx = rMatch ? colRefToIndex(rMatch[1]) : rowCells.length;
      const cellType = tMatch ? tMatch[1] : 'n';

      let val = '';
      if (cellType === 'inlineStr') {
        const tVal = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        val = tVal ? decodeXml(tVal[1]) : '';
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
        if (vMatch) {
          const rawVal = decodeXml(vMatch[1]);
          if (cellType === 's') {
            val = sharedStrings[Number(rawVal)] ?? '';
          } else {
            val = rawVal;
          }
        }
      }

      while (rowCells.length <= colIdx) rowCells.push('');
      rowCells[colIdx] = String(val).trim();
    }

    if (rowCells.some((c) => c !== '')) {
      rows.push(rowCells);
    }
  }

  return rows;
}

function parseMarksSpreadsheet(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const buf = file.buffer;

  if (ext === '.xlsx') {
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      const err = new Error('Uploaded .xlsx file is not a valid Excel workbook.');
      err.status = 400;
      throw err;
    }
    return { format: 'xlsx', rows: parseXlsxBuffer(buf) };
  }

  if (ext === '.csv' || ext === '.txt' || file.mimetype === 'text/csv') {
    return { format: 'csv', rows: parseCsvText(buf.toString('utf8')) };
  }

  if (ext === '.xls') {
    const err = new Error('Legacy .xls format is not supported. Please save the Excel file as .csv or .xlsx and upload again.');
    err.status = 400;
    throw err;
  }

  const err = new Error('Unsupported file type. Please upload a .csv or .xlsx marks file.');
  err.status = 400;
  throw err;
}

module.exports = {
  parseCsvText,
  parseXlsxBuffer,
  parseMarksSpreadsheet,
};
