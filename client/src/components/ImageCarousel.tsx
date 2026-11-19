// Product photo carousel: swipe between photos, slides on its own every few seconds (pausing while touched),
// and a tap opens a full-screen preview that can be swiped too.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const AUTO_SLIDE_MS = 3500;
const RESUME_AFTER_MS = 6000;

// Index of the slide nearest the scroll position of a horizontal snap track
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

// Full-screen preview opened on a photo
const Lightbox: React.FC<{ images: string[]; start: number; alt: string; onClose: () => void }> = ({ images, start, alt, onClose }) => {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(start);

  useEffect(() => {
    scrollToSlide(track.current, start, false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') scrollToSlide(track.current, Math.min(images.length - 1, slideIndex(track.current) + 1));
      if (e.key === 'ArrowLeft') scrollToSlide(track.current, Math.max(0, slideIndex(track.current) - 1));
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" role="dialog" aria-label="Photo preview">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-xs font-semibold">{active + 1} / {images.length}</span>
        <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" aria-label="Close preview">
          <X size={18} />
        </button>
      </div>
      <div
        ref={track}
        onScroll={() => setActive(slideIndex(track.current))}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <div key={src} className="w-full h-full shrink-0 snap-center flex items-center justify-center p-2">
            <img src={src} alt={`${alt} photo ${i + 1}`} className="max-w-full max-h-full object-contain select-none" draggable={false} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="py-4">
          <Dots count={images.length} active={active} onPick={i => scrollToSlide(track.current, i)} light />
        </div>
      )}
    </div>
  );
};

export const ImageCarousel: React.FC<{ images: string[]; alt: string; className?: string }> = ({ images, alt, className = '' }) => {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const pausedUntil = useRef(0);
  const count = images.length;

  const pause = useCallback(() => { pausedUntil.current = Date.now() + RESUME_AFTER_MS; }, []);
  const go = (i: number) => {
    pause();
    scrollToSlide(track.current, (i + count) % count);
  };

  // Slide on its own, like a shop banner; not while touched, previewed or off screen
  useEffect(() => {
    if (count < 2 || preview !== null) return;
    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntil.current || document.hidden) return;
      const next = (slideIndex(track.current) + 1) % count;
      scrollToSlide(track.current, next, next !== 0);
    }, AUTO_SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, preview]);

  if (count === 0) {
    return (
      <div className={`aspect-square rounded-2xl bg-[#E8DCCB]/60 border border-[#D2BFA7] flex items-center justify-center text-[#6B5744] font-bold ${className}`}>AI925</div>
    );
  }

  return (
    <div className={className}>
      <div className="relative rounded-2xl overflow-hidden border border-[#D2BFA7] bg-white">
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
              className="w-full shrink-0 snap-center aspect-square cursor-zoom-in"
              aria-label={`Open photo ${i + 1} of ${count}`}
            >
              <img src={src} alt={`${alt} photo ${i + 1}`} className="w-full h-full object-cover select-none" draggable={false} />
            </button>
          ))}
        </div>
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(active - 1)} aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#2F2923] shadow-sm flex items-center justify-center">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => go(active + 1)} aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#2F2923] shadow-sm flex items-center justify-center">
              <ChevronRight size={18} />
            </button>
            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-semibold">{active + 1}/{count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="mt-2">
          <Dots count={count} active={active} onPick={go} />
        </div>
      )}
      {preview !== null && (
        <Lightbox images={images} start={preview} alt={alt} onClose={() => { setPreview(null); pause(); }} />
      )}
    </div>
  );
};
