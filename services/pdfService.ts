
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
  // Critical: Replace underscores with spaces immediately as they break word boundaries
  let clean = str.replace(/_/g, ' ');
  // Remove multiple spaces
  clean = clean.replace(/\s+/g, ' ');
  return clean.trim();
};

const cleanTitle = (rawTitle: string): string => {
  let title = cleanString(rawTitle);
  // Remove "Version 0", "Ver. 1", dates, etc.
  title = title.replace(/,?\s*(?:версия|ver|v\.)\s*\d+/gi, '');
  title = title.replace(/\d{2}[\.,]\d{2}[\.,]\d{2,4}/g, ''); // dates
  // Remove trailing weight info like ", 200гр"
  title = title.replace(/[,/]?\s*\d+(?:[\.,]\d+)?\s*(?:гр?|кг|мл|л|шт)\.?\s*$/gi, '');
  // Remove leading numbering like "1. Pizza"
  title = title.replace(/^\d+[\.,]\s*/, '');
  return title.trim();
};

// Returns extracted data or null. 
// Tries to find "Amount + Unit" OR "Just Amount (float)"
const parseQuantityLine = (text: string): { amount: string, unit: string, remainder: string } | null => {
    // 1. Try strict match: Number + Known Unit (e.g. "1шт", "0.5 кг")
    // Note: We use ^ to prioritize start of string, but also check inside if columns are messy
    const strictRegex = /([\d,.]+)\s*(кг|гр?|л|литр|мл|шт|упак|порц)/i;
    const strictMatch = text.match(strictRegex);

    if (strictMatch) {
        const amount = strictMatch[1].replace(',', '.');
        const unit = strictMatch[2].toLowerCase();
        // Remainder is everything NOT the match. 
        // Example: "1шт Зира 3.000" -> match "1шт". Remainder " Зира 3.000"
        const remainder = text.replace(strictMatch[0], '').trim();
        return { amount, unit, remainder };
    }

    // 2. Try loose match: Just a float number at the start (e.g. "0,050 0,050")
    // Only if it looks like a weight (contains dot/comma or is < 100 for kg)
    const floatRegex = /^([\d,.]+)/;
    const floatMatch = text.match(floatRegex);
    
    if (floatMatch) {
        let valStr = floatMatch[1].replace(',', '.');
        // Filter out list indexes like "1." or "2."
        // A weight usually has decimal points OR is followed by other numbers
        const isIndex = /^\d+\.$/.test(floatMatch[0]); // ends with dot
        if (!isIndex) {
            return { amount: valStr, unit: 'кг', remainder: text.replace(floatMatch[0], '').trim() };
        }
    }

    return null;
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
          lines.push(cleanString(currentLineStr));
          currentLineStr = item.str;
          currentLineY = item.y;
        } else {
           currentLineStr += " " + item.str;
        }
      }
      lines.push(cleanString(currentLineStr));
    }

    // Parsing State
    let pendingName: string | null = null;
    
    for (const line of lines) {
       if (!line) continue;

       // 1. Check for Recipe Title
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

       // 2. Ingredient Parsing
       // Attempt to parse Quantity info from this line
       const qty = parseQuantityLine(line);

       if (qty) {
           // Case A: We have a pending name (e.g. "ПФ Чебуреки" from prev line), and now we found quantity ("1шт...")
           if (pendingName) {
               currentRecipe?.ingredients.push({
                   name: pendingName,
                   amount: qty.amount,
                   unit: qty.unit
               });
               pendingName = null;
           } 
           // Case B: Everything on one line ("Tomato 1kg")
           else {
               // The name is likely in the remainder (or before the match?)
               // With our regex, we matched the FIRST number. 
               // If the line is "Tomato 1kg", parseQuantityLine might fail because regex is anchored ^ or looks for pattern.
               // Let's rely on remainder cleaning.
               
               // However, in your PDF format, lines often start with Name (no qty) OR Qty (if column based).
               // If we found a Qty at the START, but no pending name, it implies we missed the name or it's a weird line.
               // But let's verify if the line *started* with the qty.
               
               // If the line is "1kg Tomato", qty is found, remainder is "Tomato".
               // If remainder is valid name, use it.
               const possibleName = qty.remainder.replace(/^\d+[\.,]\s*/, '').trim(); // Remove "1. " list index
               if (possibleName.length > 2) {
                   currentRecipe?.ingredients.push({
                       name: possibleName,
                       amount: qty.amount,
                       unit: qty.unit
                   });
               }
           }
       } else {
           // No quantity found. This line is likely a NAME.
           // Ignore junk headers
           const isJunk = /организация|предприятие|утверждаю|руководитель|брутто|нетто|выход|версия/i.test(line);
           const isHeader = /^№\s+наименование/i.test(line);

           if (!isJunk && !isHeader && line.length > 2) {
               // If we already had a pending name, it means the previous line was actually a name too (maybe list of names?)
               // Or maybe a long name split on 2 lines?
               // For safety, if we have a pending name, let's treat it as an ingredient without weight (or 0) to avoid losing it, 
               // OR assume this line is a continuation of the name.
               
               if (pendingName) {
                   // Merge lines for long names
                   pendingName += " " + line;
               } else {
                   // Remove list numbering "1. "
                   pendingName = line.replace(/^\d+[\.,]\s*/, '');
               }
           }
       }
    }
  }

  if (currentRecipe && currentRecipe.ingredients.length > 0) results.push(currentRecipe);

  if (results.length === 0) {
      throw new Error("Не удалось найти ингредиенты. Проверьте формат PDF.");
  }

  return results;
};
