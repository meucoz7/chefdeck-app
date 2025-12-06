
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
    // Improved Regex:
    // ^(?:\d+\.?\s*)?  -> Optional Index (1, 1., 10)
    // (.+)             -> Name (Greedy capture, consumes everything until the unit)
    // \s+              -> Space separator
    // (кг|г|...)       -> Unit
    // \.?              -> Optional dot after unit
    // \s+              -> Space separator
    // ([\d,.]+)        -> Amount (Gross weight)
    const ingredientLineRegex = /^(?:\d+\.?\s*)?(.+)\s+(кг|г|гр|л|литр|мл|шт|упак|порц)\.?\s+([\d,.]+)/i;
    const titleRegex = /^(?:наименование блюда|блюдо|наименование):?\s*(.+)/i;
    
    for (const line of lines) {
       // Filter Junk first
       if (isJunkLine(line)) continue;

       // --- Check for Title ---
       const titleMatch = line.match(titleRegex);
       if (titleMatch) {
         if (currentRecipe && currentRecipe.ingredients.length > 0) {
            results.push(currentRecipe);
         }
         currentRecipe = { title: cleanTitle(titleMatch[1]), ingredients: [] };
         continue;
       }

       // --- Check for Ingredient ---
       const ingMatch = line.match(ingredientLineRegex);
       if (ingMatch) {
          if (!currentRecipe) {
             currentRecipe = { title: `Новая техкарта`, ingredients: [] };
          }

          const rawName = ingMatch[1].trim();
          const unit = ingMatch[2].toLowerCase();
          // Amount usually comes as "3,000" or "0.050". We take the first part.
          const rawAmount = ingMatch[3].replace(',', '.');
          
          // Safety: If name is suspiciously short or just punctuation, skip
          if (rawName.length < 2) continue;

          currentRecipe.ingredients.push({
             name: rawName,
             unit: unit,
             amount: rawAmount
          });
          continue;
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
