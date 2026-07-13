type VinylLogoProps = {
  className?: string;
};

export default function VinylLogo({ className = "" }: VinylLogoProps) {
  return (
    <svg
      viewBox="0 0 190 92"
      role="img"
      aria-label="Vinyl"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="5"
        y="67"
        fill="currentColor"
        fontFamily="Segoe Print, Comic Sans MS, cursive"
        fontSize="48"
        fontWeight="400"
        letterSpacing="-3"
      >
        vinyl
      </text>
      <path
        d="M133 5L147 30L178 25L158 49L176 76L145 66L124 87L125 57L97 43L127 34L133 5Z"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
