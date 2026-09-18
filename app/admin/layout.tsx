import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "v1124 AUTH — Admin Panel",
  description: "Administrative controls for v1124 AUTH.",
  icons: { icon: "/favicon.png" },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
