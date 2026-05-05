import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel-AI · Self-healing Security Console",
  description: "Agentic MCP self-healing security system dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased font-mono selection:bg-emerald-500/30">
        {children}
      </body>
    </html>
  );
}
