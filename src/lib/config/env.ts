export function getGoogleClientId(): string {
  const value = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!value || value.startsWith("<")) {
    throw new Error("Configura NEXT_PUBLIC_GOOGLE_CLIENT_ID en .env.");
  }
  return value;
}
