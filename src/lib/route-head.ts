/** Metadados de `head` compartilhados por todas as rotas do AquaGraph. */
export function pageHead(title: string, description: string) {
  const fullTitle = `${title} — AquaGraph`;
  return () => ({
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  });
}
