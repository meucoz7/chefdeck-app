import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedInstructionsData, Ingredient } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const modelName = "gemini-2.5-flash";

export const generateInstructions = async (title: string, ingredients: Ingredient[]): Promise<GeneratedInstructionsData> => {
  
  const ingredientsList = ingredients.map(i => `${i.name} (${i.amount} ${i.unit})`).join(', ');

  const prompt = `У меня есть блюдо "${title}" и следующие ингредиенты: ${ingredientsList}.
  
  Мне нужно, чтобы ты:
  1. Написал короткое, вкусное ("продающее") описание этого блюда для меню.
  2. Составил пошаговую инструкцию приготовления, основываясь на ингредиентах. Будь профессионален, но краток.
  
  Верни только JSON.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: "Вкусное описание блюда" },
          steps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Список шагов приготовления"
          }
        },
        required: ["description", "steps"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Не удалось сгенерировать инструкции");
  }

  return JSON.parse(response.text) as GeneratedInstructionsData;
};

export const refineInstructions = async (title: string, currentSteps: string[], ingredients: Ingredient[]): Promise<string[]> => {
    const ingredientsList = ingredients.map(i => i.name).join(', ');
    const rawText = currentSteps.join(' ');

    const prompt = `Я импортировал техкарту для блюда "${title}".
    Ингредиенты: ${ingredientsList}.
    
    Текущий текст технологии (может быть пустым или несвязным): "${rawText}".
    
    Задача:
    1. Если текст технологии есть, перепиши его красивым, понятным языком, разбив на логические шаги.
    2. Если текста нет или он мусорный, придумай профессиональную технологию приготовления на основе названия и ингредиентов.
    
    Верни JSON объект с массивом строк "steps".`;

    const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    steps: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "Улучшенные шаги приготовления"
                    }
                },
                required: ["steps"]
            }
        }
    });

    if (!response.text) {
        throw new Error("Не удалось улучшить текст");
    }

    const data = JSON.parse(response.text) as { steps: string[] };
    return data.steps;
};