const compatibleTagNames = [
  "Attack", "Spell", "Area", "Melee", "Parabolic", "Horizontal", "Vertical", "Chain",
  "Mobility", "Persistent", "Channeled", "Sentry", "Shadow Strike", "Slash-Strike",
  "Demolisher", "Terra", "Beam", "Barrage", "Restoration", "Defensive", "Empower",
  "Warcry", "Curse", "Combo", "Elixir"
];

export function supportCanSupportProjectile(support, skillCatalog) {
  if (support.passiveOnly || !["regular", "magnificent", "noble"].includes(support.category)) return false;
  const projectileSkills=skillCatalog.filter((skill)=>skill.tags?.includes("Projectile"));
  if (support.exclusiveFor) return projectileSkills.some((skill)=>skill.name===support.exclusiveFor);
  const rule=(support.effects?.[0]||"").split(".")[0];
  if (/supports? (?:any skill|active skills?|skills? that (?:deal damage|hit enemies))/i.test(rule)) return true;
  if (/projectile skills?/i.test(rule)) return true;
  const mentioned=compatibleTagNames.filter((tag)=>new RegExp(`\\b${tag.replace("-","[- ]")}s?\\b`,"i").test(rule));
  if (!mentioned.length) return false;
  return projectileSkills.some((skill)=>{
    const tags=skill.tags||[];
    return /\bor\b/i.test(rule) ? mentioned.some((tag)=>tags.includes(tag)) : mentioned.every((tag)=>tags.includes(tag));
  });
}

export function carinoSpecialAmmoOptions(supportCatalog, skillCatalog, installedOnSkillPanel = [], wellPrepared = false) {
  const unavailable=new Set(installedOnSkillPanel);
  return supportCatalog.filter((support)=>(wellPrepared||support.category==="regular")&&supportCanSupportProjectile(support,skillCatalog)&&!unavailable.has(support.name));
}
