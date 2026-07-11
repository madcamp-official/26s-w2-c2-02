interface RoomiMascotProps {
  size?: number;
  /** 'smile' (default) or 'wink' — matches the break-screen expression. */
  mood?: 'smile' | 'wink';
}

/**
 * Roomi(루미) mascot — a friendly purple robot.
 * Hand-built SVG approximation of the Figma mascot (the original asset could
 * not be exported because the Figma export quota was exhausted).
 */
export function RoomiMascot({ size = 84, mood = 'smile' }: RoomiMascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 84 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="루미"
    >
      {/* antenna */}
      <line x1="42" y1="10" x2="42" y2="20" stroke="#8a7df0" strokeWidth="3" strokeLinecap="round" />
      <circle cx="42" cy="8" r="4" fill="#8a7df0" />
      {/* side ears */}
      <rect x="10" y="40" width="7" height="16" rx="3.5" fill="#b7abf6" />
      <rect x="67" y="40" width="7" height="16" rx="3.5" fill="#b7abf6" />
      {/* head */}
      <rect x="16" y="20" width="52" height="50" rx="20" fill="#b7abf6" />
      {/* face plate */}
      <rect x="22" y="27" width="40" height="36" rx="16" fill="#ffffff" />
      {/* eyes */}
      {mood === 'wink' ? (
        <>
          <circle cx="34" cy="43" r="3.6" fill="#3a2f7a" />
          <path d="M46 43q3.4 -4 6.8 0" stroke="#3a2f7a" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="34" cy="43" r="3.6" fill="#3a2f7a" />
          <circle cx="50" cy="43" r="3.6" fill="#3a2f7a" />
        </>
      )}
      {/* cheeks */}
      <circle cx="30" cy="50" r="2.6" fill="#f7b8cf" opacity="0.75" />
      <circle cx="54" cy="50" r="2.6" fill="#f7b8cf" opacity="0.75" />
      {/* smile */}
      <path d="M37 50q5 5 10 0" stroke="#3a2f7a" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
