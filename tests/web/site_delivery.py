import gzip
import importlib.util
from http.server import ThreadingHTTPServer
from functools import partial
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('serve_web',ROOT/'scripts/serve_web.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Delivery(unittest.TestCase):
    def test_precompressed_delivery_and_negotiation(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);data=b'compiled application'*100
            (root/'application.wasm').write_bytes(data)
            (root/'application.wasm.gz').write_bytes(gzip.compress(data,mtime=0))
            (root/'application.wasm.br').write_bytes(b'prebuilt brotli')
            with ThreadingHTTPServer(('127.0.0.1',0),partial(module.WebHandler,directory=folder)) as server:
                thread=threading.Thread(target=server.serve_forever);thread.start()
                try:
                    url=f'http://127.0.0.1:{server.server_port}/application.wasm?version=1'
                    for accepts,expected in [('br,gzip','br'),('gzip','gzip'),('br;q=0,gzip','gzip'),('br;q=0.2,gzip;q=1','gzip'),('identity',None)]:
                        with urlopen(Request(url,headers={'Accept-Encoding':accepts})) as response:
                            self.assertEqual(response.headers.get('Content-Encoding'),expected)
                            self.assertEqual(response.headers['Content-Type'],'application/wasm')
                            payload=response.read()
                            self.assertEqual(payload,b'prebuilt brotli' if expected=='br' else gzip.compress(data,mtime=0) if expected=='gzip' else data)
                    with urlopen(Request(url,method='HEAD',headers={'Accept-Encoding':'gzip'})) as response:
                        self.assertEqual(response.headers['Content-Encoding'],'gzip')
                        self.assertEqual(int(response.headers['Content-Length']),len(gzip.compress(data,mtime=0)))
                        self.assertEqual(response.read(),b'')
                finally:server.shutdown();thread.join()

if __name__=='__main__':unittest.main()
