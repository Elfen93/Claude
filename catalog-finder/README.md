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
