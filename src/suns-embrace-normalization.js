// Sun's Embrace has exactly four legendary modifiers. Older saves can contain
// duplicate copies because its two-line corroded Ignite modifier was mistaken
// for extra affixes during migration.
export function normalizeSunsEmbraceItem(item){
  if(item?.name!=="Sun's Embrace")return item;
  const values=[...(item.legendaryModifiers||[]),...(item.modifiers||[])].filter(Boolean);
  const armor=values.find((text)=>/^\+\d+ Gear Armor$/i.test(text));
  const chance=values.find((text)=>/^\+\d+\s*% chance to Ignite targets$/i.test(text));
  const limit=values.find((text)=>/^\+\d+ Ignite limit(?:\s+Inflicts \d+ additional stacks?(?:\(s\))? of Ignite)?$/i.test(text))
    ||item.corrosionModifiers?.find((text)=>/^\+\d+ Ignite limit$/i.test(text));
  const stacks=values.find((text)=>/^Inflicts \d+ additional stacks?(?:\(s\))? of Ignite$/i.test(text))
    ||item.corrosionModifiers?.find((text)=>/^Inflicts \d+ additional stacks?(?:\(s\))? of Ignite$/i.test(text));
  const resistance=values.find((text)=>/^Additionally increases Ignited enemies' Fire Resistance by \d+\s*%$/i.test(text));
  if(!armor||!chance||!limit||!resistance)return item;
  const ignite=/Inflicts \d+ additional stacks?/i.test(limit)?limit:stacks?`${limit}\n${stacks}`:null;
  if(!ignite)return item;
  const modifiers=[armor,chance,ignite,resistance];
  item.legendaryModifiers=modifiers;
  item.modifiers=[...modifiers,...(item.implicitModifiers||[])]; // the base implicit (game-log imports) stays a separate line
  if((item.corrodedModifierIndices||[]).includes(2)||/^\+2 Ignite limit/i.test(ignite)||stacks){
    item.corrodedModifierIndices=[...new Set([...(item.corrodedModifierIndices||[]).filter((index)=>index<4),2])].sort((a,b)=>a-b);
  }
  item.corrosionModifiers=(item.corrosionModifiers||[]).filter((text)=>text!==limit&&text!==stacks);
  return item;
}
