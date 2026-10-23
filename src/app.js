import { additionalDamagePathSources } from "./damage-path-sources.js";
import { neutralStatuses, refineCoverage, setCoverageContext, dazeStatus } from "./line-coverage.js";
import { damagePathPanelMarkup } from "./damage-path-panel.js";
import { OPEN_QUESTIONS, openQuestionsFor, openQuestionsText } from "./open-questions.js";
import { bugAreaForView, platformName } from "./feedback-links.js";
import { createFeedbackDialog } from "./feedback-dialog.js";
import { expandBuildCode } from "./build-code-compact.js";
import { calculationReportContext } from "./feedback-report-context.js";
import { APP_VERSION } from "./app-version.js";
import { createPlannerCache } from "./planner-cache.js";
import { boostedKismetAffixHtml, microFateEffectScale, parseKismetEffect, starTrailNote } from "./kismet-effects.js";
import { parseBlockModifier } from "./block-model.js";
import { kismetAffixCoverage, pactEffectCoverage } from "./pact-coverage.js";
import { modeledCoreTalents } from "./core-talent-model.js";
import { heroMemoryLineCoverage, revivedAffixCoverage } from "./hero-memory-model.js"; import { catsNightSafariStatus } from "./erika-wind-stalker.js";
import { findSupportValidation } from "./data/stats/support-validation-2026-09-08.js";
import { calculatePlanner, buildCharacterLevel } from "./planner.js";
import { automaticCombatConditionIds } from "./combat-condition-mode.js";
import { classifySkillCoverage, supportClauseCoverage, supportLineCoverage } from "./skill-coverage.js";
import { curseSlotSummary } from "./curse-limit.js";
import { aimUptimeAfterToggle } from "./aim-controls.js";
import { configurationPanelMarkup } from "./configuration-panel.js";
import { coverageBadge, gearLineCoverage, gearLineCoverageReason, talentEffectCoverage, talentLineCoverage, slateLineCoverage, slateLineCoverageReason, prismAffixCoverage, prismAffixCoverageReason, heroTraitCoverage, heroTraitCoverageReason } from "./calculation-coverage.js";
import { scorchingBeamBaseHits, strippedBeamHitCoefficient } from "./scorching-beam-base-hit.js";
import { damagePathControlsMarkup, renderStatSheet } from "./stat-sheet.js";
import { fireHitMitigation, mitigateScorchingBeamCycle } from "./target-hit-mitigation.js";
import { canDropGearInSlot } from "./gear-drag.js";
import { folkloreRingModifier, folkloreRingOptionFromModifiers } from "./legendary-ring-options.js";
import { escapeHtml } from "./html.js"; import { normalizePercentageText } from "./percentage-text.js"; import { traitKeywordTextHtml, traitKeywordDetailsHtml, traitGrantNoteHtml } from "./trait-keyword-markup.js";
import { isRenameKey, resolveBuildRename } from "./build-tab-rename.js";
import { slateShortcutAction } from "./slate-shortcuts.js";
import { qolHelpButton, qolHelpTooltipHtml } from "./qol-help.js";
import { followerPanelMarkup, followerPickerMarkup, followerSkillTooltipHtml, followerTooltipHtml, followerTooltipRarity, followerSkillSelectorView, followerSelectorEntries, followerSelectorInitialIndex, pickFollower, setFollowerSkill, followerSkillDraft, applyFollowerSkillDraft, followerDraftWithTier, followerDraftWithAffix, readHeroPanelTab, writeHeroPanelTab } from "./follower-panel.js";
import { followerById, followerRarityById } from "./follower-model.js";
import { resolveTalentCandidate } from "./candidate-sources.js";
import { calculateSelenaTownBaseline, calculateTalentSlateCandidate, calculatePactCandidate, calculateEquipmentCandidate, compareObservedDamageStates, calculateAuraLedger, calculateAvailableEnergy, allocateSkillEnergy, applyCapturedEnergyCosts, energyCostForSupportSlots, energyCostForSupportPositions, collectNormalizedGearModifiers, aggregateNormalizedModifiers } from "./engine.js";
import { isGearBaseStatLine } from "./gear-base-stats.js";
import { leveledSkillDamage } from "./skill-damage-progression.js";
import { skillDisplaySs13, highlightedSkillEffect, highlightedAuraEffect } from "./skill-display-ss13.js";
import { supportDisplaySs13, highlightedSupportEffect } from "./support-display-ss13.js";
import { sampleBuild } from "./data/sample-build.js";
import { selenaScorchingBeamTalentSetupSs13 } from "./data/talents/selena-scorching-beam-ss13.js";
import { professionTreeLayoutsSs13 } from "./data/talents/profession-tree-layouts-ss13.js";
import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";
import { divinitySlateAffixesSs13, divinitySlateTreeFamiliesSs13 } from "./data/divinity-slate-affixes-ss13.js";
import { netherKingFixedAffixesSs13 } from "./data/nether-king-slate-affixes-ss13.js";
import { assignSkillBoardSlot, moveSkillBoardSlot, skillBoardRows } from "./skill-board-slots.js";
import { isSpiritMagusSkill } from "./magus-active-slot.js";
import { boardSkillChoices, minionInherentSkills, removeActiveSlotMagi } from "./minion-skill-owners.js";
import { supportSlotsForSetup, supportFitsSlot, transferSupportSlot, userInstalledSupports } from "./support-slot-transfer.js";
import { gameRuleDecides, supportCanSupportSkill } from "./support-compatibility.js";
import { judgmentAffectedSlateIds, scaleJudgmentAffix, isActiveJudgment, judgmentAffixTargetPercent, JUDGMENT_LINK_EFFECT_PERCENT } from "./slate-judgment.js";
import { netherKingUltimateAffixesSs13 } from "./data/nether-king-ultimate-affixes-ss13.js";
import { legendarySlateSlotTypesSs14 } from "./data/slates/legendary-slate-slot-types-ss14.js";
import { BANISHMENT_EFFECTS, AUTHORITY_TEXTS } from "./nether-king-authority.js";
import { netherKingLineNote } from "./nether-king-migration.js";
import { pedigreeCoreAffixesSs13 } from "./data/pedigree-core-affixes-ss13.js";
import { PEDIGREE_OF_GODS, pedigreeSlotTypes, normalizePedigreeAffixes } from "./pedigree-slots.js";
import { selenaScorchingBeamGearSs13 } from "./data/gear/selena-scorching-beam-ss13.js";
import { equipmentSlots, craftItemTypes, voraxItemTypes } from "./data/gear/crafting-catalog-ss13.js";
import { rareBaseItemsSs13 } from "./data/gear/rare-base-items-ss13.generated.js";
import { isLegacyRareBase, rareBaseById, rareBaseByName, rareBaseForItem } from "./rare-base-lookup.js";
import { baseAffixesSs13, baseAffixTiersSs13 } from "./data/gear/base-affixes-ss13.generated.js";
import { voraxBaseAffixSlotPool } from "./vorax-base-affixes.js";
import { craftAffixesSs13 } from "./data/gear/craft-affixes-ss13.generated.js";
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";
import { legendaryCorrodedModifiersSs13 } from "./data/gear/legendary-corroded-modifiers-ss13.generated.js";
import { baseTypesForSlot, corrosionImplicitsForBase, defaultBaseForItem } from "./data/gear/corrosion-implicits-ss13.js";
import { beltBlendById, beltBlendOptions } from "./belt-blend-options.js";
import { towerSequencesSs13 } from "./data/gear/tower-sequences-ss13.generated.js";
import { towerSequenceOptionMarkup } from "./tower-sequence-options.js";
import { voraxCraftingSs13 } from "./data/gear/vorax-crafting-ss13.generated.js";
import { selenaScorchingBeamPactsSs13 } from "./data/pacts/selena-scorching-beam-ss13.js";
import { pactspiritCatalogSs13 } from "./data/pacts/pactspirit-catalog-ss13.js";
import { orderedPactspiritNodes, pactspiritEffectsAtLevel, pactspiritLevel, togglePactNodeChain } from "./pactspirit-levels.js";
import { etherealPrismBases, inverseImageEffectMultiplier, inverseImageReflectedCoordinates, inverseImageReflectionMap, inverseImageReflectedBounds, inverseImageTalentNodes, inverseImageRoll, inverseImageRolls, prismAffixes, prismBaseEffect, prismReplacesCore, prismSupportsLegendaryAffix, prismLegendaryAffixesForBase, prismArea, prismAreaBounds, prismNodeAffixes, prismRareAffixesForBase } from "./prism-crafting.js";
import { etherealPrismIcons } from "./prism-icons.js";
import { switchHeroLoadout } from "./hero-loadouts.js";
import { equippedKismetSummary } from "./pact-kismet-summary.js";
import { resolvePactLimits, pactNodeAllocationBlock, kismetInstallBlock } from "./pact-limits.js";
import { fateExtraSlots, fateSlotChoice, fateSlotChoices } from "./fate-slot-unlocks.js";
import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { kismetAffixesWithRolls, kismetKindForRing, kismetRollControls, kismetSlotKey, normalizeKismetRolls } from "./kismet-crafting.js";
import { transferKismetSlot } from "./kismet-slot-transfer.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { activeCapturedPactspirits, selectPactspirit, sortPactspirits } from "./pactspirit-selection.js";
import { selenaScorchingBeamSlatesSs13 } from "./data/slates/selena-scorching-beam-ss13.js";
import { selenaCompleteSkillLoadoutSs13 } from "./data/skills/selena-complete-skill-loadout-ss13.js";
import { activationMediumAffixLines, activationMediumLineConfigs, activationMediumSelectedLines, activationMediumSecondaryTierData, configurableSupportTierData, defaultConfigurableSupportConfig, normalizeProgressionSupportConfig, progressionRangeLabels, progressionSupportHasStars, progressionSupportTierData, progressionSupportText, specialSupportStarBonus, specialSupportTierData } from "./data/skills/special-support-tiers-ss13.js";
import { selenaScorchingBeamObservedSnapshots } from "./data/stats/selena-scorching-beam-observed-snapshots.js";
import { tliArt } from "./data/assets/tli-art.js";
import { tlidbSkillCatalogSs13, tlidbSupportCatalogSs13, tlidbEquipmentCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { heroCatalogSs13, heroById } from "./data/heroes/hero-catalog-ss13.js";
import { allHeroTraitsSs13 } from "./data/heroes/all-hero-traits-ss13.generated.js";
import { sageElixirsSs13 } from "./data/heroes/sage-scent-ss13.generated.js";
import { sageScentIngredientsSs13 } from "./data/heroes/sage-scent-options-ss13.js";
import { heroMemoryAffixesSs13 } from "./data/heroes/hero-memory-affixes-ss13.js";
import { heroMemoryTierAffixesSs13 } from "./data/heroes/hero-memory-tiers-ss13.js";
import { heroMemoryFixedT0AffixesSs13 } from "./data/heroes/hero-memory-fixed-t0-ss13.js";
import { regularRevivedAffixesSs13, regularRevivedAffixNamesSs13, lunarPhaseRevivedAffixesSs13, normalizeRevivedAffix, revivedAffixForMemoryType, revivedAffixTiers, revivedAffixRollRange, equippedBaseTraitSlot, memoryFitsBaseTraitSlot } from "./data/heroes/memory-revival-ss13.js";
import { lunarPhaseRevivedAffixDetailsSs13 } from "./data/heroes/memory-revival-details-ss13.js";
import { baseTraitDescriptionForLevel, withoutArtificialMoonLines, baseTraitLevelForMemory, slotTraitLevel, nonBaseTraitLevelExtras, artificialMoonGate, clampMemoryEnhancement, closestMemoryTier, memoryBaseStatLabel, memoryScaledBaseStat, memoryMaxEnhancementForRarity, memoryTierNumericValue, traitLevelBonusForEnhancement, reduceBaseTraitMemoryStat } from "./hero-memory-rules.js";
import { MAX_TALENT_POINTS, TALENT_THRESHOLDS, allocateTalentToMaxWithPrerequisites, allocateTalentWithPrerequisites, canAllocateTalent, pruneInvalidTalentRanks, removeTalentWithDependents, talentEffectText, talentPointTotals } from "./talent-rules.js";
import { godTalentTreesSs13, talentFamiliesSs13, talentOptionsForSlot } from "./talent-selection-rules.js";
import { SLATE_BOARD_ROWS, adjacentSlateIds, autoPlaceSlates, canPlaceSlate, isCopySlate, slateOffsets, slateSize, slateTransformRules } from "./slate-board.js";
import { downloadBackup, isSafeMode, setSafeMode } from "./recovery-core.js";
import { restoreLatestRevision } from "./planner-state.js";
import { selectorBaseLevel } from "./skill-level-input.js";
import { clearPlannerState, createBuild, defaultPlannerState, deleteAllBuilds, deleteBuild, duplicateActiveBuild, encodePlannerState, importBuildCode, libraryLoadIssues, loadBuildLibrary, loadPlannerState, plannerLibraryStorageKey, plannerStorageStatus, reconcileExternalLibraryChange, restoreBuildsFromBackup, savePlannerState, setActiveBuild, openBuildChangedElsewhere, dismissOpenBuildChange, markPlannerStateClean, startNewLibrary, updateActiveBuildMetadata } from "./planner-state.js";
import { carinoSpecialAmmoOptions } from "./carino-special-ammo.js";
import { importReportText, importSnapshot, listSnapshots, loadGameIdMap, readGameLogFile } from "./game-log-import.js";
import { gameLogAutoSnapshots, gameLogBuildName, gameLogFileStatusMarkup, gameLogFoundMarkup, gameLogListFailedMarkup, gameLogSnapshotListMarkup, gameLogSummaryMarkup } from "./game-log-import-view.js";
import { heroTraitTree, heroTreeRules, heroTreeSelections, heroTreeCapacity, treeRowLevelKey, TREE_ROW_LEVELS, EXTRA_PICK_LEVEL, treeBoardLayout } from "./hero-trait-tree.js";
import { treeExtraRowMarkup, treeExtraRowTooltipHtml, EXTRA_ROW_NOTE } from "./hero-trait-tree-markup.js";
import { heroTraitLevelBonus } from "./character-stats.js";
import { normalizeSunsEmbraceItem } from "./suns-embrace-normalization.js";
import { legendaryModifierSignature, reconcileLegendaryModifiers } from "./legendary-modifier-signature.js";
import { applyLegendaryEditorEdits, editableLegendarySlots, legendaryEditorModel, legendarySourceForItem, legendaryTierForText, rollValuesFromText } from "./legendary-editor-model.js";
import { legendaryLineTiers, legendaryTierTemplate } from "./legendary-affix-tiers.js";
import { allPlaceholderTemplates, keywordRollParts, placeholderOption, placeholderOptionForText, placeholderOptionTemplate, placeholderPool } from "./legendary-placeholder-pools.js";
import { itemCardRarity } from "./graft-legendaries.js";
import { upgradeLegacyCapturedCorrosion } from "./legacy-corrosion-migration.js";
import { corrosionEditorChoice, corrosionPoolForItem } from "./corrosion-implicit-options.js";

function upgradeExistingCorrodedItems(state) {
  const capturedById=new Map(selenaScorchingBeamGearSs13.items.map((item)=>[`captured-${item.slot}`,item]));
  const upgrade=(item)=>{
    if(!item)return item;
    if(item.name==="Sun's Embrace")return normalizeSunsEmbraceItem(item);
    const captured=capturedById.get(item.sourceInventoryId)||selenaScorchingBeamGearSs13.items.find((entry)=>entry.name===item.name);
    // Only a legacy copy that still holds the captured corrosion line in its modifiers (src/legacy-corrosion-migration.js).
    upgradeLegacyCapturedCorrosion(item,captured);
    const legendarySource=legendaryGearSs13.find((entry)=>entry.name.toLowerCase()===(item.name||"").replace(/ - Priceless$/i,"").toLowerCase());
    if(legendarySource&&item.legendaryModifiers?.length){
      const knownLegendarySignatures=legendaryKnownModifierSignatures(legendarySource);
      reconcileLegendaryModifiers(item,knownLegendarySignatures);
    }
    return item;
  };
  (state.equipmentInventory||[]).forEach(upgrade);
  Object.values(state.equipmentOverrides||{}).forEach(upgrade);
  for(const override of Object.values(state.equipmentOverrides||{})){
    const source=(state.equipmentInventory||[]).find((item)=>item.id===override.sourceInventoryId);
    if(source?.rarity&&!override.rarity)override.rarity=source.rarity;
  }
}

for (const entry of tlidbSkillCatalogSs13) tliArt.skills[entry.name] ||= entry.icon;
for (const entry of tlidbSupportCatalogSs13) tliArt.supports[entry.name] ||= entry.icon;

let build = structuredClone(sampleBuild);
// Safe mode (Recovery screen): the planner opens on the Builds page and never runs build calculations until resumed.
const calculationsPaused = (() => { try { return isSafeMode(sessionStorage); } catch { return false; } })();
let plannerState = loadPlannerState();
upgradeExistingCorrodedItems(plannerState);
let activeTalentPanel = "Goddess of Deception";
let activeTalentSlot = 0;
let activeWorkspaceView = "talents";
let activeStatsPanel = "sheet";
let selectedDamagePath = "hit";
let selectedStatSheetSkill = "Scorching Beam";
const workspaceLocationKey = "tli-builder:workspace-location:v1";
function readWorkspaceLocation(){
  try{return JSON.parse(sessionStorage.getItem(workspaceLocationKey)||"null");}catch{return null;}
}
function saveWorkspaceLocation(){
  try{sessionStorage.setItem(workspaceLocationKey,JSON.stringify({view:activeWorkspaceView==="talents"&&talentSlateMode?"slates":activeWorkspaceView,panel:activeTalentPanel,statsPanel:activeStatsPanel,damagePath:selectedDamagePath,statSheetSkill:selectedStatSheetSkill,scrollY:window.scrollY}));}catch{}
}
let activePrismTreeSlot = 1;
let prismDraft = null;
let prismEditingId = null;
let pendingPrismPlacement = null;
let prismDrag = null;
let suppressPrismClick = false;
let skillDrag = null;
let suppressSkillClick = false;
let supportDrag = null;
let suppressSupportClick = false;
let suppressSupportContextMenu = false;
let kismetDrag = null;
let suppressKismetClick = false;
let suppressKismetContextMenu = false;
let gearDrag = null;
let suppressGearClick = false;
let selenaDanceDrag = null; // trait-tree drag (every tree hero: src/hero-trait-tree.js)
let suppressSelenaDanceClick = false;
// Config tab "Best-case assumptions" section: collapsed by default, kept open across re-renders once the user opens it.
let bestCaseAssumptionsOpen = false;
let configSectionOpen = { scenario: true, choices: true, manual: false, advanced: false };
// Condition ids an exclusive choice can pin (src/planner.js exclusiveConditionGroups).
const exclusiveChoiceConditionIds = ["blur", "blurRecentlyEnded", "moving", "nearTarget", "lowLifeAssumed", "lowManaAssumed"];
let activeCoreThreshold = 12;
let selectedTalentCoordinate = "4,0";
let selectedEquipmentSlot = "helmet";
let equipmentCraftMode = "rare";
let selectedLegendaryIndex = -1;
let selectedLegendaryBase = "";
let selectedLegendaryBeltBlendId = "";
let selectedLegendaryTowerSequenceId = "";
let selectedCorrosionIndex = -1;
let selectedLegendaryCorrodedModifiers = new Set();
let selectedFolkloreRingOption = "left";
// Chosen rolls of "<Random …>" placeholder lines (catalog index -> pool option id; src/legendary-placeholder-pools.js).
let selectedLegendaryPlaceholderChoices = new Map();
// Chosen tiers of tiered legendary lines (catalog index -> tier; src/legendary-affix-tiers.js). Unset = the best tier.
let selectedLegendaryTierChoices = new Map();
let equipmentSearch = "";
let selectedInventoryItemId = null;
let selectedPactspiritSlot = 0;
let activeKismetSlot = null;
let selectedKismetName = "";
let selectedKismetRolls = [];
let inventoryItemEditing = false;
let editingCraftItemId = null;
let selectedVoraxBaseName = "";
let editingCorrodedModifierIndices = new Set();
let editingFolkloreRingOption = "left";
let editingPlaceholderChoices = new Map();
let editingTierChoices = new Map();
let editingLegendaryTexts = new Map();
// The inventory editor's Corrosion Implicit (corrosion base affix): "" none, "pool:<index>" a line of the item base's pool at
// `percent` of its range, "current" the saved lines the pool does not hold; `lines` is what Save writes.
let editingCorrosionImplicit = { value:"", percent:100, lines:[] };
let selectedSlateId = null;
let slateEditMode = false;
let slatePlacementTarget = null;
let slateDrag = null;
let parkedSlates = {};
let suppressSlateClick = false;
let slateToolsPosition = null;
let slateMenuLastWheelAt = 0;
let slatePendingDrop = null;
let talentSlateMode = false;
let activeSlateCrafterTab = "craft";
let selectedSlateGod = "Goddess of Deception";
let selectedNetherSlateType = "Judgment";
let selectedLegendarySlateName = "";
let editingCraftedSlateId = null;
let selectedSkillIndex = 0;
let selectorKind = "skill";
let selectorQuery = "";
let heroSelectorQuery = "";
let activeHeroDetailTab = "traits";
let followerSelectorQuery = "";
let sageScentSelectorKind = "elixir";
let sageScentQuery = "";
let activeCarinoAmmoSlot = 0;
let carinoAmmoQuery = "";
let activeHeroTraitSupportId = "";
let activeHeroMemoryTier = "";
let memoryDraft = null;
let editingMemoryId = null;
let selectorChoiceIndex = -1;
let selectorLevel = 20;
let selectorSpecialConfig = null;
let activeSkillBoardTab = "skills";
let selectorTargetRow = 0;
let selectorTargetSupportSlot = null;
let selectorTargetSetupName = null;
const capturedTalentPanels = new Map(selenaScorchingBeamTalentSetupSs13.panels.map((panel) => [panel.name,panel]));
const professionTreeLayoutsAllSs13 = Object.fromEntries(Object.entries(allProfessionTalentCatalogueSs13).map(([name,panel]) => [name,{ nodes:panel.nodes, edges:panel.edges.filter(([x1,y1,x2,y2]) => Math.abs(x1-x2)<=1 && Math.abs(y1-y2)<=1) }]));
const allTalentPanelsSs13 = Object.values(allProfessionTalentCatalogueSs13).map((panel) => ({
  ...panel,
  ...(capturedTalentPanels.get(panel.name) || {}),
  coreTalents:panel.coreTalents,
  allocatedNodes:capturedTalentPanels.get(panel.name)?.allocatedNodes || []
}));
const equippedSlateIds = new Set(plannerState.equippedSlateIds || selenaScorchingBeamSlatesSs13.slates.map((slate) => slate.id));
const slateGodKey=(name)=>({"Goddess of Deception":"deception","Goddess of Hunting":"hunting","Goddess of Knowledge":"knowledge","God of Machines":"machines","God of Might":"might","God of War":"war"}[name]||"deception");
const slateGameCaptureByName={"Fallen Starlight":"./src/assets/tli/slates/game-captures/fallen-starlight.webp","A Corner of Divinity":"./src/assets/tli/slates/game-captures/corner-of-divinity.webp","Pedigree of Gods":"./src/assets/tli/slates/game-captures/pedigree-of-gods.webp","Sparks of Moth Fire":"./src/assets/tli/slates/game-captures/sparks-of-moth-fire.webp","When Sparks Set the Prairie Ablaze":"./src/assets/tli/slates/game-captures/prairie-ablaze.webp","Space Rift":"./src/assets/tli/slates/game-captures/space-rift.svg","Residence of Stars":"./src/assets/tli/slates/game-captures/residence-of-stars.svg","Nether King's Divinity: Judgment":"./src/assets/tli/slates/game-captures/nether-king-judgment.png","Nether King's Divinity: Contamination":"./src/assets/tli/slates/game-captures/nether-kings-contamination.svg","Nether King's Divinity: Offspring":"./src/assets/tli/slates/game-captures/nether-king-offspring.svg"};
const sparksOfMothFireCopyRules=[
  "Copies the last Talent on the adjacent slate above to this slate. Unable to copy the Core Talent.",
  "Copies the last Talent on the adjacent slate on the left to this slate. Unable to copy the Core Talent.",
  "Copies the last Talent on the adjacent slate below this slate. Unable to copy the Core Talents.",
  "Copies the last Talent on the adjacent slate on the right to this slate. Unable to copy the Core Talent."
];
const sparksOfMothFireDirections=["↑ Above","← Left","↓ Below","→ Right"];
const residenceOfStarsCopyRule="Copies the Medium Talents on the adjacent slate to this slate. Unable to copy Legendary Medium Talents.";
const prairieAblazeCopyRule="Copies the last Talent on all adjacent slates. Unable to copy Core Talents.";
const spaceRiftCopyRules=[
  "Copies the Medium Talents, Legendary Medium Talents, and Ultimate Nether King Talents on the adjacent slate on the left to this slate",
  "Copies the Medium Talents, Legendary Medium Talents, and Ultimate Nether King Talents on the adjacent slate on the right to this slate"
];
const allGodSlateTalentTypes=["Micro Talent","Medium Talent","Legendary Medium Talent"];
// The game's slot types (src/data/slates/legendary-slate-slot-types-ss14.js; slates audit 2026-10-22, user-approved).
const legendaryTalentSlotTypes={"Fallen Starlight":legendarySlateSlotTypesSs14["Fallen Starlight"],"A Corner of Divinity":legendarySlateSlotTypesSs14["A Corner of Divinity"],[PEDIGREE_OF_GODS]:pedigreeSlotTypes};
const allDivinitySlateAffixes=Object.entries(divinitySlateAffixesSs13).flatMap(([god,affixes])=>affixes.map((affix)=>({...affix,god})));
const slateAffixFamilyClass=(tree)=>{const god=Object.entries(divinitySlateTreeFamiliesSs13).find(([,trees])=>trees.includes(tree))?.[0];return god?`talent-family-${god.toLowerCase().replaceAll(" ","-")}`:"";};
const slateGodFamilyClass=(god)=>divinitySlateTreeFamiliesSs13[god]?`talent-family-${god.toLowerCase().replaceAll(" ","-")}`:"";
// A slate affix line as HTML: the tree prefix in its god colour (as coloredSlateAffix) and the rest through modifierTextMarkup,
// so a core talent named on its own ("Daze"), a named affix or an inline keyword takes the keyword style and Alt expands it.
const slateAffixMarkup=(affix,lineStatus=null)=>{const colon=affix.indexOf(": "),family=colon<0?"":slateAffixFamilyClass(affix.slice(0,colon));return family?`<b class="slate-affix-tree ${family}">${escapeHtml(affix.slice(0,colon))}</b>: ${modifierTextMarkup(affix.slice(colon+2),lineStatus)}`:modifierTextMarkup(affix,lineStatus);};
const coloredSlateAffix=(affix)=>{const colon=affix.indexOf(": ");if(colon<0)return escapeHtml(affix);const tree=affix.slice(0,colon),family=slateAffixFamilyClass(tree);return family?`<b class="slate-affix-tree ${family}">${escapeHtml(tree)}</b>${escapeHtml(affix.slice(colon))}`:escapeHtml(affix);};
const netherKingFixedPool=netherKingFixedAffixesSs13.map((affix)=>({...affix,tree:"Nether King",god:"Nether King"}));
const netherKingUltimatePool=netherKingUltimateAffixesSs13.map((affix)=>({...affix,tree:"Nether King",god:"Nether King"}));
// SS14 patch notes: a Nether King's Divinity's base (fixed) affixes are Micro / Medium / Legendary Medium / Ultimate nodes, so the
// Ultimate nodes are offered in the fixed slots as well as the Brand slots (slates audit 2026-10-22, user-approved).
const netherKingBasePool=[...netherKingFixedPool,...netherKingUltimatePool];
const netherKingBrandPool=[...allDivinitySlateAffixes,...netherKingFixedPool,...netherKingUltimatePool];
const godSlateCaptureByKey={hunting:"goddess-of-hunting",knowledge:"goddess-of-knowledge",machines:"god-of-machines",might:"god-of-might",war:"god-of-war"};
const godSlateShapeCapture=(god,shape)=>`./src/assets/tli/slates/game-captures/${god}-${shape}.png`;
const godSlateCapturedShapes={
  deception:[null,[[0,0],[0,1],[1,1],[2,1]],[[0,0],[1,0],[0,1],[1,1]],[[1,0],[0,1],[1,1],[2,1]]],
  hunting:[null,[[1,0],[1,1],[0,2],[1,2]],[[0,0],[1,0],[0,1],[1,1]],[[0,0],[0,1],[1,1],[0,2]]],
  knowledge:[null,[[0,0],[1,0],[0,1],[0,2]],[[0,0],[1,0],[0,1],[1,1]],[[1,0],[0,1],[1,1],[2,1]]],
  machines:[null,[[0,0],[1,0],[0,1],[0,2]],[[0,0],[1,0],[0,1],[1,1]],[[1,0],[0,1],[1,1],[2,1]]],
  might:[null,[[0,0],[1,0],[2,0],[2,1]],[[0,0],[1,0],[0,1],[1,1]],[[1,0],[0,1],[1,1],[2,1]]],
  war:[null,[[0,0],[1,0],[2,0],[2,1]],[[0,0],[1,0],[0,1],[1,1]],[[1,0],[0,1],[1,1],[1,2]]]
};
const craftedSlateIcon=(slate)=>{
  const template=slate.template||slate.name;
  if(String(slate.shape).endsWith("-0")&&godSlateCaptureByKey[slateGodKey(slate.god)])return `./src/assets/tli/slates/game-captures/${godSlateCaptureByKey[slateGodKey(slate.god)]}.svg`;
  if(legendarySlateShapes[template]&&slateGameCaptureByName[template])return slateGameCaptureByName[template];
  const shapeIndex=Number(String(slate.shape).match(/-(1|2|3)$/)?.[1]);
  if(shapeIndex&&slate.icon?.includes("/slates/gods/"))return godSlateShapeCapture(slateGodKey(slate.god),slateShapeCodes[shapeIndex]);
  return slateGameCaptureByName[template]||slate.icon;
};
const legendarySlateShapes={"Fallen Starlight":[[0,0],[0,1]],"Space Rift":[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],"A Corner of Divinity":[[0,0],[1,0],[1,1]],"Residence of Stars":[[2,0],[0,1],[1,1],[2,1],[1,2],[2,2],[3,2],[1,3]],"Pedigree of Gods":[[0,0],[1,0],[0,1],[1,1],[2,1],[1,2],[2,2]],"Sparks of Moth Fire":[[0,0]],"When Sparks Set the Prairie Ablaze":[[0,0]],"Nether King's Divinity: Judgment":[[0,0],[3,0],[3,3]],"Nether King's Divinity: Contamination":[[0,0],[0,1]],"Nether King's Divinity: Offspring":[[2,0],[1,1],[0,2]]};
const craftedSlateShape=(shape,name,god)=>{ if(legendarySlateShapes[name])return legendarySlateShapes[name]; const index=Number(String(shape).match(/-(\d+)$/)?.[1]); if(Number.isInteger(index))return godSlateCapturedShapes[slateGodKey(god)]?.[index]||(slateGodKey(god)==="deception"?[[0,0],[1,0],[1,1],[2,1]]:[[1,0],[2,0],[0,1],[1,1]]); return {corner:[[0,0],[0,1],[1,1]],line:[[0,0],[0,1]],tee:[[0,0],[1,0],[1,1]],single:[[0,0]]}[shape]||[[0,0]]; };
const craftedSlateForBoard=(slate)=>({ ...slate, icon:craftedSlateIcon(slate), shape:craftedSlateShape(slate.shape,slate.template||slate.name,slate.god), fixed:(slate.affixes||[]).filter(Boolean), level:100 });
const slatesForBoard = () => [...selenaScorchingBeamSlatesSs13.slates,...(plannerState.slates?.inventory||[]).map(craftedSlateForBoard)];
function parkSlateBesideGrid(slate, rotation=0, flipX=1, flipY=1) {
  const stage=document.querySelector("#slate-board .slate-stage"),board=stage?.querySelector(".divinity-board");
  if(!stage||!board)return false;
  const stageRect=stage.getBoundingClientRect(),boardRect=board.getBoundingClientRect(),cell=boardRect.width/6;
  const [columns,rows]=slateSize(slate,rotation,flipX,flipY),width=columns*cell,height=rows*cell;
  const blocked=[{x:boardRect.left-stageRect.left,y:boardRect.top-stageRect.top,width:boardRect.width,height:boardRect.height}];
  for(const [id,position] of Object.entries(parkedSlates)) {
    if(id===slate.id)continue;
    const other=slatesForBoard().find((item)=>item.id===id);
    if(!other)continue;
    const [otherColumns,otherRows]=slateSize(other,position.rotation||0,position.flipX||1,position.flipY||1);
    blocked.push({x:position.x/100*stageRect.width,y:position.y/100*stageRect.height,width:otherColumns*cell,height:otherRows*cell});
  }
  for(let y=8;y+height<=stageRect.height;y+=12)for(let x=8;x+width<=stageRect.width;x+=12){
    if(blocked.some((rect)=>x<rect.x+rect.width+8&&x+width+8>rect.x&&y<rect.y+rect.height+8&&y+height+8>rect.y))continue;
    parkedSlates={...parkedSlates,[slate.id]:{x:Math.round(x/stageRect.width*10000)/100,y:Math.round(y/stageRect.height*10000)/100,rotation,flipX,flipY}};
    return true;
  }
  if(stageRect.height<10000){
    stage.style.minHeight=`${Math.ceil(stageRect.height+height+24)}px`;
    if(stage.getBoundingClientRect().height>stageRect.height)return parkSlateBesideGrid(slate,rotation,flipX,flipY);
  }
  return false;
}
const validSlatePlacements = (placements) => placements && slatesForBoard().filter((slate)=>equippedSlateIds.has(slate.id)).every((slate)=>placements[slate.id] && canPlaceSlate(slate,placements[slate.id],placements,slatesForBoard()));
let slatePlacements = plannerState.slates?.geometryVersion===4 && validSlatePlacements(plannerState.slates?.placements) ? plannerState.slates.placements : structuredClone(selenaScorchingBeamSlatesSs13.capturedPlacements);
parkedSlates = plannerState.slates?.parked || {};
const disabledEquipmentSlots = new Set(plannerState.disabledEquipmentSlots);
const disabledSupportNames = new Set(plannerState.disabledSupportNames);
const talentRanks = new Map();
for (const panel of selenaScorchingBeamTalentSetupSs13.panels.filter((panel) => plannerState.talents.useCapturedRanks !== false && plannerState.talents.selectedTrees.includes(panel.name))) {
  for (const node of panel.allocatedNodes) {
    const key = `${panel.name}:${node.coordinate}`;
    talentRanks.set(key, plannerState.talentRanks[key] ?? node.rank);
  }
}
for (const [key,rank] of Object.entries(plannerState.talentRanks || {})) if (!talentRanks.has(key)) talentRanks.set(key,rank);
for (const [panel,coordinate] of Object.entries(plannerState.talents.installedPrismNodes || {})) if(plannerState.talents.installedPrisms?.[panel]) talentRanks.set(`${panel}:${coordinate}`,0);
const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const format = (value) => number.format(value);
const artwork = (src, alt, className = "game-art") => src ? `<span class="art-frame ${className}"><img src="${src}" alt="${escapeHtml(alt)}"><span aria-hidden="true">◆</span></span>` : `<span class="art-frame ${className}" aria-label="${escapeHtml(alt)}"><span aria-hidden="true">◆</span></span>`;

let searchableSelectTarget=null, searchableSelectMatches=[];
const fullTextTitle=(text)=>text?` title="${escapeHtml(text)}"`:"";
const slateAffixSelectPools=new WeakMap();
function slateAffixChoice(affix,fallbackGod,legendary=false){
  const {tree,name,effect,god,talentName,maxDivinityEffect}=affix;
  const details=`${name}: ${legendary&&talentName?`${talentName} — `:""}${effect}`;
  return {value:`${tree}: ${details}`,textContent:`${tree} · ${name} — ${legendary&&talentName?`${talentName}: `:""}${effect}`,dataset:{affixTree:tree,affixDetails:details,affixFamily:(god||fallbackGod).toLowerCase().replaceAll(" ","-"),maxDivinityEffect:maxDivinityEffect===1?"1":""}};
}
function setSlateAffixPool(select,items,fallbackGod,legendary=false){
  slateAffixSelectPools.set(select,items.map((item)=>slateAffixChoice(item,fallbackGod,legendary)));
}
function closeSearchableSelect(){ $("#select-search-popover")?.remove(); searchableSelectTarget=null; searchableSelectMatches=[]; }
function searchableOptions(select,query=""){
  const needle=query.trim().toLowerCase();
  const pool=slateAffixSelectPools.get(select);
  if(pool){
    const choices=pool.map((option,index)=>({option:{...option,selected:select.value===option.value},index:index+1,label:option.textContent,group:""})).filter(({label})=>!needle||label.toLowerCase().includes(needle)).slice(0,99);
    return needle?choices:[{option:select.options[0],index:0,label:select.options[0].textContent.trim(),group:""},...choices];
  }
  return [...select.options].map((option,index)=>({option,index,label:option.textContent.trim(),group:option.parentElement?.tagName==="OPTGROUP"?option.parentElement.label:""})).filter(({option,label,group})=>!option.disabled&&(!needle||`${label} ${group} ${option.dataset.revivedDescription||""} ${option.dataset.optionDescription||""} ${option.dataset.optionMeta||""}`.toLowerCase().includes(needle)));
}
function renderSearchableSelectResults(query=""){
  const results=$("#select-search-results"); if(!results||!searchableSelectTarget)return;
  searchableSelectMatches=searchableOptions(searchableSelectTarget,query);
  results.innerHTML=searchableSelectMatches.length?searchableSelectMatches.map(({option,index,label,group},resultIndex)=>`<button type="button" class="select-search-result ${option.selected?"selected":""} ${option.dataset.maxDivinityEffect==="1"?"max-one-divinity":""}" data-select-search-index="${index}" data-select-search-result="${resultIndex}"${fullTextTitle([label,option.dataset.revivedDescription||option.dataset.optionDescription,option.dataset.optionMeta].filter(Boolean).join(" — "))}>${group?`<small>${escapeHtml(group)}</small>`:""}${option.dataset.affixTree?`<div class="select-affix-row"><span class="select-affix-tag talent-family-${escapeHtml(option.dataset.affixFamily)}">${escapeHtml(option.dataset.affixTree)}</span><span class="select-affix-details">${escapeHtml(option.dataset.affixDetails)}</span>${option.dataset.maxDivinityEffect==="1"?'<strong class="max-divinity-badge" title="Only one copy of this effect is active across equipped slates">MAX ACTIVE: 1</strong>':""}</div>`:option.dataset.revivedDescription?`<strong class="select-revived-name">${escapeHtml(label)}</strong><span class="select-revived-description">${escapeHtml(option.dataset.revivedDescription)}</span>`:option.dataset.optionDescription||option.dataset.optionMeta?`<strong class="select-option-name">${escapeHtml(label)}</strong>${option.dataset.optionDescription?`<span class="select-option-description">${escapeHtml(option.dataset.optionDescription)}</span>`:""}${option.dataset.optionMeta?`<small class="select-option-meta">${escapeHtml(option.dataset.optionMeta)}</small>`:""}`:`<span>${escapeHtml(label)}</span>`}</button>`).join(""):'<p>No matching options</p>';
}
function openSearchableSelect(select,initialQuery=""){
  closeSearchableSelect(); searchableSelectTarget=select;
  const revivedAffix=select.matches('[data-memory-field="revivedAffix"]');
  const rect=select.getBoundingClientRect(), dialog=select.closest("dialog"), dialogRect=dialog?.getBoundingClientRect(), footerRect=dialog?.querySelector(":scope > footer")?.getBoundingClientRect(), popover=document.createElement("div"); popover.id="select-search-popover"; popover.className=`select-search-popover${revivedAffix?" revived-affix-picker":""}`;
  const boundaryTop=Math.max(8,(dialogRect?.top||0)+8), boundaryBottom=Math.min(window.innerHeight-8,footerRect?.top||dialogRect?.bottom||window.innerHeight-8), desiredHeight=revivedAffix?430:356, spaceBelow=boundaryBottom-rect.bottom-4, spaceAbove=rect.top-boundaryTop-4, openAbove=spaceBelow<desiredHeight&&spaceAbove>spaceBelow, availableHeight=Math.max(150,Math.min(desiredHeight,openAbove?spaceAbove:spaceBelow));
  popover.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-Math.max(288,rect.width)-8))}px`; popover.style.top=`${openAbove?Math.max(boundaryTop,rect.top-availableHeight-4):rect.bottom+4}px`; popover.style.width=`${Math.max(280,rect.width)}px`; popover.style.maxHeight=`${availableHeight}px`;
  popover.innerHTML=revivedAffix
    ? `<div class="revived-picker-heading"><strong>Select Revived Affix</strong><button type="button" data-close-select-search aria-label="Close revived affix selector">×</button></div><label class="revived-picker-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search revived affixes" placeholder="Search revived affixes…" value="${escapeHtml(initialQuery)}"></label><div id="select-search-results"></div>`
    : `<input type="search" aria-label="Search options" placeholder="Type to search…" value="${escapeHtml(initialQuery)}"><div id="select-search-results"></div>`;
  const popoverHost=select.closest("dialog")||document.body; popoverHost.append(popover);
  if(typeof popover.showPopover==="function"){ popover.setAttribute("popover","manual"); popover.showPopover(); }
  renderSearchableSelectResults(initialQuery); const input=popover.querySelector("input"), results=popover.querySelector("#select-search-results"); results.style.maxHeight=`${Math.max(70,availableHeight-(revivedAffix?112:58))}px`; input.focus(); input.setSelectionRange(input.value.length,input.value.length);
}
function chooseSearchableOption(index){
  if(!searchableSelectTarget)return;
  const choice=slateAffixSelectPools.get(searchableSelectTarget)?.[Number(index)-1];
  if(choice){
    searchableSelectTarget.querySelector("[data-selected-affix]")?.remove();
    const option=new Option(choice.textContent,choice.value,true,true);
    option.dataset.selectedAffix="";Object.assign(option.dataset,choice.dataset);
    searchableSelectTarget.add(option);
  }else searchableSelectTarget.selectedIndex=Number(index);
  searchableSelectTarget.dispatchEvent(new Event("input",{bubbles:true})); searchableSelectTarget.dispatchEvent(new Event("change",{bubbles:true})); closeSearchableSelect();
}

function capturePlannerState() {
  return {
    schemaVersion: 1,
    disabledEquipmentSlots: [...disabledEquipmentSlots],
    disabledSupportNames: [...disabledSupportNames],
    removedInventoryItemIds: plannerState.removedInventoryItemIds || [],
    equipmentOverrides: plannerState.equipmentOverrides,
    equipmentInventory: plannerState.equipmentInventory,
    hero: plannerState.hero,
    skills: plannerState.skills,
    equippedSlateIds: [...equippedSlateIds],
    slates: { geometryVersion: 4, placements: slatePlacements, parked: parkedSlates, affixOverrides: plannerState.slates?.affixOverrides || {}, inventory: plannerState.slates?.inventory || [] },
    talentRanks: Object.fromEntries(talentRanks),
    talents: plannerState.talents,
    combat: plannerState.combat,
    followers: plannerState.followers,
    pacts: plannerState.pacts
  };
}

let pendingCandidateRender = false;
let renderPassPlanner = null;

function persistPlannerState() {
  plannerState = capturePlannerState();
  upgradeExistingCorrodedItems(plannerState);
  savePlannerState(plannerState);
  // This tab's save replaced another tab's version (last save wins): the notice is out of date.
  if (document.getElementById("other-tab-notice") && !openBuildChangedElsewhere()) hideOtherTabNotice();
  updateStorageStatus();
  renderPassPlanner = null;
  if (!pendingCandidateRender) {
    pendingCandidateRender = true;
    queueMicrotask(() => {
      if (!pendingCandidateRender) return;
      pendingCandidateRender = false;
      renderCandidateViews();
    });
  }
}

function startActiveBuildRename(tab) {
  if (!tab || tab.classList.contains("renaming")) return;
  const library=loadBuildLibrary(),active=library.builds.find((build)=>build.id===library.activeBuildId);
  if (!active) return;
  const input=document.createElement("input");
  input.type="text"; input.className="loadout-tab-rename"; input.value=active.name; input.setAttribute("aria-label","Build name");
  let finished=false;
  const finish=(save)=>{
    if(finished)return; finished=true;
    const name=save?resolveBuildRename(input.value,active.name):null;
    tab.classList.remove("renaming"); input.remove();
    if(name){ updateActiveBuildMetadata({ name }); renderBuilds(); showToast("Build renamed"); }
    else updateStorageStatus();
    tab.focus({preventScroll:true});
  };
  input.addEventListener("keydown",(event)=>{ event.stopPropagation(); if(event.key==="Enter"){event.preventDefault();finish(true);} else if(event.key==="Escape"){event.preventDefault();finish(false);} });
  input.addEventListener("blur",()=>finish(true));
  input.addEventListener("contextmenu",(event)=>event.stopPropagation());
  tab.classList.add("renaming"); tab.querySelector("strong").after(input);
  input.focus(); input.select();
}

function updateStorageStatus() {
  const status = document.querySelector(".loadout-status");
  if (!status) return;
  const library=loadBuildLibrary(),active=library.builds.find((build)=>build.id===library.activeBuildId);
  const tab=document.querySelector(".loadout-tab");
  if(tab){tab.querySelector("span").textContent=active?"Active build":"No active build";tab.querySelector("strong").textContent=active?.name||"Start a new build";if(active)tab.title="Right-click to rename";else tab.removeAttribute("title");}
  const unsaved = plannerStorageStatus() === "unsaved";
  status.classList.toggle("storage-warning", unsaved);
  status.classList.toggle("no-build",!active);
  status.querySelector("span").textContent = unsaved ? (libraryLoadIssues().unreadable ? "Saved builds unreadable — changes not saved" : "Storage full — changes not saved. Export your build.") : active?"Autosaved locally":"No build saved";
}

const cachedPlanner = createPlannerCache((state) => { if (calculationsPaused) throw new Error("Safe mode: calculations paused"); return calculatePlanner(state); });
function currentPlanner() { const planner = renderPassPlanner || cachedPlanner(capturePlannerState()); setCoverageContext(planner); return planner; }
// Curse limit (user-confirmed 2026-10-19: slots go in skill bar order, then gear, then pacts). Every curse applies (user decision
// 2026-10-21): the skill bar curses and triggered curse lines past the limit keep the red outline with the warning "Over the
// curse limit (N/M slots: …): counted anyway"; a trigger duplicating a curse already applied is not applied (user decision
// 2026-10-19) and keeps "Not applied: <reason>". The helpers return the whole message.
function curseLimitState(){ try { return curseSlotSummary(currentPlanner()); } catch { return null; } }
function curseSkillOverLimit(name){ const state=curseLimitState(); return Boolean(name&&state?.overLimit.some((curse)=>curse.kind==="skill"&&curse.name===name)); }
const curseLineKey=(text)=>String(text??"").replace(/(\d)\s+%/g,"$1%").replace(/\s+/g," ").trim().toLowerCase();
function curseLinesLeftOut(){ const curses=currentPlanner()?.mechanics?.curses; return [...(curses?.notApplied||[]).map((curse)=>({...curse,message:`Not applied: ${curse.reason}`})),...(curses?.overLimitCurses||[]).map((curse)=>({...curse,message:curse.warning}))]; }
// An inventory copy carries its base slot ("ring"); the equipped slot it sits in is the one the curse records.
const curseOnItem=(curse,item)=>item?curse.origin==="gear"&&(curse.slot===item.slot||curse.slot===equippedSlotForInventoryItem(item))&&curse.source===item.name:curse.origin!=="gear";
function curseLineLeftOutReason(text,item=null){ const key=curseLineKey(text); if(!key)return ""; const hit=curseLinesLeftOut().find((curse)=>curseOnItem(curse,item)&&key.includes(curseLineKey(curse.text))); return hit?.message||""; }
function curseItemOffReason(item){ if(!item)return ""; const hit=curseLinesLeftOut().find((curse)=>curseOnItem(curse,item)); return hit?.message||""; }
function curseBadge(status,text){ const reason=curseLineLeftOutReason(text); return coverageBadge(status,reason?`${status}: ${reason}`:""); }
function curseOffBadge(message=""){ const label=escapeHtml(message); return `<em class="curse-off-badge" title="${label}" aria-label="${label}">${/^Over the curse limit/.test(message)?"OVER LIMIT":"CURSE OFF"}</em>`; }
function curseLimitNoteHtml(message){ return message?`<p class="curse-limit-note">${escapeHtml(message)}</p>`:""; }
// Manual Config mode: the same build in automatic mode tells which conditions have a source (src/configuration-panel.js).
const sourceProbeCache = createPlannerCache((state) => { if (calculationsPaused) throw new Error("Safe mode: calculations paused"); return calculatePlanner(state); });
function conditionSourceProbe() { const state = capturePlannerState(); return sourceProbeCache({ ...state, combat: { ...state.combat, conditionMode: "auto", conditions: {}, bestCaseOverrides: {} } }); }
function currentTalentSlateImpact() { return currentPlanner().talentSlate; }
function currentPactImpact() { return currentPlanner().pact; }
function currentEquipmentImpact() { return currentPlanner().equipment; }
const supportStateKey = (setupName, supportName) => `${setupName}:${supportName}`;
const setupStateKey = (setup) => typeof setup === "string" ? setup : setup?.setupKey || setup?.instanceId || setup?.name;
function currentEditedSetups() { return currentPlanner().activation.setups; }
function currentSkillActivation() { return currentPlanner().activation; }
function skillLevelLabel(skill) {
  const added = Number(skill.addedLevels) || 0;
  return `Lv.${skill.baseLevel}${added ? ` <span class="skill-level-bonus ${added < 0 ? "negative" : ""}">${added > 0 ? "+" : ""}${added}</span>` : ""}`;
}
function skillLevelDamageBonus(skill) {
  return leveledSkillDamage(skill).additionalPercent;
}
function currentAuraLedger() { return currentPlanner().aura; }
function currentIgniteLimit() { return currentPlanner().igniteLimit; }
function currentSourceDamageMultiplier() { return currentPlanner().sourceDamageMultiplier; }
function refreshPactCandidate() { persistPlannerState(); renderCandidateViews(); }

function emptyPlannerState(){
  const empty=structuredClone(defaultPlannerState);
  empty.disabledEquipmentSlots=equipmentSlots.map(([slot])=>slot);
  empty.removedInventoryItemIds=selenaScorchingBeamGearSs13.items.map((item)=>`captured-${item.slot}`);
  empty.equipmentOverrides={}; empty.equipmentInventory=[];
  empty.hero={ selectedHeroId:"", selectedTraits:{}, memories:{}, memoryTraitLevels:{}, memoryInventory:[], equippedMemoryIds:{}, baseTraitMemoryId:"", baseTraitMemoryRoll:null, sageScent:{elixir:"",damage:"",defense:"",functional:""}, carinoSpecialAmmoSupports:["","",""], heroTraitSupports:{}, heroTraitSupportLevels:{}, heroTraitSupportConfigs:{}, treeTraits:{}, heroLoadouts:{} };
  empty.skills={ setupOrder:[], boardSlots:{skills:[],auras:[]}, supportOrder:{}, setupEnabled:Object.fromEntries(selenaCompleteSkillLoadoutSs13.setups.map((setup)=>[setup.name,false])), skillLevels:{}, supportEnabled:{}, supportLevels:{}, specialSupportConfigs:{}, customSupports:{}, customSetups:[] };
  empty.equippedSlateIds=[]; empty.slates={geometryVersion:4,placements:{},affixOverrides:{}};
  empty.talentRanks={}; empty.talents={useCapturedRanks:false,selectedTrees:["","","",""],coreSelections:{},prismInventory:[],installedPrisms:{},installedPrismNodes:{}};
  empty.pacts={ activeSpirits:Object.fromEntries(selenaScorchingBeamPactsSs13.pactspirits.map((spirit)=>[spirit.name,false])), selectedSpirits:["","",""], spiritLevels:{}, nativeNodeQuantities:{}, kismetSlots:{}, fateUnlocks:{}, kismetSlotMode:true, volcanoEnabled:[false,false,false,false], reapingDurationQuantity:0, spellBlockEnabled:[false], attackBlockEnabled:[false,false] };
  empty.combat={...empty.combat,conditions:{...Object.fromEntries(Object.keys(empty.combat.conditions).map((key)=>[key,false])),targetLife:true,prebuiltSelfBuffs:true}};
  return empty;
}

function applyPlannerState(next) {
  upgradeExistingCorrodedItems(next);
  plannerState = next;
  activeTalentSlot=0;
  activeTalentPanel=next.talents?.selectedTrees?.[0] || "Goddess of Deception";
  disabledEquipmentSlots.clear(); next.disabledEquipmentSlots.forEach((value) => disabledEquipmentSlots.add(value));
  disabledSupportNames.clear(); next.disabledSupportNames.forEach((value) => disabledSupportNames.add(value));
  for (const setup of selenaCompleteSkillLoadoutSs13.setups) for (const support of setup.supports) if (next.skills.supportEnabled[supportStateKey(setup.name,support.name)] === false) disabledSupportNames.add(support.name);
  equippedSlateIds.clear(); (next.equippedSlateIds || selenaScorchingBeamSlatesSs13.slates.map((slate) => slate.id)).forEach((value) => equippedSlateIds.add(value));
  slatePlacements = next.slates?.geometryVersion===4 && validSlatePlacements(next.slates?.placements) ? next.slates.placements : structuredClone(selenaScorchingBeamSlatesSs13.capturedPlacements);
  parkedSlates = next.slates?.parked || {};
  talentRanks.clear();
  for (const panel of selenaScorchingBeamTalentSetupSs13.panels.filter((panel) => next.talents.useCapturedRanks !== false && next.talents.selectedTrees.includes(panel.name))) for (const node of panel.allocatedNodes) talentRanks.set(panel.name + ":" + node.coordinate, node.rank);
  for (const [key, value] of Object.entries(next.talentRanks || {})) talentRanks.set(key, value);
  for (const [panel,coordinate] of Object.entries(next.talents.installedPrismNodes || {})) if(next.talents.installedPrisms?.[panel]) talentRanks.set(`${panel}:${coordinate}`,0);
  markLoadedStateClean();
  persistPlannerState();
}
// A freshly loaded build (loadPlannerState) differs from its stored copy only by
// load-time repairs (upgradeExistingCorrodedItems, derived talent ranks...).
// That is not an edit: planner-state.js skips saves equal to this state, so a
// tab without user edits never writes (and never triggers other tabs' notice).
function markLoadedStateClean(){
  try{const state=capturePlannerState();upgradeExistingCorrodedItems(state);markPlannerStateClean(state);}catch{}
}

function renderBuilds() {
  const library = loadBuildLibrary();
  updateStorageStatus();
  const active = library.builds.find((entry) => entry.id === library.activeBuildId);
  $("#build-count").textContent = library.builds.length;
  $("[data-duplicate-build]").disabled=!active;
  $("[data-delete-all-builds]").disabled=!library.builds.length;
  $("#build-list").innerHTML=library.builds.length?library.builds.map((entry)=>{
    const hero=heroById(entry.state.hero?.selectedHeroId);
    const selected=entry.id===active?.id;
    return `<article class="build-list-card ${selected?"active":""}"><button class="build-open" type="button" data-activate-build="${escapeHtml(entry.id)}" aria-label="Select ${escapeHtml(entry.name)}">${hero?.image?`<img class="build-hero-art" src="${escapeHtml(hero.image)}" alt="">`:'<span class="build-hero-art fallback">✦</span>'}<span class="build-card-copy"><small>${selected?"ACTIVE BUILD":"SAVED BUILD"}</small><strong>${escapeHtml(entry.name)}</strong><em>${escapeHtml(hero?.name||"No hero selected")} · Updated ${escapeHtml(new Date(entry.updatedAt).toLocaleDateString())}</em></span></button><div class="build-card-actions"><button class="build-edit" type="button" data-edit-build="${escapeHtml(entry.id)}" aria-label="Edit ${escapeHtml(entry.name)}">Edit</button><button class="build-delete" type="button" data-delete-build="${escapeHtml(entry.id)}" aria-label="Delete ${escapeHtml(entry.name)}">Delete</button></div></article>`;
  }).join(""):`<div class="build-empty-state"><span class="build-empty-icon" aria-hidden="true">✦</span><h3>No saved builds</h3><p>Start a new build to plan a hero, talents, gear, and pacts.</p><button class="button" type="button" data-new-build>+ New Build</button></div>`;
  if(!active){
    $("#build-editor").innerHTML='<div class="build-details-empty"><span aria-hidden="true">◇</span><h3>Nothing selected</h3><p>Your next build will appear here with its notes and recent autosaves.</p></div>';
    return;
  }
  const hero=heroById(active.state.hero?.selectedHeroId);
  $("#build-editor").innerHTML=`<div class="build-active-summary">${hero?.image?`<img src="${escapeHtml(hero.image)}" alt="">`:'<span aria-hidden="true">✦</span>'}<div><small>CURRENTLY OPEN</small><strong>${escapeHtml(active.name)}</strong><em>${escapeHtml(hero?.name||"No hero selected")}</em></div></div><label>Build name<input data-build-name></label><label>Notes<textarea data-build-notes rows="3" placeholder="What are you testing in this build?"></textarea></label><div class="build-editor-actions"><button class="button" type="button" data-save-build-meta>Save details</button></div>`;
  $("[data-build-name]").value=active.name;
  $("[data-build-notes]").value=active.notes;
}

function render() {
  const planner = currentPlanner();
  const baselineSnapshot = selenaScorchingBeamObservedSnapshots[0];
  const noGlovesSnapshot = selenaScorchingBeamObservedSnapshots[1];
  const noMainHandSnapshot = selenaScorchingBeamObservedSnapshots[2];
  const noSecondaryHandSnapshot = selenaScorchingBeamObservedSnapshots[3];
  const noAdditionalIgniteSnapshot = selenaScorchingBeamObservedSnapshots[4];
  const noControlSpellSnapshot = selenaScorchingBeamObservedSnapshots[5];
  const noGuardSnapshot = selenaScorchingBeamObservedSnapshots[6];
  const noRefractedPrismSnapshot = selenaScorchingBeamObservedSnapshots[7];
  const glovesDisabled = disabledEquipmentSlots.has("gloves");
  const mainHandDisabled = disabledEquipmentSlots.has("mainHand");
  const secondaryHandDisabled = disabledEquipmentSlots.has("secondaryHand");
  const additionalIgniteDisabled = disabledSupportNames.has("Additional Ignite");
  const controlSpellDisabled = disabledSupportNames.has("Control Spell");
  const guardDisabled = disabledSupportNames.has("Guard");
  const refractedPrismDisabled = disabledSupportNames.has("Refracted Prism");
  const snapshot = additionalIgniteDisabled ? noAdditionalIgniteSnapshot : controlSpellDisabled ? noControlSpellSnapshot : guardDisabled ? noGuardSnapshot : refractedPrismDisabled ? noRefractedPrismSnapshot : glovesDisabled ? noGlovesSnapshot : mainHandDisabled ? noMainHandSnapshot : secondaryHandDisabled ? noSecondaryHandSnapshot : baselineSnapshot;
  const result = calculateSelenaTownBaseline(snapshot, noGlovesSnapshot);
  $("#build-name").textContent = "Selena · Sing with the Tide";
  const comparisonLabel = additionalIgniteDisabled ? "Additional Ignite unlinked" : controlSpellDisabled ? "Control Spell unlinked" : guardDisabled ? "Guard unlinked" : refractedPrismDisabled ? "Refracted Prism unlinked" : glovesDisabled ? "Torturer's Touch disabled" : mainHandDisabled ? "Main-hand Dark Gaze disabled" : secondaryHandDisabled ? "Secondary-hand Dark Gaze disabled" : "";
  $("#build-meta").textContent = `Level ${snapshot.level} · SS13 · ${comparisonLabel ? `Comparison: ${comparisonLabel}` : "Unbuffed town baseline"}`;
  $("#skill-name").textContent = "Scorching Beam";
  const combinedSourceMultiplier = planner.sourceDamageMultiplier;
  $("#full-dps").textContent = format(result.ignite.calculatedDps * combinedSourceMultiplier);
  $("#average-hit").textContent = format(result.spell.calculatedDps);
  $("#life").textContent = format(snapshot.damage.castsPerSecond);
  $("#armor").textContent = format(result.ignite.baseIgniteDamage);
  const sourceChanged = Math.abs(combinedSourceMultiplier - 1) > 0.000001;
  $("#conditions").innerHTML = `<div class="baseline-state"><strong>No combat buffs</strong><small>Confirmed standing in town</small></div><div class="baseline-state"><strong>${comparisonLabel || sourceChanged ? "Candidate changes active" : "Observed target locked"}</strong><small>${comparisonLabel || (sourceChanged ? `Candidate source multiplier ×${format(combinedSourceMultiplier)}` : "Baseline equipment equipped")}</small></div>`;
  const trace = comparisonLabel ? [
    { label:"Controlled equipment state", formula:comparisonLabel, value:snapshot.damage.spellDps, confidence:"measured" },
    { label:"Observed Ignite DPS", formula:"captured town comparison", value:snapshot.damage.igniteDps, confidence:"measured" },
    { label:"Observed Base Ignite", formula:"captured character stat", value:snapshot.buffsAndMechanics.baseIgniteDamage, confidence:"observed" },
    { label:"Observed Affliction rate", formula:"captured character stat", value:snapshot.buffsAndMechanics.afflictionPerSecond, confidence:"observed" }
  ] : result.trace;
  $("#damage-trace").innerHTML = `<li><strong>Historical capture audit — not the edited candidate</strong><small>Candidate estimates are in Character and Configuration.</small></li>` + trace.map((step, index) => `<li class="trace-${step.confidence}"><span class="trace-index">${index + 1}</span><div><strong>${step.label}</strong><small>${step.formula}</small><em>${step.confidence}</em></div><output>${format(step.value)}</output></li>`).join("");
  const modifierTotals = aggregateNormalizedModifiers(collectNormalizedGearModifiers(planner.equipment.candidateItems, [...disabledEquipmentSlots]));
  const inputs = [
    ["Equipment ledger", "Aura Effect", "Captured", `${modifierTotals["auraEffectPercent:increased"] || 0}%`],
    ["Equipment ledger", "Affliction per second", "Captured", modifierTotals["afflictionPerSecond:flat"] || 0],
    ["Character stats", "Cast rate", "Observed", `${snapshot.damage.castsPerSecond}/s`],
    ["Character stats", "Damage Bonus", "Observed", `${snapshot.damage.damageBonusPercent}%`],
    ["Character stats", "Additional Damage Bonus", "Observed", `${snapshot.damage.additionalDamageBonusPercent}%`],
    ["Character stats", "Additional Fire Damage", "Observed", `${snapshot.damage.additionalFireDamageBonusPercent}%`],
    ["Character stats", "Affliction per second", "Observed", snapshot.buffsAndMechanics.afflictionPerSecond],
    ["Character stats", "Reaping Duration", "Observed", `${snapshot.buffsAndMechanics.reapingDurationBonusPercent}%`],
    ["Scorching Beam", "Max-stack explosion", "Modeled", `×${result.spell.explosionContributionFactor}`],
    ["Ignite", "Maximum active stacks", "Modeled", result.ignite.igniteLimit],
    ["Ignite", "Affliction-derived factor", "Modeled", `×${result.ignite.afflictionDamageFactor}`],
    ["Additional Ignite", `${result.ignite.igniteLimit} active stacks × ${result.ignite.additionalIgnitePerStackPercent}% (cap ${result.ignite.additionalIgniteCapPercent}%)`, "Modeled", `×${result.ignite.additionalIgniteSupportFactor}`],
    ["Engine", "Remaining display/order residual", "Calibration", `×${result.ignite.remainingDisplayAndOrderResidual}`]
  ];
  $("#modifier-count").textContent = `${inputs.length} inputs`;
  $("#modifier-table").innerHTML = inputs.map(([source,stat,type,value]) => `<tr><td>${source}</td><td>${stat}</td><td>${type}</td><td>${value}</td><td><span class="status ${["Observed","Captured"].includes(type) ? "active" : type === "Calibration" ? "calibration" : "modeled"}">${["Observed","Captured"].includes(type) ? "Exact" : type === "Calibration" ? "Unresolved" : "Derived"}</span></td></tr>`).join("");
}

document.addEventListener("change", (event) => {
  // Follower skill tier and support affixes (src/follower-panel.js followerSkillEditorMarkup, 2026-10-19 user request): the picker's
  // preview card edits the highlighted skill's draft (followerSelectorDraft); Confirm saves it, Cancel drops it.
  if(event.target.matches("#skill-selector [data-follower-draft-tier]")){ followerSelectorDraft=followerDraftWithTier(plannerState,followerSelectorSlot,followerSelectorDraft,event.target.value); renderSkillSelector(); return; }
  if(event.target.matches("#skill-selector [data-follower-draft-affix]")){ followerSelectorDraft=followerDraftWithAffix(plannerState,followerSelectorSlot,followerSelectorDraft,Number(event.target.dataset.followerDraftAffix),event.target.value?Number(event.target.value):null); renderSkillSelector(); return; }
  if(event.target.matches("#skill-selector [data-follower-draft-roll]")){ const [affixSlot,k]=event.target.dataset.followerDraftRoll.split(":").map(Number), current=followerSelectorDraft?.affixes?.[affixSlot]; if(current){ const rolls=[...(current.rolls||[])]; rolls[k]=Number(event.target.value); followerSelectorDraft=followerDraftWithAffix(plannerState,followerSelectorSlot,followerSelectorDraft,affixSlot,current.id,rolls); renderSkillSelector(); } return; }
  if(event.target.matches("[data-affix-roll-number]")){
    const number=event.target, range=number.closest(".affix-roll-inputs")?.querySelector('input[type="range"]');
    if(range){ const typed=Number(number.value), fallback=Number(range.value), value=Math.min(Number(number.max),Math.max(Number(number.min),Number.isFinite(typed)?typed:fallback)); number.value=String(value); range.value=String(value); range.dispatchEvent(new Event("input",{bubbles:true})); }
    return;
  }
  if (event.target.checkValidity && !event.target.checkValidity()) { event.target.reportValidity(); return; }
  
  if (event.target.matches("[data-condition]")) {
    build.conditions[event.target.dataset.condition].enabled = event.target.checked;
    render();
  }
  if (event.target.id === "enemy-level") build.enemy.level = Number(event.target.value);
});

// A build that cannot be calculated must not stop the planner from loading: show
// the error and offer the previous saved version or safe mode (recovery-core.js).
function showCalculationFailure(error) {
  console.error(error);
  document.querySelector(".calculation-failure")?.remove();
  const message = escapeHtml(error?.message || String(error));
  document.querySelector("main")?.insertAdjacentHTML("afterbegin", `<div class="notice safe-mode-banner calculation-failure" role="alert"><span>This build couldn't be calculated: ${message}</span><span class="library-notice-actions"><button class="button" type="button" data-calculation-undo>Undo last change</button><button class="button button-secondary" type="button" data-calculation-safe-mode>Open safe mode</button></span></div>`);
  const notice = document.querySelector(".calculation-failure");
  notice?.querySelector("[data-calculation-undo]")?.addEventListener("click", () => {
    let restored;
    try {
      const library = loadBuildLibrary(), active = library.builds.find((build) => build.id === library.activeBuildId);
      if (!active?.revisions?.length) { showToast("No earlier version of this build is saved"); return; }
      restored = restoreLatestRevision();
    } catch (failure) { showToast(toastText(failure?.message || "The earlier version could not be restored")); return; }
    applyPlannerState(restored);
    pendingCandidateRender = false;
    renderCandidateViews();
    if (!document.querySelector(".calculation-failure")) showToast("Last change undone");
  });
  notice?.querySelector("[data-calculation-safe-mode]")?.addEventListener("click", () => { setSafeMode(sessionStorage, true); location.reload(); });
}
function clearCalculationFailure() { document.querySelector(".calculation-failure")?.remove(); }
// Only a full successful renderCandidateViews() clears the notice.
function runGuardedRender(renderStep) {
  try { renderStep(); return true; }
  catch (error) { showCalculationFailure(error); return false; }
}

function renderCandidateViews() {
  if (calculationsPaused) { pendingCandidateRender = false; renderBuilds(); return; }
  pendingCandidateRender = false;
  try {
    renderPassPlanner = cachedPlanner(capturePlannerState());
    render();
    if (focusedViews.has(activeWorkspaceView)) {
      if (activeWorkspaceView === "character") renderCharacter();
      if (activeWorkspaceView === "configuration") renderConfiguration();
      if (activeWorkspaceView === "builds") renderBuilds();
    } else {
      renderEquipment(); renderSkills(); renderSlates(); renderTalents(); renderPacts();
    }
    clearCalculationFailure();
  }
  catch (error) { showCalculationFailure(error); }
  finally { renderPassPlanner = null; }
}

const plannerSectionViews = new Set(["talents", "skills", "equipment", "pacts"]);
const focusedViews = new Set(["builds", "character", "configuration"]);
function activateWorkspaceView(viewName, { scroll = true, remember = true } = {}) {
  if(calculationsPaused)viewName="builds";
  if(!loadBuildLibrary().builds.length)viewName="builds";
  activeWorkspaceView=viewName;
  const focused = focusedViews.has(viewName);
  document.body.classList.toggle("unified-planner", !focused);
  document.body.classList.toggle("builds-workspace", viewName==="builds");
  document.body.classList.toggle("stats-workspace", viewName==="character");
  document.body.classList.toggle("config-workspace", viewName==="configuration");
  document.querySelectorAll(".app-view").forEach((view) => {
    const name = view.id.replace("-view", "");
    view.hidden = focused ? name !== viewName : !plannerSectionViews.has(name);
  });
  document.querySelectorAll(".view-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === (focused ? viewName : (viewName === "overview" ? "overview" : viewName))));
  if (focused) {
    if (viewName === "builds") renderBuilds();
    if (viewName === "character") renderCharacter();
    if (viewName === "configuration") renderConfiguration();
  } else {
    renderTalents(); renderSkills(); renderEquipment(); renderPacts(); renderSlates();
    if (scroll && viewName !== "overview") requestAnimationFrame(() => document.querySelector("#" + viewName + "-view")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (!scroll || viewName === "overview") window.scrollTo({ top: 0, behavior: scroll ? "smooth" : "auto" });
  }
  if(remember)saveWorkspaceLocation();
}

$("#reset-build").addEventListener("click", () => $("#reset-build-confirm").showModal());
$("[data-cancel-reset-build]").addEventListener("click", () => $("#reset-build-confirm").close());
$("[data-confirm-reset-build]").addEventListener("click", () => {
  $("#reset-build-confirm").close();
  const empty=emptyPlannerState();
  applyPlannerState(empty); selectedSkillIndex = 0; persistPlannerState(); renderCandidateViews(); showToast("Build reset to empty");
});
$("#export-build").addEventListener("click", async () => {
  persistPlannerState();
  try {
    await navigator.clipboard.writeText(encodePlannerState(plannerState));
    showToast("Build code copied to clipboard");
  } catch { showToast("Clipboard access was unavailable"); }
});
// Import accepts the Export code and the compact "TLB3:" and "TLB2:" codes (src/build-code-compact.js), which expand to the former.
async function importBuildText(text) {
  const code = await expandBuildCode(text);
  persistPlannerState();
  const imported=importBuildCode(code);
  applyPlannerState(loadPlannerState());
  renderCandidateViews();
  $("#import-build-dialog").close();
  activateWorkspaceView("builds",{scroll:false});
  showToast(`${toastText(imported.name)} imported and active`);
}
$("#import-build").addEventListener("click", () => $("#import-build-dialog").showModal());
$("[data-cancel-import-build]").addEventListener("click", () => $("#import-build-dialog").close());
$("[data-import-build-code]").addEventListener("click", () => {
  importBuildText($("#import-build-code").value).catch(() => showToast("That build code could not be read"));
});
// Import from game. On open the planner asks its local reader for UE_game.log (scripts/serve.js
// /api/game-log/snapshots, or the desktop bridge); both return only sanitised build dumps (src/game-log-local.js).
// Without it, or when the user asks, the picked log is read in the page. Everything is dropped with the dialog, and an
// import always adds a new library entry.
let gameLogSources=new Map(), gameLogRows=[], gameLogImport=null, gameLogReadToken=0;
const gameLogLocalServer=()=>/^https?:$/.test(location.protocol)&&["localhost","127.0.0.1","[::1]"].includes(location.hostname);
const autoGameLogUnavailable=()=>gameLogLocalServer()||typeof window.tliDesktop?.gameLogSnapshots==="function"
  ?"Automatic lookup needs the planner's local server (node scripts/serve.js) or the desktop app."
  :"Choose your UE_game.log.";
function clearGameLogResults(){ gameLogSources=new Map(); gameLogRows=[]; gameLogImport=null; $("#import-game-log-snapshots").innerHTML=""; $("#import-game-log-summary").innerHTML=""; $("[data-import-game-log-build]").disabled=true; }
function showGameLogPicker(show){ document.querySelectorAll("#import-game-log-dialog .game-log-picker").forEach((node)=>{ node.hidden=!show; }); }
function resetGameLogImport(){ gameLogReadToken+=1; clearGameLogResults(); $("#import-game-log-file").value=""; $("#import-game-log-status").textContent=""; $("#import-game-log-found").hidden=true; $("#import-game-log-found").innerHTML=""; $("#import-game-log-auto-privacy").hidden=true; $("#import-game-log-dialog .game-log-choose").hidden=true; $("#import-game-log-reason").hidden=true; $("#import-game-log-reason").textContent=""; showGameLogPicker(false); }
async function requestGameLogSnapshots(){
  if(typeof window.tliDesktop?.gameLogSnapshots==="function") return window.tliDesktop.gameLogSnapshots();
  // Only the local server (node scripts/serve.js) has the reader; a static host (GitHub Pages) goes straight to the picker.
  if(!gameLogLocalServer()) return null;
  const response=await fetch("api/game-log/snapshots",{cache:"no-store",headers:{Accept:"application/json"}});
  if(!response.ok||!/json/.test(response.headers.get("content-type")||"")) return null;
  return response.json();
}
async function findGameLog(){
  const token=gameLogReadToken;
  $("#import-game-log-status").textContent="Looking for UE_game.log…";
  let result=null;
  try { result=await requestGameLogSnapshots(); } catch { result=null; }
  if(token!==gameLogReadToken) return;
  $("#import-game-log-status").textContent="";
  const auto=result?.found&&Array.isArray(result.files)?gameLogAutoSnapshots(result.files):null;
  if(!auto?.rows.length){
    showGameLogPicker(true);
    $("#import-game-log-reason").textContent=result&&result.found===false&&result.reason?result.reason:autoGameLogUnavailable();
    $("#import-game-log-reason").hidden=false;
    return;
  }
  gameLogSources=auto.sources; gameLogRows=auto.rows;
  $("#import-game-log-found").innerHTML=gameLogFoundMarkup(result.files[0]);
  $("#import-game-log-found").hidden=false; $("#import-game-log-auto-privacy").hidden=false;
  $("#import-game-log-dialog .game-log-choose").hidden=false;
  await selectGameLogSnapshot(gameLogRows[0].id);
}
async function selectGameLogSnapshot(id){
  const source=gameLogSources.get(id), token=gameLogReadToken; if(!source) return;
  $("#import-game-log-snapshots").innerHTML=gameLogSnapshotListMarkup(gameLogRows,id);
  try {
    const idMap=await loadGameIdMap();
    if(token!==gameLogReadToken) return;
    gameLogImport=importSnapshot(source.scan,source.dumpId,idMap);
    $("#import-game-log-status").textContent="";
    $("#import-game-log-summary").innerHTML=gameLogSummaryMarkup(gameLogImport.report);
    $("[data-import-game-log-build]").disabled=false;
  } catch { if(token!==gameLogReadToken) return; gameLogImport=null; $("#import-game-log-summary").innerHTML=""; $("[data-import-game-log-build]").disabled=true; $("#import-game-log-status").textContent="This snapshot could not be turned into a build."; }
}
$("#import-game-log").addEventListener("click", () => { resetGameLogImport(); $("#import-game-log-dialog").showModal(); findGameLog(); });
$("[data-cancel-import-game-log]").addEventListener("click", () => $("#import-game-log-dialog").close());
$("#import-game-log-dialog").addEventListener("close", resetGameLogImport);
$("[data-game-log-choose-file]").addEventListener("click", () => { $("#import-game-log-dialog .game-log-choose").hidden=true; showGameLogPicker(true); $("#import-game-log-file").focus(); });
$("#import-game-log-file").addEventListener("change", async (event) => {
  const file=event.target.files?.[0], token=++gameLogReadToken;
  clearGameLogResults();
  if(!file){ $("#import-game-log-status").textContent=""; return; }
  $("#import-game-log-found").hidden=true; $("#import-game-log-auto-privacy").hidden=true; $("#import-game-log-reason").hidden=true;
  $("#import-game-log-status").textContent="Reading the log…";
  // Read in this browser only (readGameLogFile never throws; its status says which problem it was); nothing is
  // uploaded or stored. A failure after a good read (id map, listing) is the planner's, not the file's.
  const idMapPromise=loadGameIdMap(); idMapPromise.catch(()=>{});
  const read=await readGameLogFile(file);
  if(token!==gameLogReadToken) return;
  if(read.status!=="ok"){ $("#import-game-log-status").innerHTML=gameLogFileStatusMarkup(read,file.name); return; }
  try {
    const idMap=await idMapPromise, scan=read.scan;
    if(token!==gameLogReadToken) return;
    gameLogSources=new Map(scan.dumps.map((dump)=>[dump.id,{scan,dumpId:dump.id}]));
    gameLogRows=listSnapshots(scan,idMap).sort((a,b)=>(a.stamp<b.stamp?1:-1));
    $("#import-game-log-status").innerHTML=gameLogFileStatusMarkup(read,file.name);
    $("#import-game-log-snapshots").innerHTML=gameLogSnapshotListMarkup(gameLogRows);
  } catch(error) { if(token===gameLogReadToken){ clearGameLogResults(); $("#import-game-log-status").innerHTML=gameLogListFailedMarkup(error,file.name); } }
});
$("#import-game-log-snapshots").addEventListener("click", (event) => {
  const choice=event.target.closest("[data-game-log-snapshot]"); if(!choice) return;
  selectGameLogSnapshot(choice.dataset.gameLogSnapshot);
});
$("[data-import-game-log-build]").addEventListener("click", () => {
  if(!gameLogImport) return;
  persistPlannerState();
  const {state,report}=gameLogImport;
  const imported=createBuild({ name:gameLogBuildName(heroById(state.hero.selectedHeroId)?.name,report.source?.stamp), notes:importReportText(report), state, activate:true });
  applyPlannerState(loadPlannerState()); selectedSkillIndex=0;
  renderCandidateViews();
  $("#import-game-log-dialog").close();
  activateWorkspaceView("builds",{scroll:false});
  showToast(`${imported.name} imported and active`);
});
let toastTimer;
// The toast is plain text (textContent): messages carry names as they are, never HTML-escaped (an escaped name showed
// "Vendetta&#39;s Sting"; fixed 2026-10-21). toastText keeps escapeHtml's percentage spacing and null handling, without the entities.
const toastText = (value) => normalizePercentageText(value);
function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2200);
}

if(!calculationsPaused)runGuardedRender(render);

const effectLabels = {
  afflictionPerSecond: "Affliction per second", damageOverTimePercent: "Damage over time", movementSpeedPercent: "Movement speed",
  skillAreaPercent: "Skill area", skillEffectDurationPercent: "Skill effect duration", damagePercent: "Damage",
  maxEnergyShieldPercent: "Maximum energy shield", energyShieldChargeSpeedPercent: "Energy shield charge speed",
  reapingRecoverySpeedPercent: "Reaping recovery speed", focusBlessingStacksOnReap: "Focus Blessing stacks on Reap",
  afflictionEffectPercent: "Affliction effect", enemyAllResistanceAtMaxAfflictionPercent: "Enemy all resistance at max Affliction",
  reapingDurationPercent: "Reaping duration", startsEnergyShieldChargeOnReap: "Starts energy shield charge on Reap",
  intervalSeconds: "Interval", chanceToGainBlurOnReapPercent: "Chance to gain Blur on Reap", maxLifePercent: "Maximum life",
  firePenetrationAgainstIgnitedPercent: "Fire penetration against Ignited enemies", inflictsFireInfiltrationAgainstIgnited: "Inflicts Fire Infiltration",
  igniteChanceAgainstNotIgnitedPercent: "Ignite chance against enemies not Ignited", igniteChancePercent: "Ignite chance",
  fireDamageOverTimePercent: "Fire damage over time", baseIgniteDamage: "Base Ignite damage", additionalIgniteStacks: "Additional Ignite stacks",
  attackAndCastSpeedPercent: "Attack and cast speed", allSkillLevels: "All skill levels", gainsBlurWhenEnergyShieldStartsCharging: "Gain Blur when shield starts charging",
  blurEffectPercent: "Blur effect", movementSpeedWhileBlurPercent: "Movement speed while Blur is active",
  movementSpeedCannotFallBelowBaseWhileBlur: "Movement speed cannot fall below base", sealedManaCompensationPercent: "Sealed mana compensation"
  ,blockRatioPercent: "Block Ratio"
};
const effectLabel = (key) => effectLabels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const formatEffect = (key, value) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key.endsWith("Percent")) return `${value > 0 ? "+" : ""}${value}%`;
  if (key.endsWith("Seconds")) return `${value} s`;
  return `${value > 0 ? "+" : ""}${value}`;
};
const nodeTitle = (node) => {
  if (node.replacedBy) return node.replacedBy;
  const effects = node.effectsPerRank || node.effects || {};
  return effectLabel(Object.keys(effects)[0] || "Talent node");
};
const nodeIcon = (node) => {
  const keys = Object.keys(node.effectsPerRank || node.effects || {});
  if (node.replacedBy) return "◆";
  if (keys.some((key) => /shield|life|defense/i.test(key))) return "⬡";
  if (keys.some((key) => /speed|duration|reaping/i.test(key))) return "⌛";
  if (keys.some((key) => /affliction|ignite|damage|fire/i.test(key))) return "✦";
  return "◇";
};

function currentTalentPanel() {
  return allTalentPanelsSs13.find((panel) => panel.name === activeTalentPanel);
}

function setTalentSlateMode(enabled) {
  talentSlateMode=enabled;
  const talentView=$("#talents-view"),talentLayout=talentView.querySelector(":scope > .talent-layout");
  const slateLayout=document.querySelector(".slate-layout");
  const treePanel=talentLayout.querySelector(".talent-tree-panel");
  if(enabled&&!talentView.classList.contains("showing-slates")){
    const height=Math.max(650,Math.ceil(talentLayout.getBoundingClientRect().height));
    talentLayout.style.setProperty("--slate-panel-height",`${height}px`);
  }
  talentView.classList.toggle("showing-slates",enabled);
  if(enabled){ treePanel.hidden=true; if(slateLayout.parentElement!==talentLayout) talentLayout.append(slateLayout); }
  else { talentLayout.style.removeProperty("--slate-panel-height"); treePanel.hidden=false; const slateView=$("#slates-view"); if(slateLayout.parentElement!==slateView) slateView.insertBefore(slateLayout,slateView.querySelector(".slate-audit")); }
}

function activeTalentLayouts() {
  const layouts={...professionTreeLayoutsAllSs13};
  for(const [name,id] of Object.entries(plannerState.talents.installedPrisms||{})) {
    const graph=layouts[name],coordinate=plannerState.talents.installedPrismNodes?.[name];
    const prism=(plannerState.talents.prismInventory||[]).find((item)=>item.id===id);
    if(!graph||!coordinate||prism?.type!=="inverse")continue;
    layouts[name]={...graph,nodes:inverseImageTalentNodes(graph.nodes,prism,coordinate)};
  }
  return layouts;
}

function talentDisplayNodes(panel = currentTalentPanel()) {
  const allocated = new Map(panel.allocatedNodes.map((node) => [node.coordinate.join(","), node]));
  const nodes=professionTreeLayoutsAllSs13[panel.name].nodes.map((layoutNode) => {
    const captured = allocated.get(layoutNode.coordinate.join(","));
    return captured ? { ...layoutNode, ...captured, captured: true } : { ...layoutNode, placeholder: true };
  });
  const prism=(plannerState.talents.prismInventory||[]).find((item)=>item.id===plannerState.talents.installedPrisms?.[panel.name]);
  const coordinate=plannerState.talents.installedPrismNodes?.[panel.name];
  return inverseImageTalentNodes(nodes,prism,coordinate);
}

function renderTalents() {
  renderHeroTraitTree();
  renderHeroPanel();
  const panels = allTalentPanelsSs13;
  const panel = currentTalentPanel();
  const displayNodes = talentDisplayNodes(panel);
  const rankFor = (node) => talentRanks.get(`${panel.name}:${node.coordinate}`) || 0;
  const rankObject = Object.fromEntries(talentRanks);
  const layouts=activeTalentLayouts();
  const pointTotals = talentPointTotals(layouts, rankObject);
  const panelPoints = pointTotals.panels[panel.name];
  const totalPoints = pointTotals.total;
  const installedPrism=(plannerState.talents.prismInventory||[]).find((item)=>item.id===plannerState.talents.installedPrisms?.[panel.name]);
  const hasInstalledPrism=Boolean(installedPrism);
  const installedPrismCoordinate=plannerState.talents.installedPrismNodes?.[panel.name];
  const placingPrism=pendingPrismPlacement?.panel===panel.name;
  const nativeTalentCoordinates=new Set(professionTreeLayoutsAllSs13[panel.name].nodes.map((node)=>node.coordinate.join(",")));
  $("#talent-total").textContent = `${totalPoints}/${MAX_TALENT_POINTS}`;
  $("#talent-total").classList.toggle("warning", totalPoints >= MAX_TALENT_POINTS);
  const noTreeSelected=!plannerState.talents.selectedTrees?.[activeTalentSlot]; $("#talent-board-name").textContent = noTreeSelected ? "" : panel.name;
  $("#talent-board-points").textContent = `${panelPoints} panel · ${totalPoints}/${MAX_TALENT_POINTS} total`;
  $("#talent-board-kind").textContent = hasInstalledPrism ? "Advanced panel · Prism override" : "Talent panel";
  const selectedTrees=plannerState.talents.selectedTrees;
  const activePanelSlot=selectedTrees.indexOf(panel.name);
  const prismButton=$("[data-install-prism]");
  if(prismButton) prismButton.hidden=activePanelSlot<=0;
  $("#prism-placement-prompt").hidden=!placingPrism;
  if(placingPrism)$("#prism-placement-name").textContent=prismName((plannerState.talents.prismInventory||[]).find((item)=>item.id===pendingPrismPlacement.id));
  const talentFamilyClass=(name)=>{ const family=godTalentTreesSs13.includes(name)?name:Object.entries(talentFamiliesSs13).find(([,trees])=>trees.includes(name))?.[0]; return family?`talent-family-${family.toLowerCase().replace(/[^a-z]+/g,"-").replace(/(^-|-$)/g,"")}`:""; };
  $(".talent-board-heading").className=`talent-board-heading ${noTreeSelected ? "" : talentFamilyClass(panel.name)}`;
  const slateGridIcon = `<span class="talent-slate-emblem" aria-hidden="true"><svg viewBox="0 0 64 64"><g>${[[24,4],[34,4],[14,14],[24,14],[34,14],[44,14],[4,24],[14,24],[24,24],[34,24],[44,24],[54,24],[4,34],[14,34],[24,34],[34,34],[44,34],[54,34],[14,44],[24,44],[34,44],[44,44],[24,54],[34,54]].map(([x,y])=>`<rect x="${x}" y="${y}" width="8" height="8" rx="1"/>`).join("")}</g></svg></span>`;
  $("#talent-board-tabs").innerHTML = `<p class="eyebrow"><span>Talent trees</span></p>${[0,1,2,3].map((slot) => { const name=selectedTrees[slot]; const item=allProfessionTalentCatalogueSs13[name]; const disabled=slot>0 && !selectedTrees[slot-1]; return `<button type="button" class="talent-tree-slot ${talentFamilyClass(name)} ${!talentSlateMode&&name===panel.name ? "active" : ""} ${!name ? "empty" : ""}" data-talent-slot="${slot}" ${disabled ? "disabled" : ""}>${name ? artwork(tliArt.talentPanels[name] || item?.emblem,name,"talent-panel-art") : '<span class="empty-tree-art">+</span>'}<span><small>${slot===0 ? "God tree" : slot===1 ? "Class tree" : `Tree ${slot+1}`}</small><strong>${name || (disabled ? "Select previous" : "Click to select")}</strong>${name ? `<em>${pointTotals.panels[name]} pts</em>` : ""}</span></button>`; }).join("")}<button type="button" class="talent-divinity-link ${talentSlateMode ? "active" : ""}" data-talent-slates>${slateGridIcon}<small>Divinity</small><strong>Slates</strong></button><div class="talent-slot-total"><small>Total points</small><strong>${totalPoints} / ${MAX_TALENT_POINTS}</strong></div>`;
  const pickerOptions = talentOptionsForSlot(activeTalentSlot,selectedTrees);
  $("#talent-picker-title").textContent = activeTalentSlot===0 ? "Select a God tree" : activeTalentSlot===1 ? `Select a ${selectedTrees[0] || "God"} class tree` : `Select talent tree ${activeTalentSlot+1}`;
  $("#talent-panel-picker-grid").innerHTML = pickerOptions.map((name) => { const item=allProfessionTalentCatalogueSs13[name]; return `<button type="button" class="talent-picker-card ${talentFamilyClass(name)} ${selectedTrees[activeTalentSlot]===name ? "selected" : ""} ${activeTalentSlot===0 ? "god-tree" : "class-tree"}" data-select-panel="${escapeHtml(name)}" aria-pressed="${selectedTrees[activeTalentSlot]===name}">${artwork(tliArt.talentPanels[name] || item.emblem,name,"talent-picker-art")}<span>${activeTalentSlot===0 ? "God tree" : "Class tree"}</span><strong>${escapeHtml(name)}</strong><small>${pointTotals.panels[name]} points</small></button>`; }).join("");

  const coreEntries=prismReplacesCore(installedPrism)?[{name:installedPrism.base,effects:{"Base affix":prismBaseEffect(installedPrism.type,installedPrism.base,installedPrism.legendaryAffix)},prism:true}]:panel.coreTalents;
  if (prismReplacesCore(installedPrism)) {
    const core=coreEntries[0]; const details=Object.values(core.effects || {}).join(" · ");
    $("#core-talents").innerHTML=`<article class="core-talent prism">${artwork(prismIcon(installedPrism),core.name,"core-art")}<div><span>Prism override</span><strong>${escapeHtml(core.name)}</strong><small>${escapeHtml(details)}</small></div></article>`;
  } else {
    const thresholds=[...new Set(coreEntries.map((core)=>core.unlockPoints))].sort((a,b)=>a-b);
    $("#core-talents").innerHTML=thresholds.map((threshold)=>{ const selectedName=plannerState.talents.coreSelections[`${panel.name}:${threshold}`]; const core=coreEntries.find((item)=>item.name===selectedName); const locked=panelPoints<threshold; return `<button type="button" class="core-talent core-selector ${core ? "selected" : ""} ${locked ? "locked" : ""}" data-core-slot="${threshold}">${core ? artwork(tliArt.coreTalents[core.name] || core.icon,core.name,"core-art") : '<span class="empty-core-art">+</span>'}<div><span>${threshold} point core${locked ? " · locked" : ""}</span><strong>${core?.name || "Select core talent"}</strong><small>${core?.description || "Choose one available core talent"}</small></div></button>`; }).join("");
    if (installedPrism?.type === "ethereal") $("#core-talents").insertAdjacentHTML("beforeend",`<article class="core-talent prism">${artwork(prismIcon(installedPrism),installedPrism.base,"core-art")}<div><span>Separate prism effect</span><strong>${escapeHtml(installedPrism.base)}</strong><small>${escapeHtml(prismBaseEffect(installedPrism.type,installedPrism.base,installedPrism.legendaryAffix))}</small></div></article>`);
  }

  const graph = layouts[panel.name];
  const trimConnection=([x1,y1,x2,y2])=>{
    const start={x:x1+.5,y:y1+.5}, end={x:x2+.5,y:y2+.5}, dx=end.x-start.x, dy=end.y-start.y;
    const distance=Math.sqrt((dx/.18)**2+(dy/.31)**2), inset=distance?1/distance:0;
    return {x1:start.x+dx*inset,y1:start.y+dy*inset,x2:end.x-dx*inset,y2:end.y-dy*inset};
  };
  const prerequisiteFreeCoordinates=inverseImageReflectedCoordinates(installedPrism,installedPrismCoordinate);
  const connections = '<svg class="talent-connections" viewBox="0 0 7 5" preserveAspectRatio="none" aria-hidden="true">' + graph.edges.filter(([x1,y1,x2,y2])=>!prerequisiteFreeCoordinates.has(`${x1},${y1}`)&&!prerequisiteFreeCoordinates.has(`${x2},${y2}`)).map((edge) => { const [x1,y1,x2,y2]=edge, trimmed=trimConnection(edge); const left = x1 <= x2 ? [x1,y1] : [x2,y2]; const right = x1 <= x2 ? [x2,y2] : [x1,y1]; const leftRank = (talentRanks.get(`${panel.name}:${left}`) || 0) || (hasInstalledPrism&&left.join(",")===installedPrismCoordinate); const rightRank = (talentRanks.get(`${panel.name}:${right}`) || 0) || (hasInstalledPrism&&right.join(",")===installedPrismCoordinate); const state = leftRank && rightRank ? "active" : leftRank ? "reachable" : "locked"; return '<line class="' + state + '" x1="' + trimmed.x1 + '" y1="' + trimmed.y1 + '" x2="' + trimmed.x2 + '" y2="' + trimmed.y2 + '"></line>'; }).join("") + "</svg>";
  const prismBounds=installedPrism&&installedPrismCoordinate?prismAreaBounds(installedPrism,installedPrismCoordinate):null;
  const reflectedBounds=inverseImageReflectedBounds(installedPrism,installedPrismCoordinate);
  const prismAreaBox=prismBounds?`<div class="prism-area-box" style="grid-column:${prismBounds.left+1}/span ${prismBounds.width};grid-row:${prismBounds.top+1}/span ${prismBounds.height}" aria-hidden="true"></div>${reflectedBounds?`<div class="prism-area-box inverse-reflected-area" style="grid-column:${reflectedBounds.left+1}/span ${reflectedBounds.width};grid-row:${reflectedBounds.top+1}/span ${reflectedBounds.height}" aria-hidden="true"></div>`:""}`:"";
  $("#talent-stage").innerHTML = connections + prismAreaBox + displayNodes.map((node) => {
    const rank = rankFor(node); const max = node.maxRank || (node.effectsPerRank ? 3 : 1); const coordinate = node.coordinate.join(",");
    const symbol = node.placeholder ? (node.type === "legendary" ? "✧" : node.type === "medium" ? "◇" : "·") : nodeIcon(node);
    const isPrismNode=hasInstalledPrism&&coordinate===installedPrismCoordinate;
    const isAffected=installedPrism?.type==="inverse"?prerequisiteFreeCoordinates.has(coordinate)&&!isPrismNode:prismBounds&&!isPrismNode&&node.coordinate[0]>=prismBounds.left&&node.coordinate[0]<prismBounds.left+prismBounds.width&&node.coordinate[1]>=prismBounds.top&&node.coordinate[1]<prismBounds.top+prismBounds.height;
    const icon = tliArt.talents[panel.name]?.[node.reflectedFrom||coordinate] || node.icon;
    const availability = canAllocateTalent({ panel:panel.name,node,graph,layouts,ranks:rankObject,prismCoordinate:hasInstalledPrism?installedPrismCoordinate:null,prerequisiteFreeCoordinates });
    const label = node.placeholder ? "Unallocated " + node.type + " talent" : nodeTitle(node);
    const nodeStyle='--column:' + (node.coordinate[0] + 1) + ';--row:' + (node.coordinate[1] + 1);
    const talentButton='<button type="button" role="gridcell" class="talent-node ' + (rank ? "allocated " : "") + (node.placeholder && !rank ? "available " : "") + (!rank && !availability.allowed ? "locked " : "") + (node.type === "legendary" ? "legendary-node " : "") + (isAffected ? "prism-affected-node " : "") + (node.reflectedFrom ? "inverse-reflected-node " : "") + (placingPrism&&nativeTalentCoordinates.has(coordinate) ? "prism-placement-target " : "") + (isPrismNode ? "prism-covered-node " : "") + '" style="' + nodeStyle + '" data-coordinate="' + coordinate + '" data-node-type="' + (node.type || "captured") + '" aria-label="' + label + ", rank " + rank + " of " + max + (availability.allowed ? '' : ', ' + availability.reason) + (isAffected?", within Inverse Image reflected area":"") + '">' + (icon ? '<img class="talent-node-art" src="' + icon + '" alt="">' : '<span class="node-symbol">' + symbol + '</span>') + '<span class="node-rank">' + rank + "/" + max + "</span></button>";
    if(!isPrismNode)return talentButton;
    return talentButton+'<button type="button" class="talent-node prism-node installed-prism-node" style="' + nodeStyle + '" data-coordinate="' + coordinate + '" data-node-type="' + (node.type || "captured") + '" aria-label="' + escapeHtml(prismName(installedPrism)) + ' installed here">' + (prismIcon(installedPrism) ? '<img class="talent-node-art" src="' + prismIcon(installedPrism) + '" alt="">' : '<span class="node-symbol">✦</span>') + '</button>';
  }).join("");
  const blockRatio=Number(installedPrism?.rareAffix?.match(/^All Legendary Medium Talent within the area also gain: \+(\d+)% Block Ratio$/)?.[1]||0);
  const activeLegendaryCount=prismBounds?displayNodes.filter((node)=>node.type==="legendary"&&node.coordinate.join(",")!==installedPrismCoordinate&&node.coordinate[0]>=prismBounds.left&&node.coordinate[0]<prismBounds.left+prismBounds.width&&node.coordinate[1]>=prismBounds.top&&node.coordinate[1]<prismBounds.top+prismBounds.height&&rankFor(node)>0).length:0;
  const prismAudit = blockRatio ? `<div class="audit-row prism-audit"><span><strong>${escapeHtml(prismName(installedPrism))} area bonus</strong><small>${prismArea(installedPrism)} area · ${activeLegendaryCount} allocated Legendary Medium Talents</small></span><span>+${blockRatio}% × ${activeLegendaryCount} = <strong>+${blockRatio*activeLegendaryCount}% Block Ratio</strong></span></div>` : "";
  const impact = currentTalentSlateImpact();
  const changedTalentEffects = Object.entries(impact.talentDelta).filter(([,value]) => value !== 0);
  const candidateSummary = `<div class="candidate-effect-summary"><article><span>Talent/slate damage multiplier</span><strong>×${impact.factors.damageMultiplier}</strong></article><article><span>Sealed Mana Compensation</span><strong>+${impact.sealedManaCompensationPercent}%</strong></article><article><span>Disintegrate additional stacks</span><strong>${impact.disintegrate.candidateAdditionalStacks}</strong></article></div>${changedTalentEffects.length ? `<div class="candidate-delta-list">${changedTalentEffects.map(([key,value]) => `<span>${effectLabel(key)} <strong>${formatEffect(key,value)}</strong></span>`).join("")}</div>` : `<p class="muted">Talent ranks match the captured baseline.</p>`}`;
  $("#talent-audit").innerHTML = `${candidateSummary}<div class="audit-grid">${prismAudit}${displayNodes.filter((node) => rankFor(node) > 0 && node.coordinate.join(",")!==installedPrismCoordinate).map((node) => `<div class="audit-row"><span><strong>${nodeTitle(node)}</strong><small>Coordinate ${node.coordinate.join(" · ")} · Rank ${rankFor(node)}${node.reflectedFrom?` · Reflected from ${node.reflectedFrom}`:""}</small></span><span>${effectSummary(node, rankFor(node),node.reflectedFrom?inverseImageEffectMultiplier(installedPrism,node.type):1)}</span></div>`).join("")}</div>`;
  setTalentSlateMode(talentSlateMode);
}

function prismName(item){return item.type==="inverse"?"Inverse Image":`Ethereal Prism: ${item.base}`;}
function prismIcon(item){return item.type==="ethereal"?etherealPrismIcons[item.base]||"":"./src/assets/tli/ui-s12-lengjing-golden01.webp";}
function prismAffixSections(item,showCoverage=false){
  const badge=(kind)=>showCoverage?coverageBadge(prismAffixCoverage(item,kind),prismAffixCoverageReason(item,kind)):"";
  if(item.type==="inverse")return `<section class="prism-affix-section base"><h4>Prism Exclusive Effect</h4><p>${escapeHtml(prismBaseEffect(item.type,item.base))} ${badge("base")}</p></section><section class="prism-affix-section inverse-fixed"><h4>Fixed Affixes</h4>${Object.entries(inverseImageRolls).map(([kind,range])=>{const value=inverseImageRoll(item,kind);return `<p>${escapeHtml(range.label)}: <strong class="${inverseRollSign(value)}">${value}</strong> ${badge(kind)}</p>`;}).join("")}</section>`;
  return `<section class="prism-affix-section base"><h4>Base Affix</h4><p>${escapeHtml(prismBaseEffect(item.type,item.base,item.legendaryAffix))} ${badge("base")}</p></section>${[["radiusAffix","Radius Affix"],["rareAffix","Rare Affix"],["legendaryAffix","Legendary Affix"]].filter(([key])=>item[key]&&(key!=="legendaryAffix"||prismSupportsLegendaryAffix(item))).map(([key,label])=>`<section class="prism-affix-section ${key}"><h4>${label}</h4><p>${modifierTextMarkup(item[key])} ${badge(key)}</p></section>`).join("")}`;
}
function prismTooltipHtml(item){
  const icon=prismIcon(item);
  return `<div class="prism-tooltip-head">${icon?`<img src="${icon}" alt="">`:""}<strong>${escapeHtml(prismName(item))}</strong><small>${item.type==="inverse"?"Inverse Image":"Ethereal Prism"}</small></div><div class="prism-tooltip-body"><p class="prism-effect-area">Effect Area: <strong>${prismArea(item)}</strong> ${coverageBadge("Planner only")}</p>${prismAffixSections(item,true)}</div><footer>Click to change · Right-click to remove</footer>`;
}
function renderPrismInventory(){
  const slot=activePrismTreeSlot+1,panel=plannerState.talents.selectedTrees[activePrismTreeSlot],items=plannerState.talents.prismInventory||[],installed=plannerState.talents.installedPrisms||{};
  $("#prism-inventory-title").textContent=`Install Prism - Tree Slot ${slot}`;
  $("#prism-inventory-list").innerHTML=items.length?`<div class="prism-inventory-items">${items.map((item)=>{const usedAt=Object.entries(installed).find(([,id])=>id===item.id)?.[0];return `<article class="prism-inventory-item"><div class="prism-inventory-summary"><span class="prism-item-icon">${prismIcon(item)?`<img src="${prismIcon(item)}" alt="">`:"✦"}</span><span class="prism-inventory-details"><strong>${escapeHtml(prismName(item))}</strong><small>${item.type==="inverse"?"Inverse Image":"Ethereal Prism"} · ${prismArea(item)} area${usedAt?` · Installed in ${escapeHtml(usedAt)}`:""}</small></span></div><button type="button" class="prism-action prism-action-edit" data-edit-crafted-prism="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(prismName(item))}">Edit</button><button type="button" class="prism-action prism-action-install" data-install-crafted-prism="${escapeHtml(item.id)}" ${usedAt&&usedAt!==panel?"disabled":""}>${usedAt===panel?"Equipped":"Install"}</button><button type="button" class="prism-action prism-action-delete" data-delete-crafted-prism="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(prismName(item))}">×</button></article>`;}).join("")}</div>${installed[panel]?`<button type="button" class="prism-unequip" data-unequip-prism>Unequip current Prism</button>`:""}`:'<div class="prism-inventory-empty"><span>No prisms crafted yet</span><button type="button" data-open-prism-crafter>Craft First Prism</button></div>';
}
function openPrismInventory(){
  activePrismTreeSlot=plannerState.talents.selectedTrees.indexOf(activeTalentPanel);
  if(activePrismTreeSlot<=0)return;
  renderPrismInventory();$("#prism-inventory-dialog").showModal();
}
function prismAffixSelect(kind,label){
  const value=prismDraft[`${kind}Affix`]||"",options=kind==="rare"?prismRareAffixesForBase(prismDraft.base):kind==="legendary"?prismLegendaryAffixesForBase(prismDraft.base):prismAffixes[kind];
  const optionLabel=(affix)=>kind==="legendary"&&affix.includes("Gains a stack of Fortitude")?`Fortitude — ${affix.match(/Owns (\d+) additional/)?.[1]||"?"} additional stack(s) — ${affix}`:affix;
  return `<label class="prism-affix-select"><span><b class="${kind}">${label}</b><small>Only ${label} mods</small></span><select data-prism-affix="${kind}" aria-label="${label} Prism affix"${fullTextTitle(options.includes(value)?optionLabel(value):"")}><option value="">-- Select ${label} Slot --</option>${options.map((affix)=>`<option value="${escapeHtml(affix)}" ${affix===value?"selected":""}${fullTextTitle(optionLabel(affix))}>${escapeHtml(optionLabel(affix))}</option>`).join("")}</select></label>`;
}
function inverseRollSign(value){return value<0?"negative":value>0?"positive":"zero";}
function inverseRollStyle(range,value){
  const width=range.max-range.min;
  const zero=100*(0-range.min)/width;
  const current=100*(value-range.min)/width;
  return `--inverse-start:${Math.min(zero,current)}%;--inverse-end:${Math.max(zero,current)}%`;
}
function inverseImageControl(kind,range){
  const value=inverseImageRoll(prismDraft,kind);
  return `<div class="inverse-roll ${inverseRollSign(value)}" style="${inverseRollStyle(range,value)}"><label for="inverse-${kind}">${escapeHtml(range.label)}</label><input id="inverse-${kind}" type="number" min="${range.min}" max="${range.max}" step="1" value="${value}" data-inverse-roll="${kind}" data-inverse-input aria-label="${escapeHtml(range.label)}"><input type="range" min="${range.min}" max="${range.max}" step="1" value="${value}" data-inverse-roll="${kind}" data-inverse-slider aria-label="${escapeHtml(range.label)} slider"><small><span>${range.min}</span><span>${range.max}</span></small></div>`;
}
function renderPrismCrafterPreview(){
  const draft=prismDraft,name=draft.base?prismName(draft):"",icon=prismIcon(draft);
  $("#prism-crafter-preview").innerHTML=draft.base?`<div class="prism-preview-card ${draft.type==="inverse"?"inverse-preview":""}"><span class="prism-preview-icon">${icon?`<img src="${icon}" alt="">`:"✦"}</span><h3>${escapeHtml(name)}</h3><small>${draft.type==="inverse"?"INVERSE IMAGE":"ETHEREAL PRISM"}</small><div><p class="prism-effect-area">Effect Area: <strong>${prismArea(draft)}</strong></p>${prismAffixSections(draft)}</div></div>`:'<div class="prism-preview-empty">Select options to preview item</div>';
}
function renderPrismCrafter(){
  const draft=prismDraft,hasLegendary=prismSupportsLegendaryAffix(draft),affixes=[draft.radiusAffix,draft.rareAffix,hasLegendary&&draft.legendaryAffix].filter(Boolean);
  $("#prism-crafter-title").textContent=`${prismEditingId?"Edit":"Craft"} ${draft.type==="inverse"?"Inverse Image":"Prism"}`;
  const tabs=`<div class="prism-type-tabs"><button type="button" data-prism-type="ethereal" class="${draft.type==="ethereal"?"active":""}" ${prismEditingId?"disabled":""}>Ethereal Prism</button><button type="button" data-prism-type="inverse" class="${draft.type==="inverse"?"active":""}" ${prismEditingId?"disabled":""}>Inverse Image</button></div>`;
  if(draft.type==="inverse"){
    $("#prism-crafter-form").innerHTML=tabs+`<div class="inverse-image-heading"><img src="${prismIcon(draft)}" alt=""><div><strong>Inverse Image</strong><small>Ultimate</small></div></div><p class="inverse-image-description">${escapeHtml(prismBaseEffect(draft.type,draft.base))}</p><p class="inverse-radius">Radius: <strong>3x3</strong></p><h3>Mod Values</h3><div class="inverse-rolls">${Object.entries(inverseImageRolls).map(([kind,range])=>inverseImageControl(kind,range)).join("")}</div>`;
  }else{
    $("#prism-crafter-form").innerHTML=tabs+`<label class="prism-base-field">Base Item *<select data-prism-base aria-label="Base Prism"${fullTextTitle(draft.base?`Ethereal Prism: ${draft.base}`:"")}><option value="">Select Base Prism</option>${etherealPrismBases.map((base)=>`<option value="${escapeHtml(base)}" ${base===draft.base?"selected":""}${fullTextTitle(`Ethereal Prism: ${base}`)}>Ethereal Prism: ${escapeHtml(base)}</option>`).join("")}</select></label>${draft.base?`<div class="prism-fixed"><label>${prismReplacesCore(draft)?"Core Talent":"Prism Effect"} *<input value="${escapeHtml(draft.base)}" readonly></label><small>${prismReplacesCore(draft)?"This prism replaces the panel core talent":"This prism does not replace the panel core talent"}</small><p>${escapeHtml(prismBaseEffect(draft.type,draft.base,draft.legendaryAffix))}</p></div><h3>Random Affixes (${affixes.length}/${hasLegendary?3:2})</h3>${prismAffixSelect("radius","Radius")}${prismAffixSelect("rare","Rare")}${hasLegendary?prismAffixSelect("legendary","Legendary"):""}`:""}`;
  }
  renderPrismCrafterPreview();
  $("[data-confirm-prism-craft]").disabled=!draft.base;
  $("[data-confirm-prism-craft]").textContent=prismEditingId?"Save Changes":"Craft";
}
function openPrismCrafter(item=null){
  if($("#prism-inventory-dialog").open)$("#prism-inventory-dialog").close();
  prismEditingId=item?.id||null;
  prismDraft=item?{...item,...(item.inverseRolls?{inverseRolls:{...item.inverseRolls}}:{})}:{type:"ethereal",base:"",radiusAffix:"",rareAffix:"",legendaryAffix:""};
  renderPrismCrafter();$("#prism-crafter-dialog").showModal();
}
function clearInverseReflectedRanks(panel,item,coordinate){
  for(const target of inverseImageReflectionMap(professionTreeLayoutsAllSs13[panel]?.nodes||[],item,coordinate).keys())talentRanks.set(`${panel}:${target}`,0);
}
function reconcileTalentRanksAfterPrismChange(panel){
  const layouts=activeTalentLayouts(),graph=layouts[panel];
  if(!graph)return;
  const prism=(plannerState.talents.prismInventory||[]).find((item)=>item.id===plannerState.talents.installedPrisms?.[panel]);
  const prismCoordinate=plannerState.talents.installedPrismNodes?.[panel];
  const result=pruneInvalidTalentRanks({panel,graph,layouts,ranks:Object.fromEntries(talentRanks),prismCoordinate,
    prerequisiteFreeCoordinates:inverseImageReflectedCoordinates(prism,prismCoordinate)});
  for(const key of result.removed)talentRanks.set(key,0);
}
function installCraftedPrism(id){
  const item=(plannerState.talents.prismInventory||[]).find((entry)=>entry.id===id),panel=plannerState.talents.selectedTrees[activePrismTreeSlot];
  if(!item||!panel)return;
  const other=Object.entries(plannerState.talents.installedPrisms||{}).find(([name,installedId])=>name!==panel&&(plannerState.talents.prismInventory||[]).find((entry)=>entry.id===installedId)?.type===item.type);
  if(other){showToast(`${item.type==="inverse"?"Inverse Image":"Ethereal Prism"} is already installed in ${other[0]}`);return;}
  pendingPrismPlacement={id,panel};
  if($("#prism-inventory-dialog").open)$("#prism-inventory-dialog").close();
  renderTalents();
  $("#prism-placement-prompt").scrollIntoView({block:"center",behavior:"smooth"});
}
function placeCraftedPrism(coordinate){
  if(!pendingPrismPlacement)return;
  const {id,panel}=pendingPrismPlacement,item=(plannerState.talents.prismInventory||[]).find((entry)=>entry.id===id);
  if(!item||activeTalentPanel!==panel)return;
  if(!professionTreeLayoutsAllSs13[panel]?.nodes.some((node)=>node.coordinate.join(",")===coordinate))return;
  const previous=(plannerState.talents.prismInventory||[]).find((entry)=>entry.id===plannerState.talents.installedPrisms?.[panel]);
  clearInverseReflectedRanks(panel,previous,plannerState.talents.installedPrismNodes?.[panel]);
  clearInverseReflectedRanks(panel,item,coordinate);
  plannerState.talents.installedPrisms={...(plannerState.talents.installedPrisms||{}),[panel]:id};
  plannerState.talents.installedPrismNodes={...(plannerState.talents.installedPrismNodes||{}),[panel]:coordinate};
  talentRanks.set(`${panel}:${coordinate}`,0);
  if(previous?.type==="inverse"||item.type==="inverse")reconcileTalentRanksAfterPrismChange(panel);
  pendingPrismPlacement=null;
  persistPlannerState();renderCandidateViews();showToast(`${prismName(item)} installed on node ${coordinate}`);
}

document.addEventListener("change",(event)=>{
  if(!prismDraft)return;
  if(event.target.matches("[data-prism-base]")){prismDraft.base=event.target.value;if(!prismRareAffixesForBase(prismDraft.base).includes(prismDraft.rareAffix))prismDraft.rareAffix="";if(!prismLegendaryAffixesForBase(prismDraft.base).includes(prismDraft.legendaryAffix))prismDraft.legendaryAffix="";renderPrismCrafter();}
  if(event.target.matches("[data-prism-affix]")){prismDraft[`${event.target.dataset.prismAffix}Affix`]=event.target.value;renderPrismCrafter();}
  if(event.target.matches("[data-inverse-roll]")){const kind=event.target.dataset.inverseRoll;event.target.value=inverseImageRoll(prismDraft,kind);}
});
document.addEventListener("input",(event)=>{
  if(!prismDraft||prismDraft.type!=="inverse"||!event.target.matches("[data-inverse-roll]"))return;
  const kind=event.target.dataset.inverseRoll,raw=event.target.value;
  if(raw===""||!Number.isFinite(Number(raw)))return;
  const range=inverseImageRolls[kind],value=Math.max(range.min,Math.min(range.max,Math.round(Number(raw))));
  prismDraft.inverseRolls={...prismDraft.inverseRolls,[kind]:value};
  const partner=event.target.closest(".inverse-roll").querySelector(event.target.matches("[data-inverse-slider]")?"[data-inverse-input]":"[data-inverse-slider]");
  partner.value=value;
  const control=event.target.closest(".inverse-roll");
  control.classList.remove("negative","positive","zero");
  control.classList.add(inverseRollSign(value));
  control.style.cssText=inverseRollStyle(range,value);
  renderPrismCrafterPreview();
});

function renderCoreTalentPicker(threshold) {
  const panel=currentTalentPanel();
  const points=talentPointTotals(activeTalentLayouts(),Object.fromEntries(talentRanks)).panels[panel.name];
  const options=panel.coreTalents.filter((core)=>core.unlockPoints===threshold);
  const locked=points<threshold;
  $("#core-picker-title").textContent=`Select ${threshold}-point core talent`;
  $("#core-picker-status").textContent=locked ? `${points}/${threshold} points in ${panel.name}. These choices unlock at ${threshold} points.` : `Choose one core talent for ${panel.name}.`;
  $("#core-talent-picker-grid").innerHTML=options.map((core)=>`<button type="button" class="core-picker-option ${plannerState.talents.coreSelections[`${panel.name}:${threshold}`]===core.name ? "selected" : ""}" data-core-option="${core.name}" ${locked ? "disabled" : ""}>${artwork(tliArt.coreTalents[core.name] || core.icon,core.name,"core-picker-art")}<span><strong>${core.name}</strong><small>${core.description}</small></span></button>`).join("");
}

function renderSageScentBottle(){
  const scent=plannerState.hero.sageScent||{}, elixir=sageElixirsSs13.find((entry)=>entry.name===scent.elixir);
  const slot=(kind,label)=>{ const value=scent[kind], ingredient=sageScentIngredientsSs13[kind].find((entry)=>entry.name===value); return `<button type="button" class="sage-ingredient-slot ${value?"filled":""}" data-open-sage-scent="${kind}" ${ingredient?`data-sage-scent-tooltip="${kind}"`:""}><span>${label}</span><b>${ingredient?`<img src="${ingredient.icon}" alt="">`:"+"}</b>${ingredient?`<small>${escapeHtml(ingredient.name)}</small>`:""}</button>`; };
  $("#hero-trait-tree").innerHTML=`<section class="sage-scent-panel"><button type="button" class="sage-basic-scent ${elixir?"filled":""}" data-open-sage-scent="elixir" ${elixir?'data-sage-scent-tooltip="elixir"':""}>${elixir?`<img src="${elixir.icon}" alt=""><strong>${escapeHtml(elixir.name)}</strong><small>${elixir.tags.map(escapeHtml).join(" · ")}</small>`:'<b>+</b>'}</button><div class="sage-scent-divider">Basic Scent</div>${slot("damage","Damage Ingredient")}${slot("defense","Defense Ingredient")}${slot("functional","Functional Ingredient")}</section>`;
}

function renderSageScentSelector(){
  const query=sageScentQuery.trim().toLowerCase(), isElixir=sageScentSelectorKind==="elixir";
  const options=(isElixir?sageElixirsSs13:sageScentIngredientsSs13[sageScentSelectorKind]).filter((entry)=>entry.name.toLowerCase().includes(query));
  $("#sage-scent-title").textContent=isElixir?"Select Elixir Skill":`Select ${titleCase(sageScentSelectorKind)} Ingredient`;
  $("#sage-scent-search").placeholder=isElixir?"Search skills...":"Search ingredients...";
  $("#sage-scent-options").innerHTML=options.map((entry)=>`<button type="button" class="sage-scent-option" data-select-sage-scent="${escapeHtml(entry.name)}"><img src="${entry.icon}" alt=""><span><strong>${escapeHtml(entry.name)}</strong>${isElixir?`<small>${entry.tags.map((tag)=>`<i>${escapeHtml(tag)}</i>`).join("")}</small>`:`<small>${escapeHtml(entry.description)}</small>`}</span></button>`).join("")||'<p class="hero-selector-empty">No matching choices.</p>';
}

const carinoProjectileSupportOptions = () => {
  const installed=currentEditedSetups().flatMap((setup)=>setup.supports||[]).map((support)=>support.name);
  const wellPrepared=plannerState.hero.selectedTraits["carino-ranger-of-glory:level75"]==="Well Prepared";
  return carinoSpecialAmmoOptions(tlidbSupportCatalogSs13,tlidbSkillCatalogSs13,installed,wellPrepared);
};

function renderCarinoAmmoSelector(){
  if(activeHeroTraitSupportId){ renderHeroTraitSupportSelector(); return; }
  const installed=plannerState.hero.carinoSpecialAmmoSupports||[];
  const query=carinoAmmoQuery.toLowerCase();
  const options=carinoProjectileSupportOptions().filter((entry)=>!query||`${entry.name} ${entry.exclusiveFor} ${entry.category}`.toLowerCase().includes(query));
  $("#carino-ammo-title").textContent=`Select Special Ammo Support · Slot ${activeCarinoAmmoSlot+1}`;
  $("#carino-ammo-selector .carino-ammo-help").textContent=plannerState.hero.selectedTraits["carino-ranger-of-glory:level75"]==="Well Prepared"?"Choose a compatible Projectile support that is not installed on the skill panel.":"Choose a compatible regular Projectile support. Well Prepared unlocks Magnificent and Noble supports.";
  $("#carino-ammo-options").innerHTML=options.map((entry)=>`<button type="button" class="sage-scent-option carino-ammo-option ${installed.includes(entry.name)?"installed":""}" data-select-carino-ammo="${escapeHtml(entry.name)}" ${installed.includes(entry.name)?"disabled":""}>${artwork(entry.icon,entry.name,"support-art")}<span><strong>${escapeHtml(entry.name.replace(/ \((Magnificent|Noble)\)$/,""))}</strong><small><i>${escapeHtml(titleCase(entry.category))}</i><i>${escapeHtml(entry.exclusiveFor||"Projectile compatible")}</i></small><small>${escapeHtml((entry.effects||[]).join(" "))}</small></span></button>`).join("")||'<p class="hero-selector-empty">No matching Projectile supports.</p>';
}

const heroTraitSupportConfig = {
  "rosa-high-court-chariot": { hero:"High Court Chariot", skill:"Holy Domain" },
  "moto-charge-calling": { hero:"Charge Calling", skill:"Charge Calling" }
};

function heroTraitSupportOptions(){
  return tlidbSupportCatalogSs13.filter((support)=>!support.passiveOnly&&["regular","magnificent","noble","activation"].includes(support.category));
}

function renderHeroTraitSupportSelector(){
  const config=heroTraitSupportConfig[activeHeroTraitSupportId];
  const selected=plannerState.hero.heroTraitSupports?.[activeHeroTraitSupportId]||"";
  const query=carinoAmmoQuery.toLowerCase();
  const options=heroTraitSupportOptions().filter((entry)=>!query||`${entry.name} ${entry.exclusiveFor||""} ${entry.category}`.toLowerCase().includes(query));
  document.querySelector("#carino-ammo-selector .eyebrow").textContent=config.hero;
  $("#carino-ammo-title").textContent=`Select ${config.skill} Support`;
  $("#carino-ammo-search").placeholder="Search supports...";
  $("#carino-ammo-selector .carino-ammo-help").textContent=`Choose a Support Skill or Activation Medium Support Skill for ${config.skill}.`;
  $("#carino-ammo-options").innerHTML=options.map((entry)=>`<button type="button" class="sage-scent-option carino-ammo-option ${selected===entry.name?"installed":""}" data-select-hero-trait-support="${escapeHtml(entry.name)}">${artwork(entry.icon,entry.name,"support-art")}<span><strong>${escapeHtml(entry.name.replace(/ \((Magnificent|Noble)\)$/,""))}</strong><small><i>${escapeHtml(titleCase(entry.category))}</i>${entry.exclusiveFor?`<i>${escapeHtml(entry.exclusiveFor)}</i>`:""}</small><small>${escapeHtml((entry.effects||[]).join(" "))}</small></span></button>`).join("")||'<p class="hero-selector-empty">No matching supports.</p>';
}

function carinoAmmoSlotsMarkup(selectedHero,traits){
  if(selectedHero.id!=="carino-ranger-of-glory")return "";
  const level75Key=`${selectedHero.id}:level75`;
  const level75Choices=traits.filter((trait)=>trait.level===75);
  const selected75=plannerState.hero.selectedTraits[level75Key];
  const unlocked=selected75==="Well Prepared"?3:2;
  const selections=plannerState.hero.carinoSpecialAmmoSupports||[];
  const slots=Array.from({length:3},(_,index)=>{
    const support=tlidbSupportCatalogSs13.find((entry)=>entry.name===selections[index]);
    const locked=index>=unlocked;
    return `<button type="button" class="carino-ammo-slot ${support?"filled":""} ${locked?"locked":""}" data-open-carino-ammo="${index}" ${support?`data-support-tooltip="${escapeHtml(support.name)}" data-parent-skill="Special Ammo" data-carino-support-slot="${index}"`:""} ${locked?"disabled":""} title="${locked?"Requires Well Prepared":support?escapeHtml(support.name):`Select Special Ammo support ${index+1}`}" aria-label="${locked?"Requires Well Prepared":support?`Edit ${escapeHtml(support.name)}; right-click to remove`:`Select support for Special Ammo slot ${index+1}`}">${support?artwork(support.icon,support.name,"carino-ammo-art"):'<b>+</b>'}</button>`;
  }).join("");
  return `<div class="carino-ammo-slots" aria-label="Special Ammo supports">${slots}</div>`;
}

function heroTraitSupportSlotMarkup(selectedHero){
  const config=heroTraitSupportConfig[selectedHero.id];
  if(!config)return "";
  const name=plannerState.hero.heroTraitSupports?.[selectedHero.id]||"";
  const support=tlidbSupportCatalogSs13.find((entry)=>entry.name===name);
  return `<div class="carino-ammo-slots hero-trait-support-slot" aria-label="${escapeHtml(config.skill)} support"><button type="button" class="carino-ammo-slot ${support?"filled":""}" data-open-hero-trait-support="${selectedHero.id}" ${support?`data-support-tooltip="${escapeHtml(support.name)}" data-hero-trait-support-id="${selectedHero.id}"`:""} title="${support?escapeHtml(support.name):`Select ${escapeHtml(config.skill)} support`}" aria-label="${support?`Edit ${escapeHtml(support.name)}; right-click to remove`:`Select support for ${escapeHtml(config.skill)}`}">${support?artwork(support.icon,support.name,"carino-ammo-art"):"<b>+</b>"}</button></div>`;
}

// Trait level the tooltip shows, the rule src/character-stats.js heroTraitStatLines and the planner apply (user-stated rule
// 2026-10-13; src/hero-memory-rules.js): a memory gives 1 (any), 2 (enhancement 30+), 3 (Ultimate 50), plus its own "+N to
// Hero Trait Level". Base trait: that of the base-slot memory (1 without one, open). A 45/60/75 trait: 0 (inactive) with no
// memory in its slot, else that of its slot memory + the planner's non-memory "+N" lines; max 5.
function heroTraitTooltipLevel(levelKey="base"){
  const bonus=heroTraitLevelBonus((currentPlanner().modifierTexts||[]).filter((line)=>line.origin!=="trait"));
  if(levelKey==="base")return Math.max(1,Math.min(5,baseTraitLevelForMemory(baseTraitReduction()===null?null:baseTraitMemory())));
  if(String(levelKey).endsWith(":extra"))return EXTRA_PICK_LEVEL; // Youga's fourth tree row: max level (src/hero-trait-tree.js)
  const tier=String(levelKey).match(/level\d+/)?.[0];
  return slotTraitLevel(plannerState.hero,[levelKey,tier],(bonus.all||0)+(bonus.nonBase||0),nonBaseTraitLevelExtras(plannerState.hero.selectedHeroId,artificialMoonGate(plannerState.hero).active)); // Bing's sixth rank (Q-H2)
}

// Trait Path tab of a trait-tree hero (Selena – Dance of the Deep, Thea – Wisdom of The Gods, Youga – The Ultimate One;
// src/hero-trait-tree.js). The board keeps Selena's style; picks are row-indexed in hero.treeTraits[heroId].
function renderSelenaDanceTree(traits){
  const heroId=plannerState.hero.selectedHeroId, tree=heroTraitTree(heroId), rules=heroTreeRules(plannerState.hero,heroId);
  const selected=heroTreeSelections(plannerState.hero,heroId);
  const picked=selected.filter(Boolean), selectedSet=new Set(picked), atLimit=picked.length>=rules.capacity;
  const traitByName=new Map(traits.map((trait)=>[trait.name,trait]));
  const lines=treeLinesMarkup(tree.nodes,selectedSet);
  const nodes=tree.nodes.map((node)=>{
    const trait=traitByName.get(node.name), parentReady=node.base||node.parent===tree.base||selectedSet.has(node.parent), chosen=node.base||selectedSet.has(node.name), locked=!node.base&&!chosen&&(!parentReady||atLimit);
    return `<button type="button" class="selena-dance-node ${node.base?"base":""} ${chosen?"selected":""} ${locked?"locked":""}" style="--node-x:${node.x/4}%;--node-y:${node.y}px" ${locked?"disabled":""} data-selena-dance-node="${escapeHtml(node.name)}" data-hero-trait-tooltip="${escapeHtml(node.name)}" data-hero-trait-level-key="${node.base?"base":selected.includes(node.name)?treeRowLevelKey(heroId,selected.indexOf(node.name)):`${heroId}:tree`}" aria-pressed="${chosen}">${artwork(trait?.icon,node.name,"selena-dance-node-art")}<span>${node.base?"Base":trait?.level?`Lv.${trait.level}`:""}</span></button>`;
  }).join("");
  $("#hero-trait-tree").innerHTML=`<section class="selena-dance-tree"><header><span>Hero trait path</span><strong>${picked.length}/${rules.capacity} selected</strong></header><div class="selena-dance-tree-board"><svg viewBox="0 0 400 275" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes}</div></section>`;
  positionTraitTreeBoard();
}

// Connection lines of a trait tree, in the coordinates of its nodes (inset to the node edges; lit when both ends are picked).
function treeLinesMarkup(nodes,selectedSet){
  const byName=new Map(nodes.map((node)=>[node.name,node]));
  return nodes.filter((node)=>node.parent).map((node)=>{
    const parent=byName.get(node.parent), dx=node.x-parent.x, dy=node.y-parent.y, length=Math.hypot(dx,dy)||1, inset=27;
    const x1=parent.x+dx/length*inset, y1=parent.y+dy/length*inset, x2=node.x-dx/length*inset, y2=node.y-dy/length*inset;
    const active=(parent.base||selectedSet.has(parent.name))&&selectedSet.has(node.name);
    return `<line class="${active?"active":""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join("");
}
// Places the trait tree at the board's width (src/hero-trait-tree.js treeBoardLayout): node centres and lines in px, the
// board at least as tall as the layout, re-run when the board resizes. A hidden board (0 px wide) keeps the tree's own
// layout in % until it shows.
let traitTreeBoardObserver=null;
function positionTraitTreeBoard(){
  traitTreeBoardObserver?.disconnect(); traitTreeBoardObserver=null;
  const board=$("#hero-trait-tree .selena-dance-tree-board"), tree=heroTraitTree(plannerState.hero.selectedHeroId);
  if(!board||!tree)return;
  if(typeof ResizeObserver==="function"){ traitTreeBoardObserver=new ResizeObserver(()=>layoutTraitTreeBoard(board,tree)); traitTreeBoardObserver.observe(board); }
  layoutTraitTreeBoard(board,tree);
}
function layoutTraitTreeBoard(board,tree){
  const width=board.clientWidth;
  if(!width||!board.isConnected||board.dataset.layoutSize===`${width}x${board.clientHeight}`)return;
  const layout=treeBoardLayout(tree,width), selectedSet=new Set(heroTreeSelections(plannerState.hero).filter(Boolean));
  board.style.minHeight=`${layout.height}px`;
  for(const node of layout.nodes){
    const element=[...board.querySelectorAll("[data-selena-dance-node]")].find((item)=>item.dataset.selenaDanceNode===node.name);
    element?.style.setProperty("--node-x",`${node.x}px`); element?.style.setProperty("--node-y",`${node.y}px`);
  }
  const svg=board.querySelector("svg"), height=board.clientHeight;
  svg.setAttribute("viewBox",`0 0 ${width} ${height}`); svg.innerHTML=treeLinesMarkup(layout.nodes,selectedSet);
  board.dataset.layoutSize=`${width}x${height}`;
}

// Stores a trait tree's rows and re-renders like the other trait changes (pick, remove and drag-move all land here).
function commitTreeTraits(heroId,rows){
  plannerState.hero.treeTraits={...(plannerState.hero.treeTraits||{}),[heroId]:rows};
  persistPlannerState(); renderHeroTraitTree(); render(); renderConfiguration();
}

function renderHeroTraitTree() {
  const selectedHero=heroById(plannerState.hero.selectedHeroId);
  if(!selectedHero){
    $("#selected-hero-name").textContent="No hero selected";
    $("#selected-hero-trait").textContent="Choose a hero trait";
    $("#selected-hero-portrait").innerHTML='<span class="hero-avatar-fallback" aria-hidden="true">+</span>';
    $("#hero-detail-tabs").hidden=true;
    $("#hero-trait-tree").setAttribute("aria-label","No hero selected");
    $("#hero-trait-tree").innerHTML='<div class="hero-traits-pending"><strong>Select a hero</strong><span>Choose a hero to configure its base trait, memories, and special trait options.</span><button type="button" class="button" data-change-hero>Choose Hero</button></div>';
    return;
  }
  $("#selected-hero-name").textContent=selectedHero.name;
  $("#selected-hero-trait").textContent=selectedHero.trait;
  $("#selected-hero-portrait").innerHTML=selectedHero.image ? `<img src="${selectedHero.image}" alt="${escapeHtml(selectedHero.name)}">` : `<span class="hero-avatar-fallback" aria-hidden="true">${escapeHtml(selectedHero.name.slice(0,2).toUpperCase())}</span>`;
  const sage=selectedHero.id==="sage-licorice-note";
  const treeHero=Boolean(heroTraitTree(selectedHero.id));
  const detailTabs=$("#hero-detail-tabs"), secondaryTab=detailTabs.querySelector("button:last-child");
  if(sage&&!["traits","scent"].includes(activeHeroDetailTab))activeHeroDetailTab="traits";
  if(treeHero&&!["traits","path"].includes(activeHeroDetailTab))activeHeroDetailTab="traits";
  detailTabs.hidden=!(sage||treeHero);
  secondaryTab.dataset.heroDetailTab=treeHero?"path":"scent";
  secondaryTab.textContent=treeHero?"Trait Path":"Scent Bottle";
  if(!sage&&!treeHero)activeHeroDetailTab="traits";
  $("#hero-detail-tabs").querySelectorAll("button").forEach((button)=>button.classList.toggle("active",button.dataset.heroDetailTab===activeHeroDetailTab));
  if(sage&&activeHeroDetailTab==="scent"){ renderSageScentBottle(); return; }
  $("#hero-trait-tree").setAttribute("aria-label",`${selectedHero.name}, ${selectedHero.trait} hero traits`);
  const traits=allHeroTraitsSs13[selectedHero.id]?.traits||[];
  if(treeHero&&activeHeroDetailTab==="path"){ renderSelenaDanceTree(traits); return; }
  const stateKey=(level)=>selectedHero.id==="selena-sing-with-the-tide"?`level${level}`:`${selectedHero.id}:level${level}`;
  const tierRows=[45,60,75].map((level)=>[stateKey(level),level,traits.filter((trait)=>trait.level===level)]);
  const baseTrait=traits.find((trait)=>trait.level===1);
  const dualTraitHero=selectedHero.id==="bing-creative-genius";
  const creativeGeniusUpper={45:["Inspiration Overflow"],60:["Mind Domain","Trouble Maker"],75:["Brainstorm","Flash of Brilliance"]};
  const memoryIcon = (name) => selectedHero.id==="selena-sing-with-the-tide"&&name === "Ceaseless Tide" ? tliArt.hero.memories["Ceaseless Tide"] : baseTrait?.icon;
  const danceSelections=treeHero?heroTreeSelections(plannerState.hero,selectedHero.id):[];
  // Youga – The Ultimate One with "+1 Max Youga Count in the Universe": a fourth tree row after Lv75 (src/hero-trait-tree.js).
  const extraTreeRow=treeHero&&heroTreeCapacity(plannerState.hero,selectedHero.id)>TREE_ROW_LEVELS.length?treeExtraRowMarkup(selectedHero.id,traits,danceSelections,artwork):"";
  const baseSupports=carinoAmmoSlotsMarkup(selectedHero,traits)||heroTraitSupportSlotMarkup(selectedHero);
  const baseSlot=equippedBaseTraitSlot(plannerState.hero),slottedBaseMemory=baseTraitMemory();
  const baseMemorySlot=baseSlot?`<button type="button" class="hero-memory-socket base-memory-socket ${slottedBaseMemory?`filled memory-rarity-${escapeHtml(slottedBaseMemory.rarity)}`:""}" data-memory-tier="base" aria-label="${slottedBaseMemory?`Manage base trait ${escapeHtml(slottedBaseMemory.name)}${heroMemoryIsRevived(slottedBaseMemory)?", revived":""}`:"Add base trait memory"}">${slottedBaseMemory?artwork(heroMemoryIcon(slottedBaseMemory.type),slottedBaseMemory.name,"hero-memory-art")+memorySocketRevivalBadge(slottedBaseMemory):'<b>+</b>'}</button>`:"";
  const baseTraitButton=`<button type="button" class="hero-choice selected" data-hero-trait-tooltip="${escapeHtml(baseTrait?.name||selectedHero.trait)}" data-hero-trait-level-key="base" aria-label="${escapeHtml(baseTrait?.name||selectedHero.trait)}" aria-pressed="true">${artwork(baseTrait?.icon,baseTrait?.name||selectedHero.trait,"hero-choice-art")}</button>`;
  const baseTierContent=baseMemorySlot?`${baseMemorySlot}<span class="tier-divider"></span><div class="base-trait-contents">${baseTraitButton}${baseSupports}</div>`:`${baseTraitButton}${baseSupports}`;
  $("#hero-trait-tree").innerHTML = `<div class="hero-tier base-tier ${baseSupports?"carino-base-tier":""} ${baseMemorySlot?"has-base-memory":""}"><span class="tier-level"><small>LVL</small><strong>1</strong></span>${baseTierContent}</div>${tierRows.map(([key,level,choices]) => {
    const memory = plannerState.hero.memories[key] || "";
    const craftedMemory=(plannerState.hero.memoryInventory||[]).find((item)=>item.id===plannerState.hero.equippedMemoryIds?.[key]);
    const memoryButton=`<button type="button" class="hero-memory-socket ${memory ? "filled" : ""} ${craftedMemory?`memory-rarity-${escapeHtml(craftedMemory.rarity)}`:""}" data-memory-tier="${key}" aria-label="${memory ? `Manage ${escapeHtml(memory)}${heroMemoryIsRevived(craftedMemory)?", revived":""}` : `Add level ${level} hero memory`}">${memory ? artwork(craftedMemory?heroMemoryIcon(craftedMemory.type):memoryIcon(memory),memory,"hero-memory-art")+memorySocketRevivalBadge(craftedMemory) : '<b>+</b>'}</button>`;
    if(treeHero){
      // hero.treeTraits[heroId] is row-indexed (Lv45 / 60 / 75); each pick is levelled by its row's memory (src/character-stats.js) and can be dragged to another row.
      const row=TREE_ROW_LEVELS.indexOf(level), pick=danceSelections[row], chosen=pick?traits.filter((trait)=>trait.name===pick&&trait.level>1):[];
      if(!chosen.length)return `<div class="hero-tier hero-memory-only-tier" data-selena-dance-row="${row}"><span class="tier-level"><small>LVL</small><strong>${level}</strong></span>${memoryButton}</div>`;
      const chosenButtons=chosen.map((trait)=>`<button type="button" class="hero-choice selected selena-dance-pick" data-selena-dance-pick="${row}" data-hero-trait-tooltip="${escapeHtml(trait.name)}" data-hero-trait-level-key="${escapeHtml(key)}" aria-label="${escapeHtml(trait.name)}" aria-pressed="true">${artwork(trait.icon,trait.name,"hero-choice-art")}</button>`).join("");
      return `<div class="hero-tier" data-selena-dance-row="${row}"><span class="tier-level"><small>LVL</small><strong>${level}</strong></span>${memoryButton}<span class="tier-divider"></span><div class="hero-tier-choices">${chosenButtons}</div></div>`;
    }
    const choiceButtons=(groupChoices,selectionKey)=>{
      const legacySelection=plannerState.hero.selectedTraits[key];
      const selected=plannerState.hero.selectedTraits[selectionKey]||(groupChoices.some((choice)=>choice.name===legacySelection)?legacySelection:"");
      return groupChoices.map((choice) => `<button type="button" class="hero-choice ${selected===choice.name ? "selected" : ""}" data-hero-trait-tier="${selectionKey}" data-hero-trait="${escapeHtml(choice.name)}" data-hero-trait-tooltip="${escapeHtml(choice.name)}" data-hero-trait-level-key="${escapeHtml(key)}" aria-label="${escapeHtml(choice.name)}" aria-pressed="${selected===choice.name}">${artwork(choice.icon,choice.name,"hero-choice-art")}</button>`).join("");
    };
    let choiceMarkup=choiceButtons(choices,key);
    if(dualTraitHero){
      const upperNames=new Set(creativeGeniusUpper[level]||[]), upper=choices.filter((choice)=>upperNames.has(choice.name)), lower=choices.filter((choice)=>!upperNames.has(choice.name));
      choiceMarkup=`<div class="hero-trait-choice-group upper" aria-label="Level ${level} upper trait choice">${choiceButtons(upper,`${key}:upper`)}</div><div class="hero-trait-choice-group lower" aria-label="Level ${level} lower trait choice">${choiceButtons(lower,`${key}:lower`)}</div>`;
    }
    return `<div class="hero-tier ${dualTraitHero?"dual-trait-tier":""}"><span class="tier-level"><small>LVL</small><strong>${level}</strong></span>${memoryButton}<span class="tier-divider"></span><div class="hero-tier-choices">${choiceMarkup}</div></div>`;
  }).join("")}${extraTreeRow}`;
}


// Hero panel HERO | FOLLOWER tabs (src/follower-panel.js; 2026-10-15): the tab is remembered per build view (localStorage, UI
// only); the header "?" shows the open tab's controls. The FOLLOWER tab renders the follower card and its skill slots.
function activeBuildViewId(){ try{ return loadBuildLibrary().activeBuildId||""; }catch{ return ""; } }
function renderHeroPanel(){
  const follower=readHeroPanelTab(activeBuildViewId())==="follower";
  document.querySelectorAll("[data-hero-panel-tab]").forEach((button)=>{ const active=(button.dataset.heroPanelTab==="follower")===follower; button.classList.toggle("active",active); button.setAttribute("aria-selected",String(active)); button.tabIndex=active?0:-1; });
  $("#hero-panel-hero").hidden=follower; $("#follower-panel").hidden=!follower;
  const help=document.querySelector(".hero-panel-tabs [data-qol-help]");
  if(help){ help.dataset.qolHelp=follower?"follower":"hero"; help.setAttribute("aria-label",follower?"Follower controls":"Hero controls"); }
  if(follower)$("#follower-panel").innerHTML=followerPanelMarkup({state:plannerState,planner:currentPlanner(),artwork});
}
function renderFollowerSelector(){ $("#follower-selector-grid").innerHTML=followerPickerMarkup(followerSelectorQuery,plannerState); }
// A follower skill slot opens the skill board's picker (#skill-selector) as selectorKind "follower-skill" (src/follower-panel.js followerSkillSelectorView; 2026-10-15 user request).
let followerSelectorSlot=0;
// The picker's editor draft { name, tier, affixes } of the highlighted skill (src/follower-panel.js followerSkillDraft): it opens on the
// slot's own skill, tier and affixes and resets to a newly highlighted skill's (the slot's values when it is the slot's skill).
let followerSelectorDraft=null;
function openFollowerSkillSelector(slot){ selectorKind="follower-skill"; followerSelectorSlot=slot; followerSelectorDraft=null; selectorTargetSetupName=null; selectorTargetSupportSlot=null; selectorQuery=""; selectorChoiceIndex=followerSelectorInitialIndex(plannerState,slot); $("#skill-selector-search").value=""; renderSkillSelector(); $("#skill-selector").showModal(); $("#skill-selector-search").focus(); }
function renderFollowerSkillSelector(){ const highlighted=followerSelectorEntries(plannerState,followerSelectorSlot)[selectorChoiceIndex]||null; if(followerSelectorDraft?.name!==highlighted?.name) followerSelectorDraft=highlighted?followerSkillDraft(plannerState,followerSelectorSlot,highlighted.name):null; const view=followerSkillSelectorView({state:plannerState,slot:followerSelectorSlot,query:selectorQuery,choiceIndex:selectorChoiceIndex,draft:followerSelectorDraft,artwork}); $("#skill-selector-title").textContent=view.title; $("#skill-selector-search").placeholder="Search skills…"; $("#skill-selector-results").innerHTML=view.resultsHtml; $("#skill-selector-detail").innerHTML=view.detailHtml; const confirm=$("[data-confirm-skill-selector]"); confirm.disabled=view.confirmDisabled; confirm.textContent=view.confirmLabel; }
function commitFollower(next,message){ plannerState.followers=next; persistPlannerState(); renderHeroPanel(); render(); renderConfiguration(); if(message)showToast(message); }

const memoryTypesByTier={level45:"Memory of Origin",level60:"Memory of Discipline",level75:"Memory of Progress"};
const heroMemoryIcons={
  "Memory of Origin":"./src/assets/tli/gear/Memory_Origin.webp",
  "Memory of Discipline":"./src/assets/tli/gear/Memory_Discipline.webp",
  "Memory of Progress":"./src/assets/tli/gear/Memory_Progress.webp"
};
const heroMemoryIcon=(type)=>heroMemoryIcons[type]||heroMemoryIcons["Memory of Origin"];
function heroMemoryTypeForTier(tier){ return memoryTypesByTier[String(tier||"").split(":").pop()]; }
function heroMemoryTierForType(type){
  const levelTier=Object.keys(memoryTypesByTier).find((tier)=>memoryTypesByTier[tier]===type);
  if(!levelTier)return null;
  const heroId=plannerState.hero.selectedHeroId;
  return heroId&&heroId!=="selena-sing-with-the-tide"?`${heroId}:${levelTier}`:levelTier;
}
function baseTraitMemory(){
  return plannerState.hero.memoryInventory?.find((memory)=>memory.id===plannerState.hero.baseTraitMemoryId)||null;
}
function canEquipBaseTraitMemory(memory){
  return memoryFitsBaseTraitSlot(memory,equippedBaseTraitSlot(plannerState.hero),Object.values(plannerState.hero.equippedMemoryIds||{}))&&!heroMemoryIsRevived(memory);
}
function baseTraitReduction(){
  const slot=equippedBaseTraitSlot(plannerState.hero),target=baseTraitMemory();
  if(!target||!memoryFitsBaseTraitSlot(target,slot,Object.values(plannerState.hero.equippedMemoryIds||{}))||heroMemoryIsRevived(target))return null;
  const range=slot.reductionRange;
  return Math.max(range.min,Math.min(range.max,plannerState.hero.baseTraitMemoryRoll??range.max));
}
function clearInvalidBaseTraitMemory(){
  if(plannerState.hero.baseTraitMemoryId&&baseTraitReduction()===null){plannerState.hero.baseTraitMemoryId="";plannerState.hero.baseTraitMemoryRoll=null;}
}
function heroMemoryIsRevived(memory){ return Boolean(memory&&(memory.revivalMethod&&memory.revivalMethod!=="none"||memory.waxAndWane||memory.risingMoon||memory.revivedAffix)); }
function memorySocketRevivalBadge(memory){
  if(!heroMemoryIsRevived(memory))return "";
  const symbolId=`memory-moon-${String(memory.id).replace(/[^a-z0-9_-]/gi,"")}`;
  return `<span class="hero-memory-revival-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><defs><linearGradient id="${symbolId}-shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".52" stop-color="#c9efff"/><stop offset="1" stop-color="#65bdf0"/></linearGradient><mask id="${symbolId}-cut" maskUnits="userSpaceOnUse"><rect width="24" height="24" fill="#fff"/><circle cx="14.9" cy="9" r="5.9" fill="#000"/></mask></defs><circle class="moon-disc" cx="12" cy="12" r="10.2"/><circle class="moon-crescent" cx="12" cy="12" r="6.7" fill="url(#${symbolId}-shine)" mask="url(#${symbolId}-cut)"/></svg></span>`;
}
function memoryRevivalBadge(memory){return heroMemoryIsRevived(memory)?'<span class="memory-revival-badge"><span aria-hidden="true">☾</span> Revived</span>':"";}
function memoryRevivedDetailsMarkup(details){
  const lines=details.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
  const effects=lines.filter((line)=>!/^Hero Trait Exclusive:/i.test(line));
  const exclusive=lines.find((line)=>/^Hero Trait Exclusive:/i.test(line));
  const trait=exclusive?.replace(/^Hero Trait Exclusive:\s*/i,"").split(/\s*\|\s*/);
  return `<div class="memory-revived-detail"><ul>${effects.map((line)=>`<li>${escapeHtml(line)}</li>`).join("")}</ul>${trait?`<div class="memory-revived-exclusive"><small>Hero trait exclusive</small><span>${escapeHtml(trait.filter(Boolean).join(" · "))}</span></div>`:""}</div>`;
}
function memoryRevivedAffixMarkup(memory){
  const name=normalizeRevivedAffix(memory.revivedAffix),special=lunarPhaseRevivedAffixesSs13.includes(name);
  const effect=revivedAffixForMemoryType(memory.revivedAffix,memory.type,memory.revivedTier,memory.revivedRoll);
  const tier=revivedAffixTiers(name).length?memory.revivedTier:null;
  const rawDetails=lunarPhaseRevivedAffixDetailsSs13[name];
  const details=name?.startsWith("Artificial Moon:")
    ? rawDetails?.replace(/\s*Reduces the Base Stats and Random Affixes of Memories installed in this slot by \d+%/i,"")
    : rawDetails;
  return `<div class="memory-revived-effect ${special?"special":""}">${Number.isInteger(tier)?affixTierBadge(`T${tier}`):""}<span class="memory-revived-name">${escapeHtml(effect)}</span>${details?`<small class="memory-revived-hint">Hold Alt for details</small>${memoryRevivedDetailsMarkup(details)}`:""}</div>`;
}
function otherEquippedRevivedMemory(memory){
  const equippedIds=[...Object.values(plannerState.hero.equippedMemoryIds||{}),plannerState.hero.baseTraitMemoryId];
  return heroMemoryIsRevived(memory)&&equippedIds.some((id)=>id&&id!==memory.id&&heroMemoryIsRevived(plannerState.hero.memoryInventory?.find((item)=>item.id===id)));
}
function unequipHeroMemory(tier){
  if(!tier||!plannerState.hero.equippedMemoryIds?.[tier])return;
  hidePlannerTooltip();
  plannerState.hero.memories[tier]="";
  plannerState.hero.memoryTraitLevels[tier]=0;
  delete plannerState.hero.equippedMemoryIds[tier];
  clearInvalidBaseTraitMemory();
  persistPlannerState();renderHeroTraitTree();renderHeroMemoryInventory();showToast("Hero memory unequipped");
}
function equipHeroMemory(memory){
  const tier=heroMemoryTierForType(memory?.type);
  if(!tier)return;
  if(otherEquippedRevivedMemory(memory)){showToast("Only one revived memory can be equipped");return;}
  hidePlannerTooltip();
  plannerState.hero.equippedMemoryIds||={};
  plannerState.hero.equippedMemoryIds[tier]=memory.id;
  plannerState.hero.memories[tier]=memory.name;
  plannerState.hero.memoryTraitLevels[tier]=traitLevelBonusForEnhancement(memory.enhancementLevel);
  clearInvalidBaseTraitMemory();
  persistPlannerState();renderHeroTraitTree();renderHeroMemoryInventory();showToast(`${toastText(memory.name)} equipped`);
}
function openHeroMemorySlot(memory,preferBase=false){
  const baseOpen=!plannerState.hero.baseTraitMemoryId&&canEquipBaseTraitMemory(memory);
  const tier=heroMemoryTierForType(memory?.type);
  const regularOpen=Boolean(tier&&!plannerState.hero.equippedMemoryIds?.[tier]&&!plannerState.hero.memories?.[tier]&&!otherEquippedRevivedMemory(memory));
  if(preferBase&&baseOpen)return "base";
  if(regularOpen)return tier;
  return baseOpen?"base":null;
}
function renderHeroMemoryInventory(){
  const inventory=plannerState.hero.memoryInventory||[];
  const equipped=plannerState.hero.equippedMemoryIds||{};
  const baseMode=activeHeroMemoryTier==="base",requiredType=equippedBaseTraitSlot(plannerState.hero)?.memoryType?.replace(/^Memory of /,"")||"";
  $("#hero-memory-title").textContent=baseMode?"Hero Memories · Base Trait Slot":"Hero Memories";
  $("#hero-memory-content").innerHTML=`<div class="hero-memory-inventory"><div class="hero-memory-list">${baseMode?`<p class="hero-memory-slot-hint">This slot accepts Memory of ${escapeHtml(requiredType)}. Right-click any memory to equip it in an open compatible slot.</p>`:""}${inventory.length?inventory.map((memory)=>{const tier=Object.keys(equipped).find((key)=>equipped[key]===memory.id),baseEquipped=plannerState.hero.baseTraitMemoryId===memory.id,compatible=canEquipBaseTraitMemory(memory),disabled=baseMode?!compatible&&!baseEquipped:!tier&&otherEquippedRevivedMemory(memory),available=tier||baseEquipped||openHeroMemorySlot(memory,baseMode);return `<article class="hero-memory-item memory-rarity-${escapeHtml(memory.rarity)} ${available?"":"incompatible"}" data-memory-inventory-id="${escapeHtml(memory.id)}"><img src="${heroMemoryIcon(memory.type)}" alt=""><div><strong>${escapeHtml(memory.name)}</strong><small>${escapeHtml(memory.type)} · ${escapeHtml(memory.rarity)}${tier?` · Equipped at Lv.${tier.match(/level(\d+)$/)?.[1]}`:""}${baseEquipped?" · Base trait slot":""}</small></div><button type="button" ${baseMode?`data-equip-base-memory="${escapeHtml(memory.id)}" ${disabled?"disabled title=\"Only a matching, unequipped memory fits this base trait slot\"":""}`:`data-equip-crafted-memory="${escapeHtml(memory.id)}" ${disabled?"disabled title=\"Only one revived memory can be equipped\"":""}`}>${baseMode?baseEquipped?"Unequip":compatible?"Equip":"Unavailable":tier?"Unequip":"Equip"}</button><button type="button" data-copy-crafted-memory="${escapeHtml(memory.id)}" aria-label="Copy ${escapeHtml(memory.name)}">Copy</button><button type="button" data-edit-crafted-memory="${escapeHtml(memory.id)}" aria-label="Edit ${escapeHtml(memory.name)}">✎</button><button type="button" data-delete-crafted-memory="${escapeHtml(memory.id)}" aria-label="Delete ${escapeHtml(memory.name)}">×</button></article>`;}).join(""):'<div class="hero-memory-empty">No memories crafted yet<br><button type="button" class="button" data-craft-hero-memory>Craft your first Memory</button></div>'}</div><div class="hero-memory-inventory-footer">${baseMode?plannerState.hero.baseTraitMemoryId?'<button type="button" class="button button-secondary" data-clear-base-memory>Unequip slot</button>':"":plannerState.hero.memories?.[activeHeroMemoryTier]?'<button type="button" class="button button-secondary" data-clear-hero-memory>Unequip slot</button>':""}<button type="button" class="button" data-craft-hero-memory>Craft Memory</button></div></div>`;
}
function startHeroMemoryCraft(memory=null){
  editingMemoryId=memory?.id||null;
  memoryDraft=memory?structuredClone(memory):{id:"",name:"",type:activeHeroMemoryTier==="base"?(equippedBaseTraitSlot(plannerState.hero)?.memoryType||"Memory of Origin"):heroMemoryTypeForTier(activeHeroMemoryTier),rarity:"",baseStat:"",enhancementLevel:1,waxAndWane:false,risingMoon:false,revivedAffix:"",revivedTier:1,revivedRoll:null,fixedAffixes:["",""],randomAffixes:["",""],fixedTiers:[1,1],randomTiers:[0,0],fixedRolls:[null,null],randomRolls:[null,null],traitLevelBonus:1};
  memoryDraft.name=memoryDraft.type;
  const oldRevivedEntry=regularRevivedAffixesSs13.find((entry)=>entry.effect===memoryDraft.revivedAffix);
  memoryDraft.revivedTier=memoryDraft.revivedTier??oldRevivedEntry?.tier??1;
  memoryDraft.revivedRoll=memoryDraft.revivedRoll??(oldRevivedEntry?revivedAffixRollRange(oldRevivedEntry.effect)?.max:null)??null;
  memoryDraft.revivedAffix=memoryDraft.revivedAffix==="Artificial Moon"?`Artificial Moon: ${memoryDraft.type.replace(/^Memory of /,"")}`:normalizeRevivedAffix(memoryDraft.revivedAffix);
  if(memoryDraft.revivedAffix.startsWith("Artificial Moon:"))memoryDraft.revivedRoll=null;
  delete memoryDraft.revivalMethod;
  memoryDraft.risingMoon=Boolean(memoryDraft.risingMoon||memoryDraft.fixedTiers?.includes(0));
  memoryDraft.enhancementLevel=clampMemoryEnhancement(memoryDraft.enhancementLevel,memoryDraft.rarity);
  memoryDraft.traitLevelBonus=traitLevelBonusForEnhancement(memoryDraft.enhancementLevel);
  memoryDraft.fixedTiers||=[1,1];memoryDraft.randomTiers||=[0,0];memoryDraft.fixedRolls||=[null,null];memoryDraft.randomRolls||=[null,null];
  renderHeroMemoryCraft();
}
function memoryRollRange(effect){const match=effect.match(/\((-?\d+)[–-](-?\d+)\)/);return match?{min:Number(match[1]),max:Number(match[2])}:null;}
function rolledMemoryAffix(effect,roll){const range=memoryRollRange(effect);return range&&Number.isFinite(roll)?effect.replace(/\(-?\d+[–-]-?\d+\)/,String(roll)):effect;}
const memoryAffixKey=(effect)=>effect.replace(/[-+%()–\d.]/g,"").replace(/\s+/g," ").trim().toLowerCase();
function memoryTierOptions(group,effect){
  if(!effect)return [];
  const kind=group==="fixedAffixes"?"Fixed Affix":"Random Affix",key=memoryAffixKey(effect);
  const tiers=heroMemoryTierAffixesSs13.filter((entry)=>entry.type===memoryDraft.type&&entry.kind===kind&&memoryAffixKey(entry.effect)===key);
  if(group==="fixedAffixes"&&memoryDraft.risingMoon)tiers.push(...heroMemoryFixedT0AffixesSs13.filter((entry)=>entry.type===memoryDraft.type&&memoryAffixKey(entry.baseEffect)===key));
  return tiers.sort((a,b)=>b.tier-a.tier);
}
function memoryResolvedAffix(group,index){
  const effect=memoryDraft[group][index];if(!effect)return "";
  const tierGroup=group==="fixedAffixes"?"fixedTiers":"randomTiers",rollGroup=group==="fixedAffixes"?"fixedRolls":"randomRolls";
  const selectedTier=memoryDraft[tierGroup][index];
  const tierEffect=memoryTierOptions(group,effect).find((entry)=>entry.tier===selectedTier)?.effect||effect;
  const range=memoryRollRange(tierEffect),roll=memoryDraft[rollGroup][index];
  return rolledMemoryAffix(tierEffect,range&&Number.isFinite(roll)?Math.max(range.min,Math.min(range.max,roll)):roll);
}
function memoryAffixControl(group,index,value,entries,label){
  const tierGroup=group==="fixedAffixes"?"fixedTiers":"randomTiers",rollGroup=group==="fixedAffixes"?"fixedRolls":"randomRolls",tiers=memoryTierOptions(group,value),activeTier=memoryDraft[tierGroup][index],activeEffect=tiers.find((entry)=>entry.tier===activeTier)?.effect||value,range=memoryRollRange(activeEffect),roll=memoryDraft[rollGroup]?.[index]??range?.max;
  const numericTiers=!range&&tiers.length>1&&tiers.every((entry)=>memoryTierNumericValue(entry.effect)!==null)&&new Set(tiers.map((entry)=>memoryTierNumericValue(entry.effect))).size===tiers.length;
  const tierValues=numericTiers?tiers.map((entry)=>memoryTierNumericValue(entry.effect)):[];
  const tierIndex=Math.max(0,tiers.findIndex((entry)=>entry.tier===activeTier));
  const controls=range?`<div class="memory-roll-controls"><input type="range" min="${range.min}" max="${range.max}" value="${roll}" data-memory-field="${rollGroup}.${index}" aria-label="${label} roll slider"><input type="number" min="${range.min}" max="${range.max}" step="1" value="${roll}" data-memory-field="${rollGroup}.${index}" aria-label="${label} roll value"></div>`:numericTiers?`<div class="memory-roll-controls"><input type="range" min="0" max="${tiers.length-1}" step="1" value="${tierIndex}" data-memory-tier-slider="${group}.${index}" aria-label="${label} tier value slider"><input type="number" min="${Math.min(...tierValues)}" max="${Math.max(...tierValues)}" step="any" value="${tierValues[tierIndex]}" data-memory-tier-value="${group}.${index}" aria-label="${label} tier value"></div>`:"";
  return `<label>${label}<select data-memory-field="${group}.${index}" aria-label="${label}"><option value="">None</option>${entries.map((entry)=>`<option value="${escapeHtml(entry.effect)}" ${value===entry.effect?"selected":""}>${escapeHtml(entry.effect)}</option>`).join("")}</select>${tiers.length>1?`<span class="memory-tier-row">${tiers.map((entry)=>`<button type="button" class="${entry.tier===activeTier?"active":""}" data-memory-tier-choice="${group}.${index}.${entry.tier}">T${entry.tier}</button>`).join("")}</span>`:""}${controls}</label>`;
}
function focusMemoryRollValue(field){
  const input=Array.from(document.querySelectorAll('#hero-memory-content input[type="number"]')).find((element)=>element.dataset.memoryField===field||element.dataset.memoryTierValue===field);
  if(input){input.focus();input.select();}
}
function memoryRevivalControls(draft){
  const regular=regularRevivedAffixNamesSs13.map((name)=>`<option value="${escapeHtml(name)}" data-revived-description="${escapeHtml(revivedAffixTiers(name)[0].effect)}" ${draft.revivedAffix===name?"selected":""}>${escapeHtml(name)}</option>`).join("");
  const lunar=lunarPhaseRevivedAffixesSs13.map((name)=>`<option value="${escapeHtml(name)}" ${draft.revivedAffix===name?"selected":""}>${escapeHtml(name)}</option>`).join("");
  const known=regularRevivedAffixNamesSs13.includes(draft.revivedAffix)||lunarPhaseRevivedAffixesSs13.includes(draft.revivedAffix);
  const saved=draft.revivedAffix&&!known?`<option value="${escapeHtml(draft.revivedAffix)}" selected>Saved effect</option>`:"";
  const tiers=revivedAffixTiers(draft.revivedAffix),active=tiers.find((entry)=>entry.tier===draft.revivedTier)||tiers[0],range=revivedAffixRollRange(active?.effect),roll=range?Math.max(range.min,Math.min(range.max,draft.revivedRoll??range.max)):null;
  return `<h3>Memory Revival</h3><label class="memory-wax"><span>Wax and Wane (+30% base stat)</span><input type="checkbox" data-memory-field="waxAndWane" ${draft.waxAndWane?"checked":""}></label><label class="memory-wax"><span>Rising Moon (T0 fixed affixes)</span><input type="checkbox" data-memory-field="risingMoon" ${draft.risingMoon?"checked":""}></label><label>Revived Affix<select data-memory-field="revivedAffix" aria-label="Revived affix"><option value="">None</option><optgroup label="Regular Revived Affixes">${regular}</optgroup><optgroup label="Lunar Phase">${lunar}</optgroup>${saved}</select></label>${active?`<div class="memory-revived-controls"><span class="memory-tier-row">${tiers.map((entry)=>`<button type="button" class="${entry.tier===active.tier?"active":""}" data-revived-tier="${entry.tier}">T${entry.tier}</button>`).join("")}</span>${range?`<div class="memory-roll-controls"><input type="range" min="${range.min}" max="${range.max}" value="${roll}" data-memory-field="revivedRoll" aria-label="Revived affix roll slider"><input type="number" min="${range.min}" max="${range.max}" step="1" value="${roll}" data-memory-field="revivedRoll" aria-label="Revived affix roll value"></div>`:""}</div>`:""}`;
}
function renderHeroMemoryCraft(){
  const draft=memoryDraft,maxEnhancement=memoryMaxEnhancementForRarity(draft.rarity),pool=(kind)=>{const base=heroMemoryAffixesSs13.filter((entry)=>entry.type===draft.type&&entry.kind===kind);return kind==="Fixed Affix"&&draft.risingMoon?[...base,...heroMemoryFixedT0AffixesSs13.filter((entry)=>entry.type===draft.type&&!base.some((item)=>memoryAffixKey(item.effect)===memoryAffixKey(entry.baseEffect))).map((entry)=>({...entry,effect:entry.baseEffect}))]:base;}, select=(field,value,entries,label)=>`<select data-memory-field="${field}" aria-label="${label}"><option value="">None</option>${entries.map((entry)=>`<option value="${escapeHtml(entry.effect)}" ${value===entry.effect?"selected":""}>${escapeHtml(entry.label||entry.effect)}</option>`).join("")}</select>`;
  $("#hero-memory-title").textContent=editingMemoryId?"Edit Memory":"Craft Memory";
  $("#hero-memory-content").innerHTML=`<div class="hero-memory-craft"><section class="hero-memory-form"><label>Memory Type</label><div class="hero-memory-choice-row memory-types">${Object.values(memoryTypesByTier).map((type)=>`<button type="button" class="${draft.type===type?"active":""}" data-memory-type="${type}"><img src="${heroMemoryIcon(type)}" alt="">${type}</button>`).join("")}</div><label>Crafting Rarity *</label><div class="hero-memory-choice-row rarities">${["Normal","Magic","Epic","Legendary","Ultimate"].map((rarity)=>`<button type="button" class="memory-rarity-${rarity.toLowerCase()} ${draft.rarity===rarity.toLowerCase()?"active":""}" data-memory-rarity="${rarity.toLowerCase()}">${rarity}</button>`).join("")}</div><label>Base Stat *${select("baseStat",draft.baseStat,pool("Base Stats").map((entry)=>({...entry,label:memoryBaseStatLabel(entry.effect)})),"Base stat")}</label><label>Enhancement Level <strong>Lv.${draft.enhancementLevel}</strong><span class="memory-roll-controls memory-enhancement-controls"><input type="range" min="1" max="${maxEnhancement}" value="${draft.enhancementLevel}" data-memory-field="enhancementLevel" aria-label="Enhancement level slider"><input type="number" min="1" max="${maxEnhancement}" step="1" value="${draft.enhancementLevel}" data-memory-field="enhancementLevel" aria-label="Enhancement level value"></span></label>${memoryRevivalControls(draft)}<h3>Fixed Affixes (${draft.fixedAffixes.filter(Boolean).length}/2)</h3>${draft.fixedAffixes.map((value,index)=>memoryAffixControl("fixedAffixes",index,value,pool("Fixed Affix"),`Fixed ${index+1}`)).join("")}<h3>Random Affixes (${draft.randomAffixes.filter(Boolean).length}/2)</h3>${draft.randomAffixes.map((value,index)=>memoryAffixControl("randomAffixes",index,value,pool("Random Affix"),`Random ${index+1}`)).join("")}</section><aside><span>Preview</span><div class="hero-memory-preview memory-rarity-${escapeHtml(draft.rarity||"normal")}">${draft.baseStat?`<header><img src="${heroMemoryIcon(draft.type)}" alt=""><div><strong>${escapeHtml(draft.type)}</strong><small>${escapeHtml(draft.rarity||"normal")} · HERO MEMORY</small></div></header>${memoryRevivalBadge(draft)}<p><span data-memory-enhancement-preview>Enhancement Level ${draft.enhancementLevel}/${maxEnhancement}</span><br><span data-memory-trait-preview>Trait Level +${traitLevelBonusForEnhancement(draft.enhancementLevel)}</span></p><h4>Implicit</h4><div class="memory-implicit ${draft.waxAndWane?"wax-applied":""}">${escapeHtml(memoryScaledBaseStat(draft.baseStat,draft.type,draft.enhancementLevel,draft.waxAndWane,draft.rarity))}</div>${draft.waxAndWane?`<h4>Memory Revival</h4><div>Wax and Wane · +30% base stat</div>`:""}${draft.revivedAffix?`<h4>Revived Affix${lunarPhaseRevivedAffixesSs13.includes(draft.revivedAffix)?" · Lunar Phase":""}</h4>${memoryRevivedAffixMarkup(draft)}`:""}${draft.fixedAffixes.some(Boolean)?`<h4>Fixed Affixes</h4>${draft.fixedAffixes.map((value,index)=>value?`<div data-memory-preview-affix="fixedAffixes.${index}">${escapeHtml(memoryResolvedAffix("fixedAffixes",index))}</div>`:"").join("")}`:""}${draft.randomAffixes.some(Boolean)?`<h4>Random Affixes</h4>${draft.randomAffixes.map((value,index)=>value?`<div data-memory-preview-affix="randomAffixes.${index}">${escapeHtml(memoryResolvedAffix("randomAffixes",index))}</div>`:"").join("")}`:""}`:'<p class="hero-memory-preview-empty">Select a base stat to preview memory</p>'}</div><div class="hero-memory-craft-actions"><button type="button" class="button button-secondary" data-back-hero-memory>Cancel</button><button type="button" class="button" data-save-crafted-memory ${draft.rarity&&draft.baseStat?"":"disabled"}>${editingMemoryId?"Save Changes":"Craft"}</button></div></aside></div>`;
  const traitPreview=$("#hero-memory-content [data-memory-trait-preview]");
  if(traitPreview)traitPreview.innerHTML=`Trait Level <b class="memory-trait-bonus">+${memoryDraft.traitLevelBonus}</b>`;
  $("#hero-memory-content").querySelectorAll("[data-memory-preview-affix]").forEach((preview)=>{
    const [group,indexText]=preview.dataset.memoryPreviewAffix.split("."),index=Number(indexText);
    preview.classList.add("memory-affix-row");
    preview.innerHTML=memoryAffixRowContent(memoryResolvedAffix(group,index),memoryDraft[group==="fixedAffixes"?"fixedTiers":"randomTiers"][index]);
  });
}
function updateMemoryDraftField(input){
  if(!memoryDraft)return;
  const field=input.dataset.memoryField;
  const value=input.type==="checkbox"?input.checked:input.type==="range"||input.type==="number"?Number(input.value):input.value;
  if(/^(fixedAffixes|randomAffixes|fixedRolls|randomRolls)\./.test(field||"")){
    const [group,indexText]=field.split("."),index=Number(indexText);
    if(group==="fixedRolls"||group==="randomRolls"){
      const affixGroup=group==="fixedRolls"?"fixedAffixes":"randomAffixes",tierGroup=group==="fixedRolls"?"fixedTiers":"randomTiers",tiers=memoryTierOptions(affixGroup,memoryDraft[affixGroup][index]);
      const effect=tiers.find((entry)=>entry.tier===memoryDraft[tierGroup][index])?.effect||memoryDraft[affixGroup][index],range=memoryRollRange(effect);
      memoryDraft[group][index]=range?Math.max(range.min,Math.min(range.max,value)):value;
    }else{
      memoryDraft[group][index]=value;
      const rollGroup=group==="fixedAffixes"?"fixedRolls":"randomRolls",tierGroup=group==="fixedAffixes"?"fixedTiers":"randomTiers";
      memoryDraft[tierGroup][index]=group==="fixedAffixes"&&memoryTierOptions(group,value).some((entry)=>entry.tier===1)?1:0;
      memoryDraft[rollGroup][index]=memoryRollRange(value)?.max??null;
    }
  }
  else if(field==="revivedAffix"){
    memoryDraft.revivedAffix=value;
    memoryDraft.revivedTier=1;
    memoryDraft.revivedRoll=revivedAffixRollRange(revivedAffixTiers(value)[0]?.effect)?.max??null;
  }
  else if(field==="revivedRoll"){
    const effect=revivedAffixTiers(memoryDraft.revivedAffix).find((entry)=>entry.tier===memoryDraft.revivedTier)?.effect;
    const range=revivedAffixRollRange(effect);
    memoryDraft.revivedRoll=range?Math.max(range.min,Math.min(range.max,value)):null;
  }
  else memoryDraft[field]=field==="enhancementLevel"?clampMemoryEnhancement(value,memoryDraft.rarity):value;
  if(field==="risingMoon"&&!value){memoryDraft.fixedAffixes=memoryDraft.fixedAffixes.map((effect)=>effect&&!heroMemoryTierAffixesSs13.some((entry)=>entry.type===memoryDraft.type&&entry.kind==="Fixed Affix"&&memoryAffixKey(entry.effect)===memoryAffixKey(effect))?"":effect);memoryDraft.fixedTiers=memoryDraft.fixedTiers.map((tier)=>tier===0?1:tier);}
  if(field==="enhancementLevel")memoryDraft.traitLevelBonus=traitLevelBonusForEnhancement(memoryDraft.enhancementLevel);
}
function updateMemoryAffixPreview(group,index){
  const preview=$("#hero-memory-content .hero-memory-preview")?.querySelector(`[data-memory-preview-affix="${group}.${index}"]`);
  if(preview)preview.innerHTML=memoryAffixRowContent(memoryResolvedAffix(group,index),memoryDraft[group==="fixedAffixes"?"fixedTiers":"randomTiers"][index]);
}
document.addEventListener("input",(event)=>{
  const tierSlider=event.target.closest("#hero-memory-content [data-memory-tier-slider]");
  if(tierSlider){
    const [group,indexText]=tierSlider.dataset.memoryTierSlider.split("."),index=Number(indexText),tiers=memoryTierOptions(group,memoryDraft[group][index]),entry=tiers[Number(tierSlider.value)];
    if(entry){memoryDraft[group==="fixedAffixes"?"fixedTiers":"randomTiers"][index]=entry.tier;memoryDraft[group==="fixedAffixes"?"fixedRolls":"randomRolls"][index]=null;const number=tierSlider.parentElement.querySelector("[data-memory-tier-value]");if(number)number.value=memoryTierNumericValue(entry.effect);tierSlider.closest("label").querySelectorAll("[data-memory-tier-choice]").forEach((button)=>button.classList.toggle("active",Number(button.dataset.memoryTierChoice.split(".")[2])===entry.tier));updateMemoryAffixPreview(group,index);}
    return;
  }
  if(!event.target.matches("#hero-memory-content [data-memory-field]"))return;
  if(event.target.type==="number"&&event.target.value==="")return;
  updateMemoryDraftField(event.target);
  const roll=event.target.dataset.memoryField?.match(/^(fixedRolls|randomRolls)\.(\d+)$/);
  if(roll){event.target.closest(".memory-roll-controls")?.querySelectorAll(`[data-memory-field="${roll[1]}.${roll[2]}"]`).forEach((control)=>{if(control!==event.target)control.value=memoryDraft[roll[1]][Number(roll[2])];});updateMemoryAffixPreview(roll[1]==="fixedRolls"?"fixedAffixes":"randomAffixes",Number(roll[2]));}
  if(event.target.dataset.memoryField==="revivedRoll"){
    event.target.closest(".memory-roll-controls")?.querySelectorAll('[data-memory-field="revivedRoll"]').forEach((control)=>{if(control!==event.target)control.value=memoryDraft.revivedRoll;});
    const preview=$("#hero-memory-content .memory-revived-effect .memory-revived-name");
    if(preview)preview.textContent=revivedAffixForMemoryType(memoryDraft.revivedAffix,memoryDraft.type,memoryDraft.revivedTier,memoryDraft.revivedRoll);
  }
  if(event.target.dataset.memoryField==="enhancementLevel"){
    event.target.closest(".memory-enhancement-controls")?.querySelectorAll('[data-memory-field="enhancementLevel"]').forEach((control)=>{if(control!==event.target)control.value=memoryDraft.enhancementLevel;});
    const label=event.target.closest("label")?.querySelector("strong");if(label)label.textContent=`Lv.${memoryDraft.enhancementLevel}`;
    const level=$("#hero-memory-content [data-memory-enhancement-preview]"),trait=$("#hero-memory-content [data-memory-trait-preview]");
    if(level)level.textContent=`Enhancement Level ${memoryDraft.enhancementLevel}/${memoryMaxEnhancementForRarity(memoryDraft.rarity)}`;
    if(trait)trait.innerHTML=`Trait Level <b class="memory-trait-bonus">+${memoryDraft.traitLevelBonus}</b>`;
    const implicit=$("#hero-memory-content .memory-implicit");if(implicit)implicit.textContent=memoryScaledBaseStat(memoryDraft.baseStat,memoryDraft.type,memoryDraft.enhancementLevel,memoryDraft.waxAndWane,memoryDraft.rarity);
  }
});
document.addEventListener("change",(event)=>{
  const tierControl=event.target.closest("#hero-memory-content [data-memory-tier-slider],#hero-memory-content [data-memory-tier-value]");
  if(tierControl){
    const id=tierControl.dataset.memoryTierSlider||tierControl.dataset.memoryTierValue,[group,indexText]=id.split("."),index=Number(indexText),tiers=memoryTierOptions(group,memoryDraft[group][index]);
    const entry=tierControl.dataset.memoryTierValue!==undefined?closestMemoryTier(tiers,tierControl.value):tiers[Number(tierControl.value)];
    if(entry)memoryDraft[group==="fixedAffixes"?"fixedTiers":"randomTiers"][index]=entry.tier;
    const scroll=$("#hero-memory-content .hero-memory-form")?.scrollTop||0;renderHeroMemoryCraft();$("#hero-memory-content .hero-memory-form").scrollTop=scroll;return;
  }
  if(!event.target.matches("#hero-memory-content [data-memory-field]"))return;
  updateMemoryDraftField(event.target);
  const scroll=$("#hero-memory-content .hero-memory-form")?.scrollTop||0;
  renderHeroMemoryCraft();
  $("#hero-memory-content .hero-memory-form").scrollTop=scroll;
});

function effectSummary(node, rank, multiplier=1) {
  if (node.replacedBy) return "Core replaced";
  const effects = node.effectsPerRank || node.effects || {}; if (!Object.keys(effects).length && node.description) return talentEffectText(node.description, rank, multiplier);
  return Object.entries(effects).slice(0, 2).map(([key,value]) => `${formatEffect(key, typeof value === "number" ? value * (node.effectsPerRank?rank:1) * multiplier : value)} ${effectLabel(key)}`).join(" · ");
}

const titleCase = (value) => value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());

function renderEquipment() {
  const equipmentImpact = currentEquipmentImpact();
  const items = equipmentImpact.allItems;
  const activeItems = items.filter((item) => !disabledEquipmentSlots.has(item.slot));
  $("#equipment-count").textContent = `${activeItems.length}/10`;
  $("#equipment-grid").innerHTML = equipmentSlots.map(([slot,label]) => { const item=items.find((entry)=>entry.slot===slot); const empty=!item||disabledEquipmentSlots.has(slot); return `<button type="button" class="equipment-item ${slot===selectedEquipmentSlot?"selected":""}${!empty&&curseItemOffReason(item)?" curse-limit-item":""} ${empty?"disabled":`rarity-${itemCardRarity(itemDisplayRarity(item),item)}${sixAffixClass(item)}${pricelessClass(item)}${itemLevel100Class(item)}${/scepter/i.test(item.base||"")?" scepter-icon":""}${/\bwand\b/i.test(item.base||"")?" wand-icon":""}`}" data-equipment-slot="${slot}" title="${empty?"Select this slot, then choose an Inventory item":"Right-click to unequip"}">${!empty&&curseItemOffReason(item)?curseOffBadge(curseItemOffReason(item)):""}<span>${label}</span><b>${empty?"+":`<img src="${gearIcon(item)}" alt="">`}</b><strong>${empty?"Empty":escapeHtml(item.name)}</strong><small>${empty?"Select slot":`Lv.${item.level||100}`}</small></button>`; }).join("");
  const inventory=inventoryItems();
  $("#inventory-count").textContent=`(${inventory.length})`;
  $("#equipment-inventory").innerHTML=inventory.length ? `<div class="gear-inventory-grid">${inventory.map((item)=>`<article class="inventory-item rarity-${itemCardRarity(itemDisplayRarity(item),item)}${sixAffixClass(item)}${pricelessClass(item)}${itemLevel100Class(item)}" data-equip-inventory="${escapeHtml(item.id)}"><button type="button" class="inventory-item-main" data-equip-inventory="${escapeHtml(item.id)}"><span class="inventory-item-icon"><img src="${gearIcon(item)}" alt=""></span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.base||titleCase(item.slot))} · Lv.${item.level||100}</small></button>${isItemEquipped(item)?'<em class="equipment-status">Equipped</em>':""}<span class="inventory-item-tools"><button type="button" data-quick-edit-item="${escapeHtml(item.id)}" title="Edit item">✎</button><button type="button" data-duplicate-item="${escapeHtml(item.id)}" title="Duplicate item">◉</button></span></article>`).join("")}</div>`:`<div class="gear-empty"><strong>No items crafted yet</strong><span>Use a crafting button above to add an item.</span></div>`;
  const item=items.find((entry)=>entry.slot===selectedEquipmentSlot);
  if(!item||disabledEquipmentSlots.has(selectedEquipmentSlot)){ $("#equipment-inspector").innerHTML=`<div class="comparison-empty"><strong>${equipmentSlots.find(([slot])=>slot===selectedEquipmentSlot)?.[1]||"Slot"} is empty</strong><span>Select a compatible item in Inventory to equip it here.</span></div>`; renderEquipmentComparison(); return; }
  const edited=Boolean(plannerState.equipmentOverrides[item.slot]);
  $("#equipment-inspector").innerHTML=`<div class="equipment-editor-heading"><div><h2>${escapeHtml(item.name)}</h2><p class="muted">${escapeHtml(item.base||titleCase(item.slot))} · Lv.${item.level||100}${item.energy?` · Energy ${item.energy}`:""}</p></div><span>${edited?"Inventory item":"Captured item"}</span></div><ul class="modifier-list">${(item.modifiers||[]).map((modifier,index)=>`<li class="${item.corrodedModifierIndices?.includes(index)?"corrosion-affix":""}">${escapeHtml(modifier)}</li>`).join("")||"<li>No affixes recorded</li>"}${(item.corrosionModifiers||[]).map((modifier)=>`<li class="corrosion-affix">${escapeHtml(modifier)}</li>`).join("")}</ul><div class="equipment-editor-actions"><button class="button button-secondary" type="button" data-edit-equipped="${item.slot}">Edit item</button><button class="button button-secondary" type="button" data-unequip-item="${item.slot}">Unequip</button></div>`;
  renderEquipmentComparison();
}

function compatibleEquipmentSlot(item){
  if(item.slot==="leftRing"){
    const equipped=currentEquipmentImpact().allItems.filter((entry)=>!disabledEquipmentSlots.has(entry.slot)), occupied=(slot)=>equipped.some((entry)=>entry.slot===slot);
    if(selectedEquipmentSlot==="rightRing")return "rightRing";
    if(selectedEquipmentSlot==="leftRing"&&!occupied("leftRing"))return "leftRing";
    if(occupied("leftRing")&&!occupied("rightRing"))return "rightRing";
    if(!occupied("leftRing"))return "leftRing";
    return selectedEquipmentSlot==="rightRing"?"rightRing":"leftRing";
  }
  if(item.slot==="mainHand"){
    if(selectedEquipmentSlot==="secondaryHand")return "secondaryHand";
    if(!disabledEquipmentSlots.has("mainHand")&&disabledEquipmentSlots.has("secondaryHand"))return "secondaryHand";
    return "mainHand";
  }
  return item.slot;
}
function equipmentEnergyAllowed(slot){ return !["necklace","belt","leftRing","rightRing"].includes(slot); }
function maxEquipmentEnergy(itemLevel,slot,base=""){
  if(!equipmentEnergyAllowed(slot))return 0;
  const level=Number(itemLevel);
  const singleHandCaps=[0,9,12,15,18,21,34,48,61];
  const band=Number.isFinite(level)&&level>=45?Math.min(8,Math.floor((level-45)/5)+1):0;
  const twoHanded=slot==="chest"||["Two-Handed Sword","Two-Handed Hammer","Two-Handed Axe","Tin Staff","Cudgel","Bow","Crossbow","Musket","Fire Cannon"].includes(base);
  return singleHandCaps[band]*(twoHanded?2:1);
}
function selectedBeltBlend(root,selector="[data-craft-belt-blend]"){ return beltBlendById(root?.querySelector(selector)?.value); }
function towerSequencesForType(type){ return towerSequencesSs13.filter((entry)=>entry.weaponType===type); }
function towerSequenceById(id){ return towerSequencesSs13.find((entry)=>entry.id===id); }
function towerSequenceOptions(type,selectedId=""){
  return towerSequenceOptionMarkup(towerSequencesForType(type),selectedId);
}
function itemWeaponType(item){ return rareBaseItemsSs13.find((entry)=>entry.id===item?.baseId)?.type||craftItemTypes.find(([type])=>type===item?.base)?.[0]||item?.base||""; }
function modifiersWithoutSpecials(item){ const blend=beltBlendById(item?.beltBlendId), sequence=towerSequenceById(item?.towerSequenceId); let modifiers=[...(item?.modifiers||[])]; for(const special of [...(item?.beltBlendModifiers||[]),blend?.modifier,sequence?.modifier,...(item?.rarity==="legendary"?item.implicitModifiers||[]:[])]){ const index=modifiers.lastIndexOf(special); if(index>=0)modifiers.splice(index,1); } return modifiers; }
function applyEditedModifierStructure(item,values){
  if(![item.implicitModifiers,item.baseAffixModifiers,item.prefixModifiers,item.suffixModifiers,item.legendaryModifiers].some(Array.isArray))return;
  // A legendary item's base implicit is not edited (modifiersWithoutSpecials leaves it out); it keeps its lines.
  let offset=0; for(const key of ["implicitModifiers","baseAffixModifiers","prefixModifiers","suffixModifiers","legendaryModifiers"].filter((key)=>!(item.rarity==="legendary"&&key==="implicitModifiers"))){ const count=item[key]?.length||0; item[key]=values.slice(offset,offset+count); offset+=count; }
}
function equippedInventorySource(item){
  const sourceId=plannerState?.equipmentOverrides?.[item?.slot]?.sourceInventoryId;
  return sourceId?(plannerState.equipmentInventory||[]).find((entry)=>entry.id===sourceId):null;
}
function itemDisplayRarity(item){
  const displayItem=item?.rarity?item:(equippedInventorySource(item)||item);
  if(displayItem?.rarity==="vorax"||/^Vorax Limb:/i.test(displayItem?.name||item?.name||"")||/^Vorax(?: Gear| Limb:)/i.test(displayItem?.base||item?.base||"")) return "vorax";
  const normalized=(item?.name||"").replace(/ - Priceless$/i,"").toLowerCase();
  if(displayItem?.rarity==="legendary"||legendaryGearSs13.some((entry)=>entry.name.toLowerCase()===normalized)) return "legendary";
  const base=rareBaseForItem(item,[normalized,item?.base]);
  const implicitCount=base?.modifiers?.length||0;
  const affixCount=Number.isInteger(item?.affixCount)?item.affixCount:Math.max(0,(item?.modifiers?.length||0)-implicitCount)+(item?.corrosionModifiers?.length||0);
  return affixCount===0?"common":affixCount<=2?"magic":"epic";
}
function hasSixCraftAffixes(item){ if(["legendary","vorax"].includes(itemDisplayRarity(item)))return false; const displayItem=item?.prefixModifiers||item?.suffixModifiers?item:(equippedInventorySource(item)||item); return (displayItem?.prefixModifiers?.filter(Boolean).length||0)===3&&(displayItem?.suffixModifiers?.filter(Boolean).length||0)===3; }
function sixAffixClass(item){ return hasSixCraftAffixes(item)?" six-affix":""; }
function isPricelessItem(item){ const namedPriceless=/(?:^|\s)-?\s*Priceless$/i.test(item?.name||""); const rarity=itemDisplayRarity(item); const level100Crafted=Number(item?.itemLevel)===100&&!["legendary","vorax"].includes(rarity); return namedPriceless||level100Crafted; }
function pricelessClass(item){ return isPricelessItem(item)?" priceless-item":""; }
function itemLevel100Class(item){ return !["vorax","legendary"].includes(itemDisplayRarity(item))&&Number(item?.itemLevel??equippedInventorySource(item)?.itemLevel)===100?" item-level-100":""; }
function inventoryItems(){ const removed=new Set(plannerState.removedInventoryItemIds||[]); return [...selenaScorchingBeamGearSs13.items.map((item)=>({...item,id:`captured-${item.slot}`,rarity:"captured"})),...(plannerState.equipmentInventory||[])].filter((item)=>!removed.has(item.id)); }
function equipInventoryItem(item,targetSlot=null){
  if(!item) return; const slot=targetSlot||compatibleEquipmentSlot(item); if(!canDropGearInSlot(item,slot))return;
  const previousSlot=equippedSlotForInventoryItem(item);
  if(previousSlot&&previousSlot!==slot)disabledEquipmentSlots.add(previousSlot);
  const {id,source:sourceUrl,slot:sourceSlot,remoteIcon,...override}=item;
  for(const [equippedSlot,equipped] of Object.entries(plannerState.equipmentOverrides||{}))if(equippedSlot!==slot&&equipped.sourceInventoryId===id)delete plannerState.equipmentOverrides[equippedSlot];
  plannerState.equipmentOverrides[slot]={...structuredClone(override),sourceInventoryId:id}; disabledEquipmentSlots.delete(slot); selectedEquipmentSlot=slot; persistPlannerState(); renderCandidateViews(); showToast(`${toastText(item.name)} equipped`);
}
function editingLegendaryModifierTemplate(source,index){ const corroded=editingCorrodedModifierIndices.has(index), choice=placeholderOption(source.id,index,editingPlaceholderChoices.get(index)); if(choice)return placeholderOptionTemplate(choice,corroded); if(source.id==="Folklore_of_Locking_Fingers"&&index===2)return folkloreRingModifier(editingFolkloreRingOption,corroded); const tierTemplate=corroded?null:legendaryTierTemplate(source.id,index,editingTierChoices.get(index)); if(tierTemplate)return tierTemplate; return corroded?(legendaryCorrodedModifiersSs13[source.id]?.[index]||source.modifiers[index]):source.modifiers[index]; }
// Legendary (and captured legendary) items edit their catalog lines only; base implicits and other non-catalog lines are
// found by text (src/legendary-editor-model.js), stay out of the controls and are kept as they are on save.
function legendaryEditorSource(item){ if(!item||!["legendary","captured"].includes(item.rarity))return null; return legendarySourceForItem(item,legendaryGearSs13,legendaryCorrodedModifiersSs13); }
function inventoryLegendaryModel(item,source=legendaryEditorSource(item)){ return source?legendaryEditorModel(item,source,{corrodedLines:legendaryCorrodedModifiersSs13[source.id],specialTexts:[beltBlendById(item?.beltBlendId)?.modifier,towerSequenceById(item?.towerSequenceId)?.modifier,...(item?.beltBlendModifiers||[])].filter(Boolean)}):null; }
function editingLegendaryLineText(source,index){ if(editingLegendaryTexts.has(index))return editingLegendaryTexts.get(index); const template=editingLegendaryModifierTemplate(source,index), ranges=modifierRollRanges(template); return ranges.length?resolveModifierRolls(template,ranges.map(preferredModifierRoll)):template; }
function inventoryEditingPreview(item){ const source=legendaryEditorSource(item); if(!source)return item; const model=inventoryLegendaryModel(item,source); return {...item,...applyLegendaryEditorEdits(item,model,{texts:new Map(editableLegendarySlots(model,source).map((slot)=>[slot.catalogIndex,editingLegendaryLineText(source,slot.catalogIndex)])),corrodedCatalog:editingCorrodedModifierIndices})}; }
function renderInventoryItemDialog(){
  const item=inventoryItems().find((entry)=>entry.id===selectedInventoryItemId); if(!item) return;
  $("#inventory-item-title").textContent=item.name;
  if(inventoryItemEditing){
    $("#inventory-item-dialog").classList.add("gear-editor-dialog");
    const weaponType=itemWeaponType(item), sequenceEntries=towerSequencesForType(weaponType);
    $("#inventory-item-body").innerHTML=`<div class="gear-edit-layout"><section><div class="gear-edit-selected"><img src="${gearIcon(item)}" alt=""><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.base||titleCase(item.slot))}</small></span><button type="button" data-change-edit-item>Change</button></div><label>Name<input data-inventory-edit-name value="${escapeHtml(item.name)}"></label><div class="gear-edit-pair"><label>Item level<input type="number" min="1" max="100" data-inventory-edit-level value="${item.level||100}"></label>${equipmentEnergyAllowed(item.slot)?`<label>Equipment Energy<input type="number" min="0" data-inventory-edit-energy value="${item.energy||0}"></label>`:""}</div><label>Base item<input data-inventory-edit-base value="${escapeHtml(item.base||"")}"></label>${item.slot==="belt"?`<label>Belt Blend<select data-edit-belt-blend>${beltBlendOptions(item.beltBlendId)}</select></label>`:""}${sequenceEntries.length?`<label>TOWER Sequence<select data-edit-tower-sequence>${towerSequenceOptions(weaponType,item.towerSequenceId)}</select></label>`:""}<label>Corrosion Implicit<select data-edit-corrosion>${editCorrosionOptions(item)}</select></label><h3>${item.rarity==="legendary"?"Legendary Mods":legendaryEditorSource(item)?"Legendary affixes":"Prefixes and Suffixes"}</h3><div class="gear-mod-editor">${(legendaryEditorSource(item)?editableLegendarySlots(inventoryLegendaryModel(item),legendaryEditorSource(item)).map((slot)=>modifierEditorControl(item,slot.text,slot.catalogIndex)):modifiersWithoutSpecials(item).map((modifier,index)=>modifierEditorControl(item,modifier,index))).join("")||"<p>No modifiers configured.</p>"}${editCorrosionRows(item)}</div></section><aside><small>Preview</small>${equipmentPreview(inventoryEditingPreview(item))}</aside></div>`;
    $("#inventory-item-dialog footer").innerHTML='<button class="button button-secondary" type="button" data-close-inventory-item>Cancel</button><button class="button" type="button" data-save-inventory-item>Save Changes</button>';
    $("#inventory-item-dialog footer").hidden=false;
  } else {
    $("#inventory-item-dialog").classList.remove("gear-editor-dialog");
    $("#inventory-item-body").innerHTML=`<div class="inventory-quick-actions rarity-${itemCardRarity(itemDisplayRarity(item),item)}${sixAffixClass(item)}${pricelessClass(item)}"><img src="${gearIcon(item)}" alt=""><strong>${escapeHtml(item.name)}</strong><button type="button" data-equip-selected-item>${isItemEquipped(item)?"Unequip":"Equip"}</button><button type="button" data-edit-inventory-item>Edit</button><button type="button" data-copy-inventory-item>Copy</button><button type="button" class="danger" data-delete-inventory-item>Delete</button></div>`;
  }
  if(!inventoryItemEditing) $("#inventory-item-dialog footer").hidden=true;
}
function equippedSlotForInventoryItem(item){ const overrideSlot=Object.entries(plannerState.equipmentOverrides||{}).find(([slot,override])=>override.sourceInventoryId===item?.id&&!disabledEquipmentSlots.has(slot))?.[0]; if(overrideSlot)return overrideSlot; if(item?.id?.startsWith("captured-"))return currentEquipmentImpact().allItems.find((entry)=>!disabledEquipmentSlots.has(entry.slot)&&entry.name===item.name&&entry.slot===item.slot)?.slot||null; return null; }
function isItemEquipped(item){
  const overrideSlot=equippedSlotForInventoryItem(item);
  if(overrideSlot) return true;
  if(item?.id&&!item.id.startsWith("captured-"))return false;
  return currentEquipmentImpact().allItems.some((entry)=>!disabledEquipmentSlots.has(entry.slot)&&entry.name===item.name&&entry.slot===item.slot);
}
const capturedGearIcons={
  "Long Night Sorcerer's Robe - Priceless":"./src/assets/tli/gear/base-Long_Night_Sorcerers_Robe.webp",
  "Elder Sage Girdle - Priceless":"./src/assets/tli/gear/base-Elder_Sage_Girdle.webp",
  "Dark Gaze Scepter - Priceless":"./src/assets/tli/gear/base-Dark_Gaze_Scepter.webp",
  "Vorax Limb: Digits":"./src/assets/tli/gear/base-Vorax_Limb_Digits.webp"
};
function gearIcon(item){
  // A rare item shows its own base's icon (by base id), so a stored icon from an older lookup cannot stick.
  const ownBase=rareBaseById(item.baseId); if(ownBase) return ownBase.icon;
  if(item.icon) return item.icon;
  const normalizedName=(item.name||"").replace(/ - Priceless$/i,"").trim().toLowerCase();
  const normalizedBase=(item.base||"").trim().toLowerCase();
  return capturedGearIcons[item.name]
    ||(rareBaseByName(normalizedName)||rareBaseByName(normalizedBase))?.icon
    ||legendaryGearSs13.find((entry)=>entry.name.toLowerCase()===normalizedName)?.icon
    ||legendaryGearSs13.find((entry)=>entry.slot===compatibleEquipmentSlot(item))?.icon
    ||legendaryGearSs13[0]?.icon||"";
}
function modifierRollRange(text){ const match=text.match(/\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/); return match?{min:Number(match[1]),max:Number(match[2])}:null; }
function resolveModifierRoll(template,value){ return template.replace(/\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/,String(value)); }
function modifierRollRanges(text){ return [...text.matchAll(/\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g)].map((match)=>({min:Number(match[1]),max:Number(match[2]),token:match[0]})); }
function modifierRollStep(range){ const decimals=Math.max(String(range.min).split(".")[1]?.length||0,String(range.max).split(".")[1]?.length||0); return decimals?1/(10**decimals):1; }
function preferredModifierRoll(range){ return range.max<=0?range.min:range.max; }
function negativeRollFill(range,value){ return range.max===range.min?100:((range.max-Number(value))/(range.max-range.min))*100; }
function updateNegativeRollVisual(range){ if(!range?.classList.contains("negative-roll-range"))return; const min=Number(range.min), max=Number(range.max); range.style.setProperty("--roll-fill",`${negativeRollFill({min,max},range.value)}%`); }
function resolveModifierRolls(template,values){ let index=0; return template.replace(/\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g,(match,low,high,offset,whole)=>{ const value=String(values[index++]); /* a clause-leading range that spans zero ("(-1–1) Main Skill Level") carries no sign of its own: a positive roll is written "+N" so the signed readers see it */ return Number(low)<=0&&Number(value)>0&&!/^[+-]/.test(value)&&(offset===0||/\n\s*$/.test(whole.slice(0,offset)))?`+${value}`:value; }).replace(/(\d)\s+%/g,"$1%"); }
function modifierSignature(text){ return legendaryModifierSignature(text); }
function legendaryKnownModifierSignatures(source){ const options=source.id==="Folklore_of_Locking_Fingers"?[folkloreRingModifier("left"),folkloreRingModifier("right"),folkloreRingModifier("left",true),folkloreRingModifier("right",true)]:[]; return new Set([...source.modifiers,...(legendaryCorrodedModifiersSs13[source.id]||[]),...options,...allPlaceholderTemplates(source.id)].map(modifierSignature)); }
function resolvedRollValues(template,resolved){
  const range=/\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g, escape=(text)=>text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+"), parts=[]; let cursor=0,match;
  while((match=range.exec(template))){ parts.push(escape(template.slice(cursor,match.index)),"(-?\\d+(?:\\.\\d+)?)"); cursor=match.index+match[0].length; }
  const result=String(resolved||"").match(new RegExp(`^${parts.join("")}${escape(template.slice(cursor))}$`,"i")); return result?result.slice(1).map(Number):[];
}
function tierMatchesResolved(tier,resolved){ const ranges=modifierRollRanges(tier.template); if(!ranges.length)return String(tier.template).replace(/\s+/g," ").trim().toLowerCase()===String(resolved).replace(/\s+/g," ").trim().toLowerCase(); const values=resolvedRollValues(tier.template,resolved); return modifierSignature(tier.template)===modifierSignature(resolved)&&values.length===ranges.length&&values.every((value,index)=>Number.isFinite(value)&&value>=ranges[index].min&&value<=ranges[index].max); }
function legendaryModifierTemplate(item,index,corroded=selectedLegendaryCorrodedModifiers.has(index)){ const choice=placeholderOption(item.id,index,selectedLegendaryPlaceholderChoices.get(index)); if(choice)return placeholderOptionTemplate(choice,corroded); if(item.id==="Folklore_of_Locking_Fingers"&&index===2)return folkloreRingModifier(selectedFolkloreRingOption,corroded); const tierTemplate=corroded?null:legendaryTierTemplate(item.id,index,selectedLegendaryTierChoices.get(index)); if(tierTemplate)return tierTemplate; return corroded?(legendaryCorrodedModifiersSs13[item.id]?.[index]||item.modifiers[index]):item.modifiers[index]; }
function configuredLegendaryModifiers(){ const selected=legendaryGearSs13[selectedLegendaryIndex]; if(!selected) return []; return selected.modifiers.map((_,index)=>{ const template=legendaryModifierTemplate(selected,index), sliders=[...document.querySelectorAll(`[data-legendary-roll="${index}"]`)]; return sliders.length?resolveModifierRolls(template,sliders.map((slider)=>slider.value)):template; }); }
function configuredLegendaryModifiersWithSpecials(){ const blend=beltBlendById(selectedLegendaryBeltBlendId), sequence=towerSequenceById(selectedLegendaryTowerSequenceId); return [...configuredLegendaryModifiers(),...(blend?[blend.modifier]:[]),...(sequence?[sequence.modifier]:[])]; }
function maxRolledLegendaryModifiers(item){ return item.modifiers.map((_,index)=>{ const template=legendaryModifierTemplate(item,index), ranges=modifierRollRanges(template); return ranges.length?resolveModifierRolls(template,ranges.map(preferredModifierRoll)):template; }); }
function affixRollInputs(range,attributes,current){ const value=Number.isFinite(current)?current:preferredModifierRoll(range), negativeOnly=range.max<=0, fill=negativeRollFill(range,value); return `<span class="affix-roll-inputs${negativeOnly?" negative-roll":""}"><input type="range" class="${negativeOnly?"negative-roll-range":""}" min="${range.min}" max="${range.max}" step="${modifierRollStep(range)}" value="${value}" style="${negativeOnly?`--roll-fill:${fill}%`:""}" ${attributes}><input class="affix-roll-number" type="number" min="${range.min}" max="${range.max}" step="${modifierRollStep(range)}" value="${value}" data-affix-roll-number></span><em>${value}</em>`; }
// A modifier line as HTML (the one helper for every tooltip line: gear, belt blends, slates, memories, kismets, pact nodes, prisms,
// talents). A keyword roll (Pantheon's Elegy's Dirges), a named gear affix (Wield My Sword, src/named-gear-affixes.js), a belt
// blend's bracketed name or a core talent named on its own (src/core-talent-keywords.js; Alt lists its description, unbadged)
// shows its keyword in the revived-memory keyword style; holding Alt (body.revival-alt-held, setRevivalAltDetails) expands it into its effect lines, each with its own badge when `lineStatus` (line -> status) is given, else inline "Keyword: effect". Other lines are plain text.
function modifierTextMarkup(text,lineStatus=null){ const clean=String(text??"").replace(/(\d)\s+%/g,"$1%"), parts=keywordRollParts(clean); if(!parts)return escapeHtml(clean); const effect=lineStatus?`<span class="keyword-roll-effect keyword-roll-lines">${parts.effect.map((line,lineIndex)=>{ if(parts.description)return `<span class="keyword-roll-line"><span>${escapeHtml(line)}</span></span>`; const fixed=parts.statuses?.[lineIndex], status=fixed?.status||lineStatus(line); return `<span class="keyword-roll-line"><span>${escapeHtml(line)}</span><b class="${status==="In calc"?"calculated":neutralStatuses.has(status)?"neutral":"pending"}"${fullTextTitle(fixed?.reason)}>${escapeHtml(status)}</b></span>`; }).join("")}</span>`:`<span class="keyword-roll-effect">${parts.inline?` · ${escapeHtml(parts.keyword)}`:""}: ${escapeHtml(parts.effect.join("\n"))}</span>`; if(parts.inline)return `<span class="keyword-roll">${escapeHtml(parts.inline.before)}<span class="keyword-roll-name">${escapeHtml(parts.keyword)}</span>${escapeHtml(parts.inline.after)}${effect}</span>`; return `<span class="keyword-roll"><span class="keyword-roll-name">${escapeHtml(parts.keyword)}</span>${effect}</span>${parts.rest.map((line)=>`\n${escapeHtml(line)}`).join("")}`; }
// A dropdown of the rolls a "<Random …>" placeholder line can take; empty when the line is not a resolved placeholder.
// A tier dropdown for a tiered legendary line (src/legendary-affix-tiers.js, e.g. Ice Pulse's Spell Damage); it sets the line's
// roll range. Empty for every other line, and while the line is corroded (the corroded form has its own range).
function legendaryTierControl(sourceId,index,chosen,corroded,attribute){ const tiers=legendaryLineTiers(sourceId,index); if(!tiers||corroded)return ""; const current=tiers.some((entry)=>entry.tier===Number(chosen))?Number(chosen):tiers[0].tier; return `<label class="legendary-ring-choice">Tier<select ${attribute}="${index}">${tiers.map((entry)=>`<option value="${entry.tier}" ${entry.tier===current?"selected":""}>T${entry.tier} · ${escapeHtml(entry.text.replace(/(\d|\))\s+%/g,"$1%"))}</option>`).join("")}</select></label>`; }
function placeholderChoiceControl(sourceId,index,chosen,attribute){ const pool=placeholderPool(sourceId,index); if(!pool)return ""; return `<label class="legendary-ring-choice">Random roll<select ${attribute}="${index}"><option value="">Not chosen · ${escapeHtml(pool.placeholder)}</option>${pool.options.map((option)=>`<option value="${escapeHtml(option.id)}" ${option.id===chosen?"selected":""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`; }
function legendaryModifierControl(item,index){ const corroded=selectedLegendaryCorrodedModifiers.has(index), template=legendaryModifierTemplate(item,index,corroded), ranges=modifierRollRanges(template), values=ranges.map(preferredModifierRoll), resolved=ranges.length?resolveModifierRolls(template,values):template; const ringChoice=item.id==="Folklore_of_Locking_Fingers"&&index===2?`<label class="legendary-ring-choice">Ring effect<select data-legendary-ring-option><option value="left" ${selectedFolkloreRingOption==="left"?"selected":""}>Left Ring · regain Blur</option><option value="right" ${selectedFolkloreRingOption==="right"?"selected":""}>Right Ring · gain Blur Rating</option></select></label>`:""; return `<div class="legendary-mod-control ${corroded?"corrosion-affix":""}"><span><button type="button" data-toggle-legendary-corrosion="${index}" ${legendaryCorrodedModifiersSs13[item.id]?.[index]?"":"disabled"}>${corroded?"Corroded":"Normal"}</button><span data-legendary-mod="${index}">${modifierTextMarkup(resolved)}</span></span>${ringChoice}${placeholderChoiceControl(item.id,index,selectedLegendaryPlaceholderChoices.get(index),"data-legendary-placeholder")}${legendaryTierControl(item.id,index,selectedLegendaryTierChoices.get(index),corroded,"data-legendary-tier")}${ranges.map((range,rangeIndex)=>`<label>${affixRollInputs(range,`data-legendary-roll="${index}" data-range-index="${rangeIndex}"`)}</label>`).join("")}</div>`; }
function interpolateCorrosionRoll(entry,percent=100){ if(entry.min===entry.max)return entry.min; const lows=[...entry.min.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0])), highs=[...entry.max.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0])); let i=0; return entry.min.replace(/-?\d+(?:\.\d+)?/g,(raw)=>{const lo=Number(raw),hi=highs[i]??lo;i+=1;const value=lo+(hi-lo)*(Number(percent)/100);return Number.isInteger(lo)&&Number.isInteger(hi)?String(Math.round(value)):String(Math.round(value*10)/10);}); }
function configuredCorrosionModifier(){ const entry=corrosionImplicitsForBase(selectedLegendaryBase)[selectedCorrosionIndex]; if(!entry)return ""; return interpolateCorrosionRoll(entry,$("[data-corrosion-roll]")?.value??100); }
// Rare / Vorax crafter: the item type's corrosion base pool (src/corrosion-implicit-options.js; Vorax gear has none), as in the
// legendary editor. An edited item's saved corrosion lines stay as saved (select.dataset.savedLines / savedChoice) until another
// line is chosen or the roll moves; "current" keeps saved lines the pool does not hold.
function craftCorrosionPool(type){ return corrosionPoolForItem({base:type,rarity:equipmentCraftMode}); }
function craftCorrosionOptions(type,chosen="-1",savedLines=[]){ return `<option value="-1">None</option>${craftCorrosionPool(type).map((entry,index)=>`<option value="${index}" ${String(index)===String(chosen)?"selected":""}>${escapeHtml(entry.label)}</option>`).join("")}${savedLines.length?`<option value="current" ${chosen==="current"?"selected":""}>${escapeHtml(savedLines.join(" · "))}</option>`:""}`; }
function craftCorrosionRow(type,index,percent=100,text=null){ const entry=craftCorrosionPool(type)[Number(index)]; return entry?`<div class="fixed-mod corrosion-affix"><b>Corroded</b><span data-craft-corrosion-text>${escapeHtml(text||interpolateCorrosionRoll(entry,percent))}</span>${entry.min!==entry.max?`<input type="range" min="0" max="100" value="${percent}" data-craft-corrosion-roll>`:""}</div>`:""; }
function configuredCraftCorrosion(body){ const select=body?.querySelector("[data-craft-corrosion]"); if(!select)return []; if(select.dataset.savedChoice===select.value&&!select.dataset.rollTouched){ try{ return JSON.parse(select.dataset.savedLines||"[]"); }catch{ return []; } } if(select.value==="current")return []; const entry=craftCorrosionPool(body.querySelector("[data-craft-type]")?.value)[Number(select.value)]; return entry?[interpolateCorrosionRoll(entry,body.querySelector("[data-craft-corrosion-roll]")?.value??100)]:[]; }
// Inventory editor: the item base's whole corrosion pool (src/corrosion-implicit-options.js), plus the saved lines when the pool
// does not hold them, so they are never dropped by opening the editor.
function editCorrosionOptions(item){ const pool=corrosionPoolForItem(item), saved=(item.corrosionModifiers||[]).filter(Boolean), kept=corrosionEditorChoice(pool,saved).value==="current", value=editingCorrosionImplicit.value; return `<option value="" ${value===""?"selected":""}>None</option>${pool.map((entry,index)=>`<option value="pool:${index}" ${value===`pool:${index}`?"selected":""}>${escapeHtml(entry.label)}</option>`).join("")}${kept?`<option value="current" ${value==="current"?"selected":""}>${escapeHtml(saved.join(" · "))}</option>`:""}`; }
function editCorrosionEntry(item){ const value=editingCorrosionImplicit.value; return value.startsWith("pool:")?corrosionPoolForItem(item)[Number(value.slice(5))]||null:null; }
function editCorrosionRows(item){ const entry=editCorrosionEntry(item); return editingCorrosionImplicit.lines.map((modifier)=>`<div class="fixed-mod corrosion-affix" data-edit-corrosion-row><b>Corroded</b><span data-edit-corrosion-text>${escapeHtml(modifier)}</span>${entry&&entry.min!==entry.max?`<input type="range" min="0" max="100" value="${editingCorrosionImplicit.percent}" data-edit-corrosion-roll>`:""}</div>`).join(""); }
function selectEditCorrosion(item,value){ const saved=corrosionEditorChoice(corrosionPoolForItem(item),item?.corrosionModifiers), savedLines=(item?.corrosionModifiers||[]).filter(Boolean), entry=value.startsWith("pool:")?corrosionPoolForItem(item)[Number(value.slice(5))]:null; editingCorrosionImplicit=value&&value===saved.value?{value,percent:saved.percent,lines:savedLines}:entry?{value,percent:100,lines:[interpolateCorrosionRoll(entry,100)]}:{value:"",percent:100,lines:[]}; const editor=$("#inventory-item-body .gear-mod-editor"); if(!editor)return; editor.querySelectorAll("[data-edit-corrosion-row]").forEach((row)=>row.remove()); editor.insertAdjacentHTML("beforeend",editCorrosionRows(item)); }
function modifierEditorControl(item,modifier,index){ const source=legendaryEditorSource(item)||legendaryGearSs13.find((entry)=>entry.name.toLowerCase()===(item.name||"").replace(/ - Priceless$/i,"").toLowerCase()); if(legendaryEditorSource(item)){ const corroded=editingCorrodedModifierIndices.has(index), template=editingLegendaryModifierTemplate(source,index), ranges=modifierRollRanges(template), resolved=editingLegendaryLineText(source,index), values=rollValuesFromText(template,resolved)||ranges.map(preferredModifierRoll), ringChoice=source.id==="Folklore_of_Locking_Fingers"&&index===2?`<label class="legendary-ring-choice">Ring effect<select data-edit-legendary-ring-option><option value="left" ${editingFolkloreRingOption==="left"?"selected":""}>Left Ring · regain Blur</option><option value="right" ${editingFolkloreRingOption==="right"?"selected":""}>Right Ring · gain Blur Rating</option></select></label>`:""; return `<div class="legendary-mod-control ${corroded?"corrosion-affix":""}"><span><button type="button" data-toggle-edit-corrosion="${index}" ${legendaryCorrodedModifiersSs13[source.id]?.[index]?"":"disabled"}>${corroded?"Corroded":"Normal"}</button><span data-edit-modifier-text="${index}">${modifierTextMarkup(resolved)}</span><input type="hidden" data-edit-modifier="${index}" value="${escapeHtml(resolved)}"></span>${ringChoice}${placeholderChoiceControl(source.id,index,editingPlaceholderChoices.get(index),"data-edit-legendary-placeholder")}${legendaryTierControl(source.id,index,editingTierChoices.get(index),corroded,"data-edit-legendary-tier")}${ranges.map((range,rangeIndex)=>`<label>${affixRollInputs(range,`data-edit-legendary-roll="${index}" data-range-index="${rangeIndex}"`,values[rangeIndex])}</label>`).join("")}</div>`; } const range=modifierRollRange(source?.modifiers?.[index]||modifier); if(!range)return `<div class="fixed-mod"><b>Normal</b><input data-edit-modifier="${index}" value="${escapeHtml(modifier)}"></div>`; const value=Math.min(range.max,Math.max(range.min,Number(modifier.match(/-?\d+(?:\.\d+)?/)?.[0])||range.max)); return `<label><span><b>Normal</b><input data-edit-modifier="${index}" value="${escapeHtml(modifier)}"></span><span class="affix-roll-inputs"><input type="range" min="${range.min}" max="${range.max}" step="${modifierRollStep(range)}" value="${value}" data-modifier-roll><input class="affix-roll-number" type="number" min="${range.min}" max="${range.max}" step="${modifierRollStep(range)}" value="${value}" data-affix-roll-number></span><em>${range.min}–${range.max}</em></label>`; }
function itemModifierSections(item){
  const modifiers=item.modifiers||[], used=new Set(), entries=(values,tone="",badges=[])=>(values||[]).map((text,position)=>{ const index=modifiers.findIndex((value,i)=>value===text&&!used.has(i)); if(index>=0)used.add(index); return {text,index,tone,badge:badges[position]||""}; });
  const base=rareBaseForItem(item,[item.base]);
  // A corrosion base affix replaces the implicit affix; the base's own stats (weapon damage, crit, speed; gear defences) stay
  // (src/engine.js isGearBaseStatLine).
  const corrodedBase=(item.corrosionModifiers||[]).length>0, normalImplicit=item.implicitModifiers??base?.modifiers??[], implicit=corrodedBase?normalImplicit.filter(isGearBaseStatLine):normalImplicit;
  if(corrodedBase)entries(normalImplicit.filter((text)=>!isGearBaseStatLine(text)));
  const blend=beltBlendById(item.beltBlendId), blendModifiers=blend?[blend.modifier]:(item.beltBlendModifiers||[]), sequence=towerSequenceById(item.towerSequenceId);
  const baseBadges=(item.baseAffixModifiers||[]).map((resolved,position)=>item.baseAffixTierIds?.[position]||Object.entries(baseAffixTiersSs13[item.base]||{}).find(([template])=>modifierSignature(template)===modifierSignature(resolved))?.[1]||"").map((tier)=>tier?`T${tier}`:"");
  const craftedEntries=(values,offset)=>{ let position=0; return [0,1,2].flatMap((slot)=>{ const index=offset+slot, familyId=item.craftAffixFamilyIds?.[index]; if(!familyId)return []; const text=values?.[position++]; if(!text)return []; const legendary=Boolean(item.craftAffixLegendary?.[index]), badge=legendary?"L":item.craftAffixTierIds?.[index]?`T${item.craftAffixTierIds[index]}`:""; return entries([text],legendary?"legendary":"",[badge]); }); };
  const inferredBadges=(values,side)=>(values||[]).map((resolved)=>{ for(const family of (item.rarity==="vorax"?voraxCraftingSs13.affixes[item.base]:craftAffixesSs13[item.base])?.[side]||[]){ const tier=family.tiers.find((candidate)=>tierMatchesResolved(candidate,resolved)); if(tier)return `T${tier.tier}`; } return ""; });
  const prefixEntries=item.craftAffixFamilyIds?.length?craftedEntries(item.prefixModifiers,0):entries(item.prefixModifiers,"",inferredBadges(item.prefixModifiers,"prefix"));
  const suffixEntries=item.craftAffixFamilyIds?.length?craftedEntries(item.suffixModifiers,3):entries(item.suffixModifiers,"",inferredBadges(item.suffixModifiers,"suffix"));
  const sections=[
    {label:corrodedBase?"Implicit · Corroded":"Implicit",detail:base?.name||item.base||titleCase(item.slot),entries:[...entries(implicit),...(item.corrosionModifiers||[]).map((text)=>({text,index:-1,tone:"corrosion"}))]},
    {label:"Base Affix",entries:entries(item.baseAffixModifiers,"",baseBadges)},
    {label:"Belt Blend",detail:blend?.label||"",entries:entries(blendModifiers)},
    {label:"TOWER Sequence",detail:sequence?`${sequence.grade} · ${sequence.sequence}`:"",entries:entries(sequence?[sequence.modifier]:[])},
    {label:"Prefix",entries:prefixEntries},
    {label:"Suffix",entries:suffixEntries},
    {label:"Legendary Mod",entries:entries(item.legendaryModifiers)}
  ];
  const legendarySource=legendaryGearSs13.find((entry)=>entry.name.toLowerCase()===(item.name||"").replace(/ - Priceless$/i,"").toLowerCase());
  const structuredLegendarySignatures=item.legendaryModifiers?.length&&legendarySource
    ? legendaryKnownModifierSignatures(legendarySource)
    : new Set();
  const remainder=modifiers.map((text,index)=>({text,index})).filter((entry)=>!used.has(entry.index)&&!structuredLegendarySignatures.has(modifierSignature(entry.text)));
  if(remainder.length){
    if(itemDisplayRarity(item)==="legendary")sections.push({label:"Legendary Mod",entries:remainder});
    else {
      const prefixSection=sections.find((section)=>section.label==="Prefix"), suffixSection=sections.find((section)=>section.label==="Suffix");
      const prefixCount=Math.min(3,Math.ceil(remainder.length/2));
      prefixSection.entries.push(...remainder.slice(0,prefixCount));
      suffixSection.entries.push(...remainder.slice(prefixCount));
    }
  }
  return sections.filter((section)=>section.entries.length);
}
function affixTierBadge(badge){ if(!badge)return ""; const key=badge.toLowerCase().replace("+","plus"); return `<i class="affix-tier-badge tier-${escapeHtml(key)}">${escapeHtml(badge)}</i>`; }
function previewModifierSections(item){ const corroded=new Set(item.corrodedModifierIndices||[]); return itemModifierSections(item).map((section)=>`<section class="item-mod-section"><h4>${escapeHtml(section.label)}${section.detail?`<small>${escapeHtml(section.detail)}</small>`:""}</h4>${section.entries.length?`<ul>${section.entries.map((entry)=>`<li class="${entry.tone==="legendary"||entry.badge==="L"?"legendary-affix ":""}${entry.tone==="corrosion"||corroded.has(entry.index)?"corrosion-affix":""}">${affixTierBadge(entry.badge)}<span>${modifierTextMarkup(entry.text)}</span></li>`).join("")}</ul>`:""}</section>`).join(""); }
function equipmentPreview(item){ const rarity=itemDisplayRarity(item), rarityLabel=rarity==="vorax"?"VORAX GEAR":rarity.toUpperCase(); return `<article class="equipment-preview rarity-${itemCardRarity(rarity,item)}${sixAffixClass(item)}${pricelessClass(item)}${itemLevel100Class(item)}"><img src="${gearIcon(item)}" alt=""><p>${rarityLabel}</p><h3>${escapeHtml(item.name)}</h3><small>${escapeHtml(item.base||titleCase(item.slot))} · Require Lv.${item.level||1}</small><div class="item-mod-sections">${previewModifierSections(item)||"<p>Configure affixes to preview this item.</p>"}</div>${item.source?`<a href="${item.source}" target="_blank" rel="noreferrer">Open TLIDB source</a>`:""}</article>`; }
function voraxModifierLabel(template){ return template.replace(/\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)/g,(_,minimum,maximum)=>Number(minimum)<0&&Number(maximum)<0?"-#":"#").replace(/(-?)\d+(?:\.\d+)?/g,"$1#"); }
function voraxLegendaryAffixPool(type){
  return (voraxCraftingSs13.legendaryDonors[type]||[]).flatMap((donor)=>donor.modifiers.map((template,modifierIndex)=>({id:`${donor.id}-mod-${modifierIndex}`,label:`[${donor.name}] ${voraxModifierLabel(template)}`,library:"Legendary",donor:donor.name,tiers:[{tier:"L",level:donor.level||1,template}]})));
}
function isVoraxLegendaryAffix(body,index){ return body?.querySelector(`[data-toggle-vorax-legendary="${index}"]`)?.dataset.legendaryActive==="true"; }
function craftAffixPool(type,index,body=$("#equipment-crafter-body")){ if(equipmentCraftMode==="vorax"&&isVoraxLegendaryAffix(body,index))return voraxLegendaryAffixPool(type); return (equipmentCraftMode==="vorax"?voraxCraftingSs13.affixes[type]:craftAffixesSs13[type])?.[index<3?"prefix":"suffix"]||[]; }
function craftAffixFamilyOptions(type,index){ return `<option value="">None</option>${craftAffixPool(type,index).map((family)=>`<option value="${escapeHtml(family.id)}">${escapeHtml(family.label)}</option>`).join("")}`; }
function craftAffixControl(label,index,type){ return `<div class="craft-affix-control"><span>${equipmentCraftMode==="vorax"?`<button type="button" class="vorax-legendary-toggle" data-toggle-vorax-legendary="${index}" data-legendary-active="false" aria-pressed="false" title="Use a Legendary item affix in this slot"><b>L</b><i></i></button>`:""}<span>${label}</span></span><select data-craft-affix-family="${index}">${craftAffixFamilyOptions(type,index)}</select><div class="craft-affix-config" data-craft-affix-config="${index}"></div></div>`; }
function craftAffixFamily(body,index){ const type=body.querySelector("[data-craft-type]")?.value, id=body.querySelector(`[data-craft-affix-family="${index}"]`)?.value; return craftAffixPool(type,index).find((family)=>family.id===id); }
function eligibleCraftAffixTiers(body,family){ const itemLevel=Number(body.querySelector("[data-craft-level]")?.value)||100; return (family?.tiers||[]).filter((tier)=>tier.level<=itemLevel); }
function craftAffixRollControls(index,tier){ return modifierRollRanges(tier?.template||"").map((range,rangeIndex)=>`<label>${affixRollInputs(range,`data-craft-affix-roll="${index}" data-range-index="${rangeIndex}"`)}</label>`).join(""); }
function updateCraftAffixConfig(index,preferredTier=""){
  const body=$("#equipment-crafter-body"), family=craftAffixFamily(body,index), config=body?.querySelector(`[data-craft-affix-config="${index}"]`); if(!config)return;
  const tiers=eligibleCraftAffixTiers(body,family); if(!family){config.innerHTML="";return;} if(!tiers.length){config.innerHTML='<small class="affix-level-warning">No tiers available at this item level.</small>';return;}
  const selected=tiers.find((tier)=>tier.tier===preferredTier)||tiers.find((tier)=>tier.tier==="1")||tiers[0];
  config.innerHTML=`${isVoraxLegendaryAffix(body,index)?"":`<label class="craft-tier-select">Tier<select data-craft-affix-tier="${index}">${tiers.map((tier)=>`<option value="${escapeHtml(tier.tier)}" ${tier===selected?"selected":""}>T${escapeHtml(tier.tier)} · Requires Lv.${tier.level}</option>`).join("")}</select></label>`}<div class="craft-tier-rolls" data-craft-affix-rolls="${index}">${craftAffixRollControls(index,selected)}</div>`;
}
function configuredCraftAffixes(body,indices=[0,1,2,3,4,5]){ return [...body.querySelectorAll("[data-craft-affix-family]")].filter((select)=>indices.includes(Number(select.dataset.craftAffixFamily))).map((select)=>{ const index=Number(select.dataset.craftAffixFamily), family=craftAffixFamily(body,index), tierValue=body.querySelector(`[data-craft-affix-tier="${index}"]`)?.value, tier=isVoraxLegendaryAffix(body,index)?family?.tiers[0]:family?.tiers.find((entry)=>entry.tier===tierValue); if(!tier)return ""; const sliders=[...body.querySelectorAll(`[data-craft-affix-roll="${index}"]`)]; return sliders.length?resolveModifierRolls(tier.template,sliders.map((slider)=>slider.value)):tier.template; }).filter(Boolean); }
function towerSequenceAllowed(type){ return towerSequencesForType(type).length>0; }
function rareBasesForType(type){ return rareBaseItemsSs13.filter((entry)=>entry.type===type&&!isLegacyRareBase(entry)).sort((a,b)=>b.level-a.level||a.name.localeCompare(b.name)); }
function rareBaseOptions(type){ return rareBasesForType(type).map((entry)=>`<option value="${escapeHtml(entry.id)}">Lv ${entry.level} · ${escapeHtml(entry.name)}</option>`).join(""); }
function baseAffixOptions(type){ return `<option value="">None</option>${(baseAffixesSs13[type]||[]).map((affix)=>`<option value="${escapeHtml(affix)}" data-tier="${escapeHtml(baseAffixTiersSs13[type]?.[affix]||"")}">${escapeHtml(affix.replaceAll("\n"," / "))}</option>`).join("")}`; }
function voraxBaseAffixOptions(type,slot){
  const pool=voraxBaseAffixSlotPool(type,slot);
  return `<option value="">None</option>${pool.map((affix)=>`<option value="${escapeHtml(affix.modifier)}" data-tier="${escapeHtml(affix.tier)}">T${escapeHtml(affix.tier)} · ${escapeHtml(affix.modifier.replaceAll("\n"," / "))}</option>`).join("")}`;
}
function baseAffixRollControls(index,template){
  const ranges=modifierRollRanges(template);
  return ranges.map((range,rangeIndex)=>`<label class="base-affix-roll">${affixRollInputs(range,`data-base-affix-roll="${index}" data-range-index="${rangeIndex}"`)}</label>`).join("");
}
function configuredBaseAffixes(body){
  return [...body.querySelectorAll("[data-craft-base-affix]")].map((select,index)=>{
    const template=select.value.trim(); if(!template) return "";
    const sliders=[...body.querySelectorAll(`[data-base-affix-roll="${index}"]`)];
    return sliders.length?resolveModifierRolls(template,sliders.map((slider)=>slider.value)):template;
  }).filter(Boolean);
}
function definedItemFields(item){ return Object.fromEntries(Object.entries(item).filter(([,value])=>value!==undefined)); }
function currentCraftPreview(){
  const body=$("#equipment-crafter-body"), type=body?.querySelector("[data-craft-type]"); if(!type) return null;
  const selected=type.selectedOptions[0], baseAffixModifiers=configuredBaseAffixes(body), prefixModifiers=configuredCraftAffixes(body,[0,1,2]), suffixModifiers=configuredCraftAffixes(body,[3,4,5]), modifiers=[...baseAffixModifiers,...prefixModifiers,...suffixModifiers];
  const baseAffixTierIds=[...body.querySelectorAll("[data-craft-base-affix]")].map((select)=>select.value?select.selectedOptions[0]?.dataset.tier||"":"");
  const craftAffixFamilyIds=[0,1,2,3,4,5].map((index)=>body.querySelector(`[data-craft-affix-family="${index}"]`)?.value||"");
  const craftAffixTierIds=[0,1,2,3,4,5].map((index)=>isVoraxLegendaryAffix(body,index)?"L":body.querySelector(`[data-craft-affix-tier="${index}"]`)?.value||"");
  const craftAffixLegendary=[0,1,2,3,4,5].map((index)=>isVoraxLegendaryAffix(body,index));
  const baseEntry=equipmentCraftMode==="rare"?rareBaseItemsSs13.find((entry)=>entry.id===body.querySelector("[data-craft-base]")?.value):equipmentCraftMode==="vorax"?voraxCraftingSs13.bases.find((entry)=>entry.name===type.value):null;
  const slot=baseEntry?.slot||selected.dataset.slot;
  const blend=slot==="belt"?selectedBeltBlend(body):null; if(blend)modifiers.push(blend.modifier);
  const sequence=towerSequenceById(body.querySelector("[data-craft-sequence]")?.value); if(sequence)modifiers.push(sequence.modifier);
  const corrosionModifiers=configuredCraftCorrosion(body);
  return definedItemFields({corrosionModifiers:corrosionModifiers.length?corrosionModifiers:undefined,name:body.querySelector("[data-craft-name]")?.value.trim()||baseEntry?.name||body.querySelector("[data-craft-base]")?.selectedOptions?.[0]?.textContent||`${equipmentCraftMode==="vorax"?"Crafted":"Rare"} ${type.value}`,base:type.value,baseId:baseEntry?.id,beltBlendId:blend?.id,towerSequenceId:sequence?.id,implicitModifiers:[...(baseEntry?.modifiers||[])],baseAffixModifiers,baseAffixTierIds,prefixModifiers,suffixModifiers,craftAffixFamilyIds,craftAffixTierIds,craftAffixLegendary,slot,level:baseEntry?.level||Number(body.querySelector("[data-craft-level]")?.value)||100,itemLevel:Number(body.querySelector("[data-craft-level]")?.value)||100,energy:equipmentEnergyAllowed(slot)?Number(body.querySelector("[data-craft-energy]")?.value)||0:0,icon:baseEntry?.icon,source:baseEntry?.source,modifiers:[...(baseEntry?.modifiers||[]),...modifiers],affixCount:modifiers.length,defenses:{},rarity:equipmentCraftMode});
}
function updateCraftPreview(){ const item=currentCraftPreview(); if(item&&$("#crafted-equipment-preview")) $("#crafted-equipment-preview").innerHTML=`<small>Preview</small>${equipmentPreview(item)}`; }
function renderEquipmentCrafter(){
  const body=$("#equipment-crafter-body"); $("#equipment-crafter-title").textContent=equipmentCraftMode==="legendary"?"Craft Legendary":equipmentCraftMode==="vorax"?"Craft Vorax Item":"Craft Rare Item";
  if(equipmentCraftMode==="vorax"&&!selectedVoraxBaseName){ body.innerHTML=`<div class="vorax-select-layout"><section><small>Select Limb</small><div class="vorax-base-grid">${voraxCraftingSs13.bases.map((base)=>`<button type="button" data-select-vorax-base="${escapeHtml(base.name)}"><img src="${escapeHtml(base.icon)}" alt=""><span>${escapeHtml(base.label)}</span></button>`).join("")}</div></section><aside><small>Preview</small><div class="vorax-empty-preview">Select options to preview item</div></aside></div>`; return; }
  if(equipmentCraftMode==="legendary"){
    const entries=legendaryGearSs13.filter((entry)=>!equipmentSearch||`${entry.name} ${entry.modifiers.join(" ")}`.toLowerCase().includes(equipmentSearch.toLowerCase())); const selected=legendaryGearSs13[selectedLegendaryIndex];
    const baseOptions=selected?baseTypesForSlot(selected.slot):[], corrosionPool=selected?corrosionImplicitsForBase(selectedLegendaryBase):[], corrosion=corrosionPool[selectedCorrosionIndex], corrosionText=corrosion?interpolateCorrosionRoll(corrosion,100):"";
    const initialSequence=towerSequenceById(selectedLegendaryTowerSequenceId);
    body.innerHTML=selected?`<div class="legendary-config-layout"><section><div class="gear-edit-selected"><img src="${selected.icon}" alt=""><span><strong>${escapeHtml(selected.name)}</strong><small>${titleCase(selected.slot)}</small></span><button type="button" data-change-legendary>Change</button></div><label>Base<select data-legendary-base>${baseOptions.map((base)=>`<option value="${escapeHtml(base)}" ${base===selectedLegendaryBase?"selected":""}>${escapeHtml(base)}</option>`).join("")}</select></label>${selected.slot==="belt"?`<label>Belt Blend<select data-legendary-belt-blend>${beltBlendOptions(selectedLegendaryBeltBlendId)}</select></label>`:""}${equipmentEnergyAllowed(selected.slot)?`<label>Equipment Energy<input data-legendary-energy type="number" min="0" value="${maxEquipmentEnergy(100,selected.slot,selectedLegendaryBase)}"></label>`:""}${towerSequenceAllowed(selectedLegendaryBase)?`<label>TOWER Sequence<select data-legendary-tower-sequence>${towerSequenceOptions(selectedLegendaryBase,selectedLegendaryTowerSequenceId)}</select></label>`:""}<label>Corrosion Implicit<select data-legendary-corrosion><option value="-1">None</option>${corrosionPool.map((entry,index)=>`<option value="${index}" ${index===selectedCorrosionIndex?"selected":""}>${escapeHtml(entry.label)}</option>`).join("")}</select></label>${corrosion?`<div class="fixed-mod corrosion-affix"><b>Corroded</b><span data-corrosion-text>${escapeHtml(corrosionText)}</span>${corrosion.min!==corrosion.max?`<input type="range" min="0" max="100" value="100" data-corrosion-roll>`:""}</div>`:""}<h3>Legendary Mods</h3><div class="gear-mod-editor">${selected.modifiers.map((_,index)=>legendaryModifierControl(selected,index)).join("")}</div></section><aside id="legendary-config-preview"><small>Preview</small>${equipmentPreview({...selected,base:selectedLegendaryBase,corrodedModifierIndices:[...selectedLegendaryCorrodedModifiers],modifiers:[...maxRolledLegendaryModifiers(selected),...(beltBlendById(selectedLegendaryBeltBlendId)?[beltBlendById(selectedLegendaryBeltBlendId).modifier]:[]),...(initialSequence?[initialSequence.modifier]:[])],corrosionModifiers:corrosionText?[corrosionText]:[]})}</aside></div>`:`<div class="legendary-craft-layout"><section><label class="gear-search">⌕<input type="search" data-legendary-search value="${escapeHtml(equipmentSearch)}" placeholder="Search legendary or @Mod…"></label><div class="legendary-results">${entries.slice(0,120).map((entry)=>`<button type="button" class="legendary-choice" data-legendary-id="${entry.id}"><img src="${entry.icon}" alt=""><span><strong>${escapeHtml(entry.name)}</strong><small>${titleCase(entry.slot)} · Lv.${entry.level}</small></span></button>`).join("")}</div><small>${entries.length} legendary gear available${entries.length>120?" · refine the search to see more":""}</small></section><aside><p>Select a legendary item to configure it.</p></aside></div>`;
  } else {
    const types=equipmentCraftMode==="vorax"?voraxItemTypes.filter(([name])=>name===selectedVoraxBaseName):craftItemTypes;
    const initialBases=equipmentCraftMode==="rare"?rareBaseOptions(types[0][0]):`<option value="${escapeHtml(types[0][0])}">${escapeHtml(types[0][0])}</option>`;
    const initialBase=equipmentCraftMode==="rare"?rareBasesForType(types[0][0])[0]:equipmentCraftMode==="vorax"?voraxCraftingSs13.bases.find((entry)=>entry.name===types[0][0]):null;
    body.innerHTML=`<div class="rare-craft-layout detailed-crafter"><section><div class="craft-name-level"><label>Name<input data-craft-name placeholder="Custom name (optional)"></label><label>Item Level<input data-craft-level type="number" min="1" max="100" value="100"></label></div><label>Item Type<select data-craft-type>${types.map(([name,slot])=>`<option value="${escapeHtml(name)}" data-slot="${slot}">${escapeHtml(name)}</option>`).join("")}</select></label><label>Base Item<select data-craft-base>${initialBases}</select></label><label data-belt-blend-field ${types[0][1]==="belt"?"":"hidden"}>Belt Blend<select data-craft-belt-blend>${beltBlendOptions()}</select></label><div class="base-affix-control"><label>Base Affix 1<select data-craft-base-affix="0">${equipmentCraftMode==="rare"?baseAffixOptions(types[0][0]):voraxBaseAffixOptions(types[0][0],0)}</select></label><div class="base-affix-rolls" data-base-affix-rolls="0"></div></div><div class="base-affix-control"><label>Base Affix 2<select data-craft-base-affix="1">${equipmentCraftMode==="rare"?baseAffixOptions(types[0][0]):voraxBaseAffixOptions(types[0][0],1)}</select></label><div class="base-affix-rolls" data-base-affix-rolls="1"></div></div><label>Corrosion Implicit<select data-craft-corrosion>${craftCorrosionOptions(types[0][0])}</select></label><div data-craft-corrosion-row></div><div class="craft-energy-row"><label data-equipment-energy-field ${equipmentEnergyAllowed(types[0][1])?"":"hidden"}>Equipment Energy<input data-craft-energy type="number" min="0" value="${maxEquipmentEnergy(100,types[0][1],types[0][0])}"></label><label data-tower-sequence-field ${towerSequenceAllowed(types[0][0])?"":"hidden"}>TOWER Sequence<select data-craft-sequence>${towerSequenceOptions(types[0][0])}</select></label></div><h3>${equipmentCraftMode==="vorax"?"Organ affixes":"Prefixes"}</h3>${[0,1,2].map((index)=>craftAffixControl(`Prefix ${index+1}`,index,types[0][0])).join("")}<h3>Suffixes</h3>${[3,4,5].map((index)=>craftAffixControl(`Suffix ${index-2}`,index,types[0][0])).join("")}</section><aside id="crafted-equipment-preview"><small>Preview</small>${equipmentPreview(initialBase?{...initialBase,base:initialBase.type,implicitModifiers:initialBase.modifiers,rarity:"rare",itemLevel:100}:{name:types[0][0],base:types[0][0],slot:types[0][1],level:100,itemLevel:100,modifiers:[]})}</aside></div>`;
  }
}
function setCraftRollValues(containerSelector,attribute,values){
  const controls=[...document.querySelectorAll(containerSelector)]; controls.forEach((range,index)=>{ if(values[index]===undefined)return; range.value=String(values[index]); updateNegativeRollVisual(range); const numberInput=range.closest(".affix-roll-inputs")?.querySelector("[data-affix-roll-number]"); if(numberInput)numberInput.value=range.value; range.closest("label")?.querySelector("em")?.replaceChildren(range.value); });
}
function populateCraftEditor(item){
  const body=$("#equipment-crafter-body"), type=body.querySelector("[data-craft-type]"); if(!body||!type)return;
  type.value=item.base||itemWeaponType(item); type.dispatchEvent(new Event("input",{bubbles:true}));
  body.querySelector("[data-craft-name]").value=item.name||""; body.querySelector("[data-craft-level]").value=item.itemLevel||item.level||100;
  const base=body.querySelector("[data-craft-base]"); if(base&&item.baseId)base.value=item.baseId;
  const energy=body.querySelector("[data-craft-energy]"); if(energy)energy.value=item.energy||0;
  const blend=body.querySelector("[data-craft-belt-blend]"); if(blend)blend.value=item.beltBlendId||"";
  const sequence=body.querySelector("[data-craft-sequence]"); if(sequence)sequence.value=item.towerSequenceId||"";
  const corrosionSelect=body.querySelector("[data-craft-corrosion]"), savedCorrosion=(item.corrosionModifiers||[]).filter(Boolean);
  if(corrosionSelect&&savedCorrosion.length){ const choice=corrosionEditorChoice(craftCorrosionPool(type.value),savedCorrosion), chosen=choice.value==="current"?"current":String(choice.index); corrosionSelect.innerHTML=craftCorrosionOptions(type.value,chosen,choice.value==="current"?savedCorrosion:[]); Object.assign(corrosionSelect.dataset,{savedLines:JSON.stringify(savedCorrosion),savedChoice:chosen}); delete corrosionSelect.dataset.rollTouched; const row=body.querySelector("[data-craft-corrosion-row]"); if(row)row.innerHTML=choice.value==="current"?"":craftCorrosionRow(type.value,choice.index,choice.percent,savedCorrosion[0]); }
  (item.baseAffixModifiers||[]).slice(0,2).forEach((resolved,index)=>{ const select=body.querySelector(`[data-craft-base-affix="${index}"]`), template=[...select.options].find((option)=>modifierSignature(option.value)===modifierSignature(resolved))?.value; if(!template)return; select.value=template; select.dispatchEvent(new Event("input",{bubbles:true})); setCraftRollValues(`[data-base-affix-roll="${index}"]`,"data-base-affix-roll",resolvedRollValues(template,resolved)); });
  const storedFamilies=item.craftAffixFamilyIds, storedTiers=item.craftAffixTierIds;
  (item.craftAffixLegendary||[]).slice(0,6).forEach((active,index)=>{ if(!active)return; const toggle=body.querySelector(`[data-toggle-vorax-legendary="${index}"]`); if(!toggle)return; toggle.dataset.legendaryActive="true"; toggle.setAttribute("aria-pressed","true"); toggle.closest(".craft-affix-control")?.classList.add("legendary-affix-active"); const select=body.querySelector(`[data-craft-affix-family="${index}"]`); if(select)select.innerHTML=craftAffixFamilyOptions(type.value,index); });
  if(Array.isArray(storedFamilies)&&storedFamilies.some(Boolean)){
    let prefixIndex=0, suffixIndex=0;
    // A stored family id the catalog no longer has (2026-10-22: the four SS14 families TLIDB first listed without an id now carry
    // their game ids) or a tier it does not list (an imported drop-only tier) falls back to the line's text, as unstored items do.
    storedFamilies.slice(0,6).forEach((familyId,index)=>{ if(!familyId)return; const resolved=index<3?(item.prefixModifiers||[])[prefixIndex++]:(item.suffixModifiers||[])[suffixIndex++]; let family=craftAffixPool(type.value,index).find((entry)=>entry.id===familyId), tier=isVoraxLegendaryAffix(body,index)?family?.tiers[0]:family?.tiers.find((candidate)=>String(candidate.tier)===String(storedTiers?.[index]||"")); if((!family||!tier)&&resolved&&!isVoraxLegendaryAffix(body,index)) for(const entry of craftAffixPool(type.value,index)){ const found=entry.tiers.find((candidate)=>tierMatchesResolved(candidate,resolved)); if(found){family=entry;tier=found;break;} } if(!family||!tier)return; const select=body.querySelector(`[data-craft-affix-family="${index}"]`); select.value=family.id; updateCraftAffixConfig(index,tier.tier); if(resolved)setCraftRollValues(`[data-craft-affix-roll="${index}"]`,"data-craft-affix-roll",resolvedRollValues(tier.template,resolved)); });
  } else {
    [[item.prefixModifiers||[],0],[item.suffixModifiers||[],3]].forEach(([resolvedModifiers,offset])=>resolvedModifiers.slice(0,3).forEach((resolved,position)=>{ const index=offset+position, pool=craftAffixPool(type.value,index); let family,tier; for(const entry of pool){ const found=entry.tiers.find((candidate)=>tierMatchesResolved(candidate,resolved)); if(found){family=entry;tier=found;break;} } if(!family||!tier)return; const select=body.querySelector(`[data-craft-affix-family="${index}"]`); select.value=family.id; updateCraftAffixConfig(index,tier.tier); setCraftRollValues(`[data-craft-affix-roll="${index}"]`,"data-craft-affix-roll",resolvedRollValues(tier.template,resolved)); }));
  }
  updateCraftPreview();
  $("#equipment-crafter-title").textContent=`Edit ${item.name}`; const save=$("#equipment-crafter [data-add-crafted-equipment]"); if(save)save.textContent="Save Changes";
}
function openCraftedItemEditor(item){ editingCraftItemId=item.id; equipmentCraftMode=item.rarity==="vorax"?"vorax":"rare"; selectedVoraxBaseName=equipmentCraftMode==="vorax"?(item.base||item.name):""; renderEquipmentCrafter(); populateCraftEditor(item); $("#inventory-item-dialog").close(); $("#equipment-crafter").showModal(); }
function openInventoryItemEditor(item){
  if(!item)return;
  normalizeSunsEmbraceItem(item);
  selectedInventoryItemId=item.id;
  if(item.rarity!=="legendary"&&!legendaryEditorSource(item)&&plannerState.equipmentInventory.some((entry)=>entry.id===item.id)){ openCraftedItemEditor(item); return; }
  inventoryItemEditing=true;
  const legendaryModel=inventoryLegendaryModel(item);
  // The editor keys corrosion and line text by catalog index; corrodedModifierIndices are positions in item.modifiers.
  editingCorrodedModifierIndices=legendaryModel?new Set(legendaryModel.slots.filter((slot)=>slot.corroded).map((slot)=>slot.catalogIndex)):new Set(item.corrodedModifierIndices||[]);
  editingLegendaryTexts=new Map(legendaryModel?legendaryModel.slots.filter((slot)=>slot.position>=0).map((slot)=>[slot.catalogIndex,slot.text]):[]);
  const corrosionChoice=corrosionEditorChoice(corrosionPoolForItem(item),item.corrosionModifiers);
  editingCorrosionImplicit={value:corrosionChoice.value,percent:corrosionChoice.percent,lines:(item.corrosionModifiers||[]).filter(Boolean)};
  editingFolkloreRingOption=folkloreRingOptionFromModifiers(item.legendaryModifiers||item.modifiers);
  const placeholderSource=legendaryEditorSource(item);
  editingPlaceholderChoices=new Map(legendaryModel&&placeholderSource?legendaryModel.slots.filter((slot)=>slot.position>=0).map((slot)=>[slot.catalogIndex,placeholderOptionForText(placeholderSource.id,slot.catalogIndex,slot.text,slot.corroded)?.option.id]).filter(([,id])=>id):[]);
  // A tiered line keeps the tier its stored roll was rolled in (Ice Pulse "+29% Spell Damage" opens on T2); unset = the best tier.
  editingTierChoices=new Map(legendaryModel&&placeholderSource?legendaryModel.slots.filter((slot)=>slot.position>=0&&!slot.corroded).map((slot)=>[slot.catalogIndex,legendaryTierForText(placeholderSource,slot.catalogIndex,slot.text)]).filter(([,tier])=>tier):[]);
  renderInventoryItemDialog();
  const dialog=$("#inventory-item-dialog");
  if(!dialog.open)dialog.showModal();
}

function renderEquipmentCatalog() {
  const entries = tlidbEquipmentCatalogSs13.filter((entry) => entry.slot === selectedEquipmentSlot);
  $("#equipment-catalog-results").innerHTML = entries.length ? entries.map((entry,index) => `<article class="catalog-card"><div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.base)} · Lv.${entry.level} · ${entry.modifiers.length} affixes</small></div><a href="${entry.source}" target="_blank" rel="noreferrer">TLIDB source</a><button class="button" type="button" data-apply-equipment-catalog="${index}" data-equipment-catalog-slot="${entry.slot}">Apply template</button></article>`).join("") : `<p class="muted">No verified template is loaded for ${titleCase(selectedEquipmentSlot)} yet.</p>`;
}

function renderEquipmentComparison() {
  const slot = [...disabledEquipmentSlots][0];
  const captured = { gloves: 1, mainHand: 2, secondaryHand: 3 };
  const equipmentImpact = currentEquipmentImpact();
  const overrideSlots = Object.keys(plannerState.equipmentOverrides);
  if (slot || overrideSlots.length) {
    const deltaPercent = (equipmentImpact.factors.nonLimitDamageMultiplier - 1) * 100;
    const baselineEnergy = selenaScorchingBeamGearSs13.items.reduce((sum,item) => sum + (item.energy || 0), 0);
    $("#comparison-status").textContent = `${equipmentImpact.recognizedCount} recognized affixes`;
    $("#equipment-comparison").innerHTML = `<div class="comparison-hero"><span>${overrideSlots.length + disabledEquipmentSlots.size} gear edits</span><strong>×${equipmentImpact.factors.nonLimitDamageMultiplier} non-limit damage</strong><em>${deltaPercent >= 0 ? "+" : ""}${format(deltaPercent)}%</em></div><div class="comparison-grid"><div><span>Equipment Energy</span><small>${baselineEnergy} → ${equipmentImpact.equipmentEnergy}</small><strong>${equipmentImpact.equipmentEnergy - baselineEnergy >= 0 ? "+" : ""}${equipmentImpact.equipmentEnergy - baselineEnergy}</strong></div><div><span>Gear Ignite limit</span><small>${equipmentImpact.baselineGearIgniteLimit} → ${equipmentImpact.candidateGearIgniteLimit}</small><strong>${equipmentImpact.candidateGearIgniteLimit - equipmentImpact.baselineGearIgniteLimit}</strong></div><div><span>Base Ignite factor</span><small>recognized affixes</small><strong>×${equipmentImpact.factors.baseIgniteFactor}</strong></div><div><span>Unrecognized</span><small>retained, not calculated</small><strong>${equipmentImpact.unrecognized.length}</strong></div></div>${equipmentImpact.unrecognized.length ? `<details class="unrecognized-affixes"><summary>Excluded affixes (${equipmentImpact.unrecognized.length})</summary><ul>${equipmentImpact.unrecognized.map((entry) => `<li><strong>${titleCase(entry.slot)}</strong> · ${escapeHtml(entry.text.replace(/(\d)\s+%/g,"$1%"))}</li>`).join("")}</ul></details>` : ""}`;
    return;
  }
  if (!slot) { $("#comparison-status").textContent = "Captured baseline"; $("#equipment-comparison").innerHTML = `<div class="comparison-empty"><strong>No candidate gear change</strong><span>Edit an item or disable one to compare it with the captured build.</span></div>`; return; }
  if (captured[slot] == null) { $("#comparison-status").textContent = "Energy only"; $("#equipment-comparison").innerHTML = `<div class="comparison-empty comparison-warning"><strong>${titleCase(slot)} disabled</strong><span>Energy and modifier ledgers update, but no clean damage capture exists for this isolated removal.</span></div>`; return; }
  const comparison = compareObservedDamageStates(selenaScorchingBeamObservedSnapshots[0], selenaScorchingBeamObservedSnapshots[captured[slot]]);
  $("#comparison-status").textContent = "Measured capture";
  $("#equipment-comparison").innerHTML = `<div class="comparison-hero"><span>Candidate without ${titleCase(slot)}</span><strong>${format(comparison.igniteDps.candidate)} Ignite DPS</strong><em>${comparison.igniteDps.percent}%</em></div><div class="comparison-grid"><div><span>Spell DPS</span><small>${format(comparison.spellDps.baseline)} → ${format(comparison.spellDps.candidate)}</small><strong>${comparison.spellDps.percent}%</strong></div><div><span>Ignite DPS</span><small>${format(comparison.igniteDps.baseline)} → ${format(comparison.igniteDps.candidate)}</small><strong>${comparison.igniteDps.percent}%</strong></div><div><span>Affliction/s</span><small>${comparison.afflictionPerSecond.baseline} → ${comparison.afflictionPerSecond.candidate}</small><strong>${comparison.afflictionPerSecond.delta}</strong></div></div>`;
}

function selectedPactspiritLevel(name){
  const fallback = plannerState.pacts.kismetSlotMode ? 1 : selenaScorchingBeamPactsSs13.pactspirits.find((spirit)=>spirit.name===name)?.rank||1;
  return pactspiritLevel(name,plannerState.pacts.spiritLevels,fallback);
}

// The game's pact page limits (src/pact-limits.js; user decision 2026-10-21): the build's character level, else 100.
const pactCharacter=()=>buildCharacterLevel(plannerState);
const currentPactLimits=()=>resolvePactLimits(plannerState.pacts,pactCharacter());
// Why a pact node or kismet slot is past the limit ("Over the limit: not counted …") or blocked from allocation, for the tooltip.
function pactLimitNote(key,{allocateBlock=null}={}){
  const limits=currentPactLimits();
  if(limits.excludedNodes.includes(key)||limits.excludedKismets.includes(key))return `<p class="curse-limit-note">Over the limit: not counted — ${escapeHtml(limits.reasons[key]||"")}</p>`;
  return allocateBlock?`<p class="curse-limit-note">${escapeHtml(allocateBlock)}</p>`:"";
}
function renderPacts() {
  const slots=Array.from({length:3},(_,index)=>plannerState.pacts.selectedSpirits?.[index]||"");
  const limits=currentPactLimits(),overLimit=new Set([...limits.excludedNodes,...limits.excludedKismets]);
  $("#pactspirit-count").textContent=`${slots.filter(Boolean).length}/3`;
  $("#pactspirits").innerHTML=slots.map((name,index)=>{
    const entry=pactspiritCatalogSs13.find((candidate)=>candidate.name===name);
    const level=selectedPactspiritLevel(name);
    const tree=pactspiritTreesSs13[name]||[];
    const sequence=orderedPactspiritNodes(tree);
    const allocatedCount=sequence.filter((node,nodeIndex)=>["inner","mid","outer","destiny"].includes(node.ring)&&plannerState.pacts.nativeNodeQuantities?.[`${name}:${nodeIndex}`]>0).length;
    const destinyIndex=sequence.findIndex((node)=>node.ring==="destiny");
    const destinyAllocated=destinyIndex>=0&&plannerState.pacts.nativeNodeQuantities?.[`${name}:${destinyIndex}`]>0;
    const nodeHtml=sequence.map((node,nodeIndex)=>{
      const key=kismetSlotKey(name,nodeIndex),equipped=plannerState.pacts.kismetSlots?.[key],kismet=kismetCatalogSs13.find((item)=>item.name===equipped?.name),kind=kismetKindForRing(node.ring),icon=kismet?.icon||node.icon;
      const isFate=node.ring==="destiny",isNative=node.ring==="inner"||node.ring==="mid",allocatable=isNative||node.ring==="outer"||isFate,unlock=fateSlotChoice(plannerState.pacts.fateUnlocks?.[name]);
      const allocated=allocatable&&plannerState.pacts.nativeNodeQuantities?.[`${name}:${nodeIndex}`]>0;
      const status=allocatable&&plannerState.pacts.kismetSlotMode?`<i class="pact-node-status" aria-hidden="true">${allocated?"✓":"+"}</i>`:"";
      // Past the Pact Point budget: greyed and not allocatable (src/pact-limits.js); a saved page past a limit: red, not counted.
      const blocked=allocatable&&plannerState.pacts.kismetSlotMode&&!allocated?pactNodeAllocationBlock(plannerState.pacts,name,nodeIndex,pactCharacter()):null;
      const over=overLimit.has(key);
      const action=plannerState.pacts.kismetSlotMode?`${over?"Over the limit: not counted; ":""}${allocated?"Allocated":blocked?`Unallocated (${blocked})`:"Unallocated"}; left-click to ${allocated?"refund":"allocate"}${kind?"; right-click for Kismet":isFate?"; right-click for Fate slots":""}${kismet?"; drag to move or swap, right-click during drag to copy":""}`:kind?"Click to craft a Kismet":isFate?"Click to unlock Fate slots":"";
      return `<span class="pact-tree-node pact-tree-${node.ring}${allocated?" allocated":""}${allocatable&&plannerState.pacts.kismetSlotMode&&!allocated?" unallocated":""}${blocked?" pact-limit-blocked":""}${over?" pact-over-limit":""}${kismet?" has-kismet":""}${kind||isFate?" craftable":""}${unlock&&isFate&&allocated?" fate-unlocked":""}" tabindex="0" ${allocatable&&plannerState.pacts.kismetSlotMode?`role="button" aria-pressed="${allocated}" data-pact-node-allocate="${escapeHtml(name)}:${nodeIndex}"${blocked?` aria-disabled="true" data-pact-limit-block="${escapeHtml(blocked)}"`:""}`:""} data-pact-node-tooltip ${kind?`data-kismet-node="${escapeHtml(key)}" data-kismet-kind="${kind}"`:isFate?`data-open-fate-slot="${escapeHtml(name)}"`:""} data-node-name="${escapeHtml(node.name)}" data-node-effect="${escapeHtml(isFate?(unlock?"Undetermined Fate installed · unlocks additional Fate slots":"+6% Damage · +6% Minion Damage"):node.effect)}" data-node-ring="${node.ring}" data-node-icon="${icon}" aria-label="${escapeHtml(`${node.name}: ${action}`)}"><img src="${icon}" alt="">${status}</span>`;
    }).join("");
    const extraHtml=fateExtraSlots(name,destinyAllocated||!plannerState.pacts.kismetSlotMode?plannerState.pacts.fateUnlocks?.[name]:null).map((slot)=>{
      const equipped=plannerState.pacts.kismetSlots?.[slot.key],kismet=kismetCatalogSs13.find((item)=>item.name===equipped?.name&&item.kind===slot.kind),label=`Extra ${slot.kind=== "micro"?"Micro":"Medium"} Fate Slot ${slot.index}`;
      // A Fate slot whose Undetermined Fate Slots node is past the Pact Point budget is not counted either.
      return `<span class="pact-tree-node pact-tree-${slot.kind==="micro"?"inner":"mid"} pact-tree-extra${kismet?" has-kismet":""}${overLimit.has(`${name}:${destinyIndex}`)?" pact-over-limit":""} craftable" tabindex="0" data-pact-node-tooltip data-kismet-node="${escapeHtml(slot.key)}" data-kismet-kind="${slot.kind}" data-node-name="${label}" data-node-effect="${kismet?escapeHtml(kismet.affixes.join(" · ")):"Right-click to choose a Kismet"}" data-node-ring="${slot.kind==="micro"?"inner":"mid"}" data-node-icon="${kismet?.icon||""}" aria-label="${escapeHtml(kismet?`${kismet.name} equipped; right-click to edit`:label)}">${kismet?`<img src="${kismet.icon}" alt="">`:'<span aria-hidden="true">+</span>'}</span>`;
    }).join("");
    const treeHtml=sequence.length?`<div class="pact-tree" aria-label="${escapeHtml(name)} Pactspirit tree">${nodeHtml}${extraHtml}</div><small class="pact-node-count">${allocatedCount} allocated</small>`:"";
    return `<article class="pact-slot${entry?` rarity-${entry.rarity.toLowerCase()}`:""}"><button type="button" class="pact-slot-select" data-open-pactspirit-selector="${index}" ${entry?`data-pactspirit-name="${escapeHtml(name)}"`:""}><span class="pact-slot-portrait ${entry?"filled":"empty"}">${entry?`<img src="${entry.icon}" alt="">`:'<span aria-hidden="true">+</span>'}</span>${entry?`<span><strong>${escapeHtml(name)}</strong><small>${entry.category} · ${entry.rarity}</small></span>`:`<span class="pact-slot-empty">Select Pactspirit ${index+1}</span>`}</button>${entry?`<label>Level<select data-pactspirit-level="${escapeHtml(name)}">${Array.from({length:6},(_,rank)=>`<option value="${rank+1}" ${level===rank+1?"selected":""}>${rank+1}</option>`).join("")}</select></label>${treeHtml}<button type="button" class="pact-slot-remove" data-remove-pactspirit="${index}" aria-label="Remove ${escapeHtml(name)}" title="Remove Pactspirit">×</button>`:""}</article>`;
  }).join("");
  const kismets=equippedKismetSummary(selenaScorchingBeamPactsSs13,plannerState.pacts);
  const group=(label,count,max,title="")=>`<section class="pact-kismet-group"${title?` title="${escapeHtml(title)}"`:""}><h3>${label} <strong${count>max?' class="over-limit"':""}>${count}<span> / ${max}</span></strong></h3></section>`;
  // Kismet-slot pages: the game's limits (src/pact-limits.js) — Pact Points by character level, 9 Micro / 4 Medium Destinies plus
  // the Undetermined Fate slots. A count past its limit reads red (the extra items are not counted).
  $("#pact-kismet-summary").innerHTML=limits.applies
    ?group("Pact Points",limits.points.allocated,limits.points.budget,`${limits.points.levelText}: ${limits.points.base} from level${limits.points.quest?` + ${limits.points.quest} quest (assumed done)`:""}${limits.points.extra?` + ${limits.points.extra} from Rare / Legendary Pactspirits`:""}, up to ${limits.points.cap}`)
      +group("Micro Kismets",limits.micro.installed+limits.micro.inFateSlots,limits.micro.limit+limits.micro.fateSlots,`${limits.micro.limit} Micro Fates${limits.micro.fateSlots?` + ${limits.micro.fateSlots} Undetermined Fate slot${limits.micro.fateSlots===1?"":"s"}`:""}`)
      +group("Medium Kismets",limits.medium.installed+limits.medium.inFateSlots,limits.medium.limit+limits.medium.fateSlots,`${limits.medium.limit} Medium Fates, Kismets and Dual Kismets${limits.medium.fateSlots?` + ${limits.medium.fateSlots} Undetermined Fate slot${limits.medium.fateSlots===1?"":"s"}`:""}`)
    :group("Micro Kismets",kismets.microCount,kismets.microMax)+group("Medium Kismets",kismets.mediumCount,kismets.mediumMax);
}

function removeSelectedPactspirit(index){
  if(!plannerState.pacts.selectedSpirits[index])return;
  plannerState.pacts.selectedSpirits[index]="";
  plannerState.pacts.activeSpirits=activeCapturedPactspirits(plannerState.pacts.selectedSpirits,selenaScorchingBeamPactsSs13.pactspirits.map((spirit)=>spirit.name));
  hidePlannerTooltip();
  refreshPactCandidate();
}

const slateAffixes = (slate) => plannerState.slates?.affixOverrides?.[slate.id] || slate.fixed || [];
const netherKingFixedChoices=new Set(netherKingFixedPool.map((affix)=>slateAffixChoice(affix,"Nether King").value));
// A saved base (fixed) slot keeps any Nether King node line: the base slots now offer the Ultimate nodes too, and a saved SS13
// node with no SS14 match stays as written (src/nether-king-migration.js; slates audit 2026-10-22, user-approved).
const netherKingBaseLine=(affix)=>netherKingFixedChoices.has(affix)||/^Nether King:/.test(affix||"");
function slateCraftedAffixGroups(slate){
  const saved=slate.affixGroups;
  if(slate.god!=="Nether King")return saved||{fixed:(slate.affixes||[]).slice(0,2),random:(slate.affixes||[]).slice(2)};
  if(saved){
    const fixed=(saved.fixed||[]).filter((affix)=>!affix||netherKingBaseLine(affix));
    const brand=[...(saved.fixed||[]).filter((affix)=>affix&&!netherKingBaseLine(affix)),...(saved.brand||saved.random||[])];
    return {fixed,brand};
  }
  const affixes=slate.affixes||[];
  let fixedCount=0;
  // Lists saved without groups predate the Ultimate base slots (an Ultimate there is a Brand); an unmatched SS13 node is a base affix.
  while(fixedCount<2&&(netherKingFixedChoices.has(affixes[fixedCount])||netherKingLineNote(affixes[fixedCount])))fixedCount+=1;
  return {fixed:affixes.slice(0,fixedCount),brand:affixes.slice(fixedCount)};
}

function renderPactspiritSelector(){
  const search=$("[data-pactspirit-search]")?.value.trim().toLowerCase()||"",category=$("[data-pactspirit-category]")?.value||"All";
  const entries=pactspiritCatalogSs13.filter((entry)=>(category==="All"||entry.category===category)&&(!search||`${entry.name} ${entry.description}`.toLowerCase().includes(search)));
  const groups=[...new Set(entries.map((entry)=>entry.category))];
  $("#pactspirit-selector-results").innerHTML=groups.map((group)=>`<section class="pactspirit-selector-group"><h3>${escapeHtml(group)} <small>(${entries.filter((entry)=>entry.category===group).length})</small></h3><div class="pactspirit-selector-grid">${sortPactspirits(entries.filter((entry)=>entry.category===group)).map((entry)=>`<button type="button" class="pactspirit-choice rarity-${entry.rarity.toLowerCase()}" data-select-pactspirit="${escapeHtml(entry.name)}"><img src="${entry.icon}" alt=""><span><strong>${escapeHtml(entry.name)}</strong><small>${entry.rarity} · ${entry.category}</small><em>${escapeHtml(entry.description)}</em></span></button>`).join("")}</div></section>`).join("")||'<p class="pactspirit-no-results">No Pactspirits match your search.</p>';
}
function openFateSlotSelector(name){
  const dialog=$("#fate-slot-selector"),selected=plannerState.pacts.fateUnlocks?.[name];
  dialog.dataset.spiritName=name;
  $("#fate-slot-options").innerHTML=fateSlotChoices.map((choice)=>`<button type="button" data-select-fate-slots="${choice.id}" class="${choice.id===selected?"selected":""}">${escapeHtml(choice.label)}<span aria-hidden="true">${choice.id===selected?"✓":"›"}</span></button>`).join("");
  dialog.showModal();
}
function selectFateSlots(choiceId){
  const dialog=$("#fate-slot-selector"),name=dialog.dataset.spiritName,choice=fateSlotChoice(choiceId);
  if(!name||!choice)return;
  const nextUnlocks={...(plannerState.pacts.fateUnlocks||{}),[name]:choice.id};
  const validKeys=new Set(fateExtraSlots(name,choice.id).map((slot)=>slot.key));
  const nextKismets=Object.fromEntries(Object.entries(plannerState.pacts.kismetSlots||{}).filter(([key])=>key!==`${name}:10`&&(!key.startsWith(`${name}:extra:`)||validKeys.has(key))));
  plannerState.pacts.fateUnlocks=nextUnlocks;
  plannerState.pacts.kismetSlots=nextKismets;
  plannerState.pacts.kismetSlotMode=true;
  dialog.close();hidePlannerTooltip();refreshPactCandidate();
}
function clearFateSlots(name){
  if(!name)return;
  const unlocks={...(plannerState.pacts.fateUnlocks||{})};
  delete unlocks[name];
  plannerState.pacts.fateUnlocks=unlocks;
  plannerState.pacts.kismetSlots=Object.fromEntries(Object.entries(plannerState.pacts.kismetSlots||{}).filter(([key])=>!key.startsWith(`${name}:extra:`)));
  hidePlannerTooltip();refreshPactCandidate();
}
function clearKismetNode(key){
  if(!plannerState.pacts.kismetSlots?.[key])return;
  const slots={...plannerState.pacts.kismetSlots};
  delete slots[key];
  plannerState.pacts.kismetSlots=slots;
  hidePlannerTooltip();refreshPactCandidate();
}
function kismetChoices(){
  return kismetCatalogSs13.filter((item)=>item.kind===activeKismetSlot?.kind).sort((a,b)=>(a.rarity==="Legendary"?-1:1)-(b.rarity==="Legendary"?-1:1)||a.name.localeCompare(b.name));
}
function renderKismetChoices(){
  const query=$("#kismet-search").value.trim().toLowerCase();
  const choices=kismetChoices().filter((item)=>!query||`${item.name} ${item.affixes.join(" ")}`.toLowerCase().includes(query));
  $("#kismet-choice-list").innerHTML=choices.length?choices.map((item)=>`<button type="button" class="kismet-choice ${item.name===selectedKismetName?"selected":""}" data-select-kismet="${escapeHtml(item.name)}"><img src="${item.icon}" alt=""><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.affixes.join(" · "))}</small></span><em class="${item.rarity.toLowerCase()}">${item.rarity}</em></button>`).join(""):'<p class="kismet-no-results">No matching kismets.</p>';
}
function renderKismetPreview(){
  const entry=kismetCatalogSs13.find((item)=>item.name===selectedKismetName),previewBoost=entry&&activeKismetSlot?microFateEffectScale({...plannerState.pacts,kismetSlots:{...plannerState.pacts.kismetSlots,[activeKismetSlot.key]:{name:entry.name}}},activeKismetSlot.key):null;
  // Past the game's install limit: Confirm is disabled and the preview says why (src/pact-limits.js kismetInstallBlock).
  const installBlock=entry&&activeKismetSlot?kismetInstallBlock({...plannerState.pacts,kismetSlotMode:true},activeKismetSlot.key,entry.kind,pactCharacter()):null;
  const confirm=$("[data-confirm-kismet]");
  if(confirm){confirm.disabled=Boolean(installBlock);confirm.title=installBlock||"";}
  $("#kismet-preview").innerHTML=(installBlock?`<p class="curse-limit-note">${escapeHtml(installBlock)}</p>`:"")+(entry?`<div class="kismet-preview-head"><img src="${entry.icon}" alt=""><div><strong>${escapeHtml(entry.name)}</strong><small>${entry.rarity} · ${entry.kind=== "micro"?"Micro":"Medium"} Kismet${starTrailNote(previewBoost)?` · ${starTrailNote(previewBoost)}`:""}</small></div></div><ul>${kismetAffixesWithRolls(entry,selectedKismetRolls).map((affix)=>`<li>${boostedKismetAffixHtml(affix,previewBoost)}</li>`).join("")}</ul><p>Install to replace this ${entry.kind=== "micro"?"Micro":"Medium"} node.</p>`:"");
}
function renderKismetDetails(){
  const entry=kismetCatalogSs13.find((item)=>item.name===selectedKismetName);
  const controls=entry?kismetRollControls(entry):[];
  $("#kismet-roll-controls").innerHTML=controls.length?controls.map((control,index)=>`<label class="kismet-roll-row"><span>Value ${index+1}: <strong data-kismet-roll-output="${index}">${selectedKismetRolls[index]}</strong></span><div><input type="range" data-kismet-roll-range="${index}" min="${control.min}" max="${control.max}" step="${control.step}" value="${selectedKismetRolls[index]}"><input type="number" data-kismet-roll-number="${index}" min="${control.min}" max="${control.max}" step="${control.step}" value="${selectedKismetRolls[index]}" aria-label="Value ${index+1}"></div><small>${escapeHtml(entry.affixes[control.affixIndex])}</small></label>`).join(""):'<p class="kismet-fixed-roll">This Kismet has fixed effects.</p>';
  renderKismetPreview();
}
function selectKismetChoice(name){
  const entry=kismetCatalogSs13.find((item)=>item.name===name&&item.kind===activeKismetSlot?.kind);
  if(!entry)return;
  selectedKismetName=name;
  selectedKismetRolls=normalizeKismetRolls(entry);
  renderKismetChoices();renderKismetDetails();
}
function openKismetCrafter(key,kind){
  activeKismetSlot={key,kind};
  const saved=plannerState.pacts.kismetSlots?.[key],entry=kismetCatalogSs13.find((item)=>item.name===saved?.name&&item.kind===kind)||kismetChoices()[0];
  selectedKismetName=entry?.name||"";
  selectedKismetRolls=entry?normalizeKismetRolls(entry,saved?.name===entry.name?saved.rolls:[]):[];
  $("#kismet-crafter-title").textContent=`Select ${kind==="micro"?"Micro":"Medium"} Kismet`;
  $("#kismet-search").value="";
  renderKismetChoices();renderKismetDetails();
  $("#kismet-crafter").showModal();
  $("#kismet-search").focus();
}
function saveKismetSlot(clear=false){
  if(!activeKismetSlot)return;
  const next={...(plannerState.pacts.kismetSlots||{})};
  if(clear)delete next[activeKismetSlot.key];
  else {
    const entry=kismetCatalogSs13.find((item)=>item.name===selectedKismetName&&item.kind===activeKismetSlot.kind);if(!entry)return;
    // The game's install limits (src/pact-limits.js: 9 Micro / 4 Medium Destinies; Undetermined Fate slots on top).
    const block=kismetInstallBlock({...plannerState.pacts,kismetSlotMode:true},activeKismetSlot.key,entry.kind,pactCharacter());
    if(block){showToast(block);return;}
    next[activeKismetSlot.key]={name:entry.name,rolls:normalizeKismetRolls(entry,selectedKismetRolls)};
  }
  plannerState.pacts.kismetSlots=next;
  plannerState.pacts.kismetSlotMode=true;
  $("#kismet-crafter").close();activeKismetSlot=null;hidePlannerTooltip();refreshPactCandidate();
}
const slateAsset=(name)=>`./src/assets/tli/slates/${name}`;
const slateShapeArt=(shape,god=selectedSlateGod)=>{const cells={corner:[[0,0],[0,1],[1,1]],line:[[0,0],[0,1]],tee:[[0,0],[1,0],[1,1]],single:[[0,0]]}[shape]||[[0,0]];return `<span class="god-slate-shape ${slateGodKey(god)}">${cells.map(([x,y])=>`<i style="--x:${x};--y:${y}"></i>`).join("")}</span>`;};
const godSlateAssets={deception:["AI"],hunting:["Agi"],knowledge:["Int"],machines:["SI"],might:["Str"],war:["SA"]};
const slateShapeCodes=["Z1","L1","O1","T1"];
function renderSlateInventory(){
  const inventory=plannerState.slates?.inventory||[];
  $("#slate-inventory-header").innerHTML=`<strong id="slate-inventory-title">Slate Inventory</strong><button type="button" class="picker-close" data-close-slate-inventory aria-label="Close slate inventory">×</button>`;
  $("#slate-crafter-body").innerHTML=`<div class="crafted-slate-inventory"><div class="crafted-slate-list">${inventory.length?inventory.map((slate)=>{const icon=craftedSlateIcon(slate),equipped=equippedSlateIds.has(slate.id),staged=!!parkedSlates[slate.id];return `<article class="crafted-slate-item ${equipped?"equipped":staged?"staged":""}" data-crafted-slate-inventory="${escapeHtml(slate.id)}"><span class="crafted-slate-icon">${icon?`<img src="${escapeHtml(icon)}" alt="">`:slateShapeArt(slate.shape,slate.god)}</span><span><strong>${escapeHtml(slate.name)}${equipped?'<em class="crafted-slate-equipped-badge">Equipped</em>':staged?'<em class="crafted-slate-equipped-badge">Workspace</em>':""}</strong><small>${slate.affixes.filter(Boolean).length} affix${slate.affixes.filter(Boolean).length===1?"":"es"} · ${escapeHtml(slate.god)}</small></span><span class="crafted-slate-tools"><button type="button" data-duplicate-crafted-slate="${escapeHtml(slate.id)}" title="Duplicate">▢</button><button type="button" data-edit-crafted-slate="${escapeHtml(slate.id)}" title="Edit">✎</button><button type="button" data-remove-crafted-slate="${escapeHtml(slate.id)}" title="Remove from grid" ${equipped||staged?"":"disabled"}>⊘</button><button type="button" data-delete-crafted-slate="${escapeHtml(slate.id)}" title="Delete">×</button></span></article>`;}).join(""):`<div class="crafted-slate-empty"><strong>No crafted slates yet</strong><span>Craft a slate to add it to this build's inventory.</span></div>`}</div><button type="button" class="button crafted-slate-create" data-open-slate-crafter>Craft Slate</button></div>`;
}
function renderSlateCrafter(){
  const body=$("#slate-crafter-body"), affixPool=divinitySlateAffixesSs13[selectedSlateGod]||[], affixRows=(heading,start,count)=>`<fieldset><legend>${heading} (0/${count})</legend>${Array.from({length:count},(_,index)=>`<label class="slate-affix-row"><span>Slot ${start+index}</span><select><option value="">Select affix…</option></select></label>`).join("")}</fieldset>`;
  $("#slate-inventory-header").innerHTML=`<button type="button" class="${activeSlateCrafterTab==="craft"?"active":""}" data-slate-inventory-tab="craft">Craft Slate</button><button type="button" class="${activeSlateCrafterTab==="legendary"?"active":""}" data-slate-inventory-tab="legendary">Craft Legendary Slate</button><button type="button" class="${activeSlateCrafterTab==="judgment"?"active":""}" data-slate-inventory-tab="judgment">Nether King</button><button type="button" class="picker-close" data-close-slate-inventory aria-label="Close slate inventory">×</button>`;
  const actions=`<div class="slate-inventory-actions"><button type="button" class="button button-secondary" data-back-slate-inventory>${editingCraftedSlateId?"Cancel":"Back to Inventory"}</button><button type="button" class="button" data-add-crafted-slate>${editingCraftedSlateId?"Save Changes":"Add to Inventory"}</button></div>`;
  if(activeSlateCrafterTab==="legendary"){
    const templates=[["game-captures/sparks-of-moth-fire.webp","Sparks of Moth Fire"],["game-captures/fallen-starlight.webp","Fallen Starlight"],["game-captures/corner-of-divinity.webp","A Corner of Divinity"],["game-captures/space-rift.svg","Space Rift"],["game-captures/pedigree-of-gods.webp","Pedigree of Gods"],["game-captures/residence-of-stars.svg","Residence of Stars"],["game-captures/prairie-ablaze.webp","When Sparks Set the Prairie Ablaze"]];
    if(selectedLegendarySlateName==="Sparks of Moth Fire"){
      const icon=slateGameCaptureByName[selectedLegendarySlateName];
      body.innerHTML=`<div class="slate-craft-layout slate-legendary-detail"><section><p class="eyebrow">Legendary Template</p><div class="slate-legendary-selection"><img src="${icon}" alt=""><div><strong>Sparks of Moth Fire</strong><small>Selected Legendary</small></div><button type="button" class="button button-secondary" data-change-slate-template>Change</button><button type="button" class="active" data-slate-template="Sparks of Moth Fire" hidden></button></div><fieldset><legend>Shape &amp; Orientation</legend><div class="slate-shape-options"><button type="button" class="active" data-craft-shape="single"><img src="${icon}" alt="Sparks of Moth Fire shape"></button><span class="slate-shape-preview"><img src="${icon}" alt=""></span><div class="slate-transform-options"><button type="button" data-craft-transform="rotate">↻ Rotate</button><button type="button" data-craft-transform="flip-h">↔ Flip H</button><button type="button" data-craft-transform="flip-v">↕ Flip V</button></div></div></fieldset><fieldset><legend>Fixed Affix</legend><label class="slate-affix-row"><span>Slot 1</span><select data-sparks-copy-rule aria-label="Sparks of Moth Fire copy direction">${sparksOfMothFireCopyRules.map((rule,index)=>`<option value="${escapeHtml(rule)}">${sparksOfMothFireDirections[index]} · ${escapeHtml(rule)}</option>`).join("")}</select></label></fieldset></section><aside><span>Preview</span><div class="slate-craft-card"><img src="${icon}" alt=""><strong>Sparks of Moth Fire</strong><small>DIVINITY SLATE · LEGENDARY</small><div class="slate-craft-affix-preview"><section><h3>Fixed Affix</h3><div class="sparks-preview-direction"><span class="sparks-preview-arrow" data-sparks-preview-arrow aria-hidden="true">↑</span><strong data-sparks-preview-direction>From above</strong></div><ul><li><span data-sparks-preview-rule>${escapeHtml(sparksOfMothFireCopyRules[0])}</span></li></ul></section></div></div>${actions}</aside></div>`;
      return;
    }
    if(selectedLegendarySlateName==="Residence of Stars"){
      const icon=slateGameCaptureByName[selectedLegendarySlateName];
      body.innerHTML=`<div class="slate-craft-layout slate-legendary-detail"><section><p class="eyebrow">Legendary Template</p><div class="slate-legendary-selection"><img src="${icon}" alt=""><div><strong>Residence of Stars</strong><small>Selected Legendary</small></div><button type="button" class="button button-secondary" data-change-slate-template>Change</button><button type="button" class="active" data-slate-template="Residence of Stars" hidden></button></div><fieldset><legend>Shape &amp; Orientation</legend><div class="slate-shape-options"><button type="button" class="active" data-craft-shape="residence"><img src="${icon}" alt="Residence of Stars shape"></button><span class="slate-shape-preview"><img src="${icon}" alt=""></span><small class="slate-transform-note">Orientation is fixed</small></div></fieldset><fieldset><legend>Fixed Affix</legend><label class="slate-affix-row"><span>Slot 1</span><span class="slate-readonly">${escapeHtml(residenceOfStarsCopyRule)}</span></label></fieldset></section><aside><span>Preview</span><div class="slate-craft-card"><img src="${icon}" alt=""><strong>Residence of Stars</strong><small>DIVINITY SLATE · LEGENDARY</small><div class="slate-craft-affix-preview"><section><h3>Fixed Affix</h3><ul><li><span>${escapeHtml(residenceOfStarsCopyRule)}</span></li></ul></section></div></div>${actions}</aside></div>`;
      return;
    }
    if(["When Sparks Set the Prairie Ablaze","Space Rift","Fallen Starlight","A Corner of Divinity","Pedigree of Gods"].includes(selectedLegendarySlateName)){
      const name=selectedLegendarySlateName,icon=slateGameCaptureByName[name],slotTypes=legendaryTalentSlotTypes[name]||[];
      const copyRules=name==="Space Rift"?spaceRiftCopyRules:name==="When Sparks Set the Prairie Ablaze"?[prairieAblazeCopyRule]:[];
      const optionPool=name==="Pedigree of Gods"?[...allDivinitySlateAffixes,...pedigreeCoreAffixesSs13]:allDivinitySlateAffixes;
      const affixControls=slotTypes.map((types,index)=>`<label class="slate-affix-row"><span>Slot ${index+1}</span><select data-legendary-affix="${index}" aria-label="${escapeHtml(name)} affix ${index+1}"><option value="">Select ${escapeHtml(types.join(" or "))}…</option></select></label>`).join("");
      const fixedControl=copyRules.length>1?`<select data-legendary-copy-rule aria-label="Space Rift copy direction">${copyRules.map((rule,index)=>`<option value="${escapeHtml(rule)}">${index?"→ Right":"← Left"} · ${escapeHtml(rule)}</option>`).join("")}</select>`:`<span class="slate-readonly">${escapeHtml(copyRules[0]||"")}</span>`;
      const previewAffix=copyRules.length?`<div class="slate-craft-affix-preview"><section><h3>Fixed Affix</h3>${copyRules.length>1?'<div class="sparks-preview-direction"><span class="sparks-preview-arrow" data-legendary-copy-arrow aria-hidden="true">←</span><strong data-legendary-copy-label>From left</strong></div>':""}<ul><li><span data-legendary-copy-preview>${escapeHtml(copyRules[0])}</span></li></ul></section></div>`:`<div class="slate-craft-affix-preview"><p>Choose affixes to preview their effects.</p></div>`;
      body.innerHTML=`<div class="slate-craft-layout slate-legendary-detail"><section><p class="eyebrow">Legendary Template</p><div class="slate-legendary-selection"><img src="${icon}" alt=""><div><strong>${escapeHtml(name)}</strong><small>Selected Legendary</small></div><button type="button" class="button button-secondary" data-change-slate-template>Change</button><button type="button" class="active" data-slate-template="${escapeHtml(name)}" hidden></button></div><fieldset><legend>Shape &amp; Orientation</legend><div class="slate-shape-options"><button type="button" class="active" data-craft-shape="legendary"><img src="${icon}" alt="${escapeHtml(name)} shape"></button><span class="slate-shape-preview"><img src="${icon}" alt=""></span><div class="slate-transform-options">${slateTransformRules(name).rotate?`<button type="button" data-craft-transform="rotate">↻ Rotate</button>`:""}${slateTransformRules(name).flip?`<button type="button" data-craft-transform="flip-h">↔ Flip H</button><button type="button" data-craft-transform="flip-v">↕ Flip V</button>`:""}</div></div></fieldset><fieldset><legend>${copyRules.length?"Fixed Affix":`Talent Affixes (0/${slotTypes.length})`}</legend>${copyRules.length?`<label class="slate-affix-row"><span>Slot 1</span>${fixedControl}</label>`:affixControls}</fieldset></section><aside><span>Preview</span><div class="slate-craft-card"><img src="${icon}" alt=""><strong>${escapeHtml(name)}</strong><small>DIVINITY SLATE · LEGENDARY</small>${previewAffix}</div>${actions}</aside></div>`;
      [...body.querySelectorAll("[data-legendary-affix]")].forEach((select,index)=>setSlateAffixPool(select,optionPool.filter((affix)=>slotTypes[index].includes(affix.name)),selectedSlateGod,true));
      return;
    }
    body.innerHTML=`<div class="slate-template-layout"><section><p>Legendary Template</p><div class="slate-template-grid">${templates.map(([icon,name])=>`<button type="button" data-slate-template="${escapeHtml(name)}"><img src="${slateAsset(icon)}" alt=""><span>${escapeHtml(name)}</span></button>`).join("")}</div></section><aside><span>Preview</span><div class="slate-empty-preview">Select options to preview slate</div>${actions}</aside></div>`; return;
  }
  const nether=activeSlateCrafterTab==="judgment";
  const netherNames=["Judgment","Contamination","Offspring"];
  const netherName=`Nether King's Divinity: ${selectedNetherSlateType}`;
  const netherIcon=slateGameCaptureByName[netherName];
  const gods=["Goddess of Deception","Goddess of Hunting","Goddess of Knowledge","God of Machines","God of Might","God of War"];
  const godKey=slateGodKey(selectedSlateGod), suffix=godSlateAssets[godKey]?.[0], nativeSlateFiles=suffix?slateShapeCodes.map(shape=>`UI_TalantNG_${shape}_0_Icon_${suffix}_112.webp`):[], native=Boolean(suffix), nativeArt=(file)=>`<img src="${file.includes("_Z1_")&&godSlateCaptureByKey[godKey]?slateAsset(`game-captures/${godSlateCaptureByKey[godKey]}.svg`):godKey==="deception"&&file.includes("_Z1_")?slateAsset("game-captures/goddess-of-deception-divinity.webp"):godSlateShapeCapture(godKey,slateShapeCodes.find(shape=>file.includes(`_${shape}_`)))}" alt="${selectedSlateGod} slate">`;
  body.innerHTML=`<div class="slate-craft-layout"><section><label class="slate-field">Name<input type="text" data-slate-craft-name placeholder="Custom name (optional)"></label>${nether?`<fieldset class="slate-craft-gods"><legend>Nether King Type</legend>${netherNames.map(type=>`<button type="button" data-nether-slate-type="${type}" class="${type===selectedNetherSlateType?"active":""}">${type}</button>`).join("")}</fieldset>`:`<fieldset class="slate-craft-gods"><legend>God</legend>${gods.map(god=>`<button type="button" data-slate-god="${god}" class="${god===selectedSlateGod?"active":""}">${god}</button>`).join("")}</fieldset>`}<fieldset><legend>Shape &amp; Orientation</legend><div class="slate-shape-options ${native?"native-slate-assets":""}">${nether?`<button type="button" class="active" data-craft-shape="authority"><img src="${netherIcon}" alt=""></button>`:native?nativeSlateFiles.map((file,index)=>`<button type="button" class="${index?"":"active"}" data-craft-shape="${godKey}-${index}">${nativeArt(file)}</button>`).join(""):["corner","line","tee","single"].map((shape,index)=>`<button type="button" class="${index?"":"active"}" data-craft-shape="${shape}">${slateShapeArt(shape)}</button>`).join("")}<span class="slate-shape-preview">${nether?`<img src="${netherIcon}" alt="">`:native?nativeArt(nativeSlateFiles[0]):slateShapeArt("corner")}</span><div class="slate-transform-options"><button type="button" data-craft-transform="rotate">↻ Rotate</button><button type="button" data-craft-transform="flip-h">↔ Flip H</button><button type="button" data-craft-transform="flip-v">↕ Flip V</button></div></div>${nether?`<small>Block grows with filled Brand Talent Nodes<br>(0–1 → 1 block, 2 → 2, 3 → Authority)</small>`:""}</fieldset>${nether?`<fieldset><legend>Authority Effect</legend><input class="slate-readonly" value="${netherName}" readonly><small>This slate has a fixed Authority effect</small><p class="slate-authority-copy">${escapeHtml(AUTHORITY_TEXTS[selectedNetherSlateType==="Offspring"?"Banishment":selectedNetherSlateType]||"")}</p>${selectedNetherSlateType==="Offspring"?`<label class="slate-affix-row"><span>Bonus Effect</span><select data-banishment-effect aria-label="Banishment Bonus Effect"><option value="">Select Bonus Effect…</option>${Object.keys(BANISHMENT_EFFECTS).map((name)=>`<option value="${escapeHtml(name)}">${escapeHtml(`Effect: ${name}`)}</option>`).join("")}</select></label>`:""}</fieldset>`:""}${affixRows("Fixed Affixes",1,2,nether?netherKingBasePool:affixPool)}${affixRows(nether?"Brand Talent Nodes":"Random Affixes",3,3,nether?netherKingBrandPool:affixPool)}</section><aside><span>Preview</span><div class="slate-craft-card ${nether?"nether":slateGodFamilyClass(selectedSlateGod)}">${nether?`<img src="${netherIcon}" alt="">`:native?nativeArt(nativeSlateFiles[0]):`${slateShapeArt("corner")} `}<strong>${nether?netherName:selectedSlateGod}</strong><small>${nether?"NETHER KING'S DIVINITY · LEGENDARY":"DIVINITY SLATE · MAGIC"}</small>${nether?`<hr><em>AUTHORITY</em><b>${netherName}</b>`:""}</div>${actions}</aside></div>`;
  [...body.querySelectorAll(".slate-affix-row select:not([data-banishment-effect])")].forEach((select,index)=>setSlateAffixPool(select,nether?(index<2?netherKingBasePool:netherKingBrandPool):affixPool,selectedSlateGod));
  body.querySelector(".slate-craft-card small")?.insertAdjacentHTML("afterend",'<div class="slate-craft-affix-preview" aria-live="polite"></div>');
  updateSlateCraftPreview();
}
function updateSlateCraftPreview(){
  const body=$("#slate-crafter-body"),card=body?.querySelector(".slate-craft-card"),preview=card?.querySelector(".slate-craft-affix-preview");
  if(!preview)return;
  if(activeSlateCrafterTab==="legendary"){
    const art=body.querySelector(".slate-shape-preview img"),cardArt=card.querySelector(":scope > img");
    if(art&&cardArt)cardArt.style.transform=art.style.transform;
    const rule=body.querySelector("[data-sparks-copy-rule]"),rulePreview=card.querySelector("[data-sparks-preview-rule]");
    if(rule&&rulePreview){
      rulePreview.textContent=rule.value;
      const direction=sparksOfMothFireDirections[Math.max(0,sparksOfMothFireCopyRules.indexOf(rule.value))];
      const arrow=card.querySelector("[data-sparks-preview-arrow]"),label=card.querySelector("[data-sparks-preview-direction]");
      if(arrow)arrow.textContent=direction[0];
      if(label)label.textContent=`From ${direction.slice(2).toLowerCase()}`;
    }
    const legendaryRule=body.querySelector("[data-legendary-copy-rule]"),legendaryRulePreview=card.querySelector("[data-legendary-copy-preview]");
    if(legendaryRule&&legendaryRulePreview){
      legendaryRulePreview.textContent=legendaryRule.value;
      const fromRight=legendaryRule.selectedIndex===1;
      card.querySelector("[data-legendary-copy-arrow]").textContent=fromRight?"→":"←";
      card.querySelector("[data-legendary-copy-label]").textContent=fromRight?"From right":"From left";
    }
    const talentSelects=[...body.querySelectorAll("[data-legendary-affix]")];
    if(talentSelects.length){
      const chosen=talentSelects.filter((select)=>select.value);
      body.querySelector(".slate-legendary-detail fieldset:last-of-type legend").textContent=`Talent Affixes (${chosen.length}/${talentSelects.length})`;
      preview.innerHTML=chosen.length?`<section><h3>Talent Affixes</h3><ul>${chosen.map((select)=>{const option=select.selectedOptions[0],details=option.dataset.affixDetails||select.value,colon=details.indexOf(": "),type=colon<0?"":details.slice(0,colon),effect=colon<0?details:details.slice(colon+2),limited=option.dataset.maxDivinityEffect==="1",core=/\bLv\.[12] Core Talent\b/.test(type),coreName=core?effect.match(/^(.+?)\s+[—–]\s+/)?.[1]:"";return `<li class="${core?"core-slate-affix":""} ${limited?"max-one-divinity":""}">${core?'<strong class="core-slate-badge">Core Talent</strong>':""}<small>${escapeHtml([option.dataset.affixTree,type].filter(Boolean).join(" · "))}</small><span>${coreName?`<span class="keyword-roll-name">${escapeHtml(coreName)}</span>${escapeHtml(effect.slice(coreName.length))}`:modifierTextMarkup(effect)}</span>${limited?'<strong class="max-divinity-badge">MAX ACTIVE: 1</strong>':""}</li>`;}).join("")}</ul></section>`:"<p>Choose affixes to preview their effects.</p>";
    }
    return;
  }
  const name=body.querySelector("[data-slate-craft-name]")?.value.trim();
  card.querySelector("strong").textContent=name||(activeSlateCrafterTab==="judgment"?`Nether King's Divinity: ${selectedNetherSlateType}`:selectedSlateGod);
  const art=body.querySelector(".slate-shape-preview img"),cardArt=card.querySelector(":scope > img");
  if(art&&cardArt){cardArt.src=art.src;cardArt.style.transform=art.style.transform;}
  const selects=[...body.querySelectorAll(".slate-affix-row select:not([data-banishment-effect])")];
  const groups=[["Fixed Affixes",selects.slice(0,2)],[activeSlateCrafterTab==="judgment"?"Brand Talent Nodes":"Random Affixes",selects.slice(2)]];
  body.querySelectorAll(".slate-craft-layout fieldset").forEach((fieldset)=>{const legend=fieldset.querySelector(":scope > legend");if(!legend)return;const group=groups.find(([title])=>legend.textContent.startsWith(title));if(group)legend.textContent=`${group[0]} (${group[1].filter((select)=>select.value).length}/${group[1].length})`;});
  preview.innerHTML=groups.map(([title,slots])=>{const chosen=slots.filter((select)=>select.value).map((select)=>{const option=select.selectedOptions[0],details=option.dataset.affixDetails||option.textContent,colon=details.indexOf(": "),type=colon<0?"":details.slice(0,colon),effect=colon<0?details:details.slice(colon+2),tree=option.dataset.affixTree||"",limited=option.dataset.maxDivinityEffect==="1";return `<li class="${limited?"max-one-divinity":""}"><small>${escapeHtml([tree,type].filter(Boolean).join(" · "))}</small><span>${modifierTextMarkup(effect)}</span>${limited?'<strong class="max-divinity-badge" title="Only one copy of this effect is active across equipped slates">MAX ACTIVE DIVINITY: 1</strong><small>Duplicates on other slates do not stack.</small>':""}</li>`;});return chosen.length?`<section><h3>${title}</h3><ul>${chosen.join("")}</ul></section>`:"";}).join("")||'<p>Choose affixes to preview their effects.</p>';
}
document.addEventListener("change",(event)=>{if(event.target.matches("#slate-crafter-body .slate-affix-row select"))updateSlateCraftPreview();});
document.addEventListener("input",(event)=>{if(event.target.matches("#slate-crafter-body [data-slate-craft-name]"))updateSlateCraftPreview();});
function openCraftedSlateEditor(slate){
  editingCraftedSlateId=slate.id;
  selectedNetherSlateType=slate.name.split("Nether King's Divinity: ")[1]||"Judgment";
  selectedSlateGod=slate.god==="Nether King"?"Goddess of Deception":slate.god;
  activeSlateCrafterTab=slate.god==="Nether King"?"judgment":slate.rarity==="legendary"?"legendary":"craft";
  selectedLegendarySlateName=activeSlateCrafterTab==="legendary"?(slate.template||slate.name):"";
  renderSlateCrafter();
  if(activeSlateCrafterTab==="legendary"){
    const preview=$(".slate-shape-preview");
    const copyRule=$("[data-sparks-copy-rule]");
    if(copyRule){ const savedRule=slate.copyRule||slate.affixes?.[0]; if(sparksOfMothFireCopyRules.includes(savedRule))copyRule.value=savedRule; }
    const legendaryRule=$("[data-legendary-copy-rule]");
    if(legendaryRule&&spaceRiftCopyRules.includes(slate.copyRule))legendaryRule.value=slate.copyRule;
    // Pedigree slots hold rolled talent nodes; a saved value outside the slot's pool is cleared here only (storage changes on Save).
    const pedigree=selectedLegendarySlateName===PEDIGREE_OF_GODS?normalizePedigreeAffixes(slate.affixes||[]):null;
    if(pedigree?.cleared.length)document.querySelector("[data-legendary-affix]")?.closest("fieldset")?.querySelector("legend")?.insertAdjacentHTML("afterend",`<p class="notice" data-pedigree-slot-notice>Pedigree of Gods slots hold rolled talent nodes only. The saved value in slot ${pedigree.cleared.map((item)=>item.slot).join(", ")} is not a valid node and was cleared; choose the node shown on your slate.</p>`);
    [...document.querySelectorAll("[data-legendary-affix]")].forEach((select,index)=>{
      const affix=(pedigree?pedigree.affixes:slate.affixes)?.[index]||"";
      if(affix&&![...select.options].some((option)=>option.value===affix))select.add(new Option(affix,affix));
      select.value=affix;
    });
    if(preview?.firstElementChild){ preview.dataset.rotation=String(slate.rotation||0); preview.dataset.flipX=String(slate.flipX||1); preview.dataset.flipY=String(slate.flipY||1); preview.firstElementChild.style.transform=`rotate(${slate.rotation||0}deg) scale(${slate.flipX||1}, ${slate.flipY||1})`; }
    const template=[...document.querySelectorAll("[data-slate-template]")].find((button)=>button.dataset.slateTemplate===slate.name);
    if(template&&!preview){ template.classList.add("active"); const card=$(".slate-empty-preview"),image=template.querySelector("img"); card.className="slate-craft-card"; card.innerHTML=`${image?.outerHTML||""}<strong>${escapeHtml(slate.name)}</strong><small>DIVINITY SLATE · LEGENDARY</small>`; }
    updateSlateCraftPreview();
    return;
  }
  const name=$("[data-slate-craft-name]"); if(name)name.value=slate.name;
  const banishmentEffect=$("[data-banishment-effect]"); if(banishmentEffect&&slate.authorityEffect)banishmentEffect.value=slate.authorityEffect;
  const shape=[...document.querySelectorAll("[data-craft-shape]")].find((button)=>button.dataset.craftShape===slate.shape); if(shape){ document.querySelectorAll("[data-craft-shape]").forEach((button)=>button.classList.toggle("active",button===shape)); const art=shape.querySelector("img,.god-slate-shape"),preview=$(".slate-shape-preview"); if(art&&preview){ preview.innerHTML=art.outerHTML; preview.dataset.rotation=String(slate.rotation); preview.dataset.flipX=String(slate.flipX); preview.dataset.flipY=String(slate.flipY); preview.firstElementChild.style.transform=`rotate(${slate.rotation}deg) scale(${slate.flipX}, ${slate.flipY})`; } }
  [...document.querySelectorAll("#slate-crafter-body .slate-affix-row select:not([data-banishment-effect])")].forEach((select,index)=>{
    const savedGroups=slateCraftedAffixGroups(slate);
    const savedSlots=[...savedGroups.fixed,...Array(Math.max(0,2-savedGroups.fixed.length)).fill(""),...(savedGroups.random||savedGroups.brand||[])];
    const affix=savedSlots?.[index]||"";
    if(affix&&![...select.options].some((option)=>option.value===affix))select.add(new Option(affix,affix));
    select.value=affix;
  });
  updateSlateCraftPreview();
}
function renderSlateEditor(slate) {
  const affixes=slateAffixes(slate),rules=slateTransformRules(slate);
  $("#slate-editor-title").textContent=`Edit ${titleCase(slate.rarity)} Slate`;
  $("#slate-editor-content").innerHTML=`<div class="slate-editor-layout"><section><p class="eyebrow">Legendary template</p><h2>${slate.name}</h2><div class="slate-editor-shape"><img src="${slate.icon||slate.cellIcon||""}" alt=""><div>${rules.rotate?`<button type="button" data-slate-rotate="${slate.id}" data-slate-rotate-dir="1">↻ Rotate</button><button type="button" data-slate-rotate="${slate.id}" data-slate-rotate-dir="-1">↶ Rotate back</button>`:""}${rules.flip?`<button type="button" data-slate-flip="${slate.id}" data-slate-flip-axis="x">↔ Flip H</button><button type="button" data-slate-flip="${slate.id}" data-slate-flip-axis="y">↕ Flip V</button>`:""}${!rules.rotate&&!rules.flip?"Orientation is fixed":""}</div></div><fieldset><legend>Affixes (${affixes.length})</legend>${affixes.map((effect,index)=>`<label class="slate-affix-row"><span>Slot ${index+1}</span><input type="text" data-slate-affix="${index}" value="${escapeHtml(effect)}"></label>`).join("")}<button type="button" class="button button-secondary add-affix" data-add-slate-affix>Add affix</button></fieldset></section><aside><span>Preview</span><div class="slate-craft-card"><strong>${slate.name}</strong><small>DIVINITY SLATE · ${slate.rarity.toUpperCase()}</small></div></aside></div><div class="slate-editor-footer"><button type="button" class="button button-secondary" data-close-slate-editor>Cancel</button><button type="button" class="button" data-save-slate-editor="${slate.id}">Save Changes</button></div>`;
}

function centerSlateGridInPanel(){
  const panel=document.querySelector("#talents-view.showing-slates .slate-board-panel");
  const stage=panel?.querySelector(".slate-stage"),grid=stage?.querySelector(".divinity-board");
  if(!panel||!stage||!grid||!panel.clientHeight)return;
  const panelRect=panel.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();
  const centeredTop=panelRect.top+panelRect.height/2-stageRect.top-grid.offsetHeight/2;
  stage.style.setProperty("--slate-grid-top",`${Math.max(0,Math.round(centeredTop))}px`);
}

function renderSlates() {
  const slates = slatesForBoard();
  const judgmentAffected = judgmentAffectedSlateIds(slates, slatePlacements, equippedSlateIds);
  $("#slate-count").textContent = equippedSlateIds.size;
  const adjacent = new Set(slates.filter((item) => item.copyRule && slatePlacements[item.id]).flatMap((item) => adjacentSlateIds(item, slatePlacements, slates)));
  const cells = SLATE_BOARD_ROWS.flatMap((columns,row) => columns.map((column) => `<button type="button" class="slate-cell" data-slate-cell="${column},${row+1}" aria-label="Board cell ${column}, ${row+1}"></button>`)).join("");
  const pieces = slates.filter((slate) => equippedSlateIds.has(slate.id) && slatePlacements[slate.id]).map((slate,index) => { const placement=slatePlacements[slate.id],flipX=placement.flipX||1,flipY=placement.flipY||1; const [width,height]=slateSize(slate,placement.rotation,flipX,flipY); const [baseWidth,baseHeight]=slateSize(slate,0); const offsets=slateOffsets(slate,placement.rotation,flipX,flipY); const neighbors=slate.copyRule ? adjacentSlateIds(slate,slatePlacements,slates).length : 0; return `<button type="button" class="slate-piece ${slate.overlay ? "overlay-slate" : ""} ${slate.copyRule ? "copy-slate" : ""} ${judgmentAffected.has(slate.id) ? "judgment-affected" : ""} ${adjacent.has(slate.id) ? "copied-by-neighbor" : ""} ${selectedSlateId===slate.id ? "selected" : ""}" style="--slate-column:${placement.column};--slate-row:${placement.row};--slate-width:${width};--slate-height:${height};--slate-base-width:${baseWidth};--slate-base-height:${baseHeight};--slate-art-width:${baseWidth*72}px;--slate-art-height:${baseHeight*72}px;--slate-rotation:${placement.rotation||0}deg;--slate-flip-x:${flipX};--slate-flip-y:${flipY}" data-slate-id="${slate.id}" aria-label="${escapeHtml(slate.name)}: hover for affixes">${offsets.map(([column,row])=>`<i style="--piece-column:${column};--piece-row:${row}">${slate.cellIcon ? `<img class="slate-cell-art" src="${slate.cellIcon}" alt="">` : ""}</i>`).join("")}${slate.icon ? `<img class="slate-piece-art" src="${slate.icon}" alt="">` : ""}<span>${index+1}</span><strong>${slate.name}</strong>${slate.copyRule ? `<em>${neighbors} adjacent</em>` : ""}</button>`; }).join("");
  const parkedPieces=slates.filter((slate)=>parkedSlates[slate.id]&&!equippedSlateIds.has(slate.id)).map((slate)=>{const placement=parkedSlates[slate.id],flipX=placement.flipX||1,flipY=placement.flipY||1,[width,height]=slateSize(slate,placement.rotation,flipX,flipY),[baseWidth,baseHeight]=slateSize(slate,0),offsets=slateOffsets(slate,placement.rotation,flipX,flipY);return `<button type="button" class="slate-piece parked-slate ${slate.copyRule?"copy-slate":""}" style="--park-x:${placement.x}%;--park-y:${placement.y}%;--slate-width:${width};--slate-height:${height};--slate-base-width:${baseWidth};--slate-base-height:${baseHeight};--slate-art-width:${baseWidth*72}px;--slate-art-height:${baseHeight*72}px;--slate-rotation:${placement.rotation||0}deg;--slate-flip-x:${flipX};--slate-flip-y:${flipY}" data-slate-id="${slate.id}" aria-label="${escapeHtml(slate.name)}: parked outside the grid; drag onto the grid to equip">${offsets.map(([column,row])=>`<i style="--piece-column:${column};--piece-row:${row}">${slate.cellIcon?`<img class="slate-cell-art" src="${slate.cellIcon}" alt="">`:""}</i>`).join("")}${slate.icon?`<img class="slate-piece-art" src="${slate.icon}" alt="">`:""}<strong>${escapeHtml(slate.name)}</strong></button>`;}).join("");
  const selectedForTools=slates.find((slate)=>slate.id===selectedSlateId), selectedPlacement=selectedForTools&&(slatePlacements[selectedForTools.id]||parkedSlates[selectedForTools.id]);
  const quickTools=selectedForTools&&selectedPlacement&&(equippedSlateIds.has(selectedForTools.id)||parkedSlates[selectedForTools.id])?`<div class="slate-quick-tools" style="--tool-x:${slateToolsPosition?.x??8}px;--tool-y:${slateToolsPosition?.y??8}px"><strong>${selectedForTools.name}</strong><div><button type="button" data-slate-move="${selectedForTools.id}" title="Move">✥</button>${slateTransformRules(selectedForTools).rotate?`<button type="button" data-slate-rotate="${selectedForTools.id}" data-slate-rotate-dir="1" title="Rotate clockwise (D)">↻</button><button type="button" data-slate-rotate="${selectedForTools.id}" data-slate-rotate-dir="-1" title="Rotate counter-clockwise (A)">↶</button>`:""}${slateTransformRules(selectedForTools).flip?`<button type="button" data-slate-flip="${selectedForTools.id}" data-slate-flip-axis="x" title="Flip horizontal (S)">↔</button><button type="button" data-slate-flip="${selectedForTools.id}" data-slate-flip-axis="y" title="Flip vertical (W)">↕</button>`:""}<button type="button" data-edit-slate="${selectedForTools.id}" title="Edit affixes">✎</button><button type="button" class="danger" data-slate-remove="${selectedForTools.id}" title="Remove">×</button></div></div>`:"";
  $("#slate-board").innerHTML = `<div class="slate-board-toolbar slate-board-toolbar-actions">${qolHelpButton("slates")}<button type="button" class="button button-secondary" data-slate-inventory>Inventory</button></div><div class="slate-stage"><div class="divinity-board ${slateEditMode ? "editing" : ""}">${cells}${pieces}</div>${parkedPieces}</div>`;
  requestAnimationFrame(centerSlateGridInPanel);
  for(const piece of document.querySelectorAll("#slate-board .slate-piece.judgment-affected")){
    const tiles=[...piece.querySelectorAll(":scope > i")];
    const position=(tile)=>[Number(tile.style.getPropertyValue("--piece-column")),Number(tile.style.getPropertyValue("--piece-row"))];
    const occupied=new Set(tiles.map((tile)=>position(tile).join(",")));
    for(const tile of tiles){
      const [column,row]=position(tile);
      for(const [side,neighbor] of [["top",[column,row-1]],["right",[column+1,row]],["bottom",[column,row+1]],["left",[column-1,row]]]){
        const exterior=!occupied.has(neighbor.join(","));
        tile.style.setProperty(`--judgment-${side}-inset`,exterior?"6px":"0px");
        tile.style.setProperty(`--judgment-${side}-border`,exterior?"2px":"0px");
      }
    }
  }
  if(quickTools) $("#slate-board .slate-stage").insertAdjacentHTML("beforeend",quickTools);
  const slate = slates.find((item) => item.id === selectedSlateId) || slates[0];
  const equipped = equippedSlateIds.has(slate.id);
  const copyResolved = slate.copyStatus === "resolved-from-talents-affected-popup";
  const neighbors=slatePlacements[slate.id] ? adjacentSlateIds(slate,slatePlacements,slates) : [];
  $("#slate-inspector").innerHTML = `<h2>${slate.name}</h2><p class="muted">Lv.${slate.level} · ${titleCase(slate.rarity)} Divinity Slate${slate.direction ? ` · ${slate.direction}` : ""}</p><div class="slate-edit-actions"><button class="button button-secondary" type="button" data-slate-rotate="${slate.id}" ${!equipped||!slateTransformRules(slate).rotate ? "disabled" : ""}>Rotate 90°</button><button class="button button-secondary" type="button" data-slate-remove="${slate.id}">${equipped ? "Unequip" : "Place slate"}</button></div>${slate.copyRule ? `<div class="copy-warning ${copyResolved ? "resolved" : ""}"><strong>${neighbors.length} adjacent slate${neighbors.length===1?"":"s"}</strong><span>${slate.copyRule}</span></div>` : ""}${slate.authority ? `<div class="slate-authority">${slate.authority}</div>` : ""}${slate.amplifiedPercent ? `<div class="slate-amplified">Displayed effects already include +${slate.amplifiedPercent}%</div>` : ""}<ul class="modifier-list">${(slate.fixed || []).map((effect) => `<li>${escapeHtml(effect)}</li>`).join("")}${(slate.brands || []).map((effect) => `<li class="brand-effect">${escapeHtml(effect)}</li>`).join("")}${(slate.copiedTalents || []).map((effect) => `<li class="copied-effect">${escapeHtml(effect)}</li>`).join("")}</ul>`;
  const selectedBoosted=judgmentAffected.has(slate.id);
  // The link boost after Judgment's Effect Increase Multipliers, as the calc reads it (src/candidate-sources.js judgmentLinkPercent).
  const selectedLinkPercent=judgmentLinkPercentOf(slate.id);
  const selectedJudgment={linked:selectedBoosted,linkPercent:selectedLinkPercent,ownAuthority:Boolean(isActiveJudgment(slate)&&equippedSlateIds.has(slate.id)&&slatePlacements[slate.id])};const selectedAffix=(effect)=>scaleJudgmentAffix(effect,slate.amplifiedPercent||0,judgmentAffixTargetPercent(slate,effect,selectedJudgment));
  const inspectorBonus=$("#slate-inspector .slate-amplified");
  if(inspectorBonus)inspectorBonus.textContent=selectedBoosted?`Judgment · Affix effect +${selectedLinkPercent}%`:"Judgment bonus inactive at this position";
  else if(selectedBoosted)$("#slate-inspector .modifier-list").insertAdjacentHTML("beforebegin",`<div class="slate-amplified">Judgment · Affix effect +${selectedLinkPercent}%</div>`);
  $("#slate-inspector .modifier-list").innerHTML=`${(slate.fixed||[]).map((effect)=>`<li>${escapeHtml(selectedAffix(effect))}</li>`).join("")}${(slate.brands||[]).map((effect)=>`<li class="brand-effect">${escapeHtml(selectedAffix(effect))}</li>`).join("")}${(slate.copiedTalents||[]).map((effect)=>`<li class="copied-effect">${escapeHtml(effect)}</li>`).join("")}`;
  const unresolved = slates.filter((item) => equippedSlateIds.has(item.id) && item.copyStatus === "adjacency-needs-confirmation");
  $("#slate-audit-status").textContent = unresolved.length ? `${unresolved.length} copy links unresolved` : "All links resolved";
  $("#slate-audit-status").classList.toggle("warning", unresolved.length > 0);
  const impact = currentTalentSlateImpact();
  const changedSlateEffects = Object.entries(impact.slateDelta).filter(([,value]) => value !== 0);
  $("#slate-audit").innerHTML = `<div class="candidate-effect-summary"><article><span>Candidate damage multiplier</span><strong>×${impact.factors.damageMultiplier}</strong></article><article><span>Base Ignite factor</span><strong>×${impact.factors.baseIgniteFactor}</strong></article><article><span>Disintegrate scaling</span><strong>+${impact.disintegrate.additionalIgniteDamagePercent}%</strong></article></div>${changedSlateEffects.length ? `<div class="candidate-delta-list">${changedSlateEffects.map(([key,value]) => `<span>${effectLabel(key)} <strong>${formatEffect(key,value)}</strong></span>`).join("")}</div>` : `<p class="muted">Equipped slates match the captured baseline.</p>`}<div class="audit-grid">${slates.filter((item) => equippedSlateIds.has(item.id)).map((item) => `<div class="audit-row"><span><strong>${escapeHtml(item.name)}</strong><small>Lv.${item.level}${item.amplifiedPercent ? ` · displayed +${item.amplifiedPercent}% effect` : " · native values"}</small></span><span>${item.copyRule ? (item.copiedTalents ? `${item.copiedTalents.length} copied effects confirmed` : "Copy pending") : `${(item.fixed || []).length + (item.brands || []).length} captured effects`}</span></div>`).join("")}</div>`;
}

const skillRoleLabels = { main: "Main damage", empower: "Empower", elixir: "Elixir", curse: "Curse", aura: "Precise aura" };
const skillStatLabel = (key) => key.replace(/Percent$/, "").replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
const skillStatValue = (key, value) => {
  if (Array.isArray(value)) return `${value[0]}–${value[1]}`;
  if (key.endsWith("Percent")) return `${value}%`;
  if (key.endsWith("Seconds")) return `${value} s`;
  return value;
};

function renderSkills() {
  const planner = currentPlanner();
  const activation = planner.activation;
  const { profile, setups, energy, allocation, activeNames } = activation;
  const activeIndexes = setups.map((setup,index) => setup.enabled && !setup.traitGranted ? index : -1).filter((index) => index >= 0);
  if (!setups[selectedSkillIndex]?.enabled || setups[selectedSkillIndex]?.traitGranted) selectedSkillIndex = activeIndexes[0] ?? 0;
  const selected = setups[selectedSkillIndex]?.enabled && !setups[selectedSkillIndex]?.traitGranted ? setups[selectedSkillIndex] : null;
  const auraLedger = planner.aura;
  const observedReservation = selenaCompleteSkillLoadoutSs13.observedReservation;
  const displayedAuraLedger = auraLedger.planned || auraLedger;
  const maximumMana = observedReservation.mana.maximum;
  const maximumLife = observedReservation.life.maximum;
  const sealedMana = maximumMana * displayedAuraLedger.manaReservedPercent / 100;
  const sealedLife = maximumLife * displayedAuraLedger.lifeReservedPercent / 100;
  const manaDemandPercent = displayedAuraLedger.manaDemandPercent ?? displayedAuraLedger.manaReservedPercent;
  const lifeDemandPercent = displayedAuraLedger.lifeDemandPercent ?? displayedAuraLedger.lifeReservedPercent;
  const manaOverCapacity = manaDemandPercent >= 100;
  const lifeOverCapacity = lifeDemandPercent >= 100;
  const reservationInvalid = manaOverCapacity || lifeOverCapacity;
  const reservationSummary = $("#aura-reservation-summary");
  reservationSummary.hidden = activeSkillBoardTab !== "auras";
  reservationSummary.classList.toggle("over-capacity", reservationInvalid);
  reservationSummary.classList.toggle("mana-over-capacity", manaOverCapacity);
  reservationSummary.classList.toggle("life-over-capacity", lifeOverCapacity);
  $("#aura-sealed-mana").textContent = `${format(sealedMana)} / ${format(maximumMana)}`;
  $("#aura-mana-percent").textContent = `${format(displayedAuraLedger.manaReservedPercent)}% sealed${manaOverCapacity ? ` · ${format(manaDemandPercent)}% requested before cap` : ` · ${format(Math.max(0, maximumMana - sealedMana))} usable`}`;
  $("#aura-mana-meter").style.width = `${Math.min(100, displayedAuraLedger.manaReservedPercent)}%`;
  $("#aura-sealed-life").textContent = `${format(sealedLife)} / ${format(maximumLife)}`;
  $("#aura-life-percent").textContent = `${format(displayedAuraLedger.lifeReservedPercent)}% sealed${lifeOverCapacity ? ` · ${format(lifeDemandPercent)}% requested before cap` : ` · ${format(Math.max(0, maximumLife - sealedLife))} usable`}`;
  $("#aura-life-meter").style.width = `${Math.min(100, displayedAuraLedger.lifeReservedPercent)}%`;
  const reservationStatus = $("#aura-reservation-status");
  reservationStatus.hidden = !reservationInvalid;
  reservationStatus.innerHTML = reservationInvalid
    ? `<strong>Aura reservation over capacity</strong><span>${[manaOverCapacity ? "Mana reservation reaches 100%" : "", lifeOverCapacity ? "Life reservation reaches 100%" : ""].filter(Boolean).join(" · ")}. Every Aura is still counted in the calculation.</span>`
    : "";
  $("#energy-total").textContent = `${allocation.knownAllocated}/${energy.available}`;
  $("#energy-meter").style.setProperty("--energy-ratio", `${Math.min(100, allocation.knownAllocated / energy.available * 100)}%`);
  $("#energy-source-list").innerHTML = `${energy.sources.map((source) => `<div class="energy-source ${source.enabled ? "" : "disabled"}"><span>${source.name}</span><strong>${source.enabled ? "+" : "−"}${source.value}</strong></div>`).join("")}<div class="energy-source"><span>Other captured character sources</span><strong>+${profile.nonEquipmentEnergy}</strong></div>`;
  $("#energy-allocation").innerHTML = allocation.allocations.map((entry) => `<div class="energy-allocation-row"><span>${entry.name}<small>${setups[entry.index].enabledSupportSlots} support slots</small></span><strong class="energy-${entry.status}">${entry.cost ?? "?"} · ${entry.status === "insufficient-energy" ? "insufficient Energy · counted" : entry.status === "uncaptured" ? "cost unknown · counted" : entry.status}</strong></div>`).join("");
  const activationChanged = setups.some((setup) => setup.supports.some((support) => !support.enabled)) || allocation.knownAllocated !== profile.observedUsed || allocation.allocations.some((entry) => entry.status !== "active");
  $("#mana-reserved").textContent = `${format(activationChanged ? auraLedger.manaReservedPercent : 100 - observedReservation.mana.unsealedPercent)}%`;
  $("#mana-remaining").textContent = activationChanged ? `${format(auraLedger.manaRemainingPercent)}% modeled unsealed` : `${observedReservation.mana.unsealed}/${observedReservation.mana.maximum} unsealed · ${observedReservation.mana.unsealedPercent}%`;
  $("#life-reserved").textContent = `${format(activationChanged ? auraLedger.lifeReservedPercent : 100 - observedReservation.life.unsealedPercent)}%`;
  $("#life-remaining").textContent = activationChanged ? `${format(auraLedger.lifeRemainingPercent)}% modeled unsealed` : `${observedReservation.life.unsealed}/${observedReservation.life.maximum} unsealed · ${observedReservation.life.unsealedPercent}%`;
  $("#reservation-model-status").textContent = `Model: ${format(auraLedger.manaReservedPercent)}% Mana · ${format(auraLedger.lifeReservedPercent)}% Life`;
  $("#aura-ledger").innerHTML = auraLedger.entries.map((entry) => `<article class="aura-ledger-card"><div><small>${entry.reservation.resource} reservation</small><h3>${entry.name}</h3></div><strong>${format(entry.reservation.reservedPercent)}%</strong>${entry.reservation.uncappedReservedPercent > 99.99 ? `<small>${format(entry.reservation.uncappedReservedPercent)}% requested before cap</small>` : ""}<dl><div><dt>Base seal</dt><dd>${entry.reservation.baseSealedPercent}%</dd></div><div><dt>Installed supports</dt><dd>${entry.reservation.installedSupportCount} × ${entry.reservation.fixedSupportMultiplierPercent}%</dd></div><div><dt>Normal compensation</dt><dd>+${entry.reservation.totalCompensationPercent}%</dd></div>${entry.reservation.additionalCompensationPercents.length ? `<div><dt>Additional penalties</dt><dd>${entry.reservation.additionalCompensationPercents.map((value) => `${value}%`).join(" × ")}</dd></div>` : ""}<div><dt>Aura Effect</dt><dd>+${entry.auraEffectPercent}%</dd></div></dl></article>`).join("");
  $("#skill-setup-count").textContent = activeIndexes.length;
  const groups = [
    ["Damage & empower", ["main", "empower"]],
    ["Utility & curses", ["elixir", "curse"]],
    ["Precise auras", ["aura"]]
  ];
  const boardSetups = skillBoardRows(setups,plannerState.skills.boardSlots,activeSkillBoardTab,{traitGrants:true});
  const supportSlots = (setup) => supportSlotsForSetup(setup,plannerState.skills.supportOrder[setupStateKey(setup)],{traitGrants:true});
  const slotEnergy = (setup) => energyCostForSupportPositions(setup.role, setup.occupiedSupportSlots || supportSlots(setup).map(Boolean), profile);
  const dynamicEnergyUsed = setups.filter((setup)=>setup.enabled).reduce((sum,setup)=>sum+slotEnergy(setup),0);
  $("#energy-total").textContent = `${dynamicEnergyUsed}/${energy.available}`; $("#energy-meter").style.setProperty("--energy-ratio", `${Math.min(100,dynamicEnergyUsed/energy.available*100)}%`);
  $("#energy-meter").closest(".energy-panel").classList.toggle("overused",dynamicEnergyUsed>energy.available);
  const boardRows = Array.from({length:activeSkillBoardTab === "auras" ? 4 : 5}, (_,row) => boardSetups[row] || null);
  $("#skill-groups").innerHTML = boardRows.map((skill,row) => {
    const supports = skill ? supportSlots(skill) : [];
    return `<article class="compendium-skill-row${skill?.traitGranted?" trait-granted-row":""}${skill?.slotInactive?" curse-limit-row":""}${activeSkillBoardTab!=="auras"&&curseSkillOverLimit(skill?.name)?" curse-limit-row":""}" data-skill-board-row="${row}"><button type="button" class="skill-primary-socket ${skill ? "" : "empty-skill-slot"}${skill?.traitGranted?" trait-granted-socket":""}" ${skill?.traitGranted?"":'data-open-catalog="skill"'} data-selector-row="${row}" ${skill?`data-skill-tooltip="${escapeHtml(skill.name)}"`:""} ${skill?"":`title="Select skill"`} aria-label="${skill?.traitGranted ? `${escapeHtml(skill.name)}, granted by ${escapeHtml(skill.traitGranted.trait)}` : skill ? `Replace ${escapeHtml(skill.name)}` : `Select ${activeSkillBoardTab === "auras" ? "Aura" : "Active"} ${row+1}`}">${skill ? artwork(tliArt.skills[skill.name],skill.name,"skill-glyph") : "−"}</button><div class="skill-row-name" ${skill?`data-skill-tooltip="${escapeHtml(skill.name)}"`:""}>${activeSkillBoardTab!=="auras"&&curseSkillOverLimit(skill?.name)?curseOffBadge(curseLimitState()?.warning):""}${skill?.slotInactive?`<em class="curse-off-badge" title="${escapeHtml(skill.slotInactive)}" aria-label="${escapeHtml(skill.slotInactive)}">INACTIVE</em>`:""}<strong>${skill ? escapeHtml(skill.name) : `${activeSkillBoardTab === "auras" ? "Aura" : "Active"} ${row+1}`}</strong>${skill ? `<small>Lv.${skill.effectiveLevel}</small>` : ""}</div><div class="skill-support-sockets">${Array.from({length:5},(_,slot) => { const support=supports[slot]; return `<button type="button" class="skill-support-socket ${support?"":"empty-support-socket"}${support?.traitGranted?" trait-granted-socket":""}" ${support?.traitGranted?"":'data-open-catalog="support"'} data-selector-row="${row}" data-selector-support-slot="${slot}" ${support?`data-support-tooltip="${escapeHtml(support.name)}" data-parent-skill="${escapeHtml(skill?.name||"")}"`:""} ${skill ? "" : "disabled"} title="${support?.traitGranted?`Granted by ${escapeHtml(support.traitGranted.trait)}`:support?"Drag to move · right-click while dragging to duplicate":"Add support"}" aria-label="${support ? `Replace ${escapeHtml(support.name)}` : `Add support ${slot+1} to ${escapeHtml(skill?.name||"empty skill")}`}">${support ? artwork(tliArt.supports[support.name],support.name,"lane-support-art") : skill ? "+" : ""}</button>`; }).join("")}</div><strong class="skill-row-energy">${skill ? slotEnergy(skill) : "−"}</strong></article>`;
  }).join("");
  document.querySelectorAll("#skill-groups .skill-row-name small").forEach((label,index) => {
    const skill = boardRows.filter(Boolean)[index];
    if (skill) label.innerHTML = skillLevelLabel(skill)+(skill.traitGranted?` · ${escapeHtml(skill.traitGranted.replaces?`replaces ${skill.traitGranted.replaces}`:"trait skill")}`:"");
  });

  if (!selected) {
    $("#skill-inspector").innerHTML = `<div class="comparison-empty"><strong>Select an active skill</strong><span>Its level and supports will appear here.</span></div>`;
    $("#support-heading").textContent = "Selected skill supports"; $("#support-count").textContent = "0/0";
    $("#support-grid").innerHTML = `<div class="comparison-empty"><strong>No support slots available</strong><span>Add an active skill first.</span></div>`;
    $("#skill-comparison").innerHTML = ""; return;
  }
  const damageProgression = leveledSkillDamage(selected);
  const values = [...Object.entries(selected.observed || selected.databaseLevel20 || {}), ...(damageProgression.additionalPercent !== null ? [["additionalDamageFromLevelsPercent", damageProgression.additionalPercent]] : []), ...damageProgression.ranges.map(({key,leveled})=>[`levelScaled${key[0].toUpperCase()}${key.slice(1)}`,leveled])];
  $("#skill-inspector").innerHTML = `<div class="skill-title">${artwork(tliArt.skills[selected.name], selected.name, "large-skill-glyph")}<div><small>${skillRoleLabels[selected.role]}</small><h2>${selected.name}</h2></div></div><button class="button button-secondary remove-skill-button" type="button" data-remove-skill="${escapeHtml(selected.name)}">Remove skill</button><div class="skill-edit-controls"><label><span>Base level</span><input type="number" min="1" max="40" data-skill-level="baseLevel" data-skill-name="${selected.name}" value="${selected.baseLevel}"></label><label><span>Added levels</span><input type="number" min="0" max="30" data-skill-level="addedLevels" data-skill-name="${selected.name}" value="${selected.addedLevels}"></label><div><button class="button button-secondary" type="button" data-skill-priority="up" data-skill-name="${selected.name}" ${selectedSkillIndex === 0 ? "disabled" : ""}>Move earlier</button><button class="button button-secondary" type="button" data-skill-priority="down" data-skill-name="${selected.name}" ${selectedSkillIndex === setups.length - 1 ? "disabled" : ""}>Move later</button></div></div><div class="effective-level"><span>Effective level</span><strong>${selected.effectiveLevel}</strong><small>Base ${selected.baseLevel} + ${selected.addedLevels}</small></div><dl class="effect-list skill-values">${values.map(([key,value]) => `<div><dt>${skillStatLabel(key)}</dt><dd>${skillStatValue(key,value)}</dd></div>`).join("")}</dl><p class="skill-source-note">Support affix values follow the TLIDB level tables where available. Damage estimates remain anchored to the captured support baseline; Scorching Beam level damage above 20 is modeled separately.</p>`;
  const levelContributions = selected.levelBonusSources || [];
  const levelIsManual = plannerState.skills.skillLevels[setupStateKey(selected)]?.manualAddedLevels;
  const levelRows = levelContributions.length
    ? levelContributions.map(({name,text,levels})=>`<div><dt>${escapeHtml(name)}<small>${escapeHtml(text || "")}</small></dt><dd>${levels > 0 ? "+" : ""}${levels}</dd></div>`).join("")
    : `<div><dt>No equipped level bonuses</dt><dd>+0</dd></div>`;
  $("#skill-inspector .effective-level").insertAdjacentHTML("afterend",`<div class="skill-level-sources"><strong>Added level sources</strong>${levelIsManual ? `<p>Manually set to +${selected.addedLevels}; equipped sources are listed below.</p>` : ""}<dl>${levelRows}</dl></div>`);
  $("#support-heading").textContent = `${selected.name} supports`;
  $("#support-count").textContent = `${selected.supports.filter((support) => support.enabled).length}/${selected.supports.length} enabled`;
  $("#support-grid").innerHTML = `${selected.supports.length ? selected.supports.map((support,index) => {
    const calibrated = selected.name === "Scorching Beam" && ["Additional Ignite", "Control Spell", "Guard", "Refracted Prism"].includes(support.name);
    const supportCoverage = classifySkillCoverage(currentPlanner(), { skillName: selected.name, supportName: support.name, enabled: selected.enabled !== false && support.enabled !== false }), supportCoverageText = `${supportCoverage.status}${supportCoverage.reason ? `: ${supportCoverage.reason}` : ""}`;
    const key = supportStateKey(setupStateKey(selected), support.name);
    const catalog=tlidbSupportCatalogSs13.find((entry)=>entry.name===support.name);
    const display=catalog?supportDisplaySs13(catalog,support.effectiveLevel||support.level):null;
    return `<article class="support-card ${support.enabled ? "" : "disabled"}${support.incompatible ? " incompatible" : ""}"><div><span>${index + 1}</span><label>Level <input type="number" min="1" max="40" data-support-level="${escapeHtml(key)}" value="${support.level}">${support.addedLevels ? `<small>${skillLevelLabel(support)}</small>` : ""}</label></div><div class="support-title">${artwork(tliArt.supports[support.name], support.name, "support-art")}<h3>${escapeHtml(support.name)}</h3></div>${support.manaCostMultiplierPercent !== 100 ? `<p class="support-cost">${support.manaCostMultiplierPercent}% mana multiplier</p>` : ""}<ul>${(display?.effects||support.displayEffects||support.effects).map((effect) => `<li>${escapeHtml(effect)}</li>`).join("")}</ul><label class="support-toggle"><span title="${escapeHtml(supportCoverageText)}">${support.custom && !support.incompatible ? "Custom effect: audit only" : escapeHtml(supportCoverageText)}${calibrated ? "; capture comparison below" : ""}</span><input type="checkbox" data-support-enabled="${escapeHtml(support.name)}" data-support-setup="${selected.name}" ${(support.incompatible ? support.savedEnabled !== false : support.enabled) ? "checked" : ""}${support.incompatible ? ` disabled title="${escapeHtml(supportCoverageText)}"` : ""}></label>${support.custom ? `<button class="remove-custom-support" type="button" data-remove-support="${escapeHtml(support.name)}" data-support-setup="${selected.name}">Remove custom support</button>` : ""}</article>`;
  }).join("") : `<p class="muted">No linked supports captured.</p>`}<article class="support-card add-support-card"><h3>Add custom support</h3><label><span>Name</span><input type="text" data-custom-support-name placeholder="Support name"></label><label><span>Level</span><input type="number" min="1" max="40" value="20" data-custom-support-level></label><label><span>Mana multiplier %</span><input type="number" min="1" value="100" data-custom-support-mana></label><label><span>Effects</span><textarea rows="4" data-custom-support-effects placeholder="One effect per line"></textarea></label><button class="button" type="button" data-add-support="${selected.name}" ${selected.enabledSupportSlots >= 5 ? "disabled" : ""}>Add support</button><small>Custom text is preserved in the share code; Energy is calculated immediately.</small></article>`;
  const prediction = currentPlanner().townSupportPrediction;
  const disabled = selected.supports.filter((support) => !support.enabled && !support.custom);
  const baselineLevels = { "Refracted Prism": 30, Guard: 25, "Control Spell": 30, "Additional Ignite": 30 };
  const usesCapturedLevels = selected.supports.every((support) => baselineLevels[support.name] === undefined || support.level === baselineLevels[support.name]);
  const observation = selected.name === "Scorching Beam" && usesCapturedLevels ? findSupportValidation(disabled.map((support) => support.name)) : null;
  $("#skill-comparison").innerHTML = selected.name === "Scorching Beam" ? `<p class="comparison-warning">Town support-only estimate: holds gear, talents, auras, and skill level at the captured baseline. Combat estimates are shown in Character. Recorded values use the full-precision, zone-reset single-support series.</p><div class="comparison-grid"><div><span>Predicted Spell DPS</span><strong>${format(prediction.spellDps)}</strong>${observation ? `<small>Recorded ${format(observation.spellDps)} · error ${format((prediction.spellDps / observation.spellDps - 1) * 100)}%</small>` : ""}</div><div><span>Predicted Ignite DPS</span><strong>${format(prediction.igniteDps)}</strong>${observation ? `<small>Recorded ${format(observation.igniteDps)} · error ${format((prediction.igniteDps / observation.igniteDps - 1) * 100)}%</small>` : ""}</div></div>` : "";
}

function selectorEntries() {
  // A Minion's own skills (Blazing Dance, Overpower, Firebird, …) belong to its summon, not the player: never offered on any
  // tab (src/minion-skill-owners.js; game stone tag "Minion Skill").
  if (selectorKind === "skill") return boardSkillChoices(tlidbSkillCatalogSs13, { tab: activeSkillBoardTab, heroId: plannerState.hero.selectedHeroId });
  if (selectorKind === "hero-support") return heroTraitSupportOptions();
  const setup = selectorTargetSetup();
  if (!setup) return tlidbSupportCatalogSs13;
  const skillTags = tlidbSkillCatalogSs13.find((entry) => entry.name === setup.name)?.tags || [];
  return tlidbSupportCatalogSs13.filter((entry) => {
    if (selectorKind === "support" && !supportFitsSlot(entry,selectorTargetSupportSlot)) return false;
    if (entry.exclusiveFor) return entry.exclusiveFor === setup.name;
    if (setup.role === "aura") {
      // The game's tag filter decides when the aura and the support both have a stone record (src/support-compatibility.js).
      if (gameRuleDecides(entry, tlidbSkillCatalogSs13.find((skill)=>skill.name===setup.name))) return supportCanSupportSkill(entry,tlidbSkillCatalogSs13.find((skill)=>skill.name===setup.name),setup.supports);
      if(entry.name === "Blind" && skillTags.includes("Spirit Magus")) return true;
      if(skillTags.includes("Focus") && !entry.passiveOnly && supportCanSupportSkill(entry,tlidbSkillCatalogSs13.find((skill)=>skill.name===setup.name),setup.supports)) return true;
      const description=(entry.effects||[]).join(" ").toLowerCase();
      const supportsPassive=/supports passive skill/.test(description);
      const supportsAura=/supports aura skills?/.test(description);
      const supportsArea=/supports area skills?\./.test(description)&&skillTags.includes("Area");
      if(supportsPassive||supportsAura||supportsArea)return true;
      return entry.passiveOnly&&entry.tags.some((tag)=>tag!=="Support"&&skillTags.includes(tag));
    }
    return !entry.passiveOnly && supportCanSupportSkill(entry,tlidbSkillCatalogSs13.find((skill)=>skill.name===setup.name),setup.supports);
  });
}

function renderHeroSelector(){
  const query=heroSelectorQuery.trim().toLowerCase();
  const heroes=heroCatalogSs13.filter((hero)=>`${hero.name} ${hero.trait}`.toLowerCase().includes(query));
  $("#hero-selector-grid").innerHTML=heroes.length ? heroes.map((hero)=>`<button type="button" class="hero-selector-card ${plannerState.hero.selectedHeroId===hero.id?"selected":""}" data-select-hero="${hero.id}">${hero.image?`<img src="${hero.image}" alt="">`:`<span class="hero-card-fallback" aria-hidden="true">${escapeHtml(hero.name.slice(0,2).toUpperCase())}</span>`}<strong>${escapeHtml(hero.name)}</strong><small>${escapeHtml(hero.trait)}</small></button>`).join("") : '<p class="hero-selector-empty">No heroes match that search.</p>';
}
function selectorBoardSetups(traitGrants=false) { return skillBoardRows(currentEditedSetups(),plannerState.skills.boardSlots,activeSkillBoardTab,{traitGrants}); }
function auraFamilyName(name) { return String(name || "").replace(/^Precise:\s*/i, "").trim().toLowerCase(); }
function selectorTargetSetup() { const board=selectorBoardSetups(selectorKind==="support"); return (selectorTargetSetupName&&board.find((setup)=>setupStateKey(setup)===selectorTargetSetupName))||board[selectorTargetRow]||null; }
function selectorTargetSupport() {
  if(selectorKind==="hero-support"){
    const name=plannerState.hero.heroTraitSupports?.[activeHeroTraitSupportId]||"";
    const entry=tlidbSupportCatalogSs13.find((support)=>support.name===name);
    return entry?{...entry,level:plannerState.hero.heroTraitSupportLevels?.[activeHeroTraitSupportId]||entry.level||20,specialConfig:plannerState.hero.heroTraitSupportConfigs?.[activeHeroTraitSupportId]}:null;
  }
  const setup=selectorTargetSetup();
  if(!setup||selectorTargetSupportSlot===null)return null;
  const enabled=userInstalledSupports(setup);
  const byName=new Map(enabled.map((support)=>[support.name,support]));
  const slots=Array.from({length:5},()=>null);
  const setupKey=setupStateKey(setup), hasExplicitOrder=Object.hasOwn(plannerState.skills.supportOrder,setupKey);
  (plannerState.skills.supportOrder[setupKey]||[]).slice(0,5).forEach((name,index)=>{slots[index]=byName.get(name)||null;byName.delete(name);});
  if(!hasExplicitOrder) for(const support of byName.values()){const index=slots.indexOf(null);if(index>=0)slots[index]=support;}
  return slots[selectorTargetSupportSlot];
}
function renderSkillSelector() {
  if (selectorKind === "follower-skill") { renderFollowerSkillSelector(); return; }
  const entries = selectorEntries();
  const query = selectorQuery.toLowerCase();
  const selectedSetup = selectorTargetSetup();
  const matches = entries.map((entry,index) => ({entry,index})).filter(({entry}) => !query || [entry.name,...(entry.tags || []),...(entry.effects || [])].join(" ").toLowerCase().includes(query));
  const supportSelector=selectorKind==="support"||selectorKind==="hero-support";
  const selectorLabel = selectorKind === "skill"
    ? (activeSkillBoardTab === "auras" ? "Passive Skill / Aura" : "Active Skill")
    : selectorKind==="hero-support" ? `Support for ${heroTraitSupportConfig[activeHeroTraitSupportId]?.skill||"trait skill"}` : `Support for ${selectedSetup?.name || "active skill"}`;
  $("#skill-selector-title").textContent = `Select ${selectorLabel} · ${entries.length} available`;
  $("#skill-selector-search").placeholder = selectorKind === "skill" ? "Search skills…" : "Search supports…";
  $("#skill-selector-results").innerHTML = matches.map(({entry,index}) => `<button type="button" class="selector-result ${index === selectorChoiceIndex ? "selected" : ""}" data-selector-choice="${index}">${artwork(entry.icon,entry.name,"support-art")}<span><strong>${escapeHtml(entry.name)}</strong><small>${(entry.tags || ["Support"]).map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</small></span></button>`).join("") || `<p class="muted">No matching entries.</p>`;
  const entry = entries[selectorChoiceIndex];
  if (!entry) { $("#skill-selector-detail").innerHTML = `<p>Select a ${selectorKind} to configure</p>`; $("[data-confirm-skill-selector]").disabled = true; return; }
  const currentSupportName = supportSelector ? selectorTargetSupport()?.name : null;
  const installed = selectorKind === "support"
    ? selectedSetup?.supports.some((support) => support.enabled && support.name === entry.name && support.name !== currentSupportName)
    : selectorKind === "hero-support" ? false : (activeSkillBoardTab === "auras" || isSpiritMagusSkill(entry)) && currentEditedSetups().some((setup) => (setup.enabled || setup.slotInactive) && setup.role === "aura" && setupStateKey(setup) !== setupStateKey(selectedSetup) && auraFamilyName(setup.name) === auraFamilyName(entry.name));
  const activeSupportCount = selectedSetup?.supports.filter((support)=>support.enabled).length || 0;
  const replacingSupport = selectorKind === "support" && Boolean((plannerState.skills.supportOrder[setupStateKey(selectedSetup)] || [])[selectorTargetSupportSlot]) || selectorKind === "support" && selectorTargetSupportSlot < activeSupportCount;
  const full = selectorKind === "support" && (!selectedSetup || (activeSupportCount >= 5 && !replacingSupport));
  const tags = entry.tags || ["Spell", "Support"];
  const specialTiers = supportSelector ? configurableSupportTierData(entry.name) : null;
  const progressionTiers = supportSelector ? progressionSupportTierData(entry.name) : null;
  const starSupport = Boolean(specialSupportTierData(entry.name));
  if (specialTiers || progressionTiers) selectorSpecialConfig = { ...defaultConfigurableSupportConfig(entry.name, selectorTargetSupport()?.effects || entry.effects), ...(normalizeProgressionSupportConfig(entry.name, selectorSpecialConfig) || {}) };
  const selectedTier = specialTiers?.find((tier) => tier.tier === selectorSpecialConfig?.tier) || specialTiers?.[0];
  const progressionTier = progressionTiers?.find((tier) => tier.tier === selectorSpecialConfig?.tier) || progressionTiers?.[0];
  const skillDisplay = selectorKind === "skill" ? skillDisplaySs13(entry, selectorLevel) : null;
  const supportDisplay = supportSelector ? supportDisplaySs13(entry, selectorLevel) : null;
  const facts = skillDisplay?.facts || supportDisplay?.facts || [];
  const tierControlHtml=(tiers,tierValue,rollValue,prefix="",effectOverride="")=>{ const tier=tiers.find((item)=>item.tier===tierValue)||tiers[0], sign=!prefix&&rollValue>=0?"+":"", unit=prefix?" s":"%"; return `<div class="special-affix-block"><div class="special-support-heading"><strong>${prefix?"Activation affix":"Main affix"}</strong><span>Tier ${tier.tier}</span></div><div class="special-tier-buttons ${tiers.length===4?"four-tiers":""}">${tiers.map((item)=>`<button type="button" class="${item.tier===tier.tier?"active":""}" data-${prefix||"special"}-tier="${item.tier}">T${item.tier}<small>${item.min===item.max?item.min:`${item.min}–${item.max}`}${unit}</small></button>`).join("")}</div><label class="special-roll-label"><span>${escapeHtml(effectOverride||tier.effect)}</span><strong>${sign}${rollValue}${unit}</strong></label><div class="special-roll-control"><input type="range" min="${tier.min}" max="${tier.max}" step="${tier.step}" value="${rollValue}" data-${prefix||"special"}-roll><input type="number" min="${tier.min}" max="${tier.max}" step="${tier.step}" value="${rollValue}" data-${prefix||"special"}-roll-number><output>${sign}${rollValue}${unit}</output></div></div>`; };
  const affixLines = supportSelector ? activationMediumAffixLines(entry.name) : null;
  const affixTierLabel = (option) => option.ranges.length ? option.ranges.map(({min,max})=>min===max?min:`${min}–${max}`).join(" · ") : "Fixed";
  const mediumControlsHtml = affixLines && progressionTier ? (() => {
    const lineConfigs = activationMediumLineConfigs(entry.name, selectorSpecialConfig);
    const selectedText = new Map((activationMediumSelectedLines(entry.name, selectorSpecialConfig) || []).map((line) => [line.index, line.text]));
    return `<section class="special-support-config activation-affix-config"><div class="special-affix-block"><div class="special-support-heading"><strong>Set all affixes</strong><span>Tier ${progressionTier.tier}</span></div><div class="special-tier-buttons ${progressionTiers.length===4?"four-tiers":""}">${progressionTiers.map((tier)=>`<button type="button" class="${tier.tier===progressionTier.tier?"active":""}" data-progression-tier="${tier.tier}">T${tier.tier}</button>`).join("")}</div></div>${(() => { let shown = 0; return affixLines.map((line, index) => {
      const members = line.choiceGroup ? affixLines.map((other, otherIndex) => other.choiceGroup === line.choiceGroup ? otherIndex : -1).filter((otherIndex) => otherIndex >= 0) : null;
      if (members && index !== (members.find((member) => lineConfigs[member].tier != null) ?? members[0])) return "";
      const choiceLabel = (member) => /cooldown/.test(affixLines[member].signature) ? "Cooldown Recovery Speed" : "Additional Duration";
      const choiceSelect = members ? `<label class="activation-roll-kind activation-affix-choice"><span>Affix stat</span><select data-affix-choice="${index}">${members.map((member) => `<option value="${member}" ${member === index ? "selected" : ""}>${choiceLabel(member)}</option>`).join("")}</select></label>` : "";
      const selected = lineConfigs[index], option = line.options.find((item) => item.tier === selected.tier);
      const buttons = [...line.options.map((item)=>`<button type="button" class="${item.tier===selected.tier?"active":""}" data-affix-line="${index}" data-affix-tier="${item.tier}">T${item.tier}<small>${escapeHtml(String(affixTierLabel(item)))}</small></button>`), ...(line.optional&&!members?[`<button type="button" class="${selected.tier==null?"active":""}" data-affix-line="${index}" data-affix-tier="off">Off<small>Not rolled</small></button>`]:[])];
      return `<div class="special-affix-block"><div class="special-support-heading"><strong>Affix ${++shown}</strong><span>${selected.tier==null?"Off":`Tier ${selected.tier}`}</span></div><p>${escapeHtml(option?selectedText.get(index)||"":"Not on this item")}</p>${choiceSelect}<div class="special-tier-buttons ${buttons.length===4?"four-tiers":""}">${buttons.join("")}</div>${option?option.ranges.map((range,rollIndex)=>{const roll=selected.rolls[rollIndex]??range.max;return `<label class="special-roll-label"><span>${option.ranges.length>1?`Value ${rollIndex+1} · `:""}${range.min}–${range.max}</span><strong>${roll}</strong></label><div class="special-roll-control"><input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${roll}" data-affix-roll="${index}" data-affix-roll-index="${rollIndex}"><input type="number" min="${range.min}" max="${range.max}" step="${range.step}" value="${roll}" data-affix-roll-number="${index}" data-affix-roll-index="${rollIndex}"><output>${roll}</output></div>`;}).join(""):""}</div>`;
    }).join(""); })()}</section>`;
  })() : "";
  const progressionControlsHtml=mediumControlsHtml||(progressionTier?`<section class="special-support-config"><div class="special-affix-block"><div class="special-support-heading"><strong>${progressionSupportHasStars(entry.name)?"Main affix":"Affixes"}</strong><span>Tier ${progressionTier.tier}</span></div><div class="special-tier-buttons ${progressionTiers.length===4?"four-tiers":""}">${progressionTiers.map((tier)=>`<button type="button" class="${tier.tier===progressionTier.tier?"active":""}" data-progression-tier="${tier.tier}">T${tier.tier}<small>${tier.ranges.length?tier.ranges.map(({min,max})=>min===max?min:`${min}–${max}`).join(" · "):"Fixed"}</small></button>`).join("")}</div><p>${progressionSupportText(entry.name,selectorSpecialConfig).split(" | ").map(escapeHtml).join("<br>")}</p>${progressionTier.ranges.map((range,index)=>{const roll=selectorSpecialConfig.rolls?.[index]??range.max;return `<label class="special-roll-label"><span>${escapeHtml(progressionRangeLabels(entry.name,progressionTier.tier)[index]||`Affix value ${index+1}`)}</span><strong>${roll}</strong></label><div class="special-roll-control"><input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${roll}" data-progression-roll="${index}"><input type="number" min="${range.min}" max="${range.max}" step="${range.step}" value="${roll}" data-progression-roll-number="${index}"><output>${roll}</output></div>`;}).join("")}</div>${progressionSupportHasStars(entry.name)?`<div class="special-stars"><span><strong>Star level</strong><small>+${specialSupportStarBonus(selectorSpecialConfig.stars)}% additional damage</small></span><div>${[1,2,3,4,5].map((stars)=>`<button type="button" class="${stars===selectorSpecialConfig.stars?"active":""}" data-special-stars="${stars}" aria-label="${stars} stars">${"★".repeat(stars)}</button>`).join("")}</div></div>`:""}</section>`:"");
  const secondaryTiers=activationMediumSecondaryTierData(entry.name);
  const skillLevelEditor=`<div class="selector-level"><strong>Skill Level:</strong><div><button type="button" data-selector-level-step="-1">−</button><input type="number" min="1" max="40" value="${selectorLevel}" data-selector-level><button type="button" data-selector-level-step="1">+</button></div></div>`;
  const levelEditor = `${skillLevelEditor}${progressionControlsHtml}${specialTiers ? `<section class="special-support-config">${secondaryTiers?tierControlHtml(secondaryTiers,selectorSpecialConfig.secondaryTier,selectorSpecialConfig.secondaryRoll,"activation-trigger"):""}${!starSupport?`<label class="activation-roll-kind"><span>Main affix stat</span><select data-activation-roll-kind><option value="duration" ${selectorSpecialConfig.rollKind==="duration"?"selected":""}>Additional Duration</option><option value="cooldown" ${selectorSpecialConfig.rollKind==="cooldown"?"selected":""}>Cooldown Recovery Speed</option></select></label>`:""}${tierControlHtml(specialTiers,selectorSpecialConfig.tier,selectorSpecialConfig.roll,"",!starSupport?`additional ${selectorSpecialConfig.rollKind==="cooldown"?"Cooldown Recovery Speed":"Duration"} for the supported skill`:"")}${starSupport ? `<div class="special-stars"><span><strong>Star level</strong><small>+${specialSupportStarBonus(selectorSpecialConfig.stars)}% additional damage</small></span><div>${[1,2,3,4,5].map((stars) => `<button type="button" class="${stars === selectorSpecialConfig.stars ? "active" : ""}" data-special-stars="${stars}" aria-label="${stars} stars">${"★".repeat(stars)}</button>`).join("")}</div></div>` : ""}</section>` : ""}`;
  const specialEffects = progressionTier ? [...(activationMediumSelectedLines(entry.name,selectorSpecialConfig)?.map((line)=>`T${line.tier} · ${line.text}`)||progressionSupportText(entry.name,selectorSpecialConfig).split(" | ").map((line,index)=>index?line:`Main affix · T${progressionTier.tier} · ${line}`)),...(progressionSupportHasStars(entry.name)?[`Star level · +${specialSupportStarBonus(selectorSpecialConfig.stars)}% additional damage`]:[])] : specialTiers ? [...(entry.name==="Activation Medium: Spell Burst" ? supportDisplay?.effects || entry.effects : []), ...(secondaryTiers ? [`Activation affix · T${selectorSpecialConfig.secondaryTier} · Prepares the supported skill every ${selectorSpecialConfig.secondaryRoll} s`] : []), ...(starSupport ? [`Star bonus · +${specialSupportStarBonus(selectorSpecialConfig.stars)}% additional damage`] : []), `Main affix · T${selectedTier.tier} · ${selectorSpecialConfig.roll >= 0 ? "+" : ""}${selectorSpecialConfig.roll}% ${!starSupport?`additional ${selectorSpecialConfig.rollKind==="cooldown"?"Cooldown Recovery Speed":"Duration"} for the supported skill`:selectedTier.effect}`] : skillDisplay?.effects || supportDisplay?.effects || entry.effects;
  const effectReference=skillDisplay?.effectEstimate?`<p class="skill-effect-reference">${escapeHtml(skillDisplay.effectEstimate)}</p>`:(skillDisplay&&!skillDisplay.hasLevelProgression||supportDisplay&&!supportDisplay.hasLevelProgression&&!specialTiers&&!progressionTier)&&selectorLevel!==20?"":"";
  const previewEffects=`${effectReference}<div class="selector-effect-list"><h4>${escapeHtml(entry.name)}:</h4>${(specialEffects?.length?specialEffects:["See TLIDB for complete level scaling."]).map((effect)=>`<p>${supportSelector?highlightedSupportEffect(effect):entry.role==="aura"?highlightedAuraEffect(effect):highlightedSkillEffect(effect,entry.name)}</p>`).join("")}${selectorKind==="skill"?minionInherentSkillsHtml(entry.name):""}</div>`;
  $("#skill-selector-detail").innerHTML = `${levelEditor}<article class="selector-preview ${supportSelector ? "support" : entry.role==="aura" ? "aura" : ""}"><div class="selector-preview-head">${artwork(entry.icon,entry.name,"support-art")}<h3>${escapeHtml(entry.name)}</h3><small>Lv. ${selectorLevel}</small><div class="selector-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div></div><div class="selector-facts"><div class="selector-stat-rows">${facts.map(([label,value]) => `<div class="${label==="Effectiveness of Added Damage"?"skill-added-damage-stat":""}"><span>${escapeHtml(String(label))}:</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")}</div>${previewEffects}<a href="${entry.source}" target="_blank" rel="noreferrer">Open TLIDB source</a>${full ? `<p class="comparison-warning">All five support slots are occupied. Remove a support before confirming another.</p>` : ""}</div></article>`;
  $("[data-confirm-skill-selector]").disabled = installed || full;
  $("[data-confirm-skill-selector]").textContent = installed ? "Installed" : "Confirm";
}

function renderConfiguration() {
  const activation = currentSkillActivation();
  const planner = currentPlanner();
  // Config card (src/configuration-panel.js; coordinator design with the user 2026-10-14): Scenario, exclusive choices,
  // best-case assumptions and Advanced inputs. Manual mode lists only the conditions with a source in this build, read from
  // the same build in automatic mode.
  const probe = plannerState.combat.conditionMode === "manual" ? conditionSourceProbe() : null;
  $("#combat-conditions").innerHTML = configurationPanelMarkup({ planner, combat: plannerState.combat, probe, activeNames: activation.activeNames, open: { ...configSectionOpen, assumptions: bestCaseAssumptionsOpen }, format });
}

function damageBucketDiagram(theoretical, planner) {
  // Damage path page (src/damage-path-panel.js): path tabs, summary card and stage sections.
  return damagePathPanelMarkup({ theoretical, planner, selected: selectedDamagePath, format });
}

function renderCharacter() {
  const planner = currentPlanner();
  const activation = planner.activation;
  const equipment = planner.equipment;
  const talentSlate = planner.talentSlate;
  const pact = planner.pact;
  const theoretical = calculatePlanner({ ...capturePlannerState(), combat: { ...plannerState.combat, targetFireResistancePercent: 30 } }).theoretical;
  const baselineEquipment = calculateEquipmentCandidate(selenaScorchingBeamGearSs13.items, {}, selenaScorchingBeamObservedSnapshots[0]);
  const defenseDelta = (key) => (equipment.defenses[key] || 0) - (baselineEquipment.defenses[key] || 0);
  const esFlatDelta = defenseDelta("maxEnergyShield") + defenseDelta("gearEnergyShield") + (equipment.delta["maxEnergyShield:flat"] || 0);
  const gearResourceFactor = stat => (100 + (equipment.candidate[`${stat}:increased`] || 0)) / (100 + (equipment.baseline[`${stat}:increased`] || 0));
  const energyShield = Math.max(0, (7377 + esFlatDelta) * gearResourceFactor("maxEnergyShieldPercent") * (1 + (talentSlate.talentDelta.maxEnergyShieldPercent || 0) / 100));
  const life = Math.max(0, 2150 * gearResourceFactor("maxLifePercent") * (1 + (talentSlate.talentDelta.maxLifePercent || 0) / 100));
  // Energy never switches a setup off (user decision 2026-10-21): the setups past the budget or with an unknown cost are counted
  // and listed as warnings.
  const inactive = activation.allocation.allocations.filter((entry) => entry.status !== "active" && entry.status !== "disabled");
  $("#character-status").textContent = inactive.length ? `${inactive.length} over Energy · counted` : `${activation.allocation.allocations.filter((entry) => entry.status === "active").length} active`;
  $("#character-status-detail").textContent = inactive.map((entry) => `${entry.name} (${entry.status === "insufficient-energy" ? "insufficient Energy: counted anyway" : "Energy cost unknown: counted anyway"})`).join(" · ");
  $("#character-status").classList.toggle("warning", inactive.length > 0);
  $("#stat-sheet").innerHTML = renderStatSheet(planner, selectedStatSheetSkill, { life, energyShield, mana: 525, armour: equipment.defenses.armor || 0, evasion: equipment.defenses.evasion || 0 }, format, escapeHtml);
  $("#damage-path").innerHTML = damagePathControlsMarkup() + damageBucketDiagram(theoretical, planner);
  for (const tab of $("#stats-panel-options").querySelectorAll("[data-stats-panel]")) {
    const selected = tab.dataset.statsPanel === activeStatsPanel;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  $("#stat-sheet").hidden = activeStatsPanel !== "sheet";
  $("#damage-path").hidden = activeStatsPanel !== "damage-path";
}

$("#stats-panel-options").addEventListener("click", (event) => {
  const button = event.target.closest("[data-stats-panel]");
  if (!button) return;
  activeStatsPanel = button.dataset.statsPanel;
  saveWorkspaceLocation();
  for (const tab of $("#stats-panel-options").querySelectorAll("[data-stats-panel]")) {
    const selected = tab.dataset.statsPanel === activeStatsPanel;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  $("#stat-sheet").hidden = activeStatsPanel !== "sheet";
  $("#damage-path").hidden = activeStatsPanel !== "damage-path";
});

$("#stat-sheet").addEventListener("change", (event) => {
  if (event.target.id !== "stat-sheet-skill") return;
  selectedStatSheetSkill = event.target.value;
  saveWorkspaceLocation();
  renderCharacter();
});

function selectDamagePathTab(value, { focus = false } = {}) {
  selectedDamagePath = /^(hit|ignite|reaping|combined|hit:[\w:-]+|ailment:[\w:-]+)$/.test(value) ? value : "hit";
  saveWorkspaceLocation();
  for (const tab of $("#damage-path").querySelectorAll("[data-damage-path-tab]")) {
    const selected = tab.dataset.damagePathTab === selectedDamagePath;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const view of $("#damage-path").querySelectorAll("[data-damage-path-view]")) view.hidden = view.dataset.damagePathView !== selectedDamagePath;
}
// Open questions "Copy questions" (src/open-questions-panel.js): plain text of the build's applicable questions.
async function copyOpenQuestions(button) {
  const planner = currentPlanner();
  const text = openQuestionsText(openQuestionsFor(planner, planner?.state));
  try { await navigator.clipboard.writeText(text); }
  catch { showToast("Clipboard access was unavailable"); return; }
  button.textContent = "Copied";
  clearTimeout(button.copiedTimer);
  button.copiedTimer = setTimeout(() => { button.textContent = "Copy questions"; }, 1600);
}
// Report buttons: each opens the in-planner feedback dialog (src/feedback-dialog.js) with its GitHub form's fields; "Send to
// GitHub" puts the compact build code in the URL when it is included and fits (else copies it) and opens the pre-filled
// issue form in a new tab (the desktop app hands it to the system browser, electron/main.cjs setWindowOpenHandler).
const feedbackDialog = createFeedbackDialog({ dialog: $("#feedback-dialog"), toast: showToast });
function currentBuildCode() {
  try { return encodePlannerState(plannerState); } catch { return ""; }
}
function reportCalculation() {
  persistPlannerState();
  const context = calculationReportContext(currentPlanner(), selectedStatSheetSkill);
  feedbackDialog.open("calculation", { ...context, version: APP_VERSION, platform: platformName(window), buildCode: currentBuildCode() });
}
for (const view of ["#stat-sheet", "#damage-path"]) $(view).addEventListener("click", (event) => {
  if (event.target.closest("[data-report-calculation]")) reportCalculation();
});
$("[data-report-bug]").addEventListener("click", () => {
  persistPlannerState();
  feedbackDialog.open("bug", { area: bugAreaForView({ view: activeWorkspaceView, statsPanel: activeStatsPanel, slateMode: talentSlateMode }), version: APP_VERSION, platform: platformName(window), buildCode: currentBuildCode() });
});
$("#damage-path").addEventListener("click", (event) => {
  const submit = event.target.closest("[data-submit-open-question]");
  if (!submit) return;
  event.preventDefault();
  const entry = OPEN_QUESTIONS.find((item) => item.id === submit.dataset.submitOpenQuestion);
  if (!entry) return;
  persistPlannerState();
  feedbackDialog.open("answer", { entry, version: APP_VERSION, platform: platformName(window), buildCode: currentBuildCode() });
});
$("#damage-path").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-damage-path-tab]");
  if (tab) selectDamagePathTab(tab.dataset.damagePathTab);
  const copy = event.target.closest("[data-copy-open-questions]");
  if (copy) copyOpenQuestions(copy);
});
$("#damage-path").addEventListener("keydown", (event) => {
  const tab = event.target.closest("[data-damage-path-tab]");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...$("#damage-path").querySelectorAll("[data-damage-path-tab]")];
  const index = tabs.indexOf(tab);
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
  event.preventDefault();
  selectDamagePathTab(tabs[next].dataset.damagePathTab, { focus: true });
});

const tooltipSelector = "[data-damage-source],.talent-node,.core-talent,.equipment-item,.inventory-item,.skill-setup,.support-card:not(.add-support-card),[data-skill-tooltip],[data-support-tooltip],.skill-primary-socket:not(.empty-skill-slot),[data-hero-trait-support-id],[data-hero-trait-tooltip],[data-tree-extra-row-tooltip],[data-sage-scent-tooltip],.hero-memory-socket.filled,.hero-memory-item,.pactspirit,.kismet-toggle,.micro-quantity,.slate-chip,.slate-piece,.crafted-slate-item,[data-pactspirit-name],[data-pact-node-tooltip],[data-follower-skill-tooltip],[data-follower-tooltip],[data-qol-help]";
let tooltipAnchorX=0,tooltipAnchorY=0;
let tooltipAnchorElement=null;
function savedMemoryAffix(memory,group,index){
  const effect=memory[group]?.[index];if(!effect)return "";
  const fixed=group==="fixedAffixes",tier=memory[fixed?"fixedTiers":"randomTiers"]?.[index],roll=memory[fixed?"fixedRolls":"randomRolls"]?.[index];
  const catalog=fixed&&tier===0?heroMemoryFixedT0AffixesSs13:heroMemoryTierAffixesSs13;
  const match=catalog.find((entry)=>entry.type===memory.type&&entry.kind===(fixed?"Fixed Affix":"Random Affix")&&entry.tier===tier&&memoryAffixKey(entry.baseEffect||entry.effect)===memoryAffixKey(effect));
  const tierEffect=match?.effect||effect,range=memoryRollRange(tierEffect);
  return rolledMemoryAffix(tierEffect,range&&Number.isFinite(roll)?Math.max(range.min,Math.min(range.max,roll)):roll);
}
function memoryAffixRowContent(effect,tier){
  return `${Number.isInteger(tier)?affixTierBadge(`T${tier}`):""}<span>${modifierTextMarkup(effect)}</span>`;
}
function heroMemoryTooltipContent(element){
  const id=element.dataset.memoryInventoryId||(element.dataset.memoryTier==="base"?plannerState.hero.baseTraitMemoryId:plannerState.hero.equippedMemoryIds?.[element.dataset.memoryTier]);
  const memory=plannerState.hero.memoryInventory?.find((item)=>item.id===id);
  if(!memory)return null;
  const baseSlotted=plannerState.hero.baseTraitMemoryId===id,reduction=baseSlotted?baseTraitReduction():null;
  const memoryModel=currentPlanner().heroMemories;
  const equipped=Object.values(plannerState.hero.equippedMemoryIds||{}).includes(id)||(baseSlotted&&reduction!==null);
  const status=(text)=>heroMemoryLineCoverage(memoryModel,id,text,equipped);
  const section=(label,entries)=>entries.length?`<section${label==="Implicit"?` class="memory-implicit ${memory.waxAndWane?"wax-applied":""}"`:""}><h4>${label}</h4>${entries.map((entry)=>typeof entry==="string"?`<p>${modifierTextMarkup(entry)} ${coverageBadge(status(entry))}</p>`:`<div class="memory-affix-row">${memoryAffixRowContent(entry.effect,entry.tier)} ${coverageBadge(entry.status||status(entry.effect))}</div>`).join("")}</section>`:"";
  const fixed=(memory.fixedAffixes||[]).map((_,index)=>({effect:savedMemoryAffix(memory,"fixedAffixes",index),tier:memory.fixedTiers?.[index]})).filter((entry)=>entry.effect);
  const random=(memory.randomAffixes||[]).map((_,index)=>({effect:savedMemoryAffix(memory,"randomAffixes",index),tier:memory.randomTiers?.[index]})).filter((entry)=>entry.effect).map((entry)=>({...entry,effect:reduction===null?entry.effect:reduceBaseTraitMemoryStat(entry.effect,reduction)}));
  const implicitText=memoryScaledBaseStat(memory.baseStat,memory.type,memory.enhancementLevel,memory.waxAndWane,memory.rarity);
  const implicit=reduction===null?implicitText:reduceBaseTraitMemoryStat(implicitText,reduction);
  const revival=[memory.waxAndWane?"Wax and Wane · +30% base stat":"",memory.risingMoon?"Rising Moon · fixed affix tier increased":""].filter(Boolean);
  return {memoryHtml:`<div class="memory-tooltip-head"><img src="${heroMemoryIcon(memory.type)}" alt=""><div><strong>${escapeHtml(memory.name||memory.type)}</strong><small>${escapeHtml(memory.rarity||"normal").toUpperCase()} · HERO MEMORY</small></div></div>${memoryRevivalBadge(memory)}<div class="memory-tooltip-body"><p>Enhancement Level <b>${memory.enhancementLevel}/${memoryMaxEnhancementForRarity(memory.rarity)}</b></p><p>Trait Level <b>+${traitLevelBonusForEnhancement(memory.enhancementLevel)}</b></p>${reduction===null?"":`<p>Base Trait Slot <b>${reduction}% to base stats and random affixes</b></p>`}${section("Implicit",[implicit])}${section("Memory Revival",revival.map(effect=>({effect,status:equipped?"Applied to rolls":"Not equipped"})))}${memory.revivedAffix?`<section><h4>Revived Affix${lunarPhaseRevivedAffixesSs13.includes(normalizeRevivedAffix(memory.revivedAffix))?" · Lunar Phase":""}</h4>${memoryRevivedAffixMarkup(memory)}${memory.revivedAffix==="Ceaseless Tide"?`<p>When equipped on Sing with the Tide: +80% additional Tide Effect and ×0.8 cast speed while in Bard. Movement is not simulated.</p>`:""}${coverageBadge(!equipped?"Not equipped":memory.revivedAffix==="Ceaseless Tide"&&memoryModel.ceaselessTide?"In calc":equippedBaseTraitSlot(plannerState.hero)?.source.id===memory.id?"Enables base slot":(catsNightSafariStatus(currentPlanner(),memory)||revivedAffixCoverage(currentPlanner(),memory))?.status||"Not modeled",(catsNightSafariStatus(currentPlanner(),memory)||revivedAffixCoverage(currentPlanner(),memory))?.reason||"")}</section>`:""}${section("Fixed Affixes",fixed)}${section("Random Affixes",random)}</div><small>${element.dataset.memoryInventoryId?"Right-click to equip or unequip":"Right-click to unequip"}</small>`,rarity:memory.rarity||"normal"};
}
// A linked slate's Judgment boost as the calc reads it (40% x its Effect Increase Multipliers; src/nether-king-authority.js).
function judgmentLinkPercentOf(id){return currentPlanner()?.resolvedSlates?.find((item)=>item.id===id)?.judgmentLinkPercent??JUDGMENT_LINK_EFFECT_PERCENT;}
function slateTooltipContent(element){
  const id=element.dataset.slateId||element.dataset.craftedSlateInventory;
  const slate=slatesForBoard().find((item)=>item.id===id);
  if(!slate)return null;
  const icon=slate.icon||slate.cellIcon||"";
  const pose=slatePlacements[id]||parkedSlates[id]||slate;
  const rotation=((Number(pose.rotation)||0)%360+360)%360;
  const flipX=Number(pose.flipX)===-1?-1:1,flipY=Number(pose.flipY)===-1?-1:1;
  const affixes=slateAffixes(slate);
  const affected=judgmentAffectedSlateIds(slatesForBoard(),slatePlacements,equippedSlateIds).has(slate.id);
  const linkPercent=judgmentLinkPercentOf(slate.id);
  const judgmentContext={linked:affected,linkPercent,ownAuthority:Boolean(isActiveJudgment(slate)&&equippedSlateIds.has(slate.id)&&slatePlacements[slate.id])};const displayed=(affix)=>scaleJudgmentAffix(affix,slate.amplifiedPercent||0,judgmentAffixTargetPercent(slate,affix,judgmentContext));
  const limited=new Set(Object.values(divinitySlateAffixesSs13).flat().filter((affix)=>affix.maxDivinityEffect===1).map((affix)=>`${affix.tree}: ${affix.name}: ${affix.effect}`));
  const renderAffixRows=(entries)=>entries.filter(Boolean).map((affix)=>{
    const core=affix.match(/^(.+?): (Lv\.[12] Core Talent): (.+?)(?:\s+[—–]\s+|$)/);
    return `<li class="${core?"core-slate-affix":""} ${limited.has(affix)?"max-one-divinity":""}">${core?`<strong class="core-slate-badge">Core Talent</strong><span class="core-slate-summary">${coloredSlateAffix(`${core[1]}: `)}<span class="keyword-roll-name">${escapeHtml(core[3])}</span></span><small class="core-slate-hint">Hold Alt for details</small><span class="core-slate-detail">${coloredSlateAffix(displayed(affix))}</span>`:`<span>${slateAffixMarkup(displayed(affix),(line)=>slateLineCoverage(line,equippedSlateIds.has(slate.id)&&!!slatePlacements[slate.id]))}</span>`}<div class="slate-affix-badges">${limited.has(affix)?'<strong class="max-divinity-badge" title="Only one copy of this effect is active across equipped slates">Max active: 1</strong>':""}${netherKingLineNote(affix)?`<strong class="max-divinity-badge" title="Saved before SS14: no SS14 Nether King node has this wording, so it applies as written">${escapeHtml(netherKingLineNote(affix))}</strong>`:""}${(()=>{ const placed=equippedSlateIds.has(slate.id)&&!!slatePlacements[slate.id]; if(/^Copies?\b/i.test(affix))return coverageBadge(placed?"In calc":"Not equipped"); const status=slateLineCoverage(displayed(affix),placed,slate.id); const reason=placed&&(status==="Inactive"||status==="No DPS effect")?slateLineCoverageReason(displayed(affix),slate.id):""; return coverageBadge(status,reason?`${status}: ${reason}`:""); })()}</div></li>`;
  }).join("");
  const template=slate.template||slate.name;
  const craftedGroups=slate.affixes&&!legendaryTalentSlotTypes[template]&&!slate.copyRule?slateCraftedAffixGroups(slate):null;
  const groups=craftedGroups?[["Fixed Affixes",craftedGroups.fixed],["Random Affixes",craftedGroups.random||craftedGroups.brand||[]]]:slate.brands?[["Fixed Affixes",affixes],["Brand Talent Nodes",slate.brands]]:legendaryTalentSlotTypes[template]?[["Talent Affixes",affixes]]:slate.copyRule?[["Fixed Affix",affixes.length?affixes:[slate.copyRule]]]:[["Fixed Affixes",affixes.slice(0,2)],["Random Affixes",affixes.slice(2)]];
  const affixSections=groups.map(([title,entries])=>{const rows=renderAffixRows(entries);return rows?`<section><h3>${title}</h3><ul>${rows}</ul></section>`:"";}).join("");
  const copySlate=isCopySlate(slate);
  const placed=equippedSlateIds.has(slate.id)&&!!slatePlacements[slate.id];
  // Talents a Contamination projects onto this slate (src/nether-king-authority.js), at their projected strength, under its own lines.
  const projected=placed?(currentPlanner().resolvedSlates.find(item=>item.id===slate.id)?.projectedAffixSources||[]):[];
  const projectedSection=projected.length?`<section class="slate-copied-affixes slate-projected-affixes"><ul>${projected.map(({affix,effectPercent})=>`<li><div class="copied-affix-meta"><small>${escapeHtml(`Projected from Contamination (${effectPercent<0?"−":"+"}${Math.abs(effectPercent)}%)`)}</small></div><span>${slateAffixMarkup(affix,(line)=>slateLineCoverage(line,placed))}</span>${coverageBadge(slateLineCoverage(affix,placed))}</li>`).join("")}</ul></section>`:"";
  const copied=copySlate&&placed?(currentPlanner().resolvedSlates.find(item=>item.id===slate.id)?.copiedAffixSources || []):[];
  const copiedSection=copySlate?`<section class="slate-copied-affixes"><h3>Copied affixes</h3>${copied.length?`<ul>${copied.map(({source,affix})=>`<li><div class="copied-affix-meta"><small>${escapeHtml(source)}</small><strong class="copied-affix-badge">Copied</strong></div><span>${slateAffixMarkup(affix,(line)=>slateLineCoverage(line,placed))}</span>${coverageBadge(slateLineCoverage(affix,placed))}</li>`).join("")}</ul>`:`<p>${placed?"No eligible adjacent affixes to copy.":"Place on the grid to see copied affixes."}</p>`}</section>`:"";
  return {slateHtml:`<div class="slate-tooltip-head ${slateGodFamilyClass(slate.god)}">${icon?`<img src="${escapeHtml(icon)}" alt="" style="transform:scale(${flipX},${flipY}) rotate(${rotation}deg)">`:""}<div><strong>${escapeHtml(slate.name)}</strong><small>DIVINITY SLATE · ${escapeHtml(slate.rarity||"magic").toUpperCase()}</small></div></div>${affected?`<div class="slate-judgment-badge">Judgment · Affix effect +${linkPercent}%</div>`:""}<div class="slate-craft-affix-preview">${affixSections||`<p>${copySlate?"Copy effect":"No affixes selected."}</p>`}${projectedSection}${copiedSection}</div>`};
}
// A summon's own Minion skills (src/minion-skill-owners.js: a Spirit Magus's Base, Empower, Enhanced and Ultimate; a Synthetic
// Troop's or a module's skills; the Minion casts them, so they are not board skills): a heading and one line per skill (name,
// then its tags) inside the card's existing effect list. "" for any other skill.
function minionInherentSkillsHtml(summonName){
  const skills=minionInherentSkills(summonName);
  if(!skills.length)return "";
  return `<h4>${escapeHtml(skills[0].minion)} skills:</h4>${skills.map((skill)=>`<p><strong>${escapeHtml(skill.name)}</strong> · ${skill.tags.map((tag)=>escapeHtml(tag)).join(", ")}</p>`).join("")}`;
}
function skillTooltipContent(element){
  const heroSupportId=element.dataset.heroTraitSupportId;
  const boardSetups=skillBoardRows(currentEditedSetups(),plannerState.skills.boardSlots,activeSkillBoardTab,{traitGrants:true});
  const rowSetup=boardSetups[Number(element.dataset.selectorRow)];
  const supportSlot=Number(element.dataset.selectorSupportSlot);
  const supportName=element.dataset.supportTooltip||(Number.isInteger(supportSlot)?rowSetup?.supports?.filter((entry)=>entry.enabled)[supportSlot]?.name:"");
  const skillName=element.dataset.skillTooltip||element.dataset.parentSkill||heroTraitSupportConfig[heroSupportId]?.skill||rowSetup?.name;
  const setup=(element.closest("#skill-groups") ? rowSetup : null)||currentEditedSetups().find((entry)=>entry.name===skillName)||rowSetup;
  const heroInstalled=heroSupportId&&supportName?{...tlidbSupportCatalogSs13.find((entry)=>entry.name===supportName),level:plannerState.hero.heroTraitSupportLevels?.[heroSupportId]||20,specialConfig:plannerState.hero.heroTraitSupportConfigs?.[heroSupportId]}:null;
  const installed=heroInstalled||(supportName?setup?.supports.find((entry)=>entry.name===supportName):setup);
  const catalog=supportName?tlidbSupportCatalogSs13.find((entry)=>entry.name===supportName):tlidbSkillCatalogSs13.find((entry)=>entry.name===skillName);
  if(!installed&&!catalog)return null;
  const name=supportName||skillName, level=installed?.effectiveLevel||installed?.level||catalog?.level||catalog?.baseLevel||20;
  const levelLabel=installed?.baseLevel !== undefined ? skillLevelLabel(installed) : `Lv. ${level}`;
  const tags=catalog?.tags||[supportName?"Support":skillRoleLabels[setup?.role]||"Skill"];
  const skillDisplay=!supportName&&catalog?skillDisplaySs13(catalog,level):null;
  const supportDisplay=supportName&&catalog?supportDisplaySs13(catalog,level):null;
  const facts=skillDisplay?.facts||supportDisplay?.facts||[];
  const detailEffects=installed?.displayEffects||installed?.effects||catalog?.effects||[];
  const observed=setup&&!supportName?Object.entries(setup.observed||setup.databaseLevel20||{}).slice(0,5).map(([key,value])=>`${titleCase(key)}: ${Array.isArray(value)?value.join("–"):value}`):[];
  const effects=skillDisplay?.effects?.length?skillDisplay.effects:supportDisplay?.effects?.length?supportDisplay.effects:detailEffects.length?detailEffects:observed;
  const icon=supportName?(catalog?.icon||tliArt.supports[name]):(catalog?.icon||tliArt.skills[name]);
  const specialTiers=supportName?configurableSupportTierData(name):null;
  const progressionTiers=supportName?progressionSupportTierData(name):null;
  const specialConfig=(specialTiers||progressionTiers)?(normalizeProgressionSupportConfig(name,installed?.specialConfig)||defaultConfigurableSupportConfig(name, installed?.effects||catalog?.effects)):null;
  const specialTier=specialTiers?.find((entry)=>entry.tier===specialConfig?.tier);
  const progressionTier=progressionTiers?.find((entry)=>entry.tier===specialConfig?.tier);
  const secondaryTiers=supportName?activationMediumSecondaryTierData(name):null;
  const secondaryTier=secondaryTiers?.find((entry)=>entry.tier===specialConfig?.secondaryTier);
  const headerMeta=Number.isFinite(specialConfig?.stars)?`<small class="special-support-stars" aria-label="${specialConfig.stars} stars">${"★".repeat(specialConfig.stars)}${"☆".repeat(5-specialConfig.stars)} <em>${specialConfig.stars}/5</em></small><small>${levelLabel}</small>`:`<small>${specialConfig ? `Tier ${specialConfig.tier} · ${levelLabel}` : !supportName && setup ? skillLevelLabel(setup) : levelLabel}</small>`;
  const effectReference=skillDisplay?.effectEstimate?`<p class="skill-effect-reference">${escapeHtml(skillDisplay.effectEstimate)}</p>`:(skillDisplay&&!skillDisplay.hasLevelProgression||supportDisplay&&!supportDisplay.hasLevelProgression&&!specialTier&&!progressionTier)&&level!==20?"":"";
  const displayEffects=specialConfig&&progressionTier
    ? [...(activationMediumSelectedLines(name,specialConfig)?.map((line)=>`T${line.tier} · ${line.text}`)||progressionSupportText(name,specialConfig).split(" | ").map((line,index)=>index?line:`Main affix · T${progressionTier.tier} · ${line}`)),...(progressionSupportHasStars(name)?[`Star level · +${specialSupportStarBonus(specialConfig.stars)}% additional damage`]:[])]
    : specialConfig&&specialTier
    ? [...(name==="Activation Medium: Spell Burst"?[supportDisplay?.effects?.[0]||catalog?.effects?.[0]||"Triggers the supported skill when activating Spell Burst. Interval: 0.1s"]:[]),...(secondaryTier?[`Activation affix · T${specialConfig.secondaryTier} · Prepares the supported skill every ${specialConfig.secondaryRoll} s`]:[]),`Main affix · T${specialConfig.tier} · ${specialConfig.roll >= 0 ? "+" : ""}${specialConfig.roll}% ${specialConfig.rollKind ? `additional ${specialConfig.rollKind === "cooldown" ? "Cooldown Recovery Speed" : "Duration"} for the supported skill` : specialTier.effect}`,...(Number.isFinite(specialConfig.stars)?[`Star bonus · ${specialConfig.stars} ★ · +${specialSupportStarBonus(specialConfig.stars)}% additional damage`]:[])]
    : effects;
  const isAura=!supportName&&(catalog?.role==="aura"||setup?.role==="aura");
  const supportCoverageArgs={skillName:setup?.name||skillName,supportName,installed:Boolean(installed),enabled:!(setup?.enabled===false||installed?.enabled===false)}, supportClauses=supportName?supportClauseCoverage(currentPlanner(),supportCoverageArgs):[], supportOverall=supportName?classifySkillCoverage(currentPlanner(),supportCoverageArgs):null, supportLineBadge=(line)=>{const lineCoverage=supportLineCoverage(supportClauses,line,supportOverall);return lineCoverage?` ${coverageBadge(lineCoverage.status,lineCoverage.reason?`${lineCoverage.status}: ${lineCoverage.reason}`:"")}`:"";}, effectsHtml=`${effectReference}<div class="skill-tooltip-effect-list"><h4>${escapeHtml(name)}:</h4>${(displayEffects.length?displayEffects:["See TLIDB for complete level scaling."]).map((effect)=>`<p>${supportName?String(effect).split("\n").map((line)=>`${highlightedSupportEffect(line)}${supportLineBadge(line)}`).join("\n"):isAura?highlightedAuraEffect(effect):highlightedSkillEffect(effect,name)}</p>`).join("")}${supportName?"":minionInherentSkillsHtml(name)}</div>`;
  const coverage=classifySkillCoverage(currentPlanner(),{skillName:supportName?(setup?.name||skillName):name,supportName:supportName||"",installed:Boolean(installed),enabled:!(setup?.enabled===false||installed?.enabled===false)});
  return {supportTooltip:Boolean(supportName),auraTooltip:isAura,skillHtml:`<div class="skill-tooltip-head"><img src="${icon||""}" alt=""><div><strong>${escapeHtml(name)}</strong>${headerMeta}</div></div><div class="skill-tooltip-tags">${tags.map((tag)=>`<span>${escapeHtml(tag)}</span>`).join("")}${coverageBadge(coverage.status,coverage.reason?`${coverage.status}: ${coverage.reason}`:"")}</div>${!supportName&&curseSkillOverLimit(name)?curseLimitNoteHtml(curseLimitState()?.warning):""}${traitGrantNoteHtml(installed)}<div class="skill-tooltip-facts">${facts.map(([label,value])=>`<div class="${label==="Effectiveness of Added Damage"?"skill-added-damage-stat":""}"><span>${escapeHtml(String(label))}</span><b>${escapeHtml(String(value))}</b></div>`).join("")}</div>${effectsHtml}${catalog?.source||setup?.source?`<small class="skill-tooltip-source">${heroSupportId||element.dataset.carinoSupportSlot!==undefined?"Click to edit · Right-click to remove":"TLIDB · hover details"}</small>`:""}`};
}
function gearTooltipContent(element) {
  const inventoryId=element.dataset.equipInventory;
  const item=inventoryId?inventoryItems().find((entry)=>entry.id===inventoryId):currentEquipmentImpact().allItems.find((entry)=>entry.slot===element.dataset.equipmentSlot);
  if(!item||(!inventoryId&&disabledEquipmentSlots.has(item.slot))) return null;
  const rarity=titleCase(itemDisplayRarity(item));
  const active=inventoryId?isItemEquipped(item):!disabledEquipmentSlots.has(item.slot);
  const impact=currentEquipmentImpact();
  const corrodedIndices=new Set(item.corrodedModifierIndices||[]), kindCodes={Implicit:"I","Implicit · Corroded":"I","Base Affix":"BA","Belt Blend":"BL","TOWER Sequence":"TS",Prefix:"P",Suffix:"S","Legendary Mod":"L","Corrosion Implicit":"C",Affix:"A"};
  const sections=itemModifierSections(item).map((section)=>({...section,entries:section.entries.map((entry)=>{ const corroded=entry.tone==="corrosion"||corrodedIndices.has(entry.index), legendary=entry.tone==="legendary"||entry.badge==="L"; const status=gearLineCoverage(item,entry.text,active,currentPlanner().block,currentPlanner().lowResources,currentPlanner().blurEffects), curseReason=active?curseLineLeftOutReason(entry.text,item):"", coreReason=active&&(status==="Inactive"||status==="No DPS effect")?gearLineCoverageReason(item,entry.text):"";return {...entry,legendary,status,curseReason,coreReason,tone:corroded?"corrosion":status==="In calc"?"calculated":"pending",kind:corroded?"C":kindCodes[section.label]||"A"}; })}));
  return {title:item.name,rarity:rarity.toLowerCase(),sixAffix:hasSixCraftAffixes(item),priceless:isPricelessItem(item),itemLevel100:Boolean(itemLevel100Class(item)),html:`<div class="gear-tooltip-head"><img src="${gearIcon(item)}" alt=""><strong>${escapeHtml(item.name)}</strong><div><span>${escapeHtml(item.base||titleCase(item.slot))}</span><em class="${rarity.toLowerCase()}">${rarity}</em></div></div><div class="gear-tooltip-body">${curseLimitNoteHtml(sections.flatMap((section)=>section.entries).find((row)=>row.curseReason)?.curseReason)}<span class="gear-level">Require Lv ${item.level||1}</span>${item.energy&&equipmentEnergyAllowed(item.slot)?`<span class="gear-energy">${item.energy} Equipment Energy</span>`:""}<div class="tooltip-mod-sections">${sections.map((section)=>`<section><h4>${escapeHtml(section.label)}${section.detail?`<small>${escapeHtml(section.detail)}</small>`:""}</h4>${section.entries.length?`<ul>${section.entries.map((row)=>`<li class="${row.legendary?"legendary-affix ":""}${row.tone==="corrosion"?"corrosion-affix":""}">${row.badge?affixTierBadge(row.badge):`<i>${row.kind}</i>`}<span>${modifierTextMarkup(row.text,(line)=>gearLineCoverage(item,line,active,currentPlanner().block,currentPlanner().lowResources,currentPlanner().blurEffects))}</span><b class="${row.status==="In calc"?"calculated":neutralStatuses.has(row.status)?"neutral":"pending"}"${row.curseReason||row.coreReason?` title="${escapeHtml(`${row.status}: ${row.curseReason||row.coreReason}`)}"`:""}>${row.status}</b></li>`).join("")}</ul>`:""}</section>`).join("")||"<p>No modifiers configured</p>"}</div></div><small>${inventoryId?"Click to manage · Right-click to equip":"Click to inspect · Right-click to unequip"}</small>`};
}
function sageScentTooltipContent(element){
  const kind=element.dataset.sageScentTooltip;
  const name=plannerState.hero.sageScent?.[kind];
  const entry=kind==="elixir"?sageElixirsSs13.find((item)=>item.name===name):sageScentIngredientsSs13[kind]?.find((item)=>item.name===name);
  if(!entry)return null;
  const label=kind==="elixir"?"Elixir Skill":`${titleCase(kind)} Ingredient`;
  const tags=kind==="elixir"?entry.tags||[]:[];
  const lines=(entry.description||"").split("\n").map((line)=>line.trim()).filter(Boolean);
  return {scentHtml:`<div class="sage-tooltip-head"><img src="${escapeHtml(entry.icon)}" alt=""><div><small>${escapeHtml(label)}</small><strong>${escapeHtml(entry.name)}</strong></div></div>${tags.length?`<div class="sage-tooltip-tags">${tags.map((tag)=>`<span>${escapeHtml(tag)}</span>`).join("")}</div>`:""}<div class="sage-tooltip-effects">${lines.map((line)=>`<p>${escapeHtml(line)}</p>`).join("")}</div><small class="sage-tooltip-hint">Click to change</small>`};
}
function damageSourceTooltipContent(element) {
  const source = element.dataset.damageSource;
  const category = element.dataset.damageCategory || "";
  if (source === "Total Intelligence (0.5% per point)") {
    const planner = currentPlanner();
    const memory = planner.heroMemories?.totals?.["intelligence:flat"] || 0;
    const gear = planner.equipment?.candidate?.["intelligence:flat"] || 0;
    return { title: "Intelligence damage bonus", body: "Hero memories: " + memory + "\nEquipment: " + gear + "\nModeled total: " + (memory + gear) + " Intelligence\nOne additional damage factor: +" + (memory + gear) * 0.5 + "%" };
  }
  if (source === "Slates: additional Max Damage") return { title: "Additional Max Damage", body: "Raises the upper roll of Scorching Beam hits. The lower roll is unchanged. The equipped Fallen Starlight value already includes Judgment's increase; Prairie does not copy this affix. Ignite uses a separate base-damage attribute." };
  if (source.startsWith("Core talent: ")) {
    const name=source.slice("Core talent: ".length);
    const core=Object.values(allProfessionTalentCatalogueSs13).flatMap(panel=>panel.coreTalents||[]).find(core=>core.name===name);
    return { title:name, body:core?.description||"Core talent contribution" };
  }
  if (source.startsWith("Hero memor")) {
    const memories = currentPlanner().heroMemories;
    const line = memories.lines.find(line => source === line.source + ": " + line.text || source === line.source + ": Intelligence");
    if (line) return heroMemoryTooltipContent({ dataset: { memoryInventoryId: line.memoryId } });
    return { title: source, body: memories.lines.filter(line => line.stat === "intelligence").map(line => line.source + ": " + line.text).join("\n") };
  }
  const planner = currentPlanner();
  const proxy = (className, dataset) => {
    const target = document.createElement("span");
    target.className = className;
    Object.assign(target.dataset, dataset);
    return plannerTooltipContent(target);
  };
  const support = source.startsWith("Support: ") ? source.slice(9)
    : /Disintegrate/.test(source) ? "Scorching Beam: Disintegrate (Noble)"
    : source.endsWith(" support") ? source.slice(0, -8) : null;
  if (support) return proxy("", { supportTooltip: support, parentSkill: "Scorching Beam" });
  if (source.startsWith("Aura: ")) {
    const family = source.slice(6);
    const setup = planner.activation.setups.find((entry) => planner.activation.activeNames.has(entry.name) && (entry.name === family || entry.name === `Precise: ${family}`));
    if (setup) return proxy("", { skillTooltip: setup.name });
  }
  const skill = planner.activation.setups.find((entry) => source === entry.name || source.startsWith(`${entry.name} level `) || source.startsWith(`${entry.name} average `));
  if (skill) return proxy("", { skillTooltip: skill.name });
  const traitName = /Selena level 10|Bard state|Tide effect|Enemy On the Tide/.test(source) ? "Sing with the Tide"
    : source.startsWith("Idyll of the Tide") ? "Idyll of the Tide" : source;
  const trait = [...document.querySelectorAll("[data-hero-trait-tooltip]")].find((entry) => entry.dataset.heroTraitTooltip === traitName);
  if (trait) return plannerTooltipContent(trait);
  const heroTrait = allHeroTraitsSs13[plannerState.hero.selectedHeroId]?.traits.find((entry) => entry.name === traitName);
  const treeRow = heroTreeSelections(plannerState.hero).indexOf(traitName);
  if (heroTrait) return proxy("", { heroTraitTooltip: traitName, heroTraitLevelKey: heroTrait.level <= 1 ? "base" : treeRow >= 0 ? treeRowLevelKey(plannerState.hero.selectedHeroId, treeRow) : `level${heroTrait.level}` });
  const namedGear = planner.equipment.candidateItems.filter((item) => source === item.name || source.startsWith(`${item.name}:`));
  if (namedGear.length === 1) return proxy("equipment-item", { equipmentSlot: namedGear[0].slot });
  const namedSlate = slatesForBoard().find((item) => source === item.name);
  if (namedSlate) return proxy("slate-piece", { slateId: namedSlate.id });
  if (source.startsWith("Kismet: ")) {
    const name = source.slice(8);
    const slot = Object.entries(plannerState.pacts.kismetSlots || {}).find(([, item]) => item.name === source || item.name === name);
    if (slot) return proxy("", { pactNodeTooltip: "", kismetNode: slot[0], nodeName: "Equipped Kismet" });
    const kismet = kismetCatalogSs13.find((item) => item.name === source || item.name === name);
    if (kismet) return { title: name, body: (kismet.affixes || []).join("\n") };
  }
  const keyMap = [
    [/base ignite/i, "baseIgniteDamage"], [/fire damage over time/i, "fireDamageOverTimePercent"],
    [/damage over time/i, "damageOverTimePercent"], [/elemental damage/i, "elementalDamagePercent"],
    [/ailment damage enhancement/i, "ailmentDamageEnhancementPercent"], [/intelligence/i, "intelligence"],
    [/fire infiltration/i, "inflictsFireInfiltrationAgainstIgnited"],
    [/additional ignite/i, "additionalIgniteDamagePercent"], [/additional fire/i, "additionalFireDamagePercent"],
    [/affliction effect/i, "afflictionEffectPercent"], [/reaping recovery/i, "reapingRecoverySpeedPercent"],
    [/reaping duration/i, "reapingDurationPercent"], [/damage/i, "damagePercent"]
  ];
  const stat = keyMap.find(([pattern]) => pattern.test(`${source} ${category}`))?.[1];
  const contributors = [];
  if (/^Equipment|^Equipped gear/.test(source) && stat) {
    const rows = collectNormalizedGearModifiers(planner.equipment.candidateItems).filter((item) => item.stat === stat);
    contributors.push(...rows.map((item) => `${item.source} (${equipmentSlots.find(([slot]) => slot === item.slot)?.[1] || item.slot})\n${item.text}`));
  } else if (namedGear.length > 1) {
    contributors.push(...namedGear.map((item) => `${item.name} (${equipmentSlots.find(([slot]) => slot === item.slot)?.[1] || item.slot})\n${(item.modifiers || []).join("\n")}`));
  } else if (/^Talent/.test(source) && stat) {
    const candidate = resolveTalentCandidate(selenaScorchingBeamTalentSetupSs13, allProfessionTalentCatalogueSs13, planner.state.talentRanks, planner.state.talents);
    for (const panel of candidate.setup.panels) for (const node of panel.allocatedNodes) {
      const value = (node.effectsPerRank?.[stat] || node.effects?.[stat] || 0) * (node.effectsPerRank ? node.rank : 1);
      if (node.rank > 0 && value) contributors.push(`${panel.name} · node ${node.coordinate} · rank ${node.rank}\n${formatEffect(stat, value)}`);
    }
  } else if (/^Divinity Slate/.test(source)) {
    const words = stat ? effectLabel(stat).replace(/percent|flat/gi, "").trim() : category;
    for (const slate of slatesForBoard().filter((item) => equippedSlateIds.has(item.id))) {
      const affixes = [...(slate.fixed || slate.affixes || []), ...(slate.brands || []), ...(slate.copiedTalents || [])].filter((line) => words && line.toLowerCase().includes(words.toLowerCase()));
      if (affixes.length) contributors.push(`${slate.name}\n${affixes.join("\n")}`);
    }
  } else if (/^Pacts/.test(source)) {
    const words = /additional damage/i.test(source) ? "additional damage" : stat ? effectLabel(stat) : category;
    for (const node of document.querySelectorAll("[data-pact-node-tooltip]")) {
      if (node.getAttribute("aria-pressed") !== "true") continue;
      const effect = node.dataset.nodeEffect || "";
      const matches = /additional damage/i.test(source) ? /^\+[\d.]+% additional damage$/i.test(effect.trim()) : words && effect.toLowerCase().includes(words.toLowerCase());
      if (matches) contributors.push(`${node.dataset.nodeName}\n${effect}`);
    }
    if (planner.state.pacts.kismetSlotMode && /additional damage/i.test(source)) for (const name of planner.state.pacts.selectedSpirits || []) {
      if (!name || planner.state.pacts.activeSpirits[name] === false) continue;
      const sequence = orderedPactspiritNodes(pactspiritTreesSs13[name] || []);
      const outer = sequence.findIndex((node) => node.ring === "outer");
      if (planner.state.pacts.nativeNodeQuantities[`${name}:${outer}`] !== 1) continue;
      const effects = pactspiritEffectsAtLevel(name, selectedPactspiritLevel(name)).filter((line) => /^\+[\d.]+% additional damage$/i.test(line));
      if (effects.length) contributors.push(`${name}\n${effects.join("\n")}`);
    }
    if (!planner.state.pacts.kismetSlotMode) for (const spirit of selenaScorchingBeamPactsSs13.pactspirits) {
      if (planner.state.pacts.activeSpirits[spirit.name] === false) continue;
      for (const node of spirit.unreplacedNativeNodes) {
        const quantity = planner.state.pacts.nativeNodeQuantities[`${spirit.name}:${node.name}`] ?? node.quantity;
        if (quantity && node.effectsPerNode[stat]) contributors.push(`${spirit.name} · ${node.name} ×${quantity}\n${formatEffect(stat, node.effectsPerNode[stat] * quantity)}`);
      }
      if (/additional damage/i.test(source)) {
        const effects = pactspiritEffectsAtLevel(spirit.name, selectedPactspiritLevel(spirit.name)).filter((line) => /^\+[\d.]+% additional damage$/i.test(line));
        if (effects.length) contributors.push(`${spirit.name}\n${effects.join("\n")}`);
      }
    }
    if (/reaping duration/i.test(category)) contributors.push(`Reaping Duration Fate nodes ×${planner.state.pacts.reapingDurationQuantity ?? 5}\n+12% Reaping Duration per node`);
  }
  return { title: source, body: contributors.length ? contributors.join("\n\n") : `${category || "Damage source"}\nThis row combines the selected planner sources. Its contribution is shown in the damage path.` };
}

function plannerTooltipContent(element) {
  if(element.matches("[data-tree-extra-row-tooltip]"))return {traitHtml:treeExtraRowTooltipHtml()};
  if(element.matches("[data-qol-help]"))return {qolHtml:qolHelpTooltipHtml(element.dataset.qolHelp)};
  if(element.matches("[data-damage-source]"))return damageSourceTooltipContent(element);
  if(element.matches("[data-sage-scent-tooltip]"))return sageScentTooltipContent(element);
  if(element.matches(".core-talent")){
    const panel=currentTalentPanel(),isPrism=element.classList.contains("prism");
    const installed=isPrism?(plannerState.talents.prismInventory||[]).find((item)=>item.id===plannerState.talents.installedPrisms?.[panel.name]):null;
    const threshold=Number(element.dataset.coreSlot||0);
    const selectedName=plannerState.talents.coreSelections[`${panel.name}:${threshold}`];
    const core=isPrism?null:panel.coreTalents.find((item)=>item.unlockPoints===threshold&&item.name===selectedName);
    if(isPrism&&!installed)return null;
    const title=isPrism?installed.base:core?.name||`${threshold}-point Core Talent`;
    const icon=isPrism?prismIcon(installed):core&&(tliArt.coreTalents[core.name]||core.icon);
    const description=isPrism?prismBaseEffect(installed.type,installed.base,installed.legendaryAffix):core?.description||"Choose a core talent to view its effects.";
    const lines=description.split(/\s*\|\s*|\n/).map((line)=>line.trim()).filter(Boolean);
    const label=isPrism?(prismReplacesCore(installed)?"Prism core override":"Separate prism effect"):`Core talent · ${threshold} points`;
    const badge=isPrism?"Prism":core?"Selected":element.classList.contains("locked")?"Locked":"Open";
    const footer=isPrism?"Base prism effect":core?"Selected · Click to change":element.classList.contains("locked")?`Requires ${threshold} points in ${panel.name}`:"Click to select a core talent";
    const coreStatus=core?.name==="Subtle Impact"&&!currentPlanner().conditions.blur?(currentPlanner().blurSources.some(source=>source.available)?"Inactive":"Missing Blur source"):!core&&!installed?"Not selected":isPrism?prismAffixCoverage(installed,"base"):core?.name==="Daze"?dazeStatus(currentPlanner()):modeledCoreTalents.includes(core?.name)?"In calc":refineCoverage("Not independently modeled",lines.join("\n"));
    return {talentType:isPrism?"prism-core":"core",basicTalentHtml:`<div class="basic-talent-head"><span class="basic-talent-icon">${icon?`<img src="${escapeHtml(icon)}" alt="">`:"✦"}</span><div><small>${escapeHtml(label)}</small><strong>${escapeHtml(title)}</strong></div><b>${escapeHtml(badge)}</b></div><div class="basic-talent-body core-talent-body">${lines.map((line)=>`<p>${escapeHtml(line)}</p>`).join("")}${coverageBadge(coreStatus,isPrism?prismAffixCoverageReason(installed,"base"):"")}${core?.name==="Subtle Impact"?`<p>Damage over time only · Requires a Blur grant in the build and Blur enabled in Configuration. Conditional uptime is assumed.</p>`:core?.name==="Fueling"?`<p>Nearby target assumed · Fire Resistance fixed at 0%.</p>`:core?.name==="True Flame"?`<p>Fire hits only · Requires a modeled Ignite source and uses configured average Affliction.</p>`:""}</div><footer>${escapeHtml(footer)}</footer>`};
  }
  if(element.matches("[data-pact-node-tooltip]")){
    const {nodeName,nodeEffect,nodeRing,nodeIcon}=element.dataset;
    const limitNote=plannerState.pacts.kismetSlotMode?pactLimitNote(element.dataset.kismetNode||element.dataset.pactNodeAllocate||"",{allocateBlock:element.dataset.pactLimitBlock||null}):"";
    const equipped=plannerState.pacts.kismetSlots?.[element.dataset.kismetNode],kismet=kismetCatalogSs13.find((item)=>item.name===equipped?.name),kismetBoost=kismet?microFateEffectScale(plannerState.pacts,element.dataset.kismetNode):null;
    if(kismet)return {rarity:kismet.rarity.toLowerCase(),pactHtml:`<div class="pact-tooltip-head"><img src="${kismet.icon}" alt=""><div><strong>${escapeHtml(kismet.name)}</strong><small>${kismet.rarity} · ${kismet.kind} Kismet${starTrailNote(kismetBoost)?` · ${starTrailNote(kismetBoost)}`:""}</small></div></div>${limitNote}<ul class="pact-tooltip-rewards">${kismetAffixesWithRolls(kismet,equipped.rolls).map((affix)=>`<li>${keywordRollParts(affix)?modifierTextMarkup(affix):boostedKismetAffixHtml(affix,kismetBoost)} ${curseBadge(kismetAffixCoverage(affix,{key:element.dataset.kismetNode}),affix)}</li>`).join("")}</ul><footer>${plannerState.pacts.kismetSlotMode?(element.classList.contains("pact-tree-extra")?"Right-click to edit or clear":"Left-click to allocate · Right-click to edit or clear"):"Click to edit · Right-click to remove"} · Replaces ${escapeHtml(nodeName)}</footer>`};
    const spiritName=element.closest(".pact-slot")?.querySelector("[data-pactspirit-name]")?.dataset.pactspiritName;
    const level=spiritName?selectedPactspiritLevel(spiritName):1;
    const rewards=nodeRing==="outer"&&spiritName?pactspiritEffectsAtLevel(spiritName,level):[];
    const spiritRarity=pactspiritCatalogSs13.find((spirit)=>spirit.name===spiritName)?.rarity.toLowerCase();
    return {rarity:spiritRarity,pactHtml:`<div class="pact-tooltip-head">${nodeIcon?`<img src="${nodeIcon}" alt="">`:""}<div><strong>${escapeHtml(nodeName)}</strong><small>${nodeRing==="inner"?"Micro node":nodeRing==="mid"?"Medium node":nodeRing==="outer"?"Outer node":"Fate slot"}</small></div></div>${rewards.length?`<h4>Level ${level} bonuses</h4><ul class="pact-tooltip-rewards">${rewards.map((effect)=>`<li>${modifierTextMarkup(effect)} ${curseBadge(pactEffectCoverage(effect),effect)}</li>`).join("")}</ul>`:nodeEffect?`<p>${modifierTextMarkup(nodeEffect)} ${curseBadge(pactEffectCoverage(nodeEffect),nodeEffect)}</p>`:""}${limitNote}<footer>${plannerState.pacts.kismetSlotMode?`Left-click to ${element.getAttribute("aria-pressed")==="true"?"refund":"allocate"}${nodeRing==="destiny"?" · Right-click to configure Fate slots":kismetKindForRing(nodeRing)?" · Right-click to add a Kismet":""}`:nodeRing==="destiny"?"Click to unlock extra Fate slots · Right-click to remove them":kismetKindForRing(nodeRing)?"Click to craft a Kismet · Right-click to remove":"TLIDB · outer node"}</footer>`};
  }
  if(element.matches("[data-pactspirit-name]")){
    const entry=pactspiritCatalogSs13.find((spirit)=>spirit.name===element.dataset.pactspiritName);
    if(!entry)return null;
    const outer=pactspiritTreesSs13[entry.name]?.find((node)=>node.ring==="outer");
    const level=selectedPactspiritLevel(entry.name),rewards=pactspiritEffectsAtLevel(entry.name,level);
    return {rarity:entry.rarity.toLowerCase(),pactHtml:`<div class="pact-tooltip-head"><img src="${entry.icon}" alt=""><div><strong>${escapeHtml(entry.name)}</strong><small>${entry.category} · ${entry.rarity} · Level ${level}</small></div></div><h4>Pactspirit overview</h4><p>${escapeHtml(entry.description)}</p>${entry.rarity!=="Magic"?`<p>Unlock ${entry.rarity==="Legendary"?2:1} Pact Node${entry.rarity==="Legendary"?"s":""} in advance</p>`:""}${outer?`<section class="pact-tooltip-feature"><img src="${outer.icon}" alt=""><strong>${escapeHtml(outer.name)}</strong></section>`:""}<h4>Level ${level} bonuses</h4>${rewards.length?`<ul class="pact-tooltip-rewards">${rewards.map((effect)=>`<li>${modifierTextMarkup(effect)}</li>`).join("")}</ul>`:'<p>No level bonus listed.</p>'}<footer>Click to change · Right-click to remove</footer>`};
  }
  if(element.matches(".hero-memory-socket.filled,.hero-memory-item"))return heroMemoryTooltipContent(element);
  if(element.matches(".slate-piece,.crafted-slate-item"))return slateTooltipContent(element);
  if(element.matches("[data-follower-skill-tooltip]")){ const traitHtml=followerSkillTooltipHtml(element.dataset.followerSkillTooltip,{state:plannerState,planner:currentPlanner()}); return traitHtml?{traitHtml,rarity:followerTooltipRarity({state:plannerState,skillName:element.dataset.followerSkillTooltip}),followerTooltip:true}:null; }
  if(element.matches("[data-follower-tooltip]")){ const rarityId=element.dataset.followerTooltipRarity||null, traitHtml=followerTooltipHtml(element.dataset.followerTooltip,{state:plannerState,planner:currentPlanner(),rarityId}); return traitHtml?{traitHtml,rarity:followerTooltipRarity({state:plannerState,followerId:element.dataset.followerTooltip,rarityId}),followerTooltip:true}:null; }
  if(element.matches("[data-hero-trait-tooltip]")){
    const hero=heroById(plannerState.hero.selectedHeroId), trait=hero&&allHeroTraitsSs13[hero.id]?.traits.find((item)=>item.name===element.dataset.heroTraitTooltip);
    if(!trait)return null;
    const levelKey=element.dataset.heroTraitLevelKey||"base";
    const traitLevel=heroTraitTooltipLevel(levelKey);
    const emphasize=(line)=>{
      const progression=/\(([^()]*(?:\/)[^()]*)\)(%?)/g;
      let html="", offset=0;
      for(const match of line.matchAll(progression)){
        html+=traitKeywordTextHtml(hero.id,line.slice(offset,match.index));
        const values=match[1].split("/"), activeIndex=Math.min(values.length-1,traitLevel-1);
        html+=`<span class="trait-progression">(${values.map((value,index)=>`<${index===activeIndex?"b":"span"} class="${index===activeIndex?"trait-current-value":"trait-other-value"}">${escapeHtml(value.trim())}</${index===activeIndex?"b":"span"}>`).join('<span class="trait-separator">/</span>')})${escapeHtml(match[2])}</span>`;
        offset=match.index+match[0].length;
      }
      return html+traitKeywordTextHtml(hero.id,line.slice(offset));
    };
    const description=levelKey==="base"?baseTraitDescriptionForLevel(hero.id,trait.description):trait.description;
    const descriptionLines=description.split("\n").filter(Boolean);
    const visibleLines=withoutArtificialMoonLines(hero.id,descriptionLines);
    const selected=element.getAttribute("aria-pressed")==="true";
    return { traitHtml:`<div class="hero-trait-tooltip-head"><strong>${escapeHtml(trait.name)}</strong>${coverageBadge(heroTraitCoverage(hero.id,trait.name,visibleLines,selected),heroTraitCoverageReason(hero.id,trait.name,descriptionLines,selected))}<em>Level ${traitLevel}</em></div><small class="hero-trait-unlock">Unlocks at hero level ${trait.level}</small><div class="hero-trait-effects">${visibleLines.map((line)=>`<p>${emphasize(line)}</p>`).join("")}${String(levelKey).endsWith(":extra")?`<p>${escapeHtml(EXTRA_ROW_NOTE)}</p>`:""}${trait.name==="Sing with the Tide"?`<p>Damage effects use the current base trait level. Bard state is assumed; bubbles, movement, Tide duration and state switching are excluded from this tag.</p>`:trait.name==="Murmurs of the Distant Tide"?`<p>Additional Tide Effect scales the Tide damage bonuses in the stat sheet and damage path. Bard state is assumed; reduced Tide duration is ignored.</p>`:trait.name==="Idyll of the Tide"?`<p>Stat sheet and damage path use the Idyll stack count set in Combat, defaulting to 15. Stack buildup and loss are not simulated.</p>`:trait.name==="Wave Aria"?`<p>Damage component is included in calculations. Tide placement and duration are outside this badge’s scope.</p>`:""}</div>${traitKeywordDetailsHtml(hero.id,visibleLines)}<small class="hero-trait-source">TLIDB · CURRENT TRAIT LEVEL ${traitLevel}</small>` };
  }
  if(element.matches(".skill-primary-socket,.skill-support-socket,[data-skill-tooltip],[data-support-tooltip]"))return skillTooltipContent(element);
  if (element.matches(".talent-node")) {
    const panel=currentTalentPanel(),installed=(plannerState.talents.prismInventory||[]).find((item)=>item.id===plannerState.talents.installedPrisms?.[panel.name]);
    const prismCoordinate=plannerState.talents.installedPrismNodes?.[panel.name];
    if(installed&&prismCoordinate===element.dataset.coordinate)return {prismHtml:prismTooltipHtml(installed)};
    const nodes=talentDisplayNodes(panel),node=nodes.find((item) => item.coordinate.join(",") === element.dataset.coordinate);
    if(!node)return null;
    const rank = talentRanks.get(panel.name + ":" + node.coordinate) || 0;
    const effects = node.effectsPerRank || node.effects || {};
    const type=node.type||"micro",max=node.maxRank||(node.effectsPerRank?3:1),title=node.placeholder?`${titleCase(type)} Talent`:nodeTitle(node);
    const icon=element.querySelector(".talent-node-art")?.getAttribute("src");
    const inverseMultiplier=node.reflectedFrom?inverseImageEffectMultiplier(installed,type):1;
    const effectRows=Object.entries(effects).map(([key,value])=>`<div class="basic-talent-effect"><span>${escapeHtml(effectLabel(key))}</span><strong>${escapeHtml(formatEffect(key,typeof value==="number"?value*(node.effectsPerRank?rank:1)*inverseMultiplier:value))}</strong>${coverageBadge(talentEffectCoverage(key,value,rank))}</div>`).join("");
    let prismEffects="";
    if(installed&&prismCoordinate&&element.classList.contains("prism-affected-node")){
      if(installed.type==="inverse"){
        const roll=inverseImageRoll(installed,type==="legendary"?"legendary":type==="medium"?"medium":"micro");
        prismEffects=node.reflectedFrom
          ? `<section class="basic-talent-prism"><h4>Inverse Image <span>Reflected from ${escapeHtml(node.reflectedFrom)}</span></h4><div class="talent-prism-affix ${rank>0?"active":"inactive"}"><b>Fixed affix</b><p>${escapeHtml(titleCase(type))} Talent Effect Range: ${roll>0?"+":""}${roll}%</p><small>${rank>0?"Active on this reflected talent":"Allocate this reflected talent to activate"}</small></div></section>`
          : "";
      }else{
        const bounds=prismAreaBounds(installed,prismCoordinate);
        const activeLegendaryCount=nodes.filter((candidate)=>candidate.type==="legendary"&&candidate.coordinate.join(",")!==prismCoordinate&&candidate.coordinate[0]>=bounds.left&&candidate.coordinate[0]<bounds.left+bounds.width&&candidate.coordinate[1]>=bounds.top&&candidate.coordinate[1]<bounds.top+bounds.height&&(talentRanks.get(`${panel.name}:${candidate.coordinate}`)||0)>0).length;
        const affixes=prismNodeAffixes(installed,node.type,rank,activeLegendaryCount);
        prismEffects=`<section class="basic-talent-prism"><h4>Prism effects <span>${escapeHtml(prismName(installed))}</span></h4>${affixes.length?affixes.map((affix)=>`<div class="talent-prism-affix ${affix.active?"active":"inactive"}"><b>${affix.tier} affix</b><p>${modifierTextMarkup(affix.effect)} ${coverageBadge(affix.active?prismAffixCoverage(installed,affix.tier==="Rare"?"rareAffix":"legendaryAffix"):"Inactive")}</p><small>${escapeHtml(affix.reason)}</small></div>`).join(""):'<p class="talent-prism-none">No node-specific affix applies to this talent.</p>'}</section>`;
      }
    }
    return {basicTalentHtml:`<div class="basic-talent-head"><span class="basic-talent-icon">${icon?`<img src="${escapeHtml(icon)}" alt="">`:"✦"}</span><div><small>${escapeHtml(type==="legendary"?"Legendary Medium Talent":`${titleCase(type)} Talent`)}</small><strong>${escapeHtml(title)}</strong></div><b>${rank}/${max}</b></div><div class="basic-talent-body">${effectRows||`<p>${modifierTextMarkup(node.description?talentEffectText(node.description,rank,inverseMultiplier):"Profession-tree node")}</p>${coverageBadge(talentLineCoverage(node.description||"",rank>0))}`}</div>${prismEffects}<footer>${rank>0?"Allocated":element.classList.contains("locked")?"Locked · prerequisites not met":"Click to allocate"}</footer>`};
  }
  if (element.matches(".equipment-item,.inventory-item")) return gearTooltipContent(element);
  if (element.matches(".skill-setup")) {
    const skill = currentEditedSetups()[Number(element.dataset.skillIndex)];
    return { title: skill.name + " · Lv." + skill.effectiveLevel, body: [skillRoleLabels[skill.role], "Energy: " + skill.energyCost, ...skill.supports.map((support) => (support.enabled ? "● " : "○ ") + support.name + " Lv." + support.level)].join("\n") };
  }
  if (element.matches(".slate-chip")) {
    const slate = selenaScorchingBeamSlatesSs13.slates.find((item) => item.id === element.dataset.slateId);
    return { title: slate.name + " · Lv." + slate.level, body: [slate.authority, ...(slate.fixed || []), ...(slate.brands || []), ...(slate.copiedTalents || []), slate.copyRule].filter(Boolean).join("\n") };
  }
  const title = element.querySelector("h2,h3,strong")?.textContent?.trim() || "Planner detail";
  const body = element.textContent.replace(/\s+/g, " ").trim();
  return { title, body };
}
function positionPlannerTooltip(x, y) {
  tooltipAnchorX=x;tooltipAnchorY=y;
  const tooltip = $("#planner-tooltip");
  const inventoryCard=tooltipAnchorElement?.closest?.("#equipment-inventory .inventory-item");
  if(inventoryCard){
    const card=inventoryCard.getBoundingClientRect();
    const width=tooltip.offsetWidth;
    const left=card.left-width-12>=10?card.left-width-12:Math.min(window.innerWidth-width-10,card.right+12);
    const top=Math.min(Math.max(10,card.top),Math.max(10,window.innerHeight-tooltip.offsetHeight-12));
    tooltip.style.left=Math.max(10,left)+"px";
    tooltip.style.top=top+"px";
    return;
  }
  const left = Math.min(window.innerWidth - 370, x + 18);
  const top = Math.min(window.innerHeight - tooltip.offsetHeight - 12, y + 18);
  tooltip.style.left = Math.max(10, left) + "px";
  tooltip.style.top = Math.max(10, top) + "px";
}
let tooltipPositionFrame = 0;
let pendingTooltipX = 0, pendingTooltipY = 0;
function scheduleTooltipPosition(x, y) {
  pendingTooltipX = x; pendingTooltipY = y;
  if (tooltipPositionFrame) return;
  tooltipPositionFrame = requestAnimationFrame(() => {
    tooltipPositionFrame = 0;
    if (tooltipAnchorElement) positionPlannerTooltip(pendingTooltipX, pendingTooltipY);
  });
}
let damageSourceTooltipHideTimer;
function showPlannerTooltip(element, x, y) {
  clearTimeout(damageSourceTooltipHideTimer);
  if (!document.body.classList.contains("unified-planner") && !element.matches("[data-damage-source],[data-qol-help]")) return;
  const previousRenderPass = renderPassPlanner;
  renderPassPlanner = currentPlanner();
  let content;
  try { content = plannerTooltipContent(element); }
  finally { renderPassPlanner = previousRenderPass; }
  if(!content) return hidePlannerTooltip();
  const actionHint = element.getAttribute("title") || element.dataset.tooltipHint;
  if (element.hasAttribute("title")) {
    element.dataset.tooltipHint = actionHint;
    element.removeAttribute("title");
  }
  tooltipAnchorElement=element;
  const tooltip = $("#planner-tooltip");
  const host=element.closest("#slate-inventory,#hero-memory-selector,#follower-selector")||document.body;
  if(tooltip.parentElement!==host)host.appendChild(tooltip);
  if(content.rarity)tooltip.dataset.rarity=content.rarity;
  else delete tooltip.dataset.rarity;
  tooltip.classList.toggle("six-affix",Boolean(content.sixAffix));
  tooltip.classList.toggle("priceless-item",Boolean(content.priceless));
  tooltip.classList.toggle("item-level-100",Boolean(content.itemLevel100));
  tooltip.classList.toggle("gear-tooltip",Boolean(content.html));
  tooltip.classList.toggle("skill-tooltip",Boolean(content.skillHtml));
  tooltip.classList.toggle("support-tooltip",Boolean(content.supportTooltip));
  tooltip.classList.toggle("aura-tooltip",Boolean(content.auraTooltip));
  tooltip.classList.toggle("sage-scent-tooltip",Boolean(content.scentHtml));
  tooltip.classList.toggle("hero-trait-tooltip",Boolean(content.traitHtml));
  tooltip.classList.toggle("memory-tooltip",Boolean(content.memoryHtml));
  tooltip.classList.toggle("follower-tooltip",Boolean(content.followerTooltip));
  tooltip.classList.toggle("slate-tooltip",Boolean(content.slateHtml));
  tooltip.classList.toggle("pact-tooltip",Boolean(content.pactHtml));
  tooltip.classList.toggle("qol-help-tooltip",Boolean(content.qolHtml));
  tooltip.classList.toggle("prism-tooltip",Boolean(content.prismHtml));
  tooltip.classList.toggle("basic-talent-tooltip",Boolean(content.basicTalentHtml));
  tooltip.classList.toggle("damage-source-tooltip",element.matches("[data-damage-source]"));
  const sourceSummary = element.matches("[data-damage-source]") && !Object.keys(content).some((key) => key.endsWith("Html") || key === "html");
  tooltip.classList.toggle("source-summary-tooltip", sourceSummary);
  tooltip.dataset.talentType=content.basicTalentHtml?content.talentType||element.dataset.nodeType||"micro":"";
  tooltip.innerHTML=content.qolHtml||content.basicTalentHtml||content.prismHtml||content.pactHtml||content.slateHtml||content.memoryHtml||content.html||content.skillHtml||content.traitHtml||content.scentHtml||`<strong>${escapeHtml(content.title)}</strong><span>${escapeHtml(content.body)}</span><small>${sourceSummary ? "Source breakdown · scroll for more" : "Click to edit"}</small>`;
  if (actionHint) tooltip.insertAdjacentHTML("beforeend", `<small class="planner-tooltip-action-hint">${escapeHtml(actionHint)}</small>`);
  tooltip.setAttribute("aria-hidden", "false");
  tooltip.classList.add("visible");
  tooltipAnchorX=x;tooltipAnchorY=y;
  positionPlannerTooltip(x, y);
}
function hidePlannerTooltip() {
  clearTimeout(damageSourceTooltipHideTimer);
  tooltipAnchorElement=null;
  $("#planner-tooltip").classList.remove("visible");
  $("#planner-tooltip").setAttribute("aria-hidden", "true");
}
function setRevivalAltDetails(visible){
  document.body.classList.toggle("revival-alt-held",visible);
  if($("#planner-tooltip").classList.contains("visible"))requestAnimationFrame(()=>positionPlannerTooltip(tooltipAnchorX,tooltipAnchorY));
}
window.addEventListener("keydown",(event)=>{if(event.key==="Alt")setRevivalAltDetails(true);});
window.addEventListener("keyup",(event)=>{if(event.key==="Alt")setRevivalAltDetails(false);});
window.addEventListener("blur",()=>setRevivalAltDetails(false));

let tooltipScrollQuietUntil = 0;
window.addEventListener("scroll", (event) => {
  if (event.target instanceof Element && event.target.closest("#planner-tooltip")) return;
  tooltipScrollQuietUntil = performance.now() + 160;
  hidePlannerTooltip();
}, { passive: true, capture: true });

document.addEventListener("pointerover", (event) => {
  if (performance.now() < tooltipScrollQuietUntil) return;
  const target = event.target.closest(tooltipSelector);
  if (target && !target.contains(event.relatedTarget) && !(event.pointerType === "touch" && target.matches("[data-qol-help]"))) showPlannerTooltip(target, event.clientX, event.clientY);
});
document.addEventListener("pointermove", (event) => {
  if (event.target.closest("#planner-tooltip.damage-source-tooltip")) return;
  if(gearDrag&&event.pointerId===gearDrag.pointerId){
    const dx=event.clientX-gearDrag.startX,dy=event.clientY-gearDrag.startY;
    if(!gearDrag.moved&&Math.hypot(dx,dy)>=5){
      gearDrag.moved=true;
      gearDrag.element.classList.add("gear-drag-source");
      gearDrag.ghost=document.createElement("div");
      gearDrag.ghost.className="gear-drag-ghost";
      gearDrag.ghost.innerHTML=`<img src="${gearIcon(gearDrag.item)}" alt=""><span>${escapeHtml(gearDrag.item.name)}</span>`;
      document.body.append(gearDrag.ghost);
      document.querySelectorAll("#equipment-grid [data-equipment-slot]").forEach((slot)=>slot.classList.toggle("gear-drop-eligible",canDropGearInSlot(gearDrag.item,slot.dataset.equipmentSlot)));
      if(gearDrag.fromSlot)$("#equipment-inventory").classList.add("gear-drop-eligible");
      hidePlannerTooltip();
    }
    if(gearDrag.moved){
      event.preventDefault();
      gearDrag.ghost.style.left=`${event.clientX+14}px`;
      gearDrag.ghost.style.top=`${event.clientY+14}px`;
      const pointed=document.elementFromPoint(event.clientX,event.clientY);
      const slot=pointed?.closest("#equipment-grid [data-equipment-slot]");
      const target=slot&&canDropGearInSlot(gearDrag.item,slot.dataset.equipmentSlot)?slot:gearDrag.fromSlot?pointed?.closest("#equipment-inventory"):null;
      gearDrag.target?.classList.remove("gear-drop-target");
      gearDrag.target=target||null;
      gearDrag.target?.classList.add("gear-drop-target");
    }
  }
  if (skillDrag && event.pointerId === skillDrag.pointerId) {
    const dx = event.clientX - skillDrag.startX, dy = event.clientY - skillDrag.startY;
    if (!skillDrag.moved && Math.hypot(dx, dy) >= 5) {
      skillDrag.moved = true;
      skillDrag.element.classList.add("skill-dragging");
      hidePlannerTooltip();
    }
    if (skillDrag.moved) {
      event.preventDefault();
      skillDrag.element.style.transform = `translate(${dx}px, ${dy}px)`;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("#skill-groups [data-skill-board-row]");
      skillDrag.target?.classList.remove("skill-drop-target");
      skillDrag.target = target || null;
      skillDrag.target?.classList.add("skill-drop-target");
    }
  }
  if(supportDrag&&event.pointerId===supportDrag.pointerId){
    const dx=event.clientX-supportDrag.startX,dy=event.clientY-supportDrag.startY;
    if(!supportDrag.moved&&Math.hypot(dx,dy)>=5){
      supportDrag.moved=true;
      document.body.classList.add("support-dragging");
      supportDrag.element.classList.toggle("support-drag-source",!supportDrag.duplicate);
      supportDrag.ghost=supportDrag.element.cloneNode(true);
      supportDrag.ghost.className=`support-drag-ghost${supportDrag.duplicate?" copying":""}`;
      document.body.append(supportDrag.ghost);
      hidePlannerTooltip();
    }
    if(supportDrag.moved){
      event.preventDefault();
      supportDrag.ghost.style.left=`${event.clientX}px`;
      supportDrag.ghost.style.top=`${event.clientY}px`;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest("#skill-groups .skill-support-socket:not(:disabled)");
      supportDrag.target?.classList.remove("support-drop-target");
      supportDrag.target=target||null;
      supportDrag.target?.classList.add("support-drop-target");
    }
  }
  if(kismetDrag&&event.pointerId===kismetDrag.pointerId){
    const dx=event.clientX-kismetDrag.startX,dy=event.clientY-kismetDrag.startY;
    if(!kismetDrag.moved&&Math.hypot(dx,dy)>=5){
      kismetDrag.moved=true;
      kismetDrag.element.classList.add("kismet-drag-source");
      kismetDrag.ghost=document.createElement("div");
      kismetDrag.ghost.className="kismet-drag-ghost";
      kismetDrag.ghost.innerHTML=`<img src="${kismetDrag.icon}" alt=""><b>+</b>`;
      kismetDrag.ghost.style.width=`${kismetDrag.element.offsetWidth}px`;
      kismetDrag.ghost.style.height=`${kismetDrag.element.offsetHeight}px`;
      document.body.append(kismetDrag.ghost);
      hidePlannerTooltip();
    }
    if(kismetDrag.moved){
      event.preventDefault();
      kismetDrag.ghost.style.left=`${event.clientX-kismetDrag.ghost.offsetWidth/2}px`;
      kismetDrag.ghost.style.top=`${event.clientY-kismetDrag.ghost.offsetHeight/2}px`;
      const pointed=document.elementFromPoint(event.clientX,event.clientY);
      const candidate=pointed?.closest(".pact-tree-node[data-kismet-node]");
      const target=candidate&&candidate.dataset.kismetKind===kismetDrag.kind&&(candidate.classList.contains("pact-tree-extra")||candidate.getAttribute("aria-pressed")==="true")?candidate:null;
      kismetDrag.target?.classList.remove("kismet-drop-target");
      kismetDrag.target=target;
      target?.classList.add("kismet-drop-target");
    }
  }
  if(selenaDanceDrag&&event.pointerId===selenaDanceDrag.pointerId){
    const dx=event.clientX-selenaDanceDrag.startX,dy=event.clientY-selenaDanceDrag.startY;
    if(!selenaDanceDrag.moved&&Math.hypot(dx,dy)>=5){
      selenaDanceDrag.moved=true;
      hidePlannerTooltip();
      selenaDanceDrag.element.classList.add("selena-dance-drag-source");
      selenaDanceDrag.ghost=document.createElement("div");
      selenaDanceDrag.ghost.className="kismet-drag-ghost";
      selenaDanceDrag.ghost.innerHTML=`<img src="${selenaDanceDrag.icon}" alt="">`;
      selenaDanceDrag.ghost.style.width=`${selenaDanceDrag.element.offsetWidth}px`;
      selenaDanceDrag.ghost.style.height=`${selenaDanceDrag.element.offsetHeight}px`;
      document.body.append(selenaDanceDrag.ghost);
      // Legal rows: after the move or swap every trait still sits in a later row than its prerequisite.
      const rules=heroTreeRules(plannerState.hero), rows=heroTreeSelections(plannerState.hero);
      document.querySelectorAll("#hero-trait-tree [data-selena-dance-row]").forEach((rowElement)=>{
        const row=Number(rowElement.dataset.selenaDanceRow);
        if(row===selenaDanceDrag.from)return;
        const legal=!rules.move(rows,selenaDanceDrag.from,row).error;
        rowElement.classList.add(legal?"selena-dance-drop-eligible":"selena-dance-drop-blocked");
      });
    }
    if(selenaDanceDrag.moved){
      event.preventDefault();
      selenaDanceDrag.ghost.style.left=`${event.clientX-selenaDanceDrag.ghost.offsetWidth/2}px`;
      selenaDanceDrag.ghost.style.top=`${event.clientY-selenaDanceDrag.ghost.offsetHeight/2}px`;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest("#hero-trait-tree .selena-dance-drop-eligible")||null;
      selenaDanceDrag.target?.classList.remove("selena-dance-drop-target");
      selenaDanceDrag.target=target;
      target?.classList.add("selena-dance-drop-target");
    }
  }
  if(prismDrag&&event.pointerId===prismDrag.pointerId){
    const dx=event.clientX-prismDrag.startX,dy=event.clientY-prismDrag.startY;
    if(!prismDrag.moved&&Math.hypot(dx,dy)>=5){prismDrag.moved=true;prismDrag.element.classList.add("prism-dragging");prismDrag.sourceNode?.classList.add("prism-source-revealed");hidePlannerTooltip();}
    if(prismDrag.moved){
      event.preventDefault();
      prismDrag.element.style.transform=`translate(${dx}px, ${dy}px)`;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest("#talent-stage .talent-node[data-coordinate]");
      prismDrag.target?.classList.remove("prism-drop-target");
      prismDrag.target=target&&target!==prismDrag.element?target:null;
      prismDrag.target?.classList.add("prism-drop-target");
    }
  }
  if ($("#planner-tooltip").classList.contains("visible")) scheduleTooltipPosition(event.clientX, event.clientY);
  if(slatePendingDrop)positionPendingSlate(event.clientX,event.clientY);
  if(slateDrag&&event.pointerId===slateDrag.pointerId){
    const dx=event.clientX-slateDrag.startX,dy=event.clientY-slateDrag.startY;
    if(!slateDrag.moved&&Math.hypot(dx,dy)>=4){ slateDrag.moved=true; slateDrag.element.classList.add("dragging"); hidePlannerTooltip(); }
    if(slateDrag.moved){ event.preventDefault(); slateDrag.element.style.transform=`translate(${dx}px, ${dy}px)`; }
  }
});

function positionPendingSlate(clientX,clientY){
  if(!slatePendingDrop)return;
  const piece=document.querySelector(`.divinity-board .slate-piece[data-slate-id="${CSS.escape(slatePendingDrop.id)}"]`),board=piece?.closest(".divinity-board"); if(!piece||!board)return;
  const rect=board.getBoundingClientRect();
  piece.classList.add("pending-drop");
  piece.style.left=`${clientX-rect.left-piece.offsetWidth/2}px`;
  piece.style.top=`${clientY-rect.top-piece.offsetHeight/2}px`;
}

function pickUpTransformedSlate(slate,current,candidate,clientX,clientY,action){
  slatePendingDrop={id:slate.id,original:{...current},transformed:candidate,action};
  slatePlacements={...slatePlacements,[slate.id]:candidate};
  selectedSlateId=null;
  slateToolsPosition=null;
  if($("#slate-editor").open)$("#slate-editor").close();
  renderSlates();
  positionPendingSlate(clientX,clientY);
  showToast(`Move the ${action} slate and click to place it`);
}

function finishPendingSlateDrop(event){
  if(!slatePendingDrop)return false;
  const pending=slatePendingDrop,stage=document.querySelector("#slate-board .slate-stage"),board=stage?.querySelector(".divinity-board"),slate=slatesForBoard().find((item)=>item.id===pending.id);
  let candidate=null;
  const boardRect=board?.getBoundingClientRect(),stageRect=stage?.getBoundingClientRect();
  const overBoard=boardRect&&event.clientX>=boardRect.left&&event.clientX<=boardRect.right&&event.clientY>=boardRect.top&&event.clientY<=boardRect.bottom;
  const overStage=stageRect&&event.clientX>=stageRect.left&&event.clientX<=stageRect.right&&event.clientY>=stageRect.top&&event.clientY<=stageRect.bottom;
  if(overBoard&&slate){ const cell=boardRect.width/6,[width,height]=slateSize(slate,pending.transformed.rotation,pending.transformed.flipX||1,pending.transformed.flipY||1); candidate={...pending.transformed,column:Math.round((event.clientX-boardRect.left-width*cell/2)/cell)+1,row:Math.round((event.clientY-boardRect.top-height*cell/2)/cell)+1}; }
  slatePendingDrop=null;
  if(candidate&&canPlaceSlate(slate,candidate,slatePlacements,slatesForBoard())){ slatePlacements={...slatePlacements,[pending.id]:candidate}; persistPlannerState(); showToast(`${pending.action} slate placed`); }
  else if(slate&&overStage&&!overBoard){
    const cell=boardRect.width/6,[width,height]=slateSize(slate,pending.transformed.rotation,pending.transformed.flipX||1,pending.transformed.flipY||1),w=width*cell,h=height*cell;
    const x=Math.max(0,Math.min(stageRect.width-w,event.clientX-stageRect.left-w/2)),y=Math.max(0,Math.min(stageRect.height-h,event.clientY-stageRect.top-h/2));
    parkedSlates={...parkedSlates,[pending.id]:{x:Math.round(x/stageRect.width*10000)/100,y:Math.round(y/stageRect.height*10000)/100,rotation:pending.transformed.rotation||0,flipX:pending.transformed.flipX||1,flipY:pending.transformed.flipY||1}};
    equippedSlateIds.delete(pending.id);const next={...slatePlacements};delete next[pending.id];slatePlacements=next;
    persistPlannerState();showToast("Slate parked beside the grid");
  }
  else { slatePlacements={...slatePlacements,[pending.id]:pending.original}; renderSlates(); showToast("Invalid drop · slate restored"); }
  return true;
}
document.addEventListener("pointerout", (event) => {
  const target = event.target.closest(tooltipSelector);
  if (target && !target.contains(event.relatedTarget) && !(event.pointerType === "touch" && target.matches("[data-qol-help]"))) {
    if (target.matches("[data-damage-source]")) damageSourceTooltipHideTimer = setTimeout(hidePlannerTooltip, 180);
    else hidePlannerTooltip();
  }
});
$("#planner-tooltip").addEventListener("pointerenter", () => clearTimeout(damageSourceTooltipHideTimer));
$("#planner-tooltip").addEventListener("pointerleave", (event) => {
  if (!tooltipAnchorElement?.contains(event.relatedTarget)) hidePlannerTooltip();
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest(tooltipSelector);
  if (target) { const box = target.getBoundingClientRect(); showPlannerTooltip(target, box.right, box.top); }
});
document.addEventListener("focusout", (event) => {
  if (event.target.closest(tooltipSelector)) hidePlannerTooltip();
});
// Section "?" help: hover and keyboard focus show it (above); a tap, pen click or Enter / Space toggles it
// (a mouse click only shows it, since hovering already did). Whether it was open is read at pointerdown.
let qolHelpOpenAtPointerDown = null;
document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest?.("[data-qol-help]");
  qolHelpOpenAtPointerDown = button ? event.pointerType !== "mouse" && tooltipAnchorElement === button && $("#planner-tooltip").classList.contains("visible") : null;
}, true);
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-qol-help]");
  if (!button) return;
  event.preventDefault();
  const open = qolHelpOpenAtPointerDown ?? (tooltipAnchorElement === button && $("#planner-tooltip").classList.contains("visible"));
  qolHelpOpenAtPointerDown = null;
  if (open) hidePlannerTooltip();
  else { const box = button.getBoundingClientRect(); showPlannerTooltip(button, box.right, box.top); }
});

document.addEventListener("input", (event) => {
  if(event.target.matches("[data-pactspirit-search]")){renderPactspiritSelector();return;}
  if(event.target.matches("[data-affix-roll-number]")){
    const number=event.target, range=number.closest(".affix-roll-inputs")?.querySelector('input[type="range"]');
    if(range){ const value=Number(number.value), min=Number(number.min), max=Number(number.max); if(Number.isFinite(value)&&value>=min&&value<=max){ range.value=String(value); range.dispatchEvent(new Event("input",{bubbles:true})); } }
    return;
  }
  if(event.target.matches('[data-legendary-roll],[data-edit-legendary-roll],[data-modifier-roll],[data-base-affix-roll],[data-craft-affix-roll]')){
    updateNegativeRollVisual(event.target);
    const number=event.target.closest(".affix-roll-inputs")?.querySelector("[data-affix-roll-number]"); if(number)number.value=event.target.value;
  }
  if (event.target.matches("[data-legendary-search]")) {
    equipmentSearch=event.target.value; renderEquipmentCrafter();
    const search=$("[data-legendary-search]"); search?.focus(); search?.setSelectionRange(equipmentSearch.length,equipmentSearch.length);
  }
  if(event.target.matches("[data-craft-type]")){
    const base=$("#equipment-crafter-body [data-craft-base]");
    if(base) base.innerHTML=equipmentCraftMode==="rare"?rareBaseOptions(event.target.value):`<option value="${escapeHtml(event.target.value)}">${escapeHtml(event.target.value)}</option>`;
    document.querySelectorAll("#equipment-crafter-body [data-craft-base-affix]").forEach((select,index)=>select.innerHTML=equipmentCraftMode==="rare"?baseAffixOptions(event.target.value):voraxBaseAffixOptions(event.target.value,index));
    document.querySelectorAll("#equipment-crafter-body [data-base-affix-rolls]").forEach((container)=>container.innerHTML="");
    document.querySelectorAll("#equipment-crafter-body [data-craft-affix-family]").forEach((select)=>{ const index=Number(select.dataset.craftAffixFamily); select.innerHTML=craftAffixFamilyOptions(event.target.value,index); updateCraftAffixConfig(index); });
    const sequenceField=document.querySelector("#equipment-crafter-body [data-tower-sequence-field]"), sequenceInput=sequenceField?.querySelector("[data-craft-sequence]"); if(sequenceField) sequenceField.hidden=!towerSequenceAllowed(event.target.value); if(sequenceInput)sequenceInput.innerHTML=towerSequenceOptions(event.target.value);
    const selectedSlot=event.target.selectedOptions[0]?.dataset.slot, energyField=document.querySelector("#equipment-crafter-body [data-equipment-energy-field]"), energyInput=energyField?.querySelector("[data-craft-energy]"); if(energyField) energyField.hidden=!equipmentEnergyAllowed(selectedSlot); if(energyInput)energyInput.value=String(maxEquipmentEnergy(document.querySelector("#equipment-crafter-body [data-craft-level]")?.value,selectedSlot,event.target.value));
    const blendField=document.querySelector("#equipment-crafter-body [data-belt-blend-field]"), blendSelect=blendField?.querySelector("[data-craft-belt-blend]"); if(blendField)blendField.hidden=selectedSlot!=="belt"; if(blendSelect&&selectedSlot!=="belt")blendSelect.value="";
    const corrosionSelect=document.querySelector("#equipment-crafter-body [data-craft-corrosion]"), corrosionRow=document.querySelector("#equipment-crafter-body [data-craft-corrosion-row]"); if(corrosionSelect){ corrosionSelect.innerHTML=craftCorrosionOptions(event.target.value); ["savedLines","savedChoice","rollTouched"].forEach((key)=>delete corrosionSelect.dataset[key]); } if(corrosionRow)corrosionRow.innerHTML="";
  }
  if(event.target.matches("[data-craft-corrosion]")){ const body=$("#equipment-crafter-body"), row=body?.querySelector("[data-craft-corrosion-row]"), saved=event.target.dataset.savedChoice===event.target.value&&!event.target.dataset.rollTouched?configuredCraftCorrosion(body)[0]:null; if(row)row.innerHTML=craftCorrosionRow(body.querySelector("[data-craft-type]")?.value,event.target.value,100,saved); updateCraftPreview(); }
  if(event.target.matches("[data-craft-corrosion-roll]")){ const body=$("#equipment-crafter-body"), select=body?.querySelector("[data-craft-corrosion]"); if(select)select.dataset.rollTouched="1"; const text=body?.querySelector("[data-craft-corrosion-text]"); if(text)text.textContent=configuredCraftCorrosion(body)[0]||""; updateCraftPreview(); }
  if(event.target.matches("[data-craft-base-affix]")){ const index=Number(event.target.dataset.craftBaseAffix), container=document.querySelector(`[data-base-affix-rolls="${index}"]`); if(container) container.innerHTML=baseAffixRollControls(index,event.target.value); }
  if(event.target.matches("[data-craft-affix-family]")){ updateCraftAffixConfig(Number(event.target.dataset.craftAffixFamily)); updateCraftPreview(); }
  if(event.target.matches("[data-craft-affix-tier]")){ const index=Number(event.target.dataset.craftAffixTier), body=$("#equipment-crafter-body"), family=craftAffixFamily(body,index), tier=family?.tiers.find((entry)=>entry.tier===event.target.value), rolls=body.querySelector(`[data-craft-affix-rolls="${index}"]`); if(rolls)rolls.innerHTML=craftAffixRollControls(index,tier); updateCraftPreview(); }
  if(event.target.matches("[data-craft-level]")){ const body=document.querySelector("#equipment-crafter-body"), energy=body?.querySelector("[data-craft-energy]"), type=body?.querySelector("[data-craft-type]"); if(energy&&type)energy.value=String(maxEquipmentEnergy(event.target.value,type.selectedOptions[0]?.dataset.slot,type.value)); }
  if(event.target.matches("[data-craft-level]")) document.querySelectorAll("#equipment-crafter-body [data-craft-affix-family]").forEach((select)=>{ const index=Number(select.dataset.craftAffixFamily), tier=document.querySelector(`[data-craft-affix-tier="${index}"]`)?.value; updateCraftAffixConfig(index,tier); });
  if(event.target.matches("[data-craft-name],[data-craft-level],[data-craft-type],[data-craft-base],[data-craft-energy],[data-craft-base-affix],[data-craft-belt-blend],[data-craft-sequence]")) updateCraftPreview();
  if(event.target.matches("[data-base-affix-roll]")){ event.target.closest("label")?.querySelector("em")?.replaceChildren(event.target.value); updateCraftPreview(); }
  if(event.target.matches("[data-craft-affix-roll]")){ event.target.closest("label")?.querySelector("em")?.replaceChildren(event.target.value); updateCraftPreview(); }
  if(event.target.matches("[data-legendary-base]")){ selectedLegendaryBase=event.target.value; if(towerSequenceById(selectedLegendaryTowerSequenceId)?.weaponType!==selectedLegendaryBase)selectedLegendaryTowerSequenceId=""; selectedCorrosionIndex=-1; renderEquipmentCrafter(); }
  if(event.target.matches("[data-legendary-belt-blend],[data-legendary-tower-sequence]")){ if(event.target.matches("[data-legendary-belt-blend]"))selectedLegendaryBeltBlendId=event.target.value; else selectedLegendaryTowerSequenceId=event.target.value; const selected=legendaryGearSs13[selectedLegendaryIndex], preview=$("#legendary-config-preview"), corrosion=configuredCorrosionModifier(); if(preview)preview.innerHTML=`<small>Preview</small>${equipmentPreview({...selected,base:selectedLegendaryBase,corrodedModifierIndices:[...selectedLegendaryCorrodedModifiers],modifiers:configuredLegendaryModifiersWithSpecials(),corrosionModifiers:corrosion?[corrosion]:[]})}`; }
  if(event.target.matches("[data-legendary-corrosion]")){ selectedCorrosionIndex=Number(event.target.value); renderEquipmentCrafter(); }
  if(event.target.matches("[data-edit-corrosion]")){ selectEditCorrosion(inventoryItems().find((entry)=>entry.id===selectedInventoryItemId),event.target.value); }
  if(event.target.matches("[data-edit-corrosion-roll]")){ const entry=editCorrosionEntry(inventoryItems().find((entry)=>entry.id===selectedInventoryItemId)); if(entry){ editingCorrosionImplicit={...editingCorrosionImplicit,percent:Number(event.target.value),lines:[interpolateCorrosionRoll(entry,event.target.value)]}; const text=event.target.closest("[data-edit-corrosion-row]")?.querySelector("[data-edit-corrosion-text]"); if(text)text.textContent=editingCorrosionImplicit.lines[0]; } }
  if(event.target.matches("[data-legendary-roll]")){ const index=Number(event.target.dataset.legendaryRoll), selected=legendaryGearSs13[selectedLegendaryIndex], control=event.target.closest(".legendary-mod-control"), sliders=[...control.querySelectorAll("[data-legendary-roll]")], text=resolveModifierRolls(legendaryModifierTemplate(selected,index),sliders.map((slider)=>slider.value)); control.querySelector("[data-legendary-mod]").innerHTML=modifierTextMarkup(text); event.target.closest("label").querySelector("em").textContent=event.target.value; const preview=$("#legendary-config-preview"), corrosion=configuredCorrosionModifier(); if(preview) preview.innerHTML=`<small>Preview</small>${equipmentPreview({...selected,base:selectedLegendaryBase,corrodedModifierIndices:[...selectedLegendaryCorrodedModifiers],modifiers:configuredLegendaryModifiersWithSpecials(),corrosionModifiers:corrosion?[corrosion]:[]})}`; }
  if(event.target.matches("[data-corrosion-roll]")){ const text=configuredCorrosionModifier(); $("[data-corrosion-text]").textContent=text; const selected=legendaryGearSs13[selectedLegendaryIndex], preview=$("#legendary-config-preview"); if(preview) preview.innerHTML=`<small>Preview</small>${equipmentPreview({...selected,base:selectedLegendaryBase,corrodedModifierIndices:[...selectedLegendaryCorrodedModifiers],modifiers:configuredLegendaryModifiersWithSpecials(),corrosionModifiers:[text]})}`; }
  if(event.target.matches("[data-edit-legendary-roll]")){ const index=Number(event.target.dataset.editLegendaryRoll), item=inventoryItems().find((entry)=>entry.id===selectedInventoryItemId), source=legendaryEditorSource(item)||legendaryGearSs13.find((entry)=>entry.name.toLowerCase()===(item?.name||"").replace(/ - Priceless$/i,"").toLowerCase()), control=event.target.closest(".legendary-mod-control"), sliders=[...control.querySelectorAll("[data-edit-legendary-roll]")], template=editingLegendaryModifierTemplate(source,index), text=resolveModifierRolls(template,sliders.map((slider)=>slider.value)); control.querySelector("[data-edit-modifier-text]").innerHTML=modifierTextMarkup(text); control.querySelector("[data-edit-modifier]").value=text; editingLegendaryTexts.set(index,text); event.target.closest("label").querySelector("em").textContent=event.target.value; }
});

function changeTalentRank(coordinate, delta, max=false) {
  const panel = currentTalentPanel();
  const displayNodes=talentDisplayNodes(panel);
  const node = displayNodes.find((item) => item.coordinate.join(",") === coordinate);
  if (!node) return;
  const prismCoordinate=plannerState.talents.installedPrisms?.[panel.name]?plannerState.talents.installedPrismNodes?.[panel.name]:null;
  const prism=(plannerState.talents.prismInventory||[]).find((item)=>item.id===plannerState.talents.installedPrisms?.[panel.name]);
  const prerequisiteFreeCoordinates=inverseImageReflectedCoordinates(prism,prismCoordinate);
  const layouts=activeTalentLayouts();
  const args = { panel:panel.name,node,graph:layouts[panel.name],layouts,ranks:Object.fromEntries(talentRanks),prismCoordinate,prerequisiteFreeCoordinates };
  if (delta > 0) {
    const allocation=max?allocateTalentToMaxWithPrerequisites(args):allocateTalentWithPrerequisites(args);
    if (!allocation.allowed) { showToast(allocation.reason); return; }
    talentRanks.clear();
    for(const [rankKey,rankValue] of Object.entries(allocation.ranks)) talentRanks.set(rankKey,rankValue);
    persistPlannerState();
    renderTalents(); render(); renderSkills(); renderConfiguration();
    return;
  }
  const rule = removeTalentWithDependents(args);
  if (!rule.allowed) { showToast(rule.reason); return; }
  talentRanks.clear();
  for(const [rankKey,rankValue] of Object.entries(rule.ranks)) talentRanks.set(rankKey,rankValue);
  persistPlannerState();
  renderTalents(); render(); renderSkills(); renderConfiguration();
}

function clearTalentTreeState(name) {
  if (!name) return;
  for (const key of [...talentRanks.keys()]) if (key.startsWith(name + ":")) talentRanks.set(key, 0);
  for (const key of Object.keys(plannerState.talents.coreSelections)) if (key.startsWith(name + ":")) delete plannerState.talents.coreSelections[key];
}

document.addEventListener("contextmenu", (event) => {
  if(kismetDrag?.moved){event.preventDefault();kismetDrag.duplicate=true;suppressKismetContextMenu=true;kismetDrag.ghost?.classList.add("copying");kismetDrag.element.classList.remove("kismet-drag-source");return;}
  if(suppressKismetContextMenu){event.preventDefault();return;}
  if(supportDrag){event.preventDefault();supportDrag.duplicate=true;suppressSupportContextMenu=true;supportDrag.ghost?.classList.add("copying");supportDrag.element.classList.remove("support-drag-source");return;}
  if(suppressSupportContextMenu){event.preventDefault();return;}
  const filledFollowerSlot=event.target.closest("[data-follower-skill-slot].filled");
  if(filledFollowerSlot){event.preventDefault();hidePlannerTooltip();commitFollower(setFollowerSkill(plannerState,Number(filledFollowerSlot.dataset.followerSkillSlot),null),"Skill slot cleared");return;}
  const allocatablePactNode=event.target.closest(".pact-tree-node[data-pact-node-allocate]");
  if(allocatablePactNode){
    event.preventDefault();
    if(allocatablePactNode.dataset.openFateSlot){
      if(allocatablePactNode.getAttribute("aria-pressed")==="true")openFateSlotSelector(allocatablePactNode.dataset.openFateSlot);
      else showToast("Allocate Undetermined Fate Slots first");
    }else if(allocatablePactNode.dataset.kismetNode)openKismetCrafter(allocatablePactNode.dataset.kismetNode,allocatablePactNode.dataset.kismetKind);
    return;
  }
  const fateNode=event.target.closest("[data-open-fate-slot]");
  if(fateNode){event.preventDefault();clearFateSlots(fateNode.dataset.openFateSlot);return;}
  const kismetNode=event.target.closest("[data-kismet-node]");
  if(kismetNode){event.preventDefault();if(plannerState.pacts.kismetSlotMode)openKismetCrafter(kismetNode.dataset.kismetNode,kismetNode.dataset.kismetKind);else clearKismetNode(kismetNode.dataset.kismetNode);return;}
  const equippedPact=event.target.closest(".pact-slot-select[data-pactspirit-name],.pact-slot-remove");
  if(equippedPact){event.preventDefault();removeSelectedPactspirit(Number(equippedPact.dataset.openPactspiritSelector??equippedPact.dataset.removePactspirit));return;}
  if(slateDrag){
    event.preventDefault();
    const slate=slatesForBoard().find((item)=>item.id===slateDrag.id); if(!slate)return;
    if(!slateTransformRules(slate).rotate){
      if(slate.template!=="Pedigree of Gods"&&slate.name!=="Pedigree of Gods")return;
      slateDrag.placement.flipX=-(slateDrag.placement.flipX||1);
    } else slateDrag.rotation=(slateDrag.rotation+90)%360;
    slateDrag.moved=true; slateDrag.element.classList.add("dragging"); hidePlannerTooltip();
    const flipX=slateDrag.placement.flipX||1,flipY=slateDrag.placement.flipY||1,[width,height]=slateSize(slate,slateDrag.rotation,flipX,flipY),offsets=slateOffsets(slate,slateDrag.rotation,flipX,flipY);
    slateDrag.element.style.setProperty("--slate-width",width);
    slateDrag.element.style.setProperty("--slate-height",height);
    slateDrag.element.style.setProperty("--slate-rotation",`${slateDrag.rotation}deg`);
    slateDrag.element.style.setProperty("--slate-flip-x",flipX);
    slateDrag.element.style.setProperty("--slate-flip-y",flipY);
    [...slateDrag.element.querySelectorAll(":scope>i")].forEach((cell,index)=>{ const [column,row]=offsets[index]; cell.style.setProperty("--piece-column",column); cell.style.setProperty("--piece-row",row); });
    return;
  }
  const memoryRow=event.target.closest("[data-memory-inventory-id]");
  if(memoryRow){
    event.preventDefault();
    const id=memoryRow.dataset.memoryInventoryId,memory=plannerState.hero.memoryInventory?.find((item)=>item.id===id);
    if(!memory)return;
    const tier=Object.keys(plannerState.hero.equippedMemoryIds||{}).find((key)=>plannerState.hero.equippedMemoryIds[key]===id);
    if(tier){unequipHeroMemory(tier);return;}
    if(plannerState.hero.baseTraitMemoryId===id){
      plannerState.hero.baseTraitMemoryId="";plannerState.hero.baseTraitMemoryRoll=null;
      hidePlannerTooltip();persistPlannerState();renderHeroTraitTree();renderHeroMemoryInventory();showToast("Base trait memory unequipped");return;
    }
    const openSlot=openHeroMemorySlot(memory,activeHeroMemoryTier==="base");
    if(openSlot==="base"){
      const slot=equippedBaseTraitSlot(plannerState.hero);
      plannerState.hero.baseTraitMemoryId=id;
      plannerState.hero.baseTraitMemoryRoll=slot.reductionRange.max;
      hidePlannerTooltip();persistPlannerState();renderHeroTraitTree();renderHeroMemoryInventory();showToast(`${toastText(memory.name)} equipped in base trait slot`);
    }else if(openSlot)equipHeroMemory(memory);
    else showToast("No open compatible memory slot");
    return;
  }
  const memorySocket=event.target.closest("[data-memory-tier]");
  if(memorySocket?.dataset.memoryTier==="base"&&plannerState.hero.baseTraitMemoryId){event.preventDefault();plannerState.hero.baseTraitMemoryId="";plannerState.hero.baseTraitMemoryRoll=null;persistPlannerState();renderHeroTraitTree();return;}
  if(memorySocket&&plannerState.hero.equippedMemoryIds?.[memorySocket.dataset.memoryTier]){
    event.preventDefault();unequipHeroMemory(memorySocket.dataset.memoryTier);return;
  }
  const carinoSupport=event.target.closest("[data-open-carino-ammo][data-support-tooltip]");
  if(carinoSupport){
    event.preventDefault(); hidePlannerTooltip();
    const index=Number(carinoSupport.dataset.openCarinoAmmo),name=plannerState.hero.carinoSpecialAmmoSupports?.[index];
    plannerState.hero.carinoSpecialAmmoSupports[index]="";
    persistPlannerState(); renderHeroTraitTree(); showToast(`${toastText(name||"Special Ammo support")} removed`); return;
  }
  const heroTraitSupport=event.target.closest("[data-hero-trait-support-id]");
  if(heroTraitSupport){
    event.preventDefault(); hidePlannerTooltip();
    const id=heroTraitSupport.dataset.heroTraitSupportId, name=plannerState.hero.heroTraitSupports?.[id];
    delete plannerState.hero.heroTraitSupports[id];
    delete plannerState.hero.heroTraitSupportLevels[id];
    delete plannerState.hero.heroTraitSupportConfigs[id];
    persistPlannerState(); renderHeroTraitTree(); showToast(`${toastText(name||"Trait support")} removed`); return;
  }
  const craftedSlateInventory=event.target.closest("[data-crafted-slate-inventory]");
  if(craftedSlateInventory){
    event.preventDefault();
    const id=craftedSlateInventory.dataset.craftedSlateInventory,slate=slatesForBoard().find((item)=>item.id===id),saved=(plannerState.slates?.inventory||[]).find((item)=>item.id===id),startRotation=slatePlacements[id]?.rotation??parkedSlates[id]?.rotation??saved?.rotation??0,flipX=slatePlacements[id]?.flipX??parkedSlates[id]?.flipX??saved?.flipX??1,flipY=slatePlacements[id]?.flipY??parkedSlates[id]?.flipY??saved?.flipY??1;
    const rotations=slateTransformRules(slate).rotate?[startRotation,0,90,180,270].filter((value,index,array)=>array.indexOf(value)===index):[0];
    let placement=null;
    for(const rotation of rotations){ for(let row=1;row<=6&&!placement;row+=1){ for(let column=1;column<=6;column+=1){ const candidate={column,row,rotation,flipX,flipY}; if(canPlaceSlate(slate,candidate,slatePlacements,slatesForBoard())){ placement=candidate; break; } } } if(placement)break; }
    if(placement){
      slatePlacements={...slatePlacements,[id]:placement};
      equippedSlateIds.add(id); delete parkedSlates[id];
      selectedSlateId=null; slateToolsPosition=null; slatePlacementTarget=null; slateEditMode=false;
      const listScroll=$("#slate-inventory .crafted-slate-list")?.scrollTop||0;
      renderSlateInventory();
      $("#slate-inventory .crafted-slate-list").scrollTop=listScroll;
      persistPlannerState();
      showToast(`${slate.name} placed on the grid`);
    }
    else if(parkSlateBesideGrid(slate,startRotation,flipX,flipY)){
      const next={...slatePlacements};delete next[id];slatePlacements=next;
      equippedSlateIds.delete(id);selectedSlateId=null;slateToolsPosition=null;
      const listScroll=$("#slate-inventory .crafted-slate-list")?.scrollTop||0;
      persistPlannerState();renderCandidateViews();renderSlateInventory();
      $("#slate-inventory .crafted-slate-list").scrollTop=listScroll;
      showToast(`${slate.name} placed beside the full grid`);
    } else showToast("No space is available beside the grid for that slate");
    return;
  }
  const nodeButton = event.target.closest(".talent-node[data-coordinate]");
  if (nodeButton) {
    event.preventDefault(); hidePlannerTooltip();
    if(pendingPrismPlacement)return;
    const panelName=currentTalentPanel().name;
    if(plannerState.talents.installedPrismNodes?.[panelName]===nodeButton.dataset.coordinate&&plannerState.talents.installedPrisms?.[panelName]){const item=plannerState.talents.prismInventory.find((entry)=>entry.id===plannerState.talents.installedPrisms[panelName]);clearInverseReflectedRanks(panelName,item,nodeButton.dataset.coordinate);delete plannerState.talents.installedPrisms[panelName];delete plannerState.talents.installedPrismNodes[panelName];if(item?.type==="inverse")reconcileTalentRanksAfterPrismChange(panelName);persistPlannerState();renderCandidateViews();showToast("Prism removed from talent node");return;}
    const coordinate=nodeButton.dataset.coordinate,empty=!(talentRanks.get(`${currentTalentPanel().name}:${coordinate}`)||0);
    changeTalentRank(coordinate,empty?1:-1,empty);
    return;
  }
  const equipment = event.target.closest("[data-equipment-slot]");
  if (equipment && !disabledEquipmentSlots.has(equipment.dataset.equipmentSlot)) {
    event.preventDefault(); disabledEquipmentSlots.add(equipment.dataset.equipmentSlot); persistPlannerState(); renderCandidateViews(); showToast(`${titleCase(equipment.dataset.equipmentSlot)} unequipped`); return;
  }
  const inventoryItem = event.target.closest("[data-equip-inventory]");
  if (inventoryItem) {
    event.preventDefault(); equipInventoryItem(inventoryItems().find((item)=>item.id===inventoryItem.dataset.equipInventory)); return;
  }
  const skillSocket = event.target.closest('[data-open-catalog="skill"]');
  if (skillSocket) {
    const board = selectorBoardSetups(); const setup = board[Number(skillSocket.dataset.selectorRow)];
    if (!setup) return;
    event.preventDefault();
    plannerState.skills.boardSlots=assignSkillBoardSlot(plannerState.skills.boardSlots,activeSkillBoardTab,board,Number(skillSocket.dataset.selectorRow),"");
    const setupKey=setupStateKey(setup), customIndex = plannerState.skills.customSetups.findIndex((item) => (item.instanceId||item.name) === setupKey);
    if (customIndex >= 0) plannerState.skills.customSetups.splice(customIndex, 1); else plannerState.skills.setupEnabled[setupKey] = false;
    delete plannerState.skills.customSupports[setupKey]; delete plannerState.skills.supportOrder[setupKey]; delete plannerState.skills.skillLevels[setupKey];
    persistPlannerState(); renderCandidateViews(); showToast(`${toastText(setup.name)} removed`); return;
  }
  const supportSocket = event.target.closest('[data-open-catalog="support"]');
  if (supportSocket) {
    const board = selectorBoardSetups(true); const setup = board[Number(supportSocket.dataset.selectorRow)]; const slot = Number(supportSocket.dataset.selectorSupportSlot);
    if (!setup) return;
    const setupKey=setupStateKey(setup), order = [...(plannerState.skills.supportOrder[setupKey] || userInstalledSupports(setup).map((support) => support.name))];
    const name = order[slot]; const support = setup.supports.find((item) => item.enabled && item.name === name);
    if (!support) return;
    event.preventDefault();
    if (support.custom) plannerState.skills.customSupports[setupKey] = (plannerState.skills.customSupports[setupKey] || []).filter((item) => item.name !== support.name);
    else plannerState.skills.supportEnabled[supportStateKey(setupKey, support.name)] = false;
    while (order.length < 5) order.push(""); order[slot] = ""; plannerState.skills.supportOrder[setupKey] = order.slice(0, 5);
    persistPlannerState(); renderCandidateViews(); showToast(`${toastText(support.name)} removed`); return;
  }
  const slate = event.target.closest("[data-slate-id]");
  if (slate && (equippedSlateIds.has(slate.dataset.slateId) || parkedSlates[slate.dataset.slateId])) {
    event.preventDefault(); const id = slate.dataset.slateId; equippedSlateIds.delete(id); delete parkedSlates[id]; const placements = {...slatePlacements}; delete placements[id]; slatePlacements = placements; persistPlannerState(); renderCandidateViews(); showToast("Slate removed"); return;
  }
  const core = event.target.closest("[data-core-slot]");
  if (core) {
    const panel = currentTalentPanel(); const key = `${panel.name}:${core.dataset.coreSlot}`;
    if (!plannerState.talents.coreSelections[key]) return;
    event.preventDefault(); delete plannerState.talents.coreSelections[key]; persistPlannerState(); renderCandidateViews(); showToast("Core talent removed"); return;
  }
  const tree = event.target.closest("[data-talent-slot]");
  if (tree) {
    const slot = Number(tree.dataset.talentSlot); if (!plannerState.talents.selectedTrees[slot]) return;
    event.preventDefault();
    for (let index = slot; index < plannerState.talents.selectedTrees.length; index += 1) {const name=plannerState.talents.selectedTrees[index];clearTalentTreeState(name);delete plannerState.talents.installedPrisms[name];delete plannerState.talents.installedPrismNodes[name];plannerState.talents.selectedTrees[index] = "";}
    persistPlannerState(); renderCandidateViews(); showToast("Talent tree removed"); return;
  }
  const spirit = event.target.closest("[data-pactspirit-name]");
  if (spirit && plannerState.pacts.activeSpirits[spirit.dataset.pactspiritName] !== false) {
    event.preventDefault(); plannerState.pacts.activeSpirits[spirit.dataset.pactspiritName] = false; persistPlannerState(); renderCandidateViews(); showToast(`${toastText(spirit.dataset.pactspiritName)} removed`);
  }
});

$("#inventory-item-dialog").addEventListener("click", (event) => {
  if (event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) event.currentTarget.close();
});

document.addEventListener("keydown",(event)=>{
  if(event.target.matches("select:not([data-native-select])")&&event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){ event.preventDefault(); openSearchableSelect(event.target,event.key); return; }
  if(!event.target.matches("#select-search-popover input"))return;
  if(event.key==="Escape"){ event.preventDefault(); closeSearchableSelect(); }
  if(event.key==="Enter"&&searchableSelectMatches.length){ event.preventDefault(); chooseSearchableOption(searchableSelectMatches[0].index); }
});
document.addEventListener("pointerdown",(event)=>{ if(event.target.matches("select:not([data-native-select])")&&event.button===0){ event.preventDefault(); event.target.focus(); openSearchableSelect(event.target); } });
document.addEventListener("input",(event)=>{ if(event.target.matches("#select-search-popover input"))renderSearchableSelectResults(event.target.value); });
document.addEventListener("click",(event)=>{
  if(event.target.closest("[data-close-select-search]")){closeSearchableSelect();return;}
  const result=event.target.closest("[data-select-search-index]"); if(result){ chooseSearchableOption(result.dataset.selectSearchIndex); return; }
  if(event.target.matches('input[type="number"]'))event.target.select();
  if(searchableSelectTarget&&!event.target.closest("#select-search-popover")&&!event.target.closest("select"))closeSearchableSelect();
});
document.addEventListener("focusin",(event)=>{ if(event.target.matches('input[type="number"]'))event.target.select(); });
document.querySelector(".loadout-tab")?.addEventListener("contextmenu",(event)=>{ if(event.target.closest(".loadout-tab-rename"))return; event.preventDefault(); startActiveBuildRename(event.currentTarget); });
document.querySelector(".loadout-tab")?.addEventListener("keydown",(event)=>{ if(event.target!==event.currentTarget||!isRenameKey(event))return; event.preventDefault(); startActiveBuildRename(event.currentTarget); });
document.addEventListener("keydown",(event)=>{
  if(!["Enter"," "].includes(event.key)||!event.target.matches(".pact-tree-node[data-pact-node-allocate],.pact-tree-node[data-open-fate-slot],.pact-tree-node[data-kismet-node]"))return;
  event.preventDefault();event.target.click();
});

document.addEventListener("click", (event) => {
  if(slatePendingDrop&&finishPendingSlateDrop(event))return;
  const pactAllocation=event.target.closest("[data-pact-node-allocate]");
  if(pactAllocation){
    const key=pactAllocation.dataset.pactNodeAllocate;
    const spiritName=pactAllocation.closest(".pact-slot")?.querySelector("[data-pactspirit-name]")?.dataset.pactspiritName;
    const nodeIndex=Number(key.slice(key.lastIndexOf(":")+1));
    const nodeCount=orderedPactspiritNodes(pactspiritTreesSs13[spiritName]).length;
    // Allocating past the Pact Point budget is refused (src/pact-limits.js; the node is greyed with the same reason). Refunds always work.
    const allocating=!(plannerState.pacts.nativeNodeQuantities?.[`${spiritName}:${nodeIndex}`]>0);
    const block=allocating?pactNodeAllocationBlock(plannerState.pacts,spiritName,nodeIndex,pactCharacter()):null;
    if(block){showToast(block);return;}
    plannerState.pacts.nativeNodeQuantities=togglePactNodeChain(plannerState.pacts.nativeNodeQuantities,spiritName,nodeIndex,nodeCount);
    refreshPactCandidate();
    return;
  }
  if(plannerState.pacts.kismetSlotMode&&event.target.closest(".pact-tree-extra"))return;
  const fateNode=event.target.closest("[data-open-fate-slot]");
  if(fateNode){openFateSlotSelector(fateNode.dataset.openFateSlot);return;}
  const fateChoice=event.target.closest("[data-select-fate-slots]");
  if(fateChoice){selectFateSlots(fateChoice.dataset.selectFateSlots);return;}
  if(event.target.closest("[data-clear-fate-slots]")){clearFateSlots($("#fate-slot-selector").dataset.spiritName);$("#fate-slot-selector").close();return;}
  if(event.target.closest("[data-close-fate-slot]")){ $("#fate-slot-selector").close();return; }
  const kismetNode=event.target.closest("[data-kismet-node]");
  if(kismetNode){openKismetCrafter(kismetNode.dataset.kismetNode,kismetNode.dataset.kismetKind);return;}
  const kismetChoice=event.target.closest("[data-select-kismet]");
  if(kismetChoice){selectKismetChoice(kismetChoice.dataset.selectKismet);return;}
  if(event.target.closest("[data-confirm-kismet]")){saveKismetSlot();return;}
  if(event.target.closest("[data-clear-kismet-slot]")){saveKismetSlot(true);return;}
  if(event.target.closest("[data-close-kismet-crafter]")){$("#kismet-crafter").close();activeKismetSlot=null;return;}
  const openPact=event.target.closest("[data-open-pactspirit-selector]");
  if(openPact){
    selectedPactspiritSlot=Number(openPact.dataset.openPactspiritSelector);
    $("[data-pactspirit-search]").value="";
    $("[data-pactspirit-category]").innerHTML=['All',...new Set(pactspiritCatalogSs13.map((entry)=>entry.category))].map((category)=>`<option value="${category}">${category}</option>`).join("");
    renderPactspiritSelector();$("#pactspirit-selector").showModal();$("[data-pactspirit-search]").focus();return;
  }
  if(event.target.closest("[data-close-pactspirit-selector]")){ $("#pactspirit-selector").close();return; }
  const pactChoice=event.target.closest("[data-select-pactspirit]");
  if(pactChoice){
    plannerState.pacts.selectedSpirits=selectPactspirit(plannerState.pacts.selectedSpirits,selectedPactspiritSlot,pactChoice.dataset.selectPactspirit);
    plannerState.pacts.activeSpirits=activeCapturedPactspirits(plannerState.pacts.selectedSpirits,selenaScorchingBeamPactsSs13.pactspirits.map((spirit)=>spirit.name));
    $("#pactspirit-selector").close();refreshPactCandidate();return;
  }
  const removePact=event.target.closest("[data-remove-pactspirit]");
  if(removePact){removeSelectedPactspirit(Number(removePact.dataset.removePactspirit));return;}
  const heroDetailTab=event.target.closest("[data-hero-detail-tab]");
  if(heroDetailTab){ activeHeroDetailTab=heroDetailTab.dataset.heroDetailTab; renderHeroTraitTree(); return; }
  const openScent=event.target.closest("[data-open-sage-scent]");
  if(openScent){ sageScentSelectorKind=openScent.dataset.openSageScent; sageScentQuery=""; $("#sage-scent-search").value=""; renderSageScentSelector(); $("#sage-scent-selector").showModal(); $("#sage-scent-search").focus(); return; }
  if(event.target.closest("[data-close-sage-scent]")){ $("#sage-scent-selector").close(); return; }
  if(event.target.closest("[data-clear-sage-scent]")){ plannerState.hero.sageScent[sageScentSelectorKind]=""; persistPlannerState(); $("#sage-scent-selector").close(); renderHeroTraitTree(); showToast("Scent slot cleared"); return; }
  const scentChoice=event.target.closest("[data-select-sage-scent]");
  if(scentChoice){ plannerState.hero.sageScent[sageScentSelectorKind]=scentChoice.dataset.selectSageScent; persistPlannerState(); $("#sage-scent-selector").close(); renderHeroTraitTree(); showToast(`${toastText(scentChoice.dataset.selectSageScent)} selected`); return; }
  const openCarinoAmmo=event.target.closest("[data-open-carino-ammo]");
  if(openCarinoAmmo){ activeHeroTraitSupportId=""; activeCarinoAmmoSlot=Number(openCarinoAmmo.dataset.openCarinoAmmo); carinoAmmoQuery=""; $("#carino-ammo-search").value=""; document.querySelector("#carino-ammo-selector .eyebrow").textContent="Ranger of Glory"; $("#carino-ammo-search").placeholder="Search projectile supports..."; $("#carino-ammo-selector .carino-ammo-help").textContent="Choose a support that can support a Projectile skill and is not installed on the skill panel."; renderCarinoAmmoSelector(); $("#carino-ammo-selector").showModal(); $("#carino-ammo-search").focus(); return; }
  const openHeroTraitSupport=event.target.closest("[data-open-hero-trait-support]");
  if(openHeroTraitSupport){
    activeHeroTraitSupportId=openHeroTraitSupport.dataset.openHeroTraitSupport;
    selectorKind="hero-support"; selectorQuery=""; selectorChoiceIndex=-1; selectorSpecialConfig=null;
    const installed=selectorTargetSupport();
    selectorLevel=installed?.level||20;
    if(installed){ selectorChoiceIndex=selectorEntries().findIndex((entry)=>entry.name===installed.name); selectorSpecialConfig={...defaultConfigurableSupportConfig(installed.name,installed.effects),...(normalizeProgressionSupportConfig(installed.name,installed.specialConfig)||{})}; }
    $("#skill-selector-search").value=""; renderSkillSelector(); $("#skill-selector").showModal(); $("#skill-selector-search").focus(); return;
  }
  if(event.target.closest("[data-close-carino-ammo]")){ $("#carino-ammo-selector").close(); return; }
  if(event.target.closest("[data-clear-carino-ammo]")){ if(activeHeroTraitSupportId){ plannerState.hero.heroTraitSupports[activeHeroTraitSupportId]=""; }else{ plannerState.hero.carinoSpecialAmmoSupports[activeCarinoAmmoSlot]=""; } persistPlannerState(); $("#carino-ammo-selector").close(); renderHeroTraitTree(); showToast("Support slot cleared"); return; }
  const carinoAmmoChoice=event.target.closest("[data-select-carino-ammo]");
  if(carinoAmmoChoice){ const name=carinoAmmoChoice.dataset.selectCarinoAmmo; if(!carinoProjectileSupportOptions().some((entry)=>entry.name===name))return; plannerState.hero.carinoSpecialAmmoSupports[activeCarinoAmmoSlot]=name; persistPlannerState(); $("#carino-ammo-selector").close(); renderHeroTraitTree(); showToast(`${toastText(name)} installed`); return; }
  const heroTraitSupportChoice=event.target.closest("[data-select-hero-trait-support]");
  if(heroTraitSupportChoice){ plannerState.hero.heroTraitSupports[activeHeroTraitSupportId]=heroTraitSupportChoice.dataset.selectHeroTraitSupport; persistPlannerState(); $("#carino-ammo-selector").close(); renderHeroTraitTree(); showToast(`${toastText(heroTraitSupportChoice.dataset.selectHeroTraitSupport)} installed`); return; }
  const heroPanelTab=event.target.closest("[data-hero-panel-tab]");
  if(heroPanelTab){ writeHeroPanelTab(activeBuildViewId(),heroPanelTab.dataset.heroPanelTab); hidePlannerTooltip(); renderHeroPanel(); return; }
  if(event.target.closest("[data-change-follower]")){ followerSelectorQuery=""; $("#follower-selector-search").value=""; renderFollowerSelector(); $("#follower-selector").showModal(); return; }
  if(event.target.closest("[data-close-follower-selector]")){ $("#follower-selector").close(); return; }
  const followerChoice=event.target.closest("[data-select-follower]");
  if(followerChoice){ const next=pickFollower(plannerState,followerChoice.dataset.selectFollower,followerChoice.dataset.followerRarity); $("#follower-selector").close(); commitFollower(next,`${toastText(followerById(next.followerId)?.displayName||"Follower")} · ${toastText(followerRarityById(next.rarity)?.name||"")} selected`); return; }
  const followerSlot=event.target.closest("[data-follower-skill-slot]");
  if(followerSlot){ if(!followerSlot.disabled){ hidePlannerTooltip(); openFollowerSkillSelector(Number(followerSlot.dataset.followerSkillSlot)); } return; }
  if(event.target.closest("[data-change-hero]")){ heroSelectorQuery=""; $("#hero-selector-search").value=""; renderHeroSelector(); $("#hero-selector").showModal(); return; }
  if(event.target.closest("[data-close-hero-selector]")){ $("#hero-selector").close(); return; }
  const heroChoice=event.target.closest("[data-select-hero]");
  if(heroChoice){
    const hero=heroById(heroChoice.dataset.selectHero);
    if(!hero)return;
    plannerState.hero=switchHeroLoadout(plannerState.hero,hero.id);
    // Only Iris 1 / 2 keep a Spirit Magus in an active skill slot: for any other hero it leaves the board (user decision 2026-10-21;
    // the board is build-wide, so switching back to Iris does not restore it).
    plannerState.skills=removeActiveSlotMagi(plannerState.skills,hero.id).skills;
    persistPlannerState(); $("#hero-selector").close(); renderCandidateViews(); showToast(`${toastText(hero.name)} · ${toastText(hero.trait)} selected`); return;
  }
  const closeTalentPicker = event.target.closest("[data-close-talent-picker]");
  if (closeTalentPicker) $("#talent-panel-picker").close();
  const closeCorePicker = event.target.closest("[data-close-core-picker]");
  if (closeCorePicker) $("#core-talent-picker").close();
  const resetTalentsButton=event.target.closest("[data-reset-talents]");
  if(resetTalentsButton){ clearTalentTreeState(activeTalentPanel); persistPlannerState(); renderCandidateViews(); showToast(`${toastText(activeTalentPanel)} points reset`); return; }
  const reselectTreeButton=event.target.closest("[data-reselect-tree]");
  if(reselectTreeButton){ const slot=plannerState.talents.selectedTrees.indexOf(activeTalentPanel); activeTalentSlot=slot>=0?slot:0; renderTalents(); $("#talent-panel-picker").showModal(); return; }
  const installPrismButton=event.target.closest("[data-install-prism]");
  if(installPrismButton){openPrismInventory();return;}
  if(event.target.closest("[data-cancel-prism-placement]")){pendingPrismPlacement=null;renderTalents();return;}
  if(event.target.closest("[data-close-prism-inventory]")){$("#prism-inventory-dialog").close();return;}
  if(event.target.closest("[data-open-prism-crafter]")){openPrismCrafter();return;}
  if(event.target.closest("[data-close-prism-crafter],[data-cancel-prism-crafter]")){$("#prism-crafter-dialog").close();openPrismInventory();return;}
  const editPrism=event.target.closest("[data-edit-crafted-prism]");
  if(editPrism){const item=plannerState.talents.prismInventory.find((entry)=>entry.id===editPrism.dataset.editCraftedPrism);if(item)openPrismCrafter(item);return;}
  const prismType=event.target.closest("[data-prism-type]");
  if(prismType){const inverse=prismType.dataset.prismType==="inverse";prismDraft={type:prismType.dataset.prismType,base:inverse?"Inverse Image":"",radiusAffix:"",rareAffix:"",legendaryAffix:"",...(inverse?{inverseRolls:{micro:-100,medium:-100,legendary:-100}}:{})};renderPrismCrafter();return;}
  const installItem=event.target.closest("[data-install-crafted-prism]");
  if(installItem){installCraftedPrism(installItem.dataset.installCraftedPrism);return;}
  const deletePrism=event.target.closest("[data-delete-crafted-prism]");
  if(deletePrism){const id=deletePrism.dataset.deleteCraftedPrism;for(const [name,itemId] of Object.entries(plannerState.talents.installedPrisms||{}))if(itemId===id){const item=plannerState.talents.prismInventory.find((entry)=>entry.id===id);clearInverseReflectedRanks(name,item,plannerState.talents.installedPrismNodes[name]);delete plannerState.talents.installedPrisms[name];delete plannerState.talents.installedPrismNodes[name];if(item?.type==="inverse")reconcileTalentRanksAfterPrismChange(name);}plannerState.talents.prismInventory=plannerState.talents.prismInventory.filter((item)=>item.id!==id);persistPlannerState();renderCandidateViews();renderPrismInventory();return;}
  if(event.target.closest("[data-unequip-prism]")){const name=plannerState.talents.selectedTrees[activePrismTreeSlot],item=plannerState.talents.prismInventory.find((entry)=>entry.id===plannerState.talents.installedPrisms[name]);clearInverseReflectedRanks(name,item,plannerState.talents.installedPrismNodes[name]);delete plannerState.talents.installedPrisms[name];delete plannerState.talents.installedPrismNodes[name];if(item?.type==="inverse")reconcileTalentRanksAfterPrismChange(name);persistPlannerState();renderCandidateViews();renderPrismInventory();return;}
  if(event.target.closest("[data-confirm-prism-craft]")){if(!prismDraft?.base)return;const editing=Boolean(prismEditingId),item={...prismDraft,legendaryAffix:prismSupportsLegendaryAffix(prismDraft)?prismDraft.legendaryAffix:"",id:prismEditingId||globalThis.crypto?.randomUUID?.()||`prism-${Date.now()}`};if(editing){const index=plannerState.talents.prismInventory.findIndex((entry)=>entry.id===prismEditingId);if(index<0)return;plannerState.talents.prismInventory[index]=item;}else plannerState.talents.prismInventory.push(item);persistPlannerState();$("#prism-crafter-dialog").close();renderCandidateViews();renderPrismInventory();$("#prism-inventory-dialog").showModal();showToast(`${prismName(item)} ${editing?"updated":"crafted"}`);return;}
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    if(viewButton.dataset.view==="slates"){ activateWorkspaceView("talents"); setTalentSlateMode(true); renderTalents(); saveWorkspaceLocation(); }
    else { if(viewButton.dataset.view==="talents") setTalentSlateMode(false); activateWorkspaceView(viewButton.dataset.view); }
  }
  const activateBuildButton = event.target.closest("[data-activate-build]");
  if (activateBuildButton) { persistPlannerState(); setActiveBuild(activateBuildButton.dataset.activateBuild); applyPlannerState(loadPlannerState()); renderCandidateViews(); activateWorkspaceView("builds",{scroll:false}); showToast("Build selected"); }
  const editBuildButton = event.target.closest("[data-edit-build]");
  if (editBuildButton) { persistPlannerState(); setActiveBuild(editBuildButton.dataset.editBuild); applyPlannerState(loadPlannerState()); renderCandidateViews(); activateWorkspaceView("talents",{scroll:false}); showToast("Build opened for editing"); }
  const newBuildButton = event.target.closest("[data-new-build]");
  if (newBuildButton) { createBuild({ name:"New build", state:emptyPlannerState() }); applyPlannerState(loadPlannerState()); selectedSkillIndex=0; renderCandidateViews(); activateWorkspaceView("talents",{scroll:false}); showToast("New build ready · Rename it in Build Library"); }
  const duplicateBuildButton = event.target.closest("[data-duplicate-build]");
  if (duplicateBuildButton) { persistPlannerState(); duplicateActiveBuild(); applyPlannerState(loadPlannerState()); renderCandidateViews(); showToast("Build duplicated — safe to experiment"); }
  const saveMetaButton = event.target.closest("[data-save-build-meta]");
  if (saveMetaButton) { updateActiveBuildMetadata({ name: $("[data-build-name]").value, notes: $("[data-build-notes]").value }); renderBuilds(); showToast("Build details saved"); }
  const deleteBuildButton = event.target.closest("[data-delete-build]");
  if (deleteBuildButton) {
    const build=loadBuildLibrary().builds.find((entry)=>entry.id===deleteBuildButton.dataset.deleteBuild);
    if(build){const dialog=$("#delete-build-confirm");dialog.dataset.buildId=build.id;$("#delete-build-message").textContent=`This will permanently delete “${build.name}” and its autosaves from this browser. This cannot be undone.`;dialog.showModal();}
  }
  if(event.target.closest("[data-cancel-delete-build]")){$("#delete-build-confirm").close();delete $("#delete-build-confirm").dataset.buildId;}
  if(event.target.closest("[data-confirm-delete-build]")){
    const dialog=$("#delete-build-confirm"),id=dialog.dataset.buildId;
    dialog.close();delete dialog.dataset.buildId;
    if(id){deleteBuild(id);applyPlannerState(loadPlannerState());renderCandidateViews();activateWorkspaceView("builds",{scroll:false});showToast("Build deleted");}
  }
  if(event.target.closest("[data-backup-builds]")){persistPlannerState();try{showToast(`Backup downloaded · ${downloadBackup()}`);}catch{showToast("The backup could not be created");}}
  if(event.target.closest("[data-restore-builds]"))$("#restore-builds-file").click();
  if(event.target.closest("[data-resume-calculations]")){setSafeMode(sessionStorage,false);location.reload();}
  if(event.target.closest("[data-start-new-library]")){try{startNewLibrary();applyPlannerState(loadPlannerState());renderCandidateViews();renderLibraryNotice();updateStorageStatus();showToast("New library started · Your unreadable data stays backed up");}catch(error){showToast(error?.message||"A new library could not be started");}}
  if(event.target.closest("[data-delete-all-builds]"))$("#delete-all-builds-confirm").showModal();
  if(event.target.closest("[data-cancel-delete-all-builds]"))$("#delete-all-builds-confirm").close();
  if(event.target.closest("[data-confirm-delete-all-builds]")){$("#delete-all-builds-confirm").close();deleteAllBuilds();applyPlannerState(loadPlannerState());renderCandidateViews();activateWorkspaceView("builds",{scroll:false});showToast("All builds deleted");}
  const selenaDanceNode=event.target.closest("[data-selena-dance-node]");
  if(selenaDanceNode){
    if(selenaDanceNode.dataset.selenaDanceNode===heroTraitTree(plannerState.hero.selectedHeroId)?.base)return;
    const heroId=plannerState.hero.selectedHeroId, rules=heroTreeRules(plannerState.hero,heroId), name=selenaDanceNode.dataset.selenaDanceNode, before=heroTreeSelections(plannerState.hero,heroId), result=rules.toggle(before,name);
    if(result.error){ showToast(result.error); return; }
    commitTreeTraits(heroId,result.rows); showToast(before.includes(name)?"Trait path shortened":`${name} selected under ${rules.rowName(result.rows.indexOf(name))}`); return;
  }
  const traitChoiceButton = event.target.closest("[data-hero-trait]");
  if (traitChoiceButton) {
    const tier = traitChoiceButton.dataset.heroTraitTier;
    const name = traitChoiceButton.dataset.heroTrait;
    plannerState.hero.selectedTraits[tier] = name;
    persistPlannerState(); renderHeroTraitTree(); render(); renderConfiguration(); showToast(`${toastText(name)} selected`);
  }
  const memoryButton = event.target.closest("[data-memory-tier]");
  if (memoryButton) {
    activeHeroMemoryTier=memoryButton.dataset.memoryTier;
    renderHeroMemoryInventory();
    $("#hero-memory-selector").showModal();
  }
  if(event.target.closest("[data-close-hero-memory]")){ $("#hero-memory-selector").close(); return; }
  if(event.target.closest("[data-clear-base-memory]")){plannerState.hero.baseTraitMemoryId="";plannerState.hero.baseTraitMemoryRoll=null;persistPlannerState();renderHeroTraitTree();renderHeroMemoryInventory();return;}
  const equipBaseMemoryButton=event.target.closest("[data-equip-base-memory]");
  if(equipBaseMemoryButton){
    const memory=plannerState.hero.memoryInventory?.find((item)=>item.id===equipBaseMemoryButton.dataset.equipBaseMemory),slot=equippedBaseTraitSlot(plannerState.hero);
    if(!slot||!canEquipBaseTraitMemory(memory)&&plannerState.hero.baseTraitMemoryId!==memory?.id)return;
    if(plannerState.hero.baseTraitMemoryId===memory.id){plannerState.hero.baseTraitMemoryId="";plannerState.hero.baseTraitMemoryRoll=null;}
    else{plannerState.hero.baseTraitMemoryId=memory.id;plannerState.hero.baseTraitMemoryRoll=slot.reductionRange.max;}
    persistPlannerState();renderHeroTraitTree();renderHeroMemoryInventory();return;
  }
  if(event.target.closest("[data-clear-hero-memory]")){ unequipHeroMemory(activeHeroMemoryTier); return; }
  if(event.target.closest("[data-craft-hero-memory]")){ startHeroMemoryCraft(); return; }
  if(event.target.closest("[data-back-hero-memory]")){ memoryDraft=null; editingMemoryId=null; renderHeroMemoryInventory(); return; }
  const memoryTypeButton=event.target.closest("[data-memory-type]");
  if(memoryTypeButton){
    const nextType=memoryTypeButton.dataset.memoryType;
    if(memoryDraft.type===nextType)return;
    const scroll=$("#hero-memory-content .hero-memory-form")?.scrollTop||0;
    memoryDraft.type=nextType;
    memoryDraft.name=nextType;
    memoryDraft.baseStat="";
    renderHeroMemoryCraft();
    $("#hero-memory-content .hero-memory-form").scrollTop=scroll;
    return;
  }
  const memoryRarityButton=event.target.closest("[data-memory-rarity]");
  if(memoryRarityButton){ memoryDraft.rarity=memoryRarityButton.dataset.memoryRarity; memoryDraft.enhancementLevel=clampMemoryEnhancement(memoryDraft.enhancementLevel,memoryDraft.rarity); memoryDraft.traitLevelBonus=traitLevelBonusForEnhancement(memoryDraft.enhancementLevel); renderHeroMemoryCraft(); return; }
  const revivedTierButton=event.target.closest("[data-revived-tier]");
  if(revivedTierButton){
    memoryDraft.revivedTier=Number(revivedTierButton.dataset.revivedTier);
    memoryDraft.revivedRoll=revivedAffixRollRange(revivedAffixTiers(memoryDraft.revivedAffix).find((entry)=>entry.tier===memoryDraft.revivedTier)?.effect)?.max??null;
    const scroll=$("#hero-memory-content .hero-memory-form")?.scrollTop||0;renderHeroMemoryCraft();$("#hero-memory-content .hero-memory-form").scrollTop=scroll;focusMemoryRollValue("revivedRoll");return;
  }
  const memoryTierButton=event.target.closest("[data-memory-tier-choice]");
  if(memoryTierButton){
    const [group,index,tier]=memoryTierButton.dataset.memoryTierChoice.split("."),tierGroup=group==="fixedAffixes"?"fixedTiers":"randomTiers",rollGroup=group==="fixedAffixes"?"fixedRolls":"randomRolls";
    memoryDraft[tierGroup][Number(index)]=Number(tier);
    memoryDraft[rollGroup][Number(index)]=memoryRollRange(memoryTierOptions(group,memoryDraft[group][Number(index)]).find((entry)=>entry.tier===Number(tier))?.effect||"")?.max??null;
    const scroll=$("#hero-memory-content .hero-memory-form")?.scrollTop||0;
    renderHeroMemoryCraft();$("#hero-memory-content .hero-memory-form").scrollTop=scroll;
    focusMemoryRollValue(`${rollGroup}.${index}`);
    if(document.activeElement?.dataset.memoryField!==`${rollGroup}.${index}`)focusMemoryRollValue(`${group}.${index}`);
    return;
  }
  const editMemoryButton=event.target.closest("[data-edit-crafted-memory]");
  if(editMemoryButton){ const memory=plannerState.hero.memoryInventory?.find((item)=>item.id===editMemoryButton.dataset.editCraftedMemory); if(memory)startHeroMemoryCraft(memory); return; }
  const copyMemoryButton=event.target.closest("[data-copy-crafted-memory]");
  if(copyMemoryButton){
    const original=plannerState.hero.memoryInventory?.find((item)=>item.id===copyMemoryButton.dataset.copyCraftedMemory);
    if(!original)return;
    const copy={...structuredClone(original),id:globalThis.crypto?.randomUUID?.()||`memory-${Date.now()}-${Math.random().toString(36).slice(2)}`};
    plannerState.hero.memoryInventory.push(copy);
    persistPlannerState();renderHeroMemoryInventory();showToast(`${toastText(original.name)} copied`);
    return;
  }
  const equipMemoryButton=event.target.closest("[data-equip-crafted-memory]");
  if(equipMemoryButton){ const memory=plannerState.hero.memoryInventory?.find((item)=>item.id===equipMemoryButton.dataset.equipCraftedMemory); if(memory){const tier=Object.keys(plannerState.hero.equippedMemoryIds||{}).find((key)=>plannerState.hero.equippedMemoryIds[key]===memory.id);if(tier)unequipHeroMemory(tier);else equipHeroMemory(memory);} return; }
  const deleteMemoryButton=event.target.closest("[data-delete-crafted-memory]");
  if(deleteMemoryButton){ const id=deleteMemoryButton.dataset.deleteCraftedMemory; plannerState.hero.memoryInventory=(plannerState.hero.memoryInventory||[]).filter((memory)=>memory.id!==id); for(const [tier,equippedId] of Object.entries(plannerState.hero.equippedMemoryIds||{}))if(equippedId===id){ delete plannerState.hero.equippedMemoryIds[tier]; plannerState.hero.memories[tier]=""; plannerState.hero.memoryTraitLevels[tier]=0; } clearInvalidBaseTraitMemory(); persistPlannerState(); renderHeroTraitTree(); renderHeroMemoryInventory(); showToast("Memory deleted"); return; }
  if(event.target.closest("[data-save-crafted-memory]")){ if(!memoryDraft?.rarity||!memoryDraft.baseStat)return; if(editingMemoryId&&(Object.values(plannerState.hero.equippedMemoryIds||{}).includes(editingMemoryId)||plannerState.hero.baseTraitMemoryId===editingMemoryId)&&otherEquippedRevivedMemory(memoryDraft)){showToast("Only one revived memory can be equipped");return;} plannerState.hero.memoryInventory||=[]; const enhancementLevel=clampMemoryEnhancement(memoryDraft.enhancementLevel,memoryDraft.rarity),memory={...memoryDraft,enhancementLevel,traitLevelBonus:traitLevelBonusForEnhancement(enhancementLevel),id:editingMemoryId||globalThis.crypto?.randomUUID?.()||`memory-${Date.now()}`,name:memoryDraft.type}; const index=plannerState.hero.memoryInventory.findIndex((item)=>item.id===memory.id); if(index>=0)plannerState.hero.memoryInventory[index]=memory; else plannerState.hero.memoryInventory.push(memory); for(const [tier,equippedId] of Object.entries(plannerState.hero.equippedMemoryIds||{}))if(equippedId===memory.id){ if(memory.type!==heroMemoryTypeForTier(tier)){delete plannerState.hero.equippedMemoryIds[tier];plannerState.hero.memories[tier]="";plannerState.hero.memoryTraitLevels[tier]=0;}else{plannerState.hero.memories[tier]=memory.name;plannerState.hero.memoryTraitLevels[tier]=traitLevelBonusForEnhancement(memory.enhancementLevel);} } clearInvalidBaseTraitMemory(); memoryDraft=null; editingMemoryId=null; persistPlannerState(); renderHeroTraitTree(); renderHeroMemoryInventory(); showToast(`${toastText(memory.name)} saved`); return; }
  const talentSlotButton=event.target.closest("[data-talent-slot]");
  if (talentSlotButton && !event.target.closest("[data-talent-slates]")) {
    pendingPrismPlacement=null;
    setTalentSlateMode(false);
    activeTalentSlot=Number(talentSlotButton.dataset.talentSlot);
    const selected=plannerState.talents.selectedTrees[activeTalentSlot];
    if (selected) { activeWorkspaceView="talents"; activeTalentPanel=selected; renderTalents(); saveWorkspaceLocation(); return; }
    renderTalents(); $("#talent-panel-picker").showModal();
  }
  const talentSlatesButton=event.target.closest("[data-talent-slates]");
  if(talentSlatesButton){ activeWorkspaceView="talents"; setTalentSlateMode(true); renderTalents(); renderSlates(); saveWorkspaceLocation(); }
  const selectPanelButton=event.target.closest("[data-select-panel]");
  if (selectPanelButton) {
    const name=selectPanelButton.dataset.selectPanel;
    const previous=plannerState.talents.selectedTrees[activeTalentSlot];
    if (previous!==name){clearTalentTreeState(previous);delete plannerState.talents.installedPrisms[previous];delete plannerState.talents.installedPrismNodes[previous];}
    plannerState.talents.selectedTrees[activeTalentSlot]=name;
    if (activeTalentSlot===0 && !talentFamiliesSs13[name].includes(plannerState.talents.selectedTrees[1])) {const removed=plannerState.talents.selectedTrees[1];clearTalentTreeState(removed);delete plannerState.talents.installedPrisms[removed];delete plannerState.talents.installedPrismNodes[removed];plannerState.talents.selectedTrees[1]="";}
    activeWorkspaceView="talents";
    activeTalentPanel=name;
    selectedTalentCoordinate=(currentTalentPanel().allocatedNodes[0]?.coordinate || currentTalentPanel().nodes[0].coordinate).join(",");
    persistPlannerState(); $("#talent-panel-picker").close(); renderTalents(); saveWorkspaceLocation();
  }
  const coreSlotButton=event.target.closest("[data-core-slot]");
  if (coreSlotButton) { activeCoreThreshold=Number(coreSlotButton.dataset.coreSlot); renderCoreTalentPicker(activeCoreThreshold); $("#core-talent-picker").showModal(); }
  const coreOptionButton=event.target.closest("[data-core-option]");
  if (coreOptionButton && !coreOptionButton.disabled) { plannerState.talents.coreSelections[`${activeTalentPanel}:${activeCoreThreshold}`]=coreOptionButton.dataset.coreOption; persistPlannerState(); $("#core-talent-picker").close(); renderTalents(); showToast(`${coreOptionButton.dataset.coreOption} selected`); }
  const nodeButton = event.target.closest(".talent-node[data-coordinate]");
  if (nodeButton) { hidePlannerTooltip(); if(pendingPrismPlacement){placeCraftedPrism(nodeButton.dataset.coordinate);return;} if(plannerState.talents.installedPrismNodes?.[activeTalentPanel]===nodeButton.dataset.coordinate&&plannerState.talents.installedPrisms?.[activeTalentPanel]){openPrismInventory();return;} changeTalentRank(nodeButton.dataset.coordinate, 1); }
  const equipmentButton = event.target.closest("[data-equipment-slot]");
  if (equipmentButton) {
    selectedEquipmentSlot=equipmentButton.dataset.equipmentSlot;
    const equippedItem=currentEquipmentImpact().allItems.find((entry)=>entry.slot===selectedEquipmentSlot);
    if(equippedItem&&!disabledEquipmentSlots.has(selectedEquipmentSlot)){
      const sourceId=plannerState.equipmentOverrides?.[selectedEquipmentSlot]?.sourceInventoryId;
      const inventoryItem=inventoryItems().find((entry)=>entry.id===sourceId)||inventoryItems().find((entry)=>entry.slot===selectedEquipmentSlot&&entry.name===equippedItem.name);
      if(inventoryItem){ selectedInventoryItemId=inventoryItem.id; inventoryItemEditing=false; renderInventoryItemDialog(); $("#inventory-item-dialog").showModal(); }
    } else renderEquipment();
  }
  const openEquipmentCraft=event.target.closest("[data-open-equipment-craft]");
  if(openEquipmentCraft){ editingCraftItemId=null; equipmentCraftMode=openEquipmentCraft.dataset.openEquipmentCraft; selectedVoraxBaseName=""; selectedLegendaryIndex=-1; selectedLegendaryBase=""; selectedLegendaryBeltBlendId=""; selectedLegendaryTowerSequenceId=""; selectedCorrosionIndex=-1; selectedLegendaryCorrodedModifiers=new Set(); selectedLegendaryPlaceholderChoices=new Map(); selectedLegendaryTierChoices=new Map(); selectedFolkloreRingOption="left"; equipmentSearch=""; renderEquipmentCrafter(); $("#equipment-crafter").showModal(); }
  const voraxBaseChoice=event.target.closest("[data-select-vorax-base]");
  if(voraxBaseChoice){ selectedVoraxBaseName=voraxBaseChoice.dataset.selectVoraxBase; renderEquipmentCrafter(); }
  if(event.target.closest("[data-change-vorax-base]")){ selectedVoraxBaseName=""; renderEquipmentCrafter(); }
  const voraxLegendaryToggle=event.target.closest("[data-toggle-vorax-legendary]");
  if(voraxLegendaryToggle){
    const index=Number(voraxLegendaryToggle.dataset.toggleVoraxLegendary), activating=voraxLegendaryToggle.dataset.legendaryActive!=="true", body=$("#equipment-crafter-body");
    if(activating&&body.querySelectorAll('[data-toggle-vorax-legendary][data-legendary-active="true"]').length>=2){ showToast("A Vorax item can inherit up to two Legendary affixes"); return; }
    voraxLegendaryToggle.dataset.legendaryActive=String(activating); voraxLegendaryToggle.setAttribute("aria-pressed",String(activating)); voraxLegendaryToggle.closest(".craft-affix-control")?.classList.toggle("legendary-affix-active",activating);
    const select=body.querySelector(`[data-craft-affix-family="${index}"]`), type=body.querySelector("[data-craft-type]")?.value; if(select){ select.innerHTML=craftAffixFamilyOptions(type,index); select.value=""; }
    updateCraftAffixConfig(index); updateCraftPreview();
  }
  if(event.target.closest("[data-close-equipment-craft]")){ editingCraftItemId=null; $("#equipment-crafter").close(); }
  const legendaryChoice=event.target.closest("[data-legendary-id]");
  if(legendaryChoice){ selectedLegendaryIndex=legendaryGearSs13.findIndex((entry)=>entry.id===legendaryChoice.dataset.legendaryId); selectedLegendaryBase=defaultBaseForItem(legendaryGearSs13[selectedLegendaryIndex]); selectedLegendaryBeltBlendId=""; selectedLegendaryTowerSequenceId=""; selectedCorrosionIndex=-1; selectedLegendaryCorrodedModifiers=new Set(); selectedLegendaryPlaceholderChoices=new Map(); selectedLegendaryTierChoices=new Map(); selectedFolkloreRingOption="left"; renderEquipmentCrafter(); }
  if(event.target.closest("[data-change-legendary]")){ selectedLegendaryIndex=-1; selectedLegendaryBase=""; selectedLegendaryBeltBlendId=""; selectedLegendaryTowerSequenceId=""; selectedCorrosionIndex=-1; selectedLegendaryCorrodedModifiers=new Set(); selectedLegendaryPlaceholderChoices=new Map(); selectedLegendaryTierChoices=new Map(); renderEquipmentCrafter(); }
  const toggleLegendaryCorrosion=event.target.closest("[data-toggle-legendary-corrosion]");
  if(toggleLegendaryCorrosion){ const index=Number(toggleLegendaryCorrosion.dataset.toggleLegendaryCorrosion); if(selectedLegendaryCorrodedModifiers.has(index)) selectedLegendaryCorrodedModifiers.delete(index); else selectedLegendaryCorrodedModifiers.add(index); renderEquipmentCrafter(); }
  const addCraftedEquipment=event.target.closest("[data-add-crafted-equipment]");
  if(addCraftedEquipment){
    let item;
    if(equipmentCraftMode==="legendary") { const selected=legendaryGearSs13[selectedLegendaryIndex]; if(!selected){ showToast("Select a legendary item first"); return; } const {remoteIcon,...localItem}=structuredClone(selected), blend=beltBlendById(selectedLegendaryBeltBlendId), sequence=towerSequenceById(selectedLegendaryTowerSequenceId), legendaryModifiers=configuredLegendaryModifiers(); item={...localItem,...(blend?{beltBlendId:blend.id}:{}),...(sequence?{towerSequenceId:sequence.id}:{}),legendaryModifiers,itemLevel:100,energy:equipmentEnergyAllowed(selected.slot)?Number($("#equipment-crafter-body [data-legendary-energy]")?.value)||0:0,modifiers:[...legendaryModifiers,...(blend?[blend.modifier]:[]),...(sequence?[sequence.modifier]:[])],corrodedModifierIndices:[...selectedLegendaryCorrodedModifiers],base:selectedLegendaryBase||defaultBaseForItem(selected),rarity:"legendary"}; const corrosion=configuredCorrosionModifier(); if(corrosion) item.corrosionModifiers=[corrosion]; }
    else item=currentCraftPreview();
    item=definedItemFields(item);
    const editingItem=editingCraftItemId?plannerState.equipmentInventory.find((entry)=>entry.id===editingCraftItemId):null;
    if(editingItem){ const id=editingItem.id; Object.keys(editingItem).forEach((key)=>delete editingItem[key]); Object.assign(editingItem,item,{id}); for(const [slot,override] of Object.entries(plannerState.equipmentOverrides||{})){ if(override.sourceInventoryId===id){ const {id:ignored,source,slot:sourceSlot,remoteIcon,...updatedOverride}=editingItem; plannerState.equipmentOverrides[slot]={...structuredClone(updatedOverride),sourceInventoryId:id}; } } }
    else { item.id=`gear-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; plannerState.equipmentInventory.push(item); }
    const edited=Boolean(editingItem); editingCraftItemId=null; persistPlannerState(); $("#equipment-crafter").close(); renderCandidateViews(); showToast(`${toastText(item.name)} ${edited?"updated":"added to Inventory"}`);
  }
  const inventoryButton=event.target.closest("[data-equip-inventory]");
  if(inventoryButton&&!event.target.closest("[data-quick-edit-item],[data-duplicate-item]")){ const item=inventoryItems().find((entry)=>entry.id===inventoryButton.dataset.equipInventory); if(item){ hidePlannerTooltip(); selectedInventoryItemId=item.id; inventoryItemEditing=false; renderInventoryItemDialog(); $("#inventory-item-dialog").showModal(); } }
  const quickEdit=event.target.closest("[data-quick-edit-item]");
  if(quickEdit){ const item=inventoryItems().find((entry)=>entry.id===quickEdit.dataset.quickEditItem); openInventoryItemEditor(item); }
  const duplicateItemButton=event.target.closest("[data-duplicate-item]");
  if(duplicateItemButton){ const source=inventoryItems().find((item)=>item.id===duplicateItemButton.dataset.duplicateItem); if(source){ const {id,...copy}=structuredClone(source); copy.id=`gear-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; copy.name=`${copy.name} Copy`; plannerState.equipmentInventory.push(copy); persistPlannerState(); renderCandidateViews(); showToast(`${toastText(source.name)} duplicated`); } }
  if(event.target.closest("[data-close-inventory-item]")) $("#inventory-item-dialog").close();
  if(event.target.closest("[data-equip-selected-item]")){ const item=inventoryItems().find((entry)=>entry.id===selectedInventoryItemId); if(isItemEquipped(item)){ disabledEquipmentSlots.add(equippedSlotForInventoryItem(item)||compatibleEquipmentSlot(item)); persistPlannerState(); renderCandidateViews(); showToast(`${toastText(item.name)} unequipped`); } else equipInventoryItem(item); $("#inventory-item-dialog").close(); }
  if(event.target.closest("[data-edit-inventory-item]")){ const item=inventoryItems().find((entry)=>entry.id===selectedInventoryItemId); openInventoryItemEditor(item); }
  if(event.target.closest("[data-copy-inventory-item]")){ const source=inventoryItems().find((item)=>item.id===selectedInventoryItemId); if(source){ const {id,...copy}=structuredClone(source); copy.id=`gear-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; copy.name=`${copy.name} Copy`; plannerState.equipmentInventory.push(copy); $("#inventory-item-dialog").close(); persistPlannerState(); renderCandidateViews(); showToast(`${toastText(source.name)} duplicated`); } }
  const toggleEditCorrosion=event.target.closest("[data-toggle-edit-corrosion]");
  if(toggleEditCorrosion){ const index=Number(toggleEditCorrosion.dataset.toggleEditCorrosion); if(editingCorrodedModifierIndices.has(index)) editingCorrodedModifierIndices.delete(index); else editingCorrodedModifierIndices.add(index); editingLegendaryTexts.delete(index); renderInventoryItemDialog(); }
  if(event.target.closest("[data-delete-inventory-item]")){ const item=inventoryItems().find((entry)=>entry.id===selectedInventoryItemId); if(item?.id.startsWith("captured-")){ plannerState.removedInventoryItemIds=[...new Set([...(plannerState.removedInventoryItemIds||[]),item.id])]; disabledEquipmentSlots.add(item.slot); } else plannerState.equipmentInventory=plannerState.equipmentInventory.filter((entry)=>entry.id!==selectedInventoryItemId); for(const [slot,override] of Object.entries(plannerState.equipmentOverrides)){ if(override.sourceInventoryId===selectedInventoryItemId){ delete plannerState.equipmentOverrides[slot]; disabledEquipmentSlots.add(slot); } } $("#inventory-item-dialog").close(); persistPlannerState(); renderCandidateViews(); showToast("Item deleted from Inventory"); }
  if(event.target.closest("[data-save-inventory-item]")){ let item=plannerState.equipmentInventory.find((entry)=>entry.id===selectedInventoryItemId); const source=inventoryItems().find((entry)=>entry.id===selectedInventoryItemId); if(!item&&source){ item={...structuredClone(source),id:`gear-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}; plannerState.equipmentInventory.push(item); selectedInventoryItemId=item.id; } if(item){ item.name=$("[data-inventory-edit-name]").value.trim()||item.name; item.level=Number($("[data-inventory-edit-level]").value)||item.level; item.energy=equipmentEnergyAllowed(item.slot)?Number($("[data-inventory-edit-energy]")?.value)||0:0; item.base=$("[data-inventory-edit-base]").value.trim()||item.base; const blend=item.slot==="belt"?beltBlendById($("[data-edit-belt-blend]")?.value):null, sequence=towerSequenceById($("[data-edit-tower-sequence]")?.value), editedModifiers=[...document.querySelectorAll("[data-edit-modifier]")].map((input)=>input.value.trim()).filter(Boolean); const legendarySource=legendaryEditorSource(item); if(legendarySource){ const texts=new Map([...document.querySelectorAll("[data-edit-modifier]")].map((input)=>[Number(input.dataset.editModifier),input.value.trim()]).filter(([,text])=>text)); Object.assign(item,applyLegendaryEditorEdits(item,inventoryLegendaryModel(item,legendarySource),{texts,corrodedCatalog:editingCorrodedModifierIndices,specials:[{from:beltBlendById(item.beltBlendId)?.modifier,to:blend?.modifier},{from:towerSequenceById(item.towerSequenceId)?.modifier,to:sequence?.modifier}]})); } else applyEditedModifierStructure(item,editedModifiers); if(blend)item.beltBlendId=blend.id;else delete item.beltBlendId; if(sequence)item.towerSequenceId=sequence.id;else delete item.towerSequenceId; if(!legendarySource){ item.modifiers=[...editedModifiers,...(item.rarity==="legendary"?item.implicitModifiers||[]:[])]; if(blend)item.modifiers.push(blend.modifier); if(sequence)item.modifiers.push(sequence.modifier); item.corrodedModifierIndices=[...editingCorrodedModifierIndices]; } item.corrosionModifiers=[...editingCorrosionImplicit.lines]; const base=rareBaseForItem(item,[(item.name||"").replace(/ - Priceless$/i,""),item.base]); if(!legendarySource)item.affixCount=Math.max(0,item.modifiers.length-(base?.modifiers?.length||0))+item.corrosionModifiers.length; inventoryItemEditing=false; persistPlannerState(); renderCandidateViews(); renderInventoryItemDialog(); showToast("Inventory item updated"); } }
  const unequipItem=event.target.closest("[data-unequip-item]");
  if(unequipItem){ disabledEquipmentSlots.add(unequipItem.dataset.unequipItem); persistPlannerState(); renderCandidateViews(); showToast(`${titleCase(unequipItem.dataset.unequipItem)} unequipped`); }
  if(event.target.closest("[data-reset-equipment]")){ equipmentSlots.forEach(([slot])=>disabledEquipmentSlots.add(slot)); plannerState.equipmentOverrides={}; persistPlannerState(); renderCandidateViews(); showToast("Gear reset to empty"); }
  const equipmentCatalogButton = event.target.closest("[data-apply-equipment-catalog]");
  if (equipmentCatalogButton) {
    const entries = tlidbEquipmentCatalogSs13.filter((entry) => entry.slot === equipmentCatalogButton.dataset.equipmentCatalogSlot);
    const entry = entries[Number(equipmentCatalogButton.dataset.applyEquipmentCatalog)];
    if (entry) { const { source, slot, ...override } = entry; plannerState.equipmentOverrides[entry.slot] = structuredClone(override); disabledEquipmentSlots.delete(entry.slot); persistPlannerState(); renderCandidateViews(); showToast(`${toastText(entry.name)} applied`); }
  }
  const slateButton = event.target.closest("[data-slate-id]");
  if (slateButton&&suppressSlateClick){ suppressSlateClick=false; return; }
  if (slateButton) { const stage=slateButton.closest(".slate-stage"),rect=stage.getBoundingClientRect(); slateToolsPosition={x:event.clientX-rect.left,y:event.clientY-rect.top}; selectedSlateId = slateButton.dataset.slateId; slatePlacementTarget=selectedSlateId; $("#slates-view").classList.add("editor-open"); renderSlates(); }
  const editSlateButton=event.target.closest("[data-edit-slate]");
  if(editSlateButton){
    const id=editSlateButton.dataset.editSlate;
    const crafted=(plannerState.slates.inventory||[]).find((item)=>item.id===id);
    if(crafted){ openCraftedSlateEditor(crafted); if(!$("#slate-inventory").open)$("#slate-inventory").showModal(); }
    else { const slate=slatesForBoard().find((item)=>item.id===id); if(slate){ renderSlateEditor(slate); $("#slate-editor").showModal(); } }
  }
  if(event.target.closest("[data-close-slate-editor]")) $("#slate-editor").close();
  const moveSlateButton=event.target.closest("[data-slate-move]");
  if(moveSlateButton){ slatePlacementTarget=moveSlateButton.dataset.slateMove; slateEditMode=true; renderSlates(); showToast("Choose an empty board cell"); }
  if(event.target.closest("[data-add-slate-affix]")){ const list=$("#slate-editor-content fieldset"); const index=list.querySelectorAll("[data-slate-affix]").length; event.target.closest("[data-add-slate-affix]").insertAdjacentHTML("beforebegin",`<label class="slate-affix-row"><span>Slot ${index+1}</span><input type="text" data-slate-affix="${index}" value=""></label>`); }
  const saveSlateEditor=event.target.closest("[data-save-slate-editor]");
  if(saveSlateEditor){ plannerState.slates.affixOverrides ||= {}; plannerState.slates.affixOverrides[saveSlateEditor.dataset.saveSlateEditor]=[...$("#slate-editor-content").querySelectorAll("[data-slate-affix]")].map((input)=>input.value.trim()).filter(Boolean); persistPlannerState(); $("#slate-editor").close(); renderCandidateViews(); showToast("Slate affixes saved"); }
  const slateEditButton=event.target.closest("[data-slate-edit]");
  if (slateEditButton) { slateEditMode=!slateEditMode; slatePlacementTarget=slateEditMode ? selectedSlateId : null; renderSlates(); }
  const slateInventoryButton=event.target.closest("[data-slate-inventory]");
  if (slateInventoryButton) { renderSlateInventory(); $("#slate-inventory").showModal(); }
  if (event.target.closest("[data-close-slate-inventory]")) $("#slate-inventory").close();
  if(event.target.closest("[data-open-slate-crafter]")){ editingCraftedSlateId=null; selectedLegendarySlateName=""; activeSlateCrafterTab="craft"; renderSlateCrafter(); }
  if(event.target.closest("[data-back-slate-inventory]")){ editingCraftedSlateId=null; renderSlateInventory(); }
  const inventoryTab=event.target.closest("[data-slate-inventory-tab]");
  if(inventoryTab){ activeSlateCrafterTab=inventoryTab.dataset.slateInventoryTab; if(activeSlateCrafterTab==="legendary"&&!editingCraftedSlateId)selectedLegendarySlateName=""; renderSlateCrafter(); }
  if(event.target.closest("[data-change-slate-template]")){ selectedLegendarySlateName=""; renderSlateCrafter(); }
  const slateTemplate=event.target.closest("[data-slate-template]");
  if(slateTemplate){ selectedLegendarySlateName=slateTemplate.dataset.slateTemplate; if(["Sparks of Moth Fire","Residence of Stars","When Sparks Set the Prairie Ablaze","Space Rift","Fallen Starlight","A Corner of Divinity","Pedigree of Gods"].includes(selectedLegendarySlateName))renderSlateCrafter(); else { document.querySelectorAll("[data-slate-template]").forEach((button)=>button.classList.toggle("active",button===slateTemplate)); const preview=$(".slate-empty-preview"); if(preview){ const image=slateTemplate.querySelector("img"); preview.className="slate-craft-card"; preview.innerHTML=`${image?.outerHTML||""}<strong>${escapeHtml(selectedLegendarySlateName)}</strong><small>DIVINITY SLATE · LEGENDARY</small>`; } } }
  const slateGodButton=event.target.closest("[data-slate-god]");
  if(slateGodButton){ selectedSlateGod=slateGodButton.dataset.slateGod; renderSlateCrafter(); }
  const netherTypeButton=event.target.closest("[data-nether-slate-type]");
  if(netherTypeButton){ selectedNetherSlateType=netherTypeButton.dataset.netherSlateType; renderSlateCrafter(); }
  const craftShape=event.target.closest("[data-craft-shape]");
  if(craftShape){ document.querySelectorAll("[data-craft-shape]").forEach((button)=>button.classList.toggle("active",button===craftShape)); const art=craftShape.querySelector("img,.god-slate-shape"), preview=document.querySelector(".slate-shape-preview"); if(art&&preview){ preview.innerHTML=art.outerHTML; preview.dataset.rotation="0"; preview.dataset.flipX="1"; preview.dataset.flipY="1"; updateSlateCraftPreview(); } }
  const craftTransform=event.target.closest("[data-craft-transform]");
  if(craftTransform){ const rules=slateTransformRules(activeSlateCrafterTab==="legendary"?selectedLegendarySlateName:""),operation=craftTransform.dataset.craftTransform; if((operation==="rotate"&&!rules.rotate)||(operation!=="rotate"&&!rules.flip))return; const preview=document.querySelector(".slate-shape-preview"), art=preview?.querySelector("img,.god-slate-shape"); if(preview&&art){ let rotation=Number.parseInt(preview.dataset.rotation||"0",10), flipX=Number.parseInt(preview.dataset.flipX||"1",10), flipY=Number.parseInt(preview.dataset.flipY||"1",10); if(operation==="rotate") rotation=(rotation+90)%360; if(operation==="flip-h") flipX*=-1; if(operation==="flip-v") flipY*=-1; preview.dataset.rotation=String(rotation); preview.dataset.flipX=String(flipX); preview.dataset.flipY=String(flipY); art.style.transform=`rotate(${rotation}deg) scale(${flipX}, ${flipY})`; updateSlateCraftPreview(); } }
  if(event.target.closest("[data-add-crafted-slate]")){
    const activeShape=$("[data-craft-shape].active"), preview=$(".slate-shape-preview"), template=$("[data-slate-template].active"), nameInput=$("[data-slate-craft-name]");
    const fallbackName=activeSlateCrafterTab==="judgment"?`Nether King's Divinity: ${selectedNetherSlateType}`:template?.dataset.slateTemplate||selectedSlateGod;
    const originalSlate=(plannerState.slates.inventory||[]).find((slate)=>slate.id===editingCraftedSlateId);
    const previewImage=preview?.querySelector("img")||template?.querySelector("img")||$(".slate-craft-card img");
    const legendaryCopyRule=activeSlateCrafterTab!=="legendary"?"":fallbackName==="Sparks of Moth Fire"?$("[data-sparks-copy-rule]")?.value||sparksOfMothFireCopyRules[0]:fallbackName==="Residence of Stars"?residenceOfStarsCopyRule:fallbackName==="When Sparks Set the Prairie Ablaze"?prairieAblazeCopyRule:fallbackName==="Space Rift"?$("[data-legendary-copy-rule]")?.value||spaceRiftCopyRules[0]:"";
    const legendaryAffixSelects=[...document.querySelectorAll("[data-legendary-affix]")];
    const standardAffixSelects=[...document.querySelectorAll("#slate-crafter-body .slate-affix-row select:not([data-banishment-effect])")];
    const affixGroups=activeSlateCrafterTab==="legendary"?null:{fixed:standardAffixSelects.slice(0,2).map((select)=>select.value),[activeSlateCrafterTab==="judgment"?"brand":"random"]:standardAffixSelects.slice(2).map((select)=>select.value)};
    const affixes=legendaryCopyRule?[legendaryCopyRule]:legendaryAffixSelects.length?legendaryAffixSelects.map((select)=>select.value):standardAffixSelects.map((select)=>select.value).filter(Boolean);
    const crafted={ id:globalThis.crypto?.randomUUID?.()||`slate-${Date.now()}`, name:nameInput?.value.trim()||(activeSlateCrafterTab==="legendary"&&originalSlate?.template===fallbackName?originalSlate.name:fallbackName), ...(activeSlateCrafterTab==="legendary"?{template:fallbackName}:{}), god:activeSlateCrafterTab==="judgment"?"Nether King":selectedSlateGod, shape:activeShape?.dataset.craftShape||"single", rotation:Number(preview?.dataset.rotation||0), flipX:Number(preview?.dataset.flipX||1), flipY:Number(preview?.dataset.flipY||1), affixes, ...(affixGroups?{affixGroups}:{}), ...(legendaryCopyRule?{copyRule:legendaryCopyRule}:{}), ...(activeSlateCrafterTab==="judgment"&&selectedNetherSlateType==="Offspring"&&$("[data-banishment-effect]")?.value?{authorityEffect:$("[data-banishment-effect]").value}:{}), rarity:activeSlateCrafterTab==="craft"?"magic":"legendary", icon:previewImage?.getAttribute("src")||"" };
    plannerState.slates.inventory ||= [];
    const editedIndex=editingCraftedSlateId?plannerState.slates.inventory.findIndex((slate)=>slate.id===editingCraftedSlateId):-1;
    let removedFromGrid=false;
    if(editedIndex>=0){
      crafted.id=editingCraftedSlateId;
      plannerState.slates.inventory[editedIndex]=crafted;
      if(equippedSlateIds.has(crafted.id)){
        const boardSlate=craftedSlateForBoard(crafted),current=slatePlacements[crafted.id];
        if(current&&!canPlaceSlate(boardSlate,current,slatePlacements,slatesForBoard())){
          let placement=null;
          for(let row=1;row<=6&&!placement;row+=1)for(let column=1;column<=6&&!placement;column+=1){
            const candidate={...current,row,column};
            if(canPlaceSlate(boardSlate,candidate,slatePlacements,slatesForBoard()))placement=candidate;
          }
          if(placement)slatePlacements={...slatePlacements,[crafted.id]:placement};
          else { equippedSlateIds.delete(crafted.id); const placements={...slatePlacements}; delete placements[crafted.id]; slatePlacements=placements; parkSlateBesideGrid(boardSlate,crafted.rotation||0,crafted.flipX||1,crafted.flipY||1); removedFromGrid=true; }
        }
      }
    } else plannerState.slates.inventory.push(crafted);
    editingCraftedSlateId=null;
    persistPlannerState();
    renderSlateInventory();
    if(removedFromGrid)renderCandidateViews();
    showToast(removedFromGrid?`${crafted.name} moved beside the grid; its new shape does not fit`:editedIndex>=0?`${crafted.name} updated`:`${crafted.name} added to Slate Inventory`);
  }
  const deleteCraftedSlate=event.target.closest("[data-delete-crafted-slate]");
  if(deleteCraftedSlate){ const id=deleteCraftedSlate.dataset.deleteCraftedSlate; plannerState.slates.inventory=(plannerState.slates.inventory||[]).filter((slate)=>slate.id!==id); equippedSlateIds.delete(id); delete parkedSlates[id]; const placements={...slatePlacements}; delete placements[id]; slatePlacements=placements; persistPlannerState(); renderSlateInventory(); showToast("Slate deleted"); }
  const duplicateCraftedSlate=event.target.closest("[data-duplicate-crafted-slate]");
  if(duplicateCraftedSlate){ const source=(plannerState.slates.inventory||[]).find((slate)=>slate.id===duplicateCraftedSlate.dataset.duplicateCraftedSlate); if(source){ plannerState.slates.inventory.push({...structuredClone(source),id:globalThis.crypto?.randomUUID?.()||`slate-${Date.now()}`,name:`${source.name} Copy`}); persistPlannerState(); renderSlateInventory(); showToast("Slate duplicated"); } }
  const editCraftedSlate=event.target.closest("[data-edit-crafted-slate]");
  if(editCraftedSlate){ const slate=(plannerState.slates.inventory||[]).find((item)=>item.id===editCraftedSlate.dataset.editCraftedSlate); if(slate)openCraftedSlateEditor(slate); }
  const removeCraftedSlate=event.target.closest("[data-remove-crafted-slate]");
  if(removeCraftedSlate){ const id=removeCraftedSlate.dataset.removeCraftedSlate; equippedSlateIds.delete(id); delete parkedSlates[id]; const placements={...slatePlacements}; delete placements[id]; slatePlacements=placements; persistPlannerState(); renderSlateInventory(); showToast("Slate removed from grid"); }
  const slateOptimizeButton=event.target.closest("[data-slate-optimize]");
  if (slateOptimizeButton) { slatePlacements=autoPlaceSlates(slatesForBoard()); parkedSlates={}; equippedSlateIds.clear(); slatesForBoard().forEach((slate)=>equippedSlateIds.add(slate.id)); persistPlannerState(); renderCandidateViews(); showToast("Slates arranged on valid cells"); }
  const slateRotateButton=event.target.closest("[data-slate-rotate]");
  if (slateRotateButton) { const slate=slatesForBoard().find((item)=>item.id===slateRotateButton.dataset.slateRotate); if(slate&&slateTransformRules(slate).rotate){ const parked=!!parkedSlates[slate.id],current=parked?parkedSlates[slate.id]:slatePlacements[slate.id],direction=Number(slateRotateButton.dataset.slateRotateDir||1); if (current) { const candidate={...current,rotation:((current.rotation||0)+direction*90+360)%360}; if(parked){parkedSlates={...parkedSlates,[slate.id]:candidate};persistPlannerState();} else if (canPlaceSlate(slate,candidate,slatePlacements,slatesForBoard())) { slatePlacements={...slatePlacements,[slate.id]:candidate}; persistPlannerState(); if($("#slate-editor").open) renderSlateEditor(slate); } else pickUpTransformedSlate(slate,current,candidate,event.clientX,event.clientY,"Rotated"); } } }
  const slateFlipButton=event.target.closest("[data-slate-flip]");
  if(slateFlipButton){ const slate=slatesForBoard().find((item)=>item.id===slateFlipButton.dataset.slateFlip); if(slate&&slateTransformRules(slate).flip){const parked=!!parkedSlates[slate.id],current=parked?parkedSlates[slate.id]:slatePlacements[slate.id]; if(current){ const axis=slateFlipButton.dataset.slateFlipAxis,candidate={...current,[axis==="y"?"flipY":"flipX"]:-Number(current[axis==="y"?"flipY":"flipX"]||1)}; if(parked){parkedSlates={...parkedSlates,[slate.id]:candidate};persistPlannerState();} else if(canPlaceSlate(slate,candidate,slatePlacements,slatesForBoard())){ slatePlacements={...slatePlacements,[slate.id]:candidate}; persistPlannerState(); } else pickUpTransformedSlate(slate,current,candidate,event.clientX,event.clientY,"Flipped"); } } }
  const slateRemoveButton=event.target.closest("[data-slate-remove]");
  if (slateRemoveButton) { const id=slateRemoveButton.dataset.slateRemove; if (equippedSlateIds.has(id)||parkedSlates[id]) { equippedSlateIds.delete(id); delete parkedSlates[id]; const next={...slatePlacements}; delete next[id]; slatePlacements=next; selectedSlateId=null; slateToolsPosition=null; } else { slatePlacementTarget=id; slateEditMode=true; } persistPlannerState(); renderCandidateViews(); }
  const slateCellButton=event.target.closest("[data-slate-cell]");
  if (slateCellButton && slateEditMode && slatePlacementTarget) { const slate=slatesForBoard().find((item)=>item.id===slatePlacementTarget),previous=slatePlacements[slate.id]||parkedSlates[slate.id]||{}; const [column,row]=slateCellButton.dataset.slateCell.split(",").map(Number); const candidate={column,row,rotation:previous.rotation||0,flipX:previous.flipX||1,flipY:previous.flipY||1}; if (canPlaceSlate(slate,candidate,slatePlacements,slatesForBoard())) { slatePlacements={...slatePlacements,[slate.id]:candidate}; equippedSlateIds.add(slate.id); delete parkedSlates[slate.id]; persistPlannerState(); renderCandidateViews(); } else showToast("That slate overlaps or leaves the statue board"); }
  const skillButton = event.target.closest("[data-skill-index]");
  if (skillButton) { selectedSkillIndex = Number(skillButton.dataset.skillIndex); $("#skills-view").classList.add("editor-open"); renderSkills(); }
  const removeSkillButton = event.target.closest("[data-remove-skill]");
  if (removeSkillButton) {
    const name = removeSkillButton.dataset.removeSkill;
    const customIndex = plannerState.skills.customSetups.findIndex((setup) => setup.name === name);
    if (customIndex >= 0) plannerState.skills.customSetups.splice(customIndex, 1); else plannerState.skills.setupEnabled[name] = false;
    delete plannerState.skills.customSupports[name]; delete plannerState.skills.supportOrder[name]; delete plannerState.skills.skillLevels[name];
    selectedSkillIndex = 0; persistPlannerState(); renderCandidateViews(); showToast(`${toastText(name)} removed`);
  }
  if (event.target.closest("[data-reset-skills]")) {
    for (const setup of currentEditedSetups()) plannerState.skills.setupEnabled[setupStateKey(setup)] = false;
    plannerState.skills.customSetups = []; plannerState.skills.customSupports = {}; plannerState.skills.supportOrder = {}; plannerState.skills.skillLevels = {}; plannerState.skills.supportLevels = {}; plannerState.skills.specialSupportConfigs = {}; plannerState.skills.supportEnabled = {}; plannerState.skills.setupOrder = null; plannerState.skills.boardSlots = {skills:[],auras:[]};
    disabledSupportNames.clear(); selectedSkillIndex = 0; persistPlannerState(); renderCandidateViews(); showToast("Skills reset to empty");
  }
  const openCatalogButton = event.target.closest("[data-open-catalog]");
  if (openCatalogButton) {
    selectorKind = openCatalogButton.dataset.openCatalog; selectorTargetRow = Number(openCatalogButton.dataset.selectorRow || 0); selectorTargetSupportSlot = openCatalogButton.dataset.selectorSupportSlot === undefined ? null : Number(openCatalogButton.dataset.selectorSupportSlot);
    const board = selectorBoardSetups(selectorKind === "support");
    const target = board[selectorTargetRow]; if (target) selectedSkillIndex = currentEditedSetups().findIndex((setup) => setupStateKey(setup) === setupStateKey(target));
    selectorTargetSetupName = target ? setupStateKey(target) : null;
    selectorQuery = ""; selectorChoiceIndex = -1; selectorLevel = 20; selectorSpecialConfig = null;
    if (selectorKind === "skill" && target) {
      selectorChoiceIndex = selectorEntries().findIndex((entry) => entry.name === target.name);
      // The selector edits the saved base level; "+N level" sources are added on top by the planner.
      selectorLevel = selectorBaseLevel(target);
    } else if (selectorKind === "support" && target && selectorTargetSupportSlot !== null) {
      const enabled = userInstalledSupports(target);
      const byName = new Map(enabled.map((support) => [support.name, support]));
      const slots = Array.from({ length: 5 }, () => null);
      (plannerState.skills.supportOrder[setupStateKey(target)] || []).slice(0, 5).forEach((name, index) => { slots[index] = byName.get(name) || null; byName.delete(name); });
      for (const support of byName.values()) { const index = slots.indexOf(null); if (index >= 0) slots[index] = support; }
      const installed = slots[selectorTargetSupportSlot];
      if (installed) {
        selectorChoiceIndex = selectorEntries().findIndex((entry) => entry.name === installed.name);
        selectorLevel = installed.level;
        selectorSpecialConfig = { ...defaultConfigurableSupportConfig(installed.name, installed.effects), ...(normalizeProgressionSupportConfig(installed.name, installed.specialConfig) || {}) };
      }
    }
    $("#skill-selector-search").value = ""; renderSkillSelector(); $("#skill-selector").showModal(); $("#skill-selector-search").focus();
  }
  if (event.target.closest("[data-close-skill-selector]")) $("#skill-selector").close();
  if (event.target.closest("[data-clear-skill-search]")) { selectorQuery = ""; $("#skill-selector-search").value = ""; renderSkillSelector(); $("#skill-selector-search").focus(); }
  if (selectorKind === "follower-skill") { const choice=event.target.closest("[data-selector-choice]"); if(choice){ selectorChoiceIndex=Number(choice.dataset.selectorChoice); renderSkillSelector(); return; } if(event.target.closest("[data-clear-skill-slot]")){ $("#skill-selector").close(); commitFollower(setFollowerSkill(plannerState,followerSelectorSlot,null),"Skill slot cleared"); return; } const confirmFollower=event.target.closest("[data-confirm-skill-selector]"); if(confirmFollower&&!confirmFollower.disabled){ const entry=followerSelectorEntries(plannerState,followerSelectorSlot)[selectorChoiceIndex]; if(entry){ const draft=followerSelectorDraft?.name===entry.name?followerSelectorDraft:followerSkillDraft(plannerState,followerSelectorSlot,entry.name); followerSelectorDraft=null; $("#skill-selector").close(); commitFollower(applyFollowerSkillDraft(plannerState,followerSelectorSlot,draft),`${toastText(entry.name)} equipped`); } return; } }
  if (event.target.closest("[data-clear-skill-slot]")) {
    const selected = selectorTargetSetup();
    if(selectorKind==="hero-support"){
      delete plannerState.hero.heroTraitSupports[activeHeroTraitSupportId];
      delete plannerState.hero.heroTraitSupportLevels[activeHeroTraitSupportId];
      delete plannerState.hero.heroTraitSupportConfigs[activeHeroTraitSupportId];
    } else if (selectorKind === "skill" && (selected?.enabled || selected?.slotInactive)) {
      plannerState.skills.boardSlots=assignSkillBoardSlot(plannerState.skills.boardSlots,activeSkillBoardTab,selectorBoardSetups(),selectorTargetRow,"");
      const selectedKey=setupStateKey(selected), customIndex=plannerState.skills.customSetups.findIndex((setup)=>(setup.instanceId||setup.name)===selectedKey); if(customIndex>=0) plannerState.skills.customSetups.splice(customIndex,1); else plannerState.skills.setupEnabled[selectedKey]=false;
      delete plannerState.skills.customSupports[selectedKey]; delete plannerState.skills.supportOrder[selectedKey];
    } else if (selectorKind === "support" && selected) {
      const selectedKey=setupStateKey(selected), order = [...(plannerState.skills.supportOrder[selectedKey] || userInstalledSupports(selected).map((support)=>support.name))];
      const supportName = order[selectorTargetSupportSlot]; const support=selected.supports.find((item)=>item.enabled && item.name===supportName);
      if(support){ if(support.custom) plannerState.skills.customSupports[selectedKey]=(plannerState.skills.customSupports[selectedKey]||[]).filter((item)=>item.name!==support.name); else plannerState.skills.supportEnabled[supportStateKey(selectedKey,support.name)]=false; }
      while(order.length<5) order.push(""); order[selectorTargetSupportSlot]=""; plannerState.skills.supportOrder[selectedKey]=order.slice(0,5);
    }
    $("#skill-selector").close(); selectedSkillIndex=0; persistPlannerState(); renderCandidateViews(); showToast("Slot cleared");
  }
  const selectorChoice = event.target.closest("[data-selector-choice]");
  if (selectorChoice) { selectorChoiceIndex = Number(selectorChoice.dataset.selectorChoice); const choice=selectorEntries()[selectorChoiceIndex]; const current=selectorTargetSupport(); selectorLevel = current?.name===choice?.name ? current.level : choice?.level || 20; const targetSetup=selectorTargetSetup(), saved=selectorKind==="hero-support" ? (current?.name===choice?.name?plannerState.hero.heroTraitSupportConfigs?.[activeHeroTraitSupportId]:null) : targetSetup ? plannerState.skills.specialSupportConfigs[supportStateKey(setupStateKey(targetSetup),choice?.name)] : null; selectorSpecialConfig = { ...defaultConfigurableSupportConfig(choice?.name, current?.name===choice?.name?current.effects:choice?.effects), ...(saved || {}) }; renderSkillSelector(); }
  const specialTierButton = event.target.closest("[data-special-tier]");
  if (specialTierButton) { const tier=Number(specialTierButton.dataset.specialTier); const tierData=configurableSupportTierData(selectorEntries()[selectorChoiceIndex]?.name)?.find((entry)=>entry.tier===tier); if(tierData){ selectorSpecialConfig={ ...(selectorSpecialConfig || {}), tier, roll:tierData.max }; renderSkillSelector(); } }
  const progressionTierButton = event.target.closest("[data-progression-tier]");
  const affixTierButton = event.target.closest("[data-affix-tier]");
  if (affixTierButton) { const name=selectorEntries()[selectorChoiceIndex]?.name, index=Number(affixTierButton.dataset.affixLine), lines=activationMediumLineConfigs(name,selectorSpecialConfig), line=activationMediumAffixLines(name)?.[index]; if(lines&&line){ const value=affixTierButton.dataset.affixTier, option=value==="off"?null:line.options.find((item)=>item.tier===Number(value)); lines[index]=option?{tier:option.tier,rolls:option.ranges.map((range)=>range.max)}:{tier:null,rolls:[]}; selectorSpecialConfig={...selectorSpecialConfig,lines:activationMediumLineConfigs(name,{...selectorSpecialConfig,lines},option?index:null)}; renderSkillSelector(); } return; }
  if (progressionTierButton) { const tier=Number(progressionTierButton.dataset.progressionTier); const tierData=progressionSupportTierData(selectorEntries()[selectorChoiceIndex]?.name)?.find((entry)=>entry.tier===tier); if(tierData){ const name=selectorEntries()[selectorChoiceIndex]?.name; const next={ ...(selectorSpecialConfig || {}), tier, rolls:tierData.ranges.map((range)=>range.max) }; const choice=(selectorSpecialConfig?.lines||[]).findIndex((line,index)=>line?.tier!=null&&activationMediumAffixLines(name)?.[index]?.choiceGroup); delete next.lines; const lines=activationMediumLineConfigs(name,next,choice>=0?choice:null); selectorSpecialConfig=lines?{...next,lines}:next; renderSkillSelector(); } }
  const activationTriggerTierButton = event.target.closest("[data-activation-trigger-tier]");
  if (activationTriggerTierButton) { const secondaryTier=Number(activationTriggerTierButton.dataset.activationTriggerTier); const tierData=activationMediumSecondaryTierData(selectorEntries()[selectorChoiceIndex]?.name)?.find((entry)=>entry.tier===secondaryTier); if(tierData){ selectorSpecialConfig={ ...(selectorSpecialConfig || {}), secondaryTier, secondaryRoll:tierData.min }; renderSkillSelector(); } }
  const specialStarsButton = event.target.closest("[data-special-stars]");
  if (specialStarsButton) { selectorSpecialConfig={ ...(selectorSpecialConfig || {}), stars:Number(specialStarsButton.dataset.specialStars) }; renderSkillSelector(); }
  const selectorLevelStep = event.target.closest("[data-selector-level-step]");
  if (selectorLevelStep) { selectorLevel = Math.max(1, Math.min(40, selectorLevel + Number(selectorLevelStep.dataset.selectorLevelStep))); renderSkillSelector(); }
  const confirmSelector = event.target.closest("[data-confirm-skill-selector]");
  if (confirmSelector && !confirmSelector.disabled) {
    selectorLevel = Math.max(1, Math.min(40, Number($("#skill-selector-detail [data-selector-level]")?.value) || selectorLevel || 20));
    const entry = selectorEntries()[selectorChoiceIndex];
    if (!entry || selectorKind === "support" && !supportFitsSlot(entry,selectorTargetSupportSlot)) return;
    const selected = selectorTargetSetup();
    if (selectorKind === "hero-support") {
      plannerState.hero.heroTraitSupports[activeHeroTraitSupportId]=entry.name;
      plannerState.hero.heroTraitSupportLevels[activeHeroTraitSupportId]=selectorLevel;
      if(selectorSpecialConfig)plannerState.hero.heroTraitSupportConfigs[activeHeroTraitSupportId]={...selectorSpecialConfig};
      else delete plannerState.hero.heroTraitSupportConfigs[activeHeroTraitSupportId];
      persistPlannerState(); showToast(`${toastText(entry.name)} linked to ${toastText(heroTraitSupportConfig[activeHeroTraitSupportId]?.skill||"trait skill")}`);
    } else if (selectorKind === "skill") {
      const board = selectorBoardSetups();
      const replaced = board[selectorTargetRow];
      if(replaced?.name===entry.name){
        const replacedKey=setupStateKey(replaced);
        plannerState.skills.skillLevels[replacedKey]={baseLevel:selectorLevel};
      } else {
        if(replaced){ const replacedKey=setupStateKey(replaced), customIndex=plannerState.skills.customSetups.findIndex((setup)=>(setup.instanceId||setup.name)===replacedKey); if(customIndex>=0)plannerState.skills.customSetups.splice(customIndex,1);else plannerState.skills.setupEnabled[replacedKey]=false; }
        const magusActiveSlot=activeSkillBoardTab!=="auras"&&entry.role==="aura", disabledExisting=magusActiveSlot?null:currentEditedSetups().find((setup)=>setup.name===entry.name&&!setup.enabled&&!setup.slotInactive);
        if(disabledExisting&&!currentEditedSetups().some((setup)=>setup.name===entry.name&&setup.enabled)){
          const existingKey=setupStateKey(disabledExisting); plannerState.skills.setupEnabled[existingKey]=true; plannerState.skills.skillLevels[existingKey]={baseLevel:selectorLevel};
          plannerState.skills.supportOrder[existingKey]=["","","","",""];
          for(const support of disabledExisting.supports) plannerState.skills.supportEnabled[supportStateKey(existingKey,support.name)]=false;
          selectorTargetSetupName=existingKey;
        } else {
          const instanceId=`skill-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
          plannerState.skills.customSetups.push({ instanceId, role:entry.role, name:entry.name, baseLevel:selectorLevel, addedLevels:0, supports:[], enabledSupportSlots:0, ...(Number.isFinite(entry.sealedManaPercent)?{sealedManaPercent:entry.sealedManaPercent}:{}), ...(magusActiveSlot?{boardTab:"skills"}:{}), source:entry.source, custom:true });
          plannerState.skills.supportOrder[instanceId]=["","","","",""];
          selectorTargetSetupName=instanceId;
        }
      }
      plannerState.skills.boardSlots=assignSkillBoardSlot(plannerState.skills.boardSlots,activeSkillBoardTab,board,selectorTargetRow,selectorTargetSetupName);
      persistPlannerState(); selectedSkillIndex=currentEditedSetups().findIndex((setup)=>setupStateKey(setup)===selectorTargetSetupName); showToast(`${toastText(entry.name)} setup added`);
    } else {
      if (!selected) return;
      const selectedKey=setupStateKey(selected), order=[...(plannerState.skills.supportOrder[selectedKey] || userInstalledSupports(selected).map((support)=>support.name))]; while(order.length<5) order.push("");
      const replaced=selected.supports.find((support)=>support.enabled && support.name===order[selectorTargetSupportSlot]);
      if(replaced && replaced.name!==entry.name){ if(replaced.custom) plannerState.skills.customSupports[selectedKey]=(plannerState.skills.customSupports[selectedKey]||[]).filter((item)=>item.name!==replaced.name); else plannerState.skills.supportEnabled[supportStateKey(selectedKey,replaced.name)]=false; }
      plannerState.skills.customSupports[selectedKey] ||= [];
      const captured=selected.supports.find((support)=>support.name===entry.name && !support.custom);
      const selectedSupportKey=supportStateKey(selectedKey,entry.name);
      plannerState.skills.supportEnabled[selectedSupportKey]=true;
      if (selectorSpecialConfig) plannerState.skills.specialSupportConfigs[selectedSupportKey] = { ...selectorSpecialConfig };
      if(captured) {
        plannerState.skills.supportLevels[selectedSupportKey]=selectorLevel;
      } else {
        const custom=plannerState.skills.customSupports[selectedKey].find((support)=>support.name===entry.name);
        if(custom) custom.level=selectorLevel;
        else plannerState.skills.customSupports[selectedKey].push({ name: entry.name, level: selectorLevel, manaCostMultiplierPercent: specialSupportTierData(entry.name) ? 110 : entry.manaCostMultiplierPercent, effects: structuredClone(entry.effects), custom: true });
      }
      order[selectorTargetSupportSlot]=entry.name; plannerState.skills.supportOrder[selectedKey]=order.slice(0,5);
      persistPlannerState(); showToast(`${toastText(entry.name)} linked to ${toastText(selected.name)}`);
    }
    $("#skill-selector").close(); renderCandidateViews();
  }
  const skillBoardTab = event.target.closest("[data-skill-board-tab]");
  if(skillBoardTab){ activeSkillBoardTab=skillBoardTab.dataset.skillBoardTab; document.querySelectorAll("[data-skill-board-tab]").forEach((button)=>button.classList.toggle("active",button===skillBoardTab)); renderSkills(); }
  const saveEquipmentButton = event.target.closest("[data-save-equipment]");
  if (saveEquipmentButton) {
    const invalid = $("#equipment-inspector").querySelector(":invalid"); if (invalid) { invalid.reportValidity(); return; }
    const slot = saveEquipmentButton.dataset.saveEquipment;
    const editor = $("#equipment-inspector");
    const defenses = Object.fromEntries([...editor.querySelectorAll("[data-item-defense]")].map((input) => [input.dataset.itemDefense, Number(input.value)]).filter(([,value]) => value !== 0));
    plannerState.equipmentOverrides[slot] = { name: editor.querySelector("[data-item-name]").value.trim() || "Unnamed candidate item", energy: Number(editor.querySelector("[data-item-energy]").value), defenses, modifiers: editor.querySelector("[data-item-modifiers]").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) };
    disabledEquipmentSlots.delete(slot); persistPlannerState(); renderCandidateViews(); showToast(`${titleCase(slot)} candidate saved`);
  }
  const restoreEquipmentButton = event.target.closest("[data-restore-equipment]");
  if (restoreEquipmentButton) {
    delete plannerState.equipmentOverrides[restoreEquipmentButton.dataset.restoreEquipment]; persistPlannerState(); renderCandidateViews(); showToast(`${titleCase(restoreEquipmentButton.dataset.restoreEquipment)} restored`);
  }
  const priorityButton = event.target.closest("[data-skill-priority]");
  if (priorityButton) {
    const order = currentEditedSetups().map((setup) => setup.name);
    const index = order.indexOf(priorityButton.dataset.skillName);
    const target = priorityButton.dataset.skillPriority === "up" ? index - 1 : index + 1;
    if (target >= 0 && target < order.length) { [order[index],order[target]] = [order[target],order[index]]; plannerState.skills.setupOrder = order; selectedSkillIndex = target; persistPlannerState(); renderSkills(); renderCharacter(); renderConfiguration(); }
  }
  const addSupportButton = event.target.closest("[data-add-support]");
  if (addSupportButton) {
    const invalid = $("#support-grid").querySelector(":invalid"); if (invalid) { invalid.reportValidity(); return; }
    const setupName = addSupportButton.dataset.addSupport;
    const panel = $("#support-grid");
    const name = panel.querySelector("[data-custom-support-name]").value.trim();
    if (!name) { showToast("Enter a support name"); }
    else {
      const supports = plannerState.skills.customSupports[setupName] || [];
      if (currentEditedSetups().find((setup) => setup.name === setupName).supports.some((support) => support.name === name)) showToast("That support name is already linked");
      else { supports.push({ name, level: Number(panel.querySelector("[data-custom-support-level]").value), manaCostMultiplierPercent: Number(panel.querySelector("[data-custom-support-mana]").value), effects: panel.querySelector("[data-custom-support-effects]").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), custom: true }); plannerState.skills.customSupports[setupName] = supports; persistPlannerState(); renderSkills(); renderCharacter(); showToast(`${toastText(name)} added`); }
    }
  }
  const removeSupportButton = event.target.closest("[data-remove-support]");
  if (removeSupportButton) {
    const setupName = removeSupportButton.dataset.supportSetup;
    plannerState.skills.customSupports[setupName] = (plannerState.skills.customSupports[setupName] || []).filter((support) => support.name !== removeSupportButton.dataset.removeSupport);
    persistPlannerState(); renderSkills(); renderCharacter(); showToast("Custom support removed");
  }
});

document.addEventListener("pointerdown",(event)=>{
  if(kismetDrag?.moved&&event.button===2){event.preventDefault();kismetDrag.duplicate=true;suppressKismetContextMenu=true;kismetDrag.ghost?.classList.add("copying");kismetDrag.element.classList.remove("kismet-drag-source");return;}
  if(supportDrag&&event.button===2){event.preventDefault();supportDrag.duplicate=true;suppressSupportContextMenu=true;supportDrag.ghost?.classList.add("copying");supportDrag.element.classList.remove("support-drag-source");return;}
  const selenaDancePick=event.target.closest("#hero-trait-tree [data-selena-dance-pick]");
  if(selenaDancePick&&event.button===0){
    const from=Number(selenaDancePick.dataset.selenaDancePick),name=heroTreeSelections(plannerState.hero)[from];
    if(name){
      selenaDancePick.setPointerCapture?.(event.pointerId);
      selenaDanceDrag={pointerId:event.pointerId,element:selenaDancePick,from,name,icon:selenaDancePick.querySelector("img")?.getAttribute("src")||"",startX:event.clientX,startY:event.clientY,moved:false,target:null,ghost:null};
    }
    return;
  }
  const inventoryGear=event.target.closest("#equipment-inventory .inventory-item-main[data-equip-inventory]");
  const equippedGear=event.target.closest("#equipment-grid .equipment-item:not(.disabled)[data-equipment-slot]");
  if((inventoryGear||equippedGear)&&event.button===0){
    const slot=equippedGear?.dataset.equipmentSlot;
    const equipped=slot?currentEquipmentImpact().allItems.find((entry)=>entry.slot===slot):null;
    const sourceId=slot?plannerState.equipmentOverrides?.[slot]?.sourceInventoryId:inventoryGear?.dataset.equipInventory;
    const item=inventoryItems().find((entry)=>entry.id===sourceId)||(equipped?inventoryItems().find((entry)=>entry.name===equipped.name&&(entry.slot===slot||canDropGearInSlot(entry,slot))):null);
    if(item){
      const element=inventoryGear||equippedGear;
      element.setPointerCapture?.(event.pointerId);
      gearDrag={pointerId:event.pointerId,element,item,fromSlot:slot||null,startX:event.clientX,startY:event.clientY,moved:false,target:null,ghost:null};
    }
    return;
  }
  const skillSocket = event.target.closest('#skill-groups .skill-primary-socket:not(.empty-skill-slot):not(.trait-granted-socket)');
  if (skillSocket && event.button === 0) {
    const row = Number(skillSocket.dataset.selectorRow);
    if (selectorBoardSetups()[row]) {
      skillSocket.setPointerCapture?.(event.pointerId);
      skillDrag = { pointerId:event.pointerId, element:skillSocket, from:row, tab:activeSkillBoardTab, startX:event.clientX, startY:event.clientY, moved:false, target:null };
    }
    return;
  }
  const supportSocket=event.target.closest('#skill-groups .skill-support-socket:not(.empty-support-socket):not(.trait-granted-socket)');
  if(supportSocket&&event.button===0){
    const row=Number(supportSocket.dataset.selectorRow),slot=Number(supportSocket.dataset.selectorSupportSlot),setup=selectorBoardSetups(true)[row];
    if(setup&&supportSlotsForSetup(setup,plannerState.skills.supportOrder[setupStateKey(setup)])[slot]){
      supportSocket.setPointerCapture?.(event.pointerId);
      supportDrag={pointerId:event.pointerId,element:supportSocket,fromRow:row,fromSlot:slot,setupKey:setupStateKey(setup),tab:activeSkillBoardTab,startX:event.clientX,startY:event.clientY,moved:false,duplicate:false,target:null,ghost:null};
    }
    return;
  }
  const kismetNode=event.target.closest(".pact-tree-node.has-kismet[data-kismet-node]");
  if(kismetNode&&event.button===0&&plannerState.pacts.kismetSlotMode){
    const key=kismetNode.dataset.kismetNode,slot=plannerState.pacts.kismetSlots?.[key];
    const entry=kismetCatalogSs13.find((item)=>item.name===slot?.name&&item.kind===kismetNode.dataset.kismetKind);
    if(entry){
      kismetNode.setPointerCapture?.(event.pointerId);
      kismetDrag={pointerId:event.pointerId,element:kismetNode,key,kind:entry.kind,name:entry.name,icon:entry.icon,startX:event.clientX,startY:event.clientY,moved:false,duplicate:false,target:null,ghost:null};
    }
    return;
  }
  const prismNode=event.target.closest("#talent-stage .installed-prism-node[data-coordinate]");
  if(prismNode&&event.button===0&&!pendingPrismPlacement){
    event.preventDefault();
    prismNode.setPointerCapture?.(event.pointerId);
    prismDrag={pointerId:event.pointerId,element:prismNode,sourceNode:prismNode.previousElementSibling,panel:activeTalentPanel,origin:prismNode.dataset.coordinate,startX:event.clientX,startY:event.clientY,moved:false,target:null};
    return;
  }
  const piece=event.target.closest(".slate-stage .slate-piece[data-slate-id]");
  if(!piece||event.button!==0)return;
  const parked=piece.classList.contains("parked-slate"),placement=parked?parkedSlates[piece.dataset.slateId]:slatePlacements[piece.dataset.slateId];
  if(!placement)return;
  event.preventDefault();
  piece.setPointerCapture?.(event.pointerId);
  const rect=piece.getBoundingClientRect();
  slateDrag={pointerId:event.pointerId,id:piece.dataset.slateId,element:piece,startX:event.clientX,startY:event.clientY,originLeft:rect.left,originTop:rect.top,parked,placement:{...placement},rotation:placement.rotation||0,moved:false,lastWheelAt:0};
});
function flipDraggedSlate(axis){
  if(!slateDrag)return false;
  const slate=slatesForBoard().find((item)=>item.id===slateDrag.id);
  if(!slate||!slateTransformRules(slate).flip)return false;
  const key=axis==="y"?"flipY":"flipX";
  slateDrag.placement[key]=-(slateDrag.placement[key]||1);
  refreshDraggedSlateShape(slate);
  return true;
}
function rotateDraggedSlate(direction){
  if(!slateDrag)return false;
  const slate=slatesForBoard().find((item)=>item.id===slateDrag.id);
  if(!slate||!slateTransformRules(slate).rotate)return false;
  slateDrag.rotation=(slateDrag.rotation+direction*90+360)%360;
  refreshDraggedSlateShape(slate);
  return true;
}
function refreshDraggedSlateShape(slate){
  slateDrag.moved=true;
  slateDrag.element.classList.add("dragging");
  hidePlannerTooltip();
  const flipX=slateDrag.placement.flipX||1,flipY=slateDrag.placement.flipY||1;
  const [width,height]=slateSize(slate,slateDrag.rotation,flipX,flipY),offsets=slateOffsets(slate,slateDrag.rotation,flipX,flipY);
  slateDrag.element.style.setProperty("--slate-width",width);
  slateDrag.element.style.setProperty("--slate-height",height);
  slateDrag.element.style.setProperty("--slate-rotation",`${slateDrag.rotation}deg`);
  slateDrag.element.style.setProperty("--slate-flip-x",flipX);
  slateDrag.element.style.setProperty("--slate-flip-y",flipY);
  [...slateDrag.element.querySelectorAll(":scope>i")].forEach((cell,index)=>{ const [column,row]=offsets[index]; cell.style.setProperty("--piece-column",column); cell.style.setProperty("--piece-row",row); });
}

document.addEventListener("mousedown",(event)=>{
  if(!slateDrag||![1,3,4].includes(event.button))return;
  event.preventDefault();
  flipDraggedSlate(event.button===4?"y":"x");
});
document.addEventListener("mouseup",(event)=>{ if(slateDrag&&[1,3,4].includes(event.button))event.preventDefault(); });
document.addEventListener("keydown",(event)=>{
  const action=slateShortcutAction(event); if(!action)return;
  if(slateDrag){ if(action.rotate?rotateDraggedSlate(action.rotate):flipDraggedSlate(action.flip))event.preventDefault(); return; }
  if(!selectedSlateId)return;
  const selector=action.rotate?`[data-slate-rotate-dir="${action.rotate}"]`:`[data-slate-flip-axis="${action.flip}"]`;
  const button=document.querySelector(`.slate-quick-tools ${selector}`); if(!button||!button.getClientRects().length)return;
  event.preventDefault(); button.click();
});
document.addEventListener("auxclick",(event)=>{ if(slateDrag&&[1,3,4].includes(event.button))event.preventDefault(); });

$("#slate-board").addEventListener("wheel",(event)=>{
  if(!slateDrag){
    if(!selectedSlateId||!document.querySelector(".slate-quick-tools")||!event.target.closest(".slate-stage"))return;
    const slate=slatesForBoard().find((item)=>item.id===selectedSlateId);
    if(!slate||(!slateTransformRules(slate).rotate&&!slateTransformRules(slate).flip))return;
    event.preventDefault();
    const now=performance.now(); if(now-slateMenuLastWheelAt<80)return; slateMenuLastWheelAt=now;
    const parked=!!parkedSlates[selectedSlateId],current=parked?parkedSlates[selectedSlateId]:slatePlacements[selectedSlateId]; if(!current)return;
    const pedigree=slate.template==="Pedigree of Gods"||slate.name==="Pedigree of Gods";
    const axis=event.deltaY>=0?"flipX":"flipY";
    const candidate=pedigree?{...current,[axis]:-(current[axis]||1)}:{...current,rotation:((current.rotation||0)+(event.deltaY>=0?90:-90)+360)%360};
    if(parked){parkedSlates={...parkedSlates,[selectedSlateId]:candidate};persistPlannerState();renderSlates();}
    else if(canPlaceSlate(slate,candidate,slatePlacements,slatesForBoard())){ slatePlacements={...slatePlacements,[selectedSlateId]:candidate}; persistPlannerState();renderSlates(); }
    else pickUpTransformedSlate(slate,current,candidate,event.clientX,event.clientY,pedigree?"Flipped":"Rotated");
    return;
  }
  event.preventDefault();
  const now=performance.now(); if(now-slateDrag.lastWheelAt<80)return; slateDrag.lastWheelAt=now;
  flipDraggedSlate((event.deltaY||event.deltaX)>=0?"x":"y");
},{passive:false});

function finishSlateDrag(event,cancelled=false){
  if(!slateDrag||event.pointerId!==slateDrag.pointerId)return;
  const drag=slateDrag; slateDrag=null;
  drag.element.classList.remove("dragging"); drag.element.style.transform="";
  if(!drag.moved)return;
  suppressSlateClick=true;
  setTimeout(()=>{ suppressSlateClick=false; },0);
  if(cancelled){ renderSlates(); showToast("Slate returned to its original position"); return; }
  const stage=drag.element.closest(".slate-stage"),board=stage?.querySelector(".divinity-board");
  if(!stage||!board)return;
  const boardRect=board.getBoundingClientRect(),stageRect=stage.getBoundingClientRect(),cell=boardRect.width/6,dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  const candidate={column:Math.round((drag.originLeft+dx-boardRect.left)/cell)+1,row:Math.round((drag.originTop+dy-boardRect.top)/cell)+1,rotation:drag.rotation,flipX:drag.placement.flipX||1,flipY:drag.placement.flipY||1};
  const slate=slatesForBoard().find((item)=>item.id===drag.id);
  const overBoard=event.clientX>=boardRect.left&&event.clientX<=boardRect.right&&event.clientY>=boardRect.top&&event.clientY<=boardRect.bottom;
  const overStage=event.clientX>=stageRect.left&&event.clientX<=stageRect.right&&event.clientY>=stageRect.top&&event.clientY<=stageRect.bottom;
  if(slate&&overBoard&&canPlaceSlate(slate,candidate,slatePlacements,slatesForBoard())){
    slatePlacements={...slatePlacements,[drag.id]:candidate}; equippedSlateIds.add(drag.id); delete parkedSlates[drag.id]; persistPlannerState(); showToast("Slate placed on grid");
  } else if(slate&&overStage&&!overBoard){
    const [width,height]=slateSize(slate,drag.rotation,drag.placement.flipX||1,drag.placement.flipY||1);
    let x=drag.originLeft+dx-stageRect.left,y=drag.originTop+dy-stageRect.top;
    const boardLeft=boardRect.left-stageRect.left,boardTop=boardRect.top-stageRect.top;
    const clamp=(value,max)=>Math.max(0,Math.min(max,value)),pieceWidth=width*cell,pieceHeight=height*cell;
    x=clamp(x,stageRect.width-pieceWidth);y=clamp(y,stageRect.height-pieceHeight);
    if(x<boardLeft+boardRect.width&&x+pieceWidth>boardLeft&&y<boardTop+boardRect.height&&y+pieceHeight>boardTop){
      const alternatives=[];
      if(boardLeft>=pieceWidth)alternatives.push([boardLeft-pieceWidth,y]);
      if(stageRect.width-boardLeft-boardRect.width>=pieceWidth)alternatives.push([boardLeft+boardRect.width,y]);
      if(boardTop>=pieceHeight)alternatives.push([x,boardTop-pieceHeight]);
      if(stageRect.height-boardTop-boardRect.height>=pieceHeight)alternatives.push([x,boardTop+boardRect.height]);
      alternatives.sort((a,b)=>(a[0]-x)**2+(a[1]-y)**2-(b[0]-x)**2-(b[1]-y)**2);
      if(alternatives.length)[x,y]=alternatives[0];
    }
    parkedSlates={...parkedSlates,[drag.id]:{x:Math.round(x/stageRect.width*10000)/100,y:Math.round(y/stageRect.height*10000)/100,rotation:drag.rotation,flipX:drag.placement.flipX||1,flipY:drag.placement.flipY||1}};
    equippedSlateIds.delete(drag.id); const next={...slatePlacements};delete next[drag.id];slatePlacements=next;
    persistPlannerState(); showToast("Slate parked beside the grid");
  } else { renderSlates(); showToast("That slate does not fit there"); }
}
function finishGearDrag(event,cancelled=false){
  if(!gearDrag||event.pointerId!==gearDrag.pointerId)return;
  const drag=gearDrag;gearDrag=null;
  drag.element.classList.remove("gear-drag-source");
  drag.target?.classList.remove("gear-drop-target");
  drag.ghost?.remove();
  document.querySelectorAll(".gear-drop-eligible").forEach((element)=>element.classList.remove("gear-drop-eligible","gear-drop-target"));
  if(!drag.moved)return;
  suppressGearClick=true;
  setTimeout(()=>{suppressGearClick=false;},0);
  const pointed=cancelled?null:document.elementFromPoint(event.clientX,event.clientY);
  const targetSlot=pointed?.closest("#equipment-grid [data-equipment-slot]")?.dataset.equipmentSlot;
  if(targetSlot&&canDropGearInSlot(drag.item,targetSlot)){
    if(targetSlot!==drag.fromSlot)equipInventoryItem(drag.item,targetSlot);
    return;
  }
  if(drag.fromSlot&&pointed?.closest("#equipment-inventory")){
    disabledEquipmentSlots.add(drag.fromSlot);
    persistPlannerState();renderCandidateViews();showToast(`${toastText(drag.item.name)} unequipped`);
    return;
  }
  showToast("Invalid drop · item returned to its original place");
}
function finishSkillDrag(event,cancelled=false){
  if (!skillDrag || event.pointerId !== skillDrag.pointerId) return;
  const drag = skillDrag;
  skillDrag = null;
  drag.target?.classList.remove("skill-drop-target");
  drag.element.classList.remove("skill-dragging");
  drag.element.style.transform = "";
  if (!drag.moved) return;
  suppressSkillClick = true;
  setTimeout(() => { suppressSkillClick = false; }, 0);
  const target = cancelled ? null : document.elementFromPoint(event.clientX, event.clientY)?.closest("#skill-groups [data-skill-board-row]");
  const to = target ? Number(target.dataset.skillBoardRow) : -1;
  if (drag.tab !== activeSkillBoardTab || to < 0) {
    showToast("Invalid drop · skill returned to its original slot");
    return;
  }
  if (to === drag.from) return;
  const rows = selectorBoardSetups();
  plannerState.skills.boardSlots = moveSkillBoardSlot(plannerState.skills.boardSlots, drag.tab, rows, drag.from, to);
  persistPlannerState();
  renderCandidateViews();
  const label = drag.tab === "auras" ? "Auras" : "Active skills";
  showToast(rows[to] ? `${label} swapped` : `${label} moved`);
}
function finishSupportDrag(event,cancelled=false){
  if(!supportDrag||event.pointerId!==supportDrag.pointerId||(!cancelled&&event.pointerType==="mouse"&&event.button!==0))return;
  const drag=supportDrag;supportDrag=null;
  document.body.classList.remove("support-dragging");
  if(drag.duplicate)setTimeout(()=>{suppressSupportContextMenu=false;},300);
  drag.target?.classList.remove("support-drop-target");
  drag.element.classList.remove("support-drag-source");
  drag.ghost?.remove();
  if(!drag.moved)return;
  suppressSupportClick=true;setTimeout(()=>{suppressSupportClick=false;},400);
  const target=cancelled?null:document.elementFromPoint(event.clientX,event.clientY)?.closest("#skill-groups .skill-support-socket:not(:disabled)");
  if(!target||drag.tab!==activeSkillBoardTab){showToast("Invalid drop · support returned to its slot");return;}
  const rows=selectorBoardSetups(true),fromSetup=rows[drag.fromRow],toSetup=rows[Number(target.dataset.selectorRow)];
  if(!fromSetup||!toSetup||setupStateKey(fromSetup)!==drag.setupKey){showToast("The skill board changed during the drag");return;}
  const result=transferSupportSlot(plannerState.skills,fromSetup,drag.fromSlot,toSetup,Number(target.dataset.selectorSupportSlot),{duplicate:drag.duplicate});
  if(result.error){showToast(result.error);return;}
  if(result.action==="unchanged")return;
  plannerState.skills=result.skills;
  persistPlannerState();renderCandidateViews();
  showToast(`${drag.duplicate?"Support duplicated":result.action==="swapped"?"Supports swapped":"Support moved"} to ${toastText(toSetup.name)}`);
}
function finishSelenaDanceDrag(event,cancelled=false){
  if(!selenaDanceDrag||event.pointerId!==selenaDanceDrag.pointerId)return;
  const drag=selenaDanceDrag;selenaDanceDrag=null;
  drag.element.classList.remove("selena-dance-drag-source");
  drag.ghost?.remove();
  document.querySelectorAll("#hero-trait-tree [data-selena-dance-row]").forEach((element)=>element.classList.remove("selena-dance-drop-eligible","selena-dance-drop-blocked","selena-dance-drop-target"));
  if(!drag.moved)return;
  suppressSelenaDanceClick=true;setTimeout(()=>{suppressSelenaDanceClick=false;},0);
  const target=cancelled?null:document.elementFromPoint(event.clientX,event.clientY)?.closest("#hero-trait-tree [data-selena-dance-row]");
  if(!target){showToast("Invalid drop · trait returned to its row");return;}
  const to=Number(target.dataset.selenaDanceRow);
  if(to===drag.from)return;
  const heroId=plannerState.hero.selectedHeroId,rules=heroTreeRules(plannerState.hero,heroId),before=heroTreeSelections(plannerState.hero,heroId),result=rules.move(before,drag.from,to);
  if(result.error){showToast(result.error);return;}
  const other=before[to];
  commitTreeTraits(heroId,result.rows);
  showToast(`Moved ${drag.name} under ${rules.rowName(to)}${other?` · ${other} moved under ${rules.rowName(drag.from)}`:""}`);
}
function finishKismetDrag(event,cancelled=false){
  if(!kismetDrag||event.pointerId!==kismetDrag.pointerId||(!cancelled&&event.pointerType==="mouse"&&event.button!==0))return;
  const drag=kismetDrag;kismetDrag=null;
  drag.target?.classList.remove("kismet-drop-target");
  drag.element.classList.remove("kismet-drag-source");
  drag.ghost?.remove();
  if(drag.duplicate)setTimeout(()=>{suppressKismetContextMenu=false;},300);
  if(!drag.moved)return;
  suppressKismetClick=true;setTimeout(()=>{suppressKismetClick=false;},400);
  const pointed=cancelled?null:document.elementFromPoint(event.clientX,event.clientY)?.closest(".pact-tree-node[data-kismet-node]");
  const target=pointed&&pointed.dataset.kismetKind===drag.kind&&(pointed.classList.contains("pact-tree-extra")||pointed.getAttribute("aria-pressed")==="true")?pointed:null;
  if(!target){showToast("Invalid drop · Kismet returned to its slot");return;}
  const result=transferKismetSlot(plannerState.pacts.kismetSlots,drag.key,target.dataset.kismetNode,{duplicate:drag.duplicate});
  if(result.error){showToast(result.error);return;}
  if(result.action==="unchanged")return;
  // A move or copy that would put the page past the game's install limits is refused (src/pact-limits.js).
  const limitsBefore=resolvePactLimits({...plannerState.pacts,kismetSlotMode:true},pactCharacter()),limitsAfter=resolvePactLimits({...plannerState.pacts,kismetSlotMode:true,kismetSlots:result.slots},pactCharacter());
  if(limitsAfter.excludedKismets.length>limitsBefore.excludedKismets.length){showToast(kismetInstallBlock({...plannerState.pacts,kismetSlotMode:true},"__drag__",drag.kind,pactCharacter())||`${drag.kind==="micro"?"Micro Fate":"Medium Destiny"} limit reached`);return;}
  plannerState.pacts.kismetSlots=result.slots;
  hidePlannerTooltip();refreshPactCandidate();
  showToast(`Kismet ${result.action}`);
}
function finishPrismDrag(event,cancelled=false){
  if(!prismDrag||event.pointerId!==prismDrag.pointerId)return;
  const drag=prismDrag;prismDrag=null;
  drag.target?.classList.remove("prism-drop-target");
  drag.element.classList.remove("prism-dragging");
  drag.sourceNode?.classList.remove("prism-source-revealed");
  drag.element.style.transform="";
  if(!drag.moved)return;
  suppressPrismClick=true;
  setTimeout(()=>{suppressPrismClick=false;},0);
  const target=cancelled?null:document.elementFromPoint(event.clientX,event.clientY)?.closest("#talent-stage .talent-node[data-coordinate]");
  const coordinate=target?.dataset.coordinate;
  const valid=coordinate&&drag.panel===activeTalentPanel&&professionTreeLayoutsAllSs13[drag.panel]?.nodes.some((node)=>node.coordinate.join(",")===coordinate);
  if(!valid){showToast("Invalid drop · Prism returned to its original node");return;}
  if(coordinate===drag.origin)return;
  const item=plannerState.talents.prismInventory.find((entry)=>entry.id===plannerState.talents.installedPrisms?.[drag.panel]);
  clearInverseReflectedRanks(drag.panel,item,drag.origin);
  clearInverseReflectedRanks(drag.panel,item,coordinate);
  plannerState.talents.installedPrismNodes[drag.panel]=coordinate;
  talentRanks.set(`${drag.panel}:${coordinate}`,0);
  if(item?.type==="inverse")reconcileTalentRanksAfterPrismChange(drag.panel);
  persistPlannerState();renderCandidateViews();showToast(`Prism moved to node ${coordinate}`);
}
document.addEventListener("pointerup",(event)=>{finishGearDrag(event);finishSkillDrag(event);finishSupportDrag(event);finishKismetDrag(event);finishPrismDrag(event);finishSlateDrag(event);finishSelenaDanceDrag(event);});
document.addEventListener("pointercancel",(event)=>{finishGearDrag(event,true);finishSkillDrag(event,true);finishSupportDrag(event,true);finishKismetDrag(event,true);finishPrismDrag(event,true);finishSlateDrag(event,true);finishSelenaDanceDrag(event,true);});
document.addEventListener("lostpointercapture",(event)=>{
  if(skillDrag?.pointerId===event.pointerId)finishSkillDrag(event,true);
  if(supportDrag?.pointerId===event.pointerId)finishSupportDrag(event,true);
  if(kismetDrag?.pointerId===event.pointerId)finishKismetDrag(event,true);
  if(selenaDanceDrag?.pointerId===event.pointerId)finishSelenaDanceDrag(event,true);
});
document.addEventListener("dragstart",(event)=>{if(event.target.closest("#talent-stage .installed-prism-node,#equipment-grid,#equipment-inventory,#skill-groups .skill-support-socket,.pact-tree-node.has-kismet,#hero-trait-tree [data-selena-dance-pick]"))event.preventDefault();});
document.addEventListener("click",(event)=>{if(suppressPrismClick&&event.target.closest("#talent-stage")){event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener("click",(event)=>{if(suppressSkillClick&&event.target.closest("#skill-groups")){event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener("click",(event)=>{if(suppressSupportClick&&event.target.closest("#skill-groups")){suppressSupportClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener("click",(event)=>{if(suppressKismetClick&&event.target.closest("#pactspirits")){suppressKismetClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener("click",(event)=>{if(suppressGearClick&&event.target.closest("#equipment-grid,#equipment-inventory")){event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener("click",(event)=>{if(suppressSelenaDanceClick&&event.target.closest("#hero-trait-tree")){suppressSelenaDanceClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
// Best-case assumptions: the section's open state survives re-renders; "Reset to best case" turns every switch back on (the
// overrides are cleared, and so is a stored "off" for the same ids in the conditions).
document.addEventListener("click", (event) => {
  const summary = event.target.closest(".best-case-assumptions > summary");
  if (summary) bestCaseAssumptionsOpen = !summary.parentElement.open;
  if (!event.target.closest("[data-best-case-reset]")) return;
  event.preventDefault();
  for (const item of currentPlanner().bestCaseAssumptions || []) if (plannerState.combat.conditions[item.toggle] === false) delete plannerState.combat.conditions[item.toggle];
  plannerState.combat.bestCaseOverrides = {};
  bestCaseAssumptionsOpen = true;
  persistPlannerState(); renderConfiguration();
});
// Config card sections keep their open state across re-renders; a choice button pins that option of an exclusive group
// (combat.bestCaseOverrides; src/planner.js exclusiveChoicePins), and picking the best-case option clears the pin.
document.addEventListener("click", (event) => {
  const summary = event.target.closest("[data-config-section] > summary");
  if (summary && summary.parentElement.dataset.configSection !== "assumptions") configSectionOpen[summary.parentElement.dataset.configSection] = !summary.parentElement.open;
  const button = event.target.closest("[data-config-choice]");
  if (!button) return;
  const group = (currentPlanner().assumptions || []).find((item) => item.group === button.dataset.configChoice);
  const option = group?.compared?.[Number(button.dataset.choiceIndex)];
  if (!option || option.label === group.chosen) return;
  const overrides = { ...(plannerState.combat.bestCaseOverrides || {}) };
  for (const key of Object.keys(option.overrides || {})) { delete overrides[key]; delete plannerState.combat.conditions[key]; }
  if (option.label !== (group.best ?? group.chosen)) Object.assign(overrides, option.overrides);
  plannerState.combat.bestCaseOverrides = overrides;
  persistPlannerState(); renderConfiguration();
});

document.addEventListener("click", (event) => {
  if (!selectedSlateId || !talentSlateMode || event.target.closest("[data-slate-id],.slate-quick-tools")) return;
  selectedSlateId = null;
  slateToolsPosition = null;
  if (!slateEditMode) slatePlacementTarget = null;
  renderSlates();
});

$("#skill-selector-search").addEventListener("input", (event) => { selectorQuery = event.target.value.trim(); renderSkillSelector(); });
$("#kismet-search").addEventListener("input",renderKismetChoices);
$("#kismet-roll-controls").addEventListener("input",(event)=>{
  const target=event.target.closest("[data-kismet-roll-range],[data-kismet-roll-number]");
  if(!target)return;
  const index=Number(target.dataset.kismetRollRange??target.dataset.kismetRollNumber),entry=kismetCatalogSs13.find((item)=>item.name===selectedKismetName),control=entry&&kismetRollControls(entry)[index];
  if(!control)return;
  const value=Number(target.value);
  if(!Number.isFinite(value)||value<control.min||value>control.max)return;
  selectedKismetRolls[index]=value;
  const companion=$(target.matches("[data-kismet-roll-range]")?`[data-kismet-roll-number="${index}"]`:`[data-kismet-roll-range="${index}"]`);
  if(companion)companion.value=value;
  const output=$(`[data-kismet-roll-output="${index}"]`);if(output)output.textContent=value;
  renderKismetPreview();
});
$("#kismet-roll-controls").addEventListener("change",(event)=>{
  const target=event.target.closest("[data-kismet-roll-number]");if(!target)return;
  const entry=kismetCatalogSs13.find((item)=>item.name===selectedKismetName);if(!entry)return;
  const index=Number(target.dataset.kismetRollNumber),rolls=[...selectedKismetRolls];rolls[index]=target.value;
  selectedKismetRolls=normalizeKismetRolls(entry,rolls);
  target.value=selectedKismetRolls[index];
  $(`[data-kismet-roll-range="${index}"]`).value=selectedKismetRolls[index];
  $(`[data-kismet-roll-output="${index}"]`).textContent=selectedKismetRolls[index];
  renderKismetPreview();
});
$("#kismet-crafter").addEventListener("close",()=>{activeKismetSlot=null;});
$("#hero-selector-search").addEventListener("input",(event)=>{ heroSelectorQuery=event.target.value; renderHeroSelector(); });
$("#follower-selector-search").addEventListener("input",(event)=>{ followerSelectorQuery=event.target.value; renderFollowerSelector(); });
$("#follower-selector").addEventListener("click",(event)=>{ if(event.target===event.currentTarget) event.currentTarget.close(); });
$("#sage-scent-search").addEventListener("input",(event)=>{ sageScentQuery=event.target.value; renderSageScentSelector(); });
$("#hero-selector").addEventListener("click",(event)=>{ if(event.target===event.currentTarget) event.currentTarget.close(); });
$("#sage-scent-selector").addEventListener("click",(event)=>{ if(event.target===event.currentTarget) event.currentTarget.close(); });
$("#carino-ammo-selector").addEventListener("click",(event)=>{ if(event.target===event.currentTarget) event.currentTarget.close(); });
$("#carino-ammo-search").addEventListener("input",(event)=>{ carinoAmmoQuery=event.target.value.trim(); renderCarinoAmmoSelector(); });
$("#skill-selector-detail").addEventListener("input", (event) => { if (event.target.matches("[data-special-roll],[data-special-roll-number]")) { const entry=selectorEntries()[selectorChoiceIndex]; const tier=configurableSupportTierData(entry?.name)?.find((item)=>item.tier===selectorSpecialConfig?.tier); if(!tier)return; const roll=Math.max(tier.min,Math.min(tier.max,Number(event.target.value))); selectorSpecialConfig={ ...selectorSpecialConfig, roll }; const range=$("#skill-selector-detail [data-special-roll]"), numberInput=$("#skill-selector-detail [data-special-roll-number]"), output=$("#skill-selector-detail .special-roll-control output"); if(range)range.value=roll;if(numberInput)numberInput.value=roll;if(output)output.textContent=`${roll}%`; } });
$("#skill-selector-detail").addEventListener("input", (event) => { if (!event.target.matches("[data-affix-roll],[data-affix-roll-number]")) return; const name=selectorEntries()[selectorChoiceIndex]?.name, index=Number(event.target.dataset.affixRoll??event.target.dataset.affixRollNumber), rollIndex=Number(event.target.dataset.affixRollIndex), lines=activationMediumLineConfigs(name,selectorSpecialConfig), option=activationMediumAffixLines(name)?.[index]?.options.find((item)=>item.tier===lines?.[index]?.tier), range=option?.ranges[rollIndex]; if(!range)return; const value=Math.max(range.min,Math.min(range.max,Number(event.target.value))); if(!Number.isFinite(value))return; lines[index]={...lines[index],rolls:Object.assign([...lines[index].rolls],{[rollIndex]:value})}; selectorSpecialConfig={...selectorSpecialConfig,lines}; const block=event.target.closest(".special-roll-control"); for(const input of block?.querySelectorAll("input")||[]) if(input!==event.target) input.value=value; const output=block?.querySelector("output"); if(output) output.textContent=String(value); const label=block?.previousElementSibling?.querySelector("strong"); if(label) label.textContent=String(value); });
$("#skill-selector-detail").addEventListener("change", (event) => { if (event.target.matches("[data-affix-roll],[data-affix-roll-number]")) renderSkillSelector(); });
$("#skill-selector-detail").addEventListener("input", (event) => { if (!event.target.matches("[data-progression-roll],[data-progression-roll-number]")) return; const entry=selectorEntries()[selectorChoiceIndex], tier=progressionSupportTierData(entry?.name)?.find((item)=>item.tier===selectorSpecialConfig?.tier), index=Number(event.target.dataset.progressionRoll??event.target.dataset.progressionRollNumber), range=tier?.ranges[index]; if(!range)return; const value=Math.max(range.min,Math.min(range.max,Number(event.target.value))); const rolls=[...(selectorSpecialConfig.rolls||tier.ranges.map((item)=>item.max))]; rolls[index]=value; selectorSpecialConfig={...selectorSpecialConfig,rolls}; const block=event.target.closest(".special-roll-control"); for(const input of block?.querySelectorAll("input")||[])input.value=value; const output=block?.querySelector("output");if(output)output.textContent=String(value); });
$("#skill-selector-detail").addEventListener("input", (event) => { if (event.target.matches("[data-activation-trigger-roll],[data-activation-trigger-roll-number]")) { const entry=selectorEntries()[selectorChoiceIndex]; const tier=activationMediumSecondaryTierData(entry?.name)?.find((item)=>item.tier===selectorSpecialConfig?.secondaryTier); if(!tier)return; const secondaryRoll=Math.max(tier.min,Math.min(tier.max,Number(event.target.value))); selectorSpecialConfig={ ...selectorSpecialConfig, secondaryRoll }; const range=$("#skill-selector-detail [data-activation-trigger-roll]"), numberInput=$("#skill-selector-detail [data-activation-trigger-roll-number]"), output=range?.closest(".special-roll-control")?.querySelector("output"); if(range)range.value=secondaryRoll;if(numberInput)numberInput.value=secondaryRoll;if(output)output.textContent=`${secondaryRoll} s`; } });
$("#skill-selector-detail").addEventListener("change", (event) => { if(event.target.matches("[data-affix-choice]")){ const name=selectorEntries()[selectorChoiceIndex]?.name, from=Number(event.target.dataset.affixChoice), to=Number(event.target.value), lines=activationMediumLineConfigs(name,selectorSpecialConfig); if(lines&&from!==to){ lines[to]={...lines[from]}; lines[from]={tier:null,rolls:[]}; selectorSpecialConfig={...selectorSpecialConfig,lines:activationMediumLineConfigs(name,{...selectorSpecialConfig,lines},to)}; renderSkillSelector(); } return; } if(event.target.matches("[data-activation-roll-kind]")){ selectorSpecialConfig={ ...selectorSpecialConfig, rollKind:event.target.value }; renderSkillSelector(); } });
$("#skill-selector-detail").addEventListener("change", (event) => { if (event.target.matches("[data-selector-level]")) { selectorLevel = Math.max(1, Math.min(40, Number(event.target.value) || 20)); renderSkillSelector(); } if(event.target.matches("[data-special-roll],[data-special-roll-number],[data-progression-roll],[data-progression-roll-number],[data-activation-trigger-roll],[data-activation-trigger-roll-number]")) renderSkillSelector(); });

document.addEventListener("change", (event) => {
  if (event.target.checkValidity && !event.target.checkValidity()) { event.target.reportValidity(); return; }
  if(event.target.matches("[data-legendary-tier]")){ selectedLegendaryTierChoices.set(Number(event.target.dataset.legendaryTier),Number(event.target.value)); renderEquipmentCrafter(); return; }
  if(event.target.matches("[data-edit-legendary-tier]")){ const index=Number(event.target.dataset.editLegendaryTier); editingTierChoices.set(index,Number(event.target.value)); editingLegendaryTexts.delete(index); renderInventoryItemDialog(); return; }
  if(event.target.matches("[data-legendary-placeholder]")){ const index=Number(event.target.dataset.legendaryPlaceholder); if(event.target.value)selectedLegendaryPlaceholderChoices.set(index,event.target.value); else selectedLegendaryPlaceholderChoices.delete(index); renderEquipmentCrafter(); return; }
  if(event.target.matches("[data-edit-legendary-placeholder]")){ const index=Number(event.target.dataset.editLegendaryPlaceholder); if(event.target.value)editingPlaceholderChoices.set(index,event.target.value); else editingPlaceholderChoices.delete(index); editingLegendaryTexts.delete(index); renderInventoryItemDialog(); return; }
  if(event.target.matches("[data-legendary-ring-option]")){
    selectedFolkloreRingOption=event.target.value;
    event.target.closest(".legendary-mod-control")?.querySelector("[data-legendary-mod]")?.replaceChildren(folkloreRingModifier(selectedFolkloreRingOption,selectedLegendaryCorrodedModifiers.has(2)));
    const selected=legendaryGearSs13[selectedLegendaryIndex],preview=$("#legendary-config-preview"),corrosion=configuredCorrosionModifier();
    if(selected&&preview)preview.innerHTML=`<small>Preview</small>${equipmentPreview({...selected,base:selectedLegendaryBase,corrodedModifierIndices:[...selectedLegendaryCorrodedModifiers],modifiers:configuredLegendaryModifiersWithSpecials(),corrosionModifiers:corrosion?[corrosion]:[]})}`;
    return;
  }
  if(event.target.matches("[data-edit-legendary-ring-option]")){
    editingFolkloreRingOption=event.target.value;
    const text=folkloreRingModifier(editingFolkloreRingOption,editingCorrodedModifierIndices.has(2)),control=event.target.closest(".legendary-mod-control"),item=inventoryItems().find((entry)=>entry.id===selectedInventoryItemId);
    control?.querySelector("[data-edit-modifier-text]")?.replaceChildren(text);
    if(control?.querySelector("[data-edit-modifier]"))control.querySelector("[data-edit-modifier]").value=text;
    editingLegendaryTexts.set(2,text);
    const preview=$("#inventory-item-body .gear-edit-layout aside");
    if(item&&preview)preview.innerHTML=`<small>Preview</small>${equipmentPreview(inventoryEditingPreview(item))}`;
    return;
  }
  if(event.target.matches("[data-pactspirit-category]")){renderPactspiritSelector();return;}
  if(event.target.matches("[data-pactspirit-level]")){plannerState.pacts.spiritLevels[event.target.dataset.pactspiritLevel]=Number(event.target.value);hidePlannerTooltip();persistPlannerState();return;}
  if (event.target.matches("[data-slate-equipped]")) {
    const id = event.target.dataset.slateEquipped;
    if (event.target.checked) equippedSlateIds.add(id); else equippedSlateIds.delete(id);
    persistPlannerState(); renderSlates(); render(); renderSkills(); renderConfiguration();
  }
  if (event.target.matches("[data-equipment-enabled]")) {
    const slot = event.target.dataset.equipmentEnabled;
    if (event.target.checked) disabledEquipmentSlots.delete(slot); else disabledEquipmentSlots.add(slot);
    persistPlannerState(); renderEquipment(); render(); renderSkills();
  }
  if (event.target.matches("[data-support-enabled]")) {
    const name = event.target.dataset.supportEnabled;
    const setupName = event.target.dataset.supportSetup || "Scorching Beam";
    plannerState.skills.supportEnabled[supportStateKey(setupName,name)] = event.target.checked;
    if (event.target.checked) disabledSupportNames.delete(name); else disabledSupportNames.add(name);
    persistPlannerState(); renderSkills(); render(); renderCharacter(); renderConfiguration();
  }
  if (event.target.matches("[data-setup-enabled]")) {
    plannerState.skills.setupEnabled[event.target.dataset.setupEnabled] = event.target.checked;
    persistPlannerState(); renderSkills(); render(); renderCharacter(); renderConfiguration();
  }
  if (event.target.matches("[data-skill-level]")) {
    const name = event.target.dataset.skillName;
    plannerState.skills.skillLevels[name] = { ...(plannerState.skills.skillLevels[name] || {}), [event.target.dataset.skillLevel]: Number(event.target.value), ...(event.target.dataset.skillLevel === "addedLevels" ? { manualAddedLevels: true } : {}) };
    persistPlannerState(); renderSkills();
  }
  if (event.target.matches("[data-support-level]")) {
    plannerState.skills.supportLevels[event.target.dataset.supportLevel] = Number(event.target.value);
    persistPlannerState(); renderSkills();
  }
  if (event.target.matches("[data-auto-combat-conditions]")) {
    if (!event.target.checked) {
      const active = currentPlanner().conditions;
      for (const id of automaticCombatConditionIds) plannerState.combat.conditions[id] = active[id] !== false;
      // Keep the Life / Mana group choices automatic mode made (src/planner.js exclusiveConditionGroups).
      for (const id of ["lowLifeAssumed", "lowManaAssumed"]) plannerState.combat.conditions[id] = active[id] === true;
      plannerState.combat.conditions.nearTarget = active.nearTarget !== false;
      // The Config tab's pinned choices (combat.bestCaseOverrides) become the manual switches they selected.
      plannerState.combat.conditions.blurRecentlyEnded = active.blurRecentlyEnded === true;
      plannerState.combat.bestCaseOverrides = Object.fromEntries(Object.entries(plannerState.combat.bestCaseOverrides || {}).filter(([id]) => !exclusiveChoiceConditionIds.includes(id)));
    }
    // Back to automatic: drop the manual Distance choice so the Distance group compares again (a saved nearTarget applies in both modes).
    if (event.target.checked) delete plannerState.combat.conditions.nearTarget;
    plannerState.combat.conditionMode = event.target.checked ? "auto" : "manual";
    persistPlannerState(); renderConfiguration();
  }
  // Best-case assumption switches (src/planner.js bestCaseAssumptions): stored per build in combat.bestCaseOverrides.
  if (event.target.matches("[data-best-case]")) { plannerState.combat.bestCaseOverrides = { ...(plannerState.combat.bestCaseOverrides || {}), [event.target.dataset.bestCase]: event.target.checked }; bestCaseAssumptionsOpen = true; persistPlannerState(); renderConfiguration(); }
  if (event.target.matches("[data-combat-condition]")) {
    if (event.target.dataset.combatCondition === "prebuiltSelfBuffs") plannerState.combat.bestCaseOverrides = { ...(plannerState.combat.bestCaseOverrides || {}), prebuiltSelfBuffs: event.target.checked }; else plannerState.combat.conditions[event.target.dataset.combatCondition] = event.target.checked; // Own buffs built before the fight: stored in combat.bestCaseOverrides (src/combat-condition-mode.js; 2026-10-14)
    persistPlannerState(); renderConfiguration();
  }
  if (event.target.matches("[data-aim-uptime-auto]")) {
    plannerState.combat.aimUptimePercent = aimUptimeAfterToggle(event.target.checked, currentPlanner().aim);
    persistPlannerState(); renderConfiguration();
  }
  if (event.target.matches("[data-combat-value]")) {
    const key = event.target.dataset.combatValue;
    const value = Number(event.target.value);
    plannerState.combat[key] = ["extraMaxChanneledStacks", "extraInitialChanneledStacks"].includes(key) ? Math.max(-20, Math.min(20, Number.isFinite(value) ? Math.trunc(value) : 0)) : value;
    persistPlannerState(); renderConfiguration();
  }
});

const restoredWorkspaceLocation=readWorkspaceLocation();
if(restoredWorkspaceLocation){
  activeStatsPanel = ["sheet", "damage-path"].includes(restoredWorkspaceLocation.statsPanel) ? restoredWorkspaceLocation.statsPanel : "sheet";
  selectedDamagePath = /^(hit|ignite|reaping|combined|hit:[\w:-]+|ailment:[\w:-]+)$/.test(restoredWorkspaceLocation.damagePath || "") ? restoredWorkspaceLocation.damagePath : "hit";
  if (typeof restoredWorkspaceLocation.statSheetSkill === "string") selectedStatSheetSkill = restoredWorkspaceLocation.statSheetSkill;
  const slot=plannerState.talents.selectedTrees.indexOf(restoredWorkspaceLocation.panel);
  if(slot>=0){activeTalentSlot=slot;activeTalentPanel=restoredWorkspaceLocation.panel;}
  talentSlateMode=restoredWorkspaceLocation.view==="slates";
}
function updateRangeFill(range){
  const min=range.min===""?0:Number(range.min),max=range.max===""?100:Number(range.max),value=Number(range.value);
  const percent=max>min?Math.max(0,Math.min(100,(value-min)/(max-min)*100)):0;
  range.style.setProperty("--range-fill",`${percent}%`);
}
const refreshRangeFills=()=>document.querySelectorAll('input[type="range"]').forEach(updateRangeFill);
let rangeFillRefreshPending=false;
const scheduleRangeFillRefresh=()=>{
  if(rangeFillRefreshPending)return;
  rangeFillRefreshPending=true;
  requestAnimationFrame(()=>{rangeFillRefreshPending=false;refreshRangeFills();});
};
new MutationObserver((mutations)=>{
  if(mutations.some(({addedNodes})=>[...addedNodes].some((node)=>node.nodeType===1&&(node.matches?.('input[type="range"]')||node.querySelector?.('input[type="range"]')))))scheduleRangeFillRefresh();
}).observe(document.body,{childList:true,subtree:true});
document.addEventListener("input",scheduleRangeFillRefresh);
document.addEventListener("change",scheduleRangeFillRefresh);
new ResizeObserver(centerSlateGridInPanel).observe($(".slate-board-panel"));
function restoreSummaryText({added,renamed,unchanged,skipped,saved}){
  const parts=[`Restored ${added} build${added===1?"":"s"}`];
  if(renamed)parts.push(`${renamed} renamed (same id already in library)`);
  if(unchanged)parts.push(`${unchanged} already in library`);
  if(skipped)parts.push(`${skipped} skipped (invalid)`);
  if(added&&!saved)parts.push("not saved: browser storage is full");
  return parts.join(" · ");
}
$("#restore-builds-file").addEventListener("change",async(event)=>{
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  let backup;
  try{backup=JSON.parse(await file.text());}catch{showToast("That file is not a valid backup (not JSON)");return;}
  try{persistPlannerState();const summary=restoreBuildsFromBackup(backup);renderBuilds();updateStorageStatus();showToast(restoreSummaryText(summary));}
  catch(error){showToast(error?.message||"That backup could not be restored");}
});
// Stored data that could not be loaded is kept unchanged (planner-state.js); say so and offer a backup.
function renderLibraryNotice(){
  document.querySelector(".library-notice")?.remove();
  let issues;try{issues=libraryLoadIssues();}catch{return;}
  const backupButton='<button class="button button-secondary" type="button" data-backup-builds>Download backup</button>';
  let html="";
  if(issues.unreadable)html=`<span>Your saved builds couldn't be read. They are kept unchanged in this browser, and nothing is saved until you choose.</span><span class="library-notice-actions">${backupButton}<button class="button" type="button" data-start-new-library>Start a new library (your unreadable data stays backed up)</button></span>`;
  else if(issues.quarantinedBuilds.length){const count=issues.quarantinedBuilds.length;html=`<span>${count} build${count===1?"":"s"} couldn't be loaded and ${count===1?"is":"are"} kept unchanged: ${issues.quarantinedBuilds.map((entry)=>escapeHtml(entry.name)).join(", ")}.</span><span class="library-notice-actions">${backupButton}</span>`;}
  if(html)document.querySelector("main")?.insertAdjacentHTML("afterbegin",`<div class="notice library-notice" role="status">${html}</div>`);
}
renderLibraryNotice();
if(calculationsPaused)$("#builds-view").insertAdjacentHTML("afterbegin",'<div class="notice safe-mode-banner" role="status"><strong>Safe mode: calculations paused</strong><button class="button" type="button" data-resume-calculations>Resume calculations</button></div>');
renderCandidateViews();
scheduleRangeFillRefresh();
updateStorageStatus();
const restoredView=["talents","slates","skills","equipment","pacts","builds","character","configuration"].includes(restoredWorkspaceLocation?.view)?restoredWorkspaceLocation.view:"talents";
runGuardedRender(()=>activateWorkspaceView(restoredView==="slates"?"talents":restoredView,{scroll:false,remember:false}));
if(restoredView==="slates")activeWorkspaceView="talents";
if(restoredWorkspaceLocation&&restoredWorkspaceLocation.view!=="overview"&&Number.isFinite(restoredWorkspaceLocation.scrollY))requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,restoredWorkspaceLocation.scrollY)));
window.addEventListener("pagehide",saveWorkspaceLocation);
// Each tab autosaves synchronously on every edit; this also writes anything
// still unsaved when the tab is hidden, closed or reloaded.
function flushPlannerState(){
  try{const state=capturePlannerState();upgradeExistingCorrodedItems(state);savePlannerState(state);}catch{}
}
window.addEventListener("pagehide",flushPlannerState);
window.addEventListener("beforeunload",flushPlannerState);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushPlannerState();});
// Another tab changed the shared build library. Policy (planner-state.js,
// reconcileExternalLibraryChange): this tab keeps its own build and its own
// in-memory state; only the Build Library list and names refresh. When another
// tab saved a different version of the build open here, a notice offers to
// reload it (never automatic); otherwise this tab's next edit wins. A build
// deleted elsewhere is not recreated: this tab moves to another build.
// A hidden tab keeps its state in sync (cheap) but recalculates and redraws only
// when it becomes visible again, so a save in one tab does not run the
// calculator in every background tab.
let deferredExternalChange=null;
function showExternalChange(change){
  if(change.recalculate)renderCandidateViews();
  if(change.deleted&&!loadBuildLibrary().builds.length)activateWorkspaceView("builds",{scroll:false});
  else if(!change.recalculate&&activeWorkspaceView==="builds")renderBuilds();
  if(change.message)showToast(change.message);
}
function hideOtherTabNotice(){document.getElementById("other-tab-notice")?.remove();}
// Same look as the toast, but it stays (with a Reload action) until used or dismissed.
function showOtherTabNotice(){
  if(document.getElementById("other-tab-notice"))return;
  document.body.insertAdjacentHTML("beforeend",'<div id="other-tab-notice" class="toast toast-action visible" role="status" aria-live="polite"><span>This build was changed in another tab · </span><button type="button" data-reload-other-tab>Reload it</button><button type="button" class="toast-dismiss" data-dismiss-other-tab aria-label="Dismiss">×</button></div>');
  const notice=document.getElementById("other-tab-notice");
  notice.querySelector("[data-reload-other-tab]").addEventListener("click",()=>{
    hideOtherTabNotice();
    applyPlannerState(loadPlannerState());
    pendingCandidateRender=false;
    renderCandidateViews();
    updateStorageStatus();
    showToast("Build reloaded");
  });
  notice.querySelector("[data-dismiss-other-tab]").addEventListener("click",()=>{dismissOpenBuildChange();hideOtherTabNotice();});
}
window.addEventListener("storage",(event)=>{
  if(event.key!==null&&event.key!==plannerLibraryStorageKey)return;
  const result=reconcileExternalLibraryChange(capturePlannerState());
  const hidden=document.visibilityState==="hidden";
  if(result.kind==="deleted"){
    hideOtherTabNotice();
    applyPlannerState(result.state);
    renderLibraryNotice();
    const change={recalculate:true,deleted:true,message:"The open build was deleted in another tab"};
    // applyPlannerState queued a render; a hidden tab skips it until it is shown.
    if(hidden){pendingCandidateRender=false;deferredExternalChange=change;return;}
    deferredExternalChange=null;showExternalChange(change);
    return;
  }
  // "dismissed": the user already closed the notice for this version.
  if(result.kind==="changed")showOtherTabNotice();
  else if(result.kind==="none")hideOtherTabNotice();
  updateStorageStatus();
  renderLibraryNotice();
  if(hidden){if(!deferredExternalChange)deferredExternalChange={recalculate:false,deleted:false,message:""};return;}
  if(activeWorkspaceView==="builds")renderBuilds();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible"||!deferredExternalChange)return;
  const change=deferredExternalChange;deferredExternalChange=null;showExternalChange(change);
});
markLoadedStateClean();



