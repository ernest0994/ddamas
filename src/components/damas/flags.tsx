export const COUNTRIES = [
  { id: "do", name: "República Dominicana", short: "Dominicana" },
  { id: "pr", name: "Puerto Rico", short: "Puertorriqueña" },
  { id: "us", name: "Estados Unidos", short: "Americana" },
  { id: "cu", name: "Cuba", short: "Cubana" },
  { id: "mx", name: "México", short: "Mexicana" },
  { id: "co", name: "Colombia", short: "Colombiana" },
  { id: "ar", name: "Argentina", short: "Argentina" },
  { id: "es", name: "España", short: "Española" },
  { id: "br", name: "Brasil", short: "Brasileña" },
  { id: "sv", name: "El Salvador", short: "Salvadoreña" },
] as const;

export type CountryId = (typeof COUNTRIES)[number]["id"];

export function countryName(id: CountryId): string {
  return COUNTRIES.find((country) => country.id === id)?.short ?? id;
}

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const outer = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const inner = outer + Math.PI / 5;
    pts.push(`${cx + Math.cos(outer) * r},${cy + Math.sin(outer) * r}`);
    pts.push(`${cx + Math.cos(inner) * r * 0.38},${cy + Math.sin(inner) * r * 0.38}`);
  }
  return pts.join(" ");
}

export function FlagFace({ id }: { id: CountryId }) {
  if (id === "do") {
    return (
      <g>
        <rect width="100" height="100" fill="#fff" />
        <rect width="50" height="50" fill="#002D62" />
        <rect x="50" width="50" height="50" fill="#CE1126" />
        <rect y="50" width="50" height="50" fill="#CE1126" />
        <rect x="50" y="50" width="50" height="50" fill="#002D62" />
        <rect x="42" width="16" height="100" fill="#fff" />
        <rect y="42" width="100" height="16" fill="#fff" />
      </g>
    );
  }
  if (id === "pr" || id === "cu") {
    const stripe = id === "pr" ? ["#CE1126", "#fff", "#CE1126", "#fff", "#CE1126"] : ["#002D62", "#fff", "#002D62", "#fff", "#002D62"];
    const tri = id === "pr" ? "#002D62" : "#CE1126";
    return (
      <g>
        {stripe.map((fill, i) => (
          <rect key={i} y={i * 20} width="100" height="20" fill={fill} />
        ))}
        <polygon points="0,0 0,100 48,50" fill={tri} />
        <polygon points={star(16, 50, 11)} fill="#fff" />
      </g>
    );
  }
  if (id === "us") {
    const stripes = Array.from({ length: 13 }, (_, i) => (
      <rect key={i} y={(i * 100) / 13} width="100" height={100 / 13 + 0.4} fill={i % 2 ? "#fff" : "#B22234"} />
    ));
    return (
      <g>
        {stripes}
        <rect width="42" height={(7 * 100) / 13} fill="#3C3B6E" />
        <polygon points={star(8, 8, 3)} fill="#fff" />
        <polygon points={star(18, 8, 3)} fill="#fff" />
        <polygon points={star(28, 8, 3)} fill="#fff" />
        <polygon points={star(13, 16, 3)} fill="#fff" />
        <polygon points={star(23, 16, 3)} fill="#fff" />
        <polygon points={star(33, 16, 3)} fill="#fff" />
        <polygon points={star(8, 24, 3)} fill="#fff" />
        <polygon points={star(18, 24, 3)} fill="#fff" />
        <polygon points={star(28, 24, 3)} fill="#fff" />
        <polygon points={star(13, 32, 3)} fill="#fff" />
        <polygon points={star(23, 32, 3)} fill="#fff" />
        <polygon points={star(8, 40, 3)} fill="#fff" />
        <polygon points={star(18, 40, 3)} fill="#fff" />
        <polygon points={star(28, 40, 3)} fill="#fff" />
      </g>
    );
  }
  if (id === "mx") {
    return (
      <g>
        <rect width="33.4" height="100" fill="#006847" />
        <rect x="33.3" width="33.4" height="100" fill="#fff" />
        <rect x="66.6" width="33.4" height="100" fill="#CE1126" />
        <ellipse cx="50" cy="58" rx="4" ry="10" fill="#1d6b32" />
        <path d="M50 46c6-8 12-6 10 2-6 2-10 1-10-2z" fill="#1a1a1a" />
        <path d="M48 44c-2-6 4-8 6-2" fill="none" stroke="#1a1a1a" strokeWidth="1.6" />
      </g>
    );
  }
  if (id === "co") {
    return (
      <g>
        <rect width="100" height="50" fill="#FCD116" />
        <rect y="50" width="100" height="25" fill="#003893" />
        <rect y="75" width="100" height="25" fill="#CE1126" />
      </g>
    );
  }
  if (id === "ar") {
    return (
      <g>
        <rect width="100" height="33.4" fill="#74ACDF" />
        <rect y="33.3" width="100" height="33.4" fill="#fff" />
        <rect y="66.6" width="100" height="33.4" fill="#74ACDF" />
        <circle cx="50" cy="50" r="10" fill="#F6B40E" />
        <circle cx="50" cy="50" r="4" fill="#F6B40E" stroke="#c47d09" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <rect key={i} x="49" y="36" width="2" height="6" fill="#F6B40E" transform={`rotate(${(a * 180) / Math.PI} 50 50)`} />;
        })}
      </g>
    );
  }
  if (id === "es") {
    return (
      <g>
        <rect width="100" height="25" fill="#AA151B" />
        <rect y="25" width="100" height="50" fill="#F1BF00" />
        <rect y="75" width="100" height="25" fill="#AA151B" />
      </g>
    );
  }
  if (id === "br") {
    return (
      <g>
        <rect width="100" height="100" fill="#009C3B" />
        <polygon points="50,8 92,50 50,92 8,50" fill="#FFDF00" />
        <circle cx="50" cy="50" r="18" fill="#002776" />
        <path d="M32 54c12-8 24-8 36 0" fill="none" stroke="#fff" strokeWidth="3" />
        <polygon points={star(44, 46, 2.2)} fill="#fff" />
        <polygon points={star(56, 44, 2)} fill="#fff" />
        <polygon points={star(50, 54, 1.8)} fill="#fff" />
        <polygon points={star(40, 52, 1.6)} fill="#fff" />
        <polygon points={star(60, 52, 1.6)} fill="#fff" />
      </g>
    );
  }
  return (
    <g>
      <rect width="100" height="33.4" fill="#0047AB" />
      <rect y="33.3" width="100" height="33.4" fill="#fff" />
      <rect y="66.6" width="100" height="33.4" fill="#0047AB" />
      <polygon points="50,38 62,62 38,62" fill="#F6B40E" />
    </g>
  );
}
