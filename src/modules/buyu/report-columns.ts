/** Shared with the fishing live placement log and goal metric selector. */
export const BUYU_REPORT_COLUMNS = [
  "消耗",
  "新增",
  "再归因新增占比",
  "总CPI",
  "首日付费率",
  "首日付费成本",
  "首日净ROI",
  "再归因首日ROI占比",
  "三日净ROI",
  "七日净ROI",
  "再归因七日ROI占比",
  "次留",
  "七留",
  "自然量新增",
  "自然量新增占比",
  "自然量首日付费占比",
  "自然量3日付费占比",
  "自然量7日付费占比",
  "实时净ROI",
] as const;
export const BUYU_PERCENT_COLUMNS = new Set<string>(
  BUYU_REPORT_COLUMNS.filter(
    (c) => !["消耗", "新增", "总CPI", "首日付费成本", "自然量新增"].includes(c),
  ),
);
export const BUYU_MONEY_COLUMNS = new Set<string>(["消耗", "总CPI", "首日付费成本"]);
