# Catalog Finder

App local para ver tus artículos con sus fotos a partir de un CSV de Google Sheets.

## Uso
1. `python3 server.py` (solo necesita Python 3, sin instalar nada). Se abre en http://127.0.0.1:8765
2. Pega la URL del CSV (Sheets → Archivo → Compartir → Publicar en la web → CSV) y pulsa **Cargar**, o sube un `.csv` descargado.
3. Filtra por marca, tipo, grading o entidad, busca por texto, ordena por precio y haz clic en una foto para ampliarla (flechas ← → para navegar).

## Columnas
Se detectan solas por el nombre (inglés o español): `Brand`, `Item Type`, `Grading`, `Original Price`, `Currency`, `Entity`.
La columna **Entity/Code/ID** se usa como código de la foto (ej. `C332933`). Si tu código está en otra columna o necesita prefijo, cámbialo en **Ajustes**.

## Fotos
Se prueban `…/photographs/{código}/medium/1.jpg`, `2.jpg`, … hasta que una no exista (máx. 12, configurable).
La plantilla de URL y el tamaño (`medium`) se pueden cambiar en Ajustes. Los ajustes se guardan en el navegador.
"Exportar CSV filtrado" añade la URL de la primera foto.
