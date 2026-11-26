import React from 'react';

interface VisualBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

interface PackingResult {
  pos: VisualBox[];
  total: number;
  perLayer: number;
  layers: number;
  wUsed?: number;
}

interface ReportItem {
  name: string;
  result: PackingResult | null;
  box: { L: number; W: number; H: number; wt: number };
  color: string;
  title?: string;
}

interface ReportPanelProps {
  mode0: string;
  singRes: PackingResult;
  actPat: { name: string } | null;
  curSku: { name: string } | null;
  box: { L: number; W: number; H: number; wt: number };
  palRes: {
    totalBoxes: number;
    totalPallets: number;
    boxesPerPallet: number;
    boxesPerLayer: number;
    boxLayersH: number;
    pos: VisualBox[];
    palPos: VisualBox[];
    palletsL: number;
    palletsW: number;
  } | null;
  palBox: { L: number; W: number; H: number; wt: number };
  curPalSku: { name: string } | null;
  mixItems: { skuId: string; box: { L: number; W: number; H: number; wt: number }; allocLen: number }[];
  mixRes: PackingResult[];
  cKey: string;
  C: { l: number; w: number; h: number; maxPay: number };
  skusList: { id: string; name: string }[];
}

function computeSlices(pos: VisualBox[]) {
  if (!pos || !pos.length) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = 0, maxY = 0, maxZ = 0;

  for (const p of pos) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x + p.sx > maxX) maxX = p.x + p.sx;
    if (p.y + p.sy > maxY) maxY = p.y + p.sy;
    if (p.z + p.sz > maxZ) maxZ = p.z + p.sz;
  }

  const front = pos.filter((p) => p.x === minX);
  const side = pos.filter((p) => p.z === minZ);
  const top = pos.filter((p) => p.y === minY);

  return { front, side, top, minX, minY, minZ, maxX, maxY, maxZ };
}

const GridSlice: React.FC<{
  boxes: VisualBox[];
  axA: 'x' | 'y' | 'z';
  axB: 'x' | 'y' | 'z';
  dimA: number;
  dimB: number;
  maxA: number;
  maxB: number;
  color: string;
  label: string;
  maxW: number;
  maxH: number;
}> = ({ boxes, axA, axB, dimA, dimB, maxA, maxB, color, label, maxW, maxH }) => {
  const sc = Math.min(maxW / maxA, maxH / maxB);
  const W = Math.round(maxA * sc) + 8;
  const H = Math.round(maxB * sc) + 8;

  const cells = boxes.map((p, i) => {
    const a = p[axA];
    const b = p[axB];
    const sa = axA === 'x' ? p.sx : axA === 'y' ? p.sy : p.sz;
    const sb = axB === 'x' ? p.sx : axB === 'y' ? p.sy : p.sz;

    return (
      <rect
        key={i}
        x={a * sc + 4}
        y={H - 4 - (b + sb) * sc}
        width={sa * sc - 0.7}
        height={sb * sc - 0.7}
        fill={color}
        stroke="#475569"
        strokeWidth={0.4}
      />
    );
  });

  return (
    <div className="text-center font-medium">
      <div className="text-[9px] text-slate-500 font-bold tracking-wider mb-1">{label}</div>
      <svg width={W} height={H} className="mx-auto block border border-slate-300 bg-white rounded">
        {cells}
      </svg>
      <div className="text-[8px] text-slate-400 mt-1">
        {Math.round(dimA)} × {Math.round(dimB)} mm
      </div>
    </div>
  );
};

const Iso3D: React.FC<{
  pos: VisualBox[];
  C: { l: number; w: number; h: number };
  color: string;
  maxW: number;
  maxH: number;
}> = ({ pos, C, color, maxW, maxH }) => {
  if (!pos || !pos.length) return null;
  const s = computeSlices(pos);
  if (!s) return null;

  const c30 = Math.cos(Math.PI / 6);
  const s30 = Math.sin(Math.PI / 6);
  const iso = (x: number, y: number, z: number) => [(x - z) * c30, (x + z) * s30 - y];

  const pts: number[][] = [];
  for (const X of [0, C.l]) {
    for (const Y of [0, C.h]) {
      for (const Z of [0, C.w]) {
        pts.push(iso(X, Y, Z));
      }
    }
  }

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const mnX = Math.min(...xs);
  const mxX = Math.max(...xs);
  const mnY = Math.min(...ys);
  const mxY = Math.max(...ys);

  const sc = Math.min(maxW / (mxX - mnX), maxH / (mxY - mnY));
  const P = (x: number, y: number, z: number) => {
    const [a, b] = iso(x, y, z);
    return `${(a - mnX) * sc + 6},${(b - mnY) * sc + 6}`;
  };

  const W = Math.round((mxX - mnX) * sc) + 12;
  const H = Math.round((mxY - mnY) * sc) + 12;
  const { maxX, maxY, maxZ } = s;

  const uniq = (arr: number[]) => [...new Set(arr)].sort((a, b) => a - b);
  const gx = uniq(pos.flatMap((p) => [p.x, p.x + p.sx]));
  const gy = uniq(pos.flatMap((p) => [p.y, p.y + p.sy]));
  const gz = uniq(pos.flatMap((p) => [p.z, p.z + p.sz]));

  const dark = color;
  const mid = shadeColor(color, -15);
  const light = shadeColor(color, 12);

  function shadeColor(hex: string, pct: number) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + Math.round(2.55 * pct);
    let g = ((n >> 8) & 255) + Math.round(2.55 * pct);
    let b = (n & 255) + Math.round(2.55 * pct);

    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  return (
    <div className="text-center font-medium">
      <div className="text-[9px] text-slate-500 font-bold tracking-wider mb-1">3D PERSPECTIVE</div>
      <svg width={W} height={H} className="mx-auto block">
        {/* Container ground floor */}
        <polygon
          points={`${P(0, 0, 0)} ${P(C.l, 0, 0)} ${P(C.l, 0, C.w)} ${P(0, 0, C.w)}`}
          fill="#f8dfa8"
          stroke="#c9a227"
          strokeWidth={1}
        />
        {/* Wireframe ceiling */}
        <polyline
          points={`${P(0, C.h, 0)} ${P(C.l, C.h, 0)} ${P(C.l, C.h, C.w)} ${P(0, C.h, C.w)} ${P(0, C.h, 0)}`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
        <line x1={P(0, 0, 0).split(',')[0]} y1={P(0, 0, 0).split(',')[1]} x2={P(0, C.h, 0).split(',')[0]} y2={P(0, C.h, 0).split(',')[1]} stroke="#e2e8f0" />
        <line x1={P(C.l, 0, 0).split(',')[0]} y1={P(C.l, 0, 0).split(',')[1]} x2={P(C.l, C.h, 0).split(',')[0]} y2={P(C.l, C.h, 0).split(',')[1]} stroke="#e2e8f0" />
        <line x1={P(C.l, 0, C.w).split(',')[0]} y1={P(C.l, 0, C.w).split(',')[1]} x2={P(C.l, C.h, C.w).split(',')[0]} y2={P(C.l, C.h, C.w).split(',')[1]} stroke="#e2e8f0" />
        <line x1={P(0, 0, C.w).split(',')[0]} y1={P(0, 0, C.w).split(',')[1]} x2={P(0, C.h, C.w).split(',')[0]} y2={P(0, C.h, C.w).split(',')[1]} stroke="#e2e8f0" />

        {/* Packed mass surfaces */}
        <polygon
          points={`${P(0, maxY, 0)} ${P(maxX, maxY, 0)} ${P(maxX, maxY, maxZ)} ${P(0, maxY, maxZ)}`}
          fill={light}
          stroke="#ffffff"
          strokeWidth={0.5}
        />
        <polygon
          points={`${P(0, 0, 0)} ${P(maxX, 0, 0)} ${P(maxX, maxY, 0)} ${P(0, maxY, 0)}`}
          fill={mid}
          stroke="#ffffff"
          strokeWidth={0.5}
        />
        <polygon
          points={`${P(maxX, 0, 0)} ${P(maxX, 0, maxZ)} ${P(maxX, maxY, maxZ)} ${P(maxX, maxY, 0)}`}
          fill={dark}
          stroke="#ffffff"
          strokeWidth={0.5}
        />

        {/* Structural grid line markings */}
        {gx.map((x, i) => (
          <polyline key={`gx-${i}`} points={`${P(x, 0, 0)} ${P(x, maxY, 0)}`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} />
        ))}
        {gy.map((y, i) => (
          <polyline key={`gy-${i}`} points={`${P(0, y, 0)} ${P(maxX, y, 0)} ${P(maxX, y, maxZ)}`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} />
        ))}
        {gz.map((z, i) => (
          <polyline key={`gz-${i}`} points={`${P(maxX, 0, z)} ${P(maxX, maxY, z)}`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} />
        ))}
        {gx.map((x, i) => (
          <polyline key={`tx-${i}`} points={`${P(x, maxY, 0)} ${P(x, maxY, maxZ)}`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} />
        ))}
        {gz.map((z, i) => (
          <polyline key={`tz-${i}`} points={`${P(0, maxY, z)} ${P(maxX, maxY, z)}`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} />
        ))}
      </svg>
    </div>
  );
};

const ReportBlock: React.FC<{ item: ReportItem; C: { l: number; w: number; h: number } }> = ({ item, C }) => {
  const { name, result, box, color, title } = item;
  if (!result || !result.total) return null;

  const s = computeSlices(result.pos);
  if (!s) return null;

  const vol = (result.total * box.L * box.W * box.H) / 1e9;
  const totWt = Math.round(result.total * box.wt);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {title && (
        <div
          className="text-xs font-extrabold pb-2 border-b border-slate-100"
          style={{ color: color, borderLeft: `4px solid ${color}`, paddingLeft: '8px' }}
        >
          {title}
        </div>
      )}

      <div className="flex flex-wrap gap-6 items-start">
        {/* Orthographic projections & 3D projection rendering */}
        <div className="flex flex-wrap gap-4 items-center flex-1 min-w-[320px]">
          <Iso3D pos={result.pos} C={C} color={color} maxW={180} maxH={140} />
          <GridSlice
            boxes={s.top}
            axA="x"
            axB="z"
            dimA={s.maxX}
            dimB={s.maxZ}
            maxA={s.maxX}
            maxB={s.maxZ}
            color={color}
            label="TOP VIEW (มุมมองจากด้านบน)"
            maxW={180}
            maxH={100}
          />
          <GridSlice
            boxes={s.front}
            axA="z"
            axB="y"
            dimA={s.maxZ}
            dimB={s.maxY}
            maxA={s.maxZ}
            maxB={s.maxY}
            color={color}
            label="FRONT VIEW (มุมมองด้านหน้า)"
            maxW={120}
            maxH={120}
          />
          <GridSlice
            boxes={s.side}
            axA="x"
            axB="y"
            dimA={s.maxX}
            dimB={s.maxY}
            maxA={s.maxX}
            maxB={s.maxY}
            color={color}
            label="SIDE VIEW (มุมมองด้านข้าง)"
            maxW={200}
            maxH={120}
          />
        </div>

        {/* Breakdown details */}
        <div className="w-full lg:w-[280px] shrink-0 space-y-4">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
            <h5 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">บทสรุปของแพ็คเกจ</h5>
            <div className="space-y-1">
              <div className="flex justify-between items-end text-xs">
                <span className="text-slate-500">จำนวนบรรทุกรวม:</span>
                <span className="font-extrabold text-teal-600 text-sm">{result.total.toLocaleString()} กล่อง</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">ปริมาตรสินค้าสุทธิ:</span>
                <span className="font-bold text-slate-800">{vol.toFixed(2)} ลบ.ม.</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">น้ำหนักสินค้าสุทธิ:</span>
                <span className="font-bold text-slate-800">{totWt.toLocaleString()} กก.</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-[11px] text-left border-collapse bg-white">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-bold">
                  <th className="p-2">ชื่อสินค้า SKU</th>
                  <th className="p-2 text-right">จำนวน</th>
                  <th className="p-2 text-right">ปริมาตร</th>
                  <th className="p-2 text-right">น้ำหนัก</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-slate-700">
                  <td className="p-2 font-bold truncate max-w-[110px]">{name}</td>
                  <td className="p-2 text-right font-semibold">{result.total.toLocaleString()}</td>
                  <td className="p-2 text-right">{vol.toFixed(1)} m³</td>
                  <td className="p-2 text-right font-semibold">{totWt.toLocaleString()} kg</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
            💡 วิธีจัดเรียง: แถวละ {result.perLayer} กล่อง × ซ้อนขึ้น {result.layers} ชั้น
            <br />
            สเปคกล่อง: {box.L} × {box.W} × {box.H} มม. · น้ำหนักกล่องละ {box.wt} กก.
          </div>
        </div>
      </div>
    </div>
  );
};

export const ReportPanel: React.FC<ReportPanelProps> = ({
  mode0,
  singRes,
  actPat,
  curSku,
  box,
  palRes,
  palBox,
  curPalSku,
  mixItems,
  mixRes,
  cKey,
  C,
  skusList,
}) => {
  const items: ReportItem[] = [];

  if (mode0 === 'pallet' && palRes && palRes.totalBoxes > 0) {
    items.push({
      name: curPalSku && curPalSku.name !== '— กรอกเอง —' ? curPalSku.name : 'Custom Pallet Box',
      result: {
        pos: palRes.pos,
        total: palRes.totalBoxes,
        perLayer: palRes.boxesPerLayer,
        layers: palRes.boxLayersH,
      },
      box: palBox,
      color: '#d97706',
      title: `Pallet Load: ${palRes.palletsL} × ${palRes.palletsW} = ${palRes.totalPallets} พาเลทบนตู้`,
    });
  } else if (mode0 === 'mix') {
    const cols = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7'];
    mixItems.forEach((it, i) => {
      const r = mixRes[i];
      if (r && r.total > 0) {
        const matched = skusList.find((x) => x.id === it.skuId);
        items.push({
          name: matched ? matched.name : `สินค้าคละชนิดกลุ่ม ${i + 1}`,
          result: r,
          box: it.box,
          color: cols[i % cols.length],
          title: `ส่วนจัดเรียงตู้ที่ ${i + 1} (สัดส่วนจัดสรร: ${Math.round((it.allocLen / C.l) * 100)}%)`,
        });
      }
    });
  } else {
    items.push({
      name: curSku && curSku.name !== '— กรอกเอง —' ? curSku.name : 'Custom Single Box',
      result: singRes,
      box: box,
      color: '#14b8a6',
      title: actPat ? `จัดวางตามรูปแบบ: ${actPat.name}` : 'จัดวางตู้สินค้าแบบกล่องเดียว (Single Box)',
    });
  }

  const today = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex-1 bg-slate-100 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Spec sheet header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="text-center border-b-2 border-slate-900 pb-4">
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            บริษัท พี.วี.ที. ฟู้ดส์ อินดัสตรีส์ จำกัด
          </h1>
          <h3 className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
            P.V.T. FOODS INDUSTRIES CO., LTD.
          </h3>
          <p className="text-xs font-bold text-teal-600 mt-2">
            มาตรฐาน / ข้อกำหนดทางเทคนิคการจัดวางสินค้าเข้าตู้คอนเทนเนอร์ขนส่ง
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-500 font-medium">
          <div>
            ตู้คอนเทนเนอร์: <span className="text-slate-800 font-bold">{cKey}</span> ({C.l.toLocaleString()} × {C.w} × {C.h} มม.)
          </div>
          <div className="sm:text-center">
            วันที่จำลองเอกสาร: <span className="text-slate-800 font-bold">{today}</span>
          </div>
          <div className="sm:text-right">
            สเปคควบคุมรหัส: <span className="text-slate-800 font-bold font-mono">SP-WH-005 Rev.00.05.06</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs">
          ไม่มีข้อมูลจำลอง — กรุณาเลือกและคำนวณในหมวดสินค้าอื่นก่อนเพื่อแสดงหน้าปกเอกสารสรุป
        </div>
      ) : (
        items.map((it, i) => <ReportBlock key={i} item={it} C={C} />)
      )}

      <div className="text-center text-[10px] text-slate-400">
        💡 เคล็ดลับการพิมพ์: ท่านสามารถคลิกขวาหน้าจอนี้ หรือกด <kbd className="bg-white border border-slate-200 rounded px-1 py-0.5 font-sans font-bold">Ctrl + P</kbd> / <kbd className="bg-white border border-slate-200 rounded px-1 py-0.5 font-sans font-bold">Cmd + P</kbd> เพื่อพิมพ์สเปคนี้ หรือแปลงเป็น PDF ผ่านระบบเบราว์เซอร์ได้ทันที
      </div>
    </div>
  );
};
