
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
  // Normalize spaces
  return str.replace(/\s+/g, ' ').trim();
};

const cleanName = (str: string): string => {
    // Remove leading numbering like "1 ", "1.", "2 "
    let name = str.replace(/^\d+[\.\s]\s*/, '');
    // Replace underscores with spaces for readability, or keep them if preferred.
    // User example had "1шт_Зира", probably better to keep meaningful chars but ensure spacing.
    name = name.replace(/_/g, ' '); 
    return name.trim();
};

const cleanTitle = (rawTitle: string): string => {
  let title = rawTitle.replace(/_/g, ' ');
  title = title.replace(/,?\s*(?:версия|ver|v\.)\s*\d+/gi, '');
  title = title.replace(/\d{2}[\.,]\d{2}[\.,]\d{2,4}/g, ''); // dates
  return title.trim();
};

// Check if line is junk
const isJunkLine = (text: string): boolean => {
    const lower = text.toLowerCase();
    const keywords = [
        'основание производства', 'технология приготовления', 'оформления блюда',
        'директор', 'калькулятор', 'шеф-повар', 'утверждаю', 'организация',
        'предприятие', 'вес брутто', 'вес нетто', 'вес готового', 'на 1 порция',
        'ед. изм', 'дата печати', 'выход в готовом виде', 'версия 0'
    ];
    return keywords.some(k => lower.includes(k));
};

export const parsePdfFile = async (file: File): Promise<ParsedPdfData[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const results: ParsedPdfData[] = [];
  let currentRecipe: ParsedPdfData | null = null;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Sort items to reconstruct lines
    const items: TextItem[] = textContent.items.map((item: any) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width,
      h: item.height
    })).filter(item => item.str.trim().length > 0);

    const Y_TOLERANCE = 4; // Tight tolerance for same line
    items.sort((a, b) => {
      if (Math.abs(a.y - b.y) < Y_TOLERANCE) return a.x - b.x;
      return b.y - a.y; // Top to bottom
    });

    const lines: string[] = [];
    if (items.length > 0) {
      let currentLineY = items[0].y;
      let currentLineStr = "";
      for (const item of items) {
        if (Math.abs(item.y - currentLineY) > Y_TOLERANCE) {
          lines.push(currentLineStr);
          currentLineStr = item.str;
          currentLineY = item.y;
        } else {
           // Heuristic: Add space if items are far apart visually, otherwise join
           // For tables, usually there is spacing.
           currentLineStr += " " + item.str;
        }
      }
      lines.push(currentLineStr);
    }

    for (const rawLine of lines) {
       const line = cleanString(rawLine);
       if (!line) continue;

       // 1. Detect Title
       // "Наименование блюда: Пицца..."
       const titleRegex = /^(?:наименование|блюдо|изделие)(?:\s+блюда)?:?\s*(.+)/i;
       const titleMatch = line.match(titleRegex);
       if (titleMatch) {
         if (currentRecipe && currentRecipe.ingredients.length > 0) {
            results.push(currentRecipe);
         }
         currentRecipe = { title: cleanTitle(titleMatch[1]), ingredients: [] };
         continue;
       }

       // 2. Junk Filter
       if (isJunkLine(line)) continue;

       // 3. Ingredient Parsing Strategy
       // Pattern we expect: [Index?] [Full Name] [Unit] [Weight1] [Weight2]...
       // The Anchor is the Unit or the Weight.
       
       if (!currentRecipe) continue;

       // Strategy A: Look for Unit Column (Кг, Шт, Л, Г, Гр, Мл, Упак, Порц)
       // This regex looks for a Unit keyword surrounded by spaces, followed by a number
       const unitRegex = /\s+(Кг|Шт|Л|Мл|Гр?|Упак|Порц)\.?\s+(\d+(?:[\.,]\d+)?)/i;
       const unitMatch = line.match(unitRegex);

       if (unitMatch) {
           // We found a unit and a number! 
           // Everything BEFORE the unit is the name.
           const unitIndex = unitMatch.index!;
           const rawName = line.substring(0, unitIndex).trim();
           const unit = unitMatch[1];
           const amount = unitMatch[2].replace(',', '.');

           // If rawName contains the index number "1 ", clean it
           const name = cleanName(rawName);

           if (name.length > 1) { // Avoid noise
               currentRecipe.ingredients.push({ name, amount, unit });
           }
           continue;
       }

       // Strategy B: No Unit found (maybe OCR missed it or it's implicitly KG), but found a Weight Pattern
       // Look for the first float-like number towards the end of string
       // Regex: Space + Digit(.,)Digit
       const weightRegex = /\s+(\d+[\.,]\d{1,4}|\d{1,4})\s*$/; // End of line weight
       // Or find sequence of weights and take first
       const multiWeightRegex = /\s+(\d+[\.,]\d{1,4})\s+(\d+[\.,]\d{1,4})/;
       
       let weightMatch = line.match(multiWeightRegex);
       if (!weightMatch) weightMatch = line.match(weightRegex);

       if (weightMatch) {
           // We found a weight.
           // Name is everything before it.
           const weightIndex = weightMatch.index!;
           const rawName = line.substring(0, weightIndex).trim();
           const amount = weightMatch[1].replace(',', '.');
           const unit = 'кг'; // Default assumption

           // Safety check: Name shouldn't be just digits (like total line "3.050 3.050")
           if (/^[\d\s\.,]+$/.test(rawName)) continue;

           const name = cleanName(rawName);
           if (name.length > 1) {
                currentRecipe.ingredients.push({ name, amount, unit });
           }
           continue;
       }
    }
  }

  // Push last recipe
  if (currentRecipe && currentRecipe.ingredients.length > 0) results.push(currentRecipe);

  return results;
};
