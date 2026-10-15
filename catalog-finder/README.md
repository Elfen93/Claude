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

## Catálogo para un cliente (varias búsquedas a la vez)
Si pegas una lista con varias peticiones, la IA las ejecuta una por una (`searches`), elige N artículos con fotos por línea sin repetir, los **selecciona todos** y los agrupa por línea (etiqueta 🎯 en cada tarjeta). Al terminar muestra qué líneas se cumplieron (✓), quedaron cortas (⚠) o vacías (✗). El Excel respeta ese orden.
- Plantilla lista para pegar: `prompts/cliente_wishlist.txt` (26 líneas de Hermès, Chanel, Gucci, Celine, Prada, YSL, Bottega, Loewe, Fendi, Dior, The Row). Edita el número de artículos por línea o los filtros en ese texto.
- Nombres de modelo = filtro duro; conceptos subjetivos (vintage, unique, colores) = preferencia que ordena primero lo que más coincide.
- Los topes ("under $995") se comparan con el precio que ves: **elige antes al cliente y su moneda** si el tope es el precio final del cliente (o pon `price_currency` y `price_basis` en la línea).
- Requiere IA (clave de API); el modo básico no sabe montar listas.
- **Segunda plantilla**: `prompts/sourcing_ab_bminus.txt` (sourcing de LV, Dior, Gucci, Celine, YSL y Chanel en grados AB a B-, con rangos de precio en €). Cada línea puede llevar: moneda (`price_currency`, convierte con el cambio actual), **precio de compra** (`price_basis=buying`, ignora el margen), grado mínimo y máximo (`best_rank_allowed`/`worst_rank_allowed`) y orden por precio. Los números de talla se buscan como número completo (25 no coincide con 250).

- **Tercera plantilla**: `prompts/cliente_suivi_mensual.txt`, el catálogo mensual de una clienta recurrente, derivado de su historial real (160 artículos en 6 pestañas): Hermès ~58 % (pañuelos carré 90, plissé, twilly, anillos), Dior ~21 % (bisutería), Chanel, Céline y LV. Los topes son **precio que paga la clienta en EUR** (ya con su margen del 25 % + ¥2.000): elige antes un cliente con ese margen y moneda EUR. Con los datos reales, sus 20 líneas encajan con el 98 % de lo que ya compró; la plantilla pide ~32 artículos (ajusta los `count`).

## Descargar exactamente lo que quieres
- **La selección no se pierde** al filtrar ni al quitar filtros (se guarda por CTag). La barra inferior dice cuántos seleccionados ves y cuántos quedan fuera de los filtros.
- **Catálogo montado**: tras una búsqueda múltiple, el botón 🎯 *Dentro del catálogo montado (N)* mantiene la vista limitada a esos N; *Quitar filtros* no lo tira. Con él activo puedes filtrar **dentro** del catálogo por entity, marca, precio o estado. Pulsa el botón para salir de él y de nuevo para volver.
- **Ver solo seleccionados**: revisa y quita casillas antes de descargar.
- **Al pulsar Descargar**, si hay seleccionados fuera de tu vista, pregunta: *los N seleccionados* o *solo los M seleccionados que veo* (así cualquier filtro sirve para sacar una parte). Sin selección, ofrece descargar los resultados que ves.
- **Dividir por** Entity, Marca, Estado o Rango de precio (menos de 200, 200-500, 500-1000, 1000-2500, más de 2500; precio que ves, con o sin margen): crea **una pestaña por grupo en un solo archivo**, o **un archivo por grupo**. Las descripciones y fotos se calculan una sola vez. La división solo existe para Excel, no para CSV.

## Velocidad y exactitud
- **Fotos**: el servidor local comprueba las fotos en paralelo (solo pide la cabecera, sin descargar la imagen) y guarda el resultado en `.photo_cache.json`. Sin fotos se reintenta a las 6 h; con fotos, a los 30 días. Borra ese archivo para forzar una comprobación nueva.
- **Plantilla guardada**: una petición que ya interpretó la IA se guarda en el navegador; repetirla (mismo texto) no llama a la IA ni cuesta nada. Botón *↻ Reinterpretar con IA* para rehacerla.
- **Precisión**: las palabras de modelo (birkin, kelly, box…) se buscan solo en nombre/descripción y al inicio de palabra, no en las notas ni en el texto de grading. Si no hay suficientes resultados, amplía a todo el texto y lo avisa. YSL = Saint Laurent, Bottega = Bottega Veneta, etc.

## Monedas y márgenes por cliente
- **Moneda de origen**: cada fila puede venir en su moneda (CNY, JPY, EUR, GBP…); se convierte con el cambio actual (open.er-api.com, respaldo frankfurter.dev, caché 1 h; sin conexión usa el último guardado).
- **Moneda de salida** (selector *Moneda* arriba): todo lo que ves y descargas (tarjetas, filtros de precio, rangos, ordenar, dividir por precio, *Buy Now Price*) va en esa moneda. Los filtros de precio se escriben en ella. En el Excel, la celda lleva el símbolo (`€`, `£`, `¥`…).
- **Clientes**: el selector *Cliente* elige un perfil con su propio **margen %**, **tarifa fija** (en cualquier moneda), **moneda** y **redondeo** (a 1, 5, 10, 50, 100…). `✎ Margen` o *+ Nuevo cliente…* abre el editor; ahí ves un ejemplo en vivo. *Sin margen* muestra el precio de compra. Fórmula: `precio de compra × (1 + margen %) + tarifa fija`. Al elegir un cliente se activa su moneda (puedes cambiarla después). Se guardan en el navegador.
- En las búsquedas, si no dices moneda, los números se entienden en la moneda que estás viendo; con `€`, `$`, `£` en la frase (o `price_currency` en una línea de prompt) se respeta lo que escribas.

## Excel customer
Columnas: `BRAND, SKU, ITEM NAME, DETAILED GRADING, GRADING (RANK), Purchase?, Buy Now Price, Picture #1…#13, 1…13`.
- `Buy Now Price`: precio en la moneda de salida, con el margen del cliente elegido (la barra inferior y el aviso al descargar lo indican).
- `Picture #n` = `=image("…/photographs/{CTag}/n.jpg",4,100,100)` y `1…13` = `=iferror(HYPERLINK(…,"{CTag} - photon"))`, solo para fotos existentes. Son fórmulas de **Google Sheets**: sube el .xlsx a Drive y ábrelo con Sheets. En Excel esas fórmulas no se verán.
- El rank sale del texto `GRADING: B (Good)` del detailed grading (en cualquier columna): 1=SA con etiquetas, 2=SA, 3=S, 4=A, 5=AB, 6=B+, 7=B, 8=B-, 9=BC, 10=C. Las etiquetas entre paréntesis se editan en Ajustes.
- `Purchase?` sale vacía. También hay botón CSV.
- **Detailed grading en lenguaje natural** (activado por defecto; se desactiva en Ajustes): convierte el texto estructurado en una frase, p. ej. `This red size 30 item is in Grade AB condition, showing minor wear throughout both the interior and exterior, and has been repainted or re-dyed. It comes complete with its lock and key.` Con clave de IA la redacta Claude respetando solo lo que dicen las notas (no inventa ni suaviza defectos) y guarda el resultado en `.desc_cache.json`. Sin clave usa reglas simples que cubren los formatos habituales pero suenan más planas. **Revisa una muestra antes de enviarlo al cliente.**
  - **Todo en inglés**: la IA traduce notas en japonés u otros idiomas y, si una respuesta trae caracteres de otro alfabeto, la rechaza y la reintenta. Las reglas (sin IA) no pueden traducir: descartan cualquier línea en otro idioma y ignoran apartados desconocidos (`additional info:`, `notes:`…).
  - **Artículos sin notas de grading**: con IA se examinan **todas** las fotos del artículo (el interior suele salir en las últimas) y se describe solo lo visible ( no inventa grado ni habla de zonas que no aparecen). Esas celdas salen en **naranja** para que las revises. Usa un modelo con visión (`CATALOG_VISION_MODEL`, por defecto `claude-sonnet-5-5`), más caro que el de texto. Sin fotos o sin IA, la celda queda vacía y te lo avisa.

## Columnas de tu hoja
Se detectan por nombre: `Brand Name, CTag, Item Name / Item Description, Public Notes, Price after Tax, currency, Entity`. Si algo no se detecta, cámbialo en *Ajustes avanzados*.

## Seguridad
El servidor solo escucha en 127.0.0.1 y los endpoints de IA/clave exigen una cabecera propia y rechazan orígenes externos, para que otras webs abiertas en tu navegador no puedan usar tu clave.

`vendor/xlsx.bundle.js` es [xlsx-js-style](https://github.com/gitbrent/xlsx-js-style) (Apache-2.0) para generar el .xlsx sin internet.
