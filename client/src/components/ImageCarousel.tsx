// Product photo carousel & video viewer:
// - Swipe between photos with auto-slide (pauses on touch/interaction)
// - Watch Product Video tab/button
// - Full-screen interactive lightbox with zoom (Zoom In/Out, Reset, Double-tap 2.5x, Pinch-to-zoom, Drag-to-pan)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw, Video, Play, Image as ImageIcon } from 'lucide-react';

const AUTO_SLIDE_MS = 3500;
const RESUME_AFTER_MS = 6000;

function slideIndex(track: HTMLDivElement | null): number {
  if (!track || track.clientWidth === 0) return 0;
  return Math.round(track.scrollLeft / track.clientWidth);
}

function scrollToSlide(track: HTMLDivElement | null, i: number, smooth = true) {
  if (!track) return;
  track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}

const Dots: React.FC<{ count: number; active: number; onPick: (i: number) => void; light?: boolean }> = ({ count, active, onPick, light }) => (
  <div className="flex justify-center gap-1.5">
    {Array.from({ length: count }, (_, i) => (
      <button
        key={i}
        type="button"
        onClick={() => onPick(i)}
        aria-label={`Show photo ${i + 1}`}
        className={`h-1.5 rounded-full transition-all ${i === active ? `w-4 ${light ? 'bg-white' : 'bg-[#6B5744]'}` : `w-1.5 ${light ? 'bg-white/45' : 'bg-[#D2BFA7]'}`}`}
      />
    ))}
  </div>
);

// Individual Zoomable Image inside Lightbox
const ZoomableSlide: React.FC<{
  src: string;
  alt: string;
  isActive: boolean;
  scale: number;
  setScale: (fn: (s: number) => number) => void;
}> = ({ src, alt, isActive, scale, setScale }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startDrag = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);

  // Reset position when scale resets to 1 or slide becomes inactive
  useEffect(() => {
    if (scale <= 1 || !isActive) {
      setPos({ x: 0, y: 0 });
    }
  }, [scale, isActive]);

  // Double tap / double click to toggle 1x <-> 2.5x
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (scale > 1) {
      setScale(() => 1);
      setPos({ x: 0, y: 0 });
    } else {
      setScale(() => 2.5);
    }
  };

  // Mouse pan handling
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    isDragging.current = true;
    startDrag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || scale <= 1) return;
    setPos({
      x: e.clientX - startDrag.current.x,
      y: e.clientY - startDrag.current.y
    });
  };

  const onMouseUp = () => {
    isDragging.current = false;
  };

  // Touch pinch-to-zoom & pan handling
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDist.current = d;
    } else if (e.touches.length === 1 && scale > 1) {
      isDragging.current = true;
      startDrag.current = {
        x: e.touches[0].clientX - pos.x,
        y: e.touches[0].clientY - pos.y
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = d / lastTouchDist.current;
      setScale(s => Math.min(4, Math.max(1, s * factor)));
      lastTouchDist.current = d;
    } else if (e.touches.length === 1 && isDragging.current && scale > 1) {
      setPos({
        x: e.touches[0].clientX - startDrag.current.x,
        y: e.touches[0].clientY - startDrag.current.y
      });
    }
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    lastTouchDist.current = null;
  };

  return (
    <div
      className="w-full h-full shrink-0 snap-center flex items-center justify-center p-2 overflow-hidden select-none"
      onDoubleClick={handleDoubleClick}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: scale > 1 ? 'none' : 'pan-x' }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-full max-h-full object-contain transition-transform duration-100 ease-out select-none cursor-grab active:cursor-grabbing"
        style={{
          transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)`,
          transformOrigin: 'center center'
        }}
      />
    </div>
  );
};

// Full-screen preview with pinch-to-zoom, zoom buttons, double-tap, and pan
const Lightbox: React.FC<{ images: string[]; start: number; alt: string; onClose: () => void }> = ({ images, start, alt, onClose }) => {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(start);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    scrollToSlide(track.current, start, false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && scale === 1) scrollToSlide(track.current, Math.min(images.length - 1, slideIndex(track.current) + 1));
      if (e.key === 'ArrowLeft' && scale === 1) scrollToSlide(track.current, Math.max(0, slideIndex(track.current) - 1));
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [scale]);

  const onSlideChange = () => {
    const idx = slideIndex(track.current);
    if (idx !== active) {
      setActive(idx);
      setScale(1); // Reset zoom on slide change
    }
  };

  const handleZoomIn = () => setScale(s => Math.min(4, Number((s + 0.5).toFixed(1))));
  const handleZoomOut = () => setScale(s => Math.max(1, Number((s - 0.5).toFixed(1))));
  const handleResetZoom = () => setScale(1);

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col backdrop-blur-sm" role="dialog" aria-label="Photo preview">
      {/* Top Bar with counter, zoom controls and close */}
      <div className="flex items-center justify-between px-4 py-3 text-white border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{active + 1} / {images.length}</span>
          {scale > 1 && (
            <span className="px-2 py-0.5 rounded-full bg-[#6B5744] text-[10px] font-bold">
              {Math.round(scale * 100)}%
            </span>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2 py-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 1}
            aria-label="Zoom Out"
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            disabled={scale === 1}
            aria-label="Reset Zoom"
            className="px-2 py-0.5 text-[11px] font-bold rounded-md hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
          >
            <RotateCcw size={12} /> {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 4}
            aria-label="Zoom In"
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          aria-label="Close preview"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Track */}
      <div
        ref={track}
        onScroll={onSlideChange}
        className={`flex-1 flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          scale > 1 ? 'overflow-hidden' : 'snap-x snap-mandatory'
        }`}
      >
        {images.map((src, i) => (
          <ZoomableSlide
            key={src}
            src={src}
            alt={`${alt} photo ${i + 1}`}
            isActive={i === active}
            scale={i === active ? scale : 1}
            setScale={setScale}
          />
        ))}
      </div>

      {/* Bottom Hint & Dots */}
      <div className="py-3 px-4 flex flex-col items-center gap-2 border-t border-white/10">
        <p className="text-[11px] text-white/60">
          Double-tap or pinch to zoom · Drag to pan around
        </p>
        {images.length > 1 && (
          <Dots
            count={images.length}
            active={active}
            onPick={i => {
              setScale(1);
              scrollToSlide(track.current, i);
            }}
            light
          />
        )}
      </div>
    </div>
  );
};

export const ImageCarousel: React.FC<{
  images: string[];
  video?: string | null;
  alt: string;
  className?: string;
}> = ({ images, video, alt, className = '' }) => {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'photos' | 'video'>('photos');
  const pausedUntil = useRef(0);
  const count = images.length;

  const pause = useCallback(() => { pausedUntil.current = Date.now() + RESUME_AFTER_MS; }, []);
  const go = (i: number) => {
    pause();
    scrollToSlide(track.current, (i + count) % count);
  };

  // Slide on its own, like a shop banner; not while touched, previewed, or showing video
  useEffect(() => {
    if (count < 2 || preview !== null || viewMode === 'video') return;
    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntil.current || document.hidden) return;
      const next = (slideIndex(track.current) + 1) % count;
      scrollToSlide(track.current, next, next !== 0);
    }, AUTO_SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, preview, viewMode]);

  if (count === 0 && !video) {
    return (
      <div className={`aspect-square rounded-2xl bg-[#E8DCCB]/60 border border-[#D2BFA7] flex items-center justify-center text-[#6B5744] font-bold ${className}`}>
        AI925
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Media Type Switcher when video is available */}
      {video && (
        <div className="flex items-center gap-1.5 mb-2.5 p-1 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setViewMode('photos')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'photos'
                ? 'bg-[#6B5744] text-white shadow-xs'
                : 'text-[#766B60] hover:text-[#2F2923]'
            }`}
          >
            <ImageIcon size={13} /> Photos ({count})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('video')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'video'
                ? 'bg-[#6B5744] text-white shadow-xs'
                : 'text-[#766B60] hover:text-[#2F2923]'
            }`}
          >
            <Video size={13} /> Product Video
          </button>
        </div>
      )}

      {/* Video View */}
      {viewMode === 'video' && video ? (
        <div className="relative rounded-2xl overflow-hidden border border-[#D2BFA7] bg-black aspect-square flex items-center justify-center shadow-sm">
          <video
            src={video}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        /* Photos Carousel View */
        <div className="relative rounded-2xl overflow-hidden border border-[#D2BFA7] bg-white shadow-sm">
          <div
            ref={track}
            onScroll={() => setActive(slideIndex(track.current))}
            onPointerDown={pause}
            onTouchStart={pause}
            className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setPreview(i)}
                className="w-full shrink-0 snap-center aspect-square cursor-zoom-in group relative"
                aria-label={`Open photo ${i + 1} of ${count}`}
              >
                <img
                  src={src}
                  alt={`${alt} photo ${i + 1}`}
                  className="w-full h-full object-cover select-none"
                  draggable={false}
                />
                <span className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[10px] font-semibold flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={12} /> Tap to zoom
                </span>
              </button>
            ))}
          </div>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(active - 1)}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#2F2923] shadow-sm flex items-center justify-center transition-transform active:scale-90"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => go(active + 1)}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#2F2923] shadow-sm flex items-center justify-center transition-transform active:scale-90"
              >
                <ChevronRight size={18} />
              </button>
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-semibold">
                {active + 1}/{count}
              </span>
            </>
          )}

          {/* Quick jump to video badge if video is available */}
          {video && (
            <button
              type="button"
              onClick={() => setViewMode('video')}
              className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-black/70 hover:bg-black text-white text-[11px] font-bold flex items-center gap-1 backdrop-blur-xs shadow-sm transition-all"
            >
              <Play size={10} fill="white" /> Watch Video
            </button>
          )}
        </div>
      )}

      {/* Dots navigation */}
      {viewMode === 'photos' && count > 1 && (
        <div className="mt-2.5">
          <Dots count={count} active={active} onPick={go} />
        </div>
      )}

      {/* Full-screen Lightbox Zoom Modal */}
      {preview !== null && (
        <Lightbox
          images={images}
          start={preview}
          alt={alt}
          onClose={() => {
            setPreview(null);
            pause();
          }}
        />
      )}
    </div>
  );
};
