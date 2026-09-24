import net from 'node:net';

/**
 * Every range a fetch on a user's behalf must never reach.
 *
 * @remarks
 * - **Private, loopback, link-local and the rest**, from RFC 6890's
 *   special-purpose registry. 169.254.0.0/16 is the one that matters most: the
 *   cloud metadata endpoint lives there and hands out the box's credentials.
 * - **IPv6 too, including the two ways v6 smuggles a v4 address** — the
 *   `::ffff:` mapped form and the 64:ff9b:: NAT64 prefix — each checked again
 *   as the v4 address it carries.
 */
const blocked = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  // IPv4-compatible (deprecated) and the two NAT64 prefixes, whose tail is a
  // v4 address that may be a private one.
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  // Teredo and 6to4 tunnel to v4 addresses, and fec0::/10 is the old site-local.
  ['2001::', 32],
  ['2002::', 16],
  ['fec0::', 10],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const NAT64_V4 = /^64:ff9b::(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** True only for an address a public web server could have. */
export const isPublicAddress = (address: string): boolean => {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family !== 6) return false;
  const embedded = MAPPED_V4.exec(address)?.[1] ?? NAT64_V4.exec(address)?.[1];
  if (embedded !== undefined) return isPublicAddress(embedded);
  return !blocked.check(address, 'ipv6');
};
