import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/jwt";
import { isValidName } from "@/lib/profanity";
import { addWinner, getWinners } from "@/lib/winners-store";

export async function GET(req: NextRequest) {
  const lotteryType =
    req.nextUrl.searchParams.get("lotteryType") || undefined;
  const winners = getWinners(lotteryType);
  return NextResponse.json({ winners });
}

export async function POST(req: NextRequest) {
  try {
    const { token, name, ticketsRevealed, amountSpent } = await req.json();

    if (!token || !name) {
      return NextResponse.json(
        { error: "Token and name required" },
        { status: 400 }
      );
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const validation = isValidName(name);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    addWinner({
      name: name.trim(),
      lotteryType: payload.lotteryType,
      ticketsRevealed: ticketsRevealed || 0,
      amountSpent: amountSpent || 0,
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
