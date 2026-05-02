/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Move } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface Expression {
  id: number;
  text: string;
  visible: boolean;
  color: string;
  compiledFn: ((x: number) => number) | null;
  error: string | null;
}

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0d9488'];

export default function App() {
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [nextId, setNextId] = useState(1);
  const [activeInputId, setActiveInputId] = useState<number | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    xMin: -10,
    xMax: 10,
    yMin: -6,
    yMax: 6,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const initialPinchDistance = useRef<number | null>(null);

  // --- Math Compilation Logic ---
  const compileExpression = useCallback((str: string): ((x: number) => number) | null => {
    if (!str.trim()) return null;

    let eqStr = str.toLowerCase().replace(/\s+/g, '');
    let parsed = eqStr;

    if (eqStr.includes('=')) {
      const parts = eqStr.split('=');
      if (parts.length !== 2) throw new Error("Equation form not supported");
      const left = parts[0];
      const right = parts[1];

      if (left === 'y') {
        parsed = right;
      } else {
        let m;
        if ((m = left.match(/^([^+]+)\+y$/))) {
          parsed = `${right}-(${m[1]})`;
        } else if ((m = left.match(/^y\+(.+)$/))) {
          parsed = `${right}-(${m[1]})`;
        } else if ((m = left.match(/^([^-]+)-y$/))) {
          parsed = `${m[1]}-(${right})`;
        } else if ((m = left.match(/^y-(.+)$/))) {
          parsed = `${right}+(${m[1]})`;
        } else if ((m = left.match(/^([-+]?\d*\.?\d*)x([-+]\d*\.?\d*)y$/))) {
          const a = m[1] === '' || m[1] === '+' ? '1' : m[1] === '-' ? '-1' : m[1];
          const b = m[2] === '' || m[2] === '+' ? '1' : m[2] === '-' ? '-1' : m[2];
          if (parseFloat(b) === 0) throw new Error("Invalid linear equation");
          parsed = `(${right}-(${a}*x))/${b}`;
        } else {
          throw new Error("Equation form not supported");
        }
      }
    }

    const blocked = ['window', 'document', 'fetch', 'eval', 'constructor', 'prototype', 'globalthis', 'alert', 'settimeout'];
    for (const word of blocked) {
      if (parsed.includes(word)) throw new Error(`Security Exception: Keyword blocked.`);
    }

    parsed = parsed.replace(/²/g, '^2');
    parsed = parsed.replace(/√/g, 'sqrt');
    parsed = parsed.replace(/(\d)(x|pi|e|[a-z]+\(|\()/g, '$1*$2');
    parsed = parsed.replace(/(x|pi|e|\))(\d|x|pi|e|[a-z]+\(|\()/g, '$1*$2');
    parsed = parsed.replace(/\^/g, '**');

    const allowedWords = ['x', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'ln', 'log', 'pi', 'e', 'math'];
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
      const fn = new Function('x', 'return ' + parsed + ';') as (x: number) => number;
      fn(1);
      return fn;
    } catch (e) {
      throw new Error('Syntax error');
    }
  }, []);

  // --- Rendering Logic ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const mathToScreen = (x: number, y: number) => ({
      sx: ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * width,
      sy: height - ((y - viewport.yMin) / (viewport.yMax - viewport.yMin)) * height,
    });

    ctx.clearRect(0, 0, width, height);
    const xRange = viewport.xMax - viewport.xMin;
    const yRange = viewport.yMax - viewport.yMin;

    const getGridSpacing = (range: number) => {
      const roughStep = range / 10;
      const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const norm = roughStep / mag;
      let major, minor;
      if (norm < 1.5) { major = 1; minor = 0.2; }
      else if (norm < 3) { major = 2; minor = 0.5; }
      else if (norm < 7) { major = 5; minor = 1; }
      else { major = 10; minor = 2; }
      return { major: major * mag, minor: minor * mag };
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
        ctx.lineTo(Math.floor(sx) + 0.5, height);
      }
      for (let y = Math.floor(viewport.yMin / stepY) * stepY; y <= viewport.yMax; y += stepY) {
        if (Math.abs(y) < 1e-10) continue;
        const { sy } = mathToScreen(0, y);
        ctx.moveTo(0, Math.floor(sy) + 0.5);
        ctx.lineTo(width, Math.floor(sy) + 0.5);
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
      const originY = Math.max(0, Math.min(height - 25, mathToScreen(0, 0).sy));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(formatLabel(x), sx, originY + 6);
    }
    for (let y = Math.floor(viewport.yMin / spacingY.major) * spacingY.major; y <= viewport.yMax; y += spacingY.major) {
      if (Math.abs(y) < 1e-10) continue;
      const { sy } = mathToScreen(0, y);
      const originX = Math.max(30, Math.min(width - 5, mathToScreen(0, 0).sx));
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
      ctx.lineTo(width, Math.floor(origin.sy) + 0.5);
    }
    if (viewport.xMin <= 0 && viewport.xMax >= 0) {
      ctx.moveTo(Math.floor(origin.sx) + 0.5, 0);
      ctx.lineTo(Math.floor(origin.sx) + 0.5, height);
    }
    ctx.stroke();

    const pixelStep = 1;
    const numSteps = Math.ceil(width / pixelStep);

    expressions.forEach(expr => {
      if (!expr.visible || !expr.compiledFn) return;
      ctx.beginPath();
      ctx.strokeStyle = expr.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      let isDrawing = false;
      let prevYVal: number | null = null;

      for (let i = 0; i <= numSteps; i++) {
        const sx = i * pixelStep;
        const mathX = viewport.xMin + (sx / width) * (viewport.xMax - viewport.xMin);
        try {
          const mathY = expr.compiledFn!(mathX);
          if (isNaN(mathY) || !isFinite(mathY)) {
            isDrawing = false;
            prevYVal = null;
            continue;
          }
          const sy = height - ((mathY - viewport.yMin) / (viewport.yMax - viewport.yMin)) * height;
          if (prevYVal !== null) {
            if (Math.abs(mathY - prevYVal) > yRange * 3) isDrawing = false;
          }
          if (!isDrawing) {
            ctx.moveTo(sx, sy);
            isDrawing = true;
          } else {
            ctx.lineTo(sx, sy);
          }
          prevYVal = mathY;
        } catch {
          break;
        }
      }
      ctx.stroke();
    });
  }, [viewport, expressions]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        render();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  useEffect(() => {
    render();
  }, [render]);

  const addExpression = useCallback((initialText = '') => {
    const id = nextId;
    let compiledFn = null;
    let error = null;
    if (initialText) {
      try {
        compiledFn = compileExpression(initialText);
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
      error,
    };
    setExpressions(prev => [...prev, newExpr]);
    setNextId(id + 1);
    setActiveInputId(id);
    
    setTimeout(() => {
      const input = document.querySelector(`.expr-input[data-id="${id}"]`) as HTMLInputElement | null;
      input?.focus();
    }, 0);
  }, [nextId, compileExpression]);

  useEffect(() => {
    if (expressions.length === 0) {
      addExpression('sin(x)');
    }
  }, [addExpression, expressions.length]);

  const handleUpdateText = useCallback((id: number, text: string) => {
    setExpressions(prev => prev.map(expr => {
      if (expr.id === id) {
        let compiledFn = null;
        let error = null;
        try {
          compiledFn = compileExpression(text);
        } catch (err) {
          error = (err as Error).message;
        }
        return { ...expr, text, compiledFn, error };
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
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const rangeX = viewport.xMax - viewport.xMin;
    const rangeY = viewport.yMax - viewport.yMin;

    const x = viewport.xMin + (sx / canvas.width) * rangeX;
    const y = viewport.yMin + ((canvas.height - sy) / canvas.height) * rangeY;

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

    const mathDx = (dx / canvas.width) * (viewport.xMax - viewport.xMin);
    const mathDy = (dy / canvas.height) * (viewport.yMax - viewport.yMin);

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

      const mathDx = (dx / canvas.width) * (viewport.xMax - viewport.xMin);
      const mathDy = (dy / canvas.height) * (viewport.yMax - viewport.yMin);

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

        const x = viewport.xMin + (sx / canvas.width) * (viewport.xMax - viewport.xMin);
        const y = viewport.yMin + ((canvas.height - sy) / canvas.height) * (viewport.yMax - viewport.yMin);

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

  return (
    <div className="flex flex-col-reverse md:flex-row h-screen w-screen overflow-hidden bg-white text-gray-900 font-sans">
      <aside className="w-full md:w-[360px] border-t md:border-t-0 md:border-r border-gray-200 flex flex-col bg-gray-50 z-10 h-[45vh] md:h-screen shadow-lg">
        <header className="p-3 bg-white border-b border-gray-200 font-bold text-center text-lg md:text-xl tracking-tight shrink-0">
          Graphing Calculator
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <AnimatePresence initial={false}>
            {expressions.map((expr) => (
              <motion.div
                key={expr.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-gray-200 p-2 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all group"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setExpressions(prev => prev.map(e => e.id === expr.id ? { ...e, visible: !e.visible } : e));
                    }}
                    className="w-5 h-5 rounded-full shrink-0 border-2 transition-colors cursor-pointer"
                    style={{ 
                      backgroundColor: expr.visible ? expr.color : 'transparent',
                      borderColor: expr.color
                    }}
                  />
                  <input
                    data-id={expr.id}
                    className="flex-1 outline-none text-base md:text-lg font-medium expr-input"
                    value={expr.text}
                    onChange={(e) => handleUpdateText(expr.id, e.target.value)}
                    onFocus={() => setActiveInputId(expr.id)}
                    placeholder="e.g. x^2"
                  />
                  <button
                    onClick={() => {
                      setExpressions(prev => prev.filter(e => e.id !== expr.id));
                      if (activeInputId === expr.id) setActiveInputId(null);
                    }}
                    className="text-gray-400 hover:text-red-500 px-1"
                  >
                    <X size={18} />
                  </button>
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

        <button
          onClick={() => addExpression('')}
          className="m-3 flex items-center justify-center gap-2 py-2 md:py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all active:scale-95 shrink-0 shadow-md"
        >
          <Plus size={18} /> Add Expression
        </button>

        <div className="bg-white border-t border-gray-200 p-1 shrink-0 select-none">
          <div className="grid grid-cols-7 gap-1">
            {[
              ['x', 'x', true], ['y', 'y', true], ['x²', '^2'], ['a^b', '^'], ['√', 'sqrt('], ['|a|', 'abs('], ['π', 'π'],
              ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '/', true], ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('],
              ['4', '4'], ['5', '5'], ['6', '6'], ['×', '*', true], ['ln', 'ln('], ['log', 'log('], ['e', 'e'],
              ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-', true], ['(', '('], [')', ')'], ['<', '<'],
              ['0', '0'], ['.', '.'], [',', ','], ['+', '+', true], ['=', '='], ['>', '>'], ['⌫', 'bksp', true]
            ].map(([label, val, special], i) => (
              <button
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (val === 'bksp') handleKeypadBackspace();
                  else handleKeypadInsert(val as string);
                }}
                className={`flex items-center justify-center h-8 md:h-10 text-[10px] md:text-sm font-medium rounded border border-gray-200 active:bg-gray-200 transition-colors ${
                  special ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 relative bg-white cursor-grab active:cursor-grabbing h-[55vh] md:h-screen">
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => (isDragging.current = false)}
          onMouseLeave={() => (isDragging.current = false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => (isDragging.current = false)}
          className="w-full h-full touch-none"
        />
        
        <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-2 text-[10px] text-gray-500 font-mono shadow-sm pointer-events-none hidden md:block">
          X: [{viewport.xMin.toFixed(2)}, {viewport.xMax.toFixed(2)}]<br/>
          Y: [{viewport.yMin.toFixed(2)}, {viewport.yMax.toFixed(2)}]
        </div>

        <button 
          onClick={() => setViewport({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 })}
          className="absolute bottom-4 right-4 p-3 bg-white border border-gray-200 rounded-full shadow-md hover:bg-gray-50 active:scale-95 transition-all text-gray-600"
          title="Reset View"
        >
          <Move size={20} />
        </button>
      </main>
    </div>
  );
}
