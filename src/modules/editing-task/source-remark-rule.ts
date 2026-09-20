const SOURCE_REMARK_REQUIRED_PRODUCTS = new Set(["三国冰河时代", "造化仙府"]);

export function isSourceRemarkRequired(product: string | null | undefined): boolean {
  return product != null && SOURCE_REMARK_REQUIRED_PRODUCTS.has(product);
}
