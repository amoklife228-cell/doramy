import { useState } from 'react';
import { posterUrl } from '../lib/tmdb';

export function Poster({
  path,
  alt,
  size = 'w342',
  className = '',
}: {
  path: string | null | undefined;
  alt: string;
  size?: 'w185' | 'w342' | 'w500';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = posterUrl(path, size);
  if (!url || failed) {
    return (
      <div className={`poster poster-empty ${className}`} aria-label={alt}>
        🎞
      </div>
    );
  }
  return (
    <img
      className={`poster ${className}`}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
