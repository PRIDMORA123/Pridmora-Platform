export function IdentityPathMark({
  size = 34,
}: {
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 30C11 30 14.8 27.3 18.1 22.8C21.3 18.4 23.2 12.7 28.1 9.3C30.5 7.6 33.1 7 35 7"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
