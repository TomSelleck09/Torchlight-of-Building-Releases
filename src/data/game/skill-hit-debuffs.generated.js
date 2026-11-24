// GENERATED FILE - do not edit by hand. Built by scripts/build-skill-hit-debuffs.mjs from config_affix_effect and config_char_buff
// (gamedata-2026-10-31, SS14; read-only, no script decryption): a skill's own record that puts a debuff on the dummy when the skill hits
// (1000033) or deals damage (1000030), whose buff scales its damage-taken write by GetEffectScale. Read by src/skill-hit-debuffs.js.
// SKILL_HIT_DEBUFFS[record] = { buff, name, tags (the buff's status tags), trigger, once, node, duration (a param name or seconds), writes:
// [{ affix, attr, mod, others (the attacker-side tags the write needs), mine, value (the buff row's p0) }] }. 1 records.
export const SKILL_HIT_DEBUFFS = Object.freeze({
  15564440: {"buff":11200,"name":"s_anyingdan_debuff","tags":[5100310,5100311],"trigger":1000033,"once":true,"node":301,"duration":"p0","writes":[{"affix":993652160,"attr":5720,"mod":4,"others":[5000003,6001020],"mine":[],"value":10}]}
});
