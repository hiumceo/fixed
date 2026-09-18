import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "v1124 Bug WorkStation",
  description:
    "A specialized workspace for AI-assisted website investigation.",
  icons: { icon: "/workstation-favicon.png" },
};

export default function WorkstationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
