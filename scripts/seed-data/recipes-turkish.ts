import type { SeedRecipe } from './seed-recipe';

/** Turkish and neighbouring kitchens. */
export const TURKISH_RECIPES: SeedRecipe[] = [
  {
    slug: 'menemen', imageQuery: 'shakshuka eggs',
    name: { tr: 'Menemen', en: 'Menemen' },
    cuisine: 'TURKISH', category: 'BREAKFAST', difficulty: 'EASY',
    prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 2, caloriesPerServing: 260,
    nutrition: { protein: 14, carbs: 12, fat: 18, fiber: 3 },
    ingredients: {
      tr: ['4 yumurta', '3 olgun domates', '2 sivri biber', '2 yemek kaşığı tereyağı', '1 çay kaşığı pul biber', 'Tuz', 'Karabiber'],
      en: ['4 eggs', '3 ripe tomatoes', '2 long green peppers', '2 tbsp butter', '1 tsp red pepper flakes', 'Salt', 'Black pepper'],
    },
    instructions: {
      tr: ['Biberleri ince halkalar hâlinde doğrayın, tereyağında 3-4 dakika yumuşayana kadar çevirin.', 'Domatesleri kabuklarını soyup küp doğrayın ve tencereye ekleyin.', 'Suyunu salıp çekene kadar orta ateşte 8 dakika pişirin.', 'Yumurtaları kırıp ekleyin ve çatalla hafifçe karıştırın; tamamen dağıtmayın.', 'Yumurtalar kıvama gelince pul biber, tuz ve karabiber serpip ocaktan alın.'],
      en: ['Slice the peppers into thin rings and soften them in the butter for 3-4 minutes.', 'Peel and dice the tomatoes, then add them to the pan.', 'Cook over medium heat for about 8 minutes, until the liquid has reduced.', 'Crack in the eggs and stir gently with a fork — leave some streaks rather than scrambling them smooth.', 'Once the eggs are just set, season with pepper flakes, salt and black pepper and take the pan off the heat.'],
    },
    tags: { tr: ['Kahvaltı', 'Pratik'], en: ['Breakfast', 'Quick'] }, mealType: ['breakfast'],
  },
  {
    slug: 'karniyarik', imageQuery: 'moussaka eggplant',
    name: { tr: 'Karnıyarık', en: 'Stuffed Eggplant with Minced Meat' },
    cuisine: 'TURKISH', category: 'MAIN_COURSE', difficulty: 'MEDIUM',
    prepTimeMinutes: 25, cookTimeMinutes: 45, servings: 4, caloriesPerServing: 380,
    nutrition: { protein: 20, carbs: 22, fat: 24, fiber: 7 },
    ingredients: {
      tr: ['6 adet ince uzun patlıcan', '300 g kıyma', '2 soğan', '3 domates', '3 sivri biber', '3 diş sarımsak', '2 yemek kaşığı salça', 'Zeytinyağı', 'Tuz', 'Karabiber', '1 su bardağı sıcak su'],
      en: ['6 slender aubergines', '300 g minced beef', '2 onions', '3 tomatoes', '3 long green peppers', '3 garlic cloves', '2 tbsp tomato paste', 'Olive oil', 'Salt', 'Black pepper', '1 cup hot water'],
    },
    instructions: {
      tr: ['Patlıcanları alacalı soyup tuzlu suda 15 dakika bekletin, sonra kurulayın.', 'Zeytinyağında her tarafı yumuşayana kadar kızartın ve fırın tepsisine alın.', 'Aynı yağda soğanı ve sarımsağı kavurun, kıymayı ekleyip suyunu çekene kadar pişirin.', 'Doğranmış domates, biber ve salçayı ekleyip 5 dakika daha kavurun; tuz ve karabiberle tatlandırın.', 'Patlıcanların ortasını boydan yarıp harcı içine doldurun.', 'Üzerine birer domates ve biber dilimi koyun, tepsiye sıcak suyu gezdirin.', '180 derece fırında 30 dakika pişirin.'],
      en: ['Peel the aubergines in stripes, soak them in salted water for 15 minutes, then pat dry.', 'Fry them in olive oil until soft on all sides and transfer to a baking dish.', 'In the same oil, soften the onion and garlic, then add the mince and cook until the liquid has gone.', 'Stir in the chopped tomatoes, peppers and tomato paste and cook 5 minutes more; season with salt and pepper.', 'Split each aubergine lengthways and spoon the filling inside.', 'Top each with a slice of tomato and pepper, then pour the hot water around them.', 'Bake at 180°C for 30 minutes.'],
    },
    tags: { tr: ['Ana Yemek', 'Fırın'], en: ['Main', 'Baked'] }, mealType: ['dinner'],
  },
  {
    slug: 'mercimek-corbasi', imageQuery: 'lentil soup',
    name: { tr: 'Mercimek Çorbası', en: 'Red Lentil Soup' },
    cuisine: 'TURKISH', category: 'SOUP', difficulty: 'EASY',
    prepTimeMinutes: 10, cookTimeMinutes: 30, servings: 6, caloriesPerServing: 190,
    nutrition: { protein: 11, carbs: 28, fat: 4, fiber: 8 },
    ingredients: {
      tr: ['1.5 su bardağı kırmızı mercimek', '1 soğan', '1 havuç', '1 patates', '2 yemek kaşığı tereyağı', '1 yemek kaşığı un', '8 su bardağı su', 'Tuz', 'Kimyon', 'Limon'],
      en: ['1.5 cups red lentils', '1 onion', '1 carrot', '1 potato', '2 tbsp butter', '1 tbsp flour', '8 cups water', 'Salt', 'Cumin', 'Lemon'],
    },
    instructions: {
      tr: ['Soğanı tereyağında pembeleşene kadar kavurun, unu ekleyip bir dakika daha çevirin.', 'Doğranmış havuç ve patatesi ekleyip birkaç dakika kavurun.', 'Yıkanmış mercimeği ve suyu ilave edin, kaynayınca kısık ateşe alın.', 'Sebzeler dağılana kadar 25 dakika pişirin.', 'Blenderdan geçirip pürüzsüz hâle getirin, tuz ve kimyonla tatlandırın.', 'Sıcak servis edin, yanında limon verin.'],
      en: ['Soften the onion in the butter until golden, then stir in the flour for a minute.', 'Add the diced carrot and potato and cook a few minutes more.', 'Add the rinsed lentils and the water; once boiling, lower the heat.', 'Simmer for 25 minutes, until everything has fallen apart.', 'Blend until smooth, then season with salt and cumin.', 'Serve hot with lemon on the side.'],
    },
    tags: { tr: ['Çorba', 'Vejetaryen'], en: ['Soup', 'Vegetarian'] }, mealType: ['lunch', 'dinner'],
  },
  {
    slug: 'imam-bayildi', imageQuery: 'eggplant stuffed',
    name: { tr: 'İmam Bayıldı', en: 'Imam Bayıldı' },
    cuisine: 'TURKISH', category: 'MAIN_COURSE', difficulty: 'MEDIUM',
    prepTimeMinutes: 20, cookTimeMinutes: 50, servings: 4, caloriesPerServing: 240,
    nutrition: { protein: 4, carbs: 20, fat: 17, fiber: 8 },
    ingredients: {
      tr: ['4 patlıcan', '3 soğan', '6 diş sarımsak', '3 domates', '2 sivri biber', 'Yarım demet maydanoz', '1 çay bardağı zeytinyağı', '1 çay kaşığı şeker', 'Tuz'],
      en: ['4 aubergines', '3 onions', '6 garlic cloves', '3 tomatoes', '2 long green peppers', 'Half a bunch of parsley', '1/2 cup olive oil', '1 tsp sugar', 'Salt'],
    },
    instructions: {
      tr: ['Patlıcanları alacalı soyup tuzlu suda bekletin, kurulayıp zeytinyağında hafifçe kızartın.', 'Soğanları piyazlık doğrayıp bol zeytinyağında yumuşayana kadar kavurun.', 'Sarımsak, doğranmış domates ve biberi ekleyip 10 dakika pişirin.', 'Maydanoz, şeker ve tuzu karıştırın.', 'Patlıcanların ortasını yarıp harcı bolca doldurun.', 'Tencereye dizip yarısına kadar sıcak su ekleyin, kısık ateşte 30 dakika pişirin.', 'Ilıyınca servis edin — bu yemek soğuk yenir.'],
      en: ['Peel the aubergines in stripes, soak in salted water, pat dry and fry lightly in olive oil.', 'Slice the onions and soften them in plenty of olive oil.', 'Add the garlic, chopped tomatoes and peppers and cook for 10 minutes.', 'Stir through the parsley, sugar and salt.', 'Split the aubergines lengthways and fill them generously.', 'Arrange in a pot, add hot water to halfway up, and simmer gently for 30 minutes.', 'Serve at room temperature — this dish is meant to be eaten cool.'],
    },
    tags: { tr: ['Zeytinyağlı', 'Vegan'], en: ['Olive Oil', 'Vegan'] }, mealType: ['lunch', 'dinner'],
  },
  {
    slug: 'sutlac', imageQuery: 'rice pudding',
    name: { tr: 'Fırın Sütlaç', en: 'Baked Rice Pudding' },
    cuisine: 'TURKISH', category: 'DESSERT', difficulty: 'EASY',
    prepTimeMinutes: 10, cookTimeMinutes: 60, servings: 6, caloriesPerServing: 220,
    nutrition: { protein: 6, carbs: 38, fat: 5, fiber: 0 },
    ingredients: {
      tr: ['1 litre süt', '0.5 su bardağı pirinç', '1 su bardağı toz şeker', '2 yemek kaşığı pirinç unu', '1 paket vanilin', '1 su bardağı su'],
      en: ['1 litre milk', '1/2 cup short-grain rice', '1 cup sugar', '2 tbsp rice flour', '1 tsp vanilla', '1 cup water'],
    },
    instructions: {
      tr: ['Pirinci suyla birlikte suyunu çekene kadar haşlayın.', 'Sütü ekleyip kaynamaya bırakın, ara ara karıştırın.', 'Şekeri ilave edip 10 dakika pişirin.', 'Pirinç ununu az suyla ezip çorbaya yavaşça ekleyin, koyulaşana kadar karıştırın.', 'Vanilini ekleyip kâselere paylaştırın.', 'Kâseleri su dolu bir tepsiye dizip 200 derece fırında üstleri kızarana kadar pişirin.', 'Soğuduktan sonra buzdolabında bekletip servis edin.'],
      en: ['Simmer the rice in the water until it has absorbed all of it.', 'Pour in the milk and bring to a gentle boil, stirring now and then.', 'Add the sugar and cook for 10 minutes.', 'Slake the rice flour in a little water, stir it in and cook until thickened.', 'Add the vanilla and divide between ramekins.', 'Stand the ramekins in a tray of water and bake at 200°C until the tops colour.', 'Chill before serving.'],
    },
    tags: { tr: ['Tatlı', 'Sütlü'], en: ['Dessert', 'Milk'] }, mealType: ['dessert'],
  },
];
