import React, { useEffect, useRef, useState } from 'react';

// Only retain successful retry URLs, never negative-cache a transient failure.
// Image bytes and their expiry remain managed by the browser HTTP cache.
const successes = new Map<string, { src: string; expires: number }>();
function cachedSource(url: string): string {
  const cached = successes.get(url);
  if (cached && cached.expires > Date.now()) return cached.src;
  successes.delete(url);
  return url;
}

/** Shared by place, editor and trip thumbnails. Remount when the URL changes. */
export default function BasemapImage({ url, alt }: { url: string; alt: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState(() => cachedSource(url));
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'waiting'>('loading');

  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    // Unlike Chromium's generous lazy-load threshold, only request nearby cards.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root: el.closest('.lac-roadmap-list-wrapper'), rootMargin: '160px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || status !== 'loading') return;
    const timer = setTimeout(() => setStatus('waiting'), 20000);
    return () => clearTimeout(timer);
  }, [visible, status, src]);

  useEffect(() => {
    if (status !== 'waiting') return;
    successes.delete(url);
    if (attempt >= 3) { setStatus('error'); return; }
    const timer = setTimeout(() => {
      setAttempt(n => n + 1);
      setSrc(`${url}${url.includes('?') ? '&' : '?'}_r=${Date.now()}`);
      setStatus('loading');
    }, 500 * 2 ** attempt + Math.random() * 400);
    return () => clearTimeout(timer);
  }, [status, attempt, url]);

  const retry = () => {
    setAttempt(0);
    setSrc(`${url}${url.includes('?') ? '&' : '?'}_r=${Date.now()}`);
    setStatus('loading');
  };
  useEffect(() => {
    if (status !== 'error') return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [status, url]);

  return <span ref={host} style={{ display: 'block', width: '100%', height: '100%' }}>
    {((visible && status === 'loading') || status === 'loaded') ? <img
      key={src} src={src} alt={alt} className="lac-card-map-image"
      draggable={false} decoding="async"
      onLoad={() => {
        successes.delete(url);
        successes.set(url, { src, expires: Date.now() + 10 * 60 * 1000 });
        if (successes.size > 128) successes.delete(successes.keys().next().value!);
        setStatus('loaded');
      }}
      onError={() => setStatus('waiting')}
    /> : <span className="lac-card-map-placeholder">
      {status === 'error' ? <span role="button" tabIndex={0}
        aria-label="重新加载地图" title="地图加载失败，点击重试"
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); retry(); }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); retry(); }
        }} style={{ position: 'relative', zIndex: 5, cursor: 'pointer' }}>↻</span>
        : <span className="lac-card-map-placeholder-text">map</span>}
    </span>}
  </span>;
}
