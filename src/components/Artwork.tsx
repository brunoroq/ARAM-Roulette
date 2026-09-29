import { useState } from 'react';

export function Artwork({ src, name, className = '' }: { src: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <span className={`artwork fallback ${className}`} role="img" aria-label={name}>{name.slice(0, 2)}</span>
    : <img className={`artwork ${className}`} src={`${import.meta.env.BASE_URL}${src}`} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}
