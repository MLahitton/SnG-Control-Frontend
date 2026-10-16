import type { Caption } from "../live/connection";
import styles from "./Intelligence.module.css";

export function LiveTranscript({ captions }: { captions: Caption[] }) {
  const groups: Caption[] = [];
  for (const caption of captions) {
    const previous = groups.at(-1);
    if (previous?.role === caption.role) { previous.text += caption.text; previous.end = caption.end; }
    else groups.push({ ...caption });
  }
  return <section aria-label="Transcripción de voz en vivo">
    <h3 className="section-title">Conversación por voz</h3>
    {groups.map((caption) => <article key={caption.id} className={caption.role === "user" ? styles.userMessage : styles.assistantMessage}>
      <p className={styles.speaker}>{caption.role === "user" ? "Tú · voz" : "Intelligence · voz"}</p><p className={styles.answer}>{caption.text}</p>
    </article>)}
  </section>;
}
