import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth.handler);

function normalizeDingtalkCallbackRequest(request: Request): Request {
  const url = new URL(request.url);
  const isDingtalkCallback = url.pathname.endsWith("/oauth2/callback/dingtalk");
  const authCode = url.searchParams.get("authCode");

  if (!isDingtalkCallback || !authCode || url.searchParams.has("code")) {
    return request;
  }

  url.searchParams.set("code", authCode);
  return new Request(url.toString(), request);
}

export function GET(request: Request) {
  return handler.GET(normalizeDingtalkCallbackRequest(request));
}

export const POST = handler.POST;
