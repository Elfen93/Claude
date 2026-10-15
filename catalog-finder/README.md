# Catalog Finder

App local para buscar artículos en tu hoja de Google Sheets, ver sus fotos y descargar el Excel en formato customer.

## Arrancar
`python server.py` (Windows) o `python3 server.py`. Solo necesita Python 3. Se abre en http://127.0.0.1:8765

## Los 3 pasos
1. **Carga tu hoja**: pega el enlace CSV publicado de Google Sheets, o sube el `.csv` descargado.
2. **¿Qué buscas?**: escribe en una frase (`carteras Chanel o Hermès en estado A o mejor entre $300 y $1500, elige 40 variadas`) y pulsa Buscar. O ajusta a mano: rango de precio, estado, marcas, entity, texto, orden, solo con fotos.
3. **Elige**: casilla en cada tarjeta, **Seleccionar todos los resultados** (marca todos los filtrados, no solo los visibles), o **los primeros N** (con opción de variar marcas; solo cuenta artículos con fotos). Abajo, **Descargar Excel (.xlsx)**.

## Asistente
- **Con IA**: pulsa *Activar IA…* y pega una clave de API de Anthropic (console.anthropic.com; se paga aparte de la suscripción a Claude, fracciones de céntimo por búsqueda). La clave se guarda solo en tu ordenador, en `.api_key` (no se sube a git). También vale la variable `ANTHROPIC_API_KEY`. Modelo por defecto `claude-haiku-5-5`, cambiable con `CATALOG_MODEL`.
- **Modo básico (sin clave)**: entiende rangos de precio (`menos de 500`, `entre 200 y 800`, `más de 1k`), marcas y entities que existan en tu hoja, estado (`A o mejor`, `buen estado`), cantidad (`elige 30`), `variadas`, `baratos`, y palabras comunes (cartera, bolso, negro, cuero…). Si la IA falla, cae a este modo.

## Precios en USD
Todo se convierte a USD con el tipo de cambio actual (open.er-api.com, respaldo frankfurter.dev, caché 1 h; sin conexión usa el último guardado). El botón **Aplicar 35% + ¥2.500** calcula `USD × 1,35 + 2.500 JPY en USD` (cambiable en Ajustes). Los filtros de precio y el orden usan el precio que ves.

## Excel customer
Columnas: `BRAND, SKU, ITEM NAME, DETAILED GRADING, GRADING (RANK), Purchase?, Buy Now Price, Picture #1, Star Rating, Picture #2…#13, 1…13`.
- `Buy Now Price`: precio USD actual, con o sin margen según el botón (la barra inferior lo indica).
- `Picture #n` = `=image("…/photographs/{CTag}/n.jpg",4,100,100)` y `1…13` = `=iferror(HYPERLINK(…,"{CTag} - photon"))`, solo para fotos existentes. Son fórmulas de **Google Sheets**: sube el .xlsx a Drive y ábrelo con Sheets. En Excel esas fórmulas no se verán.
- El rank sale del texto `GRADING: B (Good)` del detailed grading (en cualquier columna): 1=SA con etiquetas, 2=SA, 3=S, 4=A, 5=AB, 6=B+, 7=B, 8=B-, 9=BC, 10=C. Las etiquetas entre paréntesis se editan en Ajustes.
- `Purchase?` y `Star Rating` salen vacías. También hay botón CSV.

## Columnas de tu hoja
Se detectan por nombre: `Brand Name, CTag, Item Name / Item Description, Public Notes, Price after Tax, currency, Entity`. Si algo no se detecta, cámbialo en *Ajustes avanzados*.

## Seguridad
El servidor solo escucha en 127.0.0.1 y los endpoints de IA/clave exigen una cabecera propia y rechazan orígenes externos, para que otras webs abiertas en tu navegador no puedan usar tu clave.

`vendor/xlsx.bundle.js` es [xlsx-js-style](https://github.com/gitbrent/xlsx-js-style) (Apache-2.0) para generar el .xlsx sin internet.
