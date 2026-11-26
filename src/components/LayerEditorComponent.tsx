import React, { useState, useEffect, useRef } from 'react';
import { Position3D } from '../types';
import { Layers, Move, RotateCw, Trash2, Plus, Copy, Check, AlertTriangle, ArrowRightLeft, Maximize2 } from 'lucide-react';

interface LayerEditorComponentProps {
  palletLength: number; // in cm
  palletWidth: number; // in cm
  boxLength: number; // in cm
  boxWidth: number; // in cm
  boxHeight: number; // in cm
  boxWeight: number; // in kg
  boxColor: string; // hex
  layersCount: number;
  initialFullPositions: Position3D[];
  onUpdate: (updatedPositions: Position3D[], totalBoxes: number, boxesPerLayer: number, customLayersCount?: number) => void;
}

interface CustomBox {
  id: string;
  x: number;
  y: number;
  l: number;
  w: number;
  h: number;
}

export const LayerEditorComponent: React.FC<LayerEditorComponentProps> = ({
  palletLength,
  palletWidth,
  boxLength,
  boxWidth,
  boxHeight,
  boxWeight,
  boxColor,
  layersCount,
  initialFullPositions,
  onUpdate
}) => {
  // We represent box positions layer-by-layer
  // Map layer index -> array of custom boxes
  const [localLayersCount, setLocalLayersCount] = useState<number>(layersCount);
  const [layersBoxes, setLayersBoxes] = useState<Record<number, CustomBox[]>>({});
  const [activeLayerIdx, setActiveLayerIdx] = useState<number>(0);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [draggedBox, setDraggedBox] = useState<{ id: string; startX: number; startY: number; boxStartX: number; boxStartY: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync state if props change from parent solver
  useEffect(() => {
    setLocalLayersCount(layersCount);
  }, [layersCount]);

  // Initialize layersBoxes from initialFullPositions
  useEffect(() => {
    const nextLayers: Record<number, CustomBox[]> = {};
    for (let l = 0; l < localLayersCount; l++) {
      nextLayers[l] = [];
    }

    initialFullPositions.forEach((pos, idx) => {
      // Determine which layer it belongs to based on z height
      const layerIdx = Math.min(
        localLayersCount - 1,
        Math.max(0, Math.round(pos.z / boxHeight))
      );
      if (!nextLayers[layerIdx]) {
        nextLayers[layerIdx] = [];
      }
      nextLayers[layerIdx].push({
        id: `box-${layerIdx}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        x: pos.x,
        y: pos.y,
        l: pos.l,
        w: pos.w,
        h: pos.h
      });
    });

    setLayersBoxes(nextLayers);
    setSelectedBoxId(null);
    if (activeLayerIdx >= localLayersCount) {
      setActiveLayerIdx(Math.max(0, localLayersCount - 1));
    }
  }, [initialFullPositions, localLayersCount, boxHeight]);

  const activeLayerBoxes = layersBoxes[activeLayerIdx] || [];

  // Helper: propagate updates back to parent tab
  const propagateUpdates = (updatedLayers: Record<number, CustomBox[]>, countOverride?: number) => {
    const currentLayersCount = countOverride !== undefined ? countOverride : localLayersCount;
    const fullList: Position3D[] = [];
    let boxCounter = 0;

    for (let l = 0; l < currentLayersCount; l++) {
      const bList = updatedLayers[l] || [];
      bList.forEach((box) => {
        fullList.push({
          x: box.x,
          y: box.y,
          z: l * boxHeight,
          l: box.l,
          w: box.w,
          h: box.h
        });
        boxCounter++;
      });
    }

    const activeBoxesCount = updatedLayers[activeLayerIdx]?.length || 0;
    onUpdate(fullList, boxCounter, activeBoxesCount, currentLayersCount);
  };

  const handleLayersCountChange = (newCount: number) => {
    if (newCount < 1 || newCount > 30) return; // reasonable limits

    setLocalLayersCount((prev) => {
      setLayersBoxes((prevBoxes) => {
        const updated = { ...prevBoxes };
        if (newCount > prev) {
          // Adding layer(s)
          for (let l = prev; l < newCount; l++) {
            // Copy boxes from the layer below it (l-1) or active layer or empty
            const sourceLayer = prevBoxes[l - 1] || prevBoxes[activeLayerIdx] || [];
            updated[l] = sourceLayer.map((box, idx) => ({
              ...box,
              id: `box-${l}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
              x: box.x,
              y: box.y,
              l: box.l,
              w: box.w,
              h: box.h
            }));
          }
        } else if (newCount < prev) {
          // Removing layer(s)
          for (let l = newCount; l < prev; l++) {
            delete updated[l];
          }
        }
        
        // Propagate changes with the updated layer configuration
        setTimeout(() => {
          propagateUpdates(updated, newCount);
        }, 0);

        return updated;
      });

      if (activeLayerIdx >= newCount) {
        setActiveLayerIdx(newCount - 1);
      }

      return newCount;
    });
  };

  // Check if two boxes overlap
  const doesOverlap = (b1: CustomBox, b2: CustomBox): boolean => {
    return (
      b1.x < b2.x + b2.l &&
      b1.x + b1.l > b2.x &&
      b1.y < b2.y + b2.w &&
      b1.y + b1.w > b2.y
    );
  };

  // Check if a box exceeds pallet boundaries
  const isOutOfBound = (b: CustomBox): boolean => {
    return b.x < 0 || b.y < 0 || b.x + b.l > palletLength || b.y + b.w > palletWidth;
  };

  // Find overlapping boxes on active layer
  const getValidationErrors = () => {
    const overlaps = new Set<string>();
    const outOfBounds = new Set<string>();

    for (let i = 0; i < activeLayerBoxes.length; i++) {
      const b1 = activeLayerBoxes[i];
      if (isOutOfBound(b1)) {
        outOfBounds.add(b1.id);
      }
      for (let j = i + 1; j < activeLayerBoxes.length; j++) {
        const b2 = activeLayerBoxes[j];
        if (doesOverlap(b1, b2)) {
          overlaps.add(b1.id);
          overlaps.add(b2.id);
        }
      }
    }

    return { overlaps, outOfBounds };
  };

  const { overlaps, outOfBounds } = getValidationErrors();
  const hasErrors = overlaps.size > 0 || outOfBounds.size > 0;

  // Alignments handlers
  const handleAlignment = (type: 'parallel' | 'h-mirrored' | 'v-mirrored' | 'rotated-180' | 'rotated-90') => {
    // Generate new coordinates based on alignment type
    let aligned: CustomBox[] = [];

    // 'parallel' is resetting to original computed solved positions
    if (type === 'parallel') {
      // Find default positions for this layer from the initial positions
      const defaultPositions = initialFullPositions.filter(p => {
        const zLayer = Math.round(p.z / boxHeight);
        return zLayer === activeLayerIdx;
      });

      aligned = defaultPositions.map((pos, idx) => ({
        id: `box-${activeLayerIdx}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        x: pos.x,
        y: pos.y,
        l: pos.l,
        w: pos.w,
        h: pos.h
      }));
    } else {
      // Transform current layout
      aligned = activeLayerBoxes.map((box) => {
        let newX = box.x;
        let newY = box.y;
        let newL = box.l;
        let newW = box.w;

        if (type === 'h-mirrored') {
          newX = palletLength - box.x - box.l;
        } else if (type === 'v-mirrored') {
          newY = palletWidth - box.y - box.w;
        } else if (type === 'rotated-180') {
          newX = palletLength - box.x - box.l;
          newY = palletWidth - box.y - box.w;
        } else if (type === 'rotated-90') {
          // Clockwise rotate 90 degrees around center
          newX = palletLength - (box.y + box.w);
          newY = box.x;
          newL = box.w;
          newW = box.l;
        }

        return {
          ...box,
          x: Math.max(0, Math.min(palletLength - newL, Math.round(newX))),
          y: Math.max(0, Math.min(palletWidth - newW, Math.round(newY))),
          l: newL,
          w: newW
        };
      });
    }

    const updated = {
      ...layersBoxes,
      [activeLayerIdx]: aligned
    };
    setLayersBoxes(updated);
    propagateUpdates(updated);
  };

  // Add a new box
  const handleAddBox = () => {
    const newBox: CustomBox = {
      id: `box-add-${Date.now()}`,
      x: Math.round((palletLength - boxLength) / 2),
      y: Math.round((palletWidth - boxWidth) / 2),
      l: boxLength,
      w: boxWidth,
      h: boxHeight
    };

    const updated = {
      ...layersBoxes,
      [activeLayerIdx]: [...activeLayerBoxes, newBox]
    };
    setLayersBoxes(updated);
    setSelectedBoxId(newBox.id);
    propagateUpdates(updated);
  };

  // Delete selected box
  const handleDeleteBox = (boxId: string) => {
    const filtered = activeLayerBoxes.filter(b => b.id !== boxId);
    const updated = {
      ...layersBoxes,
      [activeLayerIdx]: filtered
    };
    setLayersBoxes(updated);
    if (selectedBoxId === boxId) {
      setSelectedBoxId(null);
    }
    propagateUpdates(updated);
  };

  // Rotate individual box 90 degrees
  const handleRotateIndividualBox = (boxId: string) => {
    const rotated = activeLayerBoxes.map((box) => {
      if (box.id === boxId) {
        // Swap length and width
        const nextL = box.w;
        const nextW = box.l;
        // Keep inside bounds if possible
        const nextX = Math.max(0, Math.min(palletLength - nextL, box.x));
        const nextY = Math.max(0, Math.min(palletWidth - nextW, box.y));
        return {
          ...box,
          x: nextX,
          y: nextY,
          l: nextL,
          w: nextW
        };
      }
      return box;
    });

    const updated = {
      ...layersBoxes,
      [activeLayerIdx]: rotated
    };
    setLayersBoxes(updated);
    propagateUpdates(updated);
  };

  // Nudge box coordinate
  const nudgeBox = (boxId: string, axis: 'x' | 'y', amount: number) => {
    const nudged = activeLayerBoxes.map((box) => {
      if (box.id === boxId) {
        const val = box[axis] + amount;
        const maxVal = axis === 'x' ? palletLength - box.l : palletWidth - box.w;
        return {
          ...box,
          [axis]: Math.max(0, Math.min(maxVal, Math.round(val)))
        };
      }
      return box;
    });

    const updated = {
      ...layersBoxes,
      [activeLayerIdx]: nudged
    };
    setLayersBoxes(updated);
    propagateUpdates(updated);
  };

  // Copy current layer design to all other layers (interlocking stability helper)
  const handleCopyLayerToAll = () => {
    const updated = { ...layersBoxes };
    for (let l = 0; l < localLayersCount; l++) {
      if (l !== activeLayerIdx) {
        // Deep clone active boxes, adjusting ID
        updated[l] = activeLayerBoxes.map((box, idx) => ({
          ...box,
          id: `box-${l}-${idx}-${Math.random().toString(36).substr(2, 4)}`
        }));
      }
    }
    setLayersBoxes(updated);
    propagateUpdates(updated);
  };

  // Apply Interlocking patterns automatically (flip odd layers horizontally)
  const handleInterlockAllLayers = () => {
    const updated = { ...layersBoxes };
    const baseBoxes = activeLayerBoxes;

    for (let l = 0; l < localLayersCount; l++) {
      const isOdd = l % 2 === 1;
      if (isOdd) {
        updated[l] = baseBoxes.map((box, idx) => {
          const flippedX = palletLength - box.x - box.l;
          return {
            id: `box-${l}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            x: Math.max(0, Math.min(palletLength - box.l, Math.round(flippedX))),
            y: box.y,
            l: box.l,
            w: box.w,
            h: box.h
          };
        });
      } else {
        updated[l] = baseBoxes.map((box, idx) => ({
          ...box,
          id: `box-${l}-${idx}-${Math.random().toString(36).substr(2, 4)}`
        }));
      }
    }
    setLayersBoxes(updated);
    propagateUpdates(updated);
  };

  // Drag and Drop implementation
  const handleBoxMouseDown = (e: React.MouseEvent, box: CustomBox) => {
    if (!isEditMode) return;
    e.preventDefault();
    setSelectedBoxId(box.id);

    setDraggedBox({
      id: box.id,
      startX: e.clientX,
      startY: e.clientY,
      boxStartX: box.x,
      boxStartY: box.y
    });
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggedBox || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const gridScale = rect.width / palletLength;

      const dx = (e.clientX - draggedBox.startX) / gridScale;
      const dy = (e.clientY - draggedBox.startY) / gridScale;

      // Snap to 1cm increments
      const nextX = Math.round(draggedBox.boxStartX + dx);
      const nextY = Math.round(draggedBox.boxStartY + dy);

      // Find dragging box dimensions
      const targetBox = activeLayerBoxes.find(b => b.id === draggedBox.id);
      if (!targetBox) return;

      const updatedX = Math.max(0, Math.min(palletLength - targetBox.l, nextX));
      const updatedY = Math.max(0, Math.min(palletWidth - targetBox.w, nextY));

      const updatedBoxes = activeLayerBoxes.map((box) => {
        if (box.id === draggedBox.id) {
          return {
            ...box,
            x: updatedX,
            y: updatedY
          };
        }
        return box;
      });

      const updated = {
        ...layersBoxes,
        [activeLayerIdx]: updatedBoxes
      };
      setLayersBoxes(updated);
    };

    const handleGlobalMouseUp = () => {
      if (draggedBox) {
        setDraggedBox(null);
        propagateUpdates(layersBoxes);
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
  }, [draggedBox, activeLayerBoxes, layersBoxes, palletLength, palletWidth, activeLayerIdx]);

  // Touch Support
  const handleBoxTouchStart = (e: React.TouchEvent, box: CustomBox) => {
    if (!isEditMode) return;
    const touch = e.touches[0];
    setSelectedBoxId(box.id);

    setDraggedBox({
      id: box.id,
      startX: touch.clientX,
      startY: touch.clientY,
      boxStartX: box.x,
      boxStartY: box.y
    });
  };

  useEffect(() => {
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!draggedBox || !containerRef.current) return;
      const touch = e.touches[0];

      const rect = containerRef.current.getBoundingClientRect();
      const gridScale = rect.width / palletLength;

      const dx = (touch.clientX - draggedBox.startX) / gridScale;
      const dy = (touch.clientY - draggedBox.startY) / gridScale;

      const nextX = Math.round(draggedBox.boxStartX + dx);
      const nextY = Math.round(draggedBox.boxStartY + dy);

      const targetBox = activeLayerBoxes.find(b => b.id === draggedBox.id);
      if (!targetBox) return;

      const updatedX = Math.max(0, Math.min(palletLength - targetBox.l, nextX));
      const updatedY = Math.max(0, Math.min(palletWidth - targetBox.w, nextY));

      const updatedBoxes = activeLayerBoxes.map((box) => {
        if (box.id === draggedBox.id) {
          return {
            ...box,
            x: updatedX,
            y: updatedY
          };
        }
        return box;
      });

      const updated = {
        ...layersBoxes,
        [activeLayerIdx]: updatedBoxes
      };
      setLayersBoxes(updated);
    };

    const handleGlobalTouchEnd = () => {
      if (draggedBox) {
        setDraggedBox(null);
        propagateUpdates(layersBoxes);
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
  }, [draggedBox, activeLayerBoxes, layersBoxes, palletLength, palletWidth, activeLayerIdx]);

  // Dimensions of the preview container (we fit pallet length to 100% or 400px width max)
  const maxEditorWidth = 420;
  const scaleRatio = maxEditorWidth / palletLength;
  const editorHeight = palletWidth * scaleRatio;

  const activeBox = activeLayerBoxes.find(b => b.id === selectedBoxId);

  return (
    <div id="layer-alignment-editor-hud" className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
        <div>
          <span className="text-[10px] text-teal-600 font-extrabold uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            Layer Customization & Alignment Engine
          </span>
          <h4 className="text-sm font-bold text-slate-800 mt-0.5">
            เครื่องมือจัดวางแนวและออกแบบลายพาเลทรายชั้น (Layer Editor)
          </h4>
        </div>
        <button
          type="button"
          onClick={() => setIsEditMode(!isEditMode)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
            isEditMode
              ? 'bg-teal-600 text-white hover:bg-teal-700'
              : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200'
          }`}
        >
          <Move className="w-4 h-4" />
          {isEditMode ? 'บันทึก / ล็อคตำแหน่ง' : 'โหมดลากจัดเรียง 2D'}
        </button>
      </div>

      {/* Selector: Active Layer & Layer Adjuster */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-100">
        
        {/* Layer Count Adjuster */}
        <div className="md:col-span-4 space-y-1.5">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide block">
            ปรับจำนวนชั้นด้วยตนเอง (Adjust Total Layers):
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleLayersCountChange(localLayersCount - 1)}
              disabled={localLayersCount <= 1}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center font-bold text-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              title="ลดจำนวนชั้นลง 1 ชั้น"
            >
              -
            </button>
            <div className="flex-1 bg-white border border-slate-200 rounded-xl h-10 flex items-center justify-center">
              <span className="font-mono font-bold text-slate-800 text-sm">
                {localLayersCount} ชั้น
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleLayersCountChange(localLayersCount + 1)}
              disabled={localLayersCount >= 30}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center font-bold text-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              title="เพิ่มจำนวนชั้นขึ้น 1 ชั้น"
            >
              +
            </button>
          </div>
        </div>

        {/* Selector: Active Layer */}
        <div className="md:col-span-8 space-y-1.5">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide block">
            เลือกชั้นสต็อกที่ต้องการปรับแต่ง (Select Active Layer):
          </label>
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 max-h-[85px] overflow-y-auto">
            {Array.from({ length: localLayersCount }).map((_, lIdx) => {
              const boxesCountOnL = layersBoxes[lIdx]?.length || 0;
              return (
                <button
                  key={lIdx}
                  type="button"
                  onClick={() => {
                    setActiveLayerIdx(lIdx);
                    setSelectedBoxId(null);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                    activeLayerIdx === lIdx
                      ? 'bg-teal-600 border-teal-600 text-white font-extrabold shadow'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>ชั้นที่ {lIdx + 1}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${activeLayerIdx === lIdx ? 'bg-white text-teal-800' : 'bg-slate-100 text-slate-600'}`}>
                    {boxesCountOnL} กล่อง
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Main Grid Workstation & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: 2D Grid Area */}
        <div className="lg:col-span-7 flex flex-col items-center">
          
          {/* Blueprint Pallet Screen */}
          <div
            ref={containerRef}
            className="relative border-4 border-amber-600/60 rounded-xl overflow-hidden bg-slate-900/95 shadow-lg select-none"
            style={{
              width: '100%',
              maxWidth: `${maxEditorWidth}px`,
              height: `${editorHeight}px`,
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 0)',
              backgroundSize: '16px 16px'
            }}
          >
            {/* Pallet wood board outline */}
            <div className="absolute inset-0 border border-dashed border-teal-500/30 flex justify-center items-center pointer-events-none">
              <span className="text-[10px] font-mono text-slate-500 tracking-wider">
                PALLET BASE ({palletLength}x{palletWidth} cm)
              </span>
            </div>

            {/* Render Boxes of active layer */}
            {activeLayerBoxes.map((box, bIdx) => {
              const isSelected = box.id === selectedBoxId;
              const isOverlapping = overlaps.has(box.id);
              const isOut = outOfBounds.has(box.id);

              return (
                <div
                  key={box.id}
                  onMouseDown={(e) => handleBoxMouseDown(e, box)}
                  onTouchStart={(e) => handleBoxTouchStart(e, box)}
                  onDoubleClick={() => handleRotateIndividualBox(box.id)}
                  className={`absolute flex flex-col justify-between items-center p-1 rounded transition-colors select-none ${
                    isEditMode ? 'cursor-move' : 'cursor-pointer'
                  } ${
                    isSelected 
                      ? 'border-2 border-teal-400 bg-teal-500/40 text-white z-20' 
                      : isOverlapping || isOut
                      ? 'border-2 border-rose-500 bg-rose-500/30 text-rose-100 z-10'
                      : 'border border-slate-700 hover:border-slate-400 text-slate-200'
                  }`}
                  style={{
                    left: `${box.x * scaleRatio}px`,
                    top: `${box.y * scaleRatio}px`,
                    width: `${box.l * scaleRatio}px`,
                    height: `${box.w * scaleRatio}px`,
                    backgroundColor: isSelected ? undefined : (isOverlapping || isOut ? undefined : `${boxColor}cc`)
                  }}
                  title="ดับเบิ้ลคลิกเพื่อหมุน 90 องศา"
                >
                  {/* Small Action Badge inside */}
                  <div className="w-full flex justify-between items-center">
                    <span className="text-[8px] font-extrabold font-mono leading-none bg-slate-900/75 px-1 rounded-sm text-slate-200">
                      {bIdx + 1}
                    </span>
                    {isEditMode && isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRotateIndividualBox(box.id);
                        }}
                        className="p-0.5 bg-slate-900/80 text-white hover:text-teal-400 rounded-sm hover:scale-105 transition"
                        title="หมุนกล่อง"
                      >
                        <RotateCw className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>

                  <span className="text-[9px] font-bold font-mono tracking-tighter truncate max-w-full text-center pointer-events-none drop-shadow-md">
                    {box.l}x{box.w}
                  </span>

                  <div className="w-full flex justify-end">
                    {isEditMode && isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBox(box.id);
                        }}
                        className="p-0.5 bg-rose-950/80 text-rose-300 hover:text-rose-100 rounded-sm transition"
                        title="ลบกล่อง"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick HUD validation bar */}
          <div className="w-full max-w-[420px] mt-2 flex justify-between items-center text-[11px] px-1">
            <span className="text-slate-400 font-mono">
              กล่องในชั้นนี้: <strong className="text-slate-700">{activeLayerBoxes.length}</strong>
            </span>
            <div className="flex items-center gap-1">
              {hasErrors ? (
                <span className="flex items-center gap-1 text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-md">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  พิกัดทับซ้อนหรือเกินขอบ
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                  <Check className="w-3.5 h-3.5" />
                  แนวเรียงสมบูรณ์ถูกต้อง
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Stacking Alignments and Helpers */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          
          {/* Alignment Presets Toolbar */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide block">
              เลือกลายการปรับระดับสอดประสาน (Alignment & Symmetry):
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleAlignment('parallel')}
                className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-teal-500 bg-white hover:bg-teal-50/20 text-slate-700 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                title="รีเซ็ตตำแหน่งกลับเป็นแบบขนานขบวนเดิม"
              >
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>ทับขนานเดิม (Reset)</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignment('h-mirrored')}
                className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-teal-500 bg-white hover:bg-teal-50/20 text-slate-700 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                title="พลิกพิกัดซ้ายขวาแนวนอน"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                <span>สะท้อนแนวนอน</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignment('v-mirrored')}
                className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-teal-500 bg-white hover:bg-teal-50/20 text-slate-700 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                title="พลิกพิกัดบนล่างแนวตั้ง"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400 rotate-90" />
                <span>สะท้อนแนวตั้ง</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignment('rotated-90')}
                className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-teal-500 bg-white hover:bg-teal-50/20 text-slate-700 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                title="หมุนระนาบชั้น 90 องศา"
              >
                <RotateCw className="w-3.5 h-3.5 text-slate-400" />
                <span>หมุนชั้น 90°</span>
              </button>
            </div>
          </div>

          {/* Individual selected box fine-tuning */}
          <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-xl space-y-2.5">
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide block">
              ปรับตำแหน่งกล่องแบบละเอียด (Box Nudge HUD):
            </span>

            {activeBox ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-teal-800">
                    กล่องขนาด {activeBox.l}x{activeBox.w} ซม.
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleRotateIndividualBox(activeBox.id)}
                      className="p-1.5 bg-white hover:bg-slate-100 rounded text-slate-600 transition"
                      title="หมุนกล่องย่อย"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBox(activeBox.id)}
                      className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded transition"
                      title="ลบกล่องย่อย"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Coordinates */}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2 rounded border border-slate-150 text-slate-600">
                  <div>X (พิกัดซ้าย): <strong className="text-slate-800">{activeBox.x} ซม.</strong></div>
                  <div>Y (พิกัดบน): <strong className="text-slate-800">{activeBox.y} ซม.</strong></div>
                </div>

                {/* Nudge Buttons */}
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-1 items-center">
                    <span className="text-[10px] text-slate-400 font-bold">ขยับแนวนอน (X):</span>
                    <div className="flex gap-1">
                      {[-5, -1, 1, 5].map(v => (
                        <button
                          key={`nudge-x-${v}`}
                          type="button"
                          onClick={() => nudgeBox(activeBox.id, 'x', v)}
                          className="px-2 py-0.5 text-[10px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 transition"
                        >
                          {v > 0 ? `+${v}` : v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between gap-1 items-center">
                    <span className="text-[10px] text-slate-400 font-bold">ขยับแนวตั้ง (Y):</span>
                    <div className="flex gap-1">
                      {[-5, -1, 1, 5].map(v => (
                        <button
                          key={`nudge-y-${v}`}
                          type="button"
                          onClick={() => nudgeBox(activeBox.id, 'y', v)}
                          className="px-2 py-0.5 text-[10px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 transition"
                        >
                          {v > 0 ? `+${v}` : v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-5 text-[11px] text-slate-400 bg-white/50 rounded-lg border border-dashed border-slate-200 leading-relaxed">
                {isEditMode 
                  ? '💡 คลิกเลือกกล่องใบใดก็ได้ในแผนภาพเพื่อปรับพิกัด คัดลอก หรือลบ' 
                  : '💡 กดปุ่ม "โหมดลากจัดเรียง 2D" สีเขียวด้านบนเพื่อคลิกจับลาก ขยับ หมุนกล่องได้อิสระ'}
              </div>
            )}
          </div>

          {/* Stacking stabilization controls */}
          <div className="space-y-2 border-t border-slate-150 pt-3">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide block">
              เครื่องมือช่วยล็อกกองและกระจายน้ำหนักพาเลท (Stack Stability Helpers):
            </span>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleAddBox}
                className="w-full bg-teal-50 hover:bg-teal-100/85 text-teal-800 text-xs font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5 border border-teal-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                วางกล่องใหม่เพิ่มในชั้นนี้ (+ Add Box)
              </button>
              
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyLayerToAll}
                  className="bg-slate-150 hover:bg-slate-200 text-slate-700 text-[11px] font-bold py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                  title="จำลองให้ทุกชั้นในพาเลทซ้อนกองตรงกันกับลายนี้"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  ก๊อปปี้ลายนี้ไปทุกชั้น
                </button>
                <button
                  type="button"
                  onClick={handleInterlockAllLayers}
                  className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-bold py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                  title="ทำ Interlocking สลับแนวนอนแบบสลับฟันปลาเพื่อความแข็งแรงสต็อก"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
                  สลับชั้นล็อกคาน (Interlock)
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
