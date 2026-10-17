/* Lee del título de cada pieza el modelo, la línea (lona / piel), el color, el material y la talla.
   Diccionario por marca sacado de los títulos reales; lo que no reconoce se queda vacío y sale como «—». */
'use strict';
const ANORM = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, "'").toLowerCase();
// [nombre, patrón opcional]; sin patrón se usa el propio nombre. El orden importa: lo más concreto primero.
const ABRANDS = [
  ['Louis Vuitton', /louis vuitton|^lv$/, ['Neverfull', 'Speedy', 'Alma', 'Keepall', ['Pochette Métis', 'pochette metis'], ['Multi Pochette', 'multi pochette'], ['Pochette Accessoires', 'pochette accessoires?'],
    ['Pochette Félicie', '(pochette )?felicie'], ['Pochette Florentine', '(pochette )?florentine'], ['Pochette Kirigami', 'kirigami'], ['Toiletry Pouch', 'toiletry pouch'], 'Favorite', 'Eva', 'Musette', ['Saint-Jacques', 'saint[- ]jacques'],
    ['Saint Placide', 'saint[- ]placide'], ['Saint-Germain', 'saint[- ]germain'], ['Saint Cloud', 'saint[- ]cloud'], ['Sac Plat', '(petit )?sac plat'], 'Geronimos', 'Looping', 'Pallas', 'Zippy', ['MyLockMe', 'my ?lockme'], ['LockMe', 'lock ?me'],
    'Lockit', ['Petite Malle', 'petite malle'], ['Nano Trunk', 'nano trunk'], ['Soft Trunk', 'soft trunk'], 'Trousse', 'Saumur', 'Brea', 'Sarah', 'Papillon', 'Agenda', 'Montaigne', ['Amazone', 'amazone'], ['NéoNoé', 'neo ?noe'],
    ['Noé', 'petit noe|noe'], 'Tadao', 'Bloomsbury', 'Twist', 'Capucines', 'Marly', ['Palm Springs', 'palm springs'], 'Montsouris', 'Reporter', 'Danube', 'Deauville', 'Vavin', ['Boîte Chapeau', 'boite chapeau'], 'Reade', 'Soufflot',
    'Naviglio', 'Onthego', 'Dauphine', 'Marignan', 'Brooklyn', 'Palermo', ['Cartouchière', 'cartouchiere'], ['Porte-Documents', 'porte[- ]documents'], 'Tivoli', 'Batignolles', 'Artsy', 'Delightful', 'Graceful', 'Totally', 'Galliera',
    'Odeon', 'Croissant', 'Cluny', 'District', 'Abbesses', 'Olav', 'Ellipse', 'Mabillon', 'Popincourt', 'Sully', 'Tambourine', 'Thompson', 'Wilshire', 'Houston', 'Bedford', 'Lexington', 'Manhattan', ['Pont Neuf', 'pont[- ]neuf'],
    'Riviera', 'Malesherbes', 'Sologne', ['Viva Cité', 'viva cite'], 'Bagatelle', 'Locky', 'Coussin', 'Dora', 'Diane', 'Carryall', 'Christopher', 'Discovery', 'Josephine', 'Emilie', 'Victorine', 'Insolite', 'Clémence', 'Curieuse',
    'Kimono', ['Grand Palais', 'grand palais'], 'Hampstead', 'Westminster', 'Duomo', 'Trevi', 'Rivoli', 'Siracusa', 'Evora', 'Avenue', ['Nice', 'nice (bb|mini|nano|vanity)|vanity nice'], ['Cabas Mezzo', 'mezzo'], ['Cabas Piano', 'piano'], ['Pochette Voyage', 'pochette voyage'], ['Pochette Jour', 'pochette jour'], ['Pochette Dame', 'pochette dame'],
    ['Pochette Homme', 'pochette homme'], ['Pochette Lena', 'lena'], ['Speedy Bandoulière', 'speedy bandouliere'], 'Steamer', 'Bosphore', 'Monceau', 'Louise', 'Daniel', 'Mick', ['Porte Monnaie', 'monnaie'], 'Sistina', ['Porte Trésor', 'tresor'],
    'Lumineuse', 'Bastille', ['Roxbury Drive', 'roxbury'], 'Verona', 'Trocadero', 'Saintonge', 'Saleya', 'Ipanema', 'Bellevue', ['Randonnée', 'randonnee'], 'Nolita', ['Porte Crédit', 'credit'], 'Brazza', 'Pegase', 'Greenwich', 'Brittany',
    'Retiro', 'Croisette', ['Very', 'very (one|tote|bag|zipped|saddle|bucket)'], 'Volta', 'Elise', 'Cannes', 'Gange', 'Sonatine', 'Triana', 'Rivington', 'Sarria', 'Mazarine', 'Knightsbridge', 'Partition', 'Thomas', 'Marais',
    ['Saint Tropez', 'saint[- ]tropez'], 'Babylone', 'Luco', ['Serviette', 'serviette'], 'Kazan', ['Etui Cigarette', 'etui|cigarette'], ['Gibecière', 'gibeciere'], 'Marceau', ['Bumbag', 'bum ?bag'], ['Amazone', 'amazon'], 'Nile', ['Name Tag', 'name tag'], ['Cles', 'pochette cles|cles']],
    [['Empreinte', 'empreinte'], ['Vernis', 'vernis'], ['Eclipse', 'eclipse'], ['Macassar', 'macassar'], ['Reverse', 'reverse'], ['Multicolore', 'multicolou?re?|multicolor'], ['Denim', 'denim'], ['Mini Lin', 'mini lin'],
      ['Giant', 'giant|geant'], ['Cherry', 'cherry|cerises'], ['Damier Ebene', 'damier ebene|ebene'], ['Damier Azur', 'damier azur|azur'], ['Damier Graphite', 'damier graphite|graphite'], ['Damier Infini', 'damier infini'], ['Damier Sauvage', 'damier sauvage'], ['Epi', 'epi'],
      ['Taiga', 'taiga(rama)?'], ['Mahina', 'mahina'], ['Antigua', 'antigua'], ['Suhali', 'suhali'], ['Utah', 'utah'], ['Nomade', 'nomade'], ['Taurillon', 'taurillon'], ['Monogram', 'monogram']]],
  ['Gucci', /gucci/, [['GG Marmont', 'marmont'], 'Ophidia', 'Dionysus', ['Horsebit 1955', 'horsebit 1955'], ['Jackie', 'jackie'], ['Soho Disco', 'soho disco'], 'Soho', 'Sylvie', 'Nymphaea', ['Bamboo', 'bamboo'], 'Padlock', 'Blondie',
    'Sukey', ['Abbey', 'abbey'], 'Bree', 'Joy', 'Zumi', 'Swing', 'Emily', 'Princy', 'Arli', ['Lady Lock', 'lady lock'], ['Queen Margaret', 'queen margaret'], 'Diana', ['Bright Bit', 'bright bit'], 'Aphrodite', 'Attache', 'Ghost',
    'Hysteria', 'Indy', 'Britt', 'Pelham', 'Positano', 'Bardot', 'Beloved', 'Rajah', 'Mayfair', ['Broadway', 'broadway'], 'Marrakech', 'Lovely', ['Blind for Love', 'blind'], 'Charmy', 'Jolicoeur', 'Charlotte',
    'Courrier', 'Morpheus', 'Scarlett', ['Half Moon', 'half[- ]?moon'], 'Jolie', 'Treasure', 'Rania', ['Icon Bit', 'icon bit|icon'], ['Bella', 'bella'], ['Boat Pochette', 'boat'], ['Emblem', 'emblem'], ['Dome', 'dome'], ['Horsebit', 'horsebit'],
    ['Interlocking G', 'interlocking g']],
    [['GG Blooms', 'supreme blooms|gg blooms|blooms'], ['GG Supreme', 'gg supreme|supreme'], ['Microguccissima', 'microguccissima'], ['Guccissima', 'guccissima'], ['Diamante', 'diamante'], ['Off The Grid', 'off (the )?grid'],
      ['GG Imprimé', 'imprime'], ['Caleido', 'caleido|kaleidoscope'], ['Trapuntata', 'trapuntata'], ['Animalier', 'animalier'], ['Gucci Kids', "children'?s|kids"], ['Web', 'web(line)?|sherry line'], ['Matelassé', 'matelasse'], ['GG Canvas', 'gg canvas|gg monogram|gg pattern']]],
  ['Chanel', /chanel/, [['Classic Flap', 'classic flap|timeless|double flap|classic double|jumbo|classic (single|medium|small|mini)|matelasse (double|single|flap)|caviar (jumbo|timeless|classic)'], ['2.55 Reissue', 'reissue|2\\.?55'],
    ['Boy', 'boy'], 'Gabrielle', ['Chanel 19', 'chanel 19|\\b19 (flap|bag|handbag|wallet|maxi|large)'], ['Wallet on Chain', 'wallet on chain|woc|chain wallet'], ['Coco Handle', 'coco handle'], ['Grand Shopping Tote', 'gst|grand shopping'],
    ['Petite Shopping Tote', 'pst|petite shopping'], 'Deauville', ['Cambon', 'cambon'], ['Paris-Biarritz', 'paris[- ]biarritz'], 'Executive', 'Cerf', ['Bowling', 'bowling'], 'Diana', ['Vanity', 'vanity'], ['Chocolate Bar', 'chocolate bar'],
    ['Medallion', 'medallion'], 'Mademoiselle', ['Coco Cocoon', 'cocoon'], ['Travel Line', 'travel line|new travel'], ['Wild Stitch', 'wild stitch'], ['Trendy CC', 'trendy cc'], ['Business Affinity', 'business affinity'], ['Filigree', 'filigree'],
    ['East West', 'east west'], ['Camera', 'camera'], ['Camellia', 'camellia'], ['Urban Spirit', 'urban'], ['Beauty Lock', 'beauty'], 'Surpique', ['O-Case', 'o[- ]case'], 'Curve', ['Label Click', 'label'],
    ['Accordion', 'accordion'], 'Jelly', ['Half Moon', 'half[- ]?moon'], 'Enchained', ['Elementary Chic', 'elementary'], ['Paris-Hamburg', 'paris[- ]hamburg'], ['Coco Mark', 'coco mark|cc mark']],
    [['Caviar', 'caviar'], ['Lambskin', 'lambskin'], ['Chevron', 'chevron'], ['Tweed', 'tweed'], ['Matelassé', 'matelasse|quilted'], ['Patent', 'patent'], ['Jersey', 'jersey'], ['Denim', 'denim']]],
  ['Hermès', /hermes/, ['Birkin', ['Kelly Pochette', 'kelly pochette'], ['Kelly Dog', 'kelly dog'], 'Kelly', 'Constance', ['Evelyne', 'evelyne?'], 'Picotin', ['Garden Party', 'garden party'], 'Herbag', 'Bolide', 'Lindy', ['Jypsière', 'jypsiere'], 'Halzan',
    'Victoria', ['Fourre Tout', 'fourre[- ]tout'], ['Bora Bora', 'bora'], ["Silk'in", "silk'?in"], 'Cabag', 'Valparaiso', 'Verrou', 'Aline', 'Roulis', 'Oxer', ['Bride-a-Brac', 'bride[- ]a[- ]brac'], ['Béarn', 'bearn'], 'Dogon', 'Azap', 'Calvi', 'Bastia', 'Jige', ['Maxi Twilly', 'maxi twilly'], 'Twilly', ['Petit Carré', 'petit carre'], ['Carré', 'carre|scarf 90|silk scarf|scarf'],
    ['Plissé', 'plisse|pleated'], 'Gavroche', 'Losange', 'Bandana', ["Chaîne d'Ancre", "chaine d'ancre|chaine d ancre"], ['Collier de Chien', 'collier de chien|\\bcdc\\b'], ['Clic H', 'clic[- ]?h|clic[- ]clac'], ['Herline', 'herline'],
    'Clipper', ['Cape Cod', 'cape cod'], ['Heure H', 'heure h'], 'Arceau', 'Nantucket', 'Médor', ['Tandem', 'tandem'], ['H Belt', 'h belt|constance belt']],
    [['Togo', 'togo'], ['Clémence', 'clemence'], ['Epsom', 'epsom'], ['Swift', 'swift'], ['Box', 'box calf|\\bbox leather'], ['Chèvre', 'chevre'], ['Barenia', 'barenia'], ['Evercolor', 'evercolor'], ['Courchevel', 'courchevel'],
      ['Ardennes', 'ardennes'], ['Fjord', 'fjord'], ['Vache Hunter', 'vache'], ['Toile', 'toile'], ['Enamel', 'enamel|emaille'], ['Silk', 'silk']]],
  ['Prada', /prada/, ['Galleria', ['Re-Edition', 're[- ]?edition'], 'Cleo', 'Cahier', ['Double', 'double (zip|bag)'], 'Bauletto', 'Promenade', 'Elektra', 'Esplanade', 'Diagramme', 'Sidonie', 'Arque', 'Odette', ['Pionnière', 'pionniere'],
    'Symbole', 'Etiquette', ['Bowling', 'bowling'], 'Banana', ['Twin Pocket', 'twin pocket'], 'Panier', ['Vela', 'vela'], 'Paradigme', 'Pattina', ['Robot', 'robot'], ['Plex', 'plex'], ['Sound', 'sound'], 'Sacca', ['Trolley', 'trolley|carry[- ]on'], ['Shopping', 'shopping'], ['Triangle', 'triangle (bag|pouch)']],
    [['Saffiano Lux', 'saffiano lux'], ['Saffiano', 'saffiano'], ['Vitello Daino', 'vitello daino|daino'], ['Vitello Phenix', 'phenix'], ['Vitello Shine', 'vitello shine'], ['Re-Nylon', 're[- ]?nylon'], ['Tessuto', 'tessuto'],
      ['Canapa', 'canapa'], ['Nappa Gaufré', 'gaufre'], ['Impunturé', 'impuntu'], ['Vitello Antik', 'antik'], ['Cinghiale', 'cinghiale'], ['Vernice', 'vernice'], ['Stampato', 'stampat'], ['City Calf', 'city calf'], ['Glacé Calf', 'glace calf'], ['Soft Calf', 'soft calf'], ['Spazzolato', 'spazzolato'], ['Cervo', 'cervo']]],
  ['Celine', /celine/, [['Luggage', 'luggage'], ['Trapèze', 'trapeze'], ['Belt Bag', 'belt bag'], 'Boogie', ['Triomphe', 'triomphe (bag|shoulder|crossbody|clutch)|ava triomphe'], 'Phantom', ['Cabas', 'cabas'], ['Classic Box', 'classic box'],
    'Ava', 'Trio', 'Sangle', 'Seau', ['16', '\\b16 (bag|handbag)|seize'], ['Big Bag', 'big bag'], 'Edge', 'Blade', ['Frame', 'frame'], 'Sulky', 'Trotteur', ['C Bag', '\\bc bag'], 'Teen', 'Tie', 'Bittersweet', 'Carriage', 'Hippo'],
    [['Macadam', 'macadam'], ['Triomphe Canvas', 'triomphe canvas|triomphe'], ['Drummed', 'drummed']]],
  ['Fendi', /fendi/, [['Mamma Baguette', 'mamma'], 'Baguette', ['Peekaboo', 'peek ?a ?boo'], 'Selleria', ['Kan I', 'kan ?i'], ['By The Way', 'by the way'], ['Mon Trésor', 'mon tresor'], ['2Jours', '2 ?jours'], ['3Jours', '3 ?jours'], 'Spy',
    ['Monster', 'monster|bag bugs'], 'Dotcom', 'Sunshine', 'First', 'Runaway', 'Chameleon', ['Roll', 'roll bag|\\broll\\b'], ['Petite 2Jours', 'petite 2'], 'Chef', ['Roma', 'roma'], 'Grace', 'Mia', 'Oyster', 'Fendista', 'Fendace'],
    [['Zucchino', 'zucchino'], ['Zucca', 'zucca'], ['Pequin', 'pequin'], ['Pecan', 'pecan'], ['Vertigo', 'vertigo'], ['FF', '\\bff\\b'], ['Spalmati', 'spalmati']]],
  ['Dior', /dior/, [['Lady D-Lite', 'lady d[- ]?lite'], ['Lady Dior', 'lady dior|\\blady\\b'], 'Saddle', ['Book Tote', 'book tote'], 'Diorama', 'Diorissimo', ['30 Montaigne', 'montaigne'], 'Bobby', 'Caro', 'Dioraddict', 'Diorever',
    ["J'Adior", "j'?adior"], ['Miss Dior', 'miss dior'], 'Granville', 'Panarea', 'Gaucho', 'Malice', 'Detective', ['Street Chic', 'street chic'], 'Hardcore', ['Tribales', 'tribales'], ['Clair D Lune', 'clair d.? ?lune'], ['Rose des Vents', 'rose des vents'], 'Roller', 'Milly', 'Diorquake', 'Vibe'],
    [['Cannage', 'cannage'], ['Oblique', 'oblique'], ['Honeycomb', 'honeycomb'], ['Trotter', 'trotter'], ['Toile de Jouy', 'toile de jouy']]],
  ['Salvatore Ferragamo', /ferragamo/, [['Vara', 'vara|vala'], 'Gancini', 'Sofia', 'Viva', 'Marisa', 'Amy', 'Studio', 'Trifolio', 'Boxyz', 'Fiamma', 'Margot', 'Gancio', 'Niki', 'Thalia', 'Fiera', 'Calypso', ['Cage', '\\bcage']], []],
  ['Tiffany & Co.', /tiffany/, [['Open Heart', 'open heart'], ['Return to Tiffany', 'return to|\\brtt\\b'], ['Loving Heart', 'loving heart'], ['Heart Tag', 'heart tag'], ['Bean', 'bean'], ['Atlas', 'atlas'], ['1837', '1837'],
    ['Tiffany T', '\\bt (smile|wire|square|two|one|1)\\b|tiffany t\\b'], ['Teardrop', 'tear ?drop'], ['Diamonds by the Yard', 'by the yard|yard'], ['Bone Cuff', 'bone cuff'], 'Mesh', 'Starfish', ['Olive Leaf', 'olive leaf'],
    ['Infinity', 'infinity'], ['Knot', 'knot'], ['HardWear', 'hard ?wear'], ['Lock', '\\block\\b'], 'Victoria', 'Soleste', ['Solitaire', 'solitaire'], ['Cross', 'cross'], ['Key', '\\bkey'], ['Circle', 'circle'], ['Bar', '\\bbar\\b']],
    [['Elsa Peretti', 'elsa peretti|peretti'], ['Paloma Picasso', 'paloma picasso|picasso']]],
  ['Bottega Veneta', /bottega/, [['Cassette', 'cassette'], ['The Pouch', 'the pouch|\\bpouch\\b'], 'Jodie', 'Arco', 'Mount', 'Point', 'Cabat', 'Veneta', 'Olimpia', 'Knot', 'Loop', 'Sardine', 'Andiamo', 'Candy', 'Hop', 'Roma', 'Nodini',
    'Piazza', 'Marie', 'Beak', 'Shell', 'Trine', 'Angle', 'Rialto', 'Sunrise', 'Canette', ['Document Case', 'document'], ['Twist', 'twist']],
    [['Intrecciomirage', 'intrecciomirage'], ['Intrecciolusion', 'intrecciolusion'], ['Maxi Intrecciato', 'maxi intrecciato|maxi'], ['Intrecciato', 'intrecciato|woven'], ['Nappa', 'nappa'], ['Cervo', 'cervo'], ['Rubber', 'rubber']]],
  ['Burberry', /burberry/, [['TB', '\\btb\\b'], 'Lola', 'Olympia', 'Title', 'Banner', 'Buckle', 'Canterbury', ['Bowling', 'bowling'], ['Pocket', 'pocket bag'], 'Ashby', 'Peyton', 'Chichester', 'Sonny', 'Macken', ['Bum Bag', 'bum ?bag'], ['Trench', 'trench'], ['Cashmere Scarf', 'cashmere scarf']],
    [['Smoked Check', 'smoked'], ['E-Canvas', 'e[- ]canvas'], ['Nova Check', 'nova'], ['House Check', 'house check'], ['Haymarket Check', 'haymarket'], ['Vintage Check', 'vintage check'], ['Horseferry', 'horseferry'], ['Check', 'check|plaid']]],
  ['Saint Laurent', /saint laurent|ysl/, ['Kate', 'Loulou', ['Sac de Jour', 'de jour'], ['Belle de Jour', 'belle de jour'], ['Cabas Chyc', 'chyc'], ['Envelope', 'envelope'], 'Niki', 'Sunset', 'College', ['Lou', 'lou camera|\\blou\\b'],
    ['Le 5 à 7', '5 a 7'], 'Muse', 'Downtown', 'Roady', 'Mombasa', 'Uptown', 'Cassandra', 'Manhattan', 'Solferino', ['Rive Gauche', 'rive gauche'], 'Icare', 'Jamie', ['Le 37', 'le 37'], 'Becky', 'Blogger', 'Bellechasse', ['Y-Line', 'y[- ]line'], 'Teddy', 'Betty', 'Vicky', ['Rive Droite', 'rive droite'], ['Cassandre', 'cassandre']],
    [['Grain de Poudre', 'grain de poudre'], ['Monogramme', 'monogramme'], ['Chevron', 'chevron'], ['Matelassé', 'matelasse'], ['Velvet', 'velvet']]],
  ['Balenciaga', /balenciaga/, [['Le Cagole', 'cagole'], 'Hourglass', ['City', 'city'], 'Everyday', 'Papier', ['Navy Cabas', 'cabas'], ['Giant', 'giant'], ['Motocross', 'motocross|classic (first|town|work|day|hip|twiggy|velo)'],
    ['Neo Classic', 'neo classic'], 'Town', 'Work', 'Velo', ['Part Time', 'part time'], 'Twiggy', 'Weekender', 'Ville', 'Crush', ['Clip', 'clip'], ['Envelope', 'envelope'], 'Explorer', 'Wheel', ['Le Dix', 'le dix'], 'Bazar', 'Monaco',
    ['Triangle', 'triangle'], ['Basket', 'basket'], 'Panier', 'Hip', 'Superbusy', ['Barbès', 'barbes'], ['Bazar', 'bazaa?r'], 'Essex', 'Sharp', 'Downtown', 'Souvenir'],
    [['Arena', 'arena'], ['Graffiti', 'graffiti'], ['Metallic Edge', 'metallic edge'], ['Duty Free', 'duty free']]],
  ['Chloé', /chloe/, [['Faye Day', 'faye day'], 'Faye', ['Drew Bijou', 'drew bijou'], 'Drew', 'Paraty', 'Woody', 'Nile', 'Marcie', 'Roy', 'Tess', 'Aby', 'Mily', 'Kiss', 'Pixie', 'Paddington', 'Edith', 'Silverado', 'Hudson', 'Elsie', 'Daria',
    'Darryl', 'Penelope', 'Sally', 'Baylee', 'Alice', 'Clare', 'Motty', 'Alison', 'Angie', 'Heloise', 'Georgia', 'Ethel', 'Joan'], []],
  ['Loewe', /loewe/, ['Puzzle', 'Amazona', 'Hammock', 'Flamenco', 'Gate', ['Basket', 'basket'], 'Barcelona', ['Cushion', 'cushion'], 'Elephant', 'Goya', 'Heritage', ['Velázquez', 'velazquez'], 'Balloon', 'Bunny', 'Cubi', 'Senda',
    'Squeeze', 'Pebble', 'Military', 'Fortune', 'Postal', 'Lazo', 'Missy', ['Anniversary', 'anniversary']],
    [['Anagram Repeat', 'repeat'], ['Anagram', 'anagram|angram'], ['Nappa Aire', 'aire'], ["Paula's Ibiza", "paula'?s|ibiza"], ['Raffia', 'raffia']]],
  ['MCM', /\bmcm\b/, [['Stark', 'stark'], 'Patricia', 'Milla', 'Millie', 'Tracy', 'Liz', 'Aren', ['Bebe Boo', 'bebe boo'], 'Essential', 'Berlin', 'Dual', 'Nuovo', ['Mode Travia', 'travia'], ['Rabbit', 'rabbit']],
    [['Visetos', 'visetos'], ['Logogram', 'logogram']]],
  ['Cartier', /cartier/, [['Love', '\\blove\\b'], ['Juste un Clou', 'clou'], 'Trinity', ['Panthère', 'panthere'], 'Santos', 'Tank', 'Pasha', ['Ballon Bleu', 'ballon bleu'], 'Marcello', ['C de Cartier', 'c de cartier'],
    ['Happy Birthday', 'happy birthday'], ['Diamants Légers', 'diamants legers'], 'Clash', 'Maillon', 'Ecrou', ['Must', 'must']], [['Must de Cartier', 'must']]],
  ['Bulgari', /bulgari|bvlgari/, ['Serpenti', ['B.zero1', 'b\\.? ?zero ?1|zero ?1'], ['Bulgari Bulgari', 'bulgari bulgari|bvlgari bvlgari'], ["Diva's Dream", 'diva'], 'Parentesi', 'Fiorever', 'Chandra', 'Octo', 'Solotempo',
    'Rettangolo', 'Astrale', 'Quadrado', ['Isabella Rossellini', 'rossellini']], [['Logomania', 'logomania']]],
  ['Valentino', /valentino/, [['Rockstud Spike', 'rockstud spike|spike'], ['Rockstud', 'rockstud|rock stud'], ['Glam Lock', 'glam ?lock'], 'Candystud', ['VLogo', 'v ?logo|vsling|v sling'], ['Roman Stud', 'roman stud'], ['Locò', '\\bloco\\b'],
    'Supervee', ['VRing', 'v ?ring']], []],
  ['Miu Miu', /miu ?miu/, ['Coffer', 'Wander', 'Arcadie', ['Lady', 'lady'], ['Bow', '\\bbow\\b'], ['Biker', 'biker']], [['Matelassé', 'matelasse'], ['Madras', 'madras'], ['Nappa Crystal', 'crystal'], ['Vitello Lux', 'vitello lux']]],
  ['Givenchy', /givenchy/, ['Antigona', 'Pandora', 'Nightingale', ['4G', '\\b4g\\b'], 'Obsedia', 'Horizon', 'Kenny', ['Cut Out', 'cut ?out'], ['GV3', 'gv3'], 'Whip', 'Bond', 'Mystic', 'Voyou', 'Lucrezia'], []],
  ['Goyard', /goyard/, [['Saint Louis', 's(ain)?t\\.? louis'], 'Anjou', 'Artois', 'Belvedere', 'Saigon', 'Senat', 'Hardy', 'Rouette', 'Bellechasse', 'Alpin', ['Petit Flot', 'petit flot'], ['Croisière', 'croisiere'], 'Varenne', ['Cap Vert', 'cap ?vert'],
    'Plumet', 'Montmartre', ['Saint Pierre', 's(ain)?t\\.? pierre'], 'Matignon', 'Grenelle', 'Bourget', 'Cisalpin', 'Chypre'], [['Goyardine', 'goyardine']]],
  ['Omega', /omega/, ['Constellation', 'Seamaster', 'Speedmaster', ['De Ville', 'de ?ville'], 'Polaris', 'Geneve', 'Dynamic', ['Aqua Terra', 'aqua terra'], 'Railmaster', ['Planet Ocean', 'planet ocean']], []],
  ['Rolex', /rolex/, [['Datejust', 'date ?just'], ['Day-Date', 'day[- ]?date'], 'Submariner', 'Daytona', ['GMT-Master', 'gmt'], 'Explorer', ['Oyster Perpetual', 'oyster perpetual'], ['Yacht-Master', 'yacht'], ['Air-King', 'air[- ]?king'], 'Milgauss',
    'Cellini', 'Precision'], []],
  ['TAG Heuer', /tag heuer/, ['Carrera', 'Aquaracer', ['Formula 1', 'formula'], 'Monaco', 'Link', 'Kirium', 'Professional'], []],
  ['Tasaki', /tasaki/, ['Balance', ['Refined Rebellion', 'refined rebellion'], 'Danger'], [['Akoya', 'akoya'], ['South Sea', 'south sea'], ['Baroque', 'baroque']]],
  ['Mikimoto', /mikimoto/, [], [['Akoya', 'akoya'], ['South Sea', 'south sea'], ['Baroque', 'baroque']]],
  ['Coach', /^coach/, ['Tabby', 'Rogue', 'Willis', ['Carryall', 'carryall'], 'Swinger', 'Cassie', 'Dinky', 'Field', 'Kitt', 'Parker', 'Ergo'], [['Signature', 'signature']]],
  ['Longchamp', /longchamp/, [['Le Pliage', 'pliage'], 'Roseau', ['Le Foulonné', 'foulonne']], []],
  ['Jimmy Choo', /jimmy choo/, [['Bon Bon', 'bon ?bon'], 'Varenne', 'Helia', 'Sasha', 'Rebel', 'Callie', 'Ellipse', 'Avenue', 'Pimlico', 'Romy', 'Anouk', 'Aurelie'], []],
  ['Christian Louboutin', /louboutin/, [['So Kate', 'so kate'], 'Pigalle', 'Iriza', ['Decolleté', 'decollete'], 'Follies', 'Paloma', 'Kypipouch', 'Elisa', 'Cabata', 'Loubila', ['Loubi54', 'loubi ?54']], [['Spikes', 'spike']]],
  ['Versace', /versace/, ['Medusa', 'Virtus'], [['La Greca', 'greca'], ['Barocco', 'barocco|baroque']]],
  ['Dolce & Gabbana', /dolce/, ['Sicily', 'Devotion', 'Lucia'], []],
  ['Stella McCartney', /stella/, ['Falabella'], []],
  ['Marc Jacobs', /marc jacobs/, ['Snapshot', ['The Tote Bag', 'the tote'], 'Stam', 'Softshot', ['The Sack', 'the sack']], []],
  ['Van Cleef & Arpels', /van ?cleef/, ['Alhambra', ['Perlée', 'perlee'], 'Frivole', 'Lucky'], []],
  ['Chopard', /chopard/, [['Happy Diamonds', 'happy diamond'], ['Happy Sport', 'happy sport'], ['Ice Cube', 'ice cube']], []],
  ['Delvaux', /delvaux/, [['Brillant', 'brillant'], ['Tempête', 'tempete'], ['Pin', '\\bpin\\b'], ['Cool Box', 'cool box']], []],
  ['Anteprima', /anteprima/, [['Wirebag', 'wire ?bag']], []],
  ['Tod\'s', /tod'?s/, [['D-Bag', 'd[- ]?bag'], 'Wave', 'Gommino'], []],
  ['Ray-Ban', /ray[- ]?ban/, ['Wayfarer', 'Aviator', 'Clubmaster'], []],
];
// colores: la primera palabra de color del título que no sea de herrajes («gold hardware», «gold-tone»…)
const ACOLORS = [['Gold', '(rose|pink|yellow|white) gold'], ['Black', 'black|noir|nero|onyx'], ['White', 'white|blanc|bianco'], ['Cream', 'ivory|cream|off[- ]white|ecru|vanilla'], ['Beige', 'beige|nude|sand|greige|taupe|etoupe|trench'],
  ['Brown', 'brown|chocolate|cognac|tan|camel|caramel|mocha|coffee|gold ?brown|chestnut|marron|ebony|bronze'], ['Burgundy', 'burgundy|bordeaux|wine|maroon|amarante|oxblood|rouge h'], ['Red', 'red|rouge|cherry|scarlet|rosso'],
  ['Pink', 'coral pink|salmon pink|pink|rose|fuchsia|magenta|blush|rosa'], ['Orange', 'orange|coral|apricot'], ['Yellow', 'yellow|mustard|lemon|jaune'], ['Green', 'green|khaki|olive|mint|vert|emerald green'], ['Navy', 'navy|marine|dark blue|midnight'],
  ['Blue', 'blue|turquoise|teal|aqua|bleu|indigo|azure'], ['Purple', 'purple|violet|lilac|lavender|plum|mauve'], ['Grey', 'grey|gray|charcoal|anthracite|gris'], ['Silver', 'silver'], ['Gold', 'gold'],
  ['Multicolor', 'multi[- ]?colou?r(ed)?|tri[- ]?colou?r|bi[- ]?colou?r|two[- ]tone|rainbow'], ['Clear', 'clear|transparent']];
const ACOLOR_RE = ACOLORS.map(([c, p]) => [c, new RegExp(`\\b(?:${p})\\b(?![- ]?(?:tone|hardware|hw|plated|chain|buckle|accents?|trim|logo|studs?|clasp))`, 'g')]);
// color por defecto de las lonas clásicas cuando el título no dice ninguno
const ALINE_COLOR = { 'Monogram': 'Brown', 'Damier Ebene': 'Brown', 'Damier Azur': 'White', 'Damier Graphite': 'Black', 'GG Supreme': 'Beige', 'GG Canvas': 'Beige', 'Zucca': 'Brown', 'Zucchino': 'Brown', 'Macadam': 'Brown', 'Visetos': 'Brown', 'Nova Check': 'Beige' };
const AMATS = [['Exotic', '(?<!embossed )(crocodile|alligator|python|ostrich|lizard|snakeskin|porosus|niloticus|stingray|galuchat)(?![- ]embossed)'], ['Patent leather', 'patent|vernis|vernice|glossy'], ['Suede', 'suede|nubuck'],
  ['Nylon', 'nylon|tessuto|econyl|techno'], ['Canvas', 'canvas|toile'],
  ['Leather', 'leather|calfskin|calf|lambskin|caviar|saffiano|epi|togo|clemence|epsom|swift|nappa|vitello|pebbled|grained|taurillon|empreinte|taiga|intrecciato|goatskin|chevre|deerskin|cowhide|vachetta|barenia|evercolor|madras|cervo|embossed|matelasse|quilted'],
  ['Fabric', 'cotton|denim|tweed|wool|cashmere|silk|satin|velvet|jersey|linen|knit|jacquard|fabric|cloth|felt|corduroy|fleece|polyester'], ['Straw', 'raffia|straw|wicker|rattan'], ['Plastic / PVC', 'pvc|plastic|vinyl|rubber|resin|acrylic'],
  ['Platinum', 'pt ?9[05]0|pt ?850|platinum'], ['Gold 18K', 'k18|18k|18 ?ct|750(?!ml)|yg750|wg750|pg750|rg750'], ['Gold 14K', 'k14|14k|585'], ['Silver', 'sv ?925|sterling|silver 925|ag925|\\bsv\\b'],
  ['Gold-plated', 'gold[- ]?plated|\\bgp\\b|gold[- ]tone|vermeil'], ['Steel', 'stainless|\\bss\\b|steel'], ['Metal', 'metal|brass']].map(([m, p]) => [m, new RegExp(`\\b(?:${p})`)]);
const ALINE_MAT = { Canvas: ['Monogram', 'Damier Ebene', 'Damier Azur', 'Damier Graphite', 'Damier Infini', 'Damier Sauvage', 'Eclipse', 'Macassar', 'Reverse', 'Giant', 'Multicolore', 'Cherry', 'GG Supreme', 'GG Canvas', 'GG Blooms',
  'Diamante', 'Zucca', 'Zucchino', 'Pequin', 'Macadam', 'Triomphe Canvas', 'Visetos', 'Goyardine', 'Oblique', 'Honeycomb', 'Trotter', 'Nova Check', 'House Check', 'Haymarket Check', 'Vintage Check', 'Check', 'Signature', 'Logomania', 'Must de Cartier'],
  Leather: ['Epi', 'Empreinte', 'Taiga', 'Mahina', 'Suhali', 'Utah', 'Nomade', 'Taurillon', 'Guccissima', 'Microguccissima', 'Saffiano', 'Saffiano Lux', 'Vitello Daino', 'Vitello Phenix', 'Vitello Shine', 'City Calf', 'Glacé Calf', 'Soft Calf',
    'Caviar', 'Lambskin', 'Togo', 'Clémence', 'Epsom', 'Swift', 'Box', 'Chèvre', 'Barenia', 'Evercolor', 'Intrecciato', 'Maxi Intrecciato', 'Nappa', 'Cannage', 'Madras', 'Matelassé', 'Grain de Poudre', 'Drummed', 'Nappa Gaufré', 'Arena'],
  'Patent leather': ['Vernis', 'Vernice'], Nylon: ['Tessuto', 'Re-Nylon', 'Impunturé'], Fabric: ['Silk', 'Tweed', 'Jersey', 'Denim', 'Mini Lin', 'Canapa', 'Velvet', 'Toile de Jouy'], Straw: ['Raffia'] };
const ALINE_MAT_OF = new Map(Object.entries(ALINE_MAT).flatMap(([m, ls]) => ls.map(l => [l, m])));
const ASIZE_TOK = { pm: 'PM', mm: 'MM', gm: 'GM', bb: 'BB', nano: 'Nano', mini: 'Mini', micro: 'Micro', small: 'Small', medium: 'Medium', large: 'Large', jumbo: 'Jumbo', maxi: 'Maxi', xs: 'XS', xxs: 'XXS', baby: 'Baby', teen: 'Teen' };
const AW = p => new RegExp(`(?:^|[^a-z0-9])(?:${p})(?![a-z0-9])`);
const ABRANDS_C = ABRANDS.map(([name, re, models, lines]) => ({ name, re, models: models.map(m => Array.isArray(m) ? [m[0], AW(m[1])] : [m, AW(ANORM(m))]), lines: lines.map(([l, p]) => [l, AW(p)]) }));
const ABRAND_CACHE = new Map();
function attrBrand(b) {
  const k = ANORM(b); if (ABRAND_CACHE.has(k)) return ABRAND_CACHE.get(k);
  const hit = k ? ABRANDS_C.find(x => x.re.test(k)) || null : null; ABRAND_CACHE.set(k, hit); return hit;
}
function attrsOf(brand, title, type) { // → { model, line, color, material, size } (vacío si no se reconoce)
  const t = ANORM(title), B = attrBrand(brand), out = { model: '', line: '', color: '', material: '', size: '' };
  if (!t) return out;
  let mi = -1;
  if (B) {
    for (const [m, re] of B.models) { const x = re.exec(t); if (x) { out.model = m; mi = x.index + x[0].length; break; } }
    for (const [l, re] of B.lines) if (re.test(t)) { out.line = l; break; }
  }
  let best = Infinity; for (const [c, re] of ACOLOR_RE) { re.lastIndex = 0; const x = re.exec(t); if (x && x.index < best) { best = x.index; out.color = c; } }
  if (!out.color && out.line) out.color = ALINE_COLOR[out.line] || '';
  const typ = ANORM(type), jewel = /jewel|ring|necklace|bracelet|earring|pendant|brooch|watch|charm/.test(typ) || /\b(watch|dial|quartz|automatic)\b/.test(t);
  for (const [m, re] of AMATS) { if (!jewel && /Platinum|Gold 1|Silver|Gold-plated|Steel/.test(m)) continue; if (re.test(t)) { out.material = m; break; } }
  if (!out.material || (out.material === 'Leather' && ALINE_MAT_OF.get(out.line) === 'Patent leather')) out.material = ALINE_MAT_OF.get(out.line) || out.material;
  if (/bag|wallet|pouch|tote|clutch|case|backpack|luggage|briefcase|purse|satchel|boston|handbag|scarf/.test(typ) || (!typ && out.model)) {
    const after = mi >= 0 ? t.slice(mi, mi + 24) : '', num = after.match(/^(?:\s+[a-z]+){0,2}?\s+(\d{2,3})(?![\d.,]|\s*(?:cm|mm|g|inch|"))/);
    if (num && +num[1] >= 15 && +num[1] <= (/scarf/.test(typ) ? 140 : 60)) out.size = num[1];
    else { const s = t.match(/(?:^|[^a-z0-9])(pm|mm|gm|bb|nano|mini|micro|small|medium|large|jumbo|maxi|xxs|xs|baby|teen)(?![a-z0-9])/); if (s) out.size = ASIZE_TOK[s[1]]; }
  }
  return out;
}
if (typeof module !== 'undefined') module.exports = { attrsOf, ABRANDS };
