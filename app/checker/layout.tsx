import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "v1124 Bug Checker",
  icons: { icon: "/checker-favicon.png" },
};

export default function CheckerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
