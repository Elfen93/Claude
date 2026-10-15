# Catalog Finder (guide en français)

Application locale pour chercher vos articles dans une feuille Google Sheets/CSV, voir leurs photos et télécharger l’Excel « customer ». Documentation complète (espagnol) : [README.md](README.md). English guide: [README.en.md](README.en.md).

## Lancer
`python server.py` (Windows) ou `python3 server.py`. Seulement Python 3, rien à installer. S’ouvre sur http://127.0.0.1:8765. Choisissez la langue (Español / English / Français) avec le sélecteur 🌐 en haut ; elle est mémorisée. Les messages du terminal suivent `CATALOG_LANG=fr|en|es` (ou la langue du système).

## Les 3 étapes
1. **Chargez votre feuille** : collez le lien CSV publié de Google Sheets, ou importez le `.csv`. La ligne d’en-têtes est détectée même s’il y a des titres au-dessus ; les colonnes en anglais, espagnol et français sont reconnues (`MARQUE`, `PRIX`, `C-tag`…).
2. **Que cherchez-vous ?** Écrivez-le comme à une personne (français, anglais ou espagnol) : *« sacs noirs à moins de 500 euros, choisis 5 variés »*. Ou filtrez à la main : tranche de prix, état, marques, entity, texte, ordre, uniquement avec photos.
3. **Choisissez** : cochez les cartes, *Sélectionner tous les résultats* ou *les premiers N*. Puis **Télécharger Excel (.xlsx)**.

## Assistant
- **Avec l’IA** : *Activer l’IA…* et collez une clé API Anthropic (stockée uniquement dans le fichier `.api_key` sur votre ordinateur ; ou la variable `ANTHROPIC_API_KEY`). Elle comprend des phrases libres et de longues demandes multi-lignes (modèles prêts dans `prompts/`), et répond dans votre langue.
- **Mode basique (sans clé)** : comprend les tranches de prix, marques, états (`seulement BC`, `AB à B-`, `A ou mieux`), quantité (`choisis 30`), `varié`, `pas cher` et les mots courants dans les trois langues.

## Filtre d’état (grade)
Un bouton par grade présent dans votre feuille, avec le nombre d’articles. Choisissez-en un ou plusieurs pour des grades exacts (seulement BC, ou AB + B+ + B). Le sélecteur *raccourci « ou mieux »* coche d’un coup tous les grades de SA jusqu’à celui choisi.

## Devises et marges par client
Chaque ligne peut être dans sa propre devise (CNY, JPY, EUR, GBP…) ; elle est convertie au taux du jour. Le sélecteur **Devise** définit la devise d’affichage et d’export. Chaque **Client** a sa marge %, ses frais fixes (dans n’importe quelle devise), sa devise et son arrondi : prix final = prix d’achat × (1 + marge %) + frais fixes.

## Télécharger exactement ce que vous voulez
- Votre sélection est conservée quand vous filtrez. La barre du bas indique combien d’articles sélectionnés sont dans la vue actuelle.
- Au téléchargement, si des articles sélectionnés sont hors de votre vue, l’appli demande : *les N sélectionnés* ou *uniquement les M visibles*.
- **Diviser par** entity, marque, état ou tranche de prix : un onglet par groupe dans un seul fichier, ou un fichier par groupe.
- L’Excel customer est toujours en anglais : `BRAND, SKU, ITEM NAME, DETAILED GRADING, GRADING (RANK), Purchase?, Buy Now Price, Picture #1…#13, 1…13`.

## Remarques
- Les photos sont vérifiées en parallèle par le serveur local et mises en cache dans `.photo_cache.json`.
- Les descriptions de l’Excel sont toujours rédigées en anglais (l’IA traduit les autres langues).
- Le serveur n’écoute que sur 127.0.0.1 ; les points d’accès IA/clé refusent les autres sites web.
