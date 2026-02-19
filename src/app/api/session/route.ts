import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { getLotteryConfig, getDefaultLotteryId } from "@/lib/lottery-config";
import { deriveJackpotIndex, deriveShuffleParams } from "@/lib/prize-engine";
import { createSessionToken } from "@/lib/jwt";
import { sessionLimiter } from "@/lib/rate-limit";
import { GridConfig } from "@/types";

const SessionRequestSchema = z.object({
  lotteryType: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Rate limit
  const rateLimitResponse = await sessionLimiter(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();
    const parsed = SessionRequestSchema.parse(body);
    const lotteryType = parsed.lotteryType || getDefaultLotteryId();

    const config = getLotteryConfig(lotteryType);
    if (!config) {
      return NextResponse.json(
        { error: "Unknown lottery type" },
        { status: 400 }
      );
    }

    // Generate random seed
    const seed = randomBytes(32).toString("hex");

    // Derive jackpot position and shuffle parameters
    const jackpotIndex = deriveJackpotIndex(seed, config.totalCombinations);
    const { a: shuffleA, b: shuffleB } = deriveShuffleParams(seed, config.totalCombinations);

    // Create encrypted JWT
    const token = await createSessionToken({
      seed,
      jackpotIndex,
      lotteryType,
    });

    // Return token + grid config (no secrets in the config)
    const gridConfig: GridConfig = {
      totalCombinations: config.totalCombinations,
      gridCols: config.gridCols,
      gridRows: config.gridRows,
      costPerPlay: config.costPerPlay,
      currency: config.currency,
      lotteryName: config.name,
      mainPool: config.mainPool,
      mainPick: config.mainPick,
      bonusPool: config.bonusPool,
      bonusPick: config.bonusPick,
      bonusName: config.bonusName,
      tiers: config.tiers,
      shuffleA,
      shuffleB,
    };

    return NextResponse.json({ token, seed, config: gridConfig });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }
    console.error("Session creation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
