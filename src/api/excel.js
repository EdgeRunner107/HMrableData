import * as XLSX from 'xlsx/xlsx.mjs';

export const EXCEL_HEADERS = ['아이디', '닉네임', '채팅', '스트리머', '종류', '개수', '시간'];

export function normalizeAmount(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('금액은 정확한 정수여야 합니다. 큰 정수는 엑셀에서 텍스트로 입력해주세요.');
  const cleaned = String(value).replace(/,/g, '').replace(/개/g, '').trim();
  if (!/^[+-]?\d+$/.test(cleaned)) throw new Error('금액은 정수여야 합니다.');
  const amount = BigInt(cleaned);
  if (amount < -9223372036854775808n || amount > 9223372036854775807n) throw new Error('금액이 DB 정수 범위를 벗어났습니다.');
  return amount >= BigInt(Number.MIN_SAFE_INTEGER) && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : amount.toString();
}

export function normalizeTime(value, date1904 = false) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!date) throw new Error('유효하지 않은 엑셀 날짜입니다.');
    const pad = n => String(n).padStart(2, '0');
    value = `${String(date.y).padStart(4, '0')}-${pad(date.m)}-${pad(date.d)} ${pad(date.H)}:${pad(date.M)}:${pad(Math.floor(date.S))}`;
  }
  if (typeof value !== 'string') throw new Error('시간은 날짜/시간 문자열이어야 합니다.');
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?)?$/.exec(text);
  if (!match) throw new Error('시간은 YYYY-MM-DD HH:mm:ss 형식이어야 합니다.');
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const date = new Date(0);
  date.setUTCFullYear(+year, +month - 1, +day);
  if (+year < 1 || date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day || +hour > 23 || +minute > 59 || +second > 59) {
    throw new Error('유효하지 않은 날짜/시간입니다.');
  }
  // DB timestamp without time zone. UTC/KST 변환 없이 기존 시각을 그대로 전송합니다.
  return text;
}

export function parseExcel(buffer, { season, round }) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('첫 번째 시트를 찾을 수 없습니다.');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true });
  const headers = (matrix[0] || []).map(value => String(value).trim());
  const missing = EXCEL_HEADERS.filter(name => !headers.includes(name));
  if (missing.length) throw new Error(`필수 컬럼 누락: ${missing.join(', ')}`);
  if (EXCEL_HEADERS.some(name => headers.filter(h => h === name).length !== 1)) throw new Error('필수 컬럼이 중복되어 있습니다.');
  const indices = EXCEL_HEADERS.map(name => headers.indexOf(name));
  const rows = [], errors = [], excluded = [];
  let dataRows = 0;
  matrix.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    if (!cells.some(value => value !== '' && value != null)) {
      excluded.push({ row: rowNumber, reason: '빈 행' });
      return;
    }
    dataRows++;
    try {
      const values = indices.map(i => cells[i] ?? '');
      const mapped = {};
      EXCEL_HEADERS.slice(0, 5).forEach((name, i) => {
        if (typeof values[i] === 'number' && !Number.isSafeInteger(values[i])) throw new Error(`${name}: 숫자 정밀도를 확인해주세요. 텍스트 셀을 사용해주세요.`);
        mapped[name] = String(values[i]);
      });
      rows.push({ _row: rowNumber, ...mapped, 개수: normalizeAmount(values[5]),
        시간: normalizeTime(values[6], !!workbook.Workbook?.WBProps?.date1904), 회차: round, season });
    } catch (error) { errors.push({ row: rowNumber, message: error.message }); }
  });
  if (!dataRows) throw new Error('업로드할 데이터가 없습니다.');
  return { rows, errors, excluded, totalRows: matrix.length - 1, dataRows, parsedRows: dataRows, validRows: rows.length };
}
