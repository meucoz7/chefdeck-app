
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
  y: number;
  w: number;
  h: number;
}

const cleanString = (str: string): string => {
  if (!str) return "";
  // Replace underscores with spaces
  let clean = str.replace(/_/g, ' ');
  // Remove list numbering "1. ", "2. " at start
  clean = clean.replace(/^\d+\.?\s+/, '');
  // Remove multiple spaces
  clean = clean.replace(/\s+/g, ' ');
  return clean.trim();
};

const cleanTitle = (rawTitle: string): string => {
  let title = rawTitle.replace(/_/g, ' ');
  title = title.replace(/,?\s*(?:версия|ver|v\.)\s*\d+/gi, '');
  title = title.replace(/\d{2}[\.,]\d{2}[\.,]\d{2,4}/g, ''); // dates
  title = title.replace(/[,/]?\s*\d+(?:[\.,]\d+)?\s*(?:гр?|кг|мл|л|шт)\.?\s*$/gi, ''); // trailing weight
  title = title.replace(/^\d+[\.,]\s*/, '');
  return title.trim();
};

// Check if line is purely headers or junk info
const isJunkLine = (text: string): boolean => {
    const lower = text.toLowerCase();
    const keywords = [
        'основание производства',
        'технология приготовления',
        'оформления блюда',
        'директор',
        'калькулятор',
        'шеф-повар',
        'утверждаю',
        'организация',
        'предприятие',
        'вес брутто',
        'вес нетто',
        'вес готового',
        'на 1 порция',
        'ед. изм',
        'дата печати',
        'выход в готовом виде',
        'версия 0',
        'версия 1'
    ];
    return keywords.some(k => lower.includes(k));
};

// Check if line is just numbers (Total line like "3,050 3,050")
const isTotalLine = (text: string): boolean => {
    // Matches strings containing only numbers, dots, commas, spaces
    return /^[\d\s\.,]+$/.test(text);
};

export const parsePdfFile = async (file: File): Promise<ParsedPdfData[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const results: ParsedPdfData[] = [];
  let currentRecipe: ParsedPdfData | null = null;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Sort items to reconstruct lines correctly
    const items: TextItem[] = textContent.items.map((item: any) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width,
      h: item.height
    })).filter(item => item.str.trim().length > 0);

    // Sort by Y desc (top to bottom), then X asc
    const Y_TOLERANCE = 5; 
    items.sort((a, b) => {
      if (Math.abs(a.y - b.y) < Y_TOLERANCE) return a.x - b.x;
      return b.y - a.y;
    });

    const lines: string[] = [];
    if (items.length > 0) {
      let currentLineY = items[0].y;
      let currentLineStr = "";
      for (const item of items) {
        if (Math.abs(item.y - currentLineY) > Y_TOLERANCE) {
          lines.push(currentLineStr); // Don't clean yet, need raw for regex sometimes
          currentLineStr = item.str;
          currentLineY = item.y;
        } else {
           // Add space if needed
           currentLineStr += (currentLineStr.endsWith(" ") ? "" : " ") + item.str;
        }
      }
      lines.push(currentLineStr);
    }

    // --- LINE PROCESSING STATE MACHINE ---
    let pendingName: string | null = null;
    
    for (const rawLine of lines) {
       const line = cleanString(rawLine);
       if (!line) continue;

       // 1. Detect Recipe Start
       const titleRegex = /^(?:наименование блюда|блюдо|изделие):?\s*(.+)/i;
       const titleMatch = line.match(titleRegex);
       if (titleMatch) {
         if (currentRecipe && currentRecipe.ingredients.length > 0) {
            results.push(currentRecipe);
         }
         currentRecipe = { title: cleanTitle(titleMatch[1]), ingredients: [] };
         pendingName = null;
         continue;
       }

       // 2. Skip Junk & Totals
       if (isJunkLine(line)) {
           pendingName = null; // Reset pending if we hit junk
           continue; 
       }
       if (isTotalLine(line)) {
           pendingName = null;
           continue;
       }

       // 3. Try to extract Weight/Amount
       // Look for sequence of numbers at the end or middle: e.g. "0,050 0,050"
       // We want the FIRST number in that sequence (Gross weight)
       const weightRegex = /(\d+[\.,]\d{1,4}|\d{1,4})\s+(\d+[\.,]\d{1,4}|\d{1,4})/;
       const weightMatch = line.match(weightRegex);

       if (weightMatch) {
           // Found a line with weights.
           const amountVal = weightMatch[1].replace(',', '.');
           let namePart = line.substring(0, weightMatch.index).trim();
           let unitVal = 'кг'; // Default

           // Check for specific unit attached to name start (e.g. "1шт", "10гр")
           // Regex looks for Number + Unit at start of namePart
           const stickyUnitRegex = /^(\d+[\.,]?\d*)\s*(шт|кг|л|мл|гр?)\s*(.*)/i;
           const stickyMatch = namePart.match(stickyUnitRegex);

           if (stickyMatch) {
               // Case: "1шт_Зира..."
               // override amount with the one found at start
               const qty = stickyMatch[1].replace(',', '.');
               const unit = stickyMatch[2].toLowerCase();
               const remainder = stickyMatch[3]; // "_Зира" or " Зира"
               
               // If we had a pending name (from prev line), use it as main name
               // and maybe append remainder? 
               // Usually pendingName is "ПФ Чебуреки", and this line is "1шт".
               
               if (pendingName) {
                   currentRecipe?.ingredients.push({
                       name: pendingName, // Ignore remainder if it looks like junk suffix
                       amount: qty,
                       unit: unit
                   });
                   pendingName = null;
               } else {
                   // Everything on one line? "1шт Булочка"
                   currentRecipe?.ingredients.push({
                       name: remainder || "Ингредиент",
                       amount: qty,
                       unit: unit
                   });
               }
           } else {
               // Normal Case: "Potato 0.500 0.500"
               // Check if namePart ends with a unit
               // or just assume kg
               
               let finalName = namePart;
               if (pendingName) {
                   finalName = pendingName + " " + namePart;
                   pendingName = null;
               }

               if (finalName.length > 1) {
                   currentRecipe?.ingredients.push({
                       name: cleanString(finalName),
                       amount: amountVal,
                       unit: unitVal
                   });
               }
           }
       } else {
           // 4. No weight found. 
           // Likely a name continued on next line, OR just a name line.
           // e.g. "ПФ Мини - чебуреки"
           
           // If we already have a pending name, append? Or replace? 
           // Usually lines are short, so append is safer.
           if (pendingName) {
               pendingName += " " + line;
           } else {
               pendingName = line;
           }
       }
    }
  }

  if (currentRecipe && currentRecipe.ingredients.length > 0) results.push(currentRecipe);

  if (results.length === 0) {
      // Return empty array instead of throwing to avoid crashing UI, 
      // let the UI show "0 imported" or handle gracefully.
      return [];
  }

  return results;
};
