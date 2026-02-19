"use client";

import dynamic from "next/dynamic";

const LotteryApp = dynamic(() => import("./LotteryApp"), { ssr: false });

export default function ClientApp() {
  return <LotteryApp />;
}
