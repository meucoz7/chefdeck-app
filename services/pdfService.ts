
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import { Ingredient } from '../types';

// Worker configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

export interface ParsedPdfData {
  title: string;
  ingredients: Ingredient[];
}

interface TextItem {
  str: string;
  x: number;
  y: number; // PDF coordinates: 0,0 is usually bottom-left
  w: number;
  h: number;
}

const cleanTitle = (rawTitle: string): string => {
  let title = rawTitle;
  
  // Remove "Version 0", "Ver. 1", etc.
  title = title.replace(/,?\s*(?:версия|ver|v\.)\s*\d+/gi, '');
  
  // Remove trailing weight info like ", 200гр", " 250 г", "/ 0.5 л"
  title = title.replace(/[,/]?\s*\d+(?:[\.,]\d+)?\s*(?:гр?|кг|мл|л|шт)\.?\s*$/gi, '');
  
  // Remove leading numbering like "1. Pizza"
  title = title.replace(/^\d+[\.,]\s*/, '');

  return title.trim();
};

const isJunkLine = (line: string): boolean => {
    const lower = line.toLowerCase();
    // Filter out standard tech card headers/footers
    if (lower.includes("основание производства")) return true;
    if (lower.includes("технология приготовления")) return true;
    if (lower.includes("директор")) return true;
    if (lower.includes("калькулятор")) return true;
    if (lower.includes("шеф-повар")) return true;
    if (lower.includes("утверждаю")) return true;
    if (lower.includes("организация")) return true;
    if (lower.includes("вес брутто")) return true;
    if (lower.includes("вес нетто")) return true;
    if (lower.includes("выход в готовом виде")) return true;
    // Filter out lines that are just numbers (Totals row) like "3,050 3,050"
    if (/^[\d\s,.]+$/.test(line)) return true;
    
    return false;
}

export const parsePdfFile = async (file: File): Promise<ParsedPdfData[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const results: ParsedPdfData[] = [];
  let currentRecipe: ParsedPdfData | null = null;
  let pendingLine = ""; // Buffer for multi-line ingredient names

  // Process page by page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // 1. Convert items to a structured format
    const items: TextItem[] = textContent.items.map((item: any) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width,
      h: item.height
    })).filter(item => item.str.trim().length > 0);

    // 2. Sort items by Y (descending - top to bottom) then X (ascending - left to right)
    const Y_TOLERANCE = 5; 
    items.sort((a, b) => {
      if (Math.abs(a.y - b.y) < Y_TOLERANCE) {
        return a.x - b.x;
      }
      return b.y - a.y; // PDF Y grows upwards
    });

    // 3. Group into lines
    const lines: string[] = [];
    if (items.length > 0) {
      let currentLineY = items[0].y;
      let currentLineStr = "";
      
      for (const item of items) {
        if (Math.abs(item.y - currentLineY) > Y_TOLERANCE) {
          lines.push(currentLineStr.trim());
          currentLineStr = item.str;
          currentLineY = item.y;
        } else {
           currentLineStr += " " + item.str;
        }
      }
      lines.push(currentLineStr.trim());
    }

    // 4. Parse the lines
    // Strong Regex: Explicit Unit column
    const ingredientLineRegex = /^(?:\d+\.?\s*)?(.+?)\s+(кг|г|гр|л|литр|мл|шт|упак|порц)\.?\s+([\d,.]+)/i;
    // Weak Regex: Ends with number, assume number is amount. Unit might be stuck in name.
    const weakIngredientRegex = /^(?:\d+\.?\s*)?(.+?)\s+([\d,.]+)\s*([\d,.\s]*)$/;
    
    const titleRegex = /^(?:наименование блюда|блюдо|наименование):?\s*(.+)/i;
    
    for (const line of lines) {
       // Filter Junk first
       if (isJunkLine(line)) {
           pendingLine = ""; // Reset buffer on junk/section break
           continue;
       }

       // --- Check for Title ---
       const titleMatch = line.match(titleRegex);
       if (titleMatch) {
         if (currentRecipe && currentRecipe.ingredients.length > 0) {
            results.push(currentRecipe);
         }
         currentRecipe = { title: cleanTitle(titleMatch[1]), ingredients: [] };
         pendingLine = "";
         continue;
       }

       // --- Check for Ingredient (Strong) ---
       let ingMatch = line.match(ingredientLineRegex);
       let rawName = "", unit = "", rawAmount = "";

       if (ingMatch) {
          rawName = ingMatch[1].trim();
          unit = ingMatch[2].toLowerCase();
          rawAmount = ingMatch[3].replace(',', '.');
       } else {
          // --- Check for Ingredient (Weak) ---
          const weakMatch = line.match(weakIngredientRegex);
          if (weakMatch) {
              // It looks like "Name 3,000"
              let potentialName = weakMatch[1].trim();
              rawAmount = weakMatch[2].replace(',', '.');
              
              // Validate Amount: Must be a number and likely < 10000
              if (!isNaN(parseFloat(rawAmount))) {
                  // Try to extract unit from the end of the name (e.g. "1шт")
                  // Look for "шт", "кг" at end of name
                  const unitMatch = potentialName.match(/(\d+)?(шт|кг|г|л|мл)[_.\s]*$/i);
                  if (unitMatch) {
                      unit = unitMatch[2].toLowerCase();
                      // We keep the unit in name usually if it's "1шт_Зира", 
                      // but user wants "1шт_Зира" as name and implicit unit.
                      // Let's just default unit to 'шт' or 'кг' if not found.
                  } else {
                      unit = 'кг'; // Default fallback
                  }
                  rawName = potentialName;
                  ingMatch = weakMatch; // Flag as found
              }
          }
       }

       if (ingMatch) {
          if (!currentRecipe) {
             currentRecipe = { title: `Новая техкарта`, ingredients: [] };
          }

          // Combine with pending line if exists
          if (pendingLine) {
              rawName = pendingLine + " " + rawName;
              pendingLine = "";
          }

          // Cleanup Name (remove leading numbers if regex missed them)
          rawName = rawName.replace(/^\d+\.?\s+/, '');

          // Safety: If name is suspiciously short or just punctuation, skip
          if (rawName.length < 2) continue;

          currentRecipe.ingredients.push({
             name: rawName,
             unit: unit,
             amount: rawAmount
          });
          continue;
       }

       // --- Check for Orphan Line (Start of multi-line ingredient) ---
       // Starts with digit, has text, no numbers at end
       if (/^\d+\.?\s+[^\d]+/.test(line) && !/[\d,]+\s*$/.test(line)) {
           // This is likely "1 ПФ Мини - чебуреки..."
           // Remove index
           const text = line.replace(/^\d+\.?\s+/, '').trim();
           if (text.length > 3) {
               pendingLine = text;
           }
       }
    }
  }

  if (currentRecipe && currentRecipe.ingredients.length > 0) {
    results.push(currentRecipe);
  }

  if (results.length === 0) {
      throw new Error("Не удалось найти ингредиенты. Убедитесь, что в PDF есть колонки 'Наименование', 'Ед. изм.' и 'Вес брутто'.");
  }

  return results;
};
