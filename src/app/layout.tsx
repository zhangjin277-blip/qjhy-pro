import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QJHY-Pro",
  description: "新中台 · 数据底座",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
