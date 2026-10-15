#!/usr/bin/env python3
"""Servidor local para Catalog Finder. Solo usa la libreria estandar.

IA opcional: clave de Anthropic en la variable ANTHROPIC_API_KEY o guardada desde la app en .api_key.

Uso:  python3 server.py [puerto]
Sirve index.html y un proxy /fetch?url=... para descargar el CSV de Google Sheets
(el navegador no puede hacerlo directamente por CORS).
"""
import concurrent.futures, http.client, http.server, json, os, re, ssl, sys, threading, time, urllib.error, urllib.parse, urllib.request, webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(ROOT, ".api_key")
CACHE_FILE = os.path.join(ROOT, ".photo_cache.json")
PHOTO_HOSTS = tuple(os.environ.get("CATALOG_PHOTO_HOSTS", "s3.amazonaws.com").split(","))
TTL_ZERO, TTL_POS = 6 * 3600, 30 * 86400  # sin fotos: reintentar a las 6 h; con fotos: 30 dias
_cache_lock = threading.Lock()
_ids_pool = concurrent.futures.ThreadPoolExecutor(16)
_pic_pool = concurrent.futures.ThreadPoolExecutor(48)
try:
    with open(CACHE_FILE) as _f:
        _cache = json.load(_f)
except Exception:  # noqa: BLE001
    _cache = {}


_ssl_ctx = ssl.create_default_context()
_tls = threading.local()


def _head_status(url):
    """HEAD reutilizando la conexion de cada hilo (evita repetir el handshake TLS en cada foto)."""
    u = urllib.parse.urlsplit(url)
    key, path = (u.scheme, u.netloc), u.path + ("?" + u.query if u.query else "")
    conns = _tls.__dict__.setdefault("conns", {})
    for attempt in (0, 1):
        c = conns.get(key)
        if c is None:
            c = conns[key] = (http.client.HTTPSConnection(u.netloc, timeout=15, context=_ssl_ctx) if u.scheme == "https"
                              else http.client.HTTPConnection(u.netloc, timeout=15))
        try:
            c.request("HEAD", path, headers={"User-Agent": "catalog-finder"})
            r = c.getresponse()
            r.read()
            if (r.getheader("Connection") or "").lower() == "close":
                c.close()
                conns.pop(key, None)
            return r.status
        except (http.client.HTTPException, OSError):
            c.close()
            conns.pop(key, None)
            if attempt:
                raise


def _exists(url):
    """True/False si la foto existe (HEAD, sin descargarla). Lanza si el fallo no es concluyente."""
    st = _head_status(url)
    if st == 200:
        return True
    if st in (403, 404):  # S3 devuelve 403 para claves que no existen
        return False
    raise OSError(f"HTTP {st}")


def count_photos(tpl, size, pid, maxn):
    """Cuantas fotos consecutivas 1..maxn existen. None si no se pudo comprobar."""
    key = f"{tpl}|{size}|{maxn}|{pid}"
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
    if hit and now - hit["t"] < (TTL_POS if hit["n"] else TTL_ZERO):
        return hit["n"]
    url = lambda n: tpl.replace("{id}", urllib.parse.quote(pid)).replace("{size}", size).replace("{n}", str(n))  # noqa: E731
    try:
        if not _exists(url(1)):
            n = 0
        else:
            flags = list(_pic_pool.map(lambda i: _exists(url(i)), range(2, maxn + 1)))
            n = 1
            for ok in flags:
                if not ok:
                    break
                n += 1
    except Exception:  # noqa: BLE001
        return None
    with _cache_lock:
        _cache[key] = {"n": n, "t": now}
    return n


def save_cache():
    with _cache_lock:
        tmp = CACHE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_cache, f)
        os.replace(tmp, CACHE_FILE)


API_BASE = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
MODEL = os.environ.get("CATALOG_MODEL", "claude-haiku-5-5")
SYSTEM = """Eres el asistente de un catalogo de articulos de lujo de segunda mano (bolsos, carteras, accesorios).
El usuario escribe en espanol (a veces ingles) lo que busca; tu llamas SIEMPRE a la herramienta set_filters con los filtros que mejor lo representan.
Reglas:
- brands y entities: usa SOLO nombres exactos de las listas recibidas (corrige mayusculas/abreviaturas, p.ej. LV -> Louis Vuitton). Si el usuario no menciona marcas, deja brands vacio.
- Los textos del catalogo estan en INGLES: traduce las palabras clave (cartera -> wallet, bolso -> bag/handbag/tote/shoulder, negro -> black...) en keyword_groups. Cada grupo es una lista de sinonimos (basta uno); el articulo debe cumplir todos los grupos.
- Precios en USD, tal y como el usuario los ve. 'barato' sin cifra: no pongas limites, usa sort=price_asc.
- Estado: escala 1=SA con etiquetas, 2=SA, 3=S, 4=A, 5=AB, 6=B+, 7=B, 8=B-, 9=BC, 10=C. 'A o mejor' -> worst_rank_allowed=4. 'buen estado' -> 7. 'excelente/casi nuevo' -> 3 o 4.
- select_count > 0 solo si el usuario pide ELEGIR/SELECCIONAR/ESCOGER una cantidad concreta; si pide variedad o mezcla de marcas, diversify_brands=true.
- Si el usuario da una LISTA de peticiones distintas, rellena `searches` con una entrada por linea (y deja vacios los filtros de nivel superior). Respeta las instrucciones por linea que el usuario indique (filtro duro vs preferencia blanda, topes de precio, cantidad).
- reply: una frase corta en espanol diciendo que has entendido y aplicado. No inventes nada que el usuario no pidio."""
_SEARCH_PROPS = {
    "label": {"type": "string", "description": "Nombre corto de la linea, p.ej. 'Hermes - Kelly'"},
    "brands": {"type": "array", "items": {"type": "string"}},
    "entities": {"type": "array", "items": {"type": "string"}},
    "keyword_groups": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}, "description": "FILTRO DURO: cada grupo = sinonimos (basta uno); se deben cumplir todos los grupos"},
    "prefer_keywords": {"type": "array", "items": {"type": "string"}, "description": "PREFERENCIA BLANDA: no excluye, solo ordena primero los articulos que contienen mas de estas palabras"},
    "exclude_keywords": {"type": "array", "items": {"type": "string"}},
    "min_price": {"type": "number"},
    "max_price": {"type": "number"},
    "worst_rank_allowed": {"type": "integer", "minimum": 1, "maximum": 10},
}
TOOL = {
    "name": "set_filters",
    "description": "Aplica filtros al catalogo (una busqueda) o varias busquedas a la vez (searches)",
    "input_schema": {
        "type": "object",
        "properties": dict(
            _SEARCH_PROPS,
            sort={"type": "string", "enum": ["", "price_asc", "price_desc", "brand"]},
            select_count={"type": "integer", "minimum": 0},
            diversify_brands={"type": "boolean"},
            searches={
                "type": "array",
                "description": "Usar cuando el usuario pide VARIAS busquedas distintas (una por linea). Cada una se ejecuta por separado y se unen los resultados sin repetir.",
                "items": {"type": "object", "properties": dict(_SEARCH_PROPS, count={"type": "integer", "minimum": 1, "description": "Cuantos articulos elegir en esta busqueda"})},
            },
            reply={"type": "string"},
        ),
        "required": ["reply"],
    },
}


def api_key():
    k = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not k and os.path.exists(KEY_FILE):
        k = open(KEY_FILE).read().strip()
    return k
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

    def _local_only(self):
        """Evita que otras webs abiertas en el navegador usen estos endpoints."""
        host = (self.headers.get("Host") or "").split(":")[0]
        origin = self.headers.get("Origin") or ""
        ok_origin = not origin or urllib.parse.urlparse(origin).hostname in ("127.0.0.1", "localhost")
        return host in ("127.0.0.1", "localhost") and ok_origin and self.headers.get("X-Catalog-Finder") == "1"

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path not in ("/ai", "/ai-key") or not self._local_only():
            return self._err(403, "Prohibido")
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except ValueError:
            return self._err(400, "JSON invalido")
        if path == "/ai-key":
            key = str(data.get("key", "")).strip()
            if key:
                fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as f:
                    f.write(key)
            elif os.path.exists(KEY_FILE):
                os.remove(KEY_FILE)
            return self._json({"configured": bool(api_key())})
        return self._ai(data)

    def _photos(self, q):
        if not self._local_only():
            return self._err(403, "Prohibido")
        tpl = q.get("tpl", [""])[0]
        size = re.sub(r"[^A-Za-z0-9_-]", "", q.get("size", ["medium"])[0]) or "medium"
        maxn = max(1, min(30, int(q.get("maxn", ["13"])[0] or 13)))
        host = urllib.parse.urlparse(tpl).hostname or ""
        if host not in PHOTO_HOSTS or "{id}" not in tpl or "{n}" not in tpl:
            return self._err(400, "Plantilla de foto no permitida (solo " + ", ".join(PHOTO_HOSTS) + ")")
        ids = [i for i in q.get("ids", [""])[0].split(",") if re.fullmatch(r"[A-Za-z0-9_-]{1,40}", i)][:300]
        counts = dict(zip(ids, _ids_pool.map(lambda i: count_photos(tpl, size, i, maxn), ids)))
        save_cache()
        return self._json({"counts": counts})

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _ai(self, d):
        key = api_key()
        if not key:
            return self._err(400, "Falta la clave de API")
        ctx = "Marcas (nombre (n.o de articulos)):\n" + "\n".join(d.get("brands", [])[:400]) \
            + "\n\nEntities:\n" + "\n".join(d.get("entities", [])[:100]) + f"\n\nArticulos en el catalogo: {d.get('total', '?')}"
        payload = {
            "model": MODEL, "max_tokens": 6000, "system": SYSTEM + "\n\n" + ctx,
            "tools": [TOOL], "tool_choice": {"type": "tool", "name": "set_filters"},
            "messages": [{"role": "user", "content": str(d.get("query", ""))[:12000]}],
        }
        req = urllib.request.Request(
            API_BASE + "/v1/messages", data=json.dumps(payload).encode(),
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as r:
                resp = json.load(r)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            return self._err(502, f"La API respondio {e.code}: {detail}")
        except Exception as e:  # noqa: BLE001
            return self._err(502, f"No se pudo contactar con la API: {e}")
        for block in resp.get("content", []):
            if block.get("type") == "tool_use":
                return self._json(block["input"])
        return self._err(502, "La IA no devolvio filtros")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # que el navegador nunca sirva una version vieja
        super().end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/photos":
            return self._photos(urllib.parse.parse_qs(u.query))
        if u.path == "/ai-status":
            return self._json({"configured": bool(api_key())})
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
    try:
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        sys.exit(f"\nEl puerto {PORT} ya esta ocupado: seguramente hay otra copia de Catalog Finder abierta.\n"
                 f"Cierrala (Ctrl+C en su terminal) y vuelve a ejecutar, o usa otro puerto: python server.py {PORT + 1}\n")
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
