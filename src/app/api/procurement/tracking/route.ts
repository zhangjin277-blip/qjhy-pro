import { createHash } from "node:crypto";
import { requireProcurementAccess } from "@/modules/procurement";
export async function POST(req: Request) {
  try {
    await requireProcurementAccess();
    const { tracking_no } = await req.json();
    if (typeof tracking_no !== "string" || !/^[a-z0-9-]{6,40}$/i.test(tracking_no))
      return Response.json({ error: { message: "快递单号格式不正确" } }, { status: 400 });
    const key = process.env.KD100_KEY,
      customer = process.env.KD100_CUSTOMER;
    if (!key || !customer)
      return Response.json({ error: { message: "快递100查询服务尚未配置" } }, { status: 503 });
    const rules: [RegExp, string][] = [
      [/^SF/i, "shunfeng"],
      [/^JD/i, "jd"],
      [/^JT/i, "jtexpress"],
      [/^YT/i, "yuantong"],
      [/^[72][0-9]{11}$/, "zhongtong"],
      [/^1[0-9]{12}$|^31[0-9]{11}$/, "yunda"],
      [/^77[0-9]{10}$|^268[0-9]{9}$/, "shentong"],
      [/^DPK/i, "debangkuaidi"],
      [/^E[A-Z][0-9]{9}[A-Z]{2}$/i, "ems"],
      [/^99[0-9]{11}$/, "youzhengguonei"],
    ];
    const param = JSON.stringify({
      com: rules.find(([r]) => r.test(tracking_no))?.[1] || "auto",
      num: tracking_no,
      resultv2: "4",
    });
    const sign = createHash("md5")
      .update(param + key + customer)
      .digest("hex")
      .toUpperCase();
    const response = await fetch("https://poll.kuaidi100.com/poll/query.do", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ customer, sign, param }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (String(data.status) !== "200" && data.message !== "ok")
      return Response.json({ error: { message: data.message || "暂无物流信息" } }, { status: 502 });
    const states: Record<string, string> = {
      "0": "在途中",
      "1": "已揽收",
      "2": "疑难件",
      "3": "已签收",
      "4": "退签",
      "5": "派送中",
      "6": "退回",
      "7": "转投",
    };
    return Response.json({ ...data, stateText: states[String(data.state)] || "物流更新中" });
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "物流查询失败" } },
      { status: 500 },
    );
  }
}
