# Catalog Finder (guide en français)

Application locale pour chercher vos articles dans une feuille Google Sheets/CSV, voir leurs photos et télécharger l’Excel « customer ». Documentation complète (espagnol) : [README.md](README.md). English guide: [README.en.md](README.en.md).

## Lancer
`python server.py` (Windows) ou `python3 server.py`. Seulement Python 3, rien à installer. S’ouvre sur http://127.0.0.1:8765. Choisissez la langue (Español / English / Français) avec le sélecteur 🌐 en haut ; elle est mémorisée. Les messages du terminal suivent `CATALOG_LANG=fr|en|es` (ou la langue du système).

Lors d’une mise à jour : la nouvelle version ferme d’elle-même l’ancienne copie encore ouverte. Si l’app signale que « le programme en cours est une ancienne version », fermez toutes les fenêtres noires de Catalog Finder et rouvrez-le.

## Les 3 étapes
1. **Chargez votre feuille** : collez le lien CSV publié de Google Sheets, ou importez le `.csv`. La ligne d’en-têtes est détectée même s’il y a des titres au-dessus ; les colonnes en anglais, espagnol et français sont reconnues (`MARQUE`, `PRIX`, `C-tag`…).
2. **Que cherchez-vous ?** Écrivez-le comme à une personne (français, anglais ou espagnol) : *« sacs noirs à moins de 500 euros, choisis 5 variés »*. Ou filtrez à la main : tranche de prix, état, marques, entity, texte, ordre, uniquement avec photos.
3. **Choisissez** : cochez les cartes, *Sélectionner tous les résultats* ou *les premiers N*. Puis **Télécharger Excel (.xlsx)**.

## 🗂 Une seule app : Accueil · Recherche · Clients · Factures · Nouveautés · Entités
Tout est stocké dans **`catalog.db`**, un seul fichier dans le dossier (pas dans git) ; copiez-le pour sauvegarder. Les réglages du navigateur y sont copiés automatiquement la première fois.
- **🏠 Accueil** (s’ouvre au démarrage). Met à jour la feuille en arrière-plan et affiche :
  - Les nouveautés avec photos.
  - « ⭐ Pour vos clients » : les nouveautés qui correspondent à la liste de souhaits de chacun, avec un bouton **📦 Catalogue mensuel**.
  - Les factures en attente de paiement et en retard.
  - Les ventes par mois et par entité.
- **📦 Catalogue mensuel :** ouvre la recherche avec la marge du client, lance sa liste de souhaits, masque le vendu, le réservé et ce qui lui a déjà été envoyé, et sélectionne tout pour son Excel.
- **👥 Clients :** une seule fiche par client, avec données de facture, marge et devise (les mêmes que le sélecteur de la recherche), liste de souhaits, achats (avec photos), catalogues envoyés et réservations.
- **États des articles :**
  - **Envoyé :** chaque Excel téléchargé avec un client choisi est enregistré comme catalogue envoyé ; « ne pas répéter ce qui a été envoyé » les écarte.
  - **Réservé :** 🔖 sur chaque carte, pour un client, avec une note.
  - **Vendu :** à l’enregistrement d’une facture.
  - « Masquer vendus et réservés » les retire de la recherche.
- **Historique :** chaque chargement est comparé au précédent (nouveaux, baisses de prix, disparus). Si la feuille n’a pas changé, les dernières nouveautés restent affichées. Avec « charger à l’ouverture », la feuille du lien enregistré est téléchargée automatiquement.
- **Added date et Buyer** (colonnes facultatives de la feuille) :
  - Filtre par Buyer et par ancienneté : < 1 mois, > 3 mois, > 6 mois, > 1 an, > 2 ans.
  - Tri par date d’ajout (ancien → récent ou l’inverse) et par Buyer.
  - Chaque carte affiche la date d’ajout et depuis combien de temps.
  - L’assistant comprend « sacs de plus de 6 mois ».
  - Le format de date est détecté automatiquement ; si besoin, réglez-le dans *Réglages avancés → Dates*.
- **🧾 Factures** (UK, JP, HK) : depuis la sélection de la recherche, une liste CTag + prix collée ou un Excel.
  - HK : adjudication en HKD → yens, 5 % de commission, « Passed » sans prix.
  - Numérotation : par client pour UK, séquentielle pour JP, date et heure pour HK.
  - Case **Encaissée**.
  - PDF via l’impression du navigateur.
- **🏢 Entités :** société, banque, mentions légales et logo ; `entidades.json` dans le dossier est importé au démarrage.

## Assistant
- **Avec l’IA** : *Activer l’IA…* et collez une clé API Anthropic (stockée uniquement dans le fichier `.api_key` sur votre ordinateur ; ou la variable `ANTHROPIC_API_KEY`). Elle comprend des phrases libres et de longues demandes multi-lignes (modèles prêts dans `prompts/`), et répond dans votre langue.
- **Mode basique (sans clé)** : comprend les tranches de prix, marques, états (`seulement BC`, `AB à B-`, `A ou mieux`), quantité (`choisis 30`), `varié`, `pas cher` et les mots courants dans les trois langues.

## ✨ Créer le prompt avec l’IA
Saisissez une idée courte (« bijoux fantaisie Dior, B+ ou mieux, pas de sacs ») et cliquez sur *✨ Créer le prompt avec l’IA*. L’app envoie un résumé de VOTRE catalogue (marques, grades, prix, mots fréquents, ~150 noms d’exemple) ; l’IA rédige un plan ligne par ligne, l’app le teste sur vos données (correspondances, fuites, marques inexistantes) puis l’IA le corrige. Le prompt détaillé apparaît dans la zone pour que vous le modifiiez ; *Rechercher* l’exécute sans nouvel appel IA tant que le texte ne change pas. 2 appels à `claude-sonnet-5-5` (modifiable avec `CATALOG_PLAN_MODEL`). Nécessite une clé.

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
