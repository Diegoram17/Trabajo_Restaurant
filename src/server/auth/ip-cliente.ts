/**
 * Trusted-client-IP resolution over `X-Forwarded-For` (design "Technical
 * approach", spec: access-throttling "Trusted Client IP Resolution"). This
 * is the real new trust boundary this item adds: the header is
 * client-controllable end to end, so only the hop the TRUSTED EDGE itself
 * observed may be read -- everything to its left is caller-supplied and
 * MUST NOT be trusted for the `ip` lockout anchor.
 */
import type { IncomingMessage } from 'node:http';

/**
 * The fail-closed bucket key (design "Threat matrix"): an unresolvable
 * address is counted against this ONE shared key, never left uncounted --
 * "no counter" is exactly the hole a client-controlled header could open.
 */
export const IP_DESCONOCIDA = 'desconocida';

const PREFIJO_IPV4_MAPEADA = '::ffff:';

function normalizarIp(ip: string): string {
  const recortada = ip.trim();
  return recortada.toLowerCase().startsWith(PREFIJO_IPV4_MAPEADA)
    ? recortada.slice(PREFIJO_IPV4_MAPEADA.length)
    : recortada;
}

/**
 * Takes the entry `hops` positions from the RIGHT of `X-Forwarded-For` --
 * position 1 is the rightmost hop, the one the trusted edge itself
 * appended. Falls back to `req.socket.remoteAddress` when the header is
 * absent entirely. `::ffff:`-mapped IPv4 addresses are normalised on
 * either path. Never returns "no counter": a header present but shorter
 * than `hops`, or a header-less request with no socket address either,
 * both resolve to {@link IP_DESCONOCIDA}.
 */
export function resolveClientIp(req: IncomingMessage, hops: number): string {
  const encabezado = req.headers['x-forwarded-for'];
  const crudo = Array.isArray(encabezado) ? encabezado.join(',') : encabezado;

  if (crudo === undefined) {
    const remoto = req.socket.remoteAddress;
    return remoto === undefined ? IP_DESCONOCIDA : normalizarIp(remoto);
  }

  const saltos = crudo
    .split(',')
    .map((salto) => salto.trim())
    .filter((salto) => salto.length > 0);
  const indice = saltos.length - hops;
  const elegido = indice >= 0 ? saltos[indice] : undefined;
  return elegido === undefined ? IP_DESCONOCIDA : normalizarIp(elegido);
}
