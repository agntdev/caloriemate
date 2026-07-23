import type { FoodItem } from "./types.js";

/** ~10 common foods seeded into the durable food database. */
export const SEED_FOODS: FoodItem[] = [
  { id: "chicken", name: "Chicken breast", kcalPerPortion: 165, portionName: "100 g" },
  { id: "rice", name: "Cooked rice", kcalPerPortion: 130, portionName: "100 g" },
  { id: "egg", name: "Egg", kcalPerPortion: 78, portionName: "1 large" },
  { id: "banana", name: "Banana", kcalPerPortion: 105, portionName: "1 medium" },
  { id: "apple", name: "Apple", kcalPerPortion: 95, portionName: "1 medium" },
  { id: "oatmeal", name: "Oatmeal", kcalPerPortion: 150, portionName: "1 cup cooked" },
  { id: "salmon", name: "Salmon", kcalPerPortion: 208, portionName: "100 g" },
  { id: "bread", name: "Bread", kcalPerPortion: 80, portionName: "1 slice" },
  { id: "milk", name: "Milk", kcalPerPortion: 122, portionName: "1 cup" },
  { id: "salad", name: "Salad greens", kcalPerPortion: 20, portionName: "2 cups" },
];
