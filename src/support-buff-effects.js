// Census item #2 (research/unmodeled-dps-census-2026-10-26.md §2.2; 2026-10-27): the support lines that buff the player or the build's
// other skills rather than the supported skill's own damage. src/support-effects.js classifies them (family "censusBuff", Phantom
// Trace's "censusDetail" Blur grant); this module turns them into derived lines and per-setup additions the planner applies.
//
// - Empowered Element (game recipe 446081152: node 292 "while the supported skill lasts" on filter 106, then node 101 attr 5727 mod 3
//   with no tag on the holder, removed from unfiltered entities): a build-wide "+X% Elemental Damage" while the supported Empower
//   Skill's effect lasts. Census C11 (user decision 2026-11-15): at that skill's uptime (`uptimeFor`: an Empower buff's steady uptime,
//   src/empower-buffs.js; Aim's uptime, src/aim-model.js), time-averaged; a skill with no uptime model (a trait skill) stays held
//   (provisional, open question support-buff-uptimes).
// - Gladiator's Roar (recipe 654286: on casting the supported Warcry, a p2 s timed 57191 additional damage on the player when an Elite
//   is inside 6 m × Skill Area): the dummy is an Elite (a Boss) within 10 m, inside the area at both distances. Uptime min(1, buff
//   seconds ÷ the Warcry's effective cooldown), the Warcry cast whenever its cooldown allows (best case); without a cooldown held.
// - Psychic Surge (recipe 40376: node 624, the next action of a Spell Burst activation after a cast of the supported Mobility Skill:
//   +P2% additional Hit Damage for skills cast by Spell Burst): on each Spell-Bursting skill, the share of its activations that follow
//   a Mobility cast, min(1, Mobility uses/s ÷ activations/s), with the Mobility Skill used whenever its cooldown allows (user rule
//   2026-10-14, the mobilitySkillUsed switch). Activations come from the planner's hit pass (hitRateFacts); before it they are held.
// - Phantom Trace (recipe 309615840: Blur (buff 220) when the supported skill deals Damage Over Time): a Blur source while the skill's
//   own damage is a DoT or the dummy carries a damaging ailment (Ignite, Trauma, Wilt; attribution to the supported skill provisional).

const round = (value) => Math.round(value * 10000) / 10000;
const DAMAGING_AILMENTS = ["Ignite", "Trauma", "Wilt"];

const hasSupport = (setup, name) => (setup.supports || []).some((support) => support.enabled !== false && support.name === name);
const clausesOf = (setup, kind) => (setup.supportEffects?.censusBuff || []).filter((line) => line.kind === kind && line.status === "Provisional");

/** Phantom Trace's Blur grant as src/blur-sources.js entries. */
// Its gain rate (8 T Thornfield audit G7, 2026-11-13): recipe 309615840's trigger 1000030 on [this skill, DoT process] with `once` fires
// once per frame per target while the DoT record ticks (W2, proven), so one gain per server tick: 30 a second × the share of the time
// it ticks (its own DoT: held; an attributed ailment: that ailment's share on the dummy, `ailmentShare`).
const DOT_TICKS_PER_SECOND = 30;
export function phantomTraceBlurSources({ setups = [], activeNames = new Set(), damageSources = [], enemyAilments = [], ailmentShare = null } = {}) {
  const result = [];
  const ailment = DAMAGING_AILMENTS.find((name) => enemyAilments.includes(name));
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name) || !hasSupport(setup, "Phantom Trace")) continue;
    // Its own DoT: a skill-dot profile, or a skill-hit profile with a DoT component (Flame Jet's burn; src/skill-hit-profiles.js).
    const ownDot = damageSources.some((source) => source.setupKey === setup.setupKey && source.status === "modeled" && (source.profile?.engine === "skill-dot" || (source.profile?.components || []).some((component) => component.kind === "dot" && component.group)));
    const available = ownDot || Boolean(ailment);
    const share = ownDot ? 1 : ailment ? Math.max(0, Math.min(1, Number(typeof ailmentShare === "function" ? ailmentShare(ailment) : 1) || 0)) : 0;
    result.push({ source: `${setup.name}: Phantom Trace`, text: "Gains Blur when the supported skill deals Damage Over Time", trigger: "Dealing Damage Over Time", available, setupKey: setup.setupKey,
      ticksPerSecond: DOT_TICKS_PER_SECOND * share, ticksHow: ownDot ? `${setup.name}'s own DoT, one gain per server tick while it ticks` : ailment ? `${ailment} on the dummy ${round(share * 100)}% of the time, one gain per server tick` : "",
      reason: ownDot ? `${setup.name} deals Damage Over Time (game recipe 309615840)` : ailment ? `the dummy carries ${ailment}, read as inflicted by ${setup.name} (provisional attribution; game recipe 309615840)` : `${setup.name} deals no Damage Over Time` });
  }
  return result;
}

/**
 * @param {object} p
 * @param {object[]} p.setups resolved setups (with supportEffects)
 * @param {Set<string>} p.activeNames active skill names
 * @param {(setup: object) => number} p.cooldownFor the setup's base cooldown in seconds (0 = none)
 * @param {boolean} p.mobilitySkillUsed combat condition (default on)
 * @param {Map<string, object>|null} p.hitRateFacts setupKey → { spellBurstActivationsPerSecond } from the hit pass (null before it)
 * @param {(setup: object) => ({ uptime: number, reason: string } | null)} p.uptimeFor the supported skill's share of the time its effect
 *   lasts (Empowered Element), or null when it has no uptime model (held)
 * @returns {{ lines: object[], entries: object[] }} lines: derived modifier texts; Psychic Surge is added to the Spell-Bursting setups'
 *   supportEffects.spellBurst (kind "hitAdditional") in place.
 */
export function resolveSupportBuffs({ setups = [], activeNames = new Set(), cooldownFor = () => 0, mobilitySkillUsed = true, hitRateFacts = null, uptimeFor = () => null } = {}) {
  const lines = [], entries = [];
  const active = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name));
  const cooldownOf = (setup) => {
    const cooldownLines = setup.supportEffects?.cooldown || [];
    const factor = Math.max(1e-9, 1 + cooldownLines.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0) / 100) * cooldownLines.filter((line) => line.additional).reduce((product, line) => product * (1 + line.value / 100), 1);
    return Math.max(0, Number(cooldownFor(setup)) || 0) / factor;
  };
  for (const setup of active) {
    for (const line of clausesOf(setup, "empoweredElement")) {
      const timing = uptimeFor(setup);
      const uptime = timing ? Math.max(0, Math.min(1, Number(timing.uptime) || 0)) : 1;
      const value = round(line.value * uptime);
      const how = timing ? `${timing.reason}: uptime ${round(uptime)}` : `${setup.name} has no uptime model: held`;
      if (value) lines.push({ text: `+${value}% Elemental Damage`, source: `${setup.name}: ${line.support} (+${round(line.value)}% while ${setup.name} lasts × ${round(uptime)} uptime; provisional)`, origin: "derived", multiplier: 1, supportBuff: true });
      entries.push({ setupKey: setup.setupKey, support: line.support, value, uptime: round(uptime), text: `${setup.name}: ${line.support} +${line.value}% Elemental Damage while ${setup.name} lasts (game recipe 446081152), ${how} = +${value}% (provisional)` });
    }
    // Howling Gale: Eye of the Gale (game record 239448224, buff 10851 on the holder; wiring fix W6b): the Gale follows you, so while
    // the skill channels you stand in it (held: best case, as Rapid Sweep's Gale): your additional Attack and Cast Speed and your
    // increased Projectile Speed, read by every skill and the Projectile Speed conversions (Gale 114414, 101140017).
    for (const line of clausesOf(setup, "eyeOfTheGale")) {
      const source = `${setup.name}: ${line.support} (you stand in the Gale, which follows you; held while channeling, provisional)`;
      lines.push({ text: `+${round(line.value)}% additional Attack Speed`, source, origin: "derived", multiplier: 1, supportBuff: true });
      lines.push({ text: `+${round(line.value)}% additional Cast Speed`, source, origin: "derived", multiplier: 1, supportBuff: true });
      if (line.projectileSpeed) lines.push({ text: `+${round(line.projectileSpeed)}% Projectile Speed`, source, origin: "derived", multiplier: 1, supportBuff: true });
      entries.push({ setupKey: setup.setupKey, support: line.support, value: line.value, uptime: 1, text: `${setup.name}: ${line.support} +${line.value}% additional Attack and Cast Speed and +${line.projectileSpeed ?? 0}% Projectile Speed inside the Gale (held while channeling; provisional)` });
    }
    for (const line of clausesOf(setup, "gladiatorsRoar")) {
      const cooldown = cooldownOf(setup);
      const seconds = line.seconds || 0;
      const uptime = cooldown > 0 ? Math.min(1, seconds / cooldown) : 1;
      const value = round(line.value * uptime);
      if (value) lines.push({ text: `+${value}% additional damage`, source: `${setup.name}: ${line.support} (+${line.value}% for ${seconds} s × ${round(uptime)} uptime; the dummy is an Elite inside the area)`, origin: "derived", multiplier: 1, supportBuff: true });
      entries.push({ setupKey: setup.setupKey, support: line.support, value, uptime: round(uptime), text: `${setup.name}: ${line.support} +${line.value}% additional damage for ${seconds} s per cast, cast every ${cooldown > 0 ? `${round(cooldown)} s (its cooldown)` : "use (no cooldown: held)"} → uptime ${round(uptime)} = +${value}%` });
    }
    for (const line of clausesOf(setup, "psychicSurge")) {
      if (!mobilitySkillUsed) { entries.push({ setupKey: setup.setupKey, support: line.support, value: 0, text: `${setup.name}: ${line.support} inactive (Mobility Skill used recently is off)` }); continue; }
      const cooldown = cooldownOf(setup);
      const mobilityUses = cooldown > 0 ? 1 / cooldown : null;
      for (const target of active) {
        if (target === setup || !(target.supportEffects?.spellBurst)) continue;
        const facts = hitRateFacts?.get?.(target.setupKey) || null;
        const activations = facts ? Number(facts.spellBurstActivationsPerSecond) || 0 : null;
        if (activations === 0) continue;
        const share = activations == null || mobilityUses == null ? 1 : Math.min(1, (mobilityUses * (line.bursts || 1)) / activations);
        const value = round(line.value * share);
        const reading = activations == null ? "activations not measured yet (held for this pass)" : mobilityUses == null ? `${setup.name} has no cooldown: every activation follows a cast (held)` : `${round(mobilityUses)} ${setup.name} casts/s (its ${round(cooldown)} s cooldown) ÷ ${round(activations)} Spell Burst activations/s = ${round(share)}`;
        target.supportEffects.spellBurst.push({ support: line.support, source: `${setup.name}: ${line.support}`, text: `+${value}% additional Hit Damage for the supported skills cast by Spell Burst (${line.text}; ${reading}; provisional)`, origin: "derived", status: "Provisional", value, kind: "hitAdditional" });
        entries.push({ setupKey: setup.setupKey, target: target.setupKey, support: line.support, value, share: round(share), text: `${setup.name}: ${line.support} on ${target.name}'s Spell Burst casts: +${line.value}% × ${round(share)} (${reading})` });
      }
    }
  }
  return { lines, entries };
}
