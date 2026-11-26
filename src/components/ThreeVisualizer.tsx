import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Eye, Sliders, Compass, Maximize2, Layers, Crosshair } from 'lucide-react';

export interface VisualBox {
  x: number; // in mm (Length along container)
  y: number; // in mm (Height vertical)
  z: number; // in mm (Width across container)
  sx: number; // length in mm
  sy: number; // height in mm
  sz: number; // width in mm
  wt?: number; // weight in kg
  name?: string;
}

export interface CoGData {
  xMm: number;
  yMm: number;
  zMm: number;
  xPct: number; // 0-100 along length
  yPct: number; // 0-100 along height
  zPct: number; // 0-100 along width
  isBalanced: boolean;
  statusText: string;
}

interface ThreeVisualizerProps {
  container: { l: number; w: number; h: number; maxPay?: number }; // in mm
  layers: { pos: VisualBox[]; color: number; gap?: number; name?: string }[];
  cog?: CoGData;
}

const getOptimalR = (
  view: '3d' | 'top' | 'side' | 'front',
  containerL: number,
  containerW: number,
  containerH: number,
  aspect: number
) => {
  const S = 100;
  const cL = containerL / S;
  const cW = containerW / S;
  const cH = containerH / S;

  const fovRad = (42 * Math.PI) / 180;
  const tanHalfFov = Math.tan(fovRad / 2);

  let dx = 0;
  let dy = 0;

  switch (view) {
    case 'top':
      dx = cL;
      dy = cW;
      break;
    case 'side':
      dx = cL;
      dy = cH;
      break;
    case 'front':
      dx = cW;
      dy = cH;
      break;
    case '3d':
    default:
      dx = Math.max(cL, cW) * 1.25;
      dy = Math.max(cW, cH) * 1.25;
      break;
  }

  const dVertical = dy / (2 * tanHalfFov);
  const dHorizontal = dx / (2 * tanHalfFov * aspect);

  const multiplier = view === '3d' ? 1.32 : 1.55;
  const optimal = Math.max(dVertical, dHorizontal) * multiplier;
  return Math.max(10, Math.min(1000, optimal));
};

export const ThreeVisualizer: React.FC<ThreeVisualizerProps> = ({ container, layers, cog }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const instancedMeshesRef = useRef<THREE.InstancedMesh[]>([]);
  const guideMeshesRef = useRef<THREE.Object3D[]>([]);

  const [activeView, setActiveView] = useState<'3d' | 'top' | 'side' | 'front'>('3d');
  const activeViewRef = useRef(activeView);
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  // Camera orbit states
  const isDrag = useRef(false);
  const pm = useRef({ x: 0, y: 0 });
  const camSt = useRef({ theta: 0.88, phi: 1.08, r: 45 });
  const targetCamSt = useRef<{ theta: number; phi: number; r: number } | null>(null);
  const updCamRef = useRef<(() => void) | null>(null);

  // Visualizer Controls
  const [show3DGuides, setShow3DGuides] = useState<boolean>(true);
  const [showCoGMarker, setShowCoGMarker] = useState<boolean>(true);
  const [visualGap, setVisualGap] = useState<number>(2); // 2mm crisp seam by default
  const [showToolsDrawer, setShowToolsDrawer] = useState<boolean>(false);

  // Cargo Block Alignment & Nudge States
  const [xAlignment, setXAlignment] = useState<'front' | 'center' | 'back'>('front');
  const [zAlignment, setZAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [xNudge, setXNudge] = useState<number>(0);
  const [yNudge, setYNudge] = useState<number>(0);
  const [zNudge, setZNudge] = useState<number>(0);

  // Step-by-Step Loading Playback States
  const [stepProgress, setStepProgress] = useState<number>(100); // 0 to 100%
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Compute transformed layers (Alignment + Nudge)
  const transformedLayers = React.useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let hasBoxes = false;

    layers.forEach((layer) => {
      if (layer.pos && layer.pos.length > 0) {
        hasBoxes = true;
        for (let i = 0; i < layer.pos.length; i++) {
          const b = layer.pos[i];
          if (b.x < minX) minX = b.x;
          if (b.x + b.sx > maxX) maxX = b.x + b.sx;
          if (b.z < minZ) minZ = b.z;
          if (b.z + b.sz > maxZ) maxZ = b.z + b.sz;
          if (b.y < minY) minY = b.y;
          if (b.y + b.sy > maxY) maxY = b.y + b.sy;
        }
      }
    });

    if (!hasBoxes) return layers;

    const blockLength = maxX - minX;
    const blockWidth = maxZ - minZ;

    const baseOffsetX =
      xAlignment === 'center'
        ? (container.l - blockLength) / 2 - minX
        : xAlignment === 'back'
        ? container.l - blockLength - minX
        : -minX;

    const baseOffsetZ =
      zAlignment === 'center'
        ? (container.w - blockWidth) / 2 - minZ
        : zAlignment === 'right'
        ? container.w - blockWidth - minZ
        : -minZ;

    const limitX = Math.max(500, container.l * 0.25);
    const limitY = Math.max(500, container.h * 0.25);
    const limitZ = Math.max(500, container.w * 0.25);

    const finalOffsetX = Math.max(-minX - limitX, Math.min(container.l - maxX + limitX, baseOffsetX + xNudge));
    const finalOffsetY = Math.max(-minY - limitY, Math.min(container.h - maxY + limitY, yNudge));
    const finalOffsetZ = Math.max(-minZ - limitZ, Math.min(container.w - maxZ + limitZ, baseOffsetZ + zNudge));

    if (finalOffsetX === 0 && finalOffsetY === 0 && finalOffsetZ === 0) return layers;

    return layers.map((layer) => {
      if (!layer.pos) return layer;
      return {
        ...layer,
        pos: layer.pos.map((b) => ({
          ...b,
          x: b.x + finalOffsetX,
          y: b.y + finalOffsetY,
          z: b.z + finalOffsetZ,
        })),
      };
    });
  }, [layers, container, xAlignment, zAlignment, xNudge, yNudge, zNudge]);

  // Group boxes into logical Loading Steps (sorted back-to-front X, bottom-to-top Y, left-to-right Z)
  const totalBoxesCount = React.useMemo(() => {
    return transformedLayers.reduce((acc, l) => acc + (l.pos ? l.pos.length : 0), 0);
  }, [transformedLayers]);

  // Reset stepProgress to 100% whenever layers change
  useEffect(() => {
    setStepProgress(100);
    setIsPlaying(false);
  }, [layers, container]);

  // Step-by-step animation interval
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setStepProgress((prev) => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return Math.min(100, prev + 2);
      });
    }, 80);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Filter layers by current stepProgress
  const visibleLayers = React.useMemo(() => {
    if (stepProgress >= 100) return transformedLayers;
    if (stepProgress <= 0) return transformedLayers.map((l) => ({ ...l, pos: [] }));

    return transformedLayers.map((l) => {
      if (!l.pos || l.pos.length === 0) return l;
      // Sort boxes in loading sequence: Y (bottom to top layers), then X (front to back), then Z (left to right)
      const sorted = [...l.pos].sort((a, b) => {
        if (Math.abs(a.y - b.y) > 5) return a.y - b.y;
        if (Math.abs(a.x - b.x) > 5) return a.x - b.x;
        return a.z - b.z;
      });
      const takeCount = Math.max(1, Math.floor((sorted.length * stepProgress) / 100));
      return {
        ...l,
        pos: sorted.slice(0, takeCount),
      };
    });
  }, [transformedLayers, stepProgress]);

  const visibleBoxCount = React.useMemo(() => {
    return visibleLayers.reduce((acc, l) => acc + (l.pos ? l.pos.length : 0), 0);
  }, [visibleLayers]);

  // Remaining space metrics
  const clearanceData = React.useMemo(() => {
    let maxPackedX = 0;
    let maxPackedY = 0;
    let maxPackedZ = 0;
    let hasBoxes = false;

    transformedLayers.forEach((layer) => {
      if (layer.pos) {
        for (let i = 0; i < layer.pos.length; i++) {
          hasBoxes = true;
          const b = layer.pos[i];
          if (b.x + b.sx > maxPackedX) maxPackedX = b.x + b.sx;
          if (b.y + b.sy > maxPackedY) maxPackedY = b.y + b.sy;
          if (b.z + b.sz > maxPackedZ) maxPackedZ = b.z + b.sz;
        }
      }
    });

    const remLength = Math.max(0, container.l - maxPackedX);
    const remHeight = Math.max(0, container.h - maxPackedY);
    const remWidth = Math.max(0, container.w - maxPackedZ);

    return {
      maxPackedX,
      maxPackedY,
      maxPackedZ,
      remLength,
      remHeight,
      remWidth,
      remLengthCm: Math.round(remLength / 10),
      remHeightCm: Math.round(remHeight / 10),
      remWidthCm: Math.round(remWidth / 10),
      hasBoxes,
    };
  }, [transformedLayers, container]);

  // Initialize Three.js WebGL Scene (runs only when container dimensions change)
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth || 800;
    const H = el.clientHeight || 500;
    const aspect = W / H;

    camSt.current.r = getOptimalR(activeViewRef.current, container.l, container.w, container.h, aspect);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120); // Rich slate-950 background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Studio Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xfffbeb, 0.95);
    sun.position.set(14, 22, 12);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.35);
    fill.position.set(-12, 8, -10);
    scene.add(fill);

    const S = 100;
    const cL = container.l / S;
    const cH = container.h / S;
    const cW = container.w / S;

    // Translucent Container Walls
    const cGeo = new THREE.BoxGeometry(cL, cH, cW);
    const wall = new THREE.Mesh(
      cGeo,
      new THREE.MeshPhongMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide,
      })
    );
    wall.position.set(cL / 2, cH / 2, cW / 2);
    scene.add(wall);

    // Crisp Container Wireframe
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cGeo),
      new THREE.LineBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.75,
      })
    );
    edges.position.set(cL / 2, cH / 2, cW / 2);
    scene.add(edges);

    // Container Floor Deck with subtle grid
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(cL, 0.05, cW),
      new THREE.MeshPhongMaterial({ color: 0x1e293b })
    );
    floor.position.set(cL / 2, -0.025, cW / 2);
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(Math.max(cL, cW) * 1.4, 24, 0x334155, 0x1e293b);
    gridHelper.position.set(cL / 2, -0.06, cW / 2);
    scene.add(gridHelper);

    const updCam = () => {
      const { theta, phi, r } = camSt.current;
      camera.position.set(
        cL / 2 + r * Math.sin(phi) * Math.sin(theta),
        cH / 2 + r * Math.cos(phi),
        cW / 2 + r * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(cL / 2, cH / 2, cW / 2);
    };
    updCamRef.current = updCam;
    updCam();

    // Lightweight 60-FPS Animation Loop (Zero DOM queries!)
    let fId: number;
    const tick = () => {
      fId = requestAnimationFrame(tick);

      if (targetCamSt.current) {
        const current = camSt.current;
        const target = targetCamSt.current;
        const ease = 0.14;

        current.theta += (target.theta - current.theta) * ease;
        current.phi += (target.phi - current.phi) * ease;
        current.r += (target.r - current.r) * ease;

        if (
          Math.abs(target.theta - current.theta) < 0.001 &&
          Math.abs(target.phi - current.phi) < 0.001 &&
          Math.abs(target.r - current.r) < 0.01
        ) {
          current.theta = target.theta;
          current.phi = target.phi;
          current.r = target.r;
          targetCamSt.current = null;
        }
        updCam();
      }

      renderer.render(scene, camera);
    };
    tick();

    // Mouse / Touch Interaction
    const gxy = (e: MouseEvent | TouchEvent) => {
      if ('clientX' in e) return { x: e.clientX, y: e.clientY };
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: 0, y: 0 };
    };

    const onDn = (e: MouseEvent | TouchEvent) => {
      isDrag.current = true;
      pm.current = gxy(e);
      targetCamSt.current = null;
    };

    const onMv = (e: MouseEvent | TouchEvent) => {
      if (!isDrag.current) return;
      const { x, y } = gxy(e);
      camSt.current.theta -= (x - pm.current.x) * 0.007;
      camSt.current.phi = Math.max(0.08, Math.min(1.55, camSt.current.phi + (y - pm.current.y) * 0.007));
      pm.current = { x, y };
      updCam();
    };

    const onUp = () => {
      isDrag.current = false;
    };

    const onWh = (e: WheelEvent) => {
      e.preventDefault();
      camSt.current.r = Math.max(6, Math.min(250, camSt.current.r + e.deltaY * 0.025));
      updCam();
      targetCamSt.current = null;
    };

    const cv = renderer.domElement;
    cv.addEventListener('mousedown', onDn);
    cv.addEventListener('touchstart', onDn, { passive: true });
    window.addEventListener('mousemove', onMv);
    window.addEventListener('touchmove', onMv, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    cv.addEventListener('wheel', onWh, { passive: false });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          updCam();
        }
      }
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(fId);
      cv.removeEventListener('mousedown', onDn);
      cv.removeEventListener('touchstart', onDn);
      window.removeEventListener('mousemove', onMv);
      window.removeEventListener('touchmove', onMv);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
      cv.removeEventListener('wheel', onWh);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(cv)) el.removeChild(cv);
    };
  }, [container.l, container.w, container.h]);

  // Update InstancedMeshes, Merged Outer-Shell Edges, Clearance Guides & CoG 3D Marker
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Cleanup old meshes
    instancedMeshesRef.current.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    });
    instancedMeshesRef.current = [];

    guideMeshesRef.current.forEach((obj) => {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    guideMeshesRef.current = [];

    const S = 100;
    const geo = new THREE.BoxGeometry(1, 1, 1);

    // 1. Render 3D Remaining Space Guides
    if (show3DGuides && clearanceData.hasBoxes) {
      const { maxPackedX, maxPackedY, maxPackedZ, remLength, remHeight, remWidth } = clearanceData;

      if (remLength > 50) {
        const frontGeo = new THREE.BoxGeometry(remLength / S, container.h / S, container.w / S);
        const frontMesh = new THREE.Mesh(
          frontGeo,
          new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
        );
        frontMesh.position.set((maxPackedX + remLength / 2) / S, container.h / 2 / S, container.w / 2 / S);
        scene.add(frontMesh);
        guideMeshesRef.current.push(frontMesh);

        const frontEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(frontGeo),
          new THREE.LineBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.65 })
        );
        frontEdges.position.copy(frontMesh.position);
        scene.add(frontEdges);
        guideMeshesRef.current.push(frontEdges);
      }

      if (remHeight > 50) {
        const hW = maxPackedX > 0 ? maxPackedX / S : container.l / S;
        const heightGeo = new THREE.BoxGeometry(hW, remHeight / S, container.w / S);
        const heightEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(heightGeo),
          new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.45 })
        );
        heightEdges.position.set(
          (maxPackedX > 0 ? maxPackedX / 2 : container.l / 2) / S,
          (maxPackedY + remHeight / 2) / S,
          container.w / 2 / S
        );
        scene.add(heightEdges);
        guideMeshesRef.current.push(heightEdges);
      }

      if (remWidth > 50) {
        const hW = maxPackedX > 0 ? maxPackedX / S : container.l / S;
        const hH = maxPackedY > 0 ? maxPackedY / S : container.h / S;
        const widthGeo = new THREE.BoxGeometry(hW, hH, remWidth / S);
        const widthEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(widthGeo),
          new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.45 })
        );
        widthEdges.position.set(
          (maxPackedX > 0 ? maxPackedX / 2 : container.l / 2) / S,
          (maxPackedY > 0 ? maxPackedY / 2 : container.h / 2) / S,
          (maxPackedZ + remWidth / 2) / S
        );
        scene.add(widthEdges);
        guideMeshesRef.current.push(widthEdges);
      }
    }

    // 2. Render Center of Gravity (CoG) 3D Indicator Sphere & Crosshair Axes
    if (showCoGMarker && cog && clearanceData.hasBoxes) {
      const cogX = cog.xMm / S;
      const cogY = cog.yMm / S;
      const cogZ = cog.zMm / S;

      const sphereGeo = new THREE.SphereGeometry(0.45, 20, 20);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: cog.isBalanced ? 0x10b981 : 0xf43f5e,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.set(cogX, cogY, cogZ);
      sphereMesh.renderOrder = 999;
      scene.add(sphereMesh);
      guideMeshesRef.current.push(sphereMesh);

      // Crosshair lines projecting CoG onto container floor
      const linePts = [
        new THREE.Vector3(cogX, 0, cogZ),
        new THREE.Vector3(cogX, cogY, cogZ),
        new THREE.Vector3(0, 0.02, cogZ),
        new THREE.Vector3(container.l / S, 0.02, cogZ),
        new THREE.Vector3(cogX, 0.02, 0),
        new THREE.Vector3(cogX, 0.02, container.w / S),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({
        color: cog.isBalanced ? 0x34d399 : 0xfb7185,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
      });
      const cogLines = new THREE.LineSegments(lineGeo, lineMat);
      cogLines.renderOrder = 998;
      scene.add(cogLines);
      guideMeshesRef.current.push(cogLines);
    }

    // 3. Render Cargo Layers using High-Speed InstancedMesh + Single Merged Edge Buffer
    const edgePositions: number[] = [];
    // 12 edges of a unit cube [-0.5, 0.5]
    const unitEdges = [
      [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5, 0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5, -0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5, -0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5, 0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, -0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5, -0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5, -0.5, 0.5, -0.5],
      [0.5, -0.5, -0.5, 0.5, 0.5, -0.5],
      [0.5, -0.5, 0.5, 0.5, 0.5, 0.5],
      [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5],
    ];

    visibleLayers.forEach((layer) => {
      const pos = layer.pos;
      if (!pos || pos.length === 0) return;

      const N = pos.length;
      const ec = new THREE.Color(layer.color);
      ec.r *= 0.15;
      ec.g *= 0.15;
      ec.b *= 0.15;

      const mat = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: ec,
        shininess: 25,
      });

      const mesh = new THREE.InstancedMesh(geo, mat, N);
      const dummy = new THREE.Object3D();
      const gap = visualGap === 0 ? 0 : layer.gap !== undefined ? layer.gap : visualGap;

      // Bounding box of this layer for outer-shell edge culling when N > 1200
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      const sizeCounts: Record<string, number> = {};
      const heightSet = new Set<number>();

      for (let i = 0; i < N; i++) {
        const p = pos[i];
        if (p.x < minX) minX = p.x;
        if (p.x + p.sx > maxX) maxX = p.x + p.sx;
        if (p.y < minY) minY = p.y;
        if (p.y + p.sy > maxY) maxY = p.y + p.sy;
        if (p.z < minZ) minZ = p.z;
        if (p.z + p.sz > maxZ) maxZ = p.z + p.sz;

        const sk = `${Math.round(p.sx)}x${Math.round(p.sz)}`;
        sizeCounts[sk] = (sizeCounts[sk] || 0) + 1;
        heightSet.add(Math.round(p.y));
      }

      let majoritySize = '';
      let maxCount = 0;
      for (const [sz, count] of Object.entries(sizeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          majoritySize = sz;
        }
      }

      const sortedHeights = Array.from(heightSet).sort((a, b) => a - b);
      const heightIndexMap = new Map<number, number>();
      sortedHeights.forEach((h, idx) => heightIndexMap.set(h, idx));

      const cullInteriorEdges = N > 1200;

      for (let i = 0; i < N; i++) {
        const p = pos[i];
        const cx = (p.x + p.sx / 2) / S;
        const cy = (p.y + p.sy / 2) / S;
        const cz = (p.z + p.sz / 2) / S;
        const sx = Math.max(0.01, (p.sx - gap) / S);
        const sy = Math.max(0.01, (p.sy - gap) / S);
        const sz = Math.max(0.01, (p.sz - gap) / S);

        dummy.position.set(cx, cy, cz);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const currentSizeKey = `${Math.round(p.sx)}x${Math.round(p.sz)}`;
        const isRotated = currentSizeKey !== majoritySize && majoritySize !== '';
        const layerIdx = heightIndexMap.get(Math.round(p.y)) ?? 0;
        const isOddLayer = layerIdx % 2 === 1;

        const baseColor = new THREE.Color(layer.color);
        if (isRotated) {
          if (layer.color === 0x14b8a6) {
            baseColor.setHex(0xf97316);
          } else if (layer.color === 0xd97706) {
            baseColor.setHex(0x38bdf8);
          } else {
            const hsl = { h: 0, s: 0, l: 0 };
            baseColor.getHSL(hsl);
            hsl.h = (hsl.h + 0.14) % 1.0;
            baseColor.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), hsl.l);
          }
        }

        if (isOddLayer) {
          const hsl = { h: 0, s: 0, l: 0 };
          baseColor.getHSL(hsl);
          hsl.l = Math.max(0.2, hsl.l * 0.8);
          baseColor.setHSL(hsl.h, hsl.s, hsl.l);
        }

        mesh.setColorAt(i, baseColor);

        // Add box edges to single merged buffer (outer shell only if N > 1200)
        const isOuter =
          !cullInteriorEdges ||
          Math.abs(p.x - minX) < 5 ||
          Math.abs(p.x + p.sx - maxX) < 5 ||
          Math.abs(p.y - minY) < 5 ||
          Math.abs(p.y + p.sy - maxY) < 5 ||
          Math.abs(p.z - minZ) < 5 ||
          Math.abs(p.z + p.sz - maxZ) < 5;

        if (isOuter) {
          for (let e = 0; e < 12; e++) {
            const ue = unitEdges[e];
            edgePositions.push(
              cx + ue[0] * sx,
              cy + ue[1] * sy,
              cz + ue[2] * sz,
              cx + ue[3] * sx,
              cy + ue[4] * sy,
              cz + ue[5] * sz
            );
          }
        }
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      instancedMeshesRef.current.push(mesh);
    });

    // Add single merged LineSegments for all box outlines (1 draw call instead of 10,000!)
    if (edgePositions.length > 0) {
      const mergedEdgeGeo = new THREE.BufferGeometry();
      mergedEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      const mergedEdgeMat = new THREE.LineBasicMaterial({
        color: 0x090d16,
        transparent: true,
        opacity: 0.65,
      });
      const mergedLines = new THREE.LineSegments(mergedEdgeGeo, mergedEdgeMat);
      scene.add(mergedLines);
      guideMeshesRef.current.push(mergedLines);
    }
  }, [visibleLayers, show3DGuides, showCoGMarker, visualGap, clearanceData, cog, container]);

  // Camera View Switcher (uses 3D camera angles for Top, Side, Front — smooth & zero lag!)
  const setCameraView = (view: '3d' | 'top' | 'side' | 'front') => {
    setActiveView(view);

    let targetTheta = 0.88;
    let targetPhi = 1.08;

    switch (view) {
      case '3d':
        targetTheta = 0.88;
        targetPhi = 1.08;
        break;
      case 'top':
        targetTheta = 0;
        targetPhi = 0.01;
        break;
      case 'side':
        targetTheta = Math.PI / 2;
        targetPhi = Math.PI / 2;
        break;
      case 'front':
        targetTheta = 0;
        targetPhi = Math.PI / 2;
        break;
    }

    const twoPi = Math.PI * 2;
    let diff = targetTheta - camSt.current.theta;
    diff = (((diff + Math.PI) % twoPi) + twoPi) % twoPi - Math.PI;
    camSt.current.theta = targetTheta - diff;

    const el = mountRef.current;
    const W = el?.clientWidth || 800;
    const H = el?.clientHeight || 500;
    const targetR = getOptimalR(view, container.l, container.w, container.h, W / H);

    targetCamSt.current = {
      theta: targetTheta,
      phi: targetPhi,
      r: targetR,
    };
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative select-none">
      {/* Main 3D WebGL Viewport */}
      <div className="flex-1 w-full h-full relative overflow-hidden">
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Top-Left Compact Clearance & CoG Badge */}
        <div className="absolute top-3 left-14 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-2 shadow-lg flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-slate-400">เหลือความยาวหน้าตู้:</span>
              <span className="font-mono font-bold text-orange-400">{clearanceData.remLengthCm} ซม.</span>
            </div>
            <div className="h-3 w-px bg-slate-800 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-slate-400">เหลือความกว้าง:</span>
              <span className="font-mono font-bold text-cyan-400">{clearanceData.remWidthCm} ซม.</span>
            </div>
            <div className="h-3 w-px bg-slate-800 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-400">เหลือความสูง:</span>
              <span className="font-mono font-bold text-emerald-400">{clearanceData.remHeightCm} ซม.</span>
            </div>
          </div>

          {cog && clearanceData.hasBoxes && (
            <div
              className={`bg-slate-900/90 backdrop-blur-md border rounded-xl px-3 py-2 shadow-lg flex items-center gap-2 text-[11px] ${
                cog.isBalanced ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'
              }`}
              title="จุดศูนย์ถ่วงของตู้คอนเทนเนอร์ (Center of Gravity X, Y, Z)"
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span className="font-bold">CoG:</span>
              <span className="font-mono text-[10px] text-slate-300">
                X:{cog.xPct.toFixed(0)}% · W:{cog.zPct.toFixed(0)}% · H:{cog.yPct.toFixed(0)}%
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  cog.isBalanced ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {cog.statusText}
              </span>
            </div>
          )}
        </div>

        {/* Top-Right View & Visual Settings Toolbar */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-lg flex items-center gap-1">
            {[
              { id: '3d', label: '3D Orbit' },
              { id: 'top', label: 'Top' },
              { id: 'side', label: 'Side' },
              { id: 'front', label: 'Front' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setCameraView(v.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  activeView === v.id
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowToolsDrawer((s) => !s)}
            className={`p-2 rounded-xl border backdrop-blur-md shadow-lg transition cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
              showToolsDrawer
                ? 'bg-teal-600 border-teal-500 text-white'
                : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
            title="ตั้งค่าการจัดวางและการแสดงผล 3D"
          >
            <Sliders className="w-4 h-4" />
            <span className="hidden md:inline text-[11px]">ปรับตำแหน่ง</span>
          </button>
        </div>

        {/* Collapsible Alignment & Visual Tools Popover */}
        {showToolsDrawer && (
          <div className="absolute top-14 right-3 z-30 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-3.5 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-teal-400" />
                ปรับตำแหน่ง & การแสดงผล 3D
              </span>
              <button
                type="button"
                onClick={() => {
                  setXAlignment('front');
                  setZAlignment('left');
                  setXNudge(0);
                  setYNudge(0);
                  setZNudge(0);
                }}
                className="text-[10px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
              >
                รีเซ็ตค่า
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">จัดตำแหน่งแนวลึก (Length Align)</span>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'front', label: 'ชิดในตู้' },
                  { id: 'center', label: 'กึ่งกลาง' },
                  { id: 'back', label: 'ชิดประตู' },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setXAlignment(b.id as any)}
                    className={`py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition ${
                      xAlignment === b.id
                        ? 'bg-teal-600 border-teal-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">จัดตำแหน่งแนวกว้าง (Width Align)</span>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'left', label: 'ชิดซ้าย' },
                  { id: 'center', label: 'กึ่งกลาง' },
                  { id: 'right', label: 'ชิดขวา' },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setZAlignment(b.id as any)}
                    className={`py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition ${
                      zAlignment === b.id
                        ? 'bg-teal-600 border-teal-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-300">แสดงกรอบพื้นที่ว่าง (3D Guides)</span>
                <input
                  type="checkbox"
                  checked={show3DGuides}
                  onChange={(e) => setShow3DGuides(e.target.checked)}
                  className="accent-teal-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-300">แสดงจุดศูนย์ถ่วง (CoG Marker)</span>
                <input
                  type="checkbox"
                  checked={showCoGMarker}
                  onChange={(e) => setShowCoGMarker(e.target.checked)}
                  className="accent-teal-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-300">ร่องห่างระหว่างกล่อง</span>
                <select
                  value={visualGap}
                  onChange={(e) => setVisualGap(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px] text-slate-200 outline-none"
                >
                  <option value={0}>0 มม. (ชิดสนิท)</option>
                  <option value={2}>2 มม. (คมชัด)</option>
                  <option value={5}>5 มม. (เห็นร่องชัด)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Bottom SeaRates-Style Step-by-Step Loading Playback Bar */}
        {totalBoxesCount > 0 && (
          <div className="absolute bottom-3 left-4 right-4 z-20 flex justify-center pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-3 w-full max-w-2xl pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  if (stepProgress >= 100) setStepProgress(5);
                  setIsPlaying((p) => !p);
                }}
                className="w-8 h-8 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center transition cursor-pointer shrink-0 shadow"
                title={isPlaying ? 'หยุดชั่วคราว (Pause)' : 'จำลองการเรียงสินค้าเข้าตู้ (Play Loading Steps)'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setStepProgress((p) => Math.max(0, p - 10));
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="ย้อนกลับ 1 ขั้น"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              <div className="flex-1 flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-teal-400 uppercase tracking-wider">
                    Step-by-Step Stuffing Simulation
                  </span>
                  <span className="text-slate-300 font-mono">
                    {visibleBoxCount.toLocaleString()} / {totalBoxesCount.toLocaleString()} ชิ้น ({stepProgress}%)
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={stepProgress}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setStepProgress(Number(e.target.value));
                  }}
                  className="w-full accent-teal-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setStepProgress((p) => Math.min(100, p + 10));
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="ถัดไป 1 ขั้น"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setStepProgress(100);
                }}
                className="px-2 py-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer shrink-0"
                title="แสดงเต็มตู้ 100%"
              >
                100%
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
