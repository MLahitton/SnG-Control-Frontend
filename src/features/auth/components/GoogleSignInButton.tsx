"use client";

import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";
import { getGoogleClientId } from "@/lib/config/env";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function GoogleSignInButton() {
  const { signIn } = useAuth();
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  let clientId: string;
  try {
    clientId = getGoogleClientId();
  } catch {
    return <p role="alert" className="error-message">{process.env.NODE_ENV === "development"
      ? "Configura NEXT_PUBLIC_GOOGLE_CLIENT_ID en .env.local para habilitar Google Sign-In."
      : "El inicio de sesión no está disponible. Contacta al administrador."}</p>;
  }

  return (
    <GoogleOAuthProvider clientId={clientId} onScriptLoadSuccess={() => setReady(true)} onScriptLoadError={() => setGoogleError("No pudimos cargar Google. Comprueba tu conexión y recarga la página.")}>
      <div className="flex flex-col items-center gap-4">
        {!ready && !googleError && <p role="status" className="text-sm text-slate-600">Cargando acceso con Google…</p>}
        <GoogleLogin
          onSuccess={({ credential }) => {
            setGoogleError(null);
            if (credential) void signIn(credential);
            else setGoogleError("Google no pudo completar el acceso. Inténtalo de nuevo.");
          }}
          onError={() => setGoogleError("No se pudo iniciar sesión con Google. Inténtalo de nuevo.")}
          auto_select={false}
          useOneTap={false}
          theme="outline"
          size="large"
          text="signin_with"
        />
        {googleError && <p role="alert" className="error-message">{googleError}</p>}
      </div>
    </GoogleOAuthProvider>
  );
}
