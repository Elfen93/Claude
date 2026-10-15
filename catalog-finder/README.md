# Catalog Finder

App local para ver tus artículos con sus fotos a partir de un CSV de Google Sheets.

## Uso
1. `python3 server.py` (solo necesita Python 3, sin instalar nada). Se abre en http://127.0.0.1:8765
2. Pega la URL del CSV (Sheets → Archivo → Compartir → Publicar en la web → CSV) y pulsa **Cargar**, o sube un `.csv` descargado.
3. Filtra por marca, tipo, grading o entidad, busca por texto, ordena por precio y haz clic en una foto para ampliarla (flechas ← → para navegar).

## Columnas
Se detectan solas por el nombre (inglés o español): `Brand Name`, `Price after Tax`, `currency`, `CTag`, `Item Description`, `Public Notes`, `Entity`.
La columna **CTag** se usa como código de la foto (ej. `C332933`). Si tu código está en otra columna o necesita prefijo, cámbialo en **Ajustes**.

## Fotos
Se prueban `…/photographs/{código}/medium/1.jpg`, `2.jpg`, … hasta que una no exista (máx. 12, configurable).
La plantilla de URL y el tamaño (`medium`) se pueden cambiar en Ajustes. Los ajustes se guardan en el navegador.
"Exportar CSV filtrado" añade la URL de la primera foto.

## Precios en USD
- Todos los precios se convierten a USD con el tipo de cambio actual (el servidor lo pide a open.er-api.com, con frankfurter.dev de respaldo, y lo guarda 1 h). Si no hay conexión usa el último guardado.
- Monedas reconocidas: cualquier código ISO (CNY, JPY, EUR…) y símbolos habituales (`¥` se interpreta como JPY, `RMB` como CNY). Si una moneda no existe, la tarjeta muestra el precio original con un aviso.
- El botón **Aplicar 35% + ¥2.500** suma el margen al precio en USD: `USD × 1,35 + 2.500 JPY convertidos a USD`. Porcentaje y yenes se cambian en Ajustes. Ordenar por precio usa el valor mostrado.
- El CSV exportado incluye `price_usd` y `price_usd_markup`.

## Selección y export "customer"
- Cada tarjeta tiene una casilla. Además: **Seleccionar filtrados** y **Limpiar**. La selección se guarda por CTag, así que sobrevive a recargar la hoja.
- **Exportar customer (N)** descarga un CSV con las columnas: `BRAND, SKU, ITEM NAME, DETAILED GRADING, GRADING (RANK), Purchase?, Buy Now Price, Picture #1, Star Rating, Picture #2…#13, 1…13`.
- `Buy Now Price` = precio USD actual: **con** margen si el botón de margen está activado, **sin** margen si no (el estado lo confirma al exportar).
- `Picture #n` = `=image("…/photographs/{CTag}/n.jpg",4,100,100)` y `1…13` = `=iferror(HYPERLINK("…","{CTag} - photon"))`, solo para las fotos que existen. Importa el CSV en Google Sheets (Archivo → Importar) para que se evalúen.
- El detailed grading se detecta en cualquier columna cuyo texto contenga `GRADING:`. El rank sale de la letra: 1=SA con tags, 2=SA, 3=S, 4=A, 5=AB, 6=B+, 7=B, 8=B-, 9=BC, 10=C. Las etiquetas entre paréntesis (`4 - A RANK (Superb Condition)`) se editan en Ajustes.
- `Purchase?` y `Star Rating` salen vacíos. La URL de las fotos del export se cambia en Ajustes.
