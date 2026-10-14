import type { Metadata } from "next";
import { AuthProvider } from "@/features/auth/context/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnG Control | Steel & Glass",
  description: "Acceso a SnG Control de Steel & Glass.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
