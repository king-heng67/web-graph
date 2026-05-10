import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, RotateCcw, Sliders, HelpCircle, Info, Ruler, Zap, Activity, ArrowRight } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

interface AccelerationExplorerProps {
  onBack: () => void;
}

export const AccelerationExplorer: React.FC<AccelerationExplorerProps> = ({ onBack }) => {
  const [initialVelocity, setInitialVelocity] = useState(10); // u (m/s)
  const [acceleration, setAcceleration] = useState(2.0); // a (m/s^2)
  const [isNonUniform, setIsNonUniform] = useState(false);
  const [prevAcceleration, setPrevAcceleration] = useState(2.0);
  const [isConstantSpeed, setIsConstantSpeed] = useState(false);
  const [activeConcept, setActiveConcept] = useState<'acceleration' | 'gradient' | 'area'>('acceleration');
  const maxTime = 20; // seconds

  // Dynamic Y-Axis Scaling
  const getVelocityAt = (t: number) => {
    if (isNonUniform) {
       // v = u + at + bt^2 (where b = 0.1 to show distinct curvature)
       return initialVelocity + (acceleration * t) + (0.05 * t * t);
    }
    return initialVelocity + (acceleration * t);
  };

  const getDisplacementAt = (t: number) => {
    if (isNonUniform) {
      // integral of u + at + 0.05t^2 is ut + 0.5at^2 + (0.05/3)t^3
      return (initialVelocity * t) + (0.5 * acceleration * Math.pow(t, 2)) + ((0.05 / 3) * Math.pow(t, 3));
    }
    return (initialVelocity * t) + (0.5 * acceleration * Math.pow(t, 2));
  };

  const v0 = initialVelocity;
  const vEnd = getVelocityAt(maxTime);
  const vMax = Math.max(v0, vEnd, 50);
  const vMin = Math.min(v0, vEnd, 0);
  
  const plotMaxV = Math.ceil(vMax / 20) * 20;
  const plotMinV = Math.floor(vMin / 10) * 10;
  const plotRange = plotMaxV - plotMinV;

  // Interactive tools
  const [probeT, setProbeT] = useState<number | null>(7);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringGraph, setIsHoveringGraph] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const concepts = [
    { id: 'acceleration', title: 'Uniform Acceleration', icon: <Zap size={16} />, desc: 'Constant increase in velocity. Line gradient = acceleration.' },
    { id: 'gradient', title: 'Gradient Analysis', icon: <Activity size={16} />, desc: 'Measure the slope. Steep line = High acceleration.' },
    { id: 'area', title: 'Distance (Area)', icon: <Ruler size={16} />, desc: 'Calculate the area under the line to find total distance.' }
  ];

  const presets = [
    { label: 'Idle to Fast', u: 0, a: 3.5 },
    { label: 'Steady Cruise', u: 30, a: 0 },
    { label: 'Emergency Brake', u: 60, a: -4.5 },
    { label: 'Overtaking', u: 20, a: 1.5 }
  ];

  const applyPreset = (u: number, a: number) => {
    setInitialVelocity(u);
    setAcceleration(a);
  };

  const scenario = (() => {
    if (isNonUniform) return { title: "Non-Uniform", visual: "Curved", physics: "Changing acceleration." };
    if (acceleration === 0) return { title: "Constant Velocity", visual: "Horizontal", physics: "Zero acceleration." };
    if (acceleration > 0) return { title: "Forward Motion", visual: "Upward", physics: "Steady acceleration." };
    return { title: "Braking", visual: "Downward", physics: "Uniform deceleration." };
  })();

  const [tipIndex, setTipIndex] = useState(0);
  const graphTips = [
    "EXAM TIP: The gradient of a velocity-time graph represents acceleration.",
    "Did you know? The area under a velocity-time graph represents the distance travelled.",
    "PRACTICAL: A horizontal line means acceleration is zero, so the speed is constant.",
    "SYLLABUS: Constant acceleration results in a straight diagonal line on this graph.",
    "GRADIENT: If the line goes down, the gradient is negative, representing deceleration.",
    "AREA: You can split complex shapes into rectangles and triangles to find total distance.",
    "UNITS: Acceleration is measured in m/s\u00b2, while velocity is in m/s."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % graphTips.length);
    }, 45000);
    return () => clearInterval(interval);
  }, []);

  const rotateTip = () => {
    setTipIndex((prev) => (prev + 1) % graphTips.length);
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const marginLeft = 95;
    const marginRight = 40;
    const mt = 40;
    const mb = 65;
    const chartW = Math.max(0, w - marginLeft - marginRight);
    const chartH = Math.max(0, h - mt - mb);
    
    const mathToScreen = (t: number, v: number) => ({
      sx: marginLeft + (t / maxTime) * chartW,
      sy: mt + chartH - ((v - plotMinV) / plotRange) * chartH
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
    const vMilliStep = (plotRange / 50) || 2;
    for (let v = plotMinV; v <= plotMaxV; v += vMilliStep) {
      const { sy } = mathToScreen(0, v);
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
    const vSubStep = (plotRange / 10) || 10;
    for (let v = plotMinV; v <= plotMaxV; v += vSubStep) {
      const { sy } = mathToScreen(0, v);
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
    const vMajorStep = (plotRange / 5) || 20;
    for (let v = plotMinV; v <= plotMaxV; v += vMajorStep) {
      const { sy } = mathToScreen(0, v);
      ctx.moveTo(marginLeft, sy); ctx.lineTo(marginLeft + chartW, sy);
    }
    ctx.stroke();

    // --- Zero Line ---
    const { sy: zeroY } = mathToScreen(0, 0);
    if (zeroY >= mt && zeroY <= mt + chartH) {
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(marginLeft, zeroY);
      ctx.lineTo(marginLeft + chartW, zeroY);
      ctx.stroke();
    }

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

    // Labels
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    for (let t = 0; t <= maxTime; t += 5) {
      const { sx } = mathToScreen(t, 0);
      ctx.fillText(`${t}`, sx, mt + chartH + 25);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = plotMinV; v <= plotMaxV; v += vSubStep) {
      const { sy } = mathToScreen(0, v);
      ctx.fillText(`${Math.round(v)}`, marginLeft - 15, sy);
    }

    // Titles
    ctx.font = 'bold 13px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (t) / s', marginLeft + chartW / 2, mt + chartH + 50);
    
    ctx.save();
    ctx.translate(22, mt + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Velocity (v) / m/s', 0, 0);
    ctx.restore();

    // --- Area Shading ---
    if (probeT !== null && activeConcept === 'area') {
      ctx.save();
      ctx.beginPath();
      const { sy: baseY } = mathToScreen(0, 0);
      ctx.moveTo(marginLeft, baseY);
      for (let t = 0; t <= probeT; t += 0.2) {
        const v = getVelocityAt(t);
        const { sx, sy } = mathToScreen(t, v);
        ctx.lineTo(sx, sy);
      }
      const { sx: endX } = mathToScreen(probeT, 0);
      ctx.lineTo(endX, baseY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.4)';
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();

      // Area Text
      const vAtProbe = getVelocityAt(probeT);
      const { sx: textX, sy: textY } = mathToScreen(probeT / 2, vAtProbe / 2);
      ctx.font = 'black 10px "Inter", sans-serif';
      ctx.fillStyle = '#1d4ed8';
      ctx.textAlign = 'center';
      ctx.fillText('TOTAL DISTANCE', textX, textY);
    }

    // --- Main Curve ---
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let t = 0; t <= maxTime; t += 0.1) {
      const v = getVelocityAt(t);
      const { sx, sy } = mathToScreen(t, v);
      if (t === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // --- Gradient Triangle ---
    if (activeConcept === 'gradient') {
      const tG1 = 4;
      const tG2 = 14;
      const vG1 = getVelocityAt(tG1);
      const vG2 = getVelocityAt(tG2);
      const pG1 = mathToScreen(tG1, vG1);
      const pG2 = mathToScreen(tG2, vG2);
      const pCorner = mathToScreen(tG2, vG1);

      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pG1.sx, pG1.sy);
      ctx.lineTo(pCorner.sx, pCorner.sy);
      ctx.lineTo(pG2.sx, pG2.sy);
      ctx.stroke();
      
      // Gradient Fill
      ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
      ctx.fill();

      // Delta Labels
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#1d4ed8';
      ctx.textAlign = 'center';
      ctx.fillText(`\u0394t = ${(tG2-tG1).toFixed(0)}s`, pG1.sx + (pCorner.sx - pG1.sx)/2, pCorner.sy + 20);
      ctx.textAlign = 'left';
      ctx.fillText(`\u0394v = ${(vG2-vG1).toFixed(1)}m/s`, pCorner.sx + 12, pG1.sy + (pG2.sy - pG1.sy)/2);
      ctx.restore();
    }

    // --- Interactive Probe ---
    if (probeT !== null) {
      const vAtT = getVelocityAt(probeT);
      const { sx, sy } = mathToScreen(probeT, vAtT);

      // Probe Lines
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, mt); ctx.lineTo(sx, mt + chartH);
      ctx.moveTo(marginLeft, sy); ctx.lineTo(marginLeft + chartW, sy);
      ctx.stroke();
      ctx.restore();

      // Probe Point
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Labels
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      
      const tLabel = `${probeT.toFixed(1)}s`;
      const tW = ctx.measureText(tLabel).width;
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath(); ctx.roundRect(sx - tW/2 - 8, mt + chartH + 5, tW + 16, 22, 6); ctx.fill();
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText(tLabel, sx, mt + chartH + 20);

      const vLabel = `${vAtT.toFixed(1)} m/s`;
      const vW = ctx.measureText(vLabel).width;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.roundRect(marginLeft - vW - 30, sy - 11, vW + 16, 22, 6); ctx.fill();
      ctx.fillStyle = 'white';
      ctx.textAlign = 'right';
      ctx.fillText(vLabel, marginLeft - 20, sy + 1);
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

    const getMouseCoords = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return {
        mx: clientX - rect.left,
        my: clientY - rect.top
      };
    };

    const handleStart = (e: MouseEvent | TouchEvent) => {
      const { mx } = getMouseCoords(e);
      const marginLeft = 95;
      const chartW = canvas.clientWidth - marginLeft - 40;
      if (mx >= marginLeft - 20 && mx <= marginLeft + chartW + 20) {
        setIsDragging(true);
        const t = ((mx - marginLeft) / chartW) * maxTime;
        setProbeT(Math.max(0, Math.min(maxTime, t)));
      }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const { mx } = getMouseCoords(e);
      const marginLeft = 95;
      const chartW = canvas.clientWidth - marginLeft - 40;
      const isOver = mx >= marginLeft && mx <= marginLeft + chartW;
      setIsHoveringGraph(isOver);
      if (isDragging) {
        const t = ((mx - marginLeft) / chartW) * maxTime;
        setProbeT(Math.max(0, Math.min(maxTime, t)));
      }
    };

    const handleEnd = () => setIsDragging(false);

    canvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', handleStart);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      canvas.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [initialVelocity, acceleration, probeT, isDragging, plotMaxV, plotMinV, activeConcept]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 lg:p-10 flex flex-col items-center">
      <div className="max-w-[1600px] w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* LEFT AREA: Visualization & Controls (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            <div className="flex flex-col gap-2 mb-2">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                  <Activity size={24} className="text-white" />
                </div>
                <h1 className="text-2xl font-black uppercase tracking-tighter">Kinematics <span className="text-blue-500">Analyzer</span></h1>
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.4em] ml-1">Velocity-Time Graph Exploration</p>
            </div>
            
            {/* Graph Card */}
            <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 shadow-inner relative group">
              <div className="absolute top-6 right-6 flex gap-3 z-10">
                <button 
                  onClick={() => setIsNonUniform(!isNonUniform)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                    isNonUniform 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                  }`}
                >
                  MODE: {isNonUniform ? 'CURVED' : 'LINEAR'}
                </button>
                <button 
                  onClick={() => setProbeT(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-500 rounded-xl border border-slate-200 shadow-sm transition-all active:scale-95 flex items-center gap-2 group/btn"
                >
                  <RotateCcw size={12} className="group-hover/btn:rotate-180 transition-transform duration-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Reset Tool</span>
                </button>
              </div>

              <div className="relative mb-4">
                <canvas 
                  ref={canvasRef} 
                  className={`w-full aspect-[4/3] touch-none transition-colors rounded-xl ${
                    isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
                  }`} 
                />
              </div>

              {/* Tips Section embedded in Left Column */}
              <motion.div 
                key={tipIndex}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={rotateTip}
                className="px-6 py-5 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center gap-5 text-[11px] text-slate-600 italic cursor-pointer hover:bg-blue-50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Info size={18} className="text-blue-600" />
                </div>
                <p className="flex-1">
                  <strong className="text-blue-700 not-italic uppercase font-black tracking-widest mr-2">Pro Tip:</strong> {graphTips[tipIndex]}
                  <span className="block mt-1 text-[9px] text-slate-400 not-italic uppercase font-bold tracking-tighter">Click to rotate tips</span>
                </p>
              </motion.div>
            </div>

            {/* Lab Controls Section */}
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <Sliders size={20} className="text-blue-500" />
                <h2 className="font-black uppercase text-sm tracking-[0.2em] text-slate-700">Lab Controls</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Velocity Control */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <label>Initial Velocity (u)</label>
                    <span className="text-blue-600 font-bold text-xs">{initialVelocity} m/s</span>
                  </div>
                  <input 
                    type="range" min="0" max="80" step="5"
                    value={initialVelocity}
                    onChange={(e) => setInitialVelocity(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                  />
                  <p className="text-[9px] text-slate-400 font-medium italic">Velocity of the object at t = 0s</p>
                </div>

                {/* Acceleration Control */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <label>Acceleration (a)</label>
                    <span className="text-blue-500 font-bold text-xs">{acceleration.toFixed(1)} m/s²</span>
                  </div>
                  <input 
                    type="range" min="-10" max="10" step="0.5"
                    value={acceleration}
                    onChange={(e) => setAcceleration(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-500"
                  />
                  <p className="text-[9px] text-slate-400 font-medium italic">Rate of change of velocity per second</p>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-4">
                <button
                  onClick={() => {
                    setAcceleration(0);
                    setIsConstantSpeed(true);
                  }}
                  className={`px-6 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    acceleration === 0 && !isNonUniform
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  Constant Velocity (a=0)
                </button>
                <button
                  onClick={() => applyPreset(0, 5)}
                  className="px-6 py-3 rounded-xl border border-slate-200 bg-white text-slate-500 text-[10px] font-black uppercase tracking-widest hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                >
                  High Acceleration
                </button>
                <button
                  onClick={() => applyPreset(60, -5)}
                  className="px-6 py-3 rounded-xl border border-slate-200 bg-white text-slate-500 text-[10px] font-black uppercase tracking-widest hover:border-rose-300 hover:bg-rose-50 transition-all"
                >
                  Emergency Braking
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR: Situation & Theory (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-10">
            
            <button 
              onClick={onBack}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-slate-50 border-2 border-slate-100 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 group text-slate-500 hover:text-blue-600"
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Exit to Experiments Hub
            </button>
            
            {/* Teacher's Guide / Situation Report */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <HelpCircle size={20} className="text-blue-500" />
                <h2 className="font-black uppercase text-sm tracking-[0.2em] text-slate-700">Teacher's Guide</h2>
              </div>

              <motion.div 
                key={scenario.title}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-amber-50 p-5 rounded-2xl border border-amber-200 shadow-sm space-y-4 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-100/50 rotate-45 translate-x-10 -translate-y-10" />
                
                <div className="relative z-10 space-y-3">
                  <header className="space-y-1">
                    <h3 className="font-black text-[8px] uppercase tracking-[0.2em] text-amber-700">Model Analysis</h3>
                    <p className="text-lg font-black text-amber-950 leading-tight uppercase tracking-tighter italic">{scenario.title}</p>
                  </header>

                  <div className="space-y-2">
                    <section className="space-y-1">
                      <h4 className="font-bold text-[8px] uppercase tracking-widest text-amber-600">Observation</h4>
                      <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                        Looking at the graph, you can see <span className="font-black underline">{scenario.visual}</span>. 
                      </p>
                    </section>
                    
                    <section className="space-y-1 border-t border-amber-200/50 pt-2">
                      <h4 className="font-bold text-[8px] uppercase tracking-widest text-amber-600">The Physics</h4>
                      <p className="text-[11px] text-amber-900 leading-relaxed italic">
                        "{scenario.physics}"
                      </p>
                    </section>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Analysis Vectors (Concept Selector) */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <Activity size={20} className="text-blue-500" />
                <h2 className="font-black uppercase text-sm tracking-[0.2em] text-slate-700">Analysis Vectors</h2>
              </div>
              
              <div className="flex flex-col gap-3">
                {concepts.map((concept) => (
                  <button
                    key={concept.id}
                    onClick={() => setActiveConcept(concept.id as any)}
                    className={`w-full p-5 rounded-[2rem] border text-left transition-all flex items-center gap-6 group ${
                      activeConcept === concept.id 
                      ? 'bg-slate-950 border-slate-900 text-white shadow-2xl scale-[1.02]' 
                      : 'bg-white border-slate-100 hover:border-blue-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all ${activeConcept === concept.id ? 'bg-blue-600 rotate-6' : 'bg-slate-100'}`}>
                       {React.cloneElement(concept.icon as React.ReactElement, { size: 28, className: activeConcept === concept.id ? 'text-white' : 'text-slate-400' })}
                    </div>
                    <div>
                      <div className="text-[12px] font-black uppercase tracking-widest leading-none mb-2">{concept.title}</div>
                      <div className={`text-[10px] font-medium leading-tight opacity-70 ${activeConcept === concept.id ? 'text-slate-400' : 'text-slate-400'}`}>{concept.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Telemetry Display */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-5">
               <div className="flex items-center gap-3">
                  <Activity size={18} className="text-blue-400" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Synthesis Telemetry</h3>
               </div>
               <div className="grid grid-cols-1 gap-3">
                  <div className="p-4 bg-white/[0.05] border border-white/10 rounded-xl flex justify-between items-center group transition-all">
                     <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Velocity (v)</span>
                     <span className="text-2xl font-black text-blue-400 tabular-nums tracking-tighter">{getVelocityAt(probeT || 10).toFixed(1)} <span className="text-[10px] opacity-50">m/s</span></span>
                  </div>
                  <div className="p-4 bg-white/[0.05] border border-white/10 rounded-xl flex justify-between items-center group transition-all">
                     <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Displacement (s)</span>
                     <span className="text-2xl font-black text-white tabular-nums tracking-tighter">{getDisplacementAt(probeT || 10).toFixed(0)} <span className="text-[10px] opacity-50">meters</span></span>
                  </div>
               </div>
            </div>

          </div>
        </div>          {/* THEORETICAL WALL: Simplified Formula Guide */}
          <div className="mt-8 bg-slate-900 rounded-2xl p-6 lg:p-8 text-white shadow-xl relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.05),transparent_50%)]" />
             
             <div className="flex flex-col lg:flex-row gap-8 items-center relative z-10">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-blue-600/20 text-blue-400 text-[9px] font-black uppercase tracking-[0.4em] rounded-full border border-blue-600/30">Equation Reference</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <div className="bg-black/30 p-6 rounded-xl border border-white/5 text-center">
                    <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3">The Equation of Motion</div>
                    <div className="text-3xl font-mono text-white tracking-tighter"><InlineMath math="v = u + at" /></div>
                    <div className="mt-4 text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                      Final Velocity = Initial Velocity + (Acceleration × Time)
                    </div>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3 group hover:border-blue-500/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <Activity size={16} className="text-blue-400" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gradient Analysis</span>
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-white leading-tight mb-1">Acceleration =</div>
                      <div className="text-[10px] font-bold text-blue-400 italic">(Final Speed - Initial Speed) ÷ Time</div>
                    </div>
                  </div>

                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3 group hover:border-indigo-500/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <Ruler size={16} className="text-indigo-400" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Distance Analysis</span>
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-white leading-tight mb-1">Distance =</div>
                      <div className="text-[10px] font-bold text-indigo-400 italic">Total Area under Graph Pattern</div>
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
        <div className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.4em]">Syllabus Core: Motion, Forces & Energy</div>
      </div>
    </div>
  );
};
