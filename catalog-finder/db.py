"""Base de datos local de Catalog Finder (un solo archivo: catalog.db). Solo libreria estandar.

Guarda: ajustes de la app (kv), historial de cargas del catalogo (items/loads), clientes,
entidades (UK/JP/HK...), invoices y el estado de cada articulo (vendido...).
Copia de seguridad = copiar catalog.db.
"""
import json, os, sqlite3, threading, time

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.environ.get("CATALOG_DB", os.path.join(ROOT, "catalog.db"))
ENTITIES_FILE = os.path.join(ROOT, "entidades.json")
KINDS = ("clients", "entities", "invoices", "catalogs")
MARGIN_KEYS = ("pct", "fee", "feeCur", "round", "outCur")
_lock = threading.Lock()

# Plantillas de partida (sin datos bancarios: se rellenan en Ajustes o importando entidades.json)
SEED_ENTITIES = [
    {"code": "UK", "template": "uk", "name": "J-Ports UK LTD.", "title": "Invoice", "currency": "EUR", "numbering": "client", "dueDays": 4,
     "shipping": "Shipped DHL", "terms": "invoice", "deductionLabel": "Paid", "taxLabel": "VAT", "taxPct": 0},
    {"code": "JP", "template": "jp", "name": "J-Ports 株式会社 / J-Ports Kabushikigaisha", "title": "請求書", "currency": "USD", "numbering": "global", "dueDays": 4,
     "shipping": "", "terms": "PLUS 4 invoice", "deductionLabel": "Remaining Balance", "taxLabel": "Tax", "taxPct": 0},
    {"code": "HK", "template": "hk", "name": "J-Ports Global Limited", "title": "LBA オークション請求書", "currency": "JPY", "numbering": "stamp", "dueDays": 0,
     "commissionPct": 5, "labels": "ja", "taxPct": 0},
]


def _conn():
    c = sqlite3.connect(DB_FILE, timeout=30)
    c.row_factory = sqlite3.Row
    return c


def init():
    with _lock, _conn() as c:
        c.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
            CREATE TABLE IF NOT EXISTS docs(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, data TEXT NOT NULL, updated REAL);
            CREATE INDEX IF NOT EXISTS docs_kind ON docs(kind);
            CREATE TABLE IF NOT EXISTS counters(k TEXT PRIMARY KEY, n INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS loads(id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, at REAL, n INTEGER, new INTEGER, gone INTEGER, down INTEGER, up INTEGER);
            CREATE TABLE IF NOT EXISTS load_items(load INTEGER, code TEXT, kind TEXT, old REAL, new REAL);
            CREATE INDEX IF NOT EXISTS load_items_load ON load_items(load);
            CREATE TABLE IF NOT EXISTS items(source TEXT, code TEXT, brand TEXT, name TEXT, price REAL, cur TEXT, entity TEXT, grade TEXT,
                                             first_load INTEGER, last_load INTEGER, prev_price REAL, PRIMARY KEY(source, code));
            CREATE INDEX IF NOT EXISTS items_code ON items(code);
            CREATE TABLE IF NOT EXISTS status(code TEXT PRIMARY KEY, s TEXT, invoice INTEGER, number TEXT, client TEXT, at REAL);
            CREATE TABLE IF NOT EXISTS offers(code TEXT, client_id INTEGER, catalog_id INTEGER, at REAL);
            CREATE INDEX IF NOT EXISTS offers_code ON offers(code);
            CREATE INDEX IF NOT EXISTS offers_client ON offers(client_id);
        """)
        cols = {r[1] for r in c.execute("PRAGMA table_info(status)")}
        for col, ty in (("client_id", "INTEGER"), ("note", "TEXT")):
            if col not in cols:
                c.execute(f"ALTER TABLE status ADD COLUMN {col} {ty}")
        if not c.execute("SELECT 1 FROM docs WHERE kind='entities' LIMIT 1").fetchone():
            for e in SEED_ENTITIES:
                c.execute("INSERT INTO docs(kind, data, updated) VALUES('entities', ?, ?)", (json.dumps(e, ensure_ascii=False), time.time()))
    migrate_profiles()
    # entidades.json en la carpeta (datos completos de tus empresas): se importa al arrancar si es nuevo o ha cambiado
    if os.path.exists(ENTITIES_FILE):
        stamp = str(os.path.getmtime(ENTITIES_FILE))
        if kv_all().get("_entities_file") != stamp:
            try:
                with open(ENTITIES_FILE, encoding="utf-8") as f:
                    import_entities(json.load(f).get("entities") or [])
                kv_set({"_entities_file": stamp})
            except Exception as e:  # noqa: BLE001
                print("entidades.json:", e)


# ---------- kv (ajustes que antes vivian en el navegador) ----------
def kv_all():
    with _conn() as c:
        return {r["k"]: r["v"] for r in c.execute("SELECT k, v FROM kv")}


def kv_set(items):
    with _lock, _conn() as c:
        for k, v in items.items():
            if v is None:
                c.execute("DELETE FROM kv WHERE k=?", (k,))
            else:
                c.execute("INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, str(v)))


# ---------- historial de cargas ----------
def snapshot(source, items):
    """items: [[code, brand, name, price, cur, entity, grade], ...]. Devuelve que ha cambiado desde la carga anterior.
    Si la hoja no ha cambiado no se crea otra carga: se siguen mostrando las novedades de la ultima vez que cambio."""
    source = (source or "file")[:300]
    now = time.time()
    with _lock, _conn() as c:
        prev = c.execute("SELECT id, at FROM loads WHERE source=? ORDER BY id DESC LIMIT 1", (source,)).fetchone()
        old = {}
        if prev:
            old = {r["code"]: (r["price"], r["cur"]) for r in c.execute("SELECT code, price, cur FROM items WHERE source=? AND last_load=?", (source, prev["id"]))}
        cur_codes, new, down, up, changed_at = set(), [], [], 0, {}
        clean = []
        for it in items:
            code = str(it[0] or "").strip()
            if not code or code in cur_codes:
                continue
            cur_codes.add(code)
            price = it[3] if isinstance(it[3], (int, float)) else None
            o = old.get(code)
            if prev and o is None:
                new.append(code)
            elif o and price is not None and o[0] is not None and (o[1] or "") == (it[4] or "") and abs(price - o[0]) > 1e-9:
                changed_at[code] = o[0]
                if price < o[0]:
                    down.append({"c": code, "old": o[0], "new": price})
                else:
                    up += 1
            clean.append((code, it, price))
        gone = [k for k in old if k not in cur_codes]
        if prev and not (new or gone or down or up):  # misma hoja: se repiten las novedades de la ultima carga con cambios
            last = c.execute("SELECT id, at FROM loads WHERE source=? AND (new>0 OR gone>0 OR down>0) ORDER BY id DESC LIMIT 1", (source,)).fetchone()
            if not last:
                return {"first": False, "unchanged": True, "load": prev["id"], "n": len(cur_codes), "new": [], "gone": [], "down": [], "up": 0, "since": prev["at"]}
            det = c.execute("SELECT code, kind, old, new FROM load_items WHERE load=?", (last["id"],)).fetchall()
            before = c.execute("SELECT at FROM loads WHERE source=? AND id<? ORDER BY id DESC LIMIT 1", (source, last["id"])).fetchone()
            return {"first": False, "unchanged": True, "load": last["id"], "n": len(cur_codes), "up": 0, "since": before and before["at"], "at": last["at"],
                    "new": [r["code"] for r in det if r["kind"] == "new" and r["code"] in cur_codes],
                    "gone": [r["code"] for r in det if r["kind"] == "gone"],
                    "down": [{"c": r["code"], "old": r["old"], "new": r["new"]} for r in det if r["kind"] == "down" and r["code"] in cur_codes]}
        lid = c.execute("INSERT INTO loads(source, at, n, new, gone, down, up) VALUES(?,?,?,?,?,?,?)", (source, now, len(cur_codes), len(new), len(gone), len(down), up)).lastrowid
        c.executemany("""INSERT INTO items(source, code, brand, name, price, cur, entity, grade, first_load, last_load, prev_price)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?)
                         ON CONFLICT(source, code) DO UPDATE SET brand=excluded.brand, name=excluded.name, price=excluded.price, cur=excluded.cur,
                           entity=excluded.entity, grade=excluded.grade, last_load=excluded.last_load,
                           prev_price=COALESCE(excluded.prev_price, items.prev_price)""",
                      [(source, code, it[1], it[2], price, it[4], it[5], it[6], lid, lid, changed_at.get(code)) for code, it, price in clean])
        c.executemany("INSERT INTO load_items(load, code, kind, old, new) VALUES(?,?,?,?,?)",
                      [(lid, k, "new", None, None) for k in new] + [(lid, k, "gone", old[k][0], None) for k in gone]
                      + [(lid, d["c"], "down", d["old"], d["new"]) for d in down])
        return {"first": not prev, "load": lid, "n": len(cur_codes), "new": new, "gone": gone, "down": down, "up": up, "since": prev and prev["at"], "at": now}


def loads(limit=20):
    with _conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM loads WHERE new>0 OR gone>0 OR down>0 OR id IN (SELECT MAX(id) FROM loads) ORDER BY id DESC LIMIT ?", (limit,))]


def load_detail(lid):
    with _conn() as c:
        src = c.execute("SELECT source FROM loads WHERE id=?", (lid,)).fetchone()
        if not src:
            return []
        return [dict(r) for r in c.execute("""SELECT li.code, li.kind, li.old, li.new, i.brand, i.name, i.price, i.cur, i.grade, i.entity
                                              FROM load_items li LEFT JOIN items i ON i.source=? AND i.code=li.code
                                              WHERE li.load=? ORDER BY li.kind, i.brand""", (src["source"], lid))]


def lookup(codes):
    """Datos del catalogo para una lista de codigos (la carga mas reciente de cada uno)."""
    out = {}
    with _conn() as c:
        for i in range(0, len(codes), 500):
            part = [str(x).strip() for x in codes[i:i + 500]]
            q = f"SELECT * FROM items WHERE code IN ({','.join('?' * len(part))}) ORDER BY last_load"
            for r in c.execute(q, part):
                out[r["code"]] = {k: r[k] for k in ("brand", "name", "price", "cur", "entity", "grade")}
    return out


# ---------- documentos: clientes, entidades, invoices ----------
def docs(kind):
    with _conn() as c:
        return [dict(json.loads(r["data"]), id=r["id"]) for r in c.execute("SELECT id, data FROM docs WHERE kind=? ORDER BY id", (kind,))]


def doc(kind, did):
    with _conn() as c:
        r = c.execute("SELECT id, data FROM docs WHERE kind=? AND id=?", (kind, did)).fetchone()
        return dict(json.loads(r["data"]), id=r["id"]) if r else None


def save(kind, data):
    if kind not in KINDS:
        raise ValueError(kind)
    did = data.get("id")
    body = {k: v for k, v in data.items() if k != "id"}
    with _lock, _conn() as c:
        if did and c.execute("SELECT 1 FROM docs WHERE kind=? AND id=?", (kind, did)).fetchone():
            c.execute("UPDATE docs SET data=?, updated=? WHERE id=?", (json.dumps(body, ensure_ascii=False), time.time(), did))
        else:
            did = c.execute("INSERT INTO docs(kind, data, updated) VALUES(?, ?, ?)", (kind, json.dumps(body, ensure_ascii=False), time.time())).lastrowid
    return did


def delete(kind, did):
    with _lock, _conn() as c:
        c.execute("DELETE FROM docs WHERE kind=? AND id=?", (kind, did))
        if kind == "invoices":
            c.execute("DELETE FROM status WHERE invoice=?", (did,))


def import_entities(ents):
    """Sustituye/añade entidades por su codigo (UK, JP, HK...)."""
    have = {e.get("code"): e["id"] for e in docs("entities")}
    for e in ents:
        e = dict(e)
        e.pop("id", None)
        if e.get("code") in have:
            e["id"] = have[e["code"]]
        save("entities", e)
    return len(ents)


# ---------- invoices: numeracion y estado de los articulos ----------
def _next(c, key, start=1):
    r = c.execute("SELECT n FROM counters WHERE k=?", (key,)).fetchone()
    n = max((r["n"] + 1) if r else 1, int(start or 1))
    c.execute("INSERT INTO counters(k, n) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n))
    return n


def peek_number(inv):
    """Numero que tendria la invoice si se guardase ahora (sin consumirlo)."""
    return _number(inv, dry=True)


def _number(inv, dry=False, c=None):
    ent = doc("entities", inv.get("entity_id")) or {}
    cli = doc("clients", inv.get("client_id")) or {}
    mode = ent.get("numbering") or "global"
    who = (cli.get("ref") or cli.get("company") or cli.get("name") or inv.get("client", {}).get("name") or "CLIENT").strip()
    if mode == "stamp":
        return f"invoice-{who}-{time.strftime('%Y%m%d-%H%M%S')}"
    key = f"inv:{ent.get('code')}" + (f":{inv.get('client_id') or who}" if mode == "client" else "")
    start = (cli.get("invStart") if mode == "client" else ent.get("nextNumber")) or 1
    if dry:
        with _conn() as cc:
            r = cc.execute("SELECT n FROM counters WHERE k=?", (key,)).fetchone()
        n = max((r["n"] + 1) if r else 1, int(start))
    else:
        n = _next(c, key, start)
    pad = int(ent.get("numPad") or (4 if mode == "client" else 0))
    num = str(n).zfill(pad)
    return f"{who.upper()} {num}" if mode == "client" else f"{ent.get('numPrefix') or ''}{num}"


def save_invoice(inv):
    inv = dict(inv)
    with _lock:
        c = _conn()
        try:
            if not inv.get("number"):
                inv["number"] = _number(inv, c=c)
            body = {k: v for k, v in inv.items() if k != "id"}
            did = inv.get("id")
            if did and c.execute("SELECT 1 FROM docs WHERE kind='invoices' AND id=?", (did,)).fetchone():
                c.execute("UPDATE docs SET data=?, updated=? WHERE id=?", (json.dumps(body, ensure_ascii=False), time.time(), did))
            else:
                did = c.execute("INSERT INTO docs(kind, data, updated) VALUES('invoices', ?, ?)", (json.dumps(body, ensure_ascii=False), time.time())).lastrowid
            c.execute("DELETE FROM status WHERE invoice=?", (did,))
            who = (inv.get("client") or {}).get("company") or (inv.get("client") or {}).get("name") or ""
            for ln in inv.get("lines", []):
                code = str(ln.get("code") or "").strip()
                if code and (ln.get("status") or "").lower() != "passed":
                    c.execute("INSERT INTO status(code, s, invoice, number, client, at) VALUES(?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET "
                              "s=excluded.s, invoice=excluded.invoice, number=excluded.number, client=excluded.client, at=excluded.at",
                              (code, "sold", did, inv["number"], who, time.time()))
            c.commit()
        finally:
            c.close()
    return did, inv["number"]


def status_all():
    with _conn() as c:
        st = {r["code"]: {"s": r["s"], "number": r["number"], "client": r["client"], "client_id": r["client_id"], "note": r["note"], "at": r["at"]}
              for r in c.execute("SELECT * FROM status")}
        offers = {}
        for r in c.execute("SELECT code, client_id, MAX(at) at FROM offers GROUP BY code, client_id"):
            offers.setdefault(r["code"], {})[str(r["client_id"])] = r["at"]
    return {"status": st, "offers": offers}


def set_status(codes, s, client_id=None, note=""):
    """Reservar a mano (s='reserved') o quitar la reserva (s=''). Lo vendido por invoice no se toca aqui."""
    cli = doc("clients", client_id) if client_id else None
    who = (cli or {}).get("company") or (cli or {}).get("name") or ""
    with _lock, _conn() as c:
        for code in codes:
            code = str(code).strip()
            cur = c.execute("SELECT s FROM status WHERE code=?", (code,)).fetchone()
            if cur and cur["s"] == "sold":
                continue
            if not s:
                c.execute("DELETE FROM status WHERE code=?", (code,))
            else:
                c.execute("INSERT INTO status(code, s, invoice, number, client, client_id, note, at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET "
                          "s=excluded.s, client=excluded.client, client_id=excluded.client_id, note=excluded.note, at=excluded.at, invoice=NULL, number=NULL",
                          (code, s, None, None, who, client_id, note, time.time()))


def record_catalog(client_id, items, label=""):
    """Catalogo enviado a un cliente: se guarda con sus articulos y cada uno queda como 'ofrecido' a ese cliente."""
    now = time.time()
    data = {"client_id": client_id, "at": now, "label": label, "n": len(items), "items": items}
    cid = save("catalogs", data)
    with _lock, _conn() as c:
        c.executemany("INSERT INTO offers(code, client_id, catalog_id, at) VALUES(?,?,?,?)", [(str(i.get("code")), client_id, cid, now) for i in items if i.get("code")])
    return cid


def delete_catalog(cid):
    with _lock, _conn() as c:
        c.execute("DELETE FROM docs WHERE kind='catalogs' AND id=?", (cid,))
        c.execute("DELETE FROM offers WHERE catalog_id=?", (cid,))


def migrate_profiles():
    """Los 'clientes' de margen del buscador pasan a ser fichas de cliente (una sola lista)."""
    kv = kv_all()
    if kv.get("_profiles_migrated") or not kv.get("profiles"):
        return
    try:
        profiles = json.loads(kv["profiles"]) or []
    except ValueError:
        profiles = []
    clients = docs("clients")
    key = lambda x: (x or "").strip().lower()
    active = kv.get("profile", "")
    active_id = None
    for p in profiles:
        hit = next((c for c in clients if key(p.get("name")) in (key(c.get("name")), key(c.get("company")), key(c.get("ref")))), None)
        body = dict(hit or {"name": p.get("name", "")})
        body.update({k: p.get(k) for k in MARGIN_KEYS if p.get(k) is not None})
        cid = save("clients", body)
        if p.get("name") == active:
            active_id = cid
    kv_set({"_profiles_migrated": "1", "profileId": str(active_id) if active_id else ""})
