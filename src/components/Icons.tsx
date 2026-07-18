import type { SVGProps } from "react";

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SpecIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M6 2.75h8l4 4V21.25H6zM14 2.75v4h4M9 11h6M9 14h6M9 17h4" {...base} />
    </svg>
  );
}

export function CanvasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="4" r="2.5" {...base} />
      <circle cx="5" cy="18.5" r="2.5" {...base} />
      <circle cx="19" cy="18.5" r="2.5" {...base} />
      <path d="M12 6.5v5M5 16v-4.5h14V16" {...base} />
    </svg>
  );
}

export function GapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 2.6 22 20.5H2zM12 8v5.5M12 17.5v.2" {...base} />
    </svg>
  );
}

export function FlaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M9 2.5h6M10 2.5v6L4.4 18.3A2 2 0 0 0 6.1 21h11.8a2 2 0 0 0 1.7-2.7L14 8.5v-6M8.2 12h7.6" {...base} />
    </svg>
  );
}
