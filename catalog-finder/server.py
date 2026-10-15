#!/usr/bin/env python3
"""Servidor local para Catalog Finder. Solo usa la libreria estandar.

Uso:  python3 server.py [puerto]
Sirve index.html y un proxy /fetch?url=... para descargar el CSV de Google Sheets
(el navegador no puede hacerlo directamente por CORS).
"""
import http.server, json, os, ssl, sys, time, urllib.parse, urllib.request, webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
RATE_SOURCES = (
    ("https://open.er-api.com/v6/latest/USD", lambda d: (d["rates"], d.get("time_last_update_utc", ""))),
    ("https://api.frankfurter.dev/v1/latest?base=USD", lambda d: (dict(d["rates"], USD=1), d.get("date", ""))),
)
_rates = {"at": 0, "body": None}
ALLOWED = ("docs.google.com", "drive.google.com", "googleusercontent.com")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/rates":
            return self._rates()
        if u.path != "/fetch":
            return super().do_GET()
        target = urllib.parse.parse_qs(u.query).get("url", [""])[0]
        host = urllib.parse.urlparse(target).hostname or ""
        if not any(host == h or host.endswith("." + h) for h in ALLOWED):
            return self._err(400, "Solo se permiten URLs de Google Sheets/Drive")
        try:
            req = urllib.request.Request(target, headers={"User-Agent": "catalog-finder"})
            with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as r:
                body = r.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:  # noqa: BLE001
            self._err(502, f"No se pudo descargar: {e}")

    def _rates(self):
        """Tipos de cambio actuales (unidades de cada moneda por 1 USD), cache 1h."""
        if not _rates["body"] or time.time() - _rates["at"] > 3600:
            errs = []
            for url, parse in RATE_SOURCES:
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "catalog-finder"})
                    with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as r:
                        rates, date = parse(json.load(r))
                    if rates.get("JPY") and rates.get("CNY"):
                        _rates.update(at=time.time(), body=json.dumps({"rates": rates, "date": date, "source": url}).encode())
                        break
                except Exception as e:  # noqa: BLE001
                    errs.append(f"{url}: {e}")
            else:
                if not _rates["body"]:
                    return self._err(502, "No se pudieron obtener los tipos de cambio. " + " | ".join(errs))
        body = _rates["body"]
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _err(self, code, msg):
        b = msg.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Catalog Finder en {url}  (Ctrl+C para salir)")
    try:
        webbrowser.open(url)
    except Exception:  # noqa: BLE001
        pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
