import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, Layers, CheckCircle, Info, RefreshCw, AlertTriangle, Move, RotateCw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface WarehouseSettings {
  maxHeight: number;
  floorLoad: number;
  handleFreq: string;
  bct: string;
  compSF: number;
  manualLayers: string;
}

interface WarehouseResult {
  ori: { bL: number; bW: number; nL: number; nW: number };
  bpl: number;
  ovL: number;
  ovW: number;
  hf: number;
  effDyn: number;
  cap: number;
  mW: number;
  mH: number;
  mC: number;
  manLim: number;
  rec: number;
  lim: string;
  stkH: number;
  totWt: number;
  fkgm2: number;
  wtUtil: number;
  cNote: string;
  floorOK: boolean;
  htOK: boolean;
  wtOK: boolean;
  boxPositions?: { x: number; y: number; l: number; w: number; h: number }[];
}

interface WarehousePanelProps {
  wr: WarehouseResult | null;
  box: { L: number; W: number; H: number; wt: number };
  pal: { l: number; w: number; h: number; tare: number; staticKg: number; dynKg: number; rackKg: number };
  settings: WarehouseSettings;
}

export const PalletTopSVG: React.FC<{
  pl: number;
  pw: number;
  ori: { bL: number; bW: number; nL: number; nW: number };
  bc?: string;
  pc?: string;
  boxPositions?: { x: number; y: number; l: number; w: number; h: number }[];
  isEditMode?: boolean;
  selectedBoxIndex?: number | null;
  onSelectBox?: (index: number | null) => void;
  onPositionsChange?: (newPositions: { x: number; y: number; l: number; w: number; h: number }[]) => void;
}> = ({
  pl,
  pw,
  ori,
  bc,
  pc,
  boxPositions,
  isEditMode = false,
  selectedBoxIndex = null,
  onSelectBox,
  onPositionsChange
}) => {
  const sc = Math.min(180 / pl, 130 / pw);
  const W = Math.round(pl * sc) + 2;
  const H = Math.round(pw * sc) + 2;

  const [draggedBox, setDraggedBox] = useState<{
    index: number;
    startX: number;
    startY: number;
    boxStartX: number;
    boxStartY: number;
  } | null>(null);

  const scaleInCm = sc * 10;

  const handleBoxMouseDown = (e: React.MouseEvent, index: number, pos: { x: number; y: number; l: number; w: number; h: number }) => {
    if (!isEditMode) return;
    e.preventDefault();
    if (onSelectBox) {
      onSelectBox(index);
    }

    setDraggedBox({
      index,
      startX: e.clientX,
      startY: e.clientY,
      boxStartX: pos.x,
      boxStartY: pos.y
    });
  };

  const handleBoxTouchStart = (e: React.TouchEvent, index: number, pos: { x: number; y: number; l: number; w: number; h: number }) => {
    if (!isEditMode) return;
    const touch = e.touches[0];
    if (onSelectBox) {
      onSelectBox(index);
    }

    setDraggedBox({
      index,
      startX: touch.clientX,
      startY: touch.clientY,
      boxStartX: pos.x,
      boxStartY: pos.y
    });
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggedBox || !boxPositions || !onPositionsChange) return;

      const dx = (e.clientX - draggedBox.startX) / scaleInCm;
      const dy = (e.clientY - draggedBox.startY) / scaleInCm;

      // Snap to 0.5cm increments for clean alignment
      const nextX = Math.round((draggedBox.boxStartX + dx) * 2) / 2;
      const nextY = Math.round((draggedBox.boxStartY + dy) * 2) / 2;

      const targetBox = boxPositions[draggedBox.index];
      if (!targetBox) return;

      const maxL = pl / 10;
      const maxW = pw / 10;

      const updatedX = Math.max(0, Math.min(maxL - targetBox.l, nextX));
      const updatedY = Math.max(0, Math.min(maxW - targetBox.w, nextY));

      const updatedPositions = boxPositions.map((pos, idx) => {
        if (idx === draggedBox.index) {
          return {
            ...pos,
            x: updatedX,
            y: updatedY
          };
        }
        return pos;
      });

      onPositionsChange(updatedPositions);
    };

    const handleGlobalMouseUp = () => {
      if (draggedBox) {
        setDraggedBox(null);
      }
    };

    if (draggedBox) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggedBox, boxPositions, scaleInCm, pl, pw, onPositionsChange]);

  useEffect(() => {
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!draggedBox || !boxPositions || !onPositionsChange) return;
      const touch = e.touches[0];

      const dx = (touch.clientX - draggedBox.startX) / scaleInCm;
      const dy = (touch.clientY - draggedBox.startY) / scaleInCm;

      const nextX = Math.round((draggedBox.boxStartX + dx) * 2) / 2;
      const nextY = Math.round((draggedBox.boxStartY + dy) * 2) / 2;

      const targetBox = boxPositions[draggedBox.index];
      if (!targetBox) return;

      const maxL = pl / 10;
      const maxW = pw / 10;

      const updatedX = Math.max(0, Math.min(maxL - targetBox.l, nextX));
      const updatedY = Math.max(0, Math.min(maxW - targetBox.w, nextY));

      const updatedPositions = boxPositions.map((pos, idx) => {
        if (idx === draggedBox.index) {
          return {
            ...pos,
            x: updatedX,
            y: updatedY
          };
        }
        return pos;
      });

      onPositionsChange(updatedPositions);
    };

    const handleGlobalTouchEnd = () => {
      if (draggedBox) {
        setDraggedBox(null);
      }
    };

    if (draggedBox) {
      window.addEventListener('touchmove', handleGlobalTouchMove);
      window.addEventListener('touchend', handleGlobalTouchEnd);
    }

    return () => {
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [draggedBox, boxPositions, scaleInCm, pl, pw, onPositionsChange]);

  const cells: React.ReactNode[] = [];

  if (boxPositions && boxPositions.length > 0) {
    boxPositions.forEach((pos, idx) => {
      const mmX = pos.x * 10;
      const mmY = pos.y * 10;
      const mmL = pos.l * 10;
      const mmW = pos.w * 10;

      const isSelected = selectedBoxIndex === idx;

      cells.push(
        <g
          key={idx}
          className={`${isEditMode ? 'cursor-move select-none' : 'cursor-pointer'}`}
          onMouseDown={(e) => handleBoxMouseDown(e, idx, pos)}
          onTouchStart={(e) => handleBoxTouchStart(e, idx, pos)}
          onClick={(e) => {
            if (isEditMode) {
              e.stopPropagation();
              if (onSelectBox) {
                onSelectBox(idx);
              }
            }
          }}
        >
          <rect
            x={mmX * sc + 1}
            y={mmY * sc + 1}
            width={mmL * sc - 2}
            height={mmW * sc - 2}
            fill={isSelected ? '#2dd4bf' : bc || '#14b8a6'}
            stroke={isSelected ? '#0f766e' : '#0d9488'}
            strokeWidth={isSelected ? 1.5 : 0.5}
            rx={1.5}
            className="transition-colors duration-150"
          />
          <text
            x={mmX * sc + (mmL * sc) / 2}
            y={mmY * sc + (mmW * sc) / 2 + 2.5}
            textAnchor="middle"
            fontSize={7}
            fontWeight="bold"
            fill={isSelected ? '#042f2e' : '#ffffff'}
            pointerEvents="none"
            className="select-none font-mono"
          >
            {idx + 1}
          </text>
        </g>
      );
    });
  } else {
    for (let li = 0; li < ori.nL; li++) {
      for (let wi = 0; wi < ori.nW; wi++) {
        cells.push(
          <rect
            key={`${li}-${wi}`}
            x={li * ori.bL * sc + 1}
            y={wi * ori.bW * sc + 1}
            width={ori.bL * sc - 2}
            height={ori.bW * sc - 2}
            fill={bc || '#14b8a6'}
            stroke="#0d9488"
            strokeWidth={0.5}
            rx={1.5}
          />
        );
      }
    }
  }

  return (
    <svg width={W} height={H} className="mx-auto block" onClick={() => {
      if (isEditMode && onSelectBox) {
        onSelectBox(null);
      }
    }}>
      <rect
        x={0}
        y={0}
        width={pl * sc}
        height={pw * sc}
        fill={pc || '#ca8a04'}
        stroke="#92610a"
        strokeWidth={1.5}
        rx={3}
      />
      {cells}
      <text x={(pl * sc) / 2} y={H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">
        {pl} mm
      </text>
    </svg>
  );
};

export const PalletElevSVG: React.FC<{
  ph: number;
  pw: number;
  bH: number;
  nL: number;
  maxH: number;
  bc?: string;
  pc?: string;
}> = ({ ph, pw, bH, nL, maxH, bc, pc }) => {
  const clr = 200; // safety clearance
  const sc = Math.min(170 / pw, 190 / maxH);
  const W = Math.round(pw * sc) + 55;
  const H = Math.round(maxH * sc) + 25;
  const bot = H - 15;
  const lrs: React.ReactNode[] = [];

  for (let i = 0; i < nL; i++) {
    const y = bot - ph * sc - (i + 1) * bH * sc;
    lrs.push(
      <rect
        key={i}
        x={30}
        y={y}
        width={pw * sc}
        height={bH * sc - 0.8}
        fill={i === nL - 1 ? '#16a34a' : bc || '#15803d'}
        stroke="#14532d"
        strokeWidth={0.5}
      />
    );
  }

  const limY = bot - (maxH - clr) * sc;
  const topY = bot - ph * sc - nL * bH * sc;

  return (
    <svg width={W} height={H} className="mx-auto block">
      <rect
        x={30}
        y={limY}
        width={pw * sc}
        height={Math.max(0, topY - limY)}
        fill="rgba(239, 68, 68, 0.08)"
      />
      <line
        x1={18}
        y1={limY}
        x2={W - 3}
        y2={limY}
        stroke="#dc2626"
        strokeWidth={1}
        strokeDasharray="5,3"
      />
      <text x={20} y={limY - 3} fontSize={7} fill="#dc2626">
        {maxH - clr}mm
      </text>
      {lrs}
      <rect
        x={30}
        y={bot - ph * sc}
        width={pw * sc}
        height={ph * sc}
        fill={pc || '#ca8a04'}
        stroke="#92610a"
        strokeWidth={1.5}
      />
      <line x1={8} y1={bot} x2={W - 3} y2={bot} stroke="#cbd5e1" strokeWidth={2} />
      <line x1={16} y1={bot} x2={16} y2={topY} stroke="#64748b" strokeWidth={1} />
      <text
        x={4}
        y={(bot + topY) / 2 + 3}
        fontSize={7}
        fill="#64748b"
        textAnchor="middle"
        transform={`rotate(-90, 4, ${(bot + topY) / 2})`}
      >
        {ph + nL * bH} mm
      </text>
    </svg>
  );
};

export const WarehousePanel: React.FC<WarehousePanelProps> = ({ wr, box, pal, settings }) => {
  if (!wr || !wr.bpl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs py-12">
        <Info className="w-8 h-8 text-slate-300 mb-2" />
        <span>เลือกสินค้าและตั้งค่าด้านซ้ายเพื่อเริ่มคำนวณ</span>
      </div>
    );
  }

  const [localBoxPositions, setLocalBoxPositions] = useState<{ x: number; y: number; l: number; w: number; h: number }[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (wr?.boxPositions) {
      setLocalBoxPositions(wr.boxPositions);
      setSelectedBoxIndex(null);
    }
  }, [wr?.boxPositions]);

  const handleNudgeBox = (axis: 'x' | 'y', amount: number) => {
    if (selectedBoxIndex === null || !localBoxPositions) return;
    const targetBox = localBoxPositions[selectedBoxIndex];
    if (!targetBox) return;

    const maxL = pal.l / 10;
    const maxW = pal.w / 10;

    const nextVal = targetBox[axis] + amount;
    const maxVal = axis === 'x' ? maxL - targetBox.l : maxW - targetBox.w;
    const updatedVal = Math.max(0, Math.min(maxVal, Math.round(nextVal * 2) / 2));

    const updated = localBoxPositions.map((pos, idx) => {
      if (idx === selectedBoxIndex) {
        return { ...pos, [axis]: updatedVal };
      }
      return pos;
    });
    setLocalBoxPositions(updated);
  };

  const handleRotateBox = () => {
    if (selectedBoxIndex === null || !localBoxPositions) return;
    const targetBox = localBoxPositions[selectedBoxIndex];
    if (!targetBox) return;

    const nextL = targetBox.w;
    const nextW = targetBox.l;

    const maxL = pal.l / 10;
    const maxW = pal.w / 10;
    const nextX = Math.max(0, Math.min(maxL - nextL, targetBox.x));
    const nextY = Math.max(0, Math.min(maxW - nextW, targetBox.y));

    const updated = localBoxPositions.map((pos, idx) => {
      if (idx === selectedBoxIndex) {
        return { ...pos, x: nextX, y: nextY, l: nextL, w: nextW };
      }
      return pos;
    });
    setLocalBoxPositions(updated);
  };

  const handleResetPositions = () => {
    if (wr?.boxPositions) {
      setLocalBoxPositions(wr.boxPositions);
      setSelectedBoxIndex(null);
    }
  };

  const doesOverlap = (b1: any, b2: any): boolean => {
    return (
      b1.x < b2.x + b2.l &&
      b1.x + b1.l > b2.x &&
      b1.y < b2.y + b2.w &&
      b1.y + b1.w > b2.y
    );
  };

  const isOutOfBound = (b: any): boolean => {
    return b.x < 0 || b.y < 0 || b.x + b.l > pal.l / 10 || b.y + b.w > pal.w / 10;
  };

  const getValidationErrors = () => {
    const overlaps = new Set<number>();
    const outOfBounds = new Set<number>();

    for (let i = 0; i < localBoxPositions.length; i++) {
      const b1 = localBoxPositions[i];
      if (isOutOfBound(b1)) {
        outOfBounds.add(i);
      }
      for (let j = i + 1; j < localBoxPositions.length; j++) {
        const b2 = localBoxPositions[j];
        if (doesOverlap(b1, b2)) {
          overlaps.add(i);
          overlaps.add(j);
        }
      }
    }

    return { overlaps, outOfBounds };
  };

  const { overlaps, outOfBounds } = getValidationErrors();
  const hasErrors = overlaps.size > 0 || outOfBounds.size > 0;

  const {
    ori,
    bpl,
    ovL,
    ovW,
    effDyn,
    cap,
    mW,
    mH,
    mC,
    manLim,
    rec,
    lim,
    stkH,
    totWt,
    fkgm2,
    wtUtil,
    cNote,
    floorOK,
    htOK,
    wtOK,
  } = wr;

  const allOK = wtOK && htOK && floorOK;

  const CHK: React.FC<{ ok: boolean; label: string; val: string; limit: string }> = ({
    ok,
    label,
    val,
    limit,
  }) => (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${
        ok ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-red-50/50 border-red-200 text-red-900'
      } mb-3`}
    >
      <span className="text-sm">{ok ? '✅' : '⚠️'}</span>
      <div className="flex-1">
        <div className="text-xs font-bold">
          {label}: {val}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">จำกัด: {limit}</div>
      </div>
    </div>
  );

  const ROW: React.FC<{ lbl: string; max: string | number; active: boolean; note: string }> = ({
    lbl,
    max,
    active,
    note,
  }) => (
    <tr className={`border-b border-slate-100 transition-colors ${active ? 'bg-teal-50/20' : ''}`}>
      <td className={`p-2.5 text-xs ${active ? 'text-teal-700 font-bold' : 'text-slate-600'}`}>{lbl}</td>
      <td className={`p-2.5 text-xs font-bold tabular-nums ${active ? 'text-teal-700' : 'text-slate-800'}`}>
        {max}
      </td>
      <td className="p-2.5 text-[10px] text-slate-400">{note}</td>
    </tr>
  );

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <span className="text-[10px] text-teal-600 uppercase tracking-widest font-bold">
            Warehouse Pallet Design
          </span>
          <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
            โครงสร้างการจัดเรียงบนพาเลทคลังสินค้า
          </h2>
          <p className="text-[10px] text-slate-400 mt-1">
            พิกัดพาเลท: {effDyn.toFixed(0)} กก. (Dynamic) · การเคลื่อนย้าย: {settings.handleFreq} · ตัวคูณ:{' '}
            {(wr.hf * 100).toFixed(0)}%
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-4xl font-black ${allOK ? 'text-emerald-600' : 'text-red-600'}`}>
            {rec}
          </div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            ชั้นจัดเรียงแนะนำ
          </div>
        </div>
      </div>

      {/* Visualizers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Top View */}
        <div className="md:col-span-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-4 text-center">
            TOP VIEW (มุมมองจากด้านบน)
          </h4>
          <PalletTopSVG
            pl={pal.l}
            pw={pal.w}
            ori={ori}
            bc="#14b8a6"
            pc="#f59e0b"
            boxPositions={localBoxPositions}
            isEditMode={isEditMode}
            selectedBoxIndex={selectedBoxIndex}
            onSelectBox={setSelectedBoxIndex}
            onPositionsChange={setLocalBoxPositions}
          />

          {/* Controls HUD */}
          <div className="mt-4 space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                โหมดออกแบบลวดลาย
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsEditMode(!isEditMode);
                  if (isEditMode) {
                    setSelectedBoxIndex(null);
                  }
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                  isEditMode
                    ? 'bg-teal-600 text-white hover:bg-teal-700'
                    : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                {isEditMode ? 'บันทึกตำแหน่ง' : 'ขยับกล่องย่อย (Edit)'}
              </button>
            </div>

            {isEditMode ? (
              <div className="space-y-2.5">
                {selectedBoxIndex !== null && localBoxPositions[selectedBoxIndex] ? (
                  (() => {
                    const selBox = localBoxPositions[selectedBoxIndex];
                    return (
                      <div className="bg-slate-50 border border-slate-150 p-2.5 rounded-xl space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-teal-800">
                            กล่องย่อยใบที่ {selectedBoxIndex + 1} ({selBox.l}x{selBox.w} ซม.)
                          </span>
                          <button
                            type="button"
                            onClick={handleRotateBox}
                            className="p-1.5 bg-white hover:bg-slate-150 rounded border border-slate-200 text-slate-600 hover:text-teal-600 transition"
                            title="หมุนกล่อง 90 องศา"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-slate-500 bg-white p-1.5 rounded border border-slate-100 text-center">
                          <div>X: <strong>{selBox.x} ซม.</strong></div>
                          <div>Y: <strong>{selBox.y} ซม.</strong></div>
                        </div>

                        {/* Nudge Directions */}
                        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                          <div className="space-y-1">
                            <span className="text-[9px] text-slate-400 font-bold block">ขยับแกน X:</span>
                            <div className="flex gap-1 justify-center">
                              {[-2, -0.5, 0.5, 2].map((v) => (
                                <button
                                  key={`nudgex-${v}`}
                                  type="button"
                                  onClick={() => handleNudgeBox('x', v)}
                                  className="flex-1 py-0.5 text-[8px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 transition"
                                >
                                  {v > 0 ? `+${v}` : v}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] text-slate-400 font-bold block">ขยับแกน Y:</span>
                            <div className="flex gap-1 justify-center">
                              {[-2, -0.5, 0.5, 2].map((v) => (
                                <button
                                  key={`nudgey-${v}`}
                                  type="button"
                                  onClick={() => handleNudgeBox('y', v)}
                                  className="flex-1 py-0.5 text-[8px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 transition"
                                >
                                  {v > 0 ? `+${v}` : v}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-4 text-[10px] text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 leading-relaxed px-2">
                    💡 คลิกเลือกกล่องสินค้าในภาพด้านบนแล้วคลิกค้างเพื่อลากขยับ หรือใช้ปุ่มลูกศรปรับพิกัดแบบละเอียดได้ทันที
                  </div>
                )}

                {/* Reset button inside Edit Mode */}
                {JSON.stringify(localBoxPositions) !== JSON.stringify(wr.boxPositions) && (
                  <button
                    type="button"
                    onClick={handleResetPositions}
                    className="w-full py-1 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
                  >
                    คืนค่าแบบแผนคำนวณเดิม (Reset)
                  </button>
                )}

                {/* Validation Errors Overlay */}
                {hasErrors && (
                  <div className="p-2 bg-red-50 border border-red-150 rounded-lg text-[9px] text-red-700 flex items-start gap-1.5 leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <strong>พบข้อบกพร่องพิกัด:</strong> มีจุดทับซ้อนหรือล้นขอบเขตพาเลท โปรดปรับตำแหน่งเพื่อความปลอดภัย
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="text-[11px] text-slate-500 mt-4 text-center font-medium">
            <span className="text-teal-600 font-bold">{bpl}</span> กล่อง/ชั้น
            {ovL > 5 || ovW > 5 ? (
              <span className="text-slate-400 block text-[10px] mt-1">
                เหลือพื้นที่ขอบพาเลท: {ovL} × {ovW} มม.
              </span>
            ) : null}
          </div>
        </div>

        {/* Side Elevation */}
        <div className="md:col-span-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-4 text-center">
            SIDE ELEVATION (มุมมองด้านข้าง)
          </h4>
          <PalletElevSVG ph={pal.h} pw={pal.w} bH={box.H} nL={rec} maxH={settings.maxHeight} bc="#14b8a6" pc="#f59e0b" />
          <div className="text-[11px] text-slate-500 mt-4 text-center font-medium">
            ความสูงรวมพาเลท:{' '}
            <span className={`font-bold ${htOK ? 'text-emerald-600' : 'text-red-600'}`}>{stkH} มม.</span>
          </div>
        </div>

        {/* Checklist */}
        <div className="md:col-span-4 flex flex-col justify-center">
          <h4 className="text-[10px] text-teal-600 uppercase tracking-wider font-bold mb-3">
            Safety Status Checks
          </h4>
          <CHK
            ok={wtOK}
            label="พิกัดน้ำหนักพาเลท"
            val={`${totWt.toFixed(0)} กก.`}
            limit={`${effDyn.toFixed(0)} กก. (Dynamic)`}
          />
          <CHK
            ok={htOK}
            label="ขีดจำกัดความสูงสต็อก"
            val={`${stkH} มม.`}
            limit={`${settings.maxHeight - 200} มม. (ระยะปลอดภัย)`}
          />
          <CHK
            ok={floorOK}
            label="ความปลอดภัยของพื้น (Floor Load)"
            val={`${Math.round(fkgm2)} กก./ตร.ม.`}
            limit={`${settings.floorLoad} กก./ตร.ม.`}
          />
        </div>
      </div>

      {/* Layer Limits Table */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <h4 className="text-[10px] text-teal-600 uppercase tracking-wider font-bold mb-3">
          ขีดจำกัดจำนวนชั้นจำลอง (Layer Limits Breakdown)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="p-2 text-[10px] text-slate-400 font-bold uppercase">ขีดจำกัดควบคุม</th>
                <th className="p-2 text-[10px] text-slate-400 font-bold uppercase">จำนวนชั้นสูงสุด</th>
                <th className="p-2 text-[10px] text-slate-400 font-bold uppercase">วิธีการคำนวณและรายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              <ROW
                lbl="⚖️ น้ำหนักบรรทุกพาเลท"
                max={mW}
                active={lim.includes('Weight')}
                note={`น้ำหนักปลอดภัยสุทธิ ${cap.toFixed(0)} กก. ÷ (ชั้นละ ${bpl} กล่อง × กล่องละ ${box.wt} กก.)`}
              />
              <ROW
                lbl="📏 ความสูงสต็อกสตอเรจ"
                max={mH}
                active={lim.includes('Height')}
                note={`ความสูงเหลือว่าง ${settings.maxHeight - pal.h - 200} มม. ÷ กล่องสูงชั้นละ ${box.H} มม.`}
              />
              <ROW
                lbl="📦 ความแรงต้านกล่อง (BCT)"
                max={mC === 9999 ? 'ไม่จำกัด' : mC}
                active={lim.includes('Compress')}
                note={cNote || 'ไม่ได้ระบุค่าความแข็งแรงกล่อง (BCT)'}
              />
              <ROW
                lbl="✏️ ขีดจำกัดผู้ใช้กำหนดเอง"
                max={manLim === 9999 ? 'ไม่จำกัด' : manLim}
                active={lim.includes('Manual')}
                note="กำหนดชั้นจัดเรียงแบบกำหนดเองด้วยตนเอง"
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommended Design Card */}
      <div className="bg-teal-50/50 border-2 border-teal-500/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-teal-800 font-bold text-xs">
          <CheckCircle className="w-4 h-4 text-teal-600" />
          <span>บทสรุปการออกคำสั่งจัดเรียงสต็อก (Stacking Recommendation Details)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ['รูปแบบการเรียง', `${bpl} กล่อง/ชั้น (${ori.nL}×${ori.nW})`],
            ['จำนวนชั้นจัดเก็บ', `${rec} ชั้น — ควบคุมโดย ${lim}`],
            ['จำนวนกล่องรวมต่อพาเลท', `${bpl * rec} กล่อง`],
            ['น้ำหนักสินค้ารวม', `${totWt.toFixed(1)} กก. (${(wtUtil * 100).toFixed(0)}% ของพิกัดพาเลท)`],
            ['ความสูงพาเลทสะสม', `${stkH} มม. (พาเลท ${pal.h} + กล่อง ${rec * box.H} มม.)`],
            ['Floor load แรงกดพื้น', `${Math.round(fkgm2)} กก./ตร.ม.`],
          ].map(([k, v]) => (
            <div key={k} className="bg-white border border-teal-500/10 rounded-xl p-3 shadow-sm/30">
              <div className="text-[9px] text-teal-600 uppercase tracking-wider font-bold mb-1">{k}</div>
              <div className="text-xs font-extrabold text-slate-800">{v}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-teal-700 leading-relaxed border-t border-teal-500/10 pt-3 flex gap-2">
          <Info className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
          <span>
            📌 ขีดพิกัดน้ำหนัก static ของพาเลท ({ (effDyn / wr.hf).toFixed(0) } กก.) ถูกคำนวณและลดทอนลงเหลือ{' '}
            {effDyn.toFixed(0)} กก. สำหรับงานเคลื่อนย้าย dynamic ({settings.handleFreq}) เพื่อความปลอดภัยสูงสุด{' '}
            และป้องกันการล้า แตกหัก ยุบตัวของพาเลทจากการทำงานซ้ำซ้อน
          </span>
        </div>
      </div>
    </div>
  );
};
