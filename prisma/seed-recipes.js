// Curated, high-quality recipe seed with real photos. Plain CommonJS so it runs
// in the production image without `tsx` (devDependencies are pruned).
//
// Run locally:   node prisma/seed-recipes.js
// Run on prod:   docker exec -w /app recipely-api node prisma/seed-recipes.js
//
// Idempotent: each recipe carries a stable `sourceUrl` (seed:<slug>); the
// Recipe.source_url column is unique, so re-running upserts in place instead of
// duplicating. Owner resolves to the admin user, then the import bot, then the
// first user. Images are hosted on TheMealDB's CDN (stable, food-specific).

const { PrismaClient } = require('@prisma/client');

const IMG = 'https://www.themealdb.com/images/media/meals';

/** @type {Array<object>} */
const recipes = [
  {
    slug: 'carbonara',
    name: { en: 'Spaghetti Carbonara', tr: 'Spaghetti Carbonara' },
    cuisine: 'ITALIAN', category: 'PASTA', difficulty: 'MEDIUM',
    prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 2, caloriesPerServing: 620,
    rating: 4.7, image: `${IMG}/llcbn01574260722.jpg`,
    nutrition: { protein: 28, carbs: 70, fat: 26, fiber: 3 },
    ingredients: {
      en: ['320g spaghetti', '150g guanciale or pancetta', '3 egg yolks', '1 whole egg', '60g pecorino romano', 'Black pepper', 'Salt'],
      tr: ['320g spaghetti', '150g guanciale veya pancetta', '3 yumurta sarısı', '1 tam yumurta', '60g pecorino romano', 'Karabiber', 'Tuz'],
    },
    instructions: {
      en: ['Boil spaghetti in salted water until al dente.', 'Crisp the diced guanciale in a dry pan.', 'Whisk yolks, egg and grated pecorino with plenty of black pepper.', 'Reserve a cup of pasta water, then drain.', 'Off the heat, toss pasta with guanciale and the egg mix, loosening with pasta water into a glossy sauce.', 'Serve immediately with extra pecorino and pepper.'],
      tr: ['Spaghettiyi tuzlu suda al dente pişirin.', 'Küp doğranmış guanciale\'yi kuru tavada çıtırlaştırın.', 'Sarıları, yumurtayı ve rendelenmiş pecorinoyu bolca karabiberle çırpın.', 'Bir su bardağı makarna suyu ayırıp süzün.', 'Ateşten alıp makarnayı guanciale ve yumurta karışımıyla karıştırın; makarna suyuyla parlak bir sosa getirin.', 'Üzerine pecorino ve karabiber serpip hemen servis edin.'],
    },
    tags: { en: ['pasta', 'italian', 'dinner', 'classic'], tr: ['makarna', 'italyan', 'akşam yemeği', 'klasik'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
  },
  {
    slug: 'lasagne',
    name: { en: 'Lasagne al Forno', tr: 'Fırın Lazanya' },
    cuisine: 'ITALIAN', category: 'PASTA', difficulty: 'MEDIUM',
    prepTimeMinutes: 30, cookTimeMinutes: 45, servings: 6, caloriesPerServing: 540,
    rating: 4.8, image: `${IMG}/wtsvxx1511296896.jpg`,
    nutrition: { protein: 30, carbs: 42, fat: 27, fiber: 4 },
    ingredients: {
      en: ['12 lasagne sheets', '500g ground beef', '1 onion', '2 garlic cloves', '700g tomato passata', '500ml béchamel', '150g mozzarella', '50g parmesan', 'Olive oil', 'Salt', 'Pepper'],
      tr: ['12 lazanya yaprağı', '500g kıyma', '1 soğan', '2 diş sarımsak', '700g domates passata', '500ml beşamel', '150g mozzarella', '50g parmesan', 'Zeytinyağı', 'Tuz', 'Karabiber'],
    },
    instructions: {
      en: ['Sauté onion and garlic, add beef and brown.', 'Add passata, season and simmer 20 minutes.', 'Layer meat sauce, sheets and béchamel in a dish, repeating.', 'Top with mozzarella and parmesan.', 'Bake at 190°C for 40-45 minutes until golden.', 'Rest 10 minutes before slicing.'],
      tr: ['Soğan ve sarımsağı soteleyin, kıymayı ekleyip kavurun.', 'Passatayı ekleyip baharatlayın ve 20 dakika pişirin.', 'Kaba sırayla et sosu, yaprak ve beşamel dizin.', 'Üzerine mozzarella ve parmesan serpin.', '190°C fırında 40-45 dakika, üzeri kızarana dek pişirin.', 'Dilimlemeden önce 10 dakika dinlendirin.'],
    },
    tags: { en: ['pasta', 'italian', 'baked', 'dinner'], tr: ['makarna', 'italyan', 'fırın', 'akşam yemeği'] },
    mealType: { en: ['dinner'], tr: ['akşam yemeği'] },
  },
  {
    slug: 'beef-wellington',
    name: { en: 'Beef Wellington', tr: 'Beef Wellington' },
    cuisine: 'BRITISH', category: 'MAIN_COURSE', difficulty: 'HARD',
    prepTimeMinutes: 45, cookTimeMinutes: 40, servings: 4, caloriesPerServing: 710,
    rating: 4.6, image: `${IMG}/vvpprx1487325699.jpg`,
    nutrition: { protein: 42, carbs: 35, fat: 44, fiber: 3 },
    ingredients: {
      en: ['800g beef fillet', '400g mushrooms', '6 slices prosciutto', '1 sheet puff pastry', '2 tbsp English mustard', '1 egg (for wash)', 'Olive oil', 'Salt', 'Pepper'],
      tr: ['800g dana bonfile', '400g mantar', '6 dilim prosciutto', '1 yufka milföy', '2 yemek kaşığı İngiliz hardalı', '1 yumurta (sürmek için)', 'Zeytinyağı', 'Tuz', 'Karabiber'],
    },
    instructions: {
      en: ['Sear the seasoned fillet on all sides, then brush with mustard.', 'Blitz mushrooms and cook to a dry paste (duxelles).', 'Lay prosciutto on cling film, spread duxelles, wrap the beef tightly and chill.', 'Wrap the parcel in puff pastry, seal and egg-wash.', 'Bake at 200°C for 35-40 minutes for medium-rare.', 'Rest 10 minutes before slicing.'],
      tr: ['Baharatlı bonfileyi her yüzünden mühürleyin, sonra hardal sürün.', 'Mantarları rondodan geçirip kuru bir macun (duxelles) olana dek pişirin.', 'Streç üzerine prosciuttoyu dizip duxelles sürün, eti sıkıca sarıp soğutun.', 'Paketi milföye sarın, kenarları kapatıp yumurta sürün.', '200°C fırında 35-40 dakika (medium-rare) pişirin.', 'Dilimlemeden önce 10 dakika dinlendirin.'],
    },
    tags: { en: ['beef', 'british', 'special', 'dinner'], tr: ['dana', 'ingiliz', 'özel', 'akşam yemeği'] },
    mealType: { en: ['dinner'], tr: ['akşam yemeği'] },
  },
  {
    slug: 'teriyaki-chicken',
    name: { en: 'Teriyaki Chicken', tr: 'Teriyaki Tavuk' },
    cuisine: 'JAPANESE', category: 'MAIN_COURSE', difficulty: 'MEDIUM',
    prepTimeMinutes: 15, cookTimeMinutes: 25, servings: 4, caloriesPerServing: 480,
    rating: 4.5, image: `${IMG}/wvpsxx1468256321.jpg`,
    nutrition: { protein: 38, carbs: 40, fat: 16, fiber: 2 },
    ingredients: {
      en: ['600g chicken thighs', '4 tbsp soy sauce', '3 tbsp mirin', '2 tbsp sugar', '1 tbsp grated ginger', '2 garlic cloves', 'Steamed rice', 'Sesame seeds', 'Spring onion'],
      tr: ['600g tavuk but', '4 yemek kaşığı soya sosu', '3 yemek kaşığı mirin', '2 yemek kaşığı şeker', '1 yemek kaşığı rendelenmiş zencefil', '2 diş sarımsak', 'Buğulanmış pirinç', 'Susam', 'Yeşil soğan'],
    },
    instructions: {
      en: ['Mix soy, mirin, sugar, ginger and garlic for the teriyaki sauce.', 'Sear chicken skin-side down until golden.', 'Add the sauce and simmer until sticky and glazed.', 'Slice and serve over rice.', 'Garnish with sesame and spring onion.'],
      tr: ['Soya, mirin, şeker, zencefil ve sarımsağı karıştırıp teriyaki sosu yapın.', 'Tavuğu deri tarafı altta altın rengi olana dek kızartın.', 'Sosu ekleyip yapışkan ve parlak olana dek pişirin.', 'Dilimleyip pirinç üzerinde servis edin.', 'Susam ve yeşil soğanla süsleyin.'],
    },
    tags: { en: ['chicken', 'japanese', 'rice', 'dinner'], tr: ['tavuk', 'japon', 'pirinç', 'akşam yemeği'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
  },
  {
    slug: 'teriyaki-salmon',
    name: { en: 'Honey Teriyaki Salmon', tr: 'Ballı Teriyaki Somon' },
    cuisine: 'JAPANESE', category: 'MAIN_COURSE', difficulty: 'EASY',
    prepTimeMinutes: 10, cookTimeMinutes: 12, servings: 2, caloriesPerServing: 430,
    rating: 4.7, image: `${IMG}/xxyupu1468262513.jpg`,
    nutrition: { protein: 34, carbs: 18, fat: 24, fiber: 1 },
    ingredients: {
      en: ['2 salmon fillets', '3 tbsp soy sauce', '2 tbsp honey', '1 tbsp rice vinegar', '1 garlic clove', '1 tsp grated ginger', 'Sesame seeds', 'Spring onion'],
      tr: ['2 somon filetosu', '3 yemek kaşığı soya sosu', '2 yemek kaşığı bal', '1 yemek kaşığı pirinç sirkesi', '1 diş sarımsak', '1 tatlı kaşığı rendelenmiş zencefil', 'Susam', 'Yeşil soğan'],
    },
    instructions: {
      en: ['Whisk soy, honey, vinegar, garlic and ginger.', 'Sear salmon 3-4 minutes per side.', 'Add the glaze and spoon over until thickened.', 'Garnish with sesame and spring onion.', 'Serve with rice or greens.'],
      tr: ['Soya, bal, sirke, sarımsak ve zencefili çırpın.', 'Somonu her yüzünden 3-4 dakika kızartın.', 'Sosu ekleyip koyulaşana dek üzerine gezdirin.', 'Susam ve yeşil soğanla süsleyin.', 'Pirinç veya yeşilliklerle servis edin.'],
    },
    tags: { en: ['salmon', 'seafood', 'healthy', 'quick'], tr: ['somon', 'deniz ürünleri', 'sağlıklı', 'hızlı'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
  },
  {
    slug: 'lamb-tagine',
    name: { en: 'Moroccan Lamb Tagine', tr: 'Fas Kuzu Tajini' },
    cuisine: 'MOROCCAN', category: 'STEW', difficulty: 'MEDIUM',
    prepTimeMinutes: 20, cookTimeMinutes: 120, servings: 4, caloriesPerServing: 560,
    rating: 4.6, image: `${IMG}/yuwtuu1511295751.jpg`,
    nutrition: { protein: 36, carbs: 38, fat: 28, fiber: 6 },
    ingredients: {
      en: ['700g lamb shoulder', '1 onion', '2 garlic cloves', '1 tsp cumin', '1 tsp cinnamon', '1 tsp ginger', '100g dried apricots', '400g chopped tomatoes', '300ml stock', 'Coriander', 'Olive oil'],
      tr: ['700g kuzu kol', '1 soğan', '2 diş sarımsak', '1 tatlı kaşığı kimyon', '1 tatlı kaşığı tarçın', '1 tatlı kaşığı zencefil', '100g kuru kayısı', '400g doğranmış domates', '300ml et suyu', 'Kişniş', 'Zeytinyağı'],
    },
    instructions: {
      en: ['Brown the lamb in batches and set aside.', 'Soften onion and garlic, add the spices.', 'Return lamb with tomatoes, stock and apricots.', 'Cover and simmer gently for 2 hours until tender.', 'Finish with fresh coriander; serve with couscous.'],
      tr: ['Kuzuyu partiler hâlinde mühürleyip kenara alın.', 'Soğan ve sarımsağı yumuşatıp baharatları ekleyin.', 'Kuzuyu domates, et suyu ve kayısıyla geri koyun.', 'Kapağı kapatıp 2 saat kısık ateşte yumuşayana dek pişirin.', 'Taze kişnişle bitirin; kuskusla servis edin.'],
    },
    tags: { en: ['lamb', 'moroccan', 'stew', 'spiced'], tr: ['kuzu', 'fas', 'güveç', 'baharatlı'] },
    mealType: { en: ['dinner'], tr: ['akşam yemeği'] },
  },
  {
    slug: 'spanish-tortilla',
    name: { en: 'Spanish Tortilla', tr: 'İspanyol Tortillası' },
    cuisine: 'SPANISH', category: 'MAIN_COURSE', difficulty: 'EASY',
    prepTimeMinutes: 15, cookTimeMinutes: 30, servings: 4, caloriesPerServing: 320,
    rating: 4.4, image: `${IMG}/quuxsx1511476154.jpg`,
    nutrition: { protein: 12, carbs: 28, fat: 18, fiber: 3 },
    ingredients: {
      en: ['6 eggs', '4 potatoes', '1 onion', '200ml olive oil', 'Salt'],
      tr: ['6 yumurta', '4 patates', '1 soğan', '200ml zeytinyağı', 'Tuz'],
    },
    instructions: {
      en: ['Slice potatoes and onion thinly.', 'Confit them gently in olive oil until soft, then drain.', 'Beat eggs, fold in the potatoes and season.', 'Cook in a pan over low heat until set underneath.', 'Flip with a plate and cook the other side.', 'Rest, then slice into wedges.'],
      tr: ['Patates ve soğanı ince dilimleyin.', 'Zeytinyağında kısık ateşte yumuşayana dek pişirip süzün.', 'Yumurtaları çırpın, patatesleri ekleyip tuzlayın.', 'Tavada kısık ateşte altı tutana dek pişirin.', 'Bir tabakla çevirip diğer yüzünü pişirin.', 'Dinlendirip dilimleyin.'],
    },
    tags: { en: ['eggs', 'spanish', 'vegetarian', 'tapas'], tr: ['yumurta', 'ispanyol', 'vejetaryen', 'tapas'] },
    mealType: { en: ['lunch', 'dinner', 'breakfast'], tr: ['öğle yemeği', 'akşam yemeği', 'kahvaltı'] },
  },
  {
    slug: 'pancakes',
    name: { en: 'Fluffy Pancakes', tr: 'Kabarık Pankek' },
    cuisine: 'AMERICAN', category: 'BREAKFAST', difficulty: 'EASY',
    prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 4, caloriesPerServing: 350,
    rating: 4.6, image: `${IMG}/rwuyqx1511383174.jpg`,
    nutrition: { protein: 9, carbs: 52, fat: 11, fiber: 2 },
    ingredients: {
      en: ['200g flour', '2 tbsp sugar', '2 tsp baking powder', '300ml milk', '1 egg', '30g melted butter', 'Pinch of salt', 'Maple syrup'],
      tr: ['200g un', '2 yemek kaşığı şeker', '2 tatlı kaşığı kabartma tozu', '300ml süt', '1 yumurta', '30g eritilmiş tereyağı', 'Bir tutam tuz', 'Akçaağaç şurubu'],
    },
    instructions: {
      en: ['Whisk dry ingredients together.', 'Mix milk, egg and melted butter.', 'Combine to a smooth batter; do not overmix.', 'Cook spoonfuls on a buttered pan until bubbles form, then flip.', 'Serve stacked with maple syrup.'],
      tr: ['Kuru malzemeleri çırpın.', 'Süt, yumurta ve eritilmiş tereyağını karıştırın.', 'Pürüzsüz bir hamur olacak şekilde birleştirin; fazla karıştırmayın.', 'Tereyağlı tavada kaşıkla dökün, baloncuklar çıkınca çevirin.', 'Üst üste dizip akçaağaç şurubuyla servis edin.'],
    },
    tags: { en: ['breakfast', 'sweet', 'quick', 'classic'], tr: ['kahvaltı', 'tatlı', 'hızlı', 'klasik'] },
    mealType: { en: ['breakfast', 'brunch'], tr: ['kahvaltı', 'brunch'] },
  },
  {
    slug: 'beef-pie',
    name: { en: 'Beef & Mustard Pie', tr: 'Dana Etli Hardallı Turta' },
    cuisine: 'BRITISH', category: 'MAIN_COURSE', difficulty: 'MEDIUM',
    prepTimeMinutes: 25, cookTimeMinutes: 120, servings: 4, caloriesPerServing: 650,
    rating: 4.5, image: `${IMG}/sytuqu1511553755.jpg`,
    nutrition: { protein: 34, carbs: 45, fat: 36, fiber: 3 },
    ingredients: {
      en: ['700g stewing beef', '2 tbsp wholegrain mustard', '1 onion', '2 carrots', '500ml beef stock', '1 sheet shortcrust pastry', '1 egg', 'Flour', 'Oil', 'Salt', 'Pepper'],
      tr: ['700g güveçlik dana', '2 yemek kaşığı taneli hardal', '1 soğan', '2 havuç', '500ml et suyu', '1 yufka kısa hamur', '1 yumurta', 'Un', 'Yağ', 'Tuz', 'Karabiber'],
    },
    instructions: {
      en: ['Coat beef in seasoned flour and brown.', 'Add onion, carrots, stock and mustard.', 'Simmer covered for about 2 hours until tender.', 'Cool the filling and spoon into a dish.', 'Top with pastry, egg-wash and bake at 200°C for 30 minutes.'],
      tr: ['Danayı baharatlı una bulayıp mühürleyin.', 'Soğan, havuç, et suyu ve hardalı ekleyin.', 'Kapağı kapalı yaklaşık 2 saat yumuşayana dek pişirin.', 'İç harcı soğutup kaba alın.', 'Üzerini hamurla kapatıp yumurta sürün ve 200°C\'de 30 dakika pişirin.'],
    },
    tags: { en: ['beef', 'british', 'pie', 'comfort'], tr: ['dana', 'ingiliz', 'turta', 'ev yemeği'] },
    mealType: { en: ['dinner'], tr: ['akşam yemeği'] },
  },
  {
    slug: 'chicken-handi',
    name: { en: 'Chicken Handi', tr: 'Hint Usulü Tavuk (Handi)' },
    cuisine: 'INDIAN', category: 'MAIN_COURSE', difficulty: 'MEDIUM',
    prepTimeMinutes: 20, cookTimeMinutes: 35, servings: 4, caloriesPerServing: 520,
    rating: 4.6, image: `${IMG}/wyxwsp1486979827.jpg`,
    nutrition: { protein: 35, carbs: 18, fat: 32, fiber: 3 },
    ingredients: {
      en: ['700g chicken', '2 onions', '3 tomatoes', '4 garlic cloves', '1 tbsp ginger', '200g yogurt', '1 tbsp garam masala', '1 tsp turmeric', '1 tsp chilli powder', 'Coriander', 'Oil'],
      tr: ['700g tavuk', '2 soğan', '3 domates', '4 diş sarımsak', '1 yemek kaşığı zencefil', '200g yoğurt', '1 yemek kaşığı garam masala', '1 tatlı kaşığı zerdeçal', '1 tatlı kaşığı pul biber', 'Kişniş', 'Yağ'],
    },
    instructions: {
      en: ['Fry onions until golden, add ginger-garlic.', 'Add tomatoes and spices, cook to a thick masala.', 'Stir in yogurt, then the chicken.', 'Cover and simmer until cooked through and rich.', 'Finish with garam masala and coriander.'],
      tr: ['Soğanları altın rengi kavurun, zencefil-sarımsağı ekleyin.', 'Domates ve baharatları ekleyip koyu bir masala yapın.', 'Yoğurdu, ardından tavuğu karıştırın.', 'Kapağı kapatıp tavuk pişip sos koyulaşana dek pişirin.', 'Garam masala ve kişnişle bitirin.'],
    },
    tags: { en: ['chicken', 'indian', 'curry', 'spiced'], tr: ['tavuk', 'hint', 'köri', 'baharatlı'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
  },
  {
    slug: 'chicken-alfredo',
    name: { en: 'Chicken Alfredo', tr: 'Tavuklu Alfredo' },
    cuisine: 'ITALIAN', category: 'PASTA', difficulty: 'MEDIUM',
    prepTimeMinutes: 15, cookTimeMinutes: 20, servings: 4, caloriesPerServing: 680,
    rating: 4.5, image: `${IMG}/syqypv1486981727.jpg`,
    nutrition: { protein: 36, carbs: 58, fat: 34, fiber: 3 },
    ingredients: {
      en: ['350g fettuccine', '2 chicken breasts', '300ml cream', '60g parmesan', '2 garlic cloves', '30g butter', 'Parsley', 'Salt', 'Pepper'],
      tr: ['350g fettuccine', '2 tavuk göğsü', '300ml krema', '60g parmesan', '2 diş sarımsak', '30g tereyağı', 'Maydanoz', 'Tuz', 'Karabiber'],
    },
    instructions: {
      en: ['Cook fettuccine until al dente.', 'Sear sliced chicken and set aside.', 'Melt butter, soften garlic, add cream and parmesan.', 'Return chicken and toss with the pasta.', 'Finish with parsley and black pepper.'],
      tr: ['Fettuccineyi al dente pişirin.', 'Dilimlenmiş tavuğu kızartıp kenara alın.', 'Tereyağını eritip sarımsağı yumuşatın, krema ve parmesanı ekleyin.', 'Tavuğu geri koyup makarnayla karıştırın.', 'Maydanoz ve karabiberle bitirin.'],
    },
    tags: { en: ['pasta', 'chicken', 'creamy', 'dinner'], tr: ['makarna', 'tavuk', 'kremalı', 'akşam yemeği'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
  },
  {
    slug: 'chickpea-fajitas',
    name: { en: 'Chickpea Fajitas', tr: 'Nohutlu Fajita' },
    cuisine: 'MEXICAN', category: 'MAIN_COURSE', difficulty: 'EASY',
    prepTimeMinutes: 15, cookTimeMinutes: 15, servings: 4, caloriesPerServing: 410,
    rating: 4.3, image: `${IMG}/tvtxpq1511464705.jpg`,
    nutrition: { protein: 15, carbs: 60, fat: 12, fiber: 11 },
    ingredients: {
      en: ['400g chickpeas', '2 bell peppers', '1 onion', '1 tbsp fajita spice', '8 tortillas', 'Lime', 'Coriander', 'Olive oil', 'Salt'],
      tr: ['400g nohut', '2 renkli biber', '1 soğan', '1 yemek kaşığı fajita baharatı', '8 tortilla', 'Lime', 'Kişniş', 'Zeytinyağı', 'Tuz'],
    },
    instructions: {
      en: ['Slice peppers and onion, toss with fajita spice.', 'Roast or pan-fry with the chickpeas until charred.', 'Squeeze over lime and add coriander.', 'Warm the tortillas.', 'Fill and serve with your favourite toppings.'],
      tr: ['Biber ve soğanı dilimleyip fajita baharatıyla harmanlayın.', 'Nohutla birlikte hafif kömürleşene dek kızartın veya fırınlayın.', 'Üzerine lime sıkıp kişniş ekleyin.', 'Tortillaları ısıtın.', 'İçini doldurup sevdiğiniz soslarla servis edin.'],
    },
    tags: { en: ['mexican', 'vegetarian', 'vegan', 'quick'], tr: ['meksika', 'vejetaryen', 'vegan', 'hızlı'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
  },
  {
    slug: 'ratatouille',
    name: { en: 'Ratatouille', tr: 'Ratatuy' },
    cuisine: 'FRENCH', category: 'STEW', difficulty: 'MEDIUM',
    prepTimeMinutes: 25, cookTimeMinutes: 50, servings: 4, caloriesPerServing: 220,
    rating: 4.4, image: `${IMG}/wrpwuu1511786491.jpg`,
    nutrition: { protein: 5, carbs: 24, fat: 12, fiber: 8 },
    ingredients: {
      en: ['1 aubergine', '2 courgettes', '2 bell peppers', '4 tomatoes', '1 onion', '3 garlic cloves', 'Thyme', 'Basil', 'Olive oil', 'Salt', 'Pepper'],
      tr: ['1 patlıcan', '2 kabak', '2 renkli biber', '4 domates', '1 soğan', '3 diş sarımsak', 'Kekik', 'Fesleğen', 'Zeytinyağı', 'Tuz', 'Karabiber'],
    },
    instructions: {
      en: ['Dice and sauté the aubergine, courgette and peppers separately.', 'Make a base of onion, garlic and tomato.', 'Combine all vegetables with thyme.', 'Simmer gently 30-40 minutes until soft and silky.', 'Finish with fresh basil and good olive oil.'],
      tr: ['Patlıcan, kabak ve biberleri küp doğrayıp ayrı ayrı soteleyin.', 'Soğan, sarımsak ve domatesle bir taban hazırlayın.', 'Tüm sebzeleri kekikle birleştirin.', 'Kısık ateşte 30-40 dakika yumuşayana dek pişirin.', 'Taze fesleğen ve kaliteli zeytinyağıyla bitirin.'],
    },
    tags: { en: ['french', 'vegetarian', 'vegan', 'healthy'], tr: ['fransız', 'vejetaryen', 'vegan', 'sağlıklı'] },
    mealType: { en: ['lunch', 'dinner'], tr: ['öğle yemeği', 'akşam yemeği'] },
  },
  {
    slug: 'pecan-pie',
    name: { en: 'Pecan Pie', tr: 'Cevizli Pekan Turtası' },
    cuisine: 'AMERICAN', category: 'DESSERT', difficulty: 'MEDIUM',
    prepTimeMinutes: 20, cookTimeMinutes: 50, servings: 8, caloriesPerServing: 480,
    rating: 4.7, image: `${IMG}/rqvwxt1511384809.jpg`,
    nutrition: { protein: 5, carbs: 56, fat: 28, fiber: 2 },
    ingredients: {
      en: ['1 shortcrust pastry case', '200g pecans', '150g brown sugar', '150ml golden syrup', '3 eggs', '50g butter', '1 tsp vanilla', 'Pinch of salt'],
      tr: ['1 hazır turta tabanı', '200g pekan cevizi', '150g esmer şeker', '150ml glikoz/şurup', '3 yumurta', '50g tereyağı', '1 tatlı kaşığı vanilya', 'Bir tutam tuz'],
    },
    instructions: {
      en: ['Whisk eggs, sugar, syrup, melted butter and vanilla.', 'Scatter pecans over the pastry case.', 'Pour the filling over the nuts.', 'Bake at 170°C for 45-50 minutes until just set.', 'Cool completely before slicing.'],
      tr: ['Yumurta, şeker, şurup, eritilmiş tereyağı ve vanilyayı çırpın.', 'Pekan cevizlerini turta tabanına yayın.', 'İç harcı cevizlerin üzerine dökün.', '170°C fırında 45-50 dakika, tam tutana dek pişirin.', 'Dilimlemeden önce tamamen soğutun.'],
    },
    tags: { en: ['dessert', 'american', 'sweet', 'baking'], tr: ['tatlı', 'amerikan', 'şekerli', 'pasta'] },
    mealType: { en: ['dessert'], tr: ['tatlı'] },
  },
  {
    slug: 'shakshuka',
    name: { en: 'Shakshuka', tr: 'Şakşuka (Yumurtalı)' },
    cuisine: 'MIDDLE_EASTERN', category: 'BREAKFAST', difficulty: 'EASY',
    prepTimeMinutes: 10, cookTimeMinutes: 25, servings: 3, caloriesPerServing: 280,
    rating: 4.6, image: `${IMG}/g373701551450225.jpg`,
    nutrition: { protein: 14, carbs: 16, fat: 18, fiber: 4 },
    ingredients: {
      en: ['4 eggs', '2 bell peppers', '1 onion', '3 garlic cloves', '400g chopped tomatoes', '1 tsp cumin', '1 tsp paprika', 'Parsley', 'Olive oil', 'Salt'],
      tr: ['4 yumurta', '2 renkli biber', '1 soğan', '3 diş sarımsak', '400g doğranmış domates', '1 tatlı kaşığı kimyon', '1 tatlı kaşığı toz biber', 'Maydanoz', 'Zeytinyağı', 'Tuz'],
    },
    instructions: {
      en: ['Soften onion, peppers and garlic in olive oil.', 'Add tomatoes and spices, simmer to a thick sauce.', 'Make wells and crack in the eggs.', 'Cover and cook until whites are set, yolks runny.', 'Scatter parsley and serve with bread.'],
      tr: ['Soğan, biber ve sarımsağı zeytinyağında yumuşatın.', 'Domates ve baharatları ekleyip koyu bir sos yapın.', 'Çukurlar açıp yumurtaları kırın.', 'Kapağı kapatıp beyazları tutana, sarıları akışkan kalana dek pişirin.', 'Maydanoz serpip ekmekle servis edin.'],
    },
    tags: { en: ['eggs', 'breakfast', 'vegetarian', 'spiced'], tr: ['yumurta', 'kahvaltı', 'vejetaryen', 'baharatlı'] },
    mealType: { en: ['breakfast', 'brunch'], tr: ['kahvaltı', 'brunch'] },
  },
  {
    slug: 'pad-thai',
    name: { en: 'Pad Thai', tr: 'Pad Thai' },
    cuisine: 'THAI', category: 'MAIN_COURSE', difficulty: 'MEDIUM',
    prepTimeMinutes: 20, cookTimeMinutes: 15, servings: 3, caloriesPerServing: 520,
    rating: 4.6, image: `${IMG}/rg9ze01763479093.jpg`,
    nutrition: { protein: 22, carbs: 68, fat: 16, fiber: 4 },
    ingredients: {
      en: ['250g rice noodles', '200g prawns or chicken', '2 eggs', '100g bean sprouts', '3 tbsp tamarind paste', '2 tbsp fish sauce', '1 tbsp sugar', '50g peanuts', 'Spring onion', 'Lime', 'Oil'],
      tr: ['250g pirinç eriştesi', '200g karides veya tavuk', '2 yumurta', '100g soya filizi', '3 yemek kaşığı demirhindi ezmesi', '2 yemek kaşığı balık sosu', '1 yemek kaşığı şeker', '50g yer fıstığı', 'Yeşil soğan', 'Lime', 'Yağ'],
    },
    instructions: {
      en: ['Soak the noodles until pliable.', 'Stir-fry the protein, push aside and scramble the eggs.', 'Add noodles and the tamarind-fish sauce-sugar mix.', 'Toss with bean sprouts and most of the peanuts.', 'Serve with lime, spring onion and remaining peanuts.'],
      tr: ['Erişteyi yumuşayana dek ılık suda bekletin.', 'Proteini sote edin, kenara itip yumurtaları çırparak pişirin.', 'Erişteyi ve demirhindi-balık sosu-şeker karışımını ekleyin.', 'Soya filizi ve yer fıstığının çoğuyla harmanlayın.', 'Lime, yeşil soğan ve kalan fıstıkla servis edin.'],
    },
    tags: { en: ['thai', 'noodles', 'street food', 'dinner'], tr: ['tay', 'erişte', 'sokak lezzeti', 'akşam yemeği'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
  },
];

async function resolveOwnerId(prisma) {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (admin) return admin.id;
  const bot = await prisma.user.findUnique({ where: { email: 'import-bot@recipely.local' } });
  if (bot) return bot.id;
  const any = await prisma.user.findFirst();
  if (any) return any.id;
  throw new Error('No user found to own seeded recipes. Run the admin/import-bot seed first.');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const ownerId = await resolveOwnerId(prisma);
    console.log(`[seed-recipes] owner: ${ownerId}`);

    let created = 0;
    let updated = 0;
    for (const r of recipes) {
      const sourceUrl = `seed:${r.slug}`;
      const data = {
        name: r.name,
        cuisine: r.cuisine,
        category: r.category,
        difficulty: r.difficulty,
        ingredients: r.ingredients,
        instructions: r.instructions,
        prepTimeMinutes: r.prepTimeMinutes,
        cookTimeMinutes: r.cookTimeMinutes,
        totalTimeMinutes: r.prepTimeMinutes + r.cookTimeMinutes,
        servings: r.servings,
        caloriesPerServing: r.caloriesPerServing,
        nutrition: r.nutrition,
        image: r.image,
        rating: r.rating,
        tags: r.tags,
        mealType: r.mealType,
        isPublished: true,
        moderationStatus: 'approved',
        ownerId,
      };

      const existing = await prisma.recipe.findUnique({ where: { sourceUrl } });
      await prisma.recipe.upsert({
        where: { sourceUrl },
        update: data,
        create: { ...data, sourceUrl },
      });
      if (existing) {
        updated++;
      } else {
        created++;
      }
      console.log(`[seed-recipes] ${existing ? 'updated' : 'created'}: ${r.name.en}`);
    }

    console.log(`\n[seed-recipes] Done. created=${created} updated=${updated} total=${recipes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed-recipes] Failed:', err);
  process.exit(1);
});
