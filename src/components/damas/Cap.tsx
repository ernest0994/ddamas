import { useId } from "react";
import { FlagFace, type CountryId } from "./flags";

export function Cap({
  country,
  metal,
  king,
  lift,
  crowned,
}: {
  country: CountryId;
  metal: "gold" | "silver" | "steel";
  king: boolean;
  lift?: boolean;
  crowned?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const n = 28;
  const edge = metal === "gold" ? "#f0c14b" : metal === "silver" ? "#d5dee8" : "#c8bfb2";
  const edgeDark = metal === "gold" ? "#8a5a10" : metal === "silver" ? "#3e4c5c" : "#5a5046";
  let d = "";
  for (let i = 0; i < n; i++) {
    const left = (i / n) * Math.PI * 2;
    const mid = ((i + 0.5) / n) * Math.PI * 2;
    const x0 = 50 + Math.cos(left) * 44;
    const y0 = 50 + Math.sin(left) * 44;
    const x1 = 50 + Math.cos(mid) * 50;
    const y1 = 50 + Math.sin(mid) * 50;
    d += `${i === 0 ? "M" : "L"}${x0.toFixed(2)} ${y0.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)} `;
  }
  d += "Z";

  return (
    <svg
      viewBox="0 0 100 100"
      className={`cap ${king ? "is-king" : "is-man"} ${lift ? "is-lift" : ""} ${crowned ? "is-crowning" : ""}`}
      aria-hidden
    >
      <path d={d} fill={edge} stroke={edgeDark} strokeWidth="0.6" />
      <circle cx="50" cy="50" r="43" fill={edgeDark} />
      <defs>
        <clipPath id={`face-${uid}`}>
          <circle cx="50" cy="50" r="39" />
        </clipPath>
        <clipPath id={`liner-${uid}`}>
          <circle cx="50" cy="50" r="22" />
        </clipPath>
      </defs>
      {king ? (
        <>
          <circle cx="50" cy="50" r="43" fill={metal === "gold" ? "#d7dde2" : "#c5ccd1"} />
          <circle cx="50" cy="50" r="36" fill="#8b949b" />
          <circle cx="50" cy="50" r="30" fill="#f3eee4" />
          <g clipPath={`url(#liner-${uid})`}>
            <g transform="translate(28 28) scale(0.44)">
              <FlagFace id={country} />
            </g>
          </g>
        </>
      ) : (
        <>
          <g clipPath={`url(#face-${uid})`}>
            <g transform="translate(10 10) scale(0.8)">
              <FlagFace id={country} />
            </g>
          </g>
          <circle cx="50" cy="50" r="39" fill="none" stroke={edge} strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}
