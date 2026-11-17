#!/usr/bin/env python3
"""Serve the current web build for local development."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit


class WebHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, deployment=False, **kwargs):
        self.deployment = deployment
        self.content_encoding = None
        self.content_type = None
        super().__init__(*args, **kwargs)

    def send_head(self):
        original = self.path
        path = Path(self.translate_path(original))
        qualities = {}
        for entry in self.headers.get("Accept-Encoding", "").split(","):
            encoding, *parameters = entry.strip().split(";")
            quality = "1"
            for parameter in parameters:
                if parameter.strip().startswith("q="):
                    quality = parameter.strip()[2:]
            qualities[encoding] = float(quality) if re.fullmatch(r"(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)", quality) else 0.0
        candidates = sorted(["br", "gzip"], key=lambda name: -qualities.get(name, qualities.get("*", 0.0)))
        self.content_encoding = None
        self.content_type = None
        for encoding in candidates:
            suffix = ".br" if encoding == "br" else ".gz"
            if qualities.get(encoding, qualities.get("*", 0.0)) > 0 and path.with_name(path.name + suffix).is_file():
                self.content_type = super().guess_type(str(path))
                self.content_encoding = encoding
                url = urlsplit(original)
                self.path = urlunsplit(url._replace(path=url.path + suffix))
                break
        try:
            return super().send_head()
        finally:
            self.path = original

    def guess_type(self, path):
        return self.content_type if self.content_type is not None else super().guess_type(path)

    def send_header(self, keyword, value):
        super().send_header(keyword, value)
        if not self.deployment and keyword.lower() == "content-type" and value.split(";", 1)[0] == "text/html":
            # Evict files cached before this policy, including delayed imports
            # that a hard reload alone can still reuse. Keep storage and cookies.
            super().send_header("Clear-Site-Data", '"cache"')

    def end_headers(self):
        if self.content_encoding is not None:
            self.send_header("Content-Encoding", self.content_encoding)
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Cache-Control", "no-cache" if self.deployment else "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent.parent / "build/site")
    parser.add_argument("--deployment", action="store_true", help="Use deployment cache headers for navigation tests")
    args = parser.parse_args()
    handler = partial(WebHandler, directory=str(args.directory), deployment=args.deployment)
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Serving DynLex at http://{args.bind}:{server.server_port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
