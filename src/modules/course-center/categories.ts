export function normalizeCourseCategories(values: unknown[], fallback = "其他产品") {
  const categories = values
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0 && value !== "[object Object]",
    )
    .map((value) => value.trim());
  return [...new Set(categories.length ? categories : [fallback])];
}
