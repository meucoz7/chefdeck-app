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
  // Regex looks for comma or space, then digits, then unit, at the end of string
  title = title.replace(/[,/]?\s*\d+(?:[\.,]\d+)?\s*(?:гр?|кг|мл|л|шт)\.?\s*$/gi, '');
  
  // Remove leading numbering like "1. Pizza"
  title = title.replace(/^\d+[\.,]\s*/, '');

  return title.trim();
};

export const parsePdfFile = async (file: File): Promise<ParsedPdfData[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const results: ParsedPdfData[] = [];
  let currentRecipe: ParsedPdfData | null = null;

  // Process page by page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // 1. Convert items to a structured format with coordinates
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
           currentLineStr += (currentLineStr ? " " : "") + item.str;
        }
      }
      lines.push(currentLineStr.trim());
    }

    // 4. Parse the lines
    const ingredientLineRegex = /^(?:\d+\.?)\s+(.+?)\s+(кг|г|л|литр|мл|шт|упак|порц)\.?\s+([\d,.]+)/i;
    const titleRegex = /^(?:наименование блюда|блюдо):?\s*(.+)/i;
    
    for (const line of lines) {
       // --- Check for Title ---
       // Method A: Explicit label
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
             currentRecipe = { title: `Блюдо ${results.length + 1}`, ingredients: [] };
          }

          const rawAmount = ingMatch[3].replace(',', '.');
          const cleanAmount = rawAmount.split(' ')[0];

          currentRecipe.ingredients.push({
             name: ingMatch[1].trim(),
             unit: ingMatch[2].toLowerCase(),
             amount: cleanAmount
          });
          continue;
       }

       // --- Special Case: Implicit Title ---
       // Line is short, capitalized, NOT a keyword, NOT a number
       if (!ingMatch && 
           !line.toLowerCase().includes("организация") && 
           !line.toLowerCase().includes("утверждаю") && 
           !line.toLowerCase().includes("ед.") && 
           !line.toLowerCase().includes("нетто") && 
           line.length > 3 && line.length < 60) {
           
           if (!currentRecipe || (currentRecipe.ingredients.length > 0 && results.indexOf(currentRecipe) === -1)) {
              if (!/^\d/.test(line)) {
                  if (currentRecipe && currentRecipe.ingredients.length > 0) {
                      results.push(currentRecipe);
                  }
                  currentRecipe = { title: cleanTitle(line), ingredients: [] };
              }
           }
       }
    }
  }

  if (currentRecipe && currentRecipe.ingredients.length > 0) {
    results.push(currentRecipe);
  }

  if (results.length === 0) {
      throw new Error("Не удалось найти ингредиенты. Проверьте формат PDF.");
  }

  return results;
};