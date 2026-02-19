"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  GridConfig,
  ViewportState,
  RevealedCell,
  TallyState,
} from "@/types";
import { indexToCombination } from "@/lib/combination";
import { gridToCombo } from "@/lib/grid-shuffle";

// --- Constants ---
const COLOR_UNREVEALED = "#1e293b";
const COLOR_UNREVEALED_GRID = "#334155";
const COLOR_DISABLED = "#0a0a0a";
const COLOR_SELECTION = "rgba(59, 130, 246, 0.3)";
const COLOR_SELECTION_BORDER = "rgba(59, 130, 246, 0.8)";
const COLOR_LOSE = "#dc2626";
const COLOR_WIN = "#22c55e";
const COLOR_JACKPOT = "#fbbf24";
const COLOR_JACKPOT_GLOW = "rgba(251, 191, 36, 0.4)";
const COLOR_NEAR_MISS = "#a855f7";
const COLOR_NEAR_MISS_GLOW = "rgba(168, 85, 247, 0.4)";

const FLIP_DURATION = 400;
const MIN_ZOOM = 3;
const MAX_ZOOM = 200;
const DEFAULT_ZOOM = 50;

// Zoom thresholds for text content
const COMBO_TEXT_MIN = 90; // Show combination numbers only above this cell size
const CLOSE_LABEL_MIN = 20; // Show tier labels ("JP!", "T3") above this
const CLOSE_Q_MIN = 28; // Show "?" above this

const TAP_DIST = 8; // max px movement to count as a tap
const TAP_TIME = 300; // max ms to count as a tap

function getResultColor(tierIndex: number, nearMiss?: boolean): string {
  if (nearMiss) return COLOR_NEAR_MISS;
  if (tierIndex === 0) return COLOR_JACKPOT;
  if (tierIndex > 0) return COLOR_WIN;
  return COLOR_LOSE;
}

export interface GridCanvasHandle {
  getViewport: () => ViewportState;
  navigateTo: (worldX: number, worldY: number) => void;
  navigateToCell: (index: number) => void;
  /** Notify canvas of newly revealed cells. animate=false skips flip for large batches. */
  revealCells: (indices: number[], animate: boolean) => void;
}

interface GridCanvasProps {
  config: GridConfig;
  revealedCells: Map<number, RevealedCell>;
  onSelectionComplete: (indices: number[]) => void;
  onViewportChange: (viewport: ViewportState) => void;
  tally: TallyState;
  isRevealing: boolean;
}

const GridCanvas = forwardRef<GridCanvasHandle, GridCanvasProps>(
  function GridCanvas(
    { config, revealedCells, onSelectionComplete, onViewportChange, isRevealing },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<ViewportState>({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
    const [selectionMode, setSelectionMode] = useState(false);
    const animFrameRef = useRef<number>(0);

    // Refs for interaction state
    const isSelectingRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const selectionStartRef = useRef({ col: 0, row: 0 });
    const selectionEndRef = useRef({ col: 0, row: 0 });

    // Keep revealedCells in a ref so render closure stays fresh
    const revealedCellsRef = useRef(revealedCells);
    revealedCellsRef.current = revealedCells;

    // Animation tracking
    const animStartRef = useRef<Map<number, number>>(new Map());
    const settledRef = useRef<Set<number>>(new Set());
    const pendingAnimRef = useRef<number[]>([]);
    const animLoopRunningRef = useRef(false);

    // Multi-touch / tap tracking
    const activePtrsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const interactionRef = useRef<"none" | "pan" | "select" | "pinch">("none");
    const tapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const lastPinchDistRef = useRef(0);

    const { gridCols, gridRows, totalCombinations, shuffleA, shuffleB } = config;

    // --- Coordinate helpers ---
    const screenToWorld = useCallback(
      (sx: number, sy: number, vp: ViewportState) => ({
        wx: vp.x + sx / vp.zoom,
        wy: vp.y + sy / vp.zoom,
      }),
      []
    );
    const worldToCell = useCallback((wx: number, wy: number) => ({
      col: Math.floor(wx),
      row: Math.floor(wy),
    }), []);
    const cellToIndex = useCallback(
      (col: number, row: number) => row * gridCols + col,
      [gridCols]
    );

    // =============================================
    // RENDER
    // =============================================
    const render = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const vp = viewportRef.current;
      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas.width / dpr;
      const canvasH = canvas.height / dpr;

      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvasW, canvasH);

      const startCol = Math.max(0, Math.floor(vp.x));
      const startRow = Math.max(0, Math.floor(vp.y));
      const endCol = Math.min(gridCols, Math.ceil(vp.x + canvasW / vp.zoom));
      const endRow = Math.min(gridRows, Math.ceil(vp.y + canvasH / vp.zoom));

      const cellSize = vp.zoom;
      const revealed = revealedCellsRef.current;
      const now = Date.now();

      // Process queued animations (O(batch) instead of O(total_revealed))
      if (pendingAnimRef.current.length > 0) {
        for (const idx of pendingAnimRef.current) {
          animStartRef.current.set(idx, now);
        }
        pendingAnimRef.current = [];
      }

      // Promote finished animations
      for (const [idx, st] of animStartRef.current) {
        if (now - st >= FLIP_DURATION) {
          animStartRef.current.delete(idx);
          settledRef.current.add(idx);
        }
      }

      const hasActiveAnims = animStartRef.current.size > 0;

      if (cellSize < 8) {
        renderMedium(ctx, vp, cellSize, startCol, startRow, endCol, endRow, revealed, now);
      } else if (cellSize < COMBO_TEXT_MIN) {
        renderClose(ctx, vp, cellSize, startCol, startRow, endCol, endRow, revealed, now);
      } else {
        renderClosest(ctx, vp, cellSize, startCol, startRow, endCol, endRow, revealed, now);
      }

      if (isSelectingRef.current) drawSelection(ctx, vp);

      if (hasActiveAnims && !animLoopRunningRef.current) {
        animLoopRunningRef.current = true;
        const loop = () => {
          render();
          if (animStartRef.current.size > 0) requestAnimationFrame(loop);
          else animLoopRunningRef.current = false;
        };
        requestAnimationFrame(loop);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, gridCols, gridRows, totalCombinations]);

    // --- Medium (5-8px): colored squares, no text ---
    const renderMedium = useCallback(
      (ctx: CanvasRenderingContext2D, vp: ViewportState, cellSize: number,
       startCol: number, startRow: number, endCol: number, endRow: number,
       revealed: Map<number, RevealedCell>, now: number) => {
        const gap = cellSize > 6 ? 0.5 : 0;

        ctx.fillStyle = COLOR_UNREVEALED;
        for (let r = startRow; r < endRow; r++)
          for (let c = startCol; c < endCol; c++) {
            const idx = r * gridCols + c;
            if (idx >= totalCombinations || revealed.has(idx) || animStartRef.current.has(idx)) continue;
            const sx = (c - vp.x) * vp.zoom, sy = (r - vp.y) * vp.zoom;
            ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
          }

        const buckets: Record<string, [number, number][]> = { [COLOR_LOSE]: [], [COLOR_WIN]: [], [COLOR_JACKPOT]: [], [COLOR_NEAR_MISS]: [] };
        for (let r = startRow; r < endRow; r++)
          for (let c = startCol; c < endCol; c++) {
            const idx = r * gridCols + c;
            if (idx >= totalCombinations || !revealed.has(idx) || animStartRef.current.has(idx)) continue;
            const cell = revealed.get(idx)!;
            buckets[getResultColor(cell.tierIndex, cell.nearMiss)].push([c, r]);
          }
        for (const [color, cells] of Object.entries(buckets)) {
          ctx.fillStyle = color;
          for (const [c, r] of cells) {
            const sx = (c - vp.x) * vp.zoom, sy = (r - vp.y) * vp.zoom;
            ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
          }
        }

        drawAnimatingCells(ctx, vp, cellSize, gap, startCol, startRow, endCol, endRow, revealed, now);

        if (cellSize > 6) {
          ctx.strokeStyle = COLOR_UNREVEALED_GRID;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          for (let c = startCol; c <= endCol; c++) {
            const sx = (c - vp.x) * vp.zoom;
            ctx.moveTo(sx, (startRow - vp.y) * vp.zoom);
            ctx.lineTo(sx, (endRow - vp.y) * vp.zoom);
          }
          for (let r = startRow; r <= endRow; r++) {
            const sy = (r - vp.y) * vp.zoom;
            ctx.moveTo((startCol - vp.x) * vp.zoom, sy);
            ctx.lineTo((endCol - vp.x) * vp.zoom, sy);
          }
          ctx.stroke();
        }
      }, [gridCols, totalCombinations]
    );

    // --- Close (8-90px): tier label + "?", no combination text ---
    const renderClose = useCallback(
      (ctx: CanvasRenderingContext2D, vp: ViewportState, cellSize: number,
       startCol: number, startRow: number, endCol: number, endRow: number,
       revealed: Map<number, RevealedCell>, now: number) => {
        const gap = 1;

        for (let r = startRow; r < endRow; r++)
          for (let c = startCol; c < endCol; c++) {
            const idx = r * gridCols + c;
            const sx = (c - vp.x) * vp.zoom, sy = (r - vp.y) * vp.zoom;

            if (idx >= totalCombinations) {
              ctx.fillStyle = COLOR_DISABLED;
              ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
              continue;
            }
            if (animStartRef.current.has(idx)) continue;

            if (revealed.has(idx)) {
              const cell = revealed.get(idx)!;
              ctx.fillStyle = getResultColor(cell.tierIndex, cell.nearMiss);
              ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);

              if (cell.tierIndex === 0) {
                ctx.shadowColor = COLOR_JACKPOT_GLOW;
                ctx.shadowBlur = 8;
                ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
                ctx.shadowBlur = 0;
              } else if (cell.nearMiss) {
                ctx.shadowColor = COLOR_NEAR_MISS_GLOW;
                ctx.shadowBlur = 8;
                ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
                ctx.shadowBlur = 0;
              }

              if (cellSize > CLOSE_LABEL_MIN) {
                ctx.fillStyle = "#fff";
                const fs = Math.max(8, Math.min(cellSize * 0.28, 14));
                ctx.font = `bold ${fs}px monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                if (cell.nearMiss) ctx.fillText("!!", sx + cellSize / 2, sy + cellSize / 2);
                else if (cell.tierIndex === 0) ctx.fillText("JP!", sx + cellSize / 2, sy + cellSize / 2);
                else if (cell.tierIndex > 0) ctx.fillText(`T${cell.tierIndex + 1}`, sx + cellSize / 2, sy + cellSize / 2);
                else ctx.fillText("X", sx + cellSize / 2, sy + cellSize / 2);
              }

              // Prize amount when cells big enough (40-90px range)
              if (cellSize > 50 && cell.tierIndex >= 0) {
                ctx.fillStyle = "rgba(255,255,255,0.7)";
                const pfs = Math.min(cellSize * 0.13, 11);
                ctx.font = `${pfs}px monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                ctx.fillText(
                  `${config.currency} ${cell.prize.toLocaleString("en-US")}`,
                  sx + cellSize / 2, sy + cellSize - gap - 3
                );
              }
            } else {
              ctx.fillStyle = COLOR_UNREVEALED;
              ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);

              if (cellSize > CLOSE_Q_MIN) {
                ctx.fillStyle = "#475569";
                const fs = Math.max(8, Math.min(cellSize * 0.25, 16));
                ctx.font = `bold ${fs}px monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("?", sx + cellSize / 2, sy + cellSize / 2);
              }
            }
          }

        drawAnimatingCells(ctx, vp, cellSize, gap, startCol, startRow, endCol, endRow, revealed, now);
      }, [config, gridCols, totalCombinations]
    );

    // --- Closest (>90px): full detail with combination numbers ---
    const renderClosest = useCallback(
      (ctx: CanvasRenderingContext2D, vp: ViewportState, cellSize: number,
       startCol: number, startRow: number, endCol: number, endRow: number,
       revealed: Map<number, RevealedCell>, now: number) => {
        const gap = 2;
        const { mainPool, mainPick, bonusPool, bonusPick } = config;

        for (let r = startRow; r < endRow; r++)
          for (let c = startCol; c < endCol; c++) {
            const idx = r * gridCols + c;
            const sx = (c - vp.x) * vp.zoom, sy = (r - vp.y) * vp.zoom;

            if (idx >= totalCombinations) {
              ctx.fillStyle = COLOR_DISABLED;
              ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
              continue;
            }
            if (animStartRef.current.has(idx)) continue;

            const comboIdx = gridToCombo(idx, totalCombinations, shuffleA, shuffleB);
            const combo = indexToCombination(comboIdx, mainPool, mainPick, bonusPool, bonusPick);

            if (revealed.has(idx)) {
              const cell = revealed.get(idx)!;
              const color = getResultColor(cell.tierIndex, cell.nearMiss);
              ctx.fillStyle = color;
              ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);

              if (cell.tierIndex === 0) {
                ctx.shadowColor = COLOR_JACKPOT_GLOW;
                ctx.shadowBlur = 15;
                ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
                ctx.shadowBlur = 0;
              } else if (cell.nearMiss) {
                ctx.shadowColor = COLOR_NEAR_MISS_GLOW;
                ctx.shadowBlur = 15;
                ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);
                ctx.shadowBlur = 0;
              }

              // Tier name
              ctx.fillStyle = "#fff";
              ctx.font = `bold ${Math.min(cellSize * 0.14, 12)}px monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              const tierName = cell.nearMiss ? "NEAR MISS!"
                : cell.tierIndex === -1 ? "No Prize"
                : cell.tierIndex === 0 ? "JACKPOT!"
                : config.tiers[cell.tierIndex]?.name || `Tier ${cell.tierIndex}`;
              ctx.fillText(tierName, sx + cellSize / 2, sy + gap + 4);

              // Prize
              if (cell.tierIndex >= 0) {
                ctx.font = `bold ${Math.min(cellSize * 0.16, 14)}px monospace`;
                ctx.textBaseline = "middle";
                ctx.fillText(
                  `${config.currency} ${cell.prize.toLocaleString("en-US")}`,
                  sx + cellSize / 2, sy + cellSize * 0.38
                );
              }

              // Main numbers
              const ns = Math.min(cellSize * 0.1, 10);
              ctx.font = `${ns}px monospace`;
              ctx.textBaseline = "middle";
              ctx.fillStyle = "rgba(255,255,255,0.7)";
              ctx.fillText(
                combo.main.map((n) => String(n).padStart(2, "0")).join("  "),
                sx + cellSize / 2, sy + cellSize * 0.58
              );

              // Stars
              ctx.fillStyle = "rgba(255,255,200,0.8)";
              ctx.fillText(
                combo.stars.map((n) => `\u272A${String(n).padStart(2, "0")}`).join("  "),
                sx + cellSize / 2, sy + cellSize * 0.73
              );
            } else {
              ctx.fillStyle = COLOR_UNREVEALED;
              ctx.fillRect(sx + gap, sy + gap, cellSize - gap * 2, cellSize - gap * 2);

              ctx.textAlign = "center";

              // Main numbers
              ctx.fillStyle = "#64748b";
              const ns = Math.min(cellSize * 0.1, 10);
              ctx.font = `${ns}px monospace`;
              ctx.textBaseline = "middle";
              ctx.fillText(
                combo.main.map((n) => String(n).padStart(2, "0")).join("  "),
                sx + cellSize / 2, sy + cellSize * 0.4
              );

              // Stars
              ctx.fillStyle = "#475569";
              ctx.fillText(
                combo.stars.map((n) => `\u272A${String(n).padStart(2, "0")}`).join("  "),
                sx + cellSize / 2, sy + cellSize * 0.57
              );

              ctx.fillStyle = "#334155";
              ctx.font = `${Math.min(cellSize * 0.08, 8)}px monospace`;
              ctx.textBaseline = "bottom";
              ctx.fillText("tap to reveal", sx + cellSize / 2, sy + cellSize - gap - 3);
            }
          }

        drawAnimatingCells(ctx, vp, cellSize, gap, startCol, startRow, endCol, endRow, revealed, now);
      }, [config, gridCols, totalCombinations]
    );

    // --- Flip animation ---
    const drawAnimatingCells = useCallback(
      (ctx: CanvasRenderingContext2D, vp: ViewportState, cellSize: number, gap: number,
       startCol: number, startRow: number, endCol: number, endRow: number,
       revealed: Map<number, RevealedCell>, now: number) => {
        for (const [idx, startTime] of animStartRef.current) {
          const c = idx % gridCols, r = Math.floor(idx / gridCols);
          if (c < startCol || c >= endCol || r < startRow || r >= endRow) continue;
          const cell = revealed.get(idx);
          if (!cell) continue;

          const progress = Math.min(1, (now - startTime) / FLIP_DURATION);
          const sx = (c - vp.x) * vp.zoom, sy = (r - vp.y) * vp.zoom;
          const w = cellSize - gap * 2, h = cellSize - gap * 2;

          const isPhase2 = progress > 0.5;
          const pp = isPhase2 ? (progress - 0.5) * 2 : 1 - progress * 2;
          const scaleX = pp * (2 - pp);
          const drawColor = isPhase2 ? getResultColor(cell.tierIndex, cell.nearMiss) : COLOR_UNREVEALED;
          const centerX = sx + gap + w / 2;

          ctx.save();
          ctx.translate(centerX, sy + gap);
          ctx.scale(scaleX, 1);
          ctx.translate(-w / 2, 0);
          ctx.fillStyle = drawColor;
          ctx.fillRect(0, 0, w, h);

          if (isPhase2 && cellSize > CLOSE_LABEL_MIN && scaleX > 0.6) {
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.max(8, Math.min(cellSize * 0.28, 14))}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (cell.nearMiss) ctx.fillText("!!", w / 2, h / 2);
            else if (cell.tierIndex === 0) ctx.fillText("JP!", w / 2, h / 2);
            else if (cell.tierIndex > 0) ctx.fillText(`T${cell.tierIndex + 1}`, w / 2, h / 2);
            else ctx.fillText("X", w / 2, h / 2);
          }
          ctx.restore();

          if (isPhase2 && scaleX > 0.5 && (cell.tierIndex === 0 || cell.nearMiss)) {
            ctx.save();
            ctx.shadowColor = cell.nearMiss ? COLOR_NEAR_MISS : COLOR_JACKPOT;
            ctx.shadowBlur = 20 * scaleX;
            ctx.fillStyle = cell.nearMiss ? "rgba(168, 85, 247, 0.3)" : "rgba(251, 191, 36, 0.3)";
            ctx.fillRect(centerX - (w * scaleX) / 2, sy + gap, w * scaleX, h);
            ctx.restore();
          }
        }
      }, [gridCols]
    );

    // --- Selection overlay ---
    const drawSelection = useCallback(
      (ctx: CanvasRenderingContext2D, vp: ViewportState) => {
        const s = selectionStartRef.current, e = selectionEndRef.current;
        const minC = Math.max(0, Math.min(s.col, e.col));
        const maxC = Math.min(gridCols - 1, Math.max(s.col, e.col));
        const minR = Math.max(0, Math.min(s.row, e.row));
        const maxR = Math.min(gridRows - 1, Math.max(s.row, e.row));

        const sx = (minC - vp.x) * vp.zoom, sy = (minR - vp.y) * vp.zoom;
        const sw = (maxC - minC + 1) * vp.zoom, sh = (maxR - minR + 1) * vp.zoom;

        ctx.fillStyle = COLOR_SELECTION;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = COLOR_SELECTION_BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);

        const count = (maxC - minC + 1) * (maxR - minR + 1);
        if (count > 0) {
          ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
          ctx.font = "bold 14px monospace";
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(
            count > 50000 ? "50,000 cells (max)" : `${count.toLocaleString("en-US")} cells`,
            sx + 4, sy - 4
          );
        }
      }, [gridCols, gridRows]
    );

    // --- requestRender ---
    const requestRender = useCallback(() => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(() => {
        animFrameRef.current = 0;
        render();
      });
    }, [render]);

    // --- Resize ---
    useEffect(() => {
      const resize = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
        requestRender();
      };
      resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }, [requestRender]);

    // Clear animation state on session reset (empty map)
    useEffect(() => {
      if (revealedCells.size === 0) {
        settledRef.current.clear();
        animStartRef.current.clear();
        pendingAnimRef.current = [];
      }
      requestRender();
    }, [revealedCells, requestRender]);

    // --- Wheel zoom ---
    const handleWheel = useCallback((e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const vp = viewportRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * factor));
      const wx = vp.x + mx / vp.zoom, wy = vp.y + my / vp.zoom;
      vp.x = wx - mx / newZoom;
      vp.y = wy - my / newZoom;
      vp.zoom = newZoom;
      clampViewport(vp, canvas, gridCols, gridRows);
      onViewportChange({ ...vp });
      requestRender();
    }, [gridCols, gridRows, onViewportChange, requestRender]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      return () => canvas.removeEventListener("wheel", handleWheel);
    }, [handleWheel]);

    // =============================================
    // POINTER HANDLERS (pan, tap-to-reveal, pinch, select)
    // =============================================

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      activePtrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two fingers → pinch
      if (activePtrsRef.current.size === 2) {
        interactionRef.current = "pinch";
        isSelectingRef.current = false;
        const pts = Array.from(activePtrsRef.current.values());
        lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return;
      }
      if (activePtrsRef.current.size > 2) return;

      // Single finger
      tapStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };

      if (selectionMode || e.shiftKey) {
        interactionRef.current = "select";
        isSelectingRef.current = true;
        const rect = canvas.getBoundingClientRect();
        const vp = viewportRef.current;
        const { wx, wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, vp);
        const { col, row } = worldToCell(wx, wy);
        selectionStartRef.current = { col, row };
        selectionEndRef.current = { col, row };
      } else {
        interactionRef.current = "pan";
        panStartRef.current = { x: e.clientX, y: e.clientY };
      }
    }, [selectionMode, screenToWorld, worldToCell]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      activePtrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinch-to-zoom
      if (interactionRef.current === "pinch" && activePtrsRef.current.size >= 2) {
        const pts = Array.from(activePtrsRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDistRef.current > 0) {
          const factor = dist / lastPinchDistRef.current;
          const rect = canvas.getBoundingClientRect();
          const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
          const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
          const vp = viewportRef.current;
          const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * factor));
          const wx = vp.x + cx / vp.zoom, wy = vp.y + cy / vp.zoom;
          vp.x = wx - cx / newZoom;
          vp.y = wy - cy / newZoom;
          vp.zoom = newZoom;
          clampViewport(vp, canvas, gridCols, gridRows);
          onViewportChange({ ...vp });
          requestRender();
        }
        lastPinchDistRef.current = dist;
        return;
      }

      if (interactionRef.current === "pan") {
        const vp = viewportRef.current;
        vp.x -= (e.clientX - panStartRef.current.x) / vp.zoom;
        vp.y -= (e.clientY - panStartRef.current.y) / vp.zoom;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        clampViewport(vp, canvas, gridCols, gridRows);
        onViewportChange({ ...vp });
        requestRender();
      } else if (interactionRef.current === "select") {
        const rect = canvas.getBoundingClientRect();
        const vp = viewportRef.current;
        const { wx, wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, vp);
        const { col, row } = worldToCell(wx, wy);
        selectionEndRef.current = { col, row };
        requestRender();
      }
    }, [gridCols, gridRows, onViewportChange, requestRender, screenToWorld, worldToCell]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
      activePtrsRef.current.delete(e.pointerId);
      const interaction = interactionRef.current;

      // If was pinching, just clean up
      if (interaction === "pinch") {
        if (activePtrsRef.current.size < 2) {
          lastPinchDistRef.current = 0;
          interactionRef.current = "none";
        }
        tapStartRef.current = null;
        return;
      }

      // Tap-to-reveal (pan mode, short click)
      if (interaction === "pan" && tapStartRef.current) {
        const dx = e.clientX - tapStartRef.current.x;
        const dy = e.clientY - tapStartRef.current.y;
        const dt = Date.now() - tapStartRef.current.time;
        if (Math.hypot(dx, dy) < TAP_DIST && dt < TAP_TIME) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const vp = viewportRef.current;
            const { wx, wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, vp);
            const { col, row } = worldToCell(wx, wy);
            const idx = cellToIndex(col, row);
            if (idx >= 0 && idx < totalCombinations && !revealedCellsRef.current.has(idx)) {
              onSelectionComplete([idx]);
            }
          }
        }
      }

      // Selection complete
      if (interaction === "select") {
        isSelectingRef.current = false;
        const s = selectionStartRef.current, se = selectionEndRef.current;
        const minC = Math.max(0, Math.min(s.col, se.col));
        const maxC = Math.min(gridCols - 1, Math.max(s.col, se.col));
        const minR = Math.max(0, Math.min(s.row, se.row));
        const maxR = Math.min(gridRows - 1, Math.max(s.row, se.row));

        const indices: number[] = [];
        const revealed = revealedCellsRef.current;
        for (let r = minR; r <= maxR && indices.length < 50000; r++)
          for (let c = minC; c <= maxC && indices.length < 50000; c++) {
            const idx = cellToIndex(c, r);
            if (idx < totalCombinations && !revealed.has(idx)) indices.push(idx);
          }
        if (indices.length > 0) onSelectionComplete(indices);
        requestRender();
      }

      interactionRef.current = "none";
      tapStartRef.current = null;
    }, [gridCols, gridRows, totalCombinations, cellToIndex, onSelectionComplete, requestRender, screenToWorld, worldToCell]);

    const handlePointerCancel = useCallback((e: React.PointerEvent) => {
      activePtrsRef.current.delete(e.pointerId);
      isSelectingRef.current = false;
      interactionRef.current = "none";
      tapStartRef.current = null;
      lastPinchDistRef.current = 0;
    }, []);

    // --- Imperative handle ---
    useImperativeHandle(ref, () => ({
      getViewport: () => ({ ...viewportRef.current }),
      navigateTo: (worldX: number, worldY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const vp = viewportRef.current;
        vp.x = worldX - rect.width / vp.zoom / 2;
        vp.y = worldY - rect.height / vp.zoom / 2;
        clampViewport(vp, canvas, gridCols, gridRows);
        onViewportChange({ ...vp });
        requestRender();
      },
      navigateToCell: (index: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const vp = viewportRef.current;
        const col = index % gridCols, row = Math.floor(index / gridCols);
        vp.zoom = Math.max(vp.zoom, 60);
        vp.x = col + 0.5 - rect.width / vp.zoom / 2;
        vp.y = row + 0.5 - rect.height / vp.zoom / 2;
        clampViewport(vp, canvas, gridCols, gridRows);
        onViewportChange({ ...vp });
        requestRender();
      },
      revealCells: (indices: number[], animate: boolean) => {
        if (animate) {
          pendingAnimRef.current.push(...indices);
        } else {
          for (const idx of indices) {
            settledRef.current.add(idx);
          }
        }
      },
    }), [gridCols, gridRows, onViewportChange, requestRender]);

    return (
      <div ref={containerRef} className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
        {/* fixed on mobile (always visible above browser chrome), absolute on desktop */}
        <button
          onClick={() => setSelectionMode(!selectionMode)}
          className={`fixed sm:absolute left-3 px-3 py-2 rounded-lg font-mono text-xs sm:text-sm transition-colors z-20 border ${
            selectionMode
              ? "bg-blue-600 text-white border-blue-400"
              : "bg-slate-800/90 text-slate-200 hover:bg-slate-700 border-slate-500"
          }`}
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
        >
          {selectionMode ? "Selection ON" : "Select Mode"}
        </button>
        {isRevealing && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600/80 text-white px-3 py-1.5 rounded-lg font-mono text-xs sm:text-sm z-10 animate-pulse">
            Revealing...
          </div>
        )}
      </div>
    );
  }
);

export default GridCanvas;

function clampViewport(vp: ViewportState, canvas: HTMLCanvasElement, gridCols: number, gridRows: number) {
  const rect = canvas.getBoundingClientRect();
  const maxX = Math.max(0, gridCols - rect.width / vp.zoom);
  const maxY = Math.max(0, gridRows - rect.height / vp.zoom);
  vp.x = Math.max(-10, Math.min(maxX + 10, vp.x));
  vp.y = Math.max(-10, Math.min(maxY + 10, vp.y));
}
