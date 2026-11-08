export type SourceBody = { id: string; body: string };
export type Citation = { sourceId: string; quote: string };

export function checkCitations(pack: SourceBody[], citations: Citation[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (citations.length === 0) errors.push("no citations");
  const byId = new Map(pack.map((source) => [source.id, source.body]));
  for (const citation of citations) {
    const body = byId.get(citation.sourceId);
    if (!body) {
      errors.push(`unknown source ${citation.sourceId}`);
      continue;
    }
    if (citation.quote.length < 12 || !body.includes(citation.quote)) {
      errors.push(`quote is not an exact member of ${citation.sourceId}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
