import React from "react";

/** `<picture>` with a sibling .webp (generated next to each PNG in /public). */
export default function Picture({
  src,
  alt = "",
  width,
  height,
  priority = false,
  className = "",
  sizes,
}) {
  const webp = src.replace(/\.(png|jpe?g)$/i, ".webp");
  return (
    <picture className={className}>
      {webp !== src && <source srcSet={webp} type="image/webp" sizes={sizes} />}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : undefined}
        sizes={sizes}
      />
    </picture>
  );
}
