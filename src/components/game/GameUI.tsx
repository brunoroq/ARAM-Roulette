import { assets } from '../../assets.ts';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function GameButton({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return <button className={`game-button ${variant} ${className}`} {...props} />;
}

export function GamePanel({ paper = false, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { paper?: boolean }) {
  return <div className={`game-panel ${paper ? 'paper' : ''} ${className}`} {...props} />;
}

export function StickerLabel({ children, tone = 'paper', className = '' }: { children: ReactNode; tone?: 'paper' | 'pink' | 'cyan'; className?: string }) {
  return <span className={`sticker sticker-${tone} ${className}`}>{children}</span>;
}

export function ComicHeading({ children, accent, className = '' }: { children: ReactNode; accent?: string; className?: string }) {
  return <h1 className={`comic-heading ${className}`}>{children}{accent && <><br /><span>{accent}</span></>}</h1>;
}

export function VersusBadge({ children }: { children: ReactNode }) {
  return <div className="versus" aria-hidden="true"><span>{children}</span></div>;
}

export function ResourcePips({ remaining, total, label }: { remaining: number; total: number; label: string }) {
  return <span className="resource-pips" role="img" aria-label={label}>
    {Array.from({ length: total }, (_, index) => <span key={index} className={index < remaining ? 'available' : ''} aria-hidden="true" />)}
  </span>;
}

/** Shared atmosphere. Decorative only; never captures input. */
export function GameBackdrop() {
  return <div className="game-backdrop" aria-hidden="true" style={{ backgroundImage: `linear-gradient(110deg, #061322b3, #06132288), url("${assets.background}")` }} />;
}
