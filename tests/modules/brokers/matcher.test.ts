import { describe, it, expect } from "vitest";
import { fuzzyMatchBroker } from "@/modules/brokers/matcher";

describe("fuzzyMatchBroker", () => {
  const users = [
    { user_id: "u1", name: "陈泰" },
    { user_id: "u2", name: "陈泰(运营)" },
    { user_id: "u3", name: "李雷" },
    { user_id: "u4", name: "李雷·新名字" },
  ];

  it("exact match wins", () => {
    expect(fuzzyMatchBroker("陈泰", users)?.user_id).toBe("u1");
  });

  it("substring match if no exact", () => {
    expect(fuzzyMatchBroker("陈泰运营", users)?.user_id).toBe("u2");
  });

  it("returns null on no match", () => {
    expect(fuzzyMatchBroker("张三", users)).toBeNull();
  });

  it("strips parenthetical suffix when matching", () => {
    expect(fuzzyMatchBroker("陈泰(测试)", users)?.user_id).toBe("u1");
  });
});
