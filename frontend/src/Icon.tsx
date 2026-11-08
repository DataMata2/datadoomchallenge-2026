import type { CSSProperties } from "react";
const paths = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 1 1 21 11.5ZM7 9h9M7 13h6",
  report:
    "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5",
  chart: "M4 4v16h16M8 15v-4M12 15V7M16 15V9",
  checklist: "M9 5h12M9 12h12M9 19h12M2 5l1 1 2-3M2 12l1 1 2-3M2 19l1 1 2-3",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4ZM8 12l3 3 5-6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  check: "m5 12 4 4L19 6",
  warning: "m12 3 10 18H2L12 3ZM12 9v5m0 3v.1",
  phone: "M6 3H3v4c0 8 6 14 14 14h4v-5l-5-2-2 3a14 14 0 0 1-7-7l3-2-2-5H6Z",
  close: "m6 6 12 12M18 6 6 18",
  file: "M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8M8 17h5",
  chevron: "m9 5 7 7-7 7",
  filter: "M3 5h18M6 12h12M9 19h6",
} as const;
export type IconName = keyof typeof paths;
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
