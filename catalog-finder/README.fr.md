# Catalog Finder (guide en français)

Application locale pour chercher vos articles dans une feuille Google Sheets/CSV, voir leurs photos et télécharger l’Excel « customer ». Documentation complète (espagnol) : [README.md](README.md). English guide: [README.en.md](README.en.md).

## Lancer
`python server.py` (Windows) ou `python3 server.py`. Seulement Python 3, rien à installer. S’ouvre sur http://127.0.0.1:8765. Choisissez la langue (Español / English / Français) avec le sélecteur 🌐 en haut ; elle est mémorisée. Les messages du terminal suivent `CATALOG_LANG=fr|en|es` (ou la langue du système).

Lors d’une mise à jour : la nouvelle version ferme d’elle-même l’ancienne copie encore ouverte. Si l’app signale que « le programme en cours est une ancienne version », fermez toutes les fenêtres noires de Catalog Finder et rouvrez-le.

## Les 3 étapes
1. **Chargez votre feuille** : collez le lien CSV publié de Google Sheets, ou importez le `.csv`. La ligne d’en-têtes est détectée même s’il y a des titres au-dessus ; les colonnes en anglais, espagnol et français sont reconnues (`MARQUE`, `PRIX`, `C-tag`…).
2. **Que cherchez-vous ?** Écrivez-le comme à une personne (français, anglais ou espagnol) : *« sacs noirs à moins de 500 euros, choisis 5 variés »*. Ou filtrez à la main : tranche de prix, état, marques, entity, texte, ordre, uniquement avec photos.
3. **Choisissez** : cochez les cartes, *Sélectionner tous les résultats* ou *les premiers N*. Puis **Télécharger Excel (.xlsx)**.

## 🗂 Une seule app : Accueil · Recherche · Clients · Factures · 📊 Ventes · Nouveautés · Entités
Tout est stocké dans **`catalog.db`**, un seul fichier dans le dossier (pas dans git) ; pour sauvegarder, fermez l’app et copiez-le. Les réglages du navigateur y sont copiés automatiquement la première fois.
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
- **Snapshot complet (xlsx à plusieurs onglets) :** importez le xlsx ou collez son lien d’export xlsx ; plusieurs liens CSV séparés par des espaces fonctionnent aussi.
  - Chaque onglet devient un **Canal**.
  - Nouveaux filtres **Type** (Item Type) et **Owner**.
  - Prix actuel = *PAT - Current* avec la colonne « Cur » juste avant ; prix initial = *PAT - Initial*.
  - Chaque carte montre la baisse depuis l’ajout, et on peut trier par plus forte baisse.
  - Les lignes dont la devise a changé sans que le montant change sont signalées « ⚠ devise douteuse ».
- **🧾 Factures** (UK, JP, HK) : depuis la sélection de la recherche, une liste CTag + prix collée ou un Excel.
  - HK : adjudication en HKD → yens, 5 % de commission, « Passed » sans prix.
  - Numérotation : par client pour UK, séquentielle pour JP, date et heure pour HK.
  - Case **Encaissée**.
  - PDF via l’impression du navigateur.
- **🏢 Entités :** société, banque, mentions légales et logo ; `entidades.json` dans le dossier est importé au démarrage.

## 📊 Ventes : analyse et rapport mensuel
1. Chaque mois, exportez le **snapshot des ventes** (le xlsx avec tous les onglets) et cliquez sur **⬆ Importer les ventes**. Réimporter le même fichier met à jour les ventes répétées au lieu de les dupliquer.
2. Facultatif : ajoutez à gauche un onglet **Grading** avec *Ctag* en colonne A et le texte du grading (comme les Public Notes) en colonne B. L’app lit le grade : « ITEM GRADING: AB », « GRADING: B+ »… (« N (New with Tags) » compte comme SA).
- **Calcul :**
  - Revenus = *Sold Price* (pour TRR et EBTH, ce que vous touchez).
  - Coût = *PAT - Current* (prix TTC), avec sa devise.
  - Bénéfice = revenus − coût, au **taux de change du jour de chaque vente**. Les taux de la BCE se téléchargent seuls et sont stockés dans `catalog.db` (internet nécessaire à l’import).
  - Jours avant vente = de *Added Date* à *Sold Date*.
- **Résumé :**
  - Unités, revenus, bénéfice, marge, panier moyen, jours avant vente et ventes à perte.
  - Comparé à la période précédente ou à la même période l’an dernier.
  - Ventes par mois (ou semaine) et canal, histogramme des jours avant vente et tableau par canal.
  - Les mois incomplets sont marqués « * », et « ⚠ Qualité des données » signale ce qui ne colle pas.
- **Filtres :**
  - Canal, entité, catégorie/type, marque, owner/buyer, grade et tranche de coût.
  - Période : tout, 30/90 derniers jours, 6 ou 12 mois, mois en cours, mois précédent, cette année ou dates libres.
  - Devise des montants : USD, JPY, EUR…
- **Modèle, couleur, matière et taille** sont lus dans chaque titre (Neverfull MM, Keepall 55, GG Marmont, Lady Dior, Carré 90… ; Monogram = toile marron). Filtrez-les avec la pastille **Modèle / couleur**. « Produit » = le modèle si le titre le donne ; sinon ligne + type (p. ex. « Prada · Saffiano Tote bag »).
- **🔥 Ce qui se vend :** les produits les plus vendus de la période, en phrases concrètes :
  - Unités vendues et tendance par rapport à la période précédente.
  - Prix typique, ×coût et jours avant vente.
  - Le canal où ils se vendent, celui qui paie la meilleure marge et le plus rapide.
  - Le stock restant et combien de mois il couvre.
  - Regroupement par modèle, modèle + taille, ligne, couleur ou matière. À côté, « Ce qui ne bouge pas ».
- **🛒 Acheteurs :** ce qui se vend et ce qui ne se vend pas dans les achats de chacun :
  - Pièces achetées depuis le début de l’historique, combien se sont vendues, et ce qui est normal pour la même marque, catégorie et mois d’achat (comparaison équitable).
  - En cliquant sur un acheteur : ce qui marche, ce qui ne marche pas, son stock de plus de 6 mois et ses pièces bloquées, avec Excel et « Voir dans la recherche ».
  - Sert à décider quoi acheter et où vendre, pas à juger qui que ce soit.
- **💴 Prix d'achat :** qui paie plus pour la même chose et où baisser le coût :
  - Regroupe ce qui a été acheté (vendu + en stock) par marque, modèle, taille, ligne et grade. Exemple : « Louis Vuitton · Keepall 50 · Monogram · grade B+ ».
  - Par groupe : coût médian, fourchette normale et, par buyer, combien il en a acheté et son coût médian vs la médiane (+12 % = paie 12 % de plus).
  - « Payé en trop » : ce qu'on aurait économisé en achetant tout à la médiane de son groupe. En haut, le résumé par buyer.
  - « Vend vs médiane » : si quelqu'un paie plus mais vend aussi plus cher, il ne paie pas trop. Regardez les photos (cliquez sur le groupe) avant de conclure.
  - Coût = PAT initial avec taxes, au taux du jour d'achat. Choisissez la devise JPY pour voir les yens exacts. Les pièces 3× plus ou moins chères que leur groupe ne comptent pas (souvent autre chose).
  - Pour que le stock utilise son coût initial, rechargez une fois la feuille de stock dans le chercheur.
- **✨ Demandez à l’IA :** écrivez une question comme à une personne (« quels modèles Gucci se vendent le mieux et où ? »).
  - L’IA ne reçoit pas votre fichier : elle demande des tableaux calculés sur votre ordinateur (ventes, stock, acheteurs, mots des titres et, si besoin, quelques photos) et répond avec ces chiffres.
  - Vous voyez chaque tableau utilisé et pouvez les télécharger en Excel. Vous pouvez poser des questions de suivi.
  - Elle utilise la même clé que la recherche (*Activer l’IA…*). Opus 5.5 par défaut (quelques centimes par question) ; Sonnet 5.5 et Haiku 5.5 coûtent moins.
  - Si le modèle refuse une question à cause de ses filtres de sécurité, l’API la relance automatiquement sur le modèle recommandé par Anthropic.
- **Classements :** par marque, modèle, modèle + taille, ligne, couleur, matière, catégorie, type, canal, entité, owner, buyer, grade, mois ou tranche de coût. Cliquez sur une ligne pour filtrer.
- **Stock et rotation** (utilise la dernière feuille chargée dans la recherche) :
  - Mois de stock et taux d’écoulement par marque · catégorie (ou autre regroupement).
  - Signaux : ▲ **Acheter plus** (se vend vite et avec marge), ▼ **Surstock**, ◆ **Lent**.
  - **Pièces bloquées :** en stock depuis plus longtemps que le délai de vente de 90 % des pièces similaires. Avec le meilleur canal par marge et le plus rapide. *🔎 Voir dans la recherche* les ouvre filtrées.
- **Pièces vendues :** chaque vente avec coût, vente, bénéfice et marge, avec des filtres comme « à perte » ou « sans PAT ».
- **📄 Rapport mensuel :** choisissez le mois puis **🖨 PDF** ou **⬇ Excel**. Il contient :
  - Un résumé par rapport au mois précédent et au même mois l’an dernier.
  - Canaux, entités, principales marques et types, plus grosses ventes et pertes.
  - Quoi acheter et ce qui est en trop.
  - Une partie par buyer pour orienter les achats (ce n’est pas une mesure du travail de quiconque).
- **⬇ Excel** (en haut) télécharge ce que vous voyez : période et filtres.

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
