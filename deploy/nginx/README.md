# nginx

The reverse proxy in front of this app was configured by hand on each box and
existed nowhere else. That made it the one part of the deployment nobody could
review, diff or roll back — and it is the part that decides who reaches
`/admin`.

These files are the intended state. They are **not** applied automatically; copy
them onto the host, diff against what is already there, and reload.

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

`admin.recipely.net` needs its own certificate before its server block will
load. Issue it **before** enabling the site, and **before** turning on
Authenticated Origin Pulls — certbot's HTTP-01 challenge is served over port 80
and a client certificate requirement would reject Let's Encrypt.

```bash
certbot --nginx -d admin.recipely.net
```

If certbot is configured with the webroot plugin instead, the `.well-known`
location in each server block is what serves the challenge — do not remove it.
