export const talentFamiliesSs13 = {
  "God of Might":["The Brave","Onslaughter","Warlord","Warrior"],
  "Goddess of Hunting":["Marksman","Bladerunner","Druid","Assassin"],
  "Goddess of Knowledge":["Magister","Arcanist","Elementalist","Prophet"],
  "God of War":["Shadowdancer","Ronin","Ranger","Sentinel"],
  "Goddess of Deception":["Shadowmaster","Psychic","Warlock","Lich"],
  "God of Machines":["Machinist","Steel Vanguard","Alchemist","Artisan"]
};
export const godTalentTreesSs13=Object.keys(talentFamiliesSs13);
export const classTalentTreesSs13=Object.values(talentFamiliesSs13).flat();

export function talentOptionsForSlot(slot,selectedTrees) {
  const source=slot===0 ? godTalentTreesSs13 : slot===1 ? (talentFamiliesSs13[selectedTrees[0]] || []) : classTalentTreesSs13;
  const occupied=new Set(selectedTrees.filter((_,index)=>index!==slot));
  return source.filter((name)=>!occupied.has(name));
}

export function normalizeTalentTreeSelection(value,fallback=["Goddess of Deception","Psychic","Warlord","Lich"]) {
  const input=Array.isArray(value) ? value : fallback;
  const result=["","","",""];
  if(input[0]==="")return result;
  result[0]=godTalentTreesSs13.includes(input[0]) ? input[0] : fallback[0];
  result[1]=talentFamiliesSs13[result[0]].includes(input[1]) ? input[1] : (result[0]===fallback[0] && talentFamiliesSs13[result[0]].includes(fallback[1]) ? fallback[1] : "");
  for (const slot of [2,3]) if (classTalentTreesSs13.includes(input[slot]) && !result.includes(input[slot])) result[slot]=input[slot];
  return result;
}
