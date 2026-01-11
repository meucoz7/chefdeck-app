import * as XLSX from 'xlsx';
import { Ingredient } from '../types';

export interface ParsedExcelData {
  title: string;
  ingredients: Ingredient[];
}

export const parseExcelFile = (file: File): Promise<ParsedExcelData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Assume first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Heuristic: Title is usually in the first few rows in cell A1 or merged cells
        // Let's assume the first non-empty cell in the first 5 rows that is a string is the title
        let title = "Новая техкарта";
        for(let i=0; i<Math.min(rows.length, 5); i++) {
            if (rows[i] && rows[i][0] && typeof rows[i][0] === 'string' && rows[i][0].length > 3) {
                title = rows[i][0];
                break;
            }
        }

        // Find Table Header
        let headerRowIndex = -1;
        let nameColIndex = -1;
        let unitColIndex = -1;

        // Keywords to search for
        const nameKeywords = ['наименование', 'продукт', 'ингредиент', 'сырье'];
        const unitKeywords = ['ед', 'изм']; // ед. изм., ед.

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            for (let j = 0; j < row.length; j++) {
                const cell = String(row[j]).toLowerCase();
                
                if (nameKeywords.some(kw => cell.includes(kw))) {
                    nameColIndex = j;
                }
                if (unitKeywords.some(kw => cell.includes(kw))) {
                    unitColIndex = j;
                }
            }
            
            if (nameColIndex !== -1 && unitColIndex !== -1) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
             // Fallback: Assume simple columns A=Name, B=Unit, C=Weight if no headers found?
             // Or reject. Let's try to be smart.
             reject(new Error("Не удалось найти таблицу с ингредиентами (ищите заголовки 'Наименование' и 'Ед. изм.')"));
             return;
        }

        // The requirement: "Several weight columns, need the first one after unit"
        // So Weight Column = unitColIndex + 1
        const weightColIndex = unitColIndex + 1;

        const ingredients: Ingredient[] = [];

        // Iterate rows after header
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const name = row[nameColIndex];
            
            // Stop if name is empty or looks like footer ("Total", "Итого")
            if (!name) continue;
            const strName = String(name);
            if (strName.toLowerCase().includes('итого') || strName.toLowerCase().includes('всего')) break;

            const unit = row[unitColIndex] ? String(row[unitColIndex]) : '';
            const amount = row[weightColIndex] ? String(row[weightColIndex]) : '';

            // Clean up numbers (Excel might give 0.005000001)
            let cleanAmount = amount;
            if (typeof row[weightColIndex] === 'number') {
                cleanAmount = parseFloat(row[weightColIndex]).toFixed(3).replace(/\.?0+$/, '');
            }

            if (strName && cleanAmount) {
                ingredients.push({
                    name: strName,
                    unit: unit,
                    amount: cleanAmount
                });
            }
        }

        resolve({ title, ingredients });

      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
