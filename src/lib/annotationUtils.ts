import { Annotation } from '@/types/types';

// Parse special annotation commands from AI output
export function parseAnnotationCommands(text: string, currentPage: number): { 
  annotations: Annotation[];
  cleanedText: string; 
  hadCommands?: boolean;
} {
  const annotations: Annotation[] = [];
  let cleanedText = text;
  let hadCommands = false;
  
  try {
    // QUICK EXIT if no markers
    if (!text.includes('HIGHLIGHT') && !text.includes('CIRCLE')) {
      return { annotations, cleanedText, hadCommands };
    }

    const commandsToRemove: string[] = [];
    // Preprocess: ensure a space after HIGHLIGHT/CIRCLE if directly followed by digit
    if (/HIGHLIGHT\d/.test(text) || /CIRCLE\d/.test(text)) {
      text = text.replace(/HIGHLIGHT(\d)/g, 'HIGHLIGHT $1').replace(/CIRCLE(\d)/g, 'CIRCLE $1');
      cleanedText = text;
    }
    const processedRaw = new Set<string>();

    // Highlight patterns
    const highlightStd = /\[\s*HIGHLIGHT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g; // x y w h page
    const highlightPageFirst = /\[\s*HIGHLIGHT\s+(?:PAGE\s+)?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g; // page x y w h
    const highlightAlt = /\[\s*HIGHLIGHT\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*color="([^"]+)")?\s*\]/g; // colon sep
  const highlightNoPage = /\[\s*HIGHLIGHT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g; // x y w h (implicit currentPage)
    const highlightKV = /\[\s*HIGHLIGHT([^\]]+)\]/g; // key=value

    const addHighlight = (raw: string, page: number, x: number, y: number, width: number, height: number, color?: string) => {
      if (processedRaw.has(raw)) return;
      if (width > 0 && height > 0 && page > 0 && x >= 0 && y >= 0) {
        annotations.push({ type: 'highlight', x, y, width, height, page, color: color || 'rgba(255,255,0,0.3)', animationEffect: 'pulse' });
        hadCommands = true;
      } else {
        console.warn('[annotationUtils] Skipping highlight (invalid dims)', { raw, page, x, y, width, height });
      }
      processedRaw.add(raw);
      commandsToRemove.push(raw);
    };

    // IMPORTANT ORDER: try page-first before coordinate-first so sequences like
    // [HIGHLIGHT 1 80 120 400 60] become page=1 (not page=60) and actually render.
    for (const m of text.matchAll(highlightPageFirst)) {
      const [raw, pageStr, xStr, yStr, wStr, hStr, color] = m;
      const pageNum = parseInt(pageStr, 10) || currentPage;
      const xNum = parseInt(xStr, 10); const yNum = parseInt(yStr, 10);
      const wNum = parseInt(wStr, 10); const hNum = parseInt(hStr, 10);
      // Heuristic disambiguation: if the first number is unrealistically large for a page
      // (e.g. > 50) we assume coordinate-first form; let highlightStd catch it.
      if (pageNum > 50) continue;
      // Additional ambiguity heuristic: if h > w by a large factor (>3x), it might actually be x,y,w,h,page form misparsed.
      if (hNum > wNum * 3) {
        // Skip to allow alternative pattern to process.
        continue;
      }
      addHighlight(raw, pageNum, xNum, yNum, wNum, hNum, color);
      if (pageNum > 20) {
        console.warn('[annotationUtils] Highlight page appears high:', pageNum, raw);
      }
    }
    for (const m of text.matchAll(highlightStd)) {
      const [raw, x, y, w, h, page, color] = m;
      addHighlight(raw, parseInt(page,10)||currentPage, parseInt(x,10), parseInt(y,10), parseInt(w,10), parseInt(h,10), color);
    }
    // Four-number implicit page pattern must run AFTER std (5-number) to avoid eating those
    for (const m of text.matchAll(highlightNoPage)) {
      const [raw, x, y, w, h, color] = m;
      // Skip if already processed (e.g., was actually a 5-number match)
      if (processedRaw.has(raw)) continue;
      addHighlight(raw, currentPage, parseInt(x,10), parseInt(y,10), parseInt(w,10), parseInt(h,10), color);
    }
    for (const m of text.matchAll(highlightAlt)) {
      const [raw, x, y, w, h, page, color] = m;
      addHighlight(raw, parseInt(page,10)||currentPage, parseInt(x,10), parseInt(y,10), parseInt(w,10), parseInt(h,10), color);
    }
    for (const m of text.matchAll(highlightKV)) {
      const raw = m[0];
      const body = m[1];
      if (!/(x=|y=|w=|h=)/i.test(body)) continue;
      const page = parseInt(/page=(\d+)/i.exec(body)?.[1] || String(currentPage), 10);
      const x = parseInt(/x=(\d+)/i.exec(body)?.[1] || '80', 10);
      const y = parseInt(/y=(\d+)/i.exec(body)?.[1] || '200', 10);
      const width = parseInt(/(?:w|width)=(\d+)/i.exec(body)?.[1] || '420', 10);
      const height = parseInt(/(?:h|height)=(\d+)/i.exec(body)?.[1] || '60', 10);
      const color = /color="([^"\]]+)"/i.exec(body)?.[1];
      addHighlight(raw, page, x, y, width, height, color);
    }

    // Circle patterns
    const circleStd = /\[\s*CIRCLE\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g; // x y r page
    const circlePageFirst = /\[\s*CIRCLE\s+(?:PAGE\s+)?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g; // page x y r
    const circleAlt = /\[\s*CIRCLE\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*color="([^"]+)")?\s*\]/g; // colon
    const circleKV = /\[\s*CIRCLE([^\]]+)\]/g; // key=value

    const addCircle = (raw: string, page: number, x: number, y: number, radius: number, color?: string) => {
      if (processedRaw.has(raw)) return;
      if (radius > 0 && page > 0 && x >= 0 && y >= 0) {
        annotations.push({ type: 'circle', x, y, radius, page, color: color || 'rgba(255,0,0,0.7)', animationEffect: 'pulse' });
        hadCommands = true;
      } else {
        console.warn('[annotationUtils] Skipping circle (invalid dims)', { raw, page, x, y, radius });
      }
      processedRaw.add(raw);
      commandsToRemove.push(raw);
    };

    // Page-first before std for circles
    for (const m of text.matchAll(circlePageFirst)) {
      const [raw, pageStr, xStr, yStr, rStr, color] = m;
      const pageNum = parseInt(pageStr, 10) || currentPage;
      if (pageNum > 50) continue; // let std interpret
      const xNum = parseInt(xStr,10); const yNum = parseInt(yStr,10); const rNum = parseInt(rStr,10);
      addCircle(raw, pageNum, xNum, yNum, rNum, color);
      if (pageNum > 20) {
        console.warn('[annotationUtils] Circle page appears high:', pageNum, raw);
      }
    }
    for (const m of text.matchAll(circleStd)) {
      const [raw, x, y, r, page, color] = m;
      addCircle(raw, parseInt(page,10)||currentPage, parseInt(x,10), parseInt(y,10), parseInt(r,10), color);
    }
    for (const m of text.matchAll(circleAlt)) {
      const [raw, x, y, r, page, color] = m;
      addCircle(raw, parseInt(page,10)||currentPage, parseInt(x,10), parseInt(y,10), parseInt(r,10), color);
    }
    for (const m of text.matchAll(circleKV)) {
      const raw = m[0];
      const body = m[1];
      if (!/(x=|y=|r=|radius=)/i.test(body)) continue;
      const page = parseInt(/page=(\d+)/i.exec(body)?.[1] || String(currentPage), 10);
      const x = parseInt(/x=(\d+)/i.exec(body)?.[1] || '200', 10);
      const y = parseInt(/y=(\d+)/i.exec(body)?.[1] || '300', 10);
      const radius = parseInt(/(?:r|radius)=(\d+)/i.exec(body)?.[1] || '40', 10);
      const color = /color="([^"\]]+)"/i.exec(body)?.[1];
      addCircle(raw, page, x, y, radius, color);
    }

    // Text highlight placeholders (remove but not processed here)
    const textHighlight = /\[HIGHLIGHT TEXT "([^"]+)" ON PAGE (\d+)]/g;
    for (const m of text.matchAll(textHighlight)) {
      commandsToRemove.push(m[0]);
      hadCommands = true;
    }

    // Clamp coordinates to reasonable ranges (avoid off-page placements)
    annotations.forEach(a => {
      if (a.type === 'highlight') {
        a.x = Math.max(0, Math.min(a.x, 800));
        a.y = Math.max(0, Math.min(a.y, 1200));
        const w = (a as any).width ?? 200;
        const h = (a as any).height ?? 40;
        (a as any).width = Math.max(10, Math.min(w, 1000));
        (a as any).height = Math.max(10, Math.min(h, 400));
      } else if (a.type === 'circle') {
        a.x = Math.max(0, Math.min(a.x, 800));
        a.y = Math.max(0, Math.min(a.y, 1200));
        a.radius = Math.max(5, Math.min(a.radius ?? 200, 400));
      }
    });

    // Strip commands from text
    if (commandsToRemove.length) {
      // Remove exact substrings
      for (const cmd of commandsToRemove) {
        cleanedText = cleanedText.replace(cmd, '');
      }
    }

    // Secondary cleanup: remove any residual bracketed commands not already captured
    cleanedText = cleanedText
      .replace(/\[HIGHLIGHT[^\]]*\]/gi, '')
      .replace(/\[CIRCLE[^\]]*\]/gi, '')
      .replace(/\[(?:GO TO|NEXT|PREV|FIRST|LAST) PAGE[^\]]*\]/gi, '')
      .replace(/\s{2,}/g, ' ');

    // Fallback: if we saw command tokens but produced no usable annotations
    if (hadCommands && annotations.length === 0) {
      annotations.push(synthesizeFallbackAnnotation(currentPage));
    }
    
  } catch (error) {
    console.error('Error parsing annotation commands:', error);
  }
  if (annotations.length) {
    try {
      console.log('[annotationUtils] Parsed annotations:', JSON.stringify(annotations));
    } catch {}
  }
  
  return { annotations, cleanedText, hadCommands };
}

// Helper to synthesize a fallback highlight if model gives no commands
export function synthesizeFallbackAnnotation(page: number, opts?: { y?: number; textLength?: number; kind?: 'title'|'body' }): Annotation {
  const kind = opts?.kind || 'title';
  const baseY = opts?.y ?? (kind === 'title' ? 120 : 200);
  // Estimate width from text length (cap range)
  const estWidth = Math.min( Math.max( (opts?.textLength || 55) * 7.2, 160), 520);
  const height = kind === 'title' ? 34 : 48;
  return {
    type: 'highlight',
    page,
    x: 80,
    y: baseY,
    width: estWidth,
    height,
    color: 'rgba(255,255,0,0.25)',
    animationEffect: 'pulse'
  };
}

// Heuristic extraction for descriptive (non-command) highlight mentions
export function extractHeuristicAnnotations(text: string, currentPage: number): { annotations: Annotation[]; reason: string } {
  const annotations: Annotation[] = [];
  const lower = text.toLowerCase();
  // Quick exit if no highlight keyword
  if (!lower.includes('highlight')) return { annotations, reason: '' };

  // Pattern 1: "highlight page 3" or "highlight on page 4"
  const pagePattern = /highlight(?:ing)?(?:\s+on)?\s+page\s+(\d+)/i;
  const m1 = text.match(pagePattern);
  if (m1) {
    const page = parseInt(m1[1], 10) || currentPage;
    annotations.push(synthesizeFallbackAnnotation(page));
    return { annotations, reason: 'phrase highlight page N' };
  }

  // Pattern 2: coordinates described in prose: x:80 y:120 w:400 h:60 page:2 (order flexible)
  const coordPattern = /x\s*[:=]\s*(\d+).*?y\s*[:=]\s*(\d+).*?(?:w|width)\s*[:=]\s*(\d+).*?(?:h|height)\s*[:=]\s*(\d+).*?page\s*[:=]\s*(\d+)/i;
  const m2 = text.match(coordPattern);
  if (m2) {
    const x = parseInt(m2[1],10); const y = parseInt(m2[2],10); const w = parseInt(m2[3],10); const h = parseInt(m2[4],10); const page = parseInt(m2[5],10) || currentPage;
    if (w>0 && h>0) {
      annotations.push({ type:'highlight', x, y, width:w, height:h, page, color:'rgba(255,255,0,0.28)', animationEffect:'pulse' });
      return { annotations, reason: 'prose coordinates pattern' };
    }
  }

  // Pattern 3: descriptive mention without coordinates - create on current page
  if (lower.includes('highlight') && annotations.length === 0) {
    annotations.push(synthesizeFallbackAnnotation(currentPage));
    return { annotations, reason: 'generic highlight keyword' };
  }

  return { annotations, reason: '' };
}

// Extract real-time navigation cues from AI response
export function extractNavigationCues(text: string, currentPage: number): { 
  targetPage: number | null;
  delayMs: number;
  hasNavigation: boolean;
} {
  // Normalize text once
  const lower = text.toLowerCase();

  // 1. Explicit bracket commands (preferred)
  const bracketGo = /\[go to page (\d+)\]/i.exec(text);
  if (bracketGo) {
    return { targetPage: parseInt(bracketGo[1],10), delayMs: 400, hasNavigation: true };
  }
  if (/\[next page\]/i.test(text)) {
    return { targetPage: currentPage + 1, delayMs: 400, hasNavigation: true };
  }
  if (/\[prev page\]/i.test(text) || /\[previous page\]/i.test(text)) {
    return { targetPage: currentPage - 1, delayMs: 400, hasNavigation: true };
  }
  if (/\[first page\]/i.test(text)) {
    return { targetPage: 1, delayMs: 400, hasNavigation: true };
  }
  if (/\[last page\]/i.test(text)) {
    // Caller should clamp to totalPages; we don't have it here
    return { targetPage: currentPage + 9999, delayMs: 400, hasNavigation: true };
  }

  // 2. Natural language commands
  const goToPageRegex = /(?:go to|turn to|navigate to|show|open|jump to)\s+page\s+(\d+)/i;
  const match = text.match(goToPageRegex);
  if (match) {
    return { targetPage: parseInt(match[1],10), delayMs: 500, hasNavigation: true };
  }

  // Relative words
  if (/next page/i.test(text)) {
    return { targetPage: currentPage + 1, delayMs: 500, hasNavigation: true };
  }
  if (/(prev|previous) page/i.test(text)) {
    return { targetPage: currentPage - 1, delayMs: 500, hasNavigation: true };
  }
  if (/first page/i.test(lower)) {
    return { targetPage: 1, delayMs: 400, hasNavigation: true };
  }
  if (/last page/i.test(lower)) {
    return { targetPage: currentPage + 9999, delayMs: 400, hasNavigation: true };
  }

  return { targetPage: null, delayMs: 0, hasNavigation: false };
}

// Handle streaming of AI responses with highlighting and navigation
export function processStreamedResponse(
  chunk: string,
  onAnnotation: (annotations: Annotation[]) => void,
  onNavigation: (page: number) => void,
  currentPage: number
): string {
  // Parse annotations
  const { annotations, cleanedText } = parseAnnotationCommands(chunk, currentPage);
  
  // Add annotations if any
  if (annotations.length > 0) {
    onAnnotation(annotations);
  }
  
  // Check for navigation commands
  const navigation = extractNavigationCues(chunk, currentPage);
  if (navigation.hasNavigation && navigation.targetPage !== null) {
    setTimeout(() => {
      onNavigation(navigation.targetPage!);
    }, navigation.delayMs);
  }
  
  return cleanedText;
}