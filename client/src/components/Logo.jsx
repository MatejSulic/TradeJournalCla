// Ascend mark (triangle outline + chevron), coloured via currentColor
export default function Logo({ className = '' }) {
  return (
    <svg viewBox="512 0 607 519" className={className} fill="currentColor" aria-label="Ascend">
      <path
        fillRule="evenodd"
        d="M816 0 L1119 519 L902 476 L816 519 L729 476 L512 519 Z M816 85 L599 457 L729 431 L816 475 L902 431 L1032 457 Z"
      />
      <path d="M729 344 H902 L816 387 Z" />
    </svg>
  );
}
