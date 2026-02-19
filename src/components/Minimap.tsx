"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { GridConfig, ViewportState, RevealedCell } from "@/types";

interface MinimapProps {
  config: GridConfig;
  viewport: ViewportState;
  revealedCells: Map<number, RevealedCell>;
  onNavigate: (worldX: number, worldY: number) => void;
}

const BLOCK_SIZE = 256;

export default function Minimap({
  config,
  viewport,
  revealedCells,
  onNavigate,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const { gridCols, gridRows } = config;

  // Size detection lives here — starts at 180 (matches SSR), updates after mount
  const [size, setSize] = useState(180);
  useEffect(() => {
    const update = () => setSize(window.innerWidth < 640 ? 110 : 180);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const scale = size / Math.max(gridCols, gridRows);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, size, size);

    // Grid area
    const gw = gridCols * scale;
    const gh = gridRows * scale;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, gw, gh);

    // Revealed blocks
    if (revealedCells.size > 0) {
      const blockCounts = new Map<string, { total: number; prize: number }>();

      revealedCells.forEach((cell, idx) => {
        const col = idx % gridCols;
        const row = Math.floor(idx / gridCols);
        const bx = Math.floor(col / BLOCK_SIZE);
        const by = Math.floor(row / BLOCK_SIZE);
        const key = `${bx},${by}`;
        const entry = blockCounts.get(key) || { total: 0, prize: 0 };
        entry.total++;
        if (cell.tierIndex >= 0) entry.prize++;
        blockCounts.set(key, entry);
      });

      blockCounts.forEach((entry, key) => {
        const [bx, by] = key.split(",").map(Number);
        const sx = bx * BLOCK_SIZE * scale;
        const sy = by * BLOCK_SIZE * scale;
        const blockPx = BLOCK_SIZE * scale;

        const intensity = Math.min(1, entry.total / (BLOCK_SIZE * 2));
        ctx.fillStyle = `rgba(220, 38, 38, ${0.3 + intensity * 0.7})`;
        ctx.fillRect(sx, sy, blockPx, blockPx);
      });
    }

    const vpX = viewport.x * scale;
    const vpY = viewport.y * scale;
    const viewW = Math.min(size, (window.innerWidth / viewport.zoom) * scale);
    const viewH = Math.min(size, ((window.innerHeight - 150) / viewport.zoom) * scale);

    ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, viewW, viewH);

    // Fill viewport rect with subtle highlight
    ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
    ctx.fillRect(vpX, vpY, viewW, viewH);
  }, [viewport, revealedCells, gridCols, gridRows, scale]);

  useEffect(() => {
    render();
  }, [render]);

  const navigateFromEvent = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Account for display size vs canvas element size
      const cssScale = size / rect.width;
      const x = (e.clientX - rect.left) * cssScale / scale;
      const y = (e.clientY - rect.top) * cssScale / scale;
      onNavigate(x, y);
    },
    [scale, onNavigate]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDraggingRef.current = true;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      navigateFromEvent(e);
    },
    [navigateFromEvent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      navigateFromEvent(e);
    },
    [navigateFromEvent]
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 p-2">
      <canvas
        ref={canvasRef}
        className="cursor-crosshair"
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
