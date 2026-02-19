import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Lottery Reality Check",
  description:
    "Visualize your odds of winning the lottery. Spoiler: they're terrible.",
  openGraph: {
    title: "Lottery Reality Check",
    description:
      "139,838,160 tickets. 1 jackpot. Can you find it?",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-slate-950 text-slate-200" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
