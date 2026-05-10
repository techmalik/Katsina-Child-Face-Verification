interface KatsinaMapProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
}

export function KatsinaMap({ className, size = 48, strokeWidth = 2, filled = true }: KatsinaMapProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Katsina State outline"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    >
      <path d="
        M 36,30
        L 48,18
        L 62,12
        L 80,10
        L 98,12
        L 116,16
        L 130,24
        L 142,36
        L 150,50
        L 155,66
        L 154,82
        L 148,98
        L 138,112
        L 125,124
        L 115,132
        L 122,144
        L 128,158
        L 120,168
        L 108,172
        L 96,168
        L 88,158
        L 80,150
        L 70,158
        L 62,168
        L 50,172
        L 38,168
        L 28,158
        L 24,146
        L 30,134
        L 40,124
        L 30,112
        L 22,98
        L 18,82
        L 18,66
        L 22,50
        Z
      " />
      <circle cx="100" cy="92" r="8" fill={filled ? "white" : "currentColor"} opacity="0.4" />
    </svg>
  );
}
