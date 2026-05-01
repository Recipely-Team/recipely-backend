// Seed script to populate initial categories and recipes for demo/testing.
// Usage: npx tsx scripts/seed.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  {
    slug: 'pasta',
    name: { en: 'Pasta', tr: 'Makarna', de: 'Pasta', fr: 'Pâtes', es: 'Pasta', ar: 'معكرونة' },
    cuisine: { en: 'Italian', tr: 'İtalyan', de: 'Italienisch', fr: 'Italien', es: 'Italiana', ar: 'إيطالي' },
  },
  {
    slug: 'pizza',
    name: { en: 'Pizza', tr: 'Pizza', de: 'Pizza', fr: 'Pizza', es: 'Pizza', ar: 'بيتزا' },
    cuisine: { en: 'Italian', tr: 'İtalyan', de: 'Italienisch', fr: 'Italien', es: 'Italiana', ar: 'إيطالي' },
  },
  {
    slug: 'soup',
    name: { en: 'Soup', tr: 'Çorba', de: 'Suppe', fr: 'Soupe', es: 'Sopa', ar: 'حساء' },
    cuisine: { en: 'International', tr: 'Uluslararası', de: 'International', fr: 'International', es: 'Internacional', ar: 'دولي' },
  },
  {
    slug: 'salad',
    name: { en: 'Salad', tr: 'Salata', de: 'Salat', fr: 'Salade', es: 'Ensalada', ar: 'سلطة' },
    cuisine: { en: 'Mediterranean', tr: 'Akdeniz', de: 'Mediterran', fr: 'Méditerranéen', es: 'Mediterránea', ar: 'متوسطي' },
  },
  {
    slug: 'dessert',
    name: { en: 'Dessert', tr: 'Tatlı', de: 'Nachtisch', fr: 'Dessert', es: 'Postre', ar: 'حلوى' },
    cuisine: { en: 'International', tr: 'Uluslararası', de: 'International', fr: 'International', es: 'Internacional', ar: 'دولي' },
  },
  {
    slug: 'breakfast',
    name: { en: 'Breakfast', tr: 'Kahvaltı', de: 'Frühstück', fr: 'Petit-déjeuner', es: 'Desayuno', ar: 'إفطار' },
    cuisine: { en: 'International', tr: 'Türk', de: 'Türkisch', fr: 'Turc', es: 'Turco', ar: 'تركي' },
  },
  {
    slug: 'chicken',
    name: { en: 'Chicken', tr: 'Tavuk', de: 'Huhn', fr: 'Poulet', es: 'Pollo', ar: 'دجاج' },
    cuisine: { en: 'International', tr: 'Uluslararası', de: 'International', fr: 'International', es: 'Internacional', ar: 'دولي' },
  },
  {
    slug: 'seafood',
    name: { en: 'Seafood', tr: 'Deniz Ürünleri', de: 'Meeresfrüchte', fr: 'Fruits de mer', es: 'Mariscos', ar: 'مأكولات بحرية' },
    cuisine: { en: 'Mediterranean', tr: 'Akdeniz', de: 'Mediterran', fr: 'Méditerranéen', es: 'Mediterránea', ar: 'متوسطي' },
  },
];

const recipes = [
  {
    name: {
      en: 'Spaghetti Carbonara',
      tr: 'Spaghetti Carbonara',
      de: 'Spaghetti Carbonara',
      fr: 'Spaghetti Carbonara',
      es: 'Espaguetis Carbonara',
      ar: 'سباغيتي كاربونارا',
    },
    cuisine: { en: 'Italian', tr: 'İtalyan', de: 'Italienisch', fr: 'Italien', es: 'Italiana', ar: 'إيطالي' },
    difficulty: 'MEDIUM' as const,
    ingredients: {
      en: ['400g spaghetti', '200g guanciale', '4 egg yolks', '100g pecorino romano', 'Black pepper', 'Salt'],
      tr: ['400g spagetti', '200g guanciale', '4 yumurta sarısı', '100g pecorino romano', 'Karabiber', 'Tuz'],
      de: ['400g Spaghetti', '200g Guanciale', '4 Eigelb', '100g Pecorino Romano', 'Schwarzer Pfeffer', 'Salz'],
    },
    instructions: {
      en: [
        'Cook spaghetti in salted boiling water until al dente.',
        'Cut guanciale into small cubes and fry until crispy.',
        'Mix egg yolks with grated pecorino and black pepper.',
        'Drain pasta, reserving some cooking water.',
        'Toss hot pasta with guanciale, then add egg mixture off heat.',
        'Add pasta water as needed to create creamy sauce.',
      ],
      tr: [
        'Spagettiyi tuzlu kaynar suda al dente olana kadar pişirin.',
        'Guanciale\'yi küçük küpler halinde kesip kızarana kadar kızartın.',
        'Yumurta sarılarını rendelenmiş pecorino ve karabiberle karıştırın.',
        'Makarnayı süzün, biraz pişirme suyu ayırın.',
        'Sıcak makarnayı guanciale ile karıştırın, ardından ateşten indirip yumurta karışımını ekleyin.',
        'Kremalı sos oluşturmak için gerekirse makarna suyu ekleyin.',
      ],
      de: [
        'Spaghetti in gesalzenem kochendem Wasser al dente kochen.',
        'Guanciale in kleine Würfel schneiden und knusprig braten.',
        'Eigelb mit geriebenem Pecorino und schwarzem Pfeffer mischen.',
        'Pasta abtropfen lassen, etwas Kochwasser aufheben.',
        'Heiße Pasta mit Guanciale mischen, dann vom Herd die Eimischung hinzufügen.',
        'Bei Bedarf Kochwasser hinzufügen, um eine cremige Sauce zu erhalten.',
      ],
    },
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    image: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=800',
    rating: 4.5,
    tags: { en: ['pasta', 'italian', 'carbonara', 'dinner'], tr: ['makarna', 'italyan', 'akşam yemeği'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
    isPublished: true,
    categorySlug: 'pasta',
  },
  {
    name: {
      en: 'Margherita Pizza',
      tr: 'Margarita Pizza',
      de: 'Margherita Pizza',
      fr: 'Pizza Margherita',
      es: 'Pizza Margarita',
      ar: 'بيتزا مارغريتا',
    },
    cuisine: { en: 'Italian', tr: 'İtalyan', de: 'Italienisch', fr: 'Italien', es: 'Italiana', ar: 'إيطالي' },
    difficulty: 'MEDIUM' as const,
    ingredients: {
      en: ['300g pizza dough', '200g tomato sauce', '250g fresh mozzarella', 'Fresh basil leaves', 'Olive oil', 'Salt'],
      tr: ['300g pizza hamuru', '200g domates sosu', '250g taze mozzarella', 'Taze fesleğen yaprakları', 'Zeytinyağı', 'Tuz'],
      de: ['300g Pizzateig', '200g Tomatensauce', '250g frische Mozzarella', 'Frische Basilikumblätter', 'Olivenöl', 'Salz'],
    },
    instructions: {
      en: [
        'Preheat oven to 250°C with pizza stone.',
        'Roll out dough on floured surface.',
        'Spread tomato sauce evenly, leaving border.',
        'Tear mozzarella and distribute over sauce.',
        'Bake for 8-10 minutes until crust is golden.',
        'Top with fresh basil and drizzle with olive oil.',
      ],
      tr: [
        'Fırını pizza taşı ile 250°C\'ye ön ısıtın.',
        'Hamuru unlanmış yüzeyde açın.',
        'Domates sosunu kenarlık bırakarak eşit şekilde yayın.',
        'Mozzarellayı yırtıp sos üzerine dağıtın.',
        'Kabuk altın renk olana kadar 8-10 dakika pişirin.',
        'Taze fesleğen ile süsleyin ve zeytinyağı gezdirin.',
      ],
      de: [
        'Ofen auf 250°C mit Pizzastein vorheizen.',
        'Teig auf bemehlter Fläche ausrollen.',
        'Tomatensauce gleichmäßig verteilen, Rand freilassen.',
        'Mozzarella zerreißen und über der Sauce verteilen.',
        '8-10 Minuten backen, bis Kruste goldbraun ist.',
        'Mit frischem Basilikum belegen und Olivenöl träufeln.',
      ],
    },
    prepTimeMinutes: 20,
    cookTimeMinutes: 10,
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800',
    rating: 4.7,
    tags: { en: ['pizza', 'italian', 'vegetarian', 'dinner'], tr: ['pizza', 'italyan', 'vejetaryen', 'akşam yemeği'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
    isPublished: true,
    categorySlug: 'pizza',
  },
  {
    name: {
      en: 'Tomato Soup',
      tr: 'Domates Çorbası',
      de: 'Tomatensuppe',
      fr: 'Soupe aux Tomates',
      es: 'Sopa de Tomate',
      ar: 'شوربة الطماطم',
    },
    cuisine: { en: 'International', tr: 'Uluslararası', de: 'International', fr: 'International', es: 'Internacional', ar: 'دولي' },
    difficulty: 'EASY' as const,
    ingredients: {
      en: ['1kg ripe tomatoes', '1 onion', '3 garlic cloves', '2 cups vegetable broth', 'Fresh basil', 'Olive oil', 'Salt', 'Pepper'],
      tr: ['1kg olgun domates', '1 soğan', '3 diş sarımsak', '2 su bardağı sebze suyu', 'Taze fesleğen', 'Zeytinyağı', 'Tuz', 'Karabiber'],
      de: ['1kg reife Tomaten', '1 Zwiebel', '3 Knoblauchzehen', '2 Tassen Gemüsebrühe', 'Frisches Basilikum', 'Olivenöl', 'Salz', 'Pfeffer'],
    },
    instructions: {
      en: [
        'Roughly chop tomatoes, onion, and garlic.',
        'Sauté onion in olive oil until soft.',
        'Add garlic and cook for 1 minute.',
        'Add tomatoes and vegetable broth.',
        'Simmer for 20 minutes.',
        'Blend until smooth, season with salt and pepper.',
        'Garnish with fresh basil and serve.',
      ],
      tr: [
        'Domatesleri, soğanı ve sarımsağı iri parçalara kesin.',
        'Soğanı zeytinyağında yumuşayana kadar soteleyin.',
        'Sarımsağı ekleyin ve 1 dakika pişirin.',
        'Domatesleri ve sebze suyunu ekleyin.',
        '20 dakika kaynatın.',
        'Pürüzsüz olana kadar blenderda çekin, tuz ve karabiberle tatlandırın.',
        'Taze fesleğen ile süsleyerek servis yapın.',
      ],
      de: [
        'Tomaten, Zwiebel und Knoblauch grob hacken.',
        'Zwiebel in Olivenöl weich dünsten.',
        'Knoblauch hinzufügen und 1 Minute kochen.',
        'Tomaten und Gemüsebrühe hinzufügen.',
        '20 Minuten köcheln lassen.',
        'Glatt pürieren und mit Salz und Pfeffer würzen.',
        'Mit frischem Basilikum garnieren und servieren.',
      ],
    },
    prepTimeMinutes: 10,
    cookTimeMinutes: 25,
    image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800',
    rating: 4.3,
    tags: { en: ['soup', 'tomato', 'vegetarian', 'healthy'], tr: ['çorba', 'domates', 'vejetaryen', 'sağlıklı'] },
    mealType: { en: ['lunch', 'dinner', 'starter'], tr: ['öğle yemeği', 'akşam yemeği', 'başlangıç'] },
    isPublished: true,
    categorySlug: 'soup',
  },
  {
    name: {
      en: 'Greek Salad',
      tr: 'Yunan Salatası',
      de: 'Griechischer Salat',
      fr: 'Salade Grecque',
      es: 'Ensalada Griega',
      ar: 'سلطة يونانية',
    },
    cuisine: { en: 'Mediterranean', tr: 'Akdeniz', de: 'Mediterran', fr: 'Méditerranéen', es: 'Mediterránea', ar: 'متوسطي' },
    difficulty: 'EASY' as const,
    ingredients: {
      en: ['4 tomatoes', '1 cucumber', '1 red onion', '200g feta cheese', 'Kalamata olives', 'Olive oil', 'Oregano', 'Salt'],
      tr: ['4 domates', '1 salatalık', '1 kırmızı soğan', '200g beyaz peynir', 'Kalamata zeytin', 'Zeytinyağı', 'Keçi kekiği', 'Tuz'],
      de: ['4 Tomaten', '1 Gurke', '1 rote Zwiebel', '200g Feta-Käse', 'Kalamata-Oliven', 'Olivenöl', 'Oregano', 'Salz'],
    },
    instructions: {
      en: [
        'Cut tomatoes and cucumber into chunks.',
        'Slice red onion thinly.',
        'Combine vegetables in a large bowl.',
        'Add olives and crumbled feta.',
        'Drizzle with olive oil and sprinkle oregano.',
        'Season with salt and toss gently.',
      ],
      tr: [
        'Domatesleri ve salatalığı küp şeklinde kesin.',
        'Kırmızı soğanı ince ince dilimleyin.',
        'Sebzeleri büyük bir kasede karıştırın.',
        'Zeytinleri ve ufalnmış beyaz peyniri ekleyin.',
        'Zeytinyağı dökün ve keçi kekiği serpin.',
        'Tuz ile tatlandırın ve nazikçe karıştırın.',
      ],
      de: [
        'Tomaten und Gurke in Stücke schneiden.',
        'Rote Zwiebel dünn in Scheiben schneiden.',
        'Gemüse in einer großen Schüssel kombinieren.',
        'Oliven und zerbröckelten Feta hinzufügen.',
        'Mit Olivenöl beträufeln und Oregano bestreuen.',
        'Mit Salz würzen und vorsichtig mischen.',
      ],
    },
    prepTimeMinutes: 15,
    cookTimeMinutes: 0,
    image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800',
    rating: 4.4,
    tags: { en: ['salad', 'greek', 'mediterranean', 'vegetarian', 'healthy'], tr: ['salata', 'yunan', 'akdeniz', 'vejetaryen', 'sağlıklı'] },
    mealType: { en: ['lunch', 'dinner', 'starter'], tr: ['öğle yemeği', 'akşam yemeği', 'başlangıç'] },
    isPublished: true,
    categorySlug: 'salad',
  },
  {
    name: {
      en: 'Tiramisu',
      tr: 'Tiramisu',
      de: 'Tiramisu',
      fr: 'Tiramisu',
      es: 'Tiramisú',
      ar: 'تيراميسو',
    },
    cuisine: { en: 'Italian', tr: 'İtalyan', de: 'Italienisch', fr: 'Italien', es: 'Italiana', ar: 'إيطالي' },
    difficulty: 'MEDIUM' as const,
    ingredients: {
      en: ['500g mascarpone', '4 eggs', '100g sugar', '300ml espresso', '200g ladyfinger biscuits', 'Cocoa powder'],
      tr: ['500g mascarpone', '4 yumurta', '100g şeker', '300ml espresso', '200g langefinger bisküvi', 'Kakao tozu'],
      de: ['500g Mascarpone', '4 Eier', '100g Zucker', '300ml Espresso', '200g Löffelbiskuits', 'Kakaopulver'],
    },
    instructions: {
      en: [
        'Brew espresso and let it cool.',
        'Separate eggs and beat yolks with sugar until creamy.',
        'Mix mascarpone into yolk mixture.',
        'Beat egg whites until stiff and fold in.',
        'Dip ladyfingers in espresso quickly.',
        'Layer biscuits and cream in dish, repeat.',
        'Refrigerate for 4 hours, dust with cocoa before serving.',
      ],
      tr: [
        'Espresso hazırlayın ve soğumaya bırakın.',
        'Yumurtaları ayırın ve sarılarını şekerle kremamsı olana kadar çırpın.',
        'Mascarponeyi yumurta karışımına ekleyin.',
        'Yumurta beyazlarını katı olana kadar çırpın ve karıştırın.',
        'Bisküvileri hızla espresso\'ye batırın.',
        'Bisküvi ve kremayı kaba üst üste dizin.',
        'Servisten 4 saat önce buzdolabında bekletin, servisden önce kakao serpin.',
      ],
      de: [
        'Espresso brühen und abkühlen lassen.',
        'Eier trennen und Eigelb mit Zucker cremig schlagen.',
        'Mascarpone in die Eigelbmischung einrühren.',
        'Eiweiß steif schlagen und unterheben.',
        'Löffelbiskuits schnell in Espresso dippen.',
        'Biscuits und Creme im Wechsel in eine Schicht schichten.',
        '4 Stunden kalt stellen, vor dem Servieren mit Kakao bestäuben.',
      ],
    },
    prepTimeMinutes: 30,
    cookTimeMinutes: 0,
    image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800',
    rating: 4.8,
    tags: { en: ['dessert', 'italian', 'coffee', 'sweet'], tr: ['tatlı', 'italyan', 'kahve', 'tatli'] },
    mealType: { en: ['dessert'], tr: ['tatlı'] },
    isPublished: true,
    categorySlug: 'dessert',
  },
  {
    name: {
      en: 'Menemen (Turkish Scrambled Eggs)',
      tr: 'Menemen',
      de: 'Menemen (Türkisches Rührei)',
      fr: 'Menemen (Œufs Brouillés Turcs)',
      es: 'Menemen (Huevos Revueltos Turcos)',
      ar: 'مينيمن (بيض مخفوق تركي)',
    },
    cuisine: { en: 'Turkish', tr: 'Türk', de: 'Türkisch', fr: 'Turc', es: 'Turco', ar: 'تركي' },
    difficulty: 'EASY' as const,
    ingredients: {
      en: ['4 eggs', '3 tomatoes', '1 green pepper', '1 onion', '2 tbsp butter', 'Salt', 'Black pepper', 'Parsley'],
      tr: ['4 yumurta', '3 domates', '1 yeşil biber', '1 soğan', '2 yemek kaşığı tereyağı', 'Tuz', 'Karabiber', 'Maydanoz'],
      de: ['4 Eier', '3 Tomaten', '1 grüne Paprika', '1 Zwiebel', '2 EL Butter', 'Salz', 'Schwarzer Pfeffer', 'Petersilie'],
    },
    instructions: {
      en: [
        'Dice onion and sauté in butter until translucent.',
        'Add diced green pepper and cook for 2 minutes.',
        'Add diced tomatoes and cook until soft.',
        'Crack eggs into the pan and scramble.',
        'Season with salt and pepper.',
        'Garnish with parsley and serve with bread.',
      ],
      tr: [
        'Soğanı doğrayın ve tereyağında saydam olana kadar soteleyin.',
        'Doğranmış yeşil biberi ekleyin ve 2 dakika pişirin.',
        'Domatesleri ekleyin ve yumuşayana kadar pişirin.',
        'Yumurtaları kırarak tavaya ekleyin ve karıştırın.',
        'Tuz ve karabiberle tatlandırın.',
        'Maydanoz ile süsleyin ve ekmekle servis yapın.',
      ],
      de: [
        'Zwiebel würfeln und in Butter glasig dünsten.',
        'Gewürfelte grüne Paprika hinzufügen und 2 Minuten kochen.',
        'Tomaten hinzufügen und weich kochen.',
        'Eier in die Pfanne aufschlagen und rühren.',
        'Mit Salz und Pfeffer würzen.',
        'Mit Petersilie garnieren und mit Brot servieren.',
      ],
    },
    prepTimeMinutes: 5,
    cookTimeMinutes: 15,
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800',
    rating: 4.6,
    tags: { en: ['breakfast', 'turkish', 'eggs', 'quick'], tr: ['kahvaltı', 'türk', 'yumurta', 'hızlı'] },
    mealType: { en: ['breakfast'], tr: ['kahvaltı'] },
    isPublished: true,
    categorySlug: 'breakfast',
  },
  {
    name: {
      en: 'Grilled Chicken Breast',
      tr: 'Izgara Tavuk Göğsü',
      de: 'Gegrillte Hähnchenbrust',
      fr: 'Poulet Grillé',
      es: 'Pechuga de Pollo a la Parrilla',
      ar: 'صدر دجاج مشوي',
    },
    cuisine: { en: 'International', tr: 'Uluslararası', de: 'International', fr: 'International', es: 'Internacional', ar: 'دولي' },
    difficulty: 'EASY' as const,
    ingredients: {
      en: ['2 chicken breasts', '2 tbsp olive oil', '1 tsp paprika', '1 tsp garlic powder', 'Salt', 'Black pepper', 'Lemon juice'],
      tr: ['2 tavuk göğsü', '2 yemek kaşığı zeytinyağı', '1 tatlı kaşığı paprika', '1 tatlı kaşığı sarımsak tozu', 'Tuz', 'Karabiber', 'Limon suyu'],
      de: ['2 Hähnchenbrüste', '2 EL Olivenöl', '1 TL Paprika', '1 TL Knoblauchpulver', 'Salz', 'Schwarzer Pfeffer', 'Zitronensaft'],
    },
    instructions: {
      en: [
        'Pound chicken breasts to even thickness.',
        'Mix olive oil with paprika, garlic powder, salt, and pepper.',
        'Coat chicken with marinade and let rest for 15 minutes.',
        'Heat grill to medium-high heat.',
        'Grill chicken for 6-7 minutes per side.',
        'Rest for 5 minutes, then drizzle with lemon juice.',
      ],
      tr: [
        'Tavuk göğüslerini eşit kalınlıkta dövün.',
        'Zeytinyağını paprika, sarımsak tozu, tuz ve karabiberle karıştırın.',
        'Tavukları marine edin ve 15 dakika bekletin.',
        'Izgarayı orta-yüksek ateşte ısıtın.',
        'Tavukları her tarafı 6-7 dakika ızgarada pişirin.',
        '5 dakika dinlendirin, ardından limon suyu gezdirin.',
      ],
      de: [
        'Hähnchenbrüste gleichmäßig plattieren.',
        'Olivenöl mit Paprika, Knoblauchpulver, Salz und Pfeffer mischen.',
        'Hähnchen mit Marinade bestreichen und 15 Minuten ruhen lassen.',
        'Grill auf mittlere bis hohe Hitze vorheizen.',
        'Hähnchen 6-7 Minuten pro Seite grillen.',
        '5 Minuten ruhen lassen, dann mit Zitronensaft beträufeln.',
      ],
    },
    prepTimeMinutes: 20,
    cookTimeMinutes: 15,
    image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=800',
    rating: 4.4,
    tags: { en: ['chicken', 'grilled', 'healthy', 'protein'], tr: ['tavuk', 'ızgaralı', 'sağlıklı', 'protein'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
    isPublished: true,
    categorySlug: 'chicken',
  },
  {
    name: {
      en: 'Grilled Salmon',
      tr: 'Izgara Somon',
      de: 'Gegrillter Lachs',
      fr: 'Saumon Grillé',
      es: 'Salmón a la Parrilla',
      ar: 'سلمون مشوي',
    },
    cuisine: { en: 'Mediterranean', tr: 'Akdeniz', de: 'Mediterran', fr: 'Méditerranéen', es: 'Mediterránea', ar: 'متوسطي' },
    difficulty: 'EASY' as const,
    ingredients: {
      en: ['2 salmon fillets', '2 tbsp olive oil', '1 lemon', '2 cloves garlic', 'Fresh dill', 'Salt', 'Black pepper'],
      tr: ['2 somon filetosu', '2 yemek kaşığı zeytinyağı', '1 limon', '2 diş sarımsak', 'Taze dereotu', 'Tuz', 'Karabiber'],
      de: ['2 Lachsfilets', '2 EL Olivenöl', '1 Zitrone', '2 Knoblauchzehen', 'Frischer Dill', 'Salz', 'Schwarzer Pfeffer'],
    },
    instructions: {
      en: [
        'Pat salmon dry and season with salt and pepper.',
        'Mix olive oil, minced garlic, and lemon juice.',
        'Brush salmon with olive oil mixture.',
        'Heat grill to medium-high.',
        'Grill salmon skin-side down for 4 minutes.',
        'Flip and cook for another 3-4 minutes.',
        'Garnish with fresh dill and serve with lemon wedges.',
      ],
      tr: [
        'Somonu kurulayın ve tuz karabiberle tatlandırın.',
        'Zeytinyağını, kıyılmış sarımsak ve limon suyunu karıştırın.',
        'Somona zeytinyağı karışımını sürün.',
        'Izgarayı orta-yüksek ateşte ısıtın.',
        'Somonu deri tarafı aşağı 4 dakika ızgarada pişirin.',
        'Çevirin ve 3-4 dakika daha pişirin.',
        'Taze dereotu ile süsleyin ve limon dilimleriyle servis yapın.',
      ],
      de: [
        'Lachs trocken tupfen und mit Salz und Pfeffer würzen.',
        'Olivenöl, gehackten Knoblauch und Zitronensaft mischen.',
        'Lachs mit Olivenöl-Gemisch bestreichen.',
        'Grill auf mittlere bis hohe Hitze vorheizen.',
        'Lachs mit Hautseite nach unten 4 Minuten grillen.',
        'Wenden und weitere 3-4 Minuten kochen.',
        'Mit frischem Dill garnieren und mit Zitronenspalten servieren.',
      ],
    },
    prepTimeMinutes: 10,
    cookTimeMinutes: 8,
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800',
    rating: 4.7,
    tags: { en: ['seafood', 'salmon', 'healthy', 'omega-3'], tr: ['deniz ürünleri', 'somon', 'sağlıklı', 'omega-3'] },
    mealType: { en: ['dinner', 'lunch'], tr: ['akşam yemeği', 'öğle yemeği'] },
    isPublished: true,
    categorySlug: 'seafood',
  },
];

async function main() {
  console.log('Seeding categories...');

  // Create a default admin user for recipe ownership
  let adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!adminUser) {
    console.log('No admin user found, skipping recipes (run auth setup first)');
    adminUser = await prisma.user.findFirst();
  }

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, cuisine: cat.cuisine },
      create: { slug: cat.slug, name: cat.name, cuisine: cat.cuisine },
    });
    console.log(`Upserted category: ${cat.slug}`);
  }

  console.log(`\nSeeding recipes (admin user: ${adminUser?.email ?? 'none'})...`);

  if (adminUser) {
    for (const recipe of recipes) {
      const category = await prisma.category.findUnique({ where: { slug: recipe.categorySlug } });
      await prisma.recipe.upsert({
        where: { sourceUrl: recipe.image },
        update: {
          name: recipe.name,
          cuisine: recipe.cuisine,
          difficulty: recipe.difficulty,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          image: recipe.image,
          rating: recipe.rating,
          tags: recipe.tags,
          mealType: recipe.mealType,
          isPublished: recipe.isPublished,
          ownerId: adminUser.id,
          categoryId: category?.id,
        },
        create: {
          name: recipe.name,
          cuisine: recipe.cuisine,
          difficulty: recipe.difficulty,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          image: recipe.image,
          rating: recipe.rating,
          tags: recipe.tags,
          mealType: recipe.mealType,
          isPublished: recipe.isPublished,
          sourceUrl: recipe.image,
          ownerId: adminUser.id,
          categoryId: category?.id,
        },
      });
      console.log(`Upserted recipe: ${recipe.name.en}`);
    }
  }

  console.log('\nDone!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});