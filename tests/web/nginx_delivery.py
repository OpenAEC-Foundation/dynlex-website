"""Exercise the deployed nginx rules with actual encoded files and release paths."""
import gzip
import importlib.util
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('nginx_delivery', ROOT / 'scripts/nginx_delivery.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)
sys.path.insert(0, str(ROOT / 'scripts'))
from publish_libraries import publish_libraries


class NginxDelivery(unittest.TestCase):
    def test_production_representations_and_release_roots(self):
        nginx = os.environ.get('DYNLEX_NGINX') or shutil.which('nginx')
        self.assertIsNotNone(nginx, 'Install nginx or set DYNLEX_NGINX to its executable')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current = root / 'current'
            release = root / 'releases' / ('a' * 40)
            data = b'precompiled application' * 100
            for target in [current, release]:
                target.mkdir(parents=True)
                for extension in ['wasm', 'js', 'json', 'zip', 'html', 'css', 'svg', 'dl', 'f32']:
                    (target / ('application.' + extension)).write_bytes(data)
                    (target / ('application.' + extension + '.gz')).write_bytes(gzip.compress(data, mtime=0))
                    (target / ('application.' + extension + '.br')).write_bytes(b'prebuilt brotli')
                (target / 'raw.woff2').write_bytes(b'font')
                (target / 'index.html').write_text('current home' if target == current else 'release home')
            archive_name = 'c' * 64 + '.zip'
            archive = release / 'libraries/example' / archive_name
            archive.parent.mkdir(parents=True)
            archive.write_bytes(b'pinned SDK archive')
            publish_libraries(root)
            (current / 'libraries').mkdir()
            (current / 'libraries/index.html').write_text('library directory')
            (current / 'libraries/index.json').write_text('{"schema":1}')
            with socket.socket() as address:
                address.bind(('127.0.0.1', 0))
                port = address.getsockname()[1]
            config = root / 'nginx.conf'
            config.write_text(f'pid {root}/nginx.pid;\nerror_log stderr;\nevents {{}}\nhttp {{\n'
                              + '\n'.join(f'{name}_temp_path {root}/{name};' for name in
                                          ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'])
                              + delivery.maps(root)
                              + f'\nserver {{listen 127.0.0.1:{port}; access_log off;\n'
                              + delivery.locations() + '\n}}\n')
            server = subprocess.Popen([nginx, '-p', str(root) + '/', '-c', str(config),
                                       '-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            origin = f'http://127.0.0.1:{port}'
            try:
                for _ in range(100):
                    if server.poll() is not None:
                        self.fail(server.stderr.read().decode())
                    try:
                        with urlopen(origin):
                            break
                    except URLError:
                        time.sleep(0.02)
                else:
                    self.fail('nginx did not start')
                for prefix in ['', '/releases/' + 'a' * 40]:
                    for extension, media_type in [('wasm', 'application/wasm'), ('js', 'text/javascript'),
                                                  ('json', 'application/json'), ('zip', 'application/zip'), ('html', 'text/html'),
                                                  ('css', 'text/css'), ('svg', 'image/svg+xml'),
                                                  ('dl', 'text/plain'), ('f32', 'application/octet-stream')]:
                        for accepts, encoding in [('br, gzip', 'br'), ('gzip', 'gzip'),
                                                   ('br;q=0,gzip', 'gzip'), ('br;q=0.0, gzip;q=0', None),
                                                   ('br;q=0.1, gzip', 'br'), ('identity', None)]:
                            request = Request(origin + prefix + '/application.' + extension + '?v=1',
                                              headers={'Accept-Encoding': accepts})
                            with urlopen(request) as response:
                                self.assertEqual(response.headers.get('Content-Encoding'), encoding)
                                self.assertEqual(response.headers['Content-Type'], media_type)
                                payload = response.read()
                                self.assertEqual(payload, b'prebuilt brotli' if encoding == 'br'
                                                 else gzip.compress(data, mtime=0) if encoding == 'gzip' else data)
                                self.assertIn('immutable' if prefix else 'no-cache', response.headers['Cache-Control'])
                                self.assertEqual(response.headers['Vary'], 'Accept-Encoding')
                    with urlopen(Request(origin + prefix + '/application.wasm', method='HEAD',
                                         headers={'Accept-Encoding': 'br'})) as response:
                        self.assertEqual(response.headers['Content-Encoding'], 'br')
                        self.assertEqual(int(response.headers['Content-Length']), len(b'prebuilt brotli'))
                        self.assertEqual(response.read(), b'')
                    with urlopen(origin + prefix + '/raw.woff2') as response:
                        self.assertEqual(response.read(), b'font')
                    with self.assertRaises(HTTPError) as failure:
                        urlopen(Request(origin + prefix + '/missing.wasm', headers={'Accept-Encoding': 'br'}))
                    self.assertEqual(failure.exception.code, 404)
                    self.assertIsNone(failure.exception.headers.get('Content-Encoding'))
                    failure.exception.close()
                shutil.rmtree(release)
                with urlopen(origin + '/libraries/example/' + archive_name + '?download=1') as response:
                    self.assertEqual(response.read(), b'pinned SDK archive')
                    self.assertEqual(response.headers['Content-Type'], 'application/zip')
                    self.assertIn('immutable', response.headers['Cache-Control'])
                for suffix, body in [('', b'library directory'), ('index.json', b'{"schema":1}')]:
                    with urlopen(origin + '/libraries/' + suffix) as response:
                        self.assertEqual(response.read(), body)
                        self.assertNotIn('immutable', response.headers['Cache-Control'])
            finally:
                server.terminate()
                server.wait(timeout=10)
                server.stderr.close()


if __name__ == '__main__':
    unittest.main()
