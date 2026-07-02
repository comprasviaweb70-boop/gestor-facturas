import ExcelJS from 'exceljs';

const HEADER_BG_COLOR = 'FF00427E';
const HEADER_FONT_COLOR = 'FFFFFFFF';

export function applyHeaderStyle(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_BG_COLOR },
    };
    cell.font = {
      color: { argb: HEADER_FONT_COLOR },
      bold: true,
    };
    cell.alignment = { horizontal: 'center' };
  });
}

export function autoFitColumns(worksheet: ExcelJS.Worksheet, minWidth = 12): void {
  worksheet.columns.forEach((column) => {
    if (!column || !column.eachCell) return;
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLength) maxLength = len;
    });
    column.width = Math.max(minWidth, maxLength + 2);
  });
}

export function downloadWorkbook(
  buffer: ExcelJS.Buffer,
  fileName: string
): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
}
