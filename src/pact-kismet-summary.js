import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { kismetAffixesWithRolls } from "./kismet-crafting.js";
import { boostedKismetAffixText, microFateEffectScale } from "./kismet-effects.js";
import { fateExtraSlots, fateSlotBonuses } from "./fate-slot-unlocks.js";
import { orderedPactspiritNodes } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";

export function equippedKismetSummary(pactSetup,state={}){
  if(state.kismetSlotMode){
    const activeNames=state.selectedSpirits?.filter(Boolean);
    const activeUnlocks=Object.fromEntries((activeNames||[]).filter((name)=>{
      const index=orderedPactspiritNodes(pactspiritTreesSs13[name]).findIndex((node)=>node.ring==="destiny");
      return index>=0&&state.nativeNodeQuantities?.[`${name}:${index}`]===1;
    }).map((name)=>[name,state.fateUnlocks?.[name]]));
    const bonuses=fateSlotBonuses(activeNames,activeUnlocks);
    const activeExtraKeys=new Set((activeNames||[]).flatMap((name)=>fateExtraSlots(name,activeUnlocks[name]).map((slot)=>slot.key)));
    const equipped=Object.entries(state.kismetSlots||{}).filter(([key])=>(!activeNames||activeNames.some((name)=>key.startsWith(`${name}:`)))&&(!activeNames?.some((name)=>key===`${name}:10`))&&(key.includes(":extra:")?activeExtraKeys.has(key):state.nativeNodeQuantities?.[key]===1)).map(([key,slot])=>({key,entry:kismetCatalogSs13.find((item)=>item.name===slot.name),rolls:slot.rolls})).filter(({entry})=>entry);
    const stats=(kind)=>equipped.filter(({entry})=>entry.kind===kind).map(({key,entry,rolls})=>{const boost=microFateEffectScale(state,key);return {label:entry.name.replace(/^(?:Micro Fate|Medium Fate|Kismet|Dual Kismet):\s*/,""),value:kismetAffixesWithRolls(entry,rolls).map((text)=>boostedKismetAffixText(text,boost)).join(" · ")};});
    const microStats=stats("micro"),mediumStats=stats("medium");
    return {microCount:microStats.length,microMax:9+bonuses.micro,mediumCount:mediumStats.length,mediumMax:4+bonuses.medium,microStats,mediumStats};
  }
  const volcano=pactSetup.kismets[0];
  const volcanoEnabled=Array.isArray(state.volcanoEnabled)?state.volcanoEnabled:volcano.rolls.map(()=>true);
  const mediumRolls=volcano.rolls.filter((_,index)=>volcanoEnabled[index]!==false);
  const reapingFate=pactSetup.microFates.find((fate)=>fate.name==="Micro Fate: Reaping Duration");
  const spellFate=pactSetup.microFates.find((fate)=>fate.name==="Micro Fate: Spell Block Chance");
  const attackFate=pactSetup.microFates.find((fate)=>fate.name==="Micro Fate: Attack Block Chance");
  const reapingCount=Math.max(0,Math.min(reapingFate.quantity,Number(state.reapingDurationQuantity??reapingFate.quantity)||0));
  const spellValues=spellFate.valuesPercent.filter((_,index)=>state.spellBlockEnabled?.[index]!==false);
  const attackValues=attackFate.valuesPercent.filter((_,index)=>state.attackBlockEnabled?.[index]!==false);
  const sum=(values)=>values.reduce((total,value)=>total+value,0);
  const igniteDurationFactor=mediumRolls.reduce((factor,roll)=>factor*Math.max(0,1+roll.additionalIgniteDurationPercent/100),1);
  const microCount=reapingCount+spellValues.length+attackValues.length;
  return {
    microCount,microMax:9,
    mediumCount:mediumRolls.length,mediumMax:volcano.rolls.length,
    microStats:[
      reapingCount?{label:"Reaping Duration",value:`+${reapingCount*reapingFate.totalPercent/reapingFate.quantity}%`,count:reapingCount}:null,
      spellValues.length?{label:"Spell Block Chance",value:`+${sum(spellValues)}%`,count:spellValues.length}:null,
      attackValues.length?{label:"Attack Block Chance",value:`+${sum(attackValues)}%`,count:attackValues.length}:null
    ].filter(Boolean),
    mediumStats:mediumRolls.length?[
      {label:"Ignite limit",value:`+${sum(mediumRolls.map((roll)=>roll.igniteLimit))}`},
      {label:"Chance to Ignite targets",value:`${sum(mediumRolls.map((roll)=>roll.chanceToIgniteTargetsPercent))}%`},
      {label:"Listed Ignite duration rolls",value:mediumRolls.map((roll)=>`${roll.additionalIgniteDurationPercent}%`).join(" · ")},
      {label:"Effective Ignite duration",value:`×${igniteDurationFactor.toFixed(4)} (${((igniteDurationFactor-1)*100).toFixed(2)}%)`}
    ]:[]
  };
}
