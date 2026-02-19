import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/jwt";
import { getLotteryConfig } from "@/lib/lottery-config";
import { deriveShuffleParams } from "@/lib/prize-engine";
import { indexToCombination } from "@/lib/combination";
import { comboToGrid } from "@/lib/grid-shuffle";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const config = getLotteryConfig(payload.lotteryType);
    if (!config) {
      return NextResponse.json(
        { error: "Unknown lottery type" },
        { status: 400 }
      );
    }

    const combo = indexToCombination(
      payload.jackpotIndex,
      config.mainPool,
      config.mainPick,
      config.bonusPool,
      config.bonusPick
    );

    // Derive shuffle params to compute the grid position
    const { a: shuffleA, b: shuffleB } = deriveShuffleParams(
      payload.seed,
      config.totalCombinations
    );
    const gridIndex = comboToGrid(
      payload.jackpotIndex,
      config.totalCombinations,
      shuffleA,
      shuffleB
    );

    return NextResponse.json({
      index: gridIndex,
      main: combo.main,
      stars: combo.stars,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
