export const heroCatalogSs13 = [
  ["rehan-anger", "Rehan", "Anger"], ["rehan-seething-silhouette", "Rehan", "Seething Silhouette"],
  ["carino-ranger-of-glory", "Carino", "Ranger of Glory"], ["carino-lethal-flash", "Carino", "Lethal Flash"], ["carino-zealot-of-war", "Carino", "Zealot of War"],
  ["erika-wind-stalker", "Erika", "Wind Stalker"], ["erika-lightning-shadow", "Erika", "Lightning Shadow"], ["erika-vendettas-sting", "Erika", "Vendetta's Sting"],
  ["bing-blast-nova", "Bing", "Blast Nova"], ["bing-creative-genius", "Bing", "Creative Genius"],
  ["gemma-ice-fire-fusion", "Gemma", "Ice-Fire Fusion"], ["gemma-frostbitten-heart", "Gemma", "Frostbitten Heart"], ["gemma-flame-of-pleasure", "Gemma", "Flame of Pleasure"],
  ["thea-wisdom-of-the-gods", "Thea", "Wisdom of The Gods"], ["thea-incarnation-of-the-gods", "Thea", "Incarnation of The Gods"], ["thea-blasphemer", "Thea", "Blasphemer"],
  ["youga-spacetime-illusion", "Youga", "Spacetime Illusion"], ["youga-spacetime-elapse", "Youga", "Spacetime Elapse"], ["youga-the-ultimate-one", "Youga", "The Ultimate One"],
  ["moto-order-calling", "Moto", "Order Calling"], ["moto-charge-calling", "Moto", "Charge Calling"],
  ["iris-growing-breeze", "Iris", "Growing Breeze"], ["iris-vigilant-breeze", "Iris", "Vigilant Breeze"],
  ["rosa-high-court-chariot", "Rosa", "High Court Chariot"], ["rosa-unsullied-blade", "Rosa", "Unsullied Blade"],
  ["selena-sing-with-the-tide", "Selena", "Sing with the Tide"], ["selena-dance-of-the-deep", "Selena", "Dance of the Deep"],
  ["sage-licorice-note", "Sage", "Licorice Note"]
].map(([id, name, trait]) => ({ id, name, trait, image: `./src/assets/tli/heroes/${id}.webp`, season: "SS13" }));

export const defaultHeroId = "selena-sing-with-the-tide";
export const heroById = (id) => id ? heroCatalogSs13.find((hero) => hero.id === id) || heroCatalogSs13.find((hero) => hero.id === defaultHeroId) : null;
