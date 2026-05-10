import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, RotateCcw, Sliders, HelpCircle, Info, Ruler, Atom } from 'lucide-react';

interface NuclearPhysicsExplorerProps {
  onBack: () => void;
}

export const NuclearPhysicsExplorer: React.FC<NuclearPhysicsExplorerProps> = ({ onBack }) => {
  const [initialCount, setInitialCount] = useState(800);
  const [halfLife, setHalfLife] = useState(5.0);
  const [background, setBackground] = useState(0);
  const [showCurve, setShowCurve] = useState(true);
  
  // Interactive "Half-Life Finder" state (pixel Y coordinate)
  const [finderY, setFinderY] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringGraph, setIsHoveringGraph] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [tipIndex, setTipIndex] = useState(0);
  const graphTips = [
    "EXAM TIP: Always subtract background radiation FROM the total count BEFORE calculating half-life.",
    "Did you know? The decay curve is asymptotic; it never actually touches the X-axis unless background is zero.",
    "PRACTICAL: Multiple readings at each time interval help reduce the impact of random decay fluctuations.",
    "SYLLABUS: The gradient of the ln(Activity) vs Time graph gives the decay constant (λ).",
    "ACCURACY: Ensure your ruler tool aligns exactly with A₀/2 to find the first half-life accurately.",
    "SAFETY: Background radiation comes from cosmic rays, radon gas, and naturally occurring isotopes in soil.",
    "GRAPHING: A log-linear plot turns this exponential decay curve into a perfectly straight line."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % graphTips.length);
    }, 50000);
    return () => clearInterval(interval);
  }, []);

  const rotateTip = () => {
    setTipIndex((prev) => (prev + 1) % graphTips.length);
  };

  // Fixed ranges for exam-style consistency
  const maxTime = 25; // days
  const maxCount = 1200; // counts per minute

  const getDecayValue = (t: number) => {
    return (initialCount * Math.pow(0.5, t / halfLife)) + background;
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const marginLeft = 85;
    const marginRight = 40;
    const mt = 40;
    const mb = 65;
    const chartW = Math.max(0, w - marginLeft - marginRight);
    const chartH = Math.max(0, h - mt - mb);
    
    const mathToScreen = (t: number, a: number) => ({
      sx: marginLeft + (t / maxTime) * chartW,
      sy: mt + chartH - (a / maxCount) * chartH
    });

    const screenToMath = (sx: number, sy: number) => ({
      t: ((sx - marginLeft) / chartW) * maxTime,
      a: ((mt + chartH - sy) / chartH) * maxCount
    });

    ctx.clearRect(0, 0, w, h);

    // --- High-Fidelity Exam Grid (Triple-Layer) ---
    
    // 1. Millimeter Lines (Lightest)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.3)';
    ctx.lineWidth = 0.5;
    for (let t = 0; t <= maxTime; t += 0.5) {
      const { sx } = mathToScreen(t, 0);
      ctx.moveTo(sx, mt); ctx.lineTo(sx, mt + chartH);
    }
    for (let a = 0; a <= maxCount; a += 10) {
      const { sy } = mathToScreen(0, a);
      ctx.moveTo(marginLeft, sy); ctx.lineTo(marginLeft + chartW, sy);
    }
    ctx.stroke();

    // 2. Sub-division Lines (Medium)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
    ctx.lineWidth = 0.8;
    for (let t = 0; t <= maxTime; t += 1) {
      const { sx } = mathToScreen(t, 0);
      ctx.moveTo(sx, mt); ctx.lineTo(sx, mt + chartH);
    }
    for (let a = 0; a <= maxCount; a += 50) {
      const { sy } = mathToScreen(0, a);
      ctx.moveTo(marginLeft, sy); ctx.lineTo(marginLeft + chartW, sy);
    }
    ctx.stroke();

    // 3. Major Centimeter Lines (Boldest)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.lineWidth = 1.2;
    for (let t = 0; t <= maxTime; t += 5) {
      const { sx } = mathToScreen(t, 0);
      ctx.moveTo(sx, mt); ctx.lineTo(sx, mt + chartH);
    }
    for (let a = 0; a <= maxCount; a += 100) {
      const { sy } = mathToScreen(0, a);
      ctx.moveTo(marginLeft, sy); ctx.lineTo(marginLeft + chartW, sy);
    }
    ctx.stroke();

    // --- Axes ---
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(marginLeft, mt);
    ctx.lineTo(marginLeft, mt + chartH);
    ctx.lineTo(marginLeft + chartW, mt + chartH);
    ctx.stroke();

    // Axis Arrows
    const drawArrow = (x: number, y: number, angle: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-6, 10); ctx.lineTo(0, 0); ctx.lineTo(6, 10);
      ctx.stroke();
      ctx.restore();
    };
    drawArrow(marginLeft, mt - 2, 0);
    drawArrow(marginLeft + chartW + 2, mt + chartH, Math.PI / 2);

    // Labels (Major Axis Values)
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    for (let t = 0; t <= maxTime; t += 5) {
      const { sx } = mathToScreen(t, 0);
      ctx.fillText(`${t}`, sx, mt + chartH + 22);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let a = 0; a <= maxCount; a += 100) {
      const { sy } = mathToScreen(0, a);
      ctx.fillText(`${a}`, marginLeft - 12, sy);
    }

    // Axi Labels
    ctx.font = 'bold 13px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time / days', marginLeft + chartW / 2, mt + chartH + 50);
    
    ctx.save();
    ctx.translate(22, mt + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Count rate / counts per minute', 0, 0);
    ctx.restore();

    // --- Background Asymptote (Syllabus Accuracy) ---
    if (background > 0) {
      const { sy: bgY } = mathToScreen(0, background);
      ctx.save();
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(marginLeft, bgY);
      ctx.lineTo(marginLeft + chartW, bgY);
      ctx.stroke();
      
      // Shaded background region (Syllabus often represents background as a dead zone)
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(marginLeft, bgY, chartW, mt + chartH - bgY);
      ctx.restore();
      
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#e11d48';
      ctx.textAlign = 'right';
      ctx.fillText(`${background} CPM (BACKGROUND)`, marginLeft + chartW - 10, bgY + 12);
    }

    // --- Statistical Scatter (Real-World Randomness) ---
    ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
    for (let t = 0; t <= maxTime; t += 0.25) {
      const meanA = getDecayValue(t);
      // Realistic Poisson-like fluctuation (N ± √N)
      const noise = (Math.sin(t * 133) * Math.cos(t * 47)) * Math.sqrt(meanA) * 1.5;
      const { sx, sy } = mathToScreen(t, meanA + noise);
      ctx.beginPath();
      ctx.arc(sx, sy, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Decay Curve ---
    if (showCurve) {
      ctx.strokeStyle = '#1d4ed8'; // Examination Blue
      ctx.lineWidth = 3;
      ctx.beginPath();
      const segments = 250;
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * maxTime;
        const a = getDecayValue(t);
        const { sx, sy } = mathToScreen(t, a);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // --- Interactive Half-Life Finder (The Draggable Tool) ---
    if (finderY !== null) {
      // Pass a dummy X value (like 0) and extract the 'a' (activity) property
      const mathCoords = screenToMath(marginLeft, finderY);
      const targetA = mathCoords.a;

      // Intersection Math: t = h * log((A - BG) / A0) / log(0.5)
      let intersectT = 0;
      if (targetA > background && targetA <= initialCount + background) {
        intersectT = halfLife * Math.log((targetA - background) / initialCount) / Math.log(0.5);
      } else if (targetA > initialCount + background) {
        intersectT = 0;
      }

      // Convert the math intersection back into Screen Pixels
      const intersectPixels = mathToScreen(intersectT, targetA);
      const screenX = intersectPixels.sx;
      const screenY = finderY;

      // Draw horizontal axis highlight
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = isDragging ? 'rgba(220, 38, 38, 0.05)' : 'transparent';
      ctx.fillRect(marginLeft, screenY - 10, chartW, 20);
      ctx.restore();

      // Draw the red dashed ruler lines
      ctx.setLineDash([4, 4]);
      const toolColor = isDragging ? '#dc2626' : '#2563eb';
      ctx.strokeStyle = toolColor; 
      ctx.lineWidth = 1.5;

      // Horizontal line from Y-axis pointer to curve
      ctx.beginPath();
      ctx.moveTo(marginLeft, screenY);
      ctx.lineTo(screenX, screenY);
      ctx.stroke();

      // Vertical line down to X-axis
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX, mt + chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      // --- Digital Readouts on Axes (The "Hits") ---
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      
      // Y-axis value bubble (Showing breakdown)
      const correctedA = Math.max(0, targetA - background);
      const totalLabel = `RAW: ${targetA.toFixed(0)}`;
      const sourceLabel = `CORRECTED: ${correctedA.toFixed(0)}`;
      
      ctx.fillStyle = toolColor;
      const totalWidth = ctx.measureText(totalLabel).width;
      const sourceWidth = ctx.measureText(sourceLabel).width;
      const maxWidth = Math.max(totalWidth, sourceWidth);
      
      // Draw a larger bubble for the breakdown
      ctx.beginPath();
      ctx.roundRect(marginLeft - maxWidth - 34, screenY - 20, maxWidth + 16, 40, 4);
      ctx.fill();
      
      // Breakdown labels
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.textAlign = 'left';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText(totalLabel, marginLeft - maxWidth - 26, screenY - 4);
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.fillStyle = background > 0 ? '#fecaca' : 'rgba(255,255,255,0.7)';
      ctx.fillText(sourceLabel, marginLeft - maxWidth - 26, screenY + 10);
      
      // If snap to background, add a label indicating it's just background
      if (Math.abs(targetA - background) < 5) {
          ctx.font = 'black 7px "Inter", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText("NO SOURCE", marginLeft - maxWidth - 26, screenY + 18);
      }

      // X-axis value bubble
      if (intersectT > 0 && intersectT <= maxTime) {
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const xLabel = `${intersectT.toFixed(1)} Days`;
        const xWidth = ctx.measureText(xLabel).width;
        ctx.fillStyle = toolColor;
        ctx.beginPath();
        ctx.roundRect(screenX - xWidth/2 - 4, mt + chartH + 5, xWidth + 8, 20, 4);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(xLabel, screenX, mt + chartH + 19);
      }

      // Ruler measurement ticks along the horizontal line
      if (isDragging) {
          ctx.strokeStyle = 'rgba(220, 38, 38, 0.3)';
          ctx.lineWidth = 1;
          for (let tx = marginLeft + 20; tx < screenX; tx += 20) {
              ctx.beginPath();
              ctx.moveTo(tx, screenY - 3);
              ctx.lineTo(tx, screenY + 3);
              ctx.stroke();
          }
          for (let ty = mt + chartH - 20; ty > screenY; ty -= 20) {
            ctx.beginPath();
            ctx.moveTo(screenX - 3, ty);
            ctx.lineTo(screenX + 3, ty);
            ctx.stroke();
          }
      }

      // Red pointer triangle on the Y-axis
      ctx.fillStyle = isDragging ? '#dc2626' : '#64748b';
      ctx.beginPath();
      ctx.moveTo(marginLeft - 14, screenY - 8);
      ctx.lineTo(marginLeft, screenY);
      ctx.lineTo(marginLeft - 14, screenY + 8);
      ctx.closePath();
      ctx.fill();
      
      // Add a small "drag handle" circle on the triangle
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(marginLeft - 10, screenY, 2, 0, Math.PI * 2); ctx.fill();

      // Intersection Point Marker (The "Hit")
      ctx.fillStyle = toolColor;
      ctx.beginPath(); 
      ctx.arc(screenX, screenY, 6, 0, Math.PI * 2); 
      ctx.fill();
      
      ctx.beginPath(); 
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.arc(screenX, screenY, 4, 0, Math.PI * 2); 
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      draw(ctx, w, h);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const handleStart = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const mx = clientX - rect.left;
      const my = clientY - rect.top;

      const marginLeft = 85;
      const chartW = canvas.clientWidth - marginLeft - 40;
      const chartH = canvas.clientHeight - 40 - 65;
      const mt = 40;

      // Coordinate converter (Math units)
      const pxToMath = (x: number, y: number) => ({
        t: ((x - marginLeft) / chartW) * maxTime,
        a: ((mt + chartH - y) / chartH) * maxCount
      });

      // Check if clicking in the chart area
      const inChartX = mx >= marginLeft - 30 && mx <= marginLeft + chartW + 20;
      const inChartY = my >= mt - 20 && my <= mt + chartH + 20;

      if (inChartX && inChartY) {
        setIsDragging(true);
        setFinderY(my);
      }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      
      setMousePos({ x: mx, y: my });
      
      const isOver = mx >= 60 && mx <= canvas.clientWidth - 20 && 
                     my >= 20 && my <= canvas.clientHeight - 40;
      setIsHoveringGraph(isOver);

      if (!isDragging) return;
      
      if (my >= 20 && my <= canvas.clientHeight - 40) {
        const chartH = canvas.clientHeight - 40 - 65;
        const mt = 40;
        
        // Calculate raw activity
        let rawA = ((mt + chartH - my) / chartH) * maxCount;
        
        // Define snap points (Activity values)
        const snapPoints = [
          initialCount + background,     // Start
          (initialCount / 2) + background, // 1st Half-Life
          (initialCount / 4) + background, // 2nd Half-Life
          background                      // Background level
        ];
        
        const snapThreshold = 15; // CPM threshold for snapping
        let finalA = rawA;
        
        for (const snapA of snapPoints) {
          if (Math.abs(rawA - snapA) < snapThreshold) {
            finalA = snapA;
            break;
          }
        }
        
        // Convert final activity back to screen Y
        // sy = mt + chartH - (a / maxCount) * chartH
        const finalSnapY = mt + chartH - (finalA / maxCount) * chartH;
        
        setFinderY(finalSnapY);
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    const handleMouseEnter = () => setIsHoveringGraph(true);
    const handleMouseLeave = () => {
      setIsHoveringGraph(false);
      setIsDragging(false);
    };

    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mouseup', handleEnd);

    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', handleStart);
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mouseup', handleEnd);

      canvas.removeEventListener('touchstart', handleStart);
      canvas.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [initialCount, halfLife, background, showCurve, finderY, isDragging]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 lg:p-10 flex flex-col items-center">
      <div className="max-w-[1600px] w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Chart Section */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            <div className="flex flex-col gap-2 mb-2">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-600/20">
                  <Atom size={24} className="text-white" />
                </div>
                <h1 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Nuclear <span className="text-emerald-600">Physics Lab</span></h1>
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.4em] ml-1">Analyse radioactive decay curves</p>
            </div>
            <div className="relative bg-white border-2 border-slate-100 rounded-lg p-2 shadow-inner group">
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button 
                  onClick={() => setShowCurve(!showCurve)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold border transition-all ${showCurve ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}
                >
                  DECAY CURVE: {showCurve ? 'VISIBLE' : 'HIDDEN'}
                </button>
                <button 
                  onClick={() => {
                    setFinderY(null);
                  }}
                  className="px-3 py-1.5 rounded-md text-[10px] font-bold border bg-white border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-1.5"
                >
                  <RotateCcw size={12} /> RESET TOOL
                </button>
              </div>

              <div className="relative">
                <canvas 
                  ref={canvasRef} 
                  className={`w-full aspect-[4/3] touch-none transition-colors ${
                    isDragging ? 'cursor-grabbing' : 
                    isHoveringGraph ? (Math.abs(mousePos.y - (finderY || 0)) < 25 || mousePos.x < 110 ? 'cursor-grab' : 'cursor-crosshair') : 
                    'cursor-default'
                  }`}
                />
                
                {/* Floating Tooltip Removed per User Request */}

              </div>
              
              <motion.div 
                key={tipIndex}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={rotateTip}
                className="mt-4 px-6 py-4 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center gap-4 text-[11px] text-slate-600 italic cursor-pointer hover:bg-blue-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Info size={16} className="text-blue-600" />
                </div>
                <p>
                  <strong className="text-blue-700 not-italic">PRO TIP:</strong> {graphTips[tipIndex]}
                  <span className="block mt-1 text-[9px] text-slate-400 not-italic uppercase font-bold tracking-tighter">Click to rotate tips</span>
                </p>
              </motion.div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <Sliders size={20} className="text-slate-400" />
                <h2 className="font-black uppercase text-sm tracking-widest text-slate-700">Lab Controls</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <label>Initial Activity</label>
                    <span className="text-blue-600 font-bold">{initialCount} CPM</span>
                  </div>
                  <input 
                    type="range" min="400" max="1000" step="50"
                    value={initialCount}
                    onChange={(e) => setInitialCount(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <label>Source Half-Life</label>
                    <span className="text-blue-600 font-bold">{halfLife} DAYS</span>
                  </div>
                  <input 
                    type="range" min="1" max="12" step="0.5"
                    value={halfLife}
                    onChange={(e) => setHalfLife(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <label>Background Rad.</label>
                    <span className="text-rose-500 font-bold">{background} CPM</span>
                  </div>
                  <input 
                    type="range" min="0" max="150" step="10"
                    value={background}
                    onChange={(e) => setBackground(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Teacher Sidebar */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <button 
                onClick={onBack}
                className="flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-slate-50 border-2 border-slate-100 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 group text-slate-500 hover:text-emerald-600"
              >
                <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Exit to Hub
              </button>
              
              <a 
                href="/radiation_basics.html" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 px-6 py-4 bg-slate-900 hover:bg-black border-2 border-slate-800 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 group text-white"
              >
                <HelpCircle size={14} className="text-emerald-400" /> Learn Core Theory
              </a>
            </div>
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <HelpCircle size={20} className="text-slate-400" />
                <h2 className="font-black uppercase text-sm tracking-widest text-slate-700">Teacher's Guide</h2>
              </div>

              {/* Dynamic Guide Box */}
              <motion.div 
                key={`${initialCount}-${halfLife}-${background}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-amber-50 p-5 rounded-lg border border-amber-200 shadow-sm space-y-3 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-12 h-12 bg-amber-100/50 rotate-45 translate-x-6 -translate-y-6" />
                
                <div className="space-y-2 relative z-10">
                  <section className="space-y-1">
                    <h3 className="font-bold text-[8px] uppercase tracking-widest text-amber-700">Model Analysis</h3>
                    <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                      {background === 0 ? (
                        "Right now, you are looking at an ideal model. The curve smoothly approaches absolute zero."
                      ) : (
                        <span>
                          ⚠️ <strong>BASELINE DETECTED!</strong> Flattens at <span className="font-bold underline">{background} cpm</span>. Subtract baseline first, halve, then add back.
                        </span>
                      )}
                    </p>
                  </section>

                  <section className="border-t border-amber-200/50 pt-2 space-y-1">
                    <h3 className="font-bold text-[8px] uppercase tracking-widest text-amber-700">Isotope Properties</h3>
                    <p className="text-[11px] text-amber-900 leading-relaxed italic">
                      {halfLife < 5 ? (
                        "Short half-life: highly radioactive now, but safe soon."
                      ) : (
                        "Decays slowly: remains active longer, requiring careful storage."
                      )}
                    </p>
                  </section>
                </div>
              </motion.div>

              {/* Background Warning */}
              {background > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-rose-50 p-4 rounded-lg border border-rose-100 space-y-2"
                >
                  <div className="flex items-center gap-2 text-rose-700 font-black text-[9px] uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    Critical Exam Tip
                  </div>
                  <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                    Warning! Graph stays at <span className="font-bold">{background} cpm</span> due to background. Subtract baseline first!
                  </p>
                </motion.div>
              )}

              {/* Static Content */}
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200/60 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 bg-emerald-500 h-full" />
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="mt-1 p-2 bg-emerald-50 rounded-lg text-emerald-600 group-hover:scale-110 transition-transform">
                      <Atom size={16} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-black text-[9px] uppercase tracking-[0.2em] text-slate-400">The Physics State</h3>
                        <span className="text-[8px] font-bold text-emerald-600 py-0.5 px-2 bg-emerald-50 rounded-full italic">Random Process</span>
                      </div>
                      <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                        Radioactive decay is a <span className="text-emerald-700">random</span> process. Unstable atoms give off radiation to become stable, but we can't predict exactly when any single atom will decay.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200/60 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 bg-blue-500 h-full" />
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="mt-1 p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:scale-110 transition-transform">
                      <Ruler size={16} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-black text-[9px] uppercase tracking-[0.2em] text-slate-400">The Pattern</h3>
                        <span className="text-[8px] font-bold text-blue-600 py-0.5 px-2 bg-blue-50 rounded-full italic">Half-Life</span>
                      </div>
                      <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                        The <span className="text-blue-700">Half-Life</span> is the time it takes for half of the radioactive atoms to decay. This pattern stays exactly the same, no matter how many atoms you start with.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 opacity-40">
        <div className="flex items-center gap-6">
           <div className="h-px w-10 bg-slate-300" />
           <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.6em]">Academic Unit v8.2 • Lab</div>
           <div className="h-px w-10 bg-slate-300" />
        </div>
        <div className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.4em]">Syllabus Core: Atoms, Nuclei & Radiation</div>
      </div>
    </div>
  );
};



