#!/usr/bin/env python3
"""Generate production delivery rules using nginx's standard static-file modules."""
import argparse
from pathlib import Path


TYPES = {
    'wasm': 'application/wasm',
    'js|mjs': 'text/javascript',
    'json': 'application/json',
    'zip': 'application/zip',
    'html': 'text/html',
    'css': 'text/css',
    'svg': 'image/svg+xml',
    'dl|wgsl|glsl': 'text/plain',
    'f32': 'application/octet-stream',
}

ARCHIVE_URI = r'~^/libraries/[a-z][a-z0-9-]*/[a-f0-9]{64}\.zip(?:\?|$)'


def maps(root):
    return rf'''
map $http_accept_encoding $dynlex_compression {{
    default "";
    "~*(?:^|,)\s*br\s*(?!;\s*q=0(?:\.0*)?\s*(?:,|$))(?:;[^,]*)?(?:,|$)" .br;
    "~*(?:^|,)\s*gzip\s*(?!;\s*q=0(?:\.0*)?\s*(?:,|$))(?:;[^,]*)?(?:,|$)" .gz;
}}
map $uri $dynlex_encoding {{
    volatile;
    default "";
    ~\.br$ br;
    ~\.gz$ gzip;
}}
map $request_uri $dynlex_root {{
    default {root}/current;
    "{ARCHIVE_URI}" {root};
    ~^/releases/ {root};
}}
map $request_uri $dynlex_cache {{
    default "no-cache";
    "{ARCHIVE_URI}" "public, max-age=31536000, immutable";
    ~^/releases/ "public, max-age=31536000, immutable";
}}
'''


def locations():
    rules = ['root $dynlex_root;', 'index index.html;']
    for extensions, media_type in TYPES.items():
        rules.append(rf'''
location ~ \.(?:{extensions})$ {{
    types {{ }}
    default_type {media_type};
    try_files $uri$dynlex_compression $uri =404;
    add_header Content-Encoding $dynlex_encoding;
    add_header Vary Accept-Encoding always;
    add_header Cache-Control $dynlex_cache always;
}}''')
    rules.append('''
location /releases/ {
    try_files $uri =404;
    add_header Cache-Control $dynlex_cache always;
}
location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache" always;
}''')
    return '\n'.join(rules)


def configuration(root):
    hostname = Path(root).name
    certificate = '.'.join(hostname.split('.')[-2:])
    return maps(root) + f'''
server {{
    listen 80;
    listen [::]:80;
    server_name {hostname};
    return 301 https://$host$request_uri;
}}
server {{
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {hostname};
    ssl_certificate /etc/letsencrypt/live/{certificate}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{certificate}/privkey.pem;
    {locations()}
}}
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    print(configuration(parser.parse_args().root))
