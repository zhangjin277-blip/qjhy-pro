// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DateRangePicker } from "@/components/patterns/date-range-picker";

let root: Root;
let container: HTMLDivElement;
const onChange = vi.fn();

async function click(label: string): Promise<void> {
  const button = Array.from(document.querySelectorAll("button")).find(
    (item) => item.getAttribute("aria-label") === label || item.textContent === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
}

async function renderPicker(props: Partial<Parameters<typeof DateRangePicker>[0]> = {}) {
  await act(async () =>
    root.render(
      createElement(DateRangePicker, {
        value: { from: "2026-10-13", to: "2026-10-13" },
        onChange,
        ...props,
      }),
    ),
  );
  await click("选择日期范围");
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onChange.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("日期范围交互", () => {
  it("当前是单日时仍需选择两次，第一次不提交", async () => {
    await renderPicker();
    await click("2026-10-20");
    expect(onChange).not.toHaveBeenCalled();
    await click("2026-10-20");
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-20", to: "2026-10-20" });
  });

  it("跨月反向选择自动按日期排序", async () => {
    await renderPicker();
    await click("2026-11-02");
    await click("2026-10-30");
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-30", to: "2026-11-02" });
  });

  it("取消草稿后重新打开使用已生效区间", async () => {
    await renderPicker();
    await click("2026-11-02");
    await click("取消");
    expect(onChange).not.toHaveBeenCalled();
    await click("选择日期范围");
    await click("2026-10-15");
    expect(onChange).not.toHaveBeenCalled();
    await click("2026-10-16");
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-15", to: "2026-10-16" });
  });

  it("全部使用业务回调，空范围也能打开有效日历", async () => {
    const onAll = vi.fn();
    await renderPicker({ value: { from: "", to: "" }, onAll });
    expect(document.querySelectorAll('button[aria-label^="20"]').length).toBeGreaterThan(50);
    await click("全部");
    expect(onAll).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("自定义快捷范围保持调用方统计口径", async () => {
    const value = { from: "2026-10-06", to: "2026-10-12" };
    await renderPicker({ presets: [{ label: "近 7 日", value }] });
    await click("近 7 日");
    expect(onChange).toHaveBeenCalledWith(value);
  });

  it("最大日期之后不可选择", async () => {
    await renderPicker({ maxDate: "2026-10-13" });
    await click("2026-10-14");
    expect(onChange).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLButtonElement>('button[aria-label="2026-10-14"]')?.disabled,
    ).toBe(true);
  });

  it("单日期筛选一次点击即可提交", async () => {
    await renderPicker({ singleDay: true });
    await click("2026-10-15");
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-15", to: "2026-10-15" });
  });

  it("Escape 关闭弹层且不提交草稿", async () => {
    await renderPicker();
    await click("2026-10-15");
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(
      document.querySelector('button[aria-label="选择日期范围"]')?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  });
});
