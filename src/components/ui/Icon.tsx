const paths = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  clients: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8m6 10v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  projects: "M3 21V3h12v18M15 9h6v12M7 7h4M7 11h4M7 15h4M1 21h22",
  tasks: "M9 5h12M9 12h12M9 19h12M2 4l2 2 3-3M2 11l2 2 3-3M2 18l2 2 3-3",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  file: "M14 2H4v20h16V8l-6-6v6h6M8 13h8M8 17h6",
} as const;
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
