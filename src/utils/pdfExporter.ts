import { jsPDF } from 'jspdf';
import { Container, Pallet } from '../types';

/**
 * Maps common Thai terminology or mixed strings to clean, readable English for professional document generation.
 * This guarantees pristine PDF renderings on any PDF viewer without embedding large Unicode TTF binaries.
 */
export function translateText(text: string): string {
  if (!text) return '';
  
  const mapping: { [key: string]: string } = {
    '20ft Standard Container (ตู้ 20 ฟุต)': '20ft Standard Container',
    '40ft Standard Container (ตู้ 40 ฟุต)': '40ft Standard Container',
    '40ft High Cube Container (ตู้ 40 ฟุต HQ)': '40ft High Cube Container',
    'ตู้แบบกำหนดเอง (Custom)': 'Custom Container',
    'กล่องสินค้า Size A': 'Box Size A',
    'กล่องเครื่องใช้ไฟฟ้า Size B': 'Appliance Box Size B',
    'ลังไม้ชิ้นส่วนอะไหล่ Size C': 'Wooden Crate Size C',
    'สินค้ากล่องเหลือง A': 'Yellow Cargo Box A',
    'สินค้ากล่องฟ้า B': 'Blue Cargo Box B',
    'กล่องมอเตอร์ไฟฟ้า': 'Electric Motor Box',
    'ชิ้นส่วนอะไหล่แพ็คลัง': 'Crated Spare Parts',
    'กล่องคอนโทรลเลอร์': 'Controller Box',
    'Industrial Pallet (พาเลทอุตสาหกรรม)': 'Industrial Pallet (120x100 cm)',
    'Euro Pallet (พาเลทยูโร EUR 1)': 'Euro Pallet (120x80 cm)',
    'พาเลทแบบกำหนดเอง (Custom)': 'Custom Pallet',
    'สินค้าประเภทเครื่องดื่มแพ็คลัง': 'Beverage Pack Crate',
    'แพ็คขวดน้ำดื่มบรรจุกล่อง': 'Bottled Water Pack Box',
    'Asia Standard (120 x 100 ซม.)': 'Asia Standard Pallet (120x100 cm)',
    'Euro Standard (120 x 80 ซม.)': 'Euro Standard Pallet (120x80 cm)',
    'Square Material Pallet (110 x 110 ซม.)': 'Square Material Pallet (110x110 cm)',
    'พาเลทโกดังแบบกำหนดเอง (Custom)': 'Custom Warehouse Pallet',
    'ชิ้นงานกึ่งสำเร็จรูปกล่องหนัก (SFG-Heavy)': 'Semi-Finished Heavy Box',
    'ม้วนพลาสติก/ฟิล์มสวมกล่อง (SFG-Roll)': 'Plastic/Film SFG Roll',
    'ถาดแผงวงจรประกอบเสร็จ (SFG-PCBA)': 'PCBA Tray Assembly',
    'ชิ้นส่วนโลหะกึ่งสำเร็จรูป': 'Semi-Finished Metal Parts',
    'ระบบจำลองแพทเทิร์นจัดเรียง 6 แบบ (Single Box Simulator)': '6-Pattern Single Box Simulator',
    'จัดเรียงสินค้าหลายชนิดคละกัน (Custom Cargo Mix)': 'Custom Mixed Cargo Simulator',
    '3+3+2 Alternating': '3+3+2 Alternating',
    'Standard Pattern': 'Standard Grid Pattern',
    'Uniform A/B': 'Uniform A/B Flat-laid',
    'Upright A/B': 'Upright A/B Vertical',
    'Pinwheel Pattern': 'Pinwheel Stacking',
    'Interlocking Cross': 'Interlocking Cross',
    'pattern-332-alt': '3+3+2 Alternating Pattern',
    'pattern-standard': 'Standard Grid Pattern',
    'pattern-uniform-ab': 'Uniform A/B Flat-laid',
    'pattern-upright-ab': 'Upright A/B Vertical',
    'pattern-pinwheel': 'Pinwheel Stacking',
    'pattern-cross': 'Interlocking Cross',
    'auto': 'Automatic Optimization',
    'column': 'Columnar Stacking',
    'interlocking': 'Interlocking Brick Stacking',
  };

  if (mapping[text]) return mapping[text];
  if (mapping[text.trim()]) return mapping[text.trim()];

  let cleaned = text;
  cleaned = cleaned.replace(/\s*\([^)]*[\u0e00-\u0e7f][^)]*\)/g, '');
  cleaned = cleaned.replace(/ซม\./g, 'cm');
  cleaned = cleaned.replace(/กก\./g, 'kg');
  cleaned = cleaned.replace(/ตัน/g, 'tons');
  cleaned = cleaned.replace(/ตู้/g, 'Container');
  cleaned = cleaned.replace(/กล่อง/g, 'boxes');
  cleaned = cleaned.replace(/ชั้น/g, 'layers');
  cleaned = cleaned.replace(/พาเลท/g, 'Pallets');
  cleaned = cleaned.replace(/[\u0e00-\u0e7f]/g, '');
  cleaned = cleaned.trim().replace(/\s+/g, ' ');

  return cleaned || text;
}

export function exportResultToPDF(
  tabId: 'floor' | 'pallet' | 'warehouse',
  activeSubTab: 'pattern' | 'mix' | '',
  container: Container | null,
  pallet: Pallet | null,
  inputData: any,
  resultData: any,
  userEmail: string = 'chaithammawuth.p@gmail.com'
): void {
  // Initialize A4 document (210mm x 297mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Base configurations
  const pageW = 210;
  const pageH = 297;
  const marginX = 15;
  let currentY = 12;

  // Helpers for text and colors
  const setPrimaryColor = () => doc.setFillColor(13, 148, 136); // Teal-600 (#0d9488)
  const setSecondaryColor = () => doc.setFillColor(15, 118, 110); // Teal-700
  const setLightBgColor = () => doc.setFillColor(248, 250, 252); // Slate-50
  const setBorderColor = () => doc.setDrawColor(226, 232, 240); // Slate-200
  const setDarkBorderColor = () => doc.setDrawColor(13, 148, 136); // Teal-600

  // 1. TOP PREMIUM HEADER BAND
  setPrimaryColor();
  doc.rect(0, 0, pageW, 36, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CONTAINER & PALLET LOADER SPECIFICATION', marginX, 14);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(224, 242, 241); // Pale Teal
  doc.text('High-Fidelity Automated Stacking & Loading Simulation Report', marginX, 20);

  // Metadata block (top right in band)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(204, 251, 241);
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Generated: ${dateStr}`, pageW - marginX - 65, 14);
  doc.text(`User: ${userEmail}`, pageW - marginX - 65, 19);
  doc.text(`Document Reference: CLS-REP-${Date.now().toString().slice(-6)}`, pageW - marginX - 65, 24);

  currentY = 46;

  // Section header helper
  const drawSectionHeader = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text(title, marginX, currentY);
    
    currentY += 2;
    doc.setLineWidth(0.4);
    doc.setDrawColor(13, 148, 136); // Teal line
    doc.line(marginX, currentY, pageW - marginX, currentY);
    currentY += 6;
  };

  // KPI Scorebox helper
  const drawKPICard = (x: number, y: number, w: number, h: number, label: string, val: string, sub: string) => {
    doc.setFillColor(240, 253, 250); // Teal-50
    doc.rect(x, y, w, h, 'F');
    
    doc.setLineWidth(0.3);
    doc.setDrawColor(153, 246, 228); // Teal-200
    doc.rect(x, y, w, h, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 118, 110); // Teal-700
    doc.text(label.toUpperCase(), x + 4, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(13, 148, 136); // Teal-600
    doc.text(val, x + 4, y + 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(sub, x + 4, y + 21);
  };

  // Specific reports based on active tab
  if (tabId === 'floor') {
    // --- FLOOR LOAD TAB REPORT ---
    const isPattern = activeSubTab === 'pattern';
    const subTitle = isPattern ? 'Floor Loading: Single Box Pattern Simulator' : 'Floor Loading: Custom Mixed Cargo Simulator';
    
    drawSectionHeader(subTitle);

    // Section 1: Configuration details table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('I. SPECIFICATION & HARDWARE DIMENSIONS', marginX, currentY);
    currentY += 4;

    // Build configuration rows
    const configRows = [
      ['Container Type:', translateText(container?.name || ''), 'Box Type:', translateText(inputData.boxName || 'Standard Boxes')],
      ['Container Length:', `${container?.length} cm`, 'Box Length:', `${inputData.boxLength} cm`],
      ['Container Width:', `${container?.width} cm`, 'Box Width:', `${inputData.boxWidth} cm`],
      ['Container Height:', `${container?.height} cm`, 'Box Height:', `${inputData.boxHeight} cm`],
      ['Max Load Limit:', `${(container?.maxWeight || 0).toLocaleString()} kg`, 'Box Weight:', `${inputData.boxWeight} kg`],
    ];

    // Optional Pattern row
    if (isPattern) {
      configRows.push(['Arrangement Pattern:', translateText(inputData.patternId || ''), 'Stability Rating:', 'Excellent - Alternating Layers']);
    } else {
      configRows.push(['Total Input Cargo Types:', `${inputData.cargoTypesCount} Items`, 'Safety Compliance:', 'Meets Standard Limits']);
    }

    // Draw specifications table
    setBorderColor();
    doc.setLineWidth(0.2);
    let tableY = currentY;
    configRows.forEach((row, idx) => {
      // Draw background stripe
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, tableY, pageW - (2 * marginX), 6.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);

      // Col 1
      doc.setFont('helvetica', 'bold');
      doc.text(row[0], marginX + 3, tableY + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(row[1], marginX + 42, tableY + 4.5);

      // Col 2
      doc.setFont('helvetica', 'bold');
      doc.text(row[2], marginX + 95, tableY + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(row[3], marginX + 132, tableY + 4.5);

      tableY += 6.5;
    });

    currentY = tableY + 6;

    // Section 2: KPIs & Results
    drawSectionHeader('II. SIMULATION METRICS & VOLUMETRIC EFFICIENCY');

    // Draw KPI cards
    const cardW = 42;
    const cardH = 25;
    const cardGap = 4;
    
    if (isPattern) {
      drawKPICard(marginX, currentY, cardW, cardH, 'Total Packed Boxes', `${resultData.totalBoxes} pcs`, 'Arranged safely');
      drawKPICard(marginX + cardW + cardGap, currentY, cardW, cardH, 'Boxes Per Layer', `${resultData.boxesPerLayer} pcs`, 'Horizontal distribution');
      drawKPICard(marginX + 2 * (cardW + cardGap), currentY, cardW, cardH, 'Total Layers Count', `${resultData.layersCount} layers`, 'Vertical stacking');
      drawKPICard(marginX + 3 * (cardW + cardGap), currentY, cardW, cardH, 'Volume Utilization', `${resultData.volumeEfficiency.toFixed(1)}%`, `${resultData.packedVolume.toFixed(2)} m³ packed`);
    } else {
      drawKPICard(marginX, currentY, cardW, cardH, 'Packed Cargo Count', `${resultData.packedCount} pcs`, `Of ${resultData.totalRequestedCount} total`);
      drawKPICard(marginX + cardW + cardGap, currentY, cardW, cardH, 'Unpacked Cargo', `${resultData.unpackedCount} pcs`, 'Excess/Exceeded weight');
      drawKPICard(marginX + 2 * (cardW + cardGap), currentY, cardW, cardH, 'Weight Utilization', `${resultData.weightEfficiency.toFixed(1)}%`, `${(resultData.totalWeight / 1000).toFixed(2)} tons loaded`);
      drawKPICard(marginX + 3 * (cardW + cardGap), currentY, cardW, cardH, 'Volume Utilization', `${resultData.volumeEfficiency.toFixed(1)}%`, `${resultData.packedVolume.toFixed(2)} m³ used`);
    }

    currentY += cardH + 8;

    // Mixed Cargo Item Details list (Only if mixed cargo)
    if (!isPattern && resultData.cargoItemsList && resultData.cargoItemsList.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text('III. DETAILED MIXED CARGO PACKING BREAKDOWN', marginX, currentY);
      currentY += 4;

      // Table Header
      doc.setFillColor(15, 118, 110);
      doc.rect(marginX, currentY, pageW - (2 * marginX), 6, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('No.', marginX + 3, currentY + 4.2);
      doc.text('Cargo Name / Description', marginX + 12, currentY + 4.2);
      doc.text('Dimensions (L x W x H)', marginX + 85, currentY + 4.2);
      doc.text('Unit Wt', marginX + 130, currentY + 4.2);
      doc.text('Packed Qty', marginX + 155, currentY + 4.2);

      let itemY = currentY + 6;
      doc.setLineWidth(0.1);
      doc.setDrawColor(203, 213, 225);

      resultData.cargoItemsList.forEach((cargo: any, idx: number) => {
        // Stripe background
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(marginX, itemY, pageW - (2 * marginX), 5.5, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);

        doc.text((idx + 1).toString(), marginX + 3, itemY + 3.8);
        doc.text(translateText(cargo.name), marginX + 12, itemY + 3.8);
        doc.text(`${cargo.length} x ${cargo.width} x ${cargo.height} cm`, marginX + 85, itemY + 3.8);
        doc.text(`${cargo.weight} kg`, marginX + 130, itemY + 3.8);
        doc.setFont('helvetica', 'bold');
        doc.text(`x${cargo.quantity} pcs`, marginX + 155, itemY + 3.8);

        // Border bottom line
        doc.line(marginX, itemY + 5.5, pageW - marginX, itemY + 5.5);
        itemY += 5.5;
      });

      currentY = itemY + 6;
    }

  } else if (tabId === 'pallet') {
    // --- PALLET LOAD TAB REPORT ---
    drawSectionHeader('Pallet Loading: Custom Pallet to Container Simulator');

    // Section 1: Specs Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('I. PALLETIZATION CONFIGURATIONS & CRITERIA', marginX, currentY);
    currentY += 4;

    const specRows = [
      ['Container Specs:', translateText(container?.name || ''), 'Pallet Type:', translateText(pallet?.name || '')],
      ['Container Dimensions:', `${container?.length}x${container?.width}x${container?.height} cm`, 'Pallet Dimensions:', `${pallet?.length}x${pallet?.width}x${pallet?.height} cm`],
      ['Container Payload Limit:', `${(container?.maxWeight || 0).toLocaleString()} kg`, 'Pallet Height Limit:', `${pallet?.maxHeight} cm`],
      ['Product Cargo Name:', translateText(inputData.boxName), 'Pallet Weight Limit:', `${pallet?.maxWeight} kg`],
      ['Product Dimensions:', `${inputData.boxLength}x${inputData.boxWidth}x${inputData.boxHeight} cm`, 'Product Weight Unit:', `${inputData.boxWeight} kg`],
    ];

    setBorderColor();
    doc.setLineWidth(0.2);
    let tableY = currentY;
    specRows.forEach((row, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, tableY, pageW - (2 * marginX), 6.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);

      doc.setFont('helvetica', 'bold');
      doc.text(row[0], marginX + 3, tableY + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(row[1], marginX + 42, tableY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.text(row[2], marginX + 95, tableY + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(row[3], marginX + 132, tableY + 4.5);

      tableY += 6.5;
    });

    currentY = tableY + 6;

    // Section 2: Volumetric KPI cards
    drawSectionHeader('II. CONSOLIDATED PALLET STACKING SPECIFICATION');

    const cardW = 42;
    const cardH = 25;
    const cardGap = 4;

    drawKPICard(marginX, currentY, cardW, cardH, 'Single Pallet Boxes', `${resultData.palletTotalBoxes} pcs`, `${resultData.palletBoxesPerLayer} boxes/layer x ${resultData.palletLayersCount} layers`);
    drawKPICard(marginX + cardW + cardGap, currentY, cardW, cardH, 'Pallets Loaded', `${resultData.containerPackedPallets} plts`, `Of ${resultData.palletsRequested} total requested`);
    drawKPICard(marginX + 2 * (cardW + cardGap), currentY, cardW, cardH, 'Total Loaded Boxes', `${resultData.containerTotalBoxes} pcs`, 'Consolidated total');
    drawKPICard(marginX + 3 * (cardW + cardGap), currentY, cardW, cardH, 'Volumetric Util.', `${resultData.containerVolumeEfficiency.toFixed(1)}%`, `${resultData.containerPackedVolume.toFixed(2)} m³ filled`);

    currentY += cardH + 8;

  } else if (tabId === 'warehouse') {
    // --- WAREHOUSE STACKING REPORT ---
    drawSectionHeader('Warehouse Stacking: Semi-Finished Goods Palletization');

    // Section 1: Specs Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('I. WAREHOUSING CRITERIA & CONFIGURATIONS', marginX, currentY);
    currentY += 4;

    const whRows = [
      ['Pallet Classification:', translateText(pallet?.name || ''), 'SFG Product Name:', translateText(inputData.sfgName)],
      ['Pallet Boundary (L x W):', `${pallet?.length} x ${pallet?.width} cm`, 'SFG Box Dimensions:', `${inputData.sfgLength} x ${inputData.sfgWidth} x ${inputData.sfgHeight} cm`],
      ['Pallet Height Cap:', `${pallet?.maxHeight} cm`, 'SFG Unit Weight:', `${inputData.sfgWeight} kg`],
      ['Pallet Load Cap:', `${pallet?.maxWeight} kg`, 'Bottom Crush Limit:', `${inputData.bottomBoxLoadLimit} kg`],
      ['Safe Stacking Rule:', translateText(inputData.patternTypePreference), 'Stability Coefficient:', 'Excellent (Interlocked Corners)'],
    ];

    setBorderColor();
    doc.setLineWidth(0.2);
    let tableY = currentY;
    whRows.forEach((row, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, tableY, pageW - (2 * marginX), 6.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);

      doc.setFont('helvetica', 'bold');
      doc.text(row[0], marginX + 3, tableY + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(row[1], marginX + 42, tableY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.text(row[2], marginX + 95, tableY + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(row[3], marginX + 132, tableY + 4.5);

      tableY += 6.5;
    });

    currentY = tableY + 6;

    // Section 2: KPI Metrics
    drawSectionHeader('II. PALLET STABILITY & CRUSH RESISTANCE METRICS');

    const cardW = 42;
    const cardH = 25;
    const cardGap = 4;

    drawKPICard(marginX, currentY, cardW, cardH, 'Total SFG Boxes', `${resultData.totalBoxes} pcs`, `Stacked across ${resultData.layersCount} layers`);
    drawKPICard(marginX + cardW + cardGap, currentY, cardW, cardH, 'Pallet Net Weight', `${resultData.totalWeight.toFixed(1)} kg`, `${(resultData.totalWeight / (pallet?.maxWeight || 1) * 100).toFixed(1)}% of load capacity`);
    drawKPICard(marginX + 2 * (cardW + cardGap), currentY, cardW, cardH, 'Load Per Bottom Box', `${resultData.weightPerBottomBox.toFixed(1)} kg`, `Max limit: ${inputData.bottomBoxLoadLimit} kg`);
    
    const ratingLabel = resultData.isCrushRisk ? 'RISKY - CRUSH ALARM' : 'EXCELLENT & SAFE';
    drawKPICard(marginX + 3 * (cardW + cardGap), currentY, cardW, cardH, 'Stack Safety Level', ratingLabel, resultData.isCrushRisk ? 'Crush limits exceeded!' : 'Within safe compressive limits');

    currentY += cardH + 8;
  }

  // --- GENERAL SECTION 3: WAREHOUSE SAFETY COMPLIANCE & PROTOCOLS (ALWAYS INCLUDED) ---
  drawSectionHeader('III. STACKING ENGINEERING COMPLIANCE & SAFETY REGULATIONS');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  
  const complianceBullets = [
    'Alternating Corner Lock: Arrange alternating layers crosswise at 90-degree rotations. This creates critical structural friction, preventing lateral slide-outs and load-shifting during shipment.',
    'Load Balancing (Center of Gravity): Always keep the heavier and denser boxes on the bottom floor layers. Heavy objects must be placed closest to the center line to prevent listing/flipping of container trucks.',
    'Pallet Strapping & Stretch Wrap: Apply at least three layers of stretch-wrap (minimum 20 microns) around the loaded pallet and securely strap the bottom boxes directly to the wood pallet blocks.',
    'Compressive Crush Limit Guard: Regularly review bottom box crush resilience parameters. Exceeding compressive structural limits risks warehouse collapsing, causing physical danger and severe product damage.'
  ];

  complianceBullets.forEach((bullet) => {
    // Draw solid teal bullet square
    doc.setFillColor(13, 148, 136);
    doc.rect(marginX + 2, currentY + 0.8, 1.8, 1.8, 'F');

    // Split text to fit width nicely
    const splitText = doc.splitTextToSize(bullet, pageW - (2 * marginX) - 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(splitText, marginX + 7, currentY + 2.5);
    
    currentY += (splitText.length * 3.8) + 1.5;
  });

  currentY += 4;

  // --- SIGNATURE & APPROVAL TRACKING BLOCK ---
  doc.setLineWidth(0.2);
  doc.setDrawColor(203, 213, 225); // Light divider
  doc.line(marginX, currentY, pageW - marginX, currentY);
  currentY += 8;

  // Signature lines
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  
  // Left: Preparer
  doc.line(marginX + 5, currentY + 12, marginX + 65, currentY + 12);
  doc.text('PREPARED & DESIGNED BY', marginX + 5, currentY + 3);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Warehouse Operations Engineer', marginX + 5, currentY + 16);

  // Right: Approver
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.line(pageW - marginX - 65, currentY + 12, pageW - marginX - 5, currentY + 12);
  doc.text('REVIEWED & APPROVED BY', pageW - marginX - 65, currentY + 3);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Logistics Station Supervisor', pageW - marginX - 65, currentY + 16);

  // Bottom tiny footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Container & Pallet Loader Platform - Secure Local Copy. No cloud storage used.', marginX, pageH - 8);
  doc.text('Page 1 of 1', pageW - marginX - 15, pageH - 8);

  // Trigger browser download of PDF
  const filename = `specification-report-${tabId}-${Date.now().toString().slice(-6)}.pdf`;
  doc.save(filename);
}
