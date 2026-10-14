import "server-only";

export function getApiBaseUrl(): URL {
  const value = process.env.SNG_API_BASE_URL?.trim();
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error("Configura SNG_API_BASE_URL como URL absoluta HTTP/HTTPS sin credenciales, query ni fragmento.");
  }
}
