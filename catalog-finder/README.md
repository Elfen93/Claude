# Catalog Finder

> 🌐 Idioma de la app: selector arriba (Español / English / Français). Guías: [English](README.en.md) · [Français](README.fr.md).

App local para buscar artículos en tu hoja de Google Sheets, ver sus fotos y descargar el Excel en formato customer.

## Arrancar
`python server.py` (Windows) o `python3 server.py`. Solo necesita Python 3. Se abre en http://127.0.0.1:8765

Al actualizar: la versión nueva cierra sola la copia anterior que siga abierta. Si la app avisa de que «el programa que está en marcha es una versión antigua», cierra todas las ventanas negras de Catalog Finder y vuelve a abrirlo.

## Los 3 pasos
1. **Carga tu hoja**: pega el enlace CSV publicado de Google Sheets, o sube el `.csv` descargado.
2. **¿Qué buscas?**: escribe en una frase (`carteras Chanel o Hermès en estado A o mejor entre $300 y $1500, elige 40 variadas`) y pulsa Buscar. O ajusta a mano: rango de precio, estado, marcas, entity, texto, orden, solo con fotos.
3. **Elige**: casilla en cada tarjeta, **Seleccionar todos los resultados** (marca todos los filtrados, no solo los visibles), o **los primeros N** (con opción de variar marcas; solo cuenta artículos con fotos). Abajo, **Descargar Excel (.xlsx)**.

## 🗂 Una sola app: Inicio · Buscar · Clientes · Invoices · 📊 Ventas · Novedades · Entidades
Todo se guarda en **`catalog.db`**, un solo archivo dentro de la carpeta (no va a git). Para hacer copia de seguridad o pasarlo a otro ordenador, cierra la app y copia ese archivo. Lo que tenías en el navegador (márgenes, plantillas, selección) se copia solo la primera vez.
- **🏠 Inicio** (se abre al arrancar). Actualiza la hoja en segundo plano y muestra:
  - Novedades con foto.
  - «⭐ Para tus clientes»: qué novedades encajan con la lista de deseos de cada uno, con el botón **📦 Catálogo mensual**.
  - Invoices pendientes de cobro y vencidas.
  - Ventas por mes y entidad.
- **📦 Catálogo mensual:** abre el buscador con el margen del cliente, ejecuta su lista de deseos, oculta lo vendido, lo reservado y lo que ya se le envió, y deja todo seleccionado para descargar su Excel.
- **👥 Clientes:** una sola ficha por cliente. Contiene datos de invoice, margen y moneda (los mismos del selector del buscador), lista de deseos, lo que ha comprado (con fotos), los catálogos enviados y los reservados.
- **Estados de los artículos:**
  - **Enviado:** cada Excel descargado con un cliente elegido queda registrado como catálogo enviado; con «no repetir lo ya enviado» no se le vuelve a ofrecer.
  - **Reservado:** botón 🔖 en cada tarjeta, para un cliente, con nota.
  - **Vendido:** al guardar una invoice.
  - La casilla «ocultar vendidos y reservados» los quita de la búsqueda.
- **Historial:** cada carga se compara con la anterior: nuevos, bajadas de precio y los que ya no están. Si la hoja no ha cambiado, se siguen mostrando las últimas novedades. Con «cargar al abrir», la hoja del enlace guardado se descarga sola.
- **Added date y Buyer** (columnas opcionales de la hoja):
  - Filtros por Buyer y por antigüedad: < 1 mes, > 3 meses, > 6 meses, > 1 año, > 2 años.
  - Orden por fecha de alta, de antiguo a nuevo o al revés, y por Buyer.
  - En cada tarjeta, la fecha de alta y cuánto tiempo hace.
  - El asistente lo entiende: «bolsos de más de 6 meses», «lo comprado por Ken hace más de 2 años, los más antiguos primero».
  - Las fechas tipo 03/04/2026 se leen solas; si hace falta, se fija el formato en *Ajustes avanzados → Fechas*.
- **Snapshot completo (xlsx con varias pestañas):** sube el xlsx o pega el enlace de exportación en xlsx; también se pueden poner varios enlaces CSV separados por espacios.
  - Cada pestaña (J-Ports, Storefront, EBTH, TRR, Wholesale) pasa a ser un **Canal**.
  - Filtros nuevos por **Tipo** (Item Type) y **Owner**.
  - Precio actual = *PAT - Current* con su moneda (la columna «Cur» justo antes, la P). Precio inicial = *PAT - Initial* (con la I).
  - Cada tarjeta muestra la rebaja desde el alta («−20% desde el alta»), y se puede ordenar por mayor rebaja.
  - Las filas donde cambió la moneda pero no el importe salen con «⚠ moneda dudosa».
- **🧾 Invoices** (UK, JP, HK): desde la selección del buscador (*🧾 Crear invoice*), pegando CTag + precio o importando un Excel.
  - HK: martillo en HKD → yenes, 5% de comisión, «Passed» sin precio.
  - Numeración: por cliente en UK, correlativa en JP, fecha y hora en HK.
  - Casilla **Cobrada**.
  - *🖨 PDF / imprimir* → «Guardar como PDF».
- **🏢 Entidades:** datos de empresa, banco, textos legales y logo. Deja `entidades.json` en la carpeta y se importa solo.

## 📊 Ventas: análisis e informe mensual
1. Cada mes, exporta el **snapshot de vendidos** (el xlsx con todas las pestañas) y pulsa **⬆ Importar vendidos**. Puedes volver a importar el mismo archivo: lo repetido se actualiza, no se duplica.
2. Opcional: pon a la izquierda una pestaña **Grading** con *Ctag* en la columna A y el texto del grading (como las Public Notes) en la B. La app lee la nota: «ITEM GRADING: AB», «GRADING: B+»… («N (New with Tags)» cuenta como SA).
- **Cómo se calcula:**
  - Ingresos = *Sold Price* (en TRR y EBTH, lo que os llega).
  - Coste = *PAT - Current* (precio con impuestos), con su moneda.
  - Beneficio = ingresos − coste, con el **tipo de cambio del día de cada venta**. Los tipos del BCE se descargan solos y se guardan en `catalog.db` (hace falta internet al importar).
  - Días hasta vender = de *Added Date* a *Sold Date*.
- **Resumen:**
  - Unidades, ingresos, beneficio, margen, ticket medio, días hasta vender y ventas con pérdida.
  - Comparado con el periodo anterior o con el mismo periodo del año pasado.
  - Ventas por mes (o por semana) y canal, histograma de días hasta vender y tabla por canal.
  - Los meses incompletos salen con «*», y «⚠ Calidad de datos» avisa de lo que no cuadra.
- **Filtros:**
  - Canal, entidad, categoría/tipo, marca, owner/buyer, grado y tramo de coste.
  - Periodo: todo, últimos 30/90 días, 6 o 12 meses, mes en curso, mes anterior, este año o fechas a mano.
  - Moneda de los importes: USD, JPY, EUR…
  - **Coste / precio:** tramos y un rango libre con deslizador para el coste (PAT) y para el precio de venta, siempre en la moneda elegida. Ejemplo: Moneda JPY, Coste entre 50k y 100k y Marca Celine. Puedes escribir 50000, 50k o 1.2m. Al cambiar de moneda, el rango se convierte solo.
- **Modelo, color, material y talla:** se leen solos del título de cada pieza (Neverfull MM, Keepall 55, GG Marmont, Lady Dior, Carré 90…; Monogram = lona marrón). Se puede filtrar por ellos con la pastilla **Modelo / color**. «Producto» = el modelo si el título lo dice; si no, la línea y el tipo (p. ej. «Prada · Saffiano Tote bag»).
- **🔥 Qué se vende:** los productos que más se venden en el periodo, con frases concretas:
  - Cuántos se vendieron y la tendencia frente al periodo anterior.
  - Precio típico, ×coste y días hasta vender.
  - En qué canal se venden, cuál da más margen y cuál es el más rápido.
  - Cuántos quedan en stock y para cuántos meses.
  - Se puede agrupar por modelo, modelo + talla, línea, color o material. Al lado, «Lo que no se mueve».
- **🛒 Buyers:** qué se vende y qué no de lo que compra cada uno:
  - Piezas compradas desde el inicio del histórico, cuántas se vendieron y lo normal para la misma marca, categoría y mes de compra (para comparar en igualdad de condiciones).
  - Pulsando un buyer: lo que le funciona, lo que no, su stock de más de 6 meses y sus piezas estancadas, con Excel y «Ver en el buscador».
  - Sirve para decidir qué comprar y dónde vender, no para juzgar a nadie.
- **💴 Precios de compra:** quién paga más por lo mismo y dónde se puede bajar el coste:
  - Agrupa lo comprado (vendido + en stock) por marca, modelo, talla, línea y grado. Ejemplo: «Louis Vuitton · Keepall 50 · Monogram · grado B+».
  - En cada grupo: coste mediano, rango normal y, por buyer, cuántas compró y a qué coste mediano frente a la mediana (+12 % = paga un 12 % más).
  - «Pagado de más»: lo que se habría ahorrado comprando todo a la mediana de su grupo. Arriba, el resumen por buyer.
  - «Vende frente a la mediana»: si alguien paga más pero también vende más caro, no está pagando de más. Mira las fotos (pulsa el grupo) antes de sacar conclusiones.
  - Coste = PAT inicial con impuestos, al cambio del día de compra. Elige Moneda JPY para ver los yenes exactos. Lo que cuesta 3 veces más o menos que su grupo no cuenta (suele ser otra cosa).
  - Para que el stock use su coste inicial, vuelve a cargar la hoja de stock una vez en el buscador.
- **✨ Pregúntale a la IA:** escribe una pregunta como se la harías a una persona («¿qué modelos de Gucci se venden mejor y dónde?»).
  - La IA no recibe tu archivo: pide tablas que se calculan en tu ordenador (ventas, stock, buyers, palabras de los títulos y, si hace falta, algunas fotos) y responde con esas cifras.
  - Trabaja en la **moneda elegida arriba** (con el cambio de cada día de venta). Si pones JPY y le dices «máximo 10.000 ¥ por pieza», lo usa tal cual y responde en yenes. Si cambias de moneda, pulsa «Nueva conversación».
  - Puedes ver cada tabla que ha usado y bajarlas a Excel. Puedes seguir preguntando sobre la misma respuesta.
  - Usa la misma clave que el buscador (*Activar IA…*). Opus 5.5 por defecto (unos céntimos por pregunta); Sonnet 5.5 y Haiku 5.5 son más baratos.
  - Si el modelo rechaza una pregunta por sus filtros de seguridad, la API la reintenta sola con el modelo que recomienda Anthropic.
- **Rankings:** por marca, modelo, modelo + talla, línea, color, material, categoría, tipo, canal, entidad, owner, buyer, grado, mes o tramo de coste. Pulsa una fila para filtrar por ella.
- **Stock y rotación** (usa la última hoja cargada en el buscador):
  - Meses de stock y sell-through por marca · categoría (u otra agrupación).
  - Señales: ▲ **Compra más** (se vende rápido y con margen), ▼ **Sobrestock**, ◆ **Lento**.
  - **Piezas estancadas:** llevan en stock más de lo que tarda en venderse el 90 % de lo suyo. Incluye el mejor canal por margen y el más rápido. *🔎 Ver en el buscador* las abre filtradas.
- **Piezas vendidas:** cada venta con coste, venta, beneficio y margen, con filtros como «con pérdida» o «sin PAT».
- **📄 Informe mensual:** elige el mes y pulsa **🖨 PDF** o **⬇ Excel**. Contiene:
  - Resumen frente al mes anterior y al mismo mes del año pasado.
  - Canales, entidades, las marcas y los tipos principales, las ventas más grandes y las pérdidas.
  - Qué comprar y qué sobra.
  - Un apartado por buyer para orientar compras (no es una medida del trabajo de nadie).
- **⬇ Excel** (arriba) descarga lo que estás viendo: periodo y filtros.

## Asistente
- **Con IA**: pulsa *Activar IA…* y pega una clave de API de Anthropic (console.anthropic.com; se paga aparte de la suscripción a Claude, fracciones de céntimo por búsqueda). La clave se guarda solo en tu ordenador, en `.api_key` (no se sube a git). También vale la variable `ANTHROPIC_API_KEY`. Modelo por defecto `claude-haiku-5-5`, cambiable con `CATALOG_MODEL`.
- **Modo básico (sin clave)**: entiende rangos de precio (`menos de 500`, `entre 200 y 800`, `más de 1k`), marcas y entities que existan en tu hoja, estado (`A o mejor`, `buen estado`), cantidad (`elige 30`), `variadas`, `baratos`, y palabras comunes (cartera, bolso, negro, cuero…). Si la IA falla, cae a este modo.

## ✨ Crear prompt con IA
Escribe una idea corta ("joyería fashion Dior, B+ o mejor, sin bolsos") y pulsa *✨ Crear prompt con IA*. La app envía un resumen de TU catálogo (marcas, grados, precios, palabras frecuentes, ~150 nombres de ejemplo), la IA redacta un plan por líneas, la app lo prueba contra tus datos (cuántos artículos casan, fugas, marcas que no existen) y la IA lo corrige. El prompt detallado aparece en el cuadro para que lo edites; *Buscar* lo ejecuta sin otra llamada a la IA mientras no cambies el texto. Son 2 llamadas a `claude-sonnet-5-5` (cambiable con `CATALOG_PLAN_MODEL`). Requiere clave.

## Catálogo para un cliente (varias búsquedas a la vez)
Si pegas una lista con varias peticiones, la IA las ejecuta una por una (`searches`), elige N artículos con fotos por línea sin repetir, los **selecciona todos** y los agrupa por línea (etiqueta 🎯 en cada tarjeta). Al terminar muestra qué líneas se cumplieron (✓), quedaron cortas (⚠) o vacías (✗). El Excel respeta ese orden.
- Plantilla lista para pegar: `prompts/cliente_wishlist.txt` (26 líneas de Hermès, Chanel, Gucci, Celine, Prada, YSL, Bottega, Loewe, Fendi, Dior, The Row). Edita el número de artículos por línea o los filtros en ese texto.
- Nombres de modelo = filtro duro; conceptos subjetivos (vintage, unique, colores) = preferencia que ordena primero lo que más coincide.
- Los topes ("under $995") se comparan con el precio que ves: **elige antes al cliente y su moneda** si el tope es el precio final del cliente (o pon `price_currency` y `price_basis` en la línea).
- Requiere IA (clave de API); el modo básico no sabe montar listas.
- **Segunda plantilla**: `prompts/sourcing_ab_bminus.txt` (sourcing de LV, Dior, Gucci, Celine, YSL y Chanel en grados AB a B-, con rangos de precio en €). Cada línea puede llevar: moneda (`price_currency`, convierte con el cambio actual), **precio de compra** (`price_basis=buying`, ignora el margen), grado mínimo y máximo (`best_rank_allowed`/`worst_rank_allowed`) y orden por precio. Los números de talla se buscan como número completo (25 no coincide con 250).

- **Tercera plantilla**: `prompts/cliente_suivi_mensual.txt`, el catálogo mensual de una clienta recurrente, derivado de su historial real (160 artículos en 6 pestañas): Hermès ~58 % (pañuelos carré 90, plissé, twilly, anillos), Dior ~21 % (bisutería), Chanel, Céline y LV. Los topes son **precio que paga la clienta en EUR** (ya con su margen del 25 % + ¥2.000): elige antes un cliente con ese margen y moneda EUR. Con los datos reales, sus 20 líneas encajan con el 98 % de lo que ya compró; la plantilla pide ~32 artículos (ajusta los `count`).

- **Cuarta plantilla**: `prompts/top10_resale_buys.txt`, sourcing para reventa basado en el informe *Top 10 Buys* (25 sep): bolsos Céline Box/Luggage, Bottega, Dior Montaigne, Hermès Dogon, LV Capucines y Fendi Peekaboo, grados A–B+, precio de compra (`price_basis=buying`) en USD y colores vivos como preferencia. Los 10 bolsos del informe pasan sus filtros. La app no calcula márgenes de reventa (el catálogo no trae precio retail ni de reventa): sirve para generar candidatos y tú estimas el margen.

## Joyería de marca (bisutería) sin bolsos
- **Quinta plantilla**: `prompts/fashion_jewelry_brands.txt`: bisutería de marca (Dior prioritario, luego LV y otras), grado B+ o mejor, **se permiten piezas con strass faltantes**, sin joyería fina (oro 18K, platino, diamantes…) y sin bolsos.
- Nuevo campo `exclude_name_keywords`: descarta por el **nombre/descripción** del artículo (no por las notas). Sirve para quitar los bolsos que contienen "ring" (D-ring, O-ring, key ring) sin perder joyas que traen "dust bag" o "pouch" en los accesorios de las notas. `exclude_keywords` sigue mirando todo el texto (notas, condición).
- **Modo básico**: al pedir joyas ya no usa `ring` suelto, descarta bolsos, llaveros y pañuelos por el nombre y, si dices *fashion/costume/bisutería*, también la joyería fina. Los anillos de dedo solo se buscan si los pides.

## Idioma (español, inglés, francés)
- Selector **🌐** arriba a la derecha: cambia **toda** la interfaz (pantalla, diálogos, avisos, filtros) al instante y se recuerda. La terminal usa `CATALOG_LANG=es|en|fr` (o el idioma del sistema). Los errores del servidor salen en el idioma elegido.
- El **asistente** entiende peticiones en los tres idiomas (modo básico: precios, marcas, estados, cantidades y palabras comunes; con IA: frases libres) y responde en el idioma elegido.
- El Excel *customer* y las descripciones se mantienen **siempre en inglés** (es el formato del cliente). Los números en español conservan el formato `$1,234`; en francés usan el suyo.
- Las columnas de la hoja se reconocen también en francés (`MARQUE`, `PRIX`, `C-tag`…) y la **fila de cabeceras se detecta sola** aunque haya títulos encima.
- Textos en `i18n.js` (clave = texto en español): para añadir otro idioma, añade su traducción a cada entrada y su nombre en `LANGS`.

## Filtro de estado (grado)
- Fila **Estado**: un botón por cada grado que existe en tu hoja (SA c/etiq., SA, S, A, AB, B+, B, B-, BC, C y *sin grado*), con el número de artículos. Marca **uno o varios** para ver solo esos grados exactos (p. ej. solo BC, o AB + B+ + B). Los contadores se ajustan a los demás filtros.
- El selector *atajo "o mejor"…* marca de golpe todos los grados desde SA hasta el elegido (el antiguo "X o mejor").
- El asistente lo entiende: `solo BC`, `solo B+ y B`, `estado de AB a B-`, `A o mejor`. En las plantillas de prompt, una línea puede llevar `grades` (grados exactos) o el rango `best_rank_allowed`/`worst_rank_allowed`.

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
