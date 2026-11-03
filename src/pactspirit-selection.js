export const defaultPactspiritSlots = ["Preserver of Eternity", "Abyssal King Soul", "Knight of Pale Blue"];
const pactspiritRarityOrder = { Legendary: 0, Rare: 1, Magic: 2 };

export function sortPactspirits(entries){
  return [...entries].sort((a,b)=>(pactspiritRarityOrder[a.rarity]??3)-(pactspiritRarityOrder[b.rarity]??3)||a.name.localeCompare(b.name));
}

export function selectPactspirit(slots,slot,name){
  const next=Array.from({length:3},(_,index)=>slots?.[index]||"");
  const previous=next.indexOf(name);
  if(previous!==-1&&previous!==slot)next[previous]=next[slot];
  next[slot]=name;
  return next;
}

export function activeCapturedPactspirits(slots,capturedNames){
  return Object.fromEntries(capturedNames.map((name)=>[name,slots.includes(name)]));
}
