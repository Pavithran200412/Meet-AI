import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  barColor?: string;
  width?: number;
  height?: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ 
  isActive, 
  barColor = '#ef4444', // Red-500 default
  width = 200, 
  height = 40 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let step = 0;

    const draw = () => {
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (!isActive) {
        // Draw a subtle flat line when inactive
        ctx.fillStyle = barColor;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
        ctx.globalAlpha = 1.0;
        return;
      }

      ctx.fillStyle = barColor;
      
      // Dynamic bars
      // Calculate bar width to fit the canvas width
      const barCount = Math.floor(width / 6); 
      const barWidth = (width / barCount) - 2;

      for (let i = 0; i < barCount; i++) {
        // Sine wave math for "fake" visualization
        // Combine a few sines for randomness feel
        const t = step * 0.2 + i * 0.5;
        const wave = Math.sin(t) * 0.5 + Math.sin(t * 2.5) * 0.3 + Math.sin(t * 0.5) * 0.2;
        
        // Map to positive height
        const normalizedHeight = Math.abs(wave);
        const barHeight = Math.max(4, normalizedHeight * height); 
        
        const x = i * (width / barCount);
        const y = (height - barHeight) / 2;
        
        ctx.fillRect(x, y, barWidth, barHeight);
      }
      
      step++;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, barColor, width, height]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="transition-opacity duration-300"
    />
  );
};