import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { buildAssemblyPdf } from './assemblyPdf';
import { orderPdfInput } from './orderPdf';
import type { LeadStore } from './types';

/**
 * D-12: the customer's link to the assembly instructions (QR on the "submitted" screen):
 * GET /api/assembly?id=DFN-…&t=<token>. The token is an HMAC of the application ID, so IDs
 * cannot be guessed into other customers' instructions. The PDF holds no personal data (only
 * the furniture), and the key is derived from a secret the server already has (no new env var).
 */
export const ASSEMBLY_PATH = '/api/assembly';
const ID_RE = /^[A-Z]{2,5}-\d{6}-[A-Z0-9]{3,8}$/;

/** HMAC key from an existing server secret (the Google service-account private key). */
export function linkSecretFrom(material: string): string {
  return createHash('sha256').update(`dafna-assembly-link:${material}`).digest('base64');
}

export function assemblyToken(id: string, secret: string): string {
  return createHmac('sha256', secret).update(`assembly:${id}`).digest('base64url').slice(0, 22);
}

export function assemblyPath(id: string, secret: string): string {
  return `${ASSEMBLY_PATH}?id=${encodeURIComponent(id)}&t=${assemblyToken(id, secret)}`;
}

function validToken(id: string, token: string, secret: string): boolean {
  const want = Buffer.from(assemblyToken(id, secret));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export interface AssemblyDeps {
  store: Pick<LeadStore, 'findById'>;
  secret: string;
  log?: (event: string, detail?: Record<string, unknown>) => void;
}

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function handleAssembly(req: Request, deps: AssemblyDeps): Promise<Response> {
  if (req.method !== 'GET') return text(405, 'method not allowed');
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('t') ?? '';
  if (!ID_RE.test(id) || !validToken(id, token, deps.secret)) return text(404, 'not found');
  let lead;
  try {
    lead = await deps.store.findById(id);
  } catch (e) {
    deps.log?.('assembly_lookup_failed', { message: (e as Error).message });
    return text(503, 'try again later');
  }
  const input = lead ? orderPdfInput(lead) : null;
  if (!lead || !input) return text(404, 'not found');
  const pdf = await buildAssemblyPdf({
    id: lead.id,
    lang: lead.lang === 'ru' ? 'ru' : 'uz',
    template: input.template,
    params: input.params,
    result: input.result,
  });
  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="Dafna-${lead.id}.pdf"`,
      'cache-control': 'private, max-age=3600',
    },
  });
}
