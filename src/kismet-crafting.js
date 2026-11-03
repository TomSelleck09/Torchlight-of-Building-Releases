const rangePattern=/\((-?\d+(?:\.\d+)?)–(-?\d+(?:\.\d+)?)\)/g;

export function kismetKindForRing(ring){
  if(ring==="inner")return "micro";
  if(ring==="mid")return "medium";
  return null;
}

export function kismetSlotKey(spiritName,nodeIndex){return `${spiritName}:${nodeIndex}`;}

export function kismetRollControls(entry){
  const controls=[];
  for(const [affixIndex,affix] of entry.affixes.entries()){
    let rangeIndex=0;
    for(const match of affix.matchAll(rangePattern)){
      const lower=Number(match[1]),upper=Number(match[2]);
      const decimals=Math.max((match[1].split(".")[1]||"").length,(match[2].split(".")[1]||"").length);
      controls.push({affixIndex,rangeIndex:rangeIndex++,min:Math.min(lower,upper),max:Math.max(lower,upper),step:decimals?10**-decimals:1,defaultValue:Math.max(lower,upper)});
    }
  }
  return controls;
}

export function kismetAffixesWithRolls(entry,rolls=[]){
  let index=0;
  return entry.affixes.map((affix)=>affix.replace(rangePattern,()=>String(rolls[index++]??kismetRollControls(entry)[index-1]?.defaultValue??"")));
}

export function normalizeKismetRolls(entry,rolls=[]){
  return kismetRollControls(entry).map((control,index)=>{
    const candidate=Number(rolls[index]);
    if(!Number.isFinite(candidate))return control.defaultValue;
    const snapped=Math.round(candidate/control.step)*control.step;
    return Number(Math.max(control.min,Math.min(control.max,snapped)).toFixed(4));
  });
}
