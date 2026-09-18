# nginx

The reverse proxy in front of this app was configured by hand on each box and
existed nowhere else. That made it the one part of the deployment nobody could
review, diff or roll back — and it is the part that decides who reaches
`/admin`.

These files are **what is deployed** — pulled back from the box after the
change, not an aspiration. They are not applied automatically; copy them onto
the host, diff against what is there, and reload.

| repo file | box | on the box |
|---|---|---|
| `api.recipely.net.conf` | production | `sites-available/default` |
| `admin.recipely.net.conf` | production | `sites-available/admin.recipely.net` |
| `catch-all.conf` | production | `sites-available/recipely` |
| `dev-api.recipely.net.conf` | dev | `sites-enabled/dev-api.recipely.net` |

**Both boxes belong here, not just production.** `client_max_body_size` was set
on the dev box after a 2.2 MB photo was refused there, and stayed on that box
alone for over a month — in a file nothing tracked. The identical refusal was
then reported against production, where nobody could see that the answer already
existed one host over. Two configs in one folder is what makes a difference
between them something you can read.

A backup left in `sites-enabled/` is loaded like any other file: the dev box had
a `.bak-…` copy of its own vhost in there, so nginx logged a conflicting
`server_name` and ignored one of the two — meaning an edit to the wrong copy
would have changed nothing, silently. Backups go in `sites-available/`, which
nginx does not read.

## What each hostname is for

| hostname | Cloudflare | serves | why |
|---|---|---|---|
| `api.recipely.net` | DNS only | the API, **not** `/admin` | Cloudflare's origin timeout is 100 s, fixed on Free/Pro/Business. The Instagram import measures ~119 s, so proxying this hostname returns 524 on long imports. |
| `admin.recipely.net` | Proxied + Access | **only** `/admin` | Access authenticates people at the edge before a request reaches the box. It only works on a proxied hostname, which is why the panel gets its own. |
| `dev-api.recipely.net` | Proxied + Access | everything, dev box | Dev has no long-import traffic worth protecting from the 100 s ceiling. |

The split exists because Cloudflare's proxy is a **per-hostname** setting. There
is no way to proxy one path of a hostname and not another.

## The three rules that make the split safe

Each of these closes a hole the split would otherwise open.

1. **`/admin` returns 404 on `api.recipely.net`.** Without it, the panel stays
   reachable on the hostname that has no Access in front — the split would move
   the door rather than lock it.
2. **`CF-Connecting-IP` is cleared on the non-proxied hostname.** Nothing
   overwrites it there, so a caller can send any value. The app derives its
   rate-limit key from that header (see `client-ip.ts`), so a forged one lets an
   attacker pick a fresh key per request and never hit a limit. The app already
   ignores it at `PROXY_DEPTH=1`; clearing it here is the second lock.
3. **`PROXY_DEPTH` stays 1, and the admin block rewrites the chain to match.**
   The value is per process, but the two hostnames have different chain lengths
   — direct is one hop, through Cloudflare is two. Depth must stay 1 because
   `api.recipely.net` is direct, so the admin block forwards only the address
   Cloudflare reported instead of appending the edge. Both hostnames then land
   on the real client under the same arithmetic. This is the easiest thing here
   to get wrong, and getting it wrong is silent: the rate limit still runs, it
   just counts the wrong thing.
4. **`ssl_verify_client` is per server block.** Authenticated Origin Pulls
   belongs on the proxied hostnames only. Turning it on globally would reject
   the direct API traffic, which presents no Cloudflare certificate.

## Applying

```bash
# on the box, as root
cp api.recipely.net.conf   /etc/nginx/sites-available/
cp admin.recipely.net.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/admin.recipely.net.conf /etc/nginx/sites-enabled/
diff -u /etc/nginx/sites-enabled/<current-api-conf> /etc/nginx/sites-available/api.recipely.net.conf
nginx -t && nginx -s reload
```

`nginx -t` first, always: a reload with a bad config leaves the old one running,
but a restart with one does not.

## Certificates

`api.recipely.net` uses Let's Encrypt via certbot, renewed on the box as before.

**`admin.recipely.net` uses a Cloudflare Origin CA certificate, and Let's
Encrypt could not have been used for it.** Access intercepts the HTTP-01
challenge and redirects the validator to a login page, so every renewal would
fail — the certificate would expire 90 days later and Full (strict) would answer
526 for a panel nobody could reach. The Origin CA certificate is valid until
**2041** and never renews.

The private key was generated on the box and has never left it: Cloudflare
signed a CSR and never saw the key.

```
/etc/nginx/ssl/admin.recipely.net/origin.key   600 root:root
/etc/nginx/ssl/admin.recipely.net/origin.crt   644 root:root
```

## Authenticated Origin Pulls

Global AOP is on for the zone, and `ssl_verify_client on` enforces it in the
admin server block only. Verified: a direct request to the origin for
`admin.recipely.net` answers `400 No required SSL certificate was sent`.

**What Global AOP does and does not do.** The client certificate Cloudflare
presents is shared across all Cloudflare customers, so it proves the connection
came *through Cloudflare* — not that it came through *this account*. It closes
the direct-to-origin path, which is what was open; it does not by itself stop
someone routing their own Cloudflare zone at this origin IP. Zone-level AOP with
a custom certificate would, at the cost of handing Cloudflare a private key.
Behind Access and the panel's own password, the shared certificate is the
proportionate choice here.
