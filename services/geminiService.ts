import { Ingredient } from "../types";

// Заглушки функций, чтобы не ломать импорты, если они где-то остались
// Функционал ИИ полностью отключен

export const generateInstructions = async (title: string, ingredients: Ingredient[]) => {
  console.log("AI generation is disabled");
  return { description: '', steps: [] };
};

export const refineInstructions = async (title: string, currentSteps: string[], ingredients: Ingredient[]) => {
    console.log("AI refinement is disabled");
    return currentSteps;
};