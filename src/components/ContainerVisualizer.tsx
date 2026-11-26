import React, { useRef, useEffect, useState } from 'react';
import { Position3D, LoadingStep } from '../types';
import { RotateCw, ZoomIn, ZoomOut, Eye, Play, Pause } from 'lucide-react';

interface VisualItem {
  id: string;
  name: string;
  color: string;
  position: Position3D;
}

interface ContainerVisualizerProps {
  containerWidth: number; // in cm
  containerLength: number; // in cm
  containerHeight: number; // in cm
  items: VisualItem[];
  title?: string;
  isPalletMode?: boolean;
  activeStepIdx?: number;
  loadingSteps?: LoadingStep[];
  onStepChange?: (stepIdx: number) => void;
  patternTypePreference?: string;
  setPatternTypePreference?: (p: any) => void;
}

export const ContainerVisualizer: React.FC<ContainerVisualizerProps> = ({
  containerWidth,
  containerLength,
  containerHeight,
  items,
  title = "Container Load Preview",
  isPalletMode = false,
  activeStepIdx,
  loadingSteps,
  onStepChange,
  patternTypePreference,
  setPatternTypePreference
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Angle states
  const [yaw, setYaw] = useState<number>(-45); // horizontal rotation in degrees
  const [pitch, setPitch] = useState<number>(30); // vertical tilt in degrees
  const [zoom, setZoom] = useState<number>(1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | 'top' | 'side' | 'front'>('3d');
  const [loadingStep, setLoadingStep] = useState<number>(items.length);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1000); // ms per step

  // Manual overrides for box positions
  const [manualOverrides, setManualOverrides] = useState<Record<string, Position3D>>({});
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // Reset overrides when core container properties or layout parameters change
  useEffect(() => {
    setManualOverrides({});
    setRemovedItemIds(new Set());
    setSelectedItemId(null);
    setHoveredItemId(null);
  }, [items.length, containerLength, containerWidth, containerHeight, patternTypePreference]);

  // Update loadingStep when items count changes or when activeStepIdx changes
  useEffect(() => {
    if (loadingSteps && loadingSteps.length > 0 && activeStepIdx !== undefined) {
      let count = 0;
      for (let i = 0; i <= Math.min(activeStepIdx, loadingSteps.length - 1); i++) {
        count += loadingSteps[i].quantity;
      }
      setLoadingStep(count);
    } else {
      setLoadingStep(items.length);
    }
  }, [items.length, activeStepIdx, loadingSteps]);

  // Autoplay playback loop
  useEffect(() => {
    if (!isPlaying) return;
    if (!loadingSteps || loadingSteps.length === 0 || activeStepIdx === undefined || !onStepChange) {
      return;
    }

    const interval = setInterval(() => {
      if (activeStepIdx >= loadingSteps.length - 1) {
        onStepChange(0); // loop back
      } else {
        onStepChange(activeStepIdx + 1);
      }
    }, playSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, activeStepIdx, loadingSteps, playSpeed, onStepChange]);

  // Autoplay playback loop (fallback for non-controlled box-by-box)
  useEffect(() => {
    if (!isPlaying) return;
    const isControlled = activeStepIdx !== undefined && onStepChange !== undefined && loadingSteps && loadingSteps.length > 0;
    if (isControlled) return; // Handled by controlled effect above

    if (items.length === 0) {
      setIsPlaying(false);
      return;
    }

    const interval = setInterval(() => {
      setLoadingStep((s) => {
        if (s >= items.length) {
          return 0; // loop back
        } else {
          return s + 1;
        }
      });
    }, items.length > 50 ? 100 : 300); // speed up if many boxes

    return () => clearInterval(interval);
  }, [isPlaying, items.length, activeStepIdx, onStepChange, loadingSteps]);

  useEffect(() => {
    draw();
  }, [containerWidth, containerLength, containerHeight, items, yaw, pitch, zoom, hoveredIndex, viewMode, loadingStep, manualOverrides, removedItemIds, selectedItemId, hoveredItemId]);

  const getItemAtMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const pad = 60;
    const relativeX = mouseX - pad;
    const relativeY = mouseY - pad;

    let displayW = 0;
    let displayH = 0;

    if (viewMode === 'top') {
      displayW = containerLength;
      displayH = containerWidth;
    } else if (viewMode === 'side') {
      displayW = containerLength;
      displayH = containerHeight;
    } else if (viewMode === 'front') {
      displayW = containerWidth;
      displayH = containerHeight;
    } else {
      return null; // Not supported in 3D
    }

    const scaleFitW = (canvas.width - pad * 2) / displayW;
    const scaleFitH = (canvas.height - pad * 2) / displayH;
    const optimalScale = Math.min(scaleFitW, scaleFitH);

    const xInCm = relativeX / optimalScale;
    const yInCm = relativeY / optimalScale;

    // Search back-to-front (top overlay first)
    const itemsToSearch = items.slice(0, loadingStep).map(item => {
      const override = manualOverrides[item.id];
      return override ? { ...item, position: override } : item;
    });

    for (let i = itemsToSearch.length - 1; i >= 0; i--) {
      const item = itemsToSearch[i];
      if (removedItemIds.has(item.id)) continue;
      
      const p = item.position;
      if (viewMode === 'top') {
        if (xInCm >= p.x && xInCm <= p.x + p.l && yInCm >= p.y && yInCm <= p.y + p.w) {
          return { item, index: i };
        }
      } else if (viewMode === 'side') {
        // side is X-Z (length and height)
        const zInCm = containerHeight - yInCm;
        if (xInCm >= p.x && xInCm <= p.x + p.l && zInCm >= p.z && zInCm <= p.z + p.h) {
          return { item, index: i };
        }
      } else if (viewMode === 'front') {
        // front is Y-Z (width and height)
        const zInCm = containerHeight - yInCm;
        if (xInCm >= p.y && xInCm <= p.y + p.w && zInCm >= p.z && zInCm <= p.z + p.h) {
          return { item, index: i };
        }
      }
    }
    return null;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2 + 50; // shift down slightly for 3D layout headroom

    // Calculate dynamic auto-scale factor
    // We want container length/width to fit comfortably inside canvas width (with 40px padding)
    const padding = 80;
    const maxDim = Math.max(containerLength, containerWidth, containerHeight);
    const baseScale = (Math.min(width, height) - padding) / maxDim;
    const scale = baseScale * zoom;

    // Render 2D Views
    if (viewMode !== '3d') {
      draw2DView(ctx, width, height, scale);
      return;
    }

    // --- 3D Projection Engine ---
    // Rotations in radians
    const radYaw = (yaw * Math.PI) / 180;
    const radPitch = (pitch * Math.PI) / 180;

    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);

    // Project 3D point (X, Y, Z) to 2D Screen point (Sx, Sy)
    // Container coordinates: Center is offset to fit properly
    const project = (x: number, y: number, z: number) => {
      // Offset center to (0,0,0) for rotation
      const cx3d = x - containerLength / 2;
      const cy3d = y - containerWidth / 2;
      const cz3d = z - containerHeight / 2;

      // Yaw rotation (around Z-axis)
      const x1 = cx3d * cosY - cy3d * sinY;
      const y1 = cx3d * sinY + cy3d * cosY;
      const z1 = cz3d;

      // Pitch rotation (around X-axis)
      const x2 = x1;
      const y2 = y1 * cosP - z1 * sinP;
      const z2 = y1 * sinP + cz3d * cosP;

      // Final screen coordinates
      const sx = cx + x2 * scale;
      const sy = cy - z2 * scale; // invert Y for screen canvas orientation

      return { x: sx, y: sy, depth: y2 }; // y2 serves as depth for painters algorithm
    };

    // Draw container wireframe back edges
    const drawWireframe = (isBack: boolean) => {
      const corners = [
        project(0, 0, 0),                       // 0
        project(containerLength, 0, 0),         // 1
        project(containerLength, containerWidth, 0), // 2
        project(0, containerWidth, 0),          // 3
        project(0, 0, containerHeight),         // 4
        project(containerLength, 0, containerHeight), // 5
        project(containerLength, containerWidth, containerHeight), // 6
        project(0, containerWidth, containerHeight), // 7
      ];

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;

      // Draw floor grid
      ctx.beginPath();
      const gridCount = 6;
      for (let i = 0; i <= gridCount; i++) {
        // lines along length
        const yVal = (containerWidth / gridCount) * i;
        const pStart = project(0, yVal, 0);
        const pEnd = project(containerLength, yVal, 0);
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);

        // lines along width
        const xVal = (containerLength / gridCount) * i;
        const pStart2 = project(xVal, 0, 0);
        const pEnd2 = project(xVal, containerWidth, 0);
        ctx.moveTo(pStart2.x, pStart2.y);
        ctx.lineTo(pEnd2.x, pEnd2.y);
      }
      ctx.stroke();

      // Outer container frame
      ctx.strokeStyle = isBack ? 'rgba(59, 130, 246, 0.45)' : '#2563eb'; // vibrant blue edges!
      ctx.lineWidth = isBack ? 1.5 : 2.5;

      const drawEdge = (i1: number, i2: number) => {
        ctx.beginPath();
        ctx.moveTo(corners[i1].x, corners[i1].y);
        ctx.lineTo(corners[i2].x, corners[i2].y);
        ctx.stroke();
      };

      if (isBack) {
        // Draw back edges (furthest depth)
        drawEdge(0, 1);
        drawEdge(0, 3);
        drawEdge(0, 4);
      } else {
        // Draw front/main edges
        drawEdge(1, 2);
        drawEdge(2, 3);
        drawEdge(1, 5);
        drawEdge(2, 6);
        drawEdge(3, 7);
        drawEdge(4, 5);
        drawEdge(5, 6);
        drawEdge(6, 7);
        drawEdge(7, 4);

        // Draw translucent blue container walls for pristine 3D transparency
        ctx.fillStyle = 'rgba(219, 234, 254, 0.12)';
        
        // Bottom floor panel
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.fill();

        // Left side panel
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.lineTo(corners[7].x, corners[7].y);
        ctx.lineTo(corners[4].x, corners[4].y);
        ctx.closePath();
        ctx.fill();
      }
    };

    // Draw back part of container first
    drawWireframe(true);

    // List of cargo blocks to render
    interface Box3D {
      id: string;
      index: number;
      name: string;
      color: string;
      p0: { x: number; y: number; z: number }; // min corner
      p1: { x: number; y: number; z: number }; // max corner
      avgDepth: number;
    }

    // High performance optimization: if we have lots of boxes (e.g. up to 25k),
    // we only need to draw the outer shell because interior boxes are fully obscured.
    let itemsToDraw = items.slice(0, loadingStep)
      .map((item) => {
        const override = manualOverrides[item.id];
        return override ? { ...item, position: override } : item;
      })
      .filter((item) => !removedItemIds.has(item.id));

    if (itemsToDraw.length > 800) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (const item of itemsToDraw) {
        const p = item.position;
        if (p.x < minX) minX = p.x;
        if (p.x + p.l > maxX) maxX = p.x + p.l;
        if (p.y < minY) minY = p.y;
        if (p.y + p.w > maxY) maxY = p.y + p.w;
        if (p.z < minZ) minZ = p.z;
        if (p.z + p.h > maxZ) maxZ = p.z + p.h;
      }

      itemsToDraw = itemsToDraw.filter((item, index) => {
        if (index === hoveredIndex || index < 10) return true;
        const p = item.position;
        const margin = 1; // 1 cm tolerance
        const isOuter = 
          Math.abs(p.x - minX) < margin || 
          Math.abs((p.x + p.l) - maxX) < margin ||
          Math.abs(p.y - minY) < margin || 
          Math.abs((p.y + p.w) - maxY) < margin ||
          Math.abs(p.z - minZ) < margin || 
          Math.abs((p.z + p.h) - maxZ) < margin;
        return isOuter;
      });
    }

    const boxes: Box3D[] = itemsToDraw.map((item, index) => {
      const p = item.position;
      const x0 = p.x;
      const y0 = p.y;
      const z0 = p.z;
      const x1 = p.x + p.l;
      const y1 = p.y + p.w;
      const z1 = p.z + p.h;

      // Project center to compute depth for sorting
      const centerProj = project((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

      return {
        id: item.id,
        index,
        name: item.name,
        color: item.color,
        p0: { x: x0, y: y0, z: z0 },
        p1: { x: x1, y: y1, z: z1 },
        avgDepth: centerProj.depth
      };
    });

    // Sort boxes by depth (painters algorithm: back to front)
    boxes.sort((a, b) => b.avgDepth - a.avgDepth);

    // Draw sorted boxes
    boxes.forEach((box) => {
      const isSelected = box.id === selectedItemId;
      const isHovered = box.id === hoveredItemId || box.index === hoveredIndex;

      // 8 corners of the box
      const corners = [
        project(box.p0.x, box.p0.y, box.p0.z), // 0
        project(box.p1.x, box.p0.y, box.p0.z), // 1
        project(box.p1.x, box.p1.y, box.p0.z), // 2
        project(box.p0.x, box.p1.y, box.p0.z), // 3
        project(box.p0.x, box.p0.y, box.p1.z), // 4
        project(box.p1.x, box.p0.y, box.p1.z), // 5
        project(box.p1.x, box.p1.y, box.p1.z), // 6
        project(box.p0.x, box.p1.y, box.p1.z), // 7
      ];

      // Define 6 faces with indices of corners
      const faces = [
        { indices: [0, 1, 2, 3], norm: { x: 0, y: 0, z: -1 }, name: 'bottom' },
        { indices: [4, 5, 6, 7], norm: { x: 0, y: 0, z: 1 }, name: 'top' },
        { indices: [0, 1, 5, 4], norm: { x: 0, y: -1, z: 0 }, name: 'front' },
        { indices: [1, 2, 6, 5], norm: { x: 1, y: 0, z: 0 }, name: 'right' },
        { indices: [2, 3, 7, 6], norm: { x: 0, y: 1, z: 0 }, name: 'back' },
        { indices: [3, 0, 4, 7], norm: { x: -1, y: 0, z: 0 }, name: 'left' }
      ];

      faces.forEach((face) => {
        // Simple backface culling to only draw visible faces
        // We compute 2D polygon path and fill it
        ctx.beginPath();
        ctx.moveTo(corners[face.indices[0]].x, corners[face.indices[0]].y);
        for (let i = 1; i < 4; i++) {
          ctx.lineTo(corners[face.indices[i]].x, corners[face.indices[i]].y);
        }
        ctx.closePath();

        // Calculate face base color
        let faceColor = box.color;
        // Apply slight shading depending on face orientation for depth perception
        if (face.name === 'top') {
          faceColor = adjustColorBrightness(box.color, 15);
        } else if (face.name === 'front' || face.name === 'left') {
          faceColor = adjustColorBrightness(box.color, -10);
        } else {
          faceColor = adjustColorBrightness(box.color, -25);
        }

        if (isSelected) {
          ctx.fillStyle = 'rgba(20, 184, 166, 0.8)'; // bright semi-translucent teal for active edit
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.8)'; // bright semi-translucent red for hover
        } else {
          ctx.fillStyle = `${faceColor}dd`; // normal shaded color
        }
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#14b8a6' : (isHovered ? '#ef4444' : '#1e293b');
        ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 0.5);
        ctx.stroke();
      });
    });

    // Draw front wireframe of container last so it doesn't get fully obscured
    drawWireframe(false);
  };

  const draw2DView = (ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) => {
    ctx.save();
    
    // Draw background grid
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const pad = 60;
    ctx.translate(pad, pad);

    let displayW = 0;
    let displayH = 0;
    let labelX = '';
    let labelY = '';

    if (viewMode === 'top') {
      displayW = containerLength;
      displayH = containerWidth;
      labelX = 'Length (X)';
      labelY = 'Width (Y)';
    } else if (viewMode === 'side') {
      displayW = containerLength;
      displayH = containerHeight;
      labelX = 'Length (X)';
      labelY = 'Height (Z)';
    } else { // front
      displayW = containerWidth;
      displayH = containerHeight;
      labelX = 'Width (Y)';
      labelY = 'Height (Z)';
    }

    const scaleFitW = (width - pad * 2) / displayW;
    const scaleFitH = (height - pad * 2) / displayH;
    const optimalScale = Math.min(scaleFitW, scaleFitH);

    // Draw container outline
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, displayW * optimalScale, displayH * optimalScale);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, 0, displayW * optimalScale, displayH * optimalScale);

    // Draw ruler markings
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText(`0 cm`, -10, -10);
    ctx.fillText(`${displayW} cm`, displayW * optimalScale - 15, -10);
    ctx.fillText(`${displayH} cm`, -45, displayH * optimalScale + 4);

    // Label axis
    ctx.fillText(labelX, displayW * optimalScale / 2 - 20, -20);
    ctx.save();
    ctx.translate(-40, displayH * optimalScale / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(labelY, -20, 0);
    ctx.restore();

    // Render cargo projection on 2D planes
    let itemsToDraw = items.slice(0, loadingStep)
      .map((item) => {
        const override = manualOverrides[item.id];
        return override ? { ...item, position: override } : item;
      })
      .filter((item) => !removedItemIds.has(item.id));

    if (viewMode === 'top') {
      itemsToDraw = [...itemsToDraw].sort((a, b) => {
        const azTop = a.position.z + a.position.h;
        const bzTop = b.position.z + b.position.h;
        return azTop - bzTop;
      });
    }

    itemsToDraw.forEach((item, index) => {
      let rectX = 0;
      let rectY = 0;
      let rectW = 0;
      let rectH = 0;

      const p = item.position;

      if (viewMode === 'top') {
        rectX = p.x;
        rectY = p.y;
        rectW = p.l;
        rectH = p.w;
      } else if (viewMode === 'side') {
        rectX = p.x;
        rectY = containerHeight - p.z - p.h; // invert Y for standard math vs canvas coordinate
        rectW = p.l;
        rectH = p.h;
      } else { // front
        rectX = p.y;
        rectY = containerHeight - p.z - p.h;
        rectW = p.w;
        rectH = p.h;
      }

      const isSelected = item.id === selectedItemId;
      const isHovered = item.id === hoveredItemId || index === hoveredIndex;

      if (isSelected) {
        ctx.fillStyle = viewMode === 'top' ? 'rgba(20, 184, 166, 1.0)' : 'rgba(20, 184, 166, 0.8)'; // teal glow
      } else if (isHovered) {
        ctx.fillStyle = viewMode === 'top' ? 'rgba(239, 68, 68, 1.0)' : 'rgba(239, 68, 68, 0.8)'; // red hover
      } else {
        ctx.fillStyle = viewMode === 'top' ? item.color : `${item.color}cc`;
      }
      ctx.fillRect(rectX * optimalScale, rectY * optimalScale, rectW * optimalScale, rectH * optimalScale);
      
      ctx.strokeStyle = isSelected ? '#14b8a6' : (isHovered ? '#ef4444' : '#0f172a');
      ctx.lineWidth = isSelected ? 3.5 : (isHovered ? 2.5 : 0.75);
      ctx.strokeRect(rectX * optimalScale, rectY * optimalScale, rectW * optimalScale, rectH * optimalScale);

      // Box text label if big enough
      if (rectW * optimalScale > 40 && rectH * optimalScale > 15) {
        ctx.fillStyle = isSelected ? '#ffffff' : '#0f172a';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(
          `${index + 1}`,
          rectX * optimalScale + 4,
          rectY * optimalScale + 11
        );
      }
    });

    ctx.restore();
  };

  // Helper utility to adjust shade of colors for 3D faces
  const adjustColorBrightness = (hex: string, percent: number): string => {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) {
      hex = hex.replace(/(.)/g, '$1$1');
    }
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);

    r = Math.min(255, Math.max(0, r + percent));
    g = Math.min(255, Math.max(0, g + percent));
    b = Math.min(255, Math.max(0, b + percent));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  return (
    <div id="loading_visualizer_container" className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
            <Eye className="w-5 h-5 text-teal-600" />
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isPalletMode 
              ? `ความจุสูงสุดของพาเลท (${containerLength} x ${containerWidth} x ${containerHeight} ซม.)` 
              : `ขนาดตู้คอนเทนเนอร์ (${containerLength} x ${containerWidth} x ${containerHeight} ซม.)`}
          </p>
        </div>

        {/* View Mode Selectors */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-stretch sm:self-auto justify-center">
          <button
            onClick={() => setViewMode('3d')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === '3d' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            3D Perspective
          </button>
          <button
            onClick={() => setViewMode('top')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === 'top' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Top (X-Y)
          </button>
          <button
            onClick={() => setViewMode('side')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === 'side' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Side (X-Z)
          </button>
          <button
            onClick={() => setViewMode('front')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === 'front' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Front (Y-Z)
          </button>
        </div>
      </div>

      {/* Direct Pallet Pattern Selection inside Visualizer */}
      {isPalletMode && patternTypePreference && setPatternTypePreference && (
        <div className="mb-4 bg-teal-50/20 border border-teal-100/30 p-3 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">
              เลือกลายการจัดเรียงบนพาเลท (Pallet Pattern)
            </span>
            <span className="text-[9px] text-slate-500 block leading-tight">
              เลือกเพื่อเปลี่ยนแพทเทิร์นการจัดวางกล่องสินค้าบนพาเลทแบบเรียลไทม์
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'auto', name: 'Auto (ดีที่สุด)' },
              { id: 'block', name: 'Block' },
              { id: 'brick', name: 'Brick' },
              { id: 'pinwheel', name: 'Pinwheel' },
              { id: 'split_row', name: 'Split Row' },
              { id: 'architectural', name: 'Architectural' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPatternTypePreference(p.id)}
                className={`px-2.5 py-1 text-[11px] rounded-lg border font-semibold transition cursor-pointer ${
                  patternTypePreference === p.id
                    ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rendering Stage */}
      <div className="relative bg-slate-50 border border-slate-100 rounded-xl overflow-hidden flex justify-center items-center">
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          className={`max-w-full h-auto ${viewMode === '3d' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
          onMouseMove={(e) => {
            if (viewMode === '3d') return;
            const match = getItemAtMouse(e);
            if (match) {
              setHoveredItemId(match.item.id);
              setHoveredIndex(match.index);
            } else {
              setHoveredItemId(null);
              setHoveredIndex(null);
            }
          }}
          onClick={(e) => {
            if (viewMode === '3d') return;
            const match = getItemAtMouse(e);
            if (match) {
              setSelectedItemId(match.item.id);
            } else {
              setSelectedItemId(null);
            }
          }}
          onMouseDown={(e) => {
            if (viewMode !== '3d') return;
            const startX = e.clientX;
            const startY = e.clientY;
            const startYaw = yaw;
            const startPitch = pitch;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const dx = moveEvent.clientX - startX;
              const dy = moveEvent.clientY - startY;
              setYaw(startYaw + dx * 0.5);
              setPitch(Math.min(85, Math.max(5, startPitch - dy * 0.5)));
            };

            const handleMouseUp = () => {
              window.removeEventListener('mousemove', handleMouseMove);
              window.removeEventListener('mouseup', handleMouseUp);
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
          }}
        />

        {/* 3D Interaction overlay controls */}
        {viewMode === '3d' && (
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <button
              onClick={() => setYaw((y) => y + 15)}
              className="p-2 bg-white hover:bg-slate-50 rounded-lg shadow-sm border border-slate-100 text-slate-600 hover:text-teal-600 transition"
              title="หมุนมุมมอง"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              className="p-2 bg-white hover:bg-slate-50 rounded-lg shadow-sm border border-slate-100 text-slate-600 hover:text-teal-600 transition"
              title="ขยาย"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              className="p-2 bg-white hover:bg-slate-50 rounded-lg shadow-sm border border-slate-100 text-slate-600 hover:text-teal-600 transition"
              title="ย่อ"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="absolute bottom-4 left-4 text-[10px] text-slate-400 font-mono pointer-events-none bg-white/70 px-2 py-1 rounded">
          {viewMode === '3d' ? '💡 คลิกค้างแล้วลากเพื่อหมุนมุมมอง 3 มิติ' : 'ดูรูปแปลนแบบ 2 มิติ'}
        </div>
      </div>

      {/* Manual Layout Customizer Controls */}
      {viewMode !== '3d' && (
        <div className="mt-4 p-4 bg-white border border-slate-200/60 rounded-xl shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              โหมดปรับแต่งโครงสร้างรายชิ้น (Manual 2D Plan Customizer)
            </h4>
            {(Object.keys(manualOverrides).length > 0 || removedItemIds.size > 0) && (
              <button
                type="button"
                onClick={() => {
                  setManualOverrides({});
                  setRemovedItemIds(new Set());
                  setSelectedItemId(null);
                }}
                className="text-[10px] text-rose-600 hover:text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition"
              >
                รีเซ็ตการปรับแต่งทั้งหมด (Reset All)
              </button>
            )}
          </div>

          {selectedItemId ? (
            (() => {
              const selectedItem = items.find(item => item.id === selectedItemId);
              if (!selectedItem) return null;
              const currentPos = manualOverrides[selectedItemId] || selectedItem.position;

              return (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Selected Box Details */}
                  <div className="md:col-span-4 bg-slate-50/50 p-3 rounded-lg border border-slate-100 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: selectedItem.color }} />
                        <span className="text-xs font-bold text-slate-700">
                          {selectedItem.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        ID: {selectedItem.id}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 text-[11px] font-mono text-slate-600 border-t border-slate-100 pt-2">
                      <div className="text-slate-400">พิกัดปัจจุบัน (Coordinate):</div>
                      <div className="grid grid-cols-3 gap-1 text-center font-bold text-teal-800 bg-teal-50/50 py-1 rounded">
                        <span>X: {currentPos.x}</span>
                        <span>Y: {currentPos.y}</span>
                        <span>Z: {currentPos.z}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        ขนาด: กว้าง {currentPos.w} x ยาว {currentPos.l} x สูง {currentPos.h} ซม.
                      </div>
                    </div>
                  </div>

                  {/* Positioning Nudge Control Buttons */}
                  <div className="md:col-span-8 flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      
                      {/* Nudge X */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 block mb-1">ขยับตามแนวยาว (Nudge Length - X):</span>
                        <div className="flex gap-1">
                          {[-10, -1, 1, 10].map(val => (
                            <button
                              key={`x-${val}`}
                              type="button"
                              onClick={() => {
                                const newPos = { ...currentPos, x: Math.max(0, currentPos.x + val) };
                                setManualOverrides({ ...manualOverrides, [selectedItemId]: newPos });
                              }}
                              className="flex-1 py-1 text-xs font-mono font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded transition border border-slate-200"
                            >
                              {val > 0 ? `+${val}` : val}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Nudge Y */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 block mb-1">ขยับตามแนวกว้าง (Nudge Width - Y):</span>
                        <div className="flex gap-1">
                          {[-10, -1, 1, 10].map(val => (
                            <button
                              key={`y-${val}`}
                              type="button"
                              onClick={() => {
                                const newPos = { ...currentPos, y: Math.max(0, currentPos.y + val) };
                                setManualOverrides({ ...manualOverrides, [selectedItemId]: newPos });
                              }}
                              className="flex-1 py-1 text-xs font-mono font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded transition border border-slate-200"
                            >
                              {val > 0 ? `+${val}` : val}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Nudge Z */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 block mb-1">ขยับระดับชั้นความสูง (Nudge Height - Z):</span>
                        <div className="flex gap-1">
                          {[-10, -1, 1, 10].map(val => (
                            <button
                              key={`z-${val}`}
                              type="button"
                              onClick={() => {
                                const newPos = { ...currentPos, z: Math.max(0, currentPos.z + val) };
                                setManualOverrides({ ...manualOverrides, [selectedItemId]: newPos });
                              }}
                              className="flex-1 py-1 text-xs font-mono font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded transition border border-slate-200"
                            >
                              {val > 0 ? `+${val}` : val}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col justify-end gap-1">
                        <span className="text-[10px] font-bold text-slate-500 block mb-1">การปรับแต่งด่วน (Quick Actions):</span>
                        <div className="flex gap-1.5">
                          {/* Rotate */}
                          <button
                            type="button"
                            onClick={() => {
                              const newPos = {
                                ...currentPos,
                                l: currentPos.w,
                                w: currentPos.l
                              };
                              setManualOverrides({ ...manualOverrides, [selectedItemId]: newPos });
                            }}
                            className="flex-1 py-1.5 text-[11px] font-bold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg transition"
                            title="สลับมิติความยาวกับความกว้าง (หมุน 90 องศา)"
                          >
                            หมุน 90 องศา
                          </button>
                          
                          {/* Remove */}
                          <button
                            type="button"
                            onClick={() => {
                              const newSet = new Set(removedItemIds);
                              newSet.add(selectedItemId);
                              setRemovedItemIds(newSet);
                              setSelectedItemId(null);
                            }}
                            className="flex-1 py-1.5 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition"
                          >
                            ลบออกชั่วคราว
                          </button>

                          {/* Reset Individual */}
                          {manualOverrides[selectedItemId] && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextOverrides = { ...manualOverrides };
                                delete nextOverrides[selectedItemId];
                                setManualOverrides(nextOverrides);
                              }}
                              className="px-2.5 py-1.5 text-[11px] font-bold bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg transition"
                            >
                              รีเซ็ตกล่อง
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              💡 คลิกเลือกกล่องสินค้าในหน้าแปลน 2D (Top / Side / Front View) เพื่อปรับแก้ไขตำแหน่งแบบแมนนวลได้ทันที
            </div>
          )}
        </div>
      )}

      {/* Step-by-Step Loading Sequencer */}
      {items.length > 0 && (
        <div className="mt-5 bg-teal-50/20 p-4.5 rounded-xl border border-teal-100/50">
          {loadingSteps && loadingSteps.length > 0 && activeStepIdx !== undefined && onStepChange ? (
            // Controlled step-by-step mode (Highly integrated with loading Steps)
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                <div>
                  <span className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                    ลำดับขั้นตอนการจัดเรียงตู้อย่างเป็นระบบ (Step-by-Step Loading Sequencer)
                  </span>
                  {loadingSteps[activeStepIdx] && (
                    <p className="text-[11px] text-slate-600 mt-1 font-medium leading-relaxed">
                      ขั้นตอนที่ {activeStepIdx + 1}/{loadingSteps.length}: <span className="text-teal-700 font-bold">{loadingSteps[activeStepIdx].itemName}</span> (บรรจุ {loadingSteps[activeStepIdx].quantity} {isPalletMode ? 'พาเลท' : 'ชิ้น'})
                    </p>
                  )}
                </div>

                {/* Autoplay & Playback speed controls */}
                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-all border ${
                      isPlaying 
                        ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' 
                        : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 stroke-[2.5]" />
                        หยุดชั่วคราว
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        เล่นอัตโนมัติ
                      </>
                    )}
                  </button>

                  <select
                    value={playSpeed}
                    onChange={(e) => setPlaySpeed(Number(e.target.value))}
                    className="text-[11px] font-semibold py-1 px-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-hidden focus:ring-1 focus:ring-teal-500 cursor-pointer"
                  >
                    <option value={2000}>ช้า (2 วินาที)</option>
                    <option value={1000}>ปกติ (1 วินาที)</option>
                    <option value={500}>เร็ว (0.5 วินาที)</option>
                  </select>

                  <div className="flex gap-1 border-l pl-2 border-slate-200">
                    <button
                      type="button"
                      disabled={activeStepIdx === 0}
                      onClick={() => onStepChange(0)}
                      className="p-1 bg-white border border-slate-200 text-[10px] font-medium rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                      title="เริ่มแรก"
                    >
                      แรกสุด
                    </button>
                    <button
                      type="button"
                      disabled={activeStepIdx === 0}
                      onClick={() => onStepChange(activeStepIdx - 1)}
                      className="p-1 px-2 bg-white border border-slate-200 text-[10px] font-bold rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                      title="ก่อนหน้า"
                    >
                      ย้อน
                    </button>
                    <button
                      type="button"
                      disabled={activeStepIdx === loadingSteps.length - 1}
                      onClick={() => onStepChange(activeStepIdx + 1)}
                      className="p-1 px-2 bg-white border border-slate-200 text-[10px] font-bold rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                      title="ถัดไป"
                    >
                      ถัดไป
                    </button>
                    <button
                      type="button"
                      disabled={activeStepIdx === loadingSteps.length - 1}
                      onClick={() => onStepChange(loadingSteps.length - 1)}
                      className="p-1 bg-white border border-slate-200 text-[10px] font-medium rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                      title="แสดงทั้งหมด"
                    >
                      ทั้งหมด
                    </button>
                  </div>
                </div>
              </div>

              {/* Slider for Steps */}
              <input
                type="range"
                min={0}
                max={loadingSteps.length - 1}
                value={activeStepIdx}
                onChange={(e) => onStepChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
              />

              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1.5">
                <span>เริ่มแรก (ตู้ว่าง)</span>
                <span>จำนวนเสร็จสมบูรณ์: {activeStepIdx + 1} / {loadingSteps.length} ขั้นตอน</span>
              </div>
            </div>
          ) : (
            // Fallback: Box-by-box slide granular control
            <div>
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                    ลำดับขั้นตอนการจัดเรียงสินค้า ({loadingStep} / {items.length} ชิ้น)
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`px-2 py-1 text-[10px] font-semibold rounded transition flex items-center gap-1 border ${
                      isPlaying 
                        ? 'bg-amber-50 text-amber-700 border-amber-200' 
                        : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                    }`}
                  >
                    {isPlaying ? 'หยุด' : 'เล่นแอนิเมชัน'}
                  </button>
                  <button
                    disabled={loadingStep === 0}
                    onClick={() => setLoadingStep(0)}
                    className="px-2 py-1 bg-white border border-slate-200 text-[10px] font-medium rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    เริ่มแรก
                  </button>
                  <button
                    disabled={loadingStep === 0}
                    onClick={() => setLoadingStep((s) => Math.max(0, s - 1))}
                    className="px-2.5 py-1 bg-white border border-slate-200 text-[10px] font-medium rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    disabled={loadingStep === items.length}
                    onClick={() => setLoadingStep((s) => Math.min(items.length, s + 1))}
                    className="px-2.5 py-1 bg-white border border-slate-200 text-[10px] font-medium rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    ถัดไป
                  </button>
                  <button
                    disabled={loadingStep === items.length}
                    onClick={() => setLoadingStep(items.length)}
                    className="px-2 py-1 bg-white border border-slate-200 text-[10px] font-medium rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    ทั้งหมด
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={items.length}
                value={loadingStep}
                onChange={(e) => setLoadingStep(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>เริ่มต้นตู้ว่าง</span>
                <span>เรียงครบทุกกล่อง</span>
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  );
};
