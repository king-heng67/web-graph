/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Move, Calculator, Divide, Minus, Equal, Delete, ChevronLeft, ChevronRight, Target, ZoomIn, ZoomOut, Lightbulb, RefreshCw, Home, BookOpen, Brain, Sparkles, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface KeyPoint {
  x: number;
  y: number;
  label: string;
  color: string;
  type: 'intercept' | 'extrema' | 'intersection';
  id: string; // Unique ID for pinning
}

interface Expression {
  id: number;
  text: string;
  visible: boolean;
  color: string;
  compiledFn: ((x: number, y: number) => number) | null;
  isImplicit: boolean;
  error: string | null;
}

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0d9488'];

const Tooltip = ({ children, text, className = "" }: { children: React.ReactNode; text: string | React.ReactNode; className?: string; key?: React.Key }) => {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const updateCoords = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0) return;
    setCoords({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    updateCoords(e.currentTarget as HTMLElement);
    setShow(true);
    
    // Auto-hide after 3 seconds even on hover to prevent blocking
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShow(false);
      timeoutRef.current = null;
    }, 3000);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
        // If there's a timer (from click or hover), let it finish or clear it?
        // Let's clear it and hide immediately on leave to be responsive
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }
    setShow(false);
  };

  const handleTrigger = (e: React.MouseEvent | React.TouchEvent) => {
    updateCoords(e.currentTarget as HTMLElement);
    setShow(true);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShow(false);
      timeoutRef.current = null;
    }, 1500);
  };

  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`} 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleTrigger}
      onTouchStart={handleTrigger}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 2 }}
            className="fixed z-[9999] px-2 py-1 bg-gray-900/90 text-white text-[10px] md:text-[11px] font-medium rounded-md shadow-lg pointer-events-none backdrop-blur-sm border border-white/10 whitespace-nowrap"
            style={{
              left: coords.x,
              top: coords.y - 8,
              transform: 'translate(-50%, -100%)'
            }}
          >
            {text}
            <div className="absolute top-[100%] left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/90" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const activeInputRef = useRef<number | null>(null);
  const [activeInputId, setActiveInputId] = useState<number | null>(null);
  const [activeExprId, setActiveExprId] = useState<number | null>(null);
  const [view, setView] = useState<'landing' | 'calculator'>('landing');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isKeypadVisible, setIsKeypadVisible] = useState(true);
  const [showKeyPoints, setShowKeyPoints] = useState(false);
  const [pinnedPoints, setPinnedPoints] = useState<KeyPoint[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [suggestions, setSuggestions] = useState<{tex: string, raw: string}[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({
    xMin: -10,
    xMax: 10,
    yMin: -6,
    yMax: 6,
  });

  // Keep aspect ratio 1:1 on mount/resize
  useEffect(() => {
    const updateAspect = () => {
      if (!canvasRef.current) return;
      const { width, height } = canvasRef.current.getBoundingClientRect();
      const aspect = width / height;
      setViewport(prev => {
        const dx = prev.xMax - prev.xMin;
        const dy = dx / aspect;
        const centerY = (prev.yMax + prev.yMin) / 2;
        return {
          ...prev,
          yMin: centerY - dy / 2,
          yMax: centerY + dy / 2,
        };
      });
    };
    updateAspect();
    window.addEventListener('resize', updateAspect);
    return () => window.removeEventListener('resize', updateAspect);
  }, []);

  const zoom = (factor: number) => {
    setViewport(prev => {
      const dx = prev.xMax - prev.xMin;
      const dy = prev.yMax - prev.yMin;
      const centerX = (prev.xMax + prev.xMin) / 2;
      const centerY = (prev.yMax + prev.yMin) / 2;
      return {
        xMin: centerX - (dx * factor) / 2,
        xMax: centerX + (dx * factor) / 2,
        yMin: centerY - (dy * factor) / 2,
        yMax: centerY + (dy * factor) / 2,
      };
    });
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const initialPinchDistance = useRef<number | null>(null);
  const initialized = useRef(false);

  // Sync activeInputRef with state for use in callbacks
  useEffect(() => {
    activeInputRef.current = activeInputId;
  }, [activeInputId]);

  // --- Math Compilation Logic ---
  const compileExpression = useCallback((str: string): { fn: (x: number, y: number) => number, isImplicit: boolean } | null => {
    if (!str.trim()) return null;

    let eqStr = str.toLowerCase().replace(/\s+/g, '');
    
    // Replace mathematical symbols with computer symbols for evaluation
    eqStr = eqStr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    
    let parsed = eqStr;
    let isImplicit = false;

    if (eqStr.includes('=')) {
      const parts = eqStr.split('=');
      if (parts.length !== 2) throw new Error("Equation form not supported");
      
      const left = parts[0];
      const right = parts[1];

      // Standard y = ...
      if (left === 'y' && !right.includes('y')) {
        parsed = right;
        isImplicit = false;
      } else {
        parsed = `(${left}) - (${right})`;
        isImplicit = true;
      }
    } else {
      // Expression like 'sin(x)' is assumed y = sin(x)
      if (eqStr.includes('y')) {
        parsed = eqStr;
        isImplicit = true;
      } else {
        parsed = eqStr;
        isImplicit = false;
      }
    }

    const blocked = ['window', 'document', 'fetch', 'eval', 'constructor', 'prototype', 'globalthis', 'alert', 'settimeout'];
    for (const word of blocked) {
      if (parsed.includes(word)) throw new Error(`Security Exception: Keyword blocked.`);
    }

    parsed = parsed.replace(/²/g, '^2');
    parsed = parsed.replace(/√/g, 'sqrt');
    parsed = parsed.replace(/(\d)(x|y|pi|e|[a-z]+\(|\()/g, '$1*$2');
    parsed = parsed.replace(/(x|y|pi|e|\))(\d|x|y|pi|e|[a-z]+\(|\()/g, '$1*$2');
    parsed = parsed.replace(/\^/g, '**');

    const allowedWords = ['x', 'y', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'ln', 'log', 'pi', 'e', 'math'];
    const allWords = parsed.match(/[a-z]+/g) || [];
    for (const word of allWords) {
      if (!allowedWords.includes(word)) throw new Error(`Invalid variable or function: '${word}'`);
    }

    parsed = parsed.replace(/\bpi\b/g, 'Math.PI');
    parsed = parsed.replace(/\be\b/g, 'Math.E');
    parsed = parsed.replace(/\bsin\b/g, 'Math.sin');
    parsed = parsed.replace(/\bcos\b/g, 'Math.cos');
    parsed = parsed.replace(/\btan\b/g, 'Math.tan');
    parsed = parsed.replace(/\basin\b/g, 'Math.asin');
    parsed = parsed.replace(/\bacos\b/g, 'Math.acos');
    parsed = parsed.replace(/\batan\b/g, 'Math.atan');
    parsed = parsed.replace(/\bsqrt\b/g, 'Math.sqrt');
    parsed = parsed.replace(/\babs\b/g, 'Math.abs');
    parsed = parsed.replace(/\blog\b/g, 'Math.log10');
    parsed = parsed.replace(/\bln\b/g, 'Math.log');

    try {
      const fn = new Function('x', 'y', 'return ' + parsed + ';') as (x: number, y: number) => number;
      fn(1, 1); // Test call
      return { fn, isImplicit };
    } catch (e) {
      throw new Error('Syntax error');
    }
  }, []);

  // --- Rendering Logic ---
  const findKeyPoints = useCallback(() => {
    const points: KeyPoint[] = [];
    if (!showKeyPoints) return points;

    // Filter expressions that should show points (either the active one or all if specified)
    const targets = activeExprId 
      ? expressions.filter(e => e.id === activeExprId && e.visible && e.compiledFn)
      : expressions.filter(e => e.visible && e.compiledFn);

    const xRange = viewport.xMax - viewport.xMin;
    const yRange = viewport.yMax - viewport.yMin;
    const scanSteps = isPanning ? 100 : 200; // Lower resolution during panning for performance
    const step = xRange / scanSteps;

    targets.forEach(expr => {
      if (!expr.compiledFn) return;

      // 1. Y-intercept (x = 0)
      if (viewport.xMin <= 0 && viewport.xMax >= 0) {
        try {
          const y = expr.compiledFn(0, 0);
          if (isFinite(y) && y >= viewport.yMin && y <= viewport.yMax) {
            points.push({ 
              x: 0, y, 
              label: `(0, ${y.toFixed(2)})`, 
              color: expr.color, 
              type: 'intercept',
              id: `y-int-${expr.id}`
            });
          }
        } catch {}
      }

      // 2. X-intercepts and Extrema (only for explicit for now)
      if (!expr.isImplicit) {
        let prevVal = expr.compiledFn(viewport.xMin, 0) - 0;
        let prevSlope = 0;

        for (let i = 1; i <= scanSteps; i++) {
          const x = viewport.xMin + i * step;
          const val = expr.compiledFn(x, 0);
          const currentVal = val - 0;
          const slope = (currentVal - prevVal) / step;

          // X-Intercept (Root)
          if (prevVal * currentVal <= 0) {
            let low = x - step, high = x;
            for (let b = 0; b < 10; b++) {
              const mid = (low+high)/2;
              if ((expr.compiledFn(low, 0)) * (expr.compiledFn(mid, 0)) <= 0) high = mid;
              else low = mid;
            }
            const rootX = (low+high)/2;
            points.push({ 
              x: rootX, y: 0, 
              label: `(${rootX.toFixed(2)}, 0)`, 
              color: expr.color, 
              type: 'intercept',
              id: `x-int-${expr.id}-${i}`
            });
          }

          // Extrema (sign change in derivative)
          if (i > 1 && prevSlope * slope <= 0 && Math.abs(prevSlope - slope) > 1e-9) {
            // Refine vertex
            let low = x - step * 2, high = x;
            for (let b = 0; b < 10; b++) {
              const m1 = low + (high - low) / 3;
              const m2 = high - (high - low) / 3;
              const v1 = expr.compiledFn(m1, 0);
              const v2 = expr.compiledFn(m2, 0);
              if (prevSlope > 0) { // Max
                if (v1 < v2) low = m1; else high = m2;
              } else { // Min
                if (v1 > v2) low = m1; else high = m2;
              }
            }
            const extX = (low + high) / 2;
            const extY = expr.compiledFn(extX, 0);
            if (extY >= viewport.yMin && extY <= viewport.yMax) {
              points.push({ 
                x: extX, y: extY, 
                label: `(${extX.toFixed(2)}, ${extY.toFixed(2)})`, 
                color: expr.color, 
                type: 'extrema',
                id: `ext-${expr.id}-${i}`
              });
            }
          }

          prevVal = currentVal;
          prevSlope = slope;
        }
      }
    });

    // 3. Intersections (between all visible expressions)
    const visibleExprs = expressions.filter(e => e.visible && e.compiledFn && !e.isImplicit);
    for (let i = 0; i < visibleExprs.length; i++) {
        for (let j = i + 1; j < visibleExprs.length; j++) {
            const e1 = visibleExprs[i];
            const e2 = visibleExprs[j];
            
            let prevDiff = e1.compiledFn!(viewport.xMin, 0) - e2.compiledFn!(viewport.xMin, 0);
            for (let k = 1; k <= scanSteps; k++) {
                const x = viewport.xMin + k * step;
                const diff = e1.compiledFn!(x, 0) - e2.compiledFn!(x, 0);
                
                if (prevDiff * diff <= 0) {
                    // Refine intersection
                    let low = x - step, high = x;
                    for (let b = 0; b < 10; b++) {
                        const mid = (low + high) / 2;
                        const dMid = e1.compiledFn!(mid, 0) - e2.compiledFn!(mid, 0);
                        const dLow = e1.compiledFn!(low, 0) - e2.compiledFn!(low, 0);
                        if (dLow * dMid <= 0) high = mid;
                        else low = mid;
                    }
                    const interX = (low + high) / 2;
                    const interY = e1.compiledFn!(interX, 0);
                    if (interY >= viewport.yMin && interY <= viewport.yMax) {
                        points.push({ 
                            x: interX, y: interY, 
                            label: `(${interX.toFixed(2)}, ${interY.toFixed(2)})`, 
                            color: '#666', 
                            type: 'intersection',
                            id: `inter-${e1.id}-${e2.id}-${k}`
                        });
                    }
                }
                prevDiff = diff;
            }
        }
    }

    return points;
  }, [expressions, viewport, showKeyPoints, activeExprId, isPanning]);

  const valsBuffer = useRef<Float32Array | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startTime = performance.now();
    const dpr = window.devicePixelRatio || 1;
    const logicalW = canvas.clientWidth;
    const logicalH = canvas.clientHeight;
    
    if (canvas.width !== logicalW * dpr || canvas.height !== logicalH * dpr) {
      canvas.width = logicalW * dpr;
      canvas.height = logicalH * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const mathToScreen = (x: number, y: number) => {
      const dx = viewport.xMax - viewport.xMin || 1;
      const dy = viewport.yMax - viewport.yMin || 1;
      return {
        sx: ((x - viewport.xMin) / dx) * logicalW,
        sy: logicalH - ((y - viewport.yMin) / dy) * logicalH,
      };
    };

    ctx.clearRect(0, 0, logicalW, logicalH);
    const xRange = viewport.xMax - viewport.xMin;
    const yRange = viewport.yMax - viewport.yMin;
    
    // ... rest of setup ...
    
    // Safety guard for expression rendering (keep UI snappy)
    const safetyCheck = () => (performance.now() - startTime > (isPanning ? 50 : 250));

    const getGridSpacing = (range: number) => {
      // Improved logic for traditional calculator steps (1, 2, 5)
      const roughStep = range / 10;
      const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const norm = roughStep / mag;
      let major;
      if (norm < 1.5) major = 1;
      else if (norm < 3.2) major = 2;
      else if (norm < 7.5) major = 5;
      else major = 10;
      
      const majorStep = major * mag;
      let minorStep = majorStep / (major === 2 ? 4 : 5);
      
      return { major: majorStep, minor: minorStep };
    };

    const spacingX = getGridSpacing(xRange);
    const spacingY = getGridSpacing(yRange);

    const formatLabel = (val: number) => {
      if (Math.abs(val) < 1e-10) return "0";
      return parseFloat(val.toPrecision(10)).toString();
    };

    const drawLines = (stepX: number, stepY: number, color: string, lineWidth: number) => {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let x = Math.floor(viewport.xMin / stepX) * stepX; x <= viewport.xMax; x += stepX) {
        if (Math.abs(x) < 1e-10) continue;
        const { sx } = mathToScreen(x, 0);
        ctx.moveTo(Math.floor(sx) + 0.5, 0);
        ctx.lineTo(Math.floor(sx) + 0.5, logicalH);
      }
      for (let y = Math.floor(viewport.yMin / stepY) * stepY; y <= viewport.yMax; y += stepY) {
        if (Math.abs(y) < 1e-10) continue;
        const { sy } = mathToScreen(0, y);
        ctx.moveTo(0, Math.floor(sy) + 0.5);
        ctx.lineTo(logicalW, Math.floor(sy) + 0.5);
      }
      ctx.stroke();
    };

    drawLines(spacingX.minor, spacingY.minor, '#f3f4f6', 1);
    drawLines(spacingX.major, spacingY.major, '#e5e7eb', 1.5);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#4b5563';
    for (let x = Math.floor(viewport.xMin / spacingX.major) * spacingX.major; x <= viewport.xMax; x += spacingX.major) {
      if (Math.abs(x) < 1e-10) continue;
      const { sx } = mathToScreen(x, 0);
      const originY = Math.max(0, Math.min(logicalH - 25, mathToScreen(0, 0).sy));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(formatLabel(x), sx, originY + 6);
    }
    for (let y = Math.floor(viewport.yMin / spacingY.major) * spacingY.major; y <= viewport.yMax; y += spacingY.major) {
      if (Math.abs(y) < 1e-10) continue;
      const { sy } = mathToScreen(0, y);
      const originX = Math.max(30, Math.min(logicalW - 5, mathToScreen(0, 0).sx));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatLabel(y), originX - 6, sy);
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111827';
    const origin = mathToScreen(0, 0);
    ctx.beginPath();
    if (viewport.yMin <= 0 && viewport.yMax >= 0) {
      ctx.moveTo(0, Math.floor(origin.sy) + 0.5);
      ctx.lineTo(logicalW, Math.floor(origin.sy) + 0.5);
    }
    if (viewport.xMin <= 0 && viewport.xMax >= 0) {
      ctx.moveTo(Math.floor(origin.sx) + 0.5, 0);
      ctx.lineTo(Math.floor(origin.sx) + 0.5, logicalH);
    }
    ctx.stroke();

    expressions.forEach(expr => {
      if (!expr.visible || !expr.compiledFn || safetyCheck()) return;
      ctx.strokeStyle = expr.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (!expr.isImplicit) {
        // --- Adaptive Explicit Rendering (y = f(x)) ---
        ctx.beginPath();
        let isDrawing = false;
        let prevMathX = 0;
        let prevMathY = 0;
        let prevSX = 0;
        let prevSY = 0;

        const maxDepth = 6; // Max 2^6 = 64 sub-samples per pixel
        const slopeThreshold = 2; // Pixel distance threshold for subdivision

        const renderSegment = (x1: number, y1: number, x2: number, y2: number, depth: number) => {
          if (depth >= maxDepth) {
            const { sx, sy } = mathToScreen(x2, y2);
            ctx.lineTo(sx, sy);
            return;
          }

          const midX = (x1 + x2) / 2;
          const midY = expr.compiledFn!(midX, 0);

          if (isNaN(midY) || !isFinite(midY)) {
            isDrawing = false;
            return;
          }

          const p1 = mathToScreen(x1, y1);
          const p2 = mathToScreen(x2, y2);
          const pMid = mathToScreen(midX, midY);

          // Check if the midpoint is far from the linear segment
          const dist = Math.abs((p2.sy - p1.sy) * pMid.sx - (p2.sx - p1.sx) * pMid.sy + p2.sx * p1.sy - p2.sy * p1.sx) / 
                       Math.sqrt(Math.pow(p2.sy - p1.sy, 2) + Math.pow(p2.sx - p1.sx, 2) || 1);

          if (dist > slopeThreshold) {
            renderSegment(x1, y1, midX, midY, depth + 1);
            renderSegment(midX, midY, x2, y2, depth + 1);
          } else {
            ctx.lineTo(p2.sx, p2.sy);
          }
        };

        const pixelStep = isPanning ? 4 : 2;
        const numSteps = Math.ceil(logicalW / pixelStep);

        for (let i = 0; i <= numSteps; i++) {
          if (i % 100 === 0 && safetyCheck()) break;

          const sx = i * pixelStep;
          const mathX = viewport.xMin + (sx / logicalW) * xRange;
          
          try {
            const mathY = expr.compiledFn!(mathX, 0);
            if (isNaN(mathY) || !isFinite(mathY)) {
              isDrawing = false;
              continue;
            }

            const { sy } = mathToScreen(mathX, mathY);

            if (!isDrawing) {
              ctx.moveTo(sx, sy);
              isDrawing = true;
            } else {
              // Continuity check (don't connect across asymptotes)
              if (Math.abs(mathY - prevMathY) < yRange * 1.5) {
                renderSegment(prevMathX, prevMathY, mathX, mathY, 0);
              } else {
                ctx.moveTo(sx, sy);
              }
            }
            prevMathX = mathX;
            prevMathY = mathY;
            prevSX = sx;
            prevSY = sy;
          } catch { break; }
        }
        ctx.stroke();
      } else {
        // --- Advanced Marching Squares (f(x,y) = 0) with Linear Interpolation ---
        const step = isPanning ? 12 : (expressions.length > 3 ? 6 : 4);
        const gridW = Math.ceil(logicalW / step) + 1;
        const gridH = Math.ceil(logicalH / step) + 1;
        
        const bufferSize = gridW * gridH;
        if (!valsBuffer.current || valsBuffer.current.length < bufferSize) {
          valsBuffer.current = new Float32Array(bufferSize);
        }
        const vals = valsBuffer.current;

        for (let j = 0; j < gridH; j++) {
          if (j % 20 === 0 && safetyCheck()) break;
          const sy = j * step;
          const mathY = viewport.yMin + ((logicalH - sy) / logicalH) * yRange;
          for (let i = 0; i < gridW; i++) {
            const sx = i * step;
            const mathX = viewport.xMin + (sx / logicalW) * xRange;
            try {
              vals[j * gridW + i] = expr.compiledFn!(mathX, mathY);
            } catch { vals[j * gridW + i] = NaN; }
          }
        }

        const lerp = (v1: number, v2: number) => {
          if (v1 === v2) return 0.5;
          const t = -v1 / (v2 - v1);
          return Math.max(0, Math.min(1, t));
        };

        ctx.beginPath();
        for (let j = 0; j < gridH - 1; j++) {
          if (j % 50 === 0 && safetyCheck()) break;
          for (let i = 0; i < gridW - 1; i++) {
            const v0 = vals[j * gridW + i];
            const v1 = vals[j * gridW + (i + 1)];
            const v2 = vals[(j + 1) * gridW + i];
            const v3 = vals[(j + 1) * gridW + (i + 1)];

            if (isNaN(v0) || isNaN(v1) || isNaN(v2) || isNaN(v3)) continue;

            let code = 0;
            if (v0 > 0) code |= 1;
            if (v1 > 0) code |= 2;
            if (v3 > 0) code |= 4; // Note: Order matters for Marching Squares cases
            if (v2 > 0) code |= 8;

            const x = i * step;
            const y = j * step;

            const p_top =   [x + step * lerp(v0, v1), y];
            const p_bottom = [x + step * lerp(v2, v3), y + step];
            const p_left =   [x, y + step * lerp(v0, v2)];
            const p_right =  [x + step, y + step * lerp(v1, v3)];

            switch (code) {
              case 1: case 14: ctx.moveTo(p_top[0], p_top[1]); ctx.lineTo(p_left[0], p_left[1]); break;
              case 2: case 13: ctx.moveTo(p_top[0], p_top[1]); ctx.lineTo(p_right[0], p_right[1]); break;
              case 4: case 11: ctx.moveTo(p_right[0], p_right[1]); ctx.lineTo(p_bottom[0], p_bottom[1]); break;
              case 8: case 7:  ctx.moveTo(p_left[0], p_left[1]); ctx.lineTo(p_bottom[0], p_bottom[1]); break;
              case 3: case 12: ctx.moveTo(p_left[0], p_left[1]); ctx.lineTo(p_right[0], p_right[1]); break;
              case 6: case 9:  ctx.moveTo(p_top[0], p_top[1]); ctx.lineTo(p_bottom[0], p_bottom[1]); break;
              case 5: {
                ctx.moveTo(p_top[0], p_top[1]); ctx.lineTo(p_right[0], p_right[1]);
                ctx.moveTo(p_left[0], p_left[1]); ctx.lineTo(p_bottom[0], p_bottom[1]);
                break;
              }
              case 10: {
                ctx.moveTo(p_top[0], p_top[1]); ctx.lineTo(p_left[0], p_left[1]);
                ctx.moveTo(p_right[0], p_right[1]); ctx.lineTo(p_bottom[0], p_bottom[1]);
                break;
              }
            }
          }
        }
        ctx.stroke();
      }
    });

    // --- Draw Key Points ---
    if (showKeyPoints) {
      const kps = findKeyPoints();
      kps.forEach(kp => {
        const { sx, sy } = mathToScreen(kp.x, kp.y);
        if (sx < 0 || sx > logicalW || sy < 0 || sy > logicalH) return;

        const isPinned = pinnedPoints.some(p => p.id === kp.id);
        
        ctx.beginPath();
        ctx.arc(sx, sy, isPinned ? 6 : 4, 0, Math.PI * 2);
        
        if (isPinned) {
          ctx.fillStyle = kp.color;
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(128, 128, 128, 0.4)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    // --- Draw Pinned Labels ---
    const drawnLabels: { rx: number, ry: number, bw: number, bh: number }[] = [];

    pinnedPoints.forEach(kp => {
      const { sx, sy } = mathToScreen(kp.x, kp.y);
      if (sx < 0 || sx > logicalW || sy < 0 || sy > logicalH) return;

      ctx.font = 'bold 12px sans-serif';
      const text = kp.label;
      const metrics = ctx.measureText(text);
      const padding = 6;
      const bw = metrics.width + padding * 2;
      const bh = 22;
      const radius = 6;

      // Default position: above the point
      let rx = sx - bw / 2;
      let ry = sy - bh - 15;

      // Ensure within bounds
      if (rx < 4) rx = 4;
      if (rx + bw > logicalW - 4) rx = logicalW - bw - 4;
      if (ry < 4) ry = sy + 15; // Move below if no space above

      // Basic collision avoidance (shift up if overlapping previously drawn labels)
      let attempts = 0;
      while (drawnLabels.some(l => 
        rx < l.rx + l.bw && rx + bw > l.rx &&
        ry < l.ry + l.bh && ry + bh > l.ry
      ) && attempts < 4) {
        ry -= bh + 2;
        attempts++;
      }

      drawnLabels.push({ rx, ry, bw, bh });

      // Draw pointer line
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(rx + bw / 2, ry + (ry < sy ? bh : 0));
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label background & shadow
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.roundRect(rx, ry, bw, bh, radius);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border and text
      ctx.strokeStyle = kp.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, rx + bw / 2, ry + bh / 2);
    });

    // --- Draw Viewport Boundary Indicators ---
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(75, 85, 99, 0.5)';
    ctx.textAlign = 'center';

    // Top bound (yMax)
    ctx.textBaseline = 'top';
    ctx.fillText(`y: ${formatLabel(viewport.yMax)}`, logicalW / 2, 6);

    // Bottom bound (yMin)
    ctx.textBaseline = 'bottom';
    ctx.fillText(`y: ${formatLabel(viewport.yMin)}`, logicalW / 2, logicalH - 6);

    // Left bound (xMin)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(6, logicalH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`x: ${formatLabel(viewport.xMin)}`, 0, 0);
    ctx.restore();

    // Right bound (xMax)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(logicalW - 6, logicalH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(`x: ${formatLabel(viewport.xMax)}`, 0, 0);
    ctx.restore();

    ctx.restore();
  }, [viewport, expressions, showKeyPoints, findKeyPoints, pinnedPoints, isPanning, view]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        // Use ResizeObserver for more reliable size detection
        canvas.width = canvas.parentElement.clientWidth * (window.devicePixelRatio || 1);
        canvas.height = canvas.parentElement.clientHeight * (window.devicePixelRatio || 1);
        render();
      }
    };
    
    // Immediate call
    handleResize();
    
    const observer = new ResizeObserver(() => handleResize());
    const canvas = canvasRef.current;
    if (canvas?.parentElement) observer.observe(canvas.parentElement);
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [render, view]); // Include view to re-run when switching from landing to calculator

  useEffect(() => {
    // Force a render cycle after view change to ensure canvas is ready
    if (view === 'calculator') {
      const timer = setTimeout(render, 16);
      return () => clearTimeout(timer);
    }
  }, [view, render]);

  const addExpression = useCallback((initialText = '') => {
    setExpressions(prev => {
      const id = prev.length > 0 ? Math.max(...prev.map(e => e.id)) + 1 : 1;
      let compiledFn = null;
      let isImplicit = false;
      let error = null;
      if (initialText) {
        try {
          const res = compileExpression(initialText);
          if (res) {
            compiledFn = res.fn;
            isImplicit = res.isImplicit;
          }
        } catch (err) {
          error = (err as Error).message;
        }
      }
      const newExpr: Expression = {
        id,
        text: initialText,
        visible: true,
        color: COLORS[(id - 1) % COLORS.length],
        compiledFn,
        isImplicit,
        error,
      };
      
      setActiveInputId(id);
      setTimeout(() => {
        const input = document.querySelector(`.expr-input[data-id="${id}"]`) as HTMLInputElement | null;
        input?.focus();
      }, 0);

      return [...prev, newExpr];
    });
  }, [compileExpression]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      // Removed default sin(x) as requested
    }
  }, [addExpression]);
  
  const getAISuggestions = useCallback(async () => {
    if (isSuggesting) return;
    setIsSuggesting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const currentContext = expressions.map(e => e.text).filter(t => t.trim()).join(", ");
      
      const prompt = `You are a mathematical consultant for a simple graphing calculator app. 
      The user currently has these expressions: [${currentContext || "none"}].
      
      Suggest 5 simple and interesting mathematical expressions that are compatible with a basic calculator.
      STAY WITHIN THESE RULES:
      - ONLY use standard functions: sin, cos, tan, abs, sqrt, log, ^, *, /, +, -.
      - NO complex variables or advanced calculus.
      - Equations must be in the form "y = f(x)" or simple implicit like "x^2 + y^2 = r^2".
      - Ensure they are visually distinct and "cool" for students.
      - NO high-frequency patterns (like sin(1/x^2)) that could cause rendering lag.

      Return as a JSON array of objects with 'tex' (for display) and 'raw' (for calculation) keys.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tex: { type: Type.STRING },
                raw: { type: Type.STRING }
              },
              required: ["tex", "raw"]
            }
          }
        }
      });
      
      const data = JSON.parse(response.text);
      setSuggestions(data);
    } catch (err) {
      console.error("AI Suggestion Error:", err);
      // Fallback
      setSuggestions([
        { tex: 'x^2 + y^2 = 25', raw: 'x^2 + y^2 = 25' },
        { tex: 'y = \\sin(x)^2', raw: 'y = sin(x)^2' },
        { tex: '|x| + |y| = 6', raw: 'abs(x) + abs(y) = 6' },
        { tex: 'y = x \\sin(x)', raw: 'y = x * sin(x)' },
      ]);
    } finally {
      setIsSuggesting(false);
    }
  }, [expressions, isSuggesting, viewport]);

  useEffect(() => {
    if (initialized.current && suggestions.length === 0) {
      getAISuggestions();
    }
  }, [getAISuggestions, suggestions.length]);

  const handleUpdateText = useCallback((id: number, text: string) => {
    setExpressions(prev => prev.map(expr => {
      if (expr.id === id) {
        let compiledFn = null;
        let isImplicit = false;
        let error = null;
        try {
          const res = compileExpression(text);
          if (res) {
            compiledFn = res.fn;
            isImplicit = res.isImplicit;
          }
        } catch (err) {
          error = (err as Error).message;
        }
        return { ...expr, text, compiledFn, isImplicit, error };
      }
      return expr;
    }));
  }, [compileExpression]);

  const handleKeypadInsert = useCallback((textToInsert: string) => {
    if (activeInputId === null) return;
    const input = document.querySelector(`.expr-input[data-id="${activeInputId}"]`) as HTMLInputElement | null;
    if (!input) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentText = input.value;
    const newText = currentText.substring(0, start) + textToInsert + currentText.substring(end);
    
    handleUpdateText(activeInputId, newText);
    
    input.value = newText;
    const newPos = start + textToInsert.length;
    input.setSelectionRange(newPos, newPos);
    input.focus();
  }, [activeInputId, handleUpdateText]);

  const handleKeypadBackspace = useCallback(() => {
    if (activeInputId === null) return;
    const input = document.querySelector(`.expr-input[data-id="${activeInputId}"]`) as HTMLInputElement | null;
    if (!input) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentText = input.value;
    
    let newText = currentText;
    let newPos = start;

    if (start === end && start > 0) {
      newText = currentText.substring(0, start - 1) + currentText.substring(end);
      newPos = start - 1;
    } else if (start !== end) {
      newText = currentText.substring(0, start) + currentText.substring(end);
    }

    handleUpdateText(activeInputId, newText);
    input.value = newText;
    input.setSelectionRange(newPos, newPos);
    input.focus();
  }, [activeInputId, handleUpdateText]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const zoomFactor = e.deltaY > 0 ? 1.05 : 0.95;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const rangeX = viewport.xMax - viewport.xMin;
    const rangeY = viewport.yMax - viewport.yMin;

    const x = viewport.xMin + (sx / canvas.clientWidth) * rangeX;
    const y = viewport.yMin + ((canvas.clientHeight - sy) / canvas.clientHeight) * rangeY;

    setViewport(prev => ({
      xMin: x - (x - prev.xMin) * zoomFactor,
      xMax: x + (prev.xMax - x) * zoomFactor,
      yMin: y - (y - prev.yMin) * zoomFactor,
      yMax: y + (prev.yMax - y) * zoomFactor,
    }));
  }, [viewport]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    const canvas = canvasRef.current;
    if (!canvas) return;

    const mathDx = (dx / canvas.clientWidth) * (viewport.xMax - viewport.xMin);
    const mathDy = (dy / canvas.clientHeight) * (viewport.yMax - viewport.yMin);

    setViewport(prev => ({
      xMin: prev.xMin - mathDx,
      xMax: prev.xMax - mathDx,
      yMin: prev.yMin + mathDy,
      yMax: prev.yMax + mathDy,
    }));
  }, [viewport]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isDragging.current = false;
      initialPinchDistance.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging.current && e.touches.length === 1 && lastMousePos.current) {
      const dx = e.touches[0].clientX - lastMousePos.current.x;
      const dy = e.touches[0].clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      const mathDx = (dx / canvas.clientWidth) * (viewport.xMax - viewport.xMin);
      const mathDy = (dy / canvas.clientHeight) * (viewport.yMax - viewport.yMin);

      setViewport(prev => ({
        xMin: prev.xMin - mathDx,
        xMax: prev.xMax - mathDx,
        yMin: prev.yMin + mathDy,
        yMax: prev.yMax + mathDy,
      }));
    } else if (e.touches.length === 2 && initialPinchDistance.current !== null) {
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (currentDistance > 0) {
        const ratio = initialPinchDistance.current / currentDistance;
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = canvas.getBoundingClientRect();
        const sx = centerX - rect.left;
        const sy = centerY - rect.top;

        const x = viewport.xMin + (sx / canvas.clientWidth) * (viewport.xMax - viewport.xMin);
        const y = viewport.yMin + ((canvas.clientHeight - sy) / canvas.clientHeight) * (viewport.yMax - viewport.yMin);

        setViewport(prev => ({
          xMin: x - (x - prev.xMin) * ratio,
          xMax: x + (prev.xMax - x) * ratio,
          yMin: y - (y - prev.yMin) * ratio,
          yMax: y + (prev.yMax - y) * ratio,
        }));
        initialPinchDistance.current = currentDistance;
      }
    }
  }, [viewport]);

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 flex flex-col items-center">
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm w-full py-12 px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full"
          >
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold tracking-tight text-gray-950 mb-2">
                Learning Graph
              </h1>
              <p className="text-gray-500 font-medium">Select a learning module</p>
            </div>

            <div className="space-y-4 w-full">
              {/* Active Option: Graphing Calculator */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setView('calculator')}
                className="w-full bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-gray-900 p-3 rounded-2xl text-white shadow-lg group-hover:bg-blue-600 transition-colors">
                    <Calculator size={24} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-950">Graphing Calculator</div>
                    <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">Explore Functions</div>
                  </div>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-blue-600 transition-colors" size={20} />
              </motion.button>

              {/* Placeholder Options */}
              {[
                { title: "Geometry Explorer", icon: <Brain size={24} />, tag: "Coming Soon" },
                { title: "Algebra Basics", icon: <BookOpen size={24} />, tag: "Waitlist" }
              ].map((item, idx) => (
                <div 
                  key={idx}
                  className="w-full bg-gray-100/50 p-5 rounded-[2rem] border border-transparent flex items-center justify-between opacity-60 grayscale cursor-not-allowed"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-gray-200 p-3 rounded-2xl text-gray-500 shadow-sm">
                      {item.icon}
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-gray-600">{item.title}</div>
                      <div className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">{item.tag}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
        
        <footer className="w-full max-w-sm flex flex-col items-center gap-4 py-10 px-6">
          <div className="text-[10px] text-gray-300 font-black uppercase tracking-[0.4em]">
            Visual Math Tool • 2024
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-white text-gray-900 font-sans">
      {/* Fixed Toggle Button (for opening) */}
      <AnimatePresence mode="wait">
        {!isSidebarOpen && (
          <Tooltip text="Open Sidebar Controls" className="fixed top-4 left-4 z-50">
            <motion.button
              layoutId="sidebar-toggle"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={() => setIsSidebarOpen(true)}
              className="w-14 h-14 flex items-center justify-center bg-white border border-gray-200 rounded-2xl shadow-xl hover:bg-gray-50 active:scale-95 transition-all text-blue-600 font-bold text-2xl select-none"
            >
              <Calculator size={28} />
            </motion.button>
          </Tooltip>
        )}
      </AnimatePresence>

      <div className="flex flex-row h-full w-full">
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.aside
              initial={{ opacity: 0, x: -360 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -360 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-[280px] sm:w-[320px] md:w-[360px] border-r border-gray-200 flex flex-col bg-gray-50 z-10 h-full shadow-lg"
            >
              <header className="p-3 bg-white border-b border-gray-200 font-bold flex items-center justify-between text-lg md:text-xl tracking-tight shrink-0">
                <span>Calculator</span>
                <div className="flex items-center gap-1">
                  <Tooltip text="Go to Main Page" className="h-9 w-9">
                    <motion.button
                      whileHover={{ backgroundColor: '#f3f4f6' }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setView('landing')}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 transition-colors flex items-center justify-center h-full w-full"
                    >
                      <Home size={20} />
                    </motion.button>
                  </Tooltip>
                  <Tooltip text={isKeypadVisible ? "Hide Keypad" : "Show Keypad"} className="h-9 w-9">
                    <button 
                      onClick={() => setIsKeypadVisible(!isKeypadVisible)}
                      className={`p-2 hover:bg-gray-100 rounded-lg transition-colors w-full h-full flex items-center justify-center ${isKeypadVisible ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}
                    >
                      <Calculator size={20} />
                    </button>
                  </Tooltip>
                  <Tooltip text={showKeyPoints ? "Hide Key Points" : "Show Intercepts & Extrema"} className="h-9 w-9">
                    <button 
                      onClick={() => setShowKeyPoints(!showKeyPoints)}
                      className={`p-2 hover:bg-gray-100 rounded-lg transition-colors w-full h-full flex items-center justify-center ${showKeyPoints ? 'text-green-600 bg-green-50' : 'text-gray-500'}`}
                    >
                      <Target size={20} />
                    </button>
                  </Tooltip>
                  <Tooltip text="Close Sidebar" className="h-9 w-9">
                    <motion.button
                      layoutId="sidebar-toggle"
                      onClick={() => setIsSidebarOpen(false)}
                      className="hover:bg-red-50 hover:text-red-500 rounded-lg text-gray-500 transition-colors font-bold text-xl h-full w-full flex items-center justify-center"
                    >
                      X
                    </motion.button>
                  </Tooltip>
                </div>
              </header>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <AnimatePresence initial={false}>
                {expressions.map((expr) => (
                  <motion.div
                    key={expr.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-white border p-2 rounded-lg shadow-sm transition-all group ${
                      expr.id === activeExprId 
                        ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/30' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Tooltip text={expr.visible ? "Hide current layer" : "Show layer on graph"} className="w-5 h-5">
                        <button
                          onClick={() => {
                            setExpressions(prev => prev.map(e => e.id === expr.id ? { ...e, visible: !e.visible } : e));
                          }}
                          className="w-full h-full rounded-full shrink-0 border-2 transition-colors cursor-pointer"
                          style={{ 
                            backgroundColor: expr.visible ? expr.color : 'transparent',
                            borderColor: expr.color
                          }}
                        />
                      </Tooltip>
                      <input
                        data-id={expr.id}
                        className="flex-1 outline-none text-base md:text-lg font-medium expr-input"
                        value={expr.text}
                        onChange={(e) => handleUpdateText(expr.id, e.target.value)}
                        onFocus={() => {
                      setActiveInputId(expr.id);
                      setActiveExprId(expr.id);
                    }}
                        placeholder="e.g. x^2"
                      />
                      <Tooltip text="Remove this expression" className="w-7 h-7">
                        <button
                          onClick={() => {
                            setExpressions(prev => prev.filter(e => e.id !== expr.id));
                            if (activeInputId === expr.id) setActiveInputId(null);
                          }}
                          className="text-gray-400 hover:text-red-500 px-1 w-full h-full flex items-center justify-center"
                        >
                          <X size={18} />
                        </button>
                      </Tooltip>
                    </div>
                    {expr.error && (
                      <div className="text-[12px] text-red-600 mt-1 font-medium bg-red-50 p-1 rounded">
                        {expr.error}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Tooltip text="Create a new math expression" className="m-3 w-[calc(100%-24px)] shrink-0">
              <button
                onClick={() => addExpression('')}
                className="flex items-center justify-center gap-2 py-2 md:py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all active:scale-95 shadow-md w-full"
              >
                <Plus size={18} /> Add Expression
              </button>
            </Tooltip>

            {/* Subtle Suggestions Section */}
            <div className="px-3 pb-3 shrink-0">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Lightbulb size={12} />
                    Suggestions
                  </div>
                  <button 
                    onClick={getAISuggestions}
                    disabled={isSuggesting}
                    className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isSuggesting ? 'animate-spin' : ''} />
                  </button>
                </div>
                
                <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar -mx-1 px-1">
                  {suggestions.length > 0 ? (
                    suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => addExpression(s.raw)}
                        className="flex-shrink-0 bg-white border border-gray-200 hover:border-gray-400 p-2 rounded-lg transition-all active:scale-95 group flex items-center justify-center min-w-[70px] shadow-sm"
                      >
                        <div className="text-sm text-gray-600 scale-90 origin-center pointer-events-none">
                          <InlineMath math={s.tex} />
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="flex gap-2">
                      {[1,2,3].map(i => (
                        <div key={i} className="h-10 w-20 bg-gray-100 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <AnimatePresence>
          {isKeypadVisible && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-white border-t border-gray-200 p-1 shrink-0 select-none overflow-hidden"
            >
              <div className="grid grid-cols-7 gap-1">
                {[
                  { label: 'x', val: 'x', special: true, title: 'Variable x' }, 
                  { label: 'y', val: 'y', special: true, title: 'Variable y' }, 
                  { label: 'x²', val: '²', title: 'Square' }, 
                  { label: 'xʸ', val: '^', title: 'Power' }, 
                  { label: '√', val: '√(', title: 'Square Root' }, 
                  { label: '|x|', val: 'abs(', title: 'Absolute Value' }, 
                  { label: 'π', val: 'π', title: 'Pi' },
                  { label: '7', val: '7' }, { label: '8', val: '8' }, { label: '9', val: '9' }, 
                  { label: <Divide size={16} />, val: '÷', special: true, title: 'Divide' }, 
                  { label: 'sin', val: 'sin(', title: 'Sine' }, 
                  { label: 'cos', val: 'cos(', title: 'Cosine' }, 
                  { label: 'tan', val: 'tan(', title: 'Tangent' },
                  { label: '4', val: '4' }, { label: '5', val: '5' }, { label: '6', val: '6' }, 
                  { label: <span className="font-bold">×</span>, val: '×', special: true, title: 'Multiply' }, 
                  { label: 'ln', val: 'ln(', title: 'Natural Log' }, 
                  { label: 'log', val: 'log(', title: 'Logarithm (base 10)' }, 
                  { label: 'e', val: 'e', title: 'Euler\'s Number' },
                  { label: '1', val: '1' }, { label: '2', val: '2' }, { label: '3', val: '3' }, 
                  { label: <Minus size={16} />, val: '−', special: true, title: 'Subtract' }, 
                  { label: '(', val: '(', title: 'Open Parenthesis' }, 
                  { label: ')', val: ')', title: 'Close Parenthesis' }, 
                  { label: <ChevronLeft size={16} />, val: '<', title: 'Move Cursor Left' },
                  { label: '0', val: '0' }, { label: '.', val: '.', title: 'Decimal Point' }, 
                  { label: ',', val: ',', title: 'Comma' }, 
                  { label: <Plus size={16} />, val: '+', special: true, title: 'Add' }, 
                  { label: <Equal size={16} />, val: '=', title: 'Equal Sign' }, 
                  { label: <ChevronRight size={16} />, val: '>', title: 'Move Cursor Right' }, 
                  { label: <Delete size={16} />, val: 'bksp', special: true, title: 'Backspace' }
                ].map((btn, i) => (
                  <Tooltip key={i} text={btn.title || `Insert ${btn.label}`} className="h-full w-full">
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (btn.val === 'bksp') handleKeypadBackspace();
                        else handleKeypadInsert(btn.val as string);
                      }}
                      className={`flex items-center justify-center h-8 md:h-10 text-[10px] md:text-sm font-medium rounded-xl border transition-all active:scale-90 active:shadow-inner w-full ${
                        btn.special 
                          ? 'bg-blue-600 text-white border-blue-500 shadow-sm hover:bg-blue-700' 
                          : 'bg-white text-gray-800 border-gray-200 shadow-sm hover:bg-gray-50'
                      }`}
                    >
                      {btn.label}
                    </button>
                  </Tooltip>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 relative bg-white h-full overflow-hidden">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none block bg-[#fafafa]"
          onWheel={handleWheel}
          onMouseDown={e => {
            setIsPanning(true);
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const width = rect.width;
            const height = rect.height;

            const mathX = viewport.xMin + (sx / width) * (viewport.xMax - viewport.xMin);
            const mathY = viewport.yMin + ((height - sy) / height) * (viewport.yMax - viewport.yMin);

            const mathToScreenLocal = (x: number, y: number) => ({
              sx: ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * width,
              sy: height - ((y - viewport.yMin) / (viewport.yMax - viewport.yMin)) * height,
            });

            // 1. Try to hit a Key Point (if mode active)
            if (showKeyPoints) {
              const kps = findKeyPoints();
              const hit = kps.find(kp => {
                const { sx: ksx, sy: ksy } = mathToScreenLocal(kp.x, kp.y);
                const dist = Math.sqrt((sx - ksx)**2 + (sy - ksy)**2);
                return dist < 12;
              });

              if (hit) {
                setPinnedPoints(prev => {
                  const alreadyPinned = prev.find(p => p.id === hit.id);
                  if (alreadyPinned) return prev.filter(p => p.id !== hit.id);
                  return [...prev, hit];
                });
                return;
              }
            }

            // 2. Try to hit a Curve (select it)
            let clickedExprId: number | null = null;
            let minDistance = 25; // 25px threshold for curve selection

            expressions.forEach(expr => {
              if (!expr.visible || !expr.compiledFn) return;
              try {
                if (expr.isImplicit) {
                    // Approximate distance using value and numerical gradient
                    const val = expr.compiledFn(mathX, mathY);
                    const eps = 0.001;
                    const dx = (expr.compiledFn(mathX + eps, mathY) - val) / eps;
                    const dy = (expr.compiledFn(mathX, mathY + eps) - val) / eps;
                    const gradMag = Math.sqrt(dx*dx + dy*dy);
                    const distMath = Math.abs(val) / (gradMag || 1);
                    
                    // Convert math distance back to approximate screen pixels
                    const distPixels = distMath * (width / (viewport.xMax - viewport.xMin));
                    
                    if (distPixels < minDistance) {
                        minDistance = distPixels;
                        clickedExprId = expr.id;
                    }
                } else {
                    const yAtX = expr.compiledFn(mathX, 0);
                    const { sy: syCurve } = mathToScreenLocal(mathX, yAtX);
                    const d = Math.abs(sy - syCurve);
                    if (d < minDistance) {
                        minDistance = d;
                        clickedExprId = expr.id;
                    }
                }
              } catch {}
            });

            if (clickedExprId !== null) {
              setActiveExprId(clickedExprId);
              setActiveInputId(clickedExprId);
              // Focus the input
              setTimeout(() => {
                const input = document.querySelector(`.expr-input[data-id="${clickedExprId}"]`) as HTMLInputElement | null;
                input?.focus();
              }, 0);
              return;
            }

            // 3. Clear selection if clicking empty space
            setActiveExprId(null);
            handleMouseDown(e);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={() => {
            isDragging.current = false;
            setIsPanning(false);
          }}
          onMouseLeave={() => {
            isDragging.current = false;
            setIsPanning(false);
          }}
          onTouchStart={e => {
            setIsPanning(true);
            handleTouchStart(e);
          }}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            isDragging.current = false;
            setIsPanning(false);
            initialPinchDistance.current = null;
          }}
        />
        
        <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-2 text-[10px] text-gray-500 font-mono shadow-sm pointer-events-none hidden md:block">
          X: [{viewport.xMin.toFixed(2)}, {viewport.xMax.toFixed(2)}]<br/>
          Y: [{viewport.yMin.toFixed(2)}, {viewport.yMax.toFixed(2)}]
        </div>

        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <Tooltip text="Zoom In (Increase axis scale)" className="block">
            <button 
              onClick={() => zoom(0.8)}
              className="p-3 bg-white border border-gray-200 rounded-full shadow-md hover:bg-gray-50 active:scale-95 transition-all text-gray-600 flex items-center justify-center"
            >
              <ZoomIn size={20} />
            </button>
          </Tooltip>
          <Tooltip text="Zoom Out (Decrease axis scale)" className="block">
            <button 
              onClick={() => zoom(1.25)}
              className="p-3 bg-white border border-gray-200 rounded-full shadow-md hover:bg-gray-50 active:scale-95 transition-all text-gray-600 flex items-center justify-center"
            >
              <ZoomOut size={20} />
            </button>
          </Tooltip>
          <Tooltip text="Reset view to default domain & range" className="block">
            <button 
              onClick={() => setViewport({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 })}
              className="p-3 bg-white border border-gray-200 rounded-full shadow-md hover:bg-gray-50 active:scale-95 transition-all text-gray-600 flex items-center justify-center"
            >
              <Move size={20} />
            </button>
          </Tooltip>
        </div>
      </main>
    </div>
  </div>
);
}
