import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  setDoc,
  onSnapshot 
} from 'firebase/firestore';

// Load config
const firebaseConfig = {
  projectId: "gen-lang-client-0590897648",
  appId: "1:846296646582:web:55776bf1ef95d550297717",
  apiKey: "AIzaSyBaYflmlp2OcXPZ9J7QJFHjRM5IoM4hO5A",
  authDomain: "gen-lang-client-0590897648.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-containerpalletl-60360ccd-1368-4892-969b-8f60127a267f",
  storageBucket: "gen-lang-client-0590897648.firebasestorage.app",
  messagingSenderId: "846296646582"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface SKUItem {
  id: string; // Firestore document ID or SKU code
  skuCode: string;
  name: string;
  length: number; // cm
  width: number;  // cm
  height: number; // cm
  weight: number; // kg (net or gross weight per piece)
  category?: string;
  description?: string;
  lastUpdated?: string;
}

const SKU_COLLECTION_NAME = 'skus';

export const DEFAULT_SKUS: SKUItem[] = [
  { id: "s12", skuCode: "12/425 SQ", name: "12/15oz. SQ เตี้ย ★", length: 34.8, width: 26.2, height: 9.5, weight: 6.26, category: "SQ" },
  { id: "s1", skuCode: "6/3050", name: "6/108 oz.", length: 46.9, width: 31.3, height: 18.3, weight: 21.06, category: "Standard" },
  { id: "s2", skuCode: "24/850", name: "24/30 oz.", length: 41.0, width: 30.6, height: 24.3, weight: 23.6, category: "Standard" },
  { id: "s3", skuCode: "12/850", name: "12/30 oz.", length: 40.8, width: 30.6, height: 12.5, weight: 12.0, category: "Standard" },
  { id: "s4", skuCode: "6/850", name: "6/30 oz.", length: 30.6, width: 20.4, height: 12.5, weight: 6.16, category: "Standard" },
  { id: "s5", skuCode: "24/565", name: "24/20 oz.", length: 34.3, width: 26.0, height: 23.5, weight: 16.4, category: "Standard" },
  { id: "s6", skuCode: "12/565", name: "12/20 oz. (ถาด)", length: 35.5, width: 26.0, height: 6.5, weight: 8.0, category: "Tray" },
  { id: "s7", skuCode: "12/565", name: "12/20 oz.", length: 34.3, width: 25.7, height: 12.3, weight: 8.21, category: "Standard" },
  { id: "s8", skuCode: "24/425สูง", name: "24/15 oz. สูง", length: 30.5, width: 22.5, height: 23.0, weight: 12.54, category: "Standard" },
  { id: "s9", skuCode: "12/425สูง", name: "12/15 oz. สูง", length: 30.5, width: 22.5, height: 11.7, weight: 6.0, category: "Standard" },
  { id: "s10", skuCode: "24/425 SQ", name: "24/15 oz. SQ เตี้ย", length: 34.5, width: 26.0, height: 18.5, weight: 12.7, category: "SQ" },
  { id: "s11", skuCode: "24/425 SQ", name: "24/15 oz. SQ มีฝาส้อม", length: 35.8, width: 27.0, height: 19.0, weight: 13.2, category: "SQ" },
  { id: "s13", skuCode: "24/227", name: "24/8 oz.", length: 34.3, width: 25.7, height: 11.0, weight: 7.4, category: "Standard" },
  { id: "s14", skuCode: "24/227", name: "24/8 oz. มีฝาส้อม", length: 35.8, width: 26.8, height: 11.5, weight: 7.5, category: "Standard" },
  { id: "s15", skuCode: "12/1.36L", name: "12/46 oz.", length: 43.5, width: 32.7, height: 18.3, weight: 19.46, category: "Standard" },
  { id: "s16", skuCode: "24/565", name: "24/20 oz. มีฝาส้อม", length: 35.8, width: 27.0, height: 24.2, weight: 16.4, category: "Standard" },
  { id: "s17", skuCode: "12/850", name: "12/30 oz. ชิงค์ถุง", length: 41.4, width: 31.2, height: 13.1, weight: 6.0, category: "Shrink" },
  { id: "s18", skuCode: "24/850", name: "24/30 oz. 5 ชั้น", length: 41.5, width: 31.0, height: 25.3, weight: 24.2, category: "Standard" },
  { id: "s19", skuCode: "3/3050", name: "3/108 oz.", length: 46.8, width: 15.5, height: 18.0, weight: 10.5, category: "Standard" },
  { id: "s20", skuCode: "6/3050", name: "6/108 oz. สีขาว", length: 46.9, width: 31.3, height: 18.3, weight: 21.06, category: "White" },
  { id: "s21", skuCode: "6/425", name: "6/15 oz.", length: 22.6, width: 15.5, height: 11.5, weight: 3.1, category: "Standard" },
  { id: "s22", skuCode: "6/565", name: "6/20 oz.", length: 26.0, width: 17.5, height: 12.1, weight: 4.15, category: "Standard" },
  { id: "s23", skuCode: "12/1.36L", name: "12/46 oz. สีขาว", length: 43.5, width: 32.7, height: 18.3, weight: 19.46, category: "White" },
  { id: "s24", skuCode: "6/3050", name: "6/108 oz. 5 ชั้น", length: 47.5, width: 31.8, height: 19.0, weight: 21.0, category: "Standard" },
  { id: "s25", skuCode: "12/565", name: "12/20 oz. สีขาว", length: 34.3, width: 25.7, height: 12.3, weight: 8.21, category: "White" },
  { id: "s26", skuCode: "24/565", name: "24/20 oz. SHRINK FILM", length: 35.0, width: 26.0, height: 24.5, weight: 16.4, category: "Shrink" },
  { id: "s27", skuCode: "24/850", name: "24/30 oz. แข็งแรง", length: 41.0, width: 30.6, height: 24.3, weight: 23.6, category: "Standard" },
  { id: "s28", skuCode: "12/1.36L", name: "12/46 oz. แข็งแรง ตาล", length: 43.5, width: 32.7, height: 18.3, weight: 19.46, category: "Standard" },
  { id: "s29", skuCode: "12/850", name: "12/30 oz. สีขาว", length: 40.8, width: 30.6, height: 12.5, weight: 12.0, category: "White" }
];

/**
 * Get all SKUs from Firestore database
 */
export async function getSKUs(): Promise<SKUItem[]> {
  try {
    const querySnapshot = await getDocs(collection(db, SKU_COLLECTION_NAME));
    const skus: SKUItem[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      skus.push({
        id: doc.id,
        skuCode: data.skuCode || '',
        name: data.name || '',
        length: Number(data.length) || 0,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        weight: Number(data.weight) || 0,
        category: data.category || '',
        description: data.description || '',
        lastUpdated: data.lastUpdated || '',
      });
    });
    
    // Merge with default SKUs
    const merged = [...DEFAULT_SKUS];
    skus.forEach(dbSku => {
      const idx = merged.findIndex(m => m.id === dbSku.id || m.skuCode === dbSku.skuCode);
      if (idx > -1) {
        merged[idx] = dbSku;
      } else {
        merged.push(dbSku);
      }
    });
    return merged;
  } catch (error) {
    console.error('Error fetching SKUs from Firestore:', error);
    return DEFAULT_SKUS;
  }
}

/**
 * Save or update SKU item in Firestore
 */
export async function saveSKU(sku: Omit<SKUItem, 'id'> & { id?: string }): Promise<string> {
  try {
    const skuData = {
      skuCode: sku.skuCode,
      name: sku.name,
      length: Number(sku.length),
      width: Number(sku.width),
      height: Number(sku.height),
      weight: Number(sku.weight),
      category: sku.category || '',
      description: sku.description || '',
      lastUpdated: new Date().toISOString(),
    };

    if (sku.id) {
      // Update existing document
      const docRef = doc(db, SKU_COLLECTION_NAME, sku.id);
      await setDoc(docRef, skuData, { merge: true });
      return sku.id;
    } else {
      // Create new document with SKU Code as the ID to avoid duplicates, or auto-id
      const id = sku.skuCode.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
      const docRef = doc(db, SKU_COLLECTION_NAME, id);
      await setDoc(docRef, skuData);
      return id;
    }
  } catch (error) {
    console.error('Error saving SKU to Firestore:', error);
    throw error;
  }
}

/**
 * Delete SKU item from Firestore
 */
export async function deleteSKU(id: string): Promise<void> {
  try {
    const docRef = doc(db, SKU_COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting SKU from Firestore:', error);
    throw error;
  }
}

/**
 * Real-time listener for SKUs in Firestore
 */
export function listenToSKUs(onUpdate: (skus: SKUItem[]) => void) {
  const colRef = collection(db, SKU_COLLECTION_NAME);
  return onSnapshot(colRef, (snapshot) => {
    const skus: SKUItem[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      skus.push({
        id: doc.id,
        skuCode: data.skuCode || '',
        name: data.name || '',
        length: Number(data.length) || 0,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        weight: Number(data.weight) || 0,
        category: data.category || '',
        description: data.description || '',
        lastUpdated: data.lastUpdated || '',
      });
    });
    // Merge with default SKUs
    const merged = [...DEFAULT_SKUS];
    skus.forEach(dbSku => {
      const idx = merged.findIndex(m => m.id === dbSku.id || m.skuCode === dbSku.skuCode);
      if (idx > -1) {
        merged[idx] = dbSku;
      } else {
        merged.push(dbSku);
      }
    });
    onUpdate(merged);
  }, (error) => {
    console.error('Error in Firestore real-time listener:', error);
    onUpdate(DEFAULT_SKUS);
  });
}

/**
 * Parses Google Sheets Shareable CSV URL
 * E.g., https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/export?format=csv&gid=0
 * Or standard web share links.
 */
export async function fetchGoogleSheetSKUs(url: string): Promise<Omit<SKUItem, 'id'>[]> {
  try {
    // Transform share link to export CSV link if necessary
    let csvUrl = url;
    if (url.includes('docs.google.com/spreadsheets')) {
      const matches = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (matches && matches[1]) {
        const spreadsheetId = matches[1];
        // Check for specific gid
        const gidMatch = url.match(/gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : '0';
        csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
      }
    }

    // Since we want to bypass CORS issues if the user provides another sheet URL, 
    // a standard Google Sheet public CSV export usually allows CORS.
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    return parseCSVToSKUs(text);
  } catch (error) {
    console.error('Error fetching Google Sheet CSV:', error);
    throw error;
  }
}

/**
 * Highly robust CSV parser that maps columns to SKU definitions
 * Expected columns in CSV: SKU, Name, Length, Width, Height, Weight, Category, Description
 */
export function parseCSVToSKUs(csvText: string): Omit<SKUItem, 'id'>[] {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header to find indices
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));
  
  // Default index mappings
  let skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('รหัส') || h.includes('code'));
  let nameIdx = headers.findIndex(h => h.includes('name') || h.includes('ชื่อ') || h.includes('title'));
  let lenIdx = headers.findIndex(h => h.includes('length') || h.includes('ยาว') || h.includes('l(cm)'));
  let widIdx = headers.findIndex(h => h.includes('width') || h.includes('กว้าง') || h.includes('w(cm)'));
  let heiIdx = headers.findIndex(h => h.includes('height') || h.includes('สูง') || h.includes('h(cm)'));
  let weiIdx = headers.findIndex(h => h.includes('weight') || h.includes('น้ำหนัก') || h.includes('kg'));
  let catIdx = headers.findIndex(h => h.includes('category') || h.includes('หมวด') || h.includes('ประเภท'));
  let descIdx = headers.findIndex(h => h.includes('desc') || h.includes('รายละเอียด'));

  // Fallbacks if not found by name matching
  if (skuIdx === -1) skuIdx = 0;
  if (nameIdx === -1) nameIdx = 1;
  if (lenIdx === -1) lenIdx = 2;
  if (widIdx === -1) widIdx = 3;
  if (heiIdx === -1) heiIdx = 4;
  if (weiIdx === -1) weiIdx = 5;
  if (catIdx === -1) catIdx = 6;
  if (descIdx === -1) descIdx = 7;

  const result: Omit<SKUItem, 'id'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split handling commas within quotes
    const cells: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));

    if (cells.length === 0 || !cells[skuIdx]) continue;

    const skuCode = cells[skuIdx] || '';
    const name = cells[nameIdx] || skuCode;
    const length = parseFloat(cells[lenIdx]) || 0;
    const width = parseFloat(cells[widIdx]) || 0;
    const height = parseFloat(cells[heiIdx]) || 0;
    const weight = parseFloat(cells[weiIdx]) || 0;
    const category = cells[catIdx] || 'General';
    const description = cells[descIdx] || '';

    if (skuCode) {
      result.push({
        skuCode,
        name,
        length,
        width,
        height,
        weight,
        category,
        description
      });
    }
  }

  return result;
}
