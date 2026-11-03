// The three player-feedback forms, one schema for both ends (pure; no DOM, no network):
//   - the in-planner dialog (src/feedback-dialog.js) renders the fields in this order;
//   - scripts/build-issue-forms.mjs writes .github/ISSUE_TEMPLATE/<template> from it (issueFormYaml), and
//     tests/feedback-forms.test.js checks the committed YAML equals that output, so the dialog and GitHub cannot drift.
// Field ids and labels are what scripts/collect-submissions.mjs (FIELD_LABELS) and the pre-filled URLs read: keep them.
// Each field: id, type (input / textarea / dropdown), label, description, placeholder, options, required, and render
// (GitHub's code-block rendering for a textarea).
// Dropdowns are dropdowns in the dialog only. On GitHub they are written as `input` fields (same id and label, the
// allowed values listed in the description, githubDescription): a URL query parameter fills GitHub's text fields but not
// its dropdowns (docs.github.com "Creating an issue" > "Creating an issue from a URL query": "custom text fields"; a
// dropdown pre-filled that way showed "None" in a 2026-10-18 test), so the dialog's choice would otherwise be lost.

const field = (id, type, label, { description = "", placeholder = "", options = [], required = false, render = "" } = {}) =>
  Object.freeze({ id, type, label, description, placeholder, options: Object.freeze([...options]), required, render });

const SCREENSHOTS_LABEL = "Screenshot or video links (you can also paste images here)";

export const FEEDBACK_FORMS = Object.freeze({
  calculation: Object.freeze({
    key: "calculation",
    template: "calculation-report.yml",
    name: "Report a calculation",
    description: "The planner's damage for a skill differs from your in-game dummy test.",
    dialogTitle: "Report calculation issue",
    titlePrefix: "[Calc] ",
    label: "calculation-bug",
    intro: "Thanks for testing! The planner's \"Report calculation issue\" button fills in the skill, hero, version and the planner's figures. The build code is filled in automatically when it fits; otherwise it's on your clipboard: paste it into the Build code field below.",
    fields: Object.freeze([
      field("skill", "input", "Skill", { description: "The skill you compared.", required: true }),
      field("hero", "input", "Hero"),
      field("planner_figures", "textarea", "Planner figures", { description: "Filled in by the planner." }),
      field("ingame_figures", "textarea", "In-game dummy numbers", { description: "The numbers the in-game recount or panel shows.", required: true }),
      field("window", "dropdown", "Which in-game figure?", { options: ["Last 5 s average", "Highest 5 s", "Whole-run average", "Character panel", "Other"], required: true }),
      field("test_setup", "textarea", "Test setup", { description: "Run duration, dummy level, conditions (standing still or moving, buffs, distance)." }),
      field("suspect", "textarea", "What you think is wrong"),
      field("build_code", "textarea", "Build code", { description: "Filled in automatically when it fits; otherwise it's on your clipboard: paste it here.", required: true, render: "text" }),
      field("screenshots", "textarea", SCREENSHOTS_LABEL),
      field("app_version", "input", "Planner version", { description: "Filled in by the planner." }),
      field("platform", "input", "Platform", { description: "Filled in by the planner (web or desktop)." })
    ])
  }),
  bug: Object.freeze({
    key: "bug",
    template: "planner-bug.yml",
    name: "Report a planner bug",
    description: "Something in the planner is broken, missing or wrong (not a damage figure).",
    dialogTitle: "Report a planner bug",
    titlePrefix: "[Bug] ",
    label: "planner-bug",
    intro: "",
    fields: Object.freeze([
      field("area", "dropdown", "Area", { options: ["Gear", "Talents", "Prisms", "Slates", "Skills", "Hero", "Pacts", "Followers", "Import from game", "Build library & codes", "Damage path", "Desktop app", "Other"], required: true }),
      field("what_happened", "textarea", "What happened", { required: true }),
      field("expected", "textarea", "What you expected"),
      field("steps", "textarea", "Steps to reproduce"),
      field("screenshots", "textarea", SCREENSHOTS_LABEL),
      field("build_code", "textarea", "Build code", { description: "Optional. Use Export in the planner and paste the code here.", render: "text" }),
      field("app_version", "input", "Planner version", { description: "Filled in by the planner." }),
      field("platform", "input", "Platform", { description: "Filled in by the planner (web or desktop)." })
    ])
  }),
  answer: Object.freeze({
    key: "answer",
    template: "open-question-answer.yml",
    name: "Answer an open question",
    description: "Answer one of the planner's open questions (Character → Damage path → Open questions).",
    dialogTitle: "Answer",
    titlePrefix: "[Answer] ",
    label: "open-question-answer",
    intro: "Thanks for testing! The planner's \"Submit an answer\" button fills in the first fields. Please say how you tested it: in-game dummy runs, tooltips or panel numbers, game data or patch notes.",
    fields: Object.freeze([
      field("question_id", "input", "Question id", { description: "Filled in by the planner. Leave it as it is.", required: true }),
      field("question", "textarea", "Question", { description: "Filled in by the planner." }),
      field("planner_now", "textarea", "What the planner assumes now", { description: "Filled in by the planner." }),
      field("answer", "textarea", "Your answer", { description: "What happens in game, in your own words.", required: true }),
      field("how_tested", "dropdown", "How did you find out?", { options: ["In-game dummy test", "In-game tooltip or panel", "Game data", "Patch notes or developer statement", "Other"], required: true }),
      field("test_details", "textarea", "Test details", { description: "Setup, numbers and durations (for example skill level, supports, dummy level, run length, average and last-5 s figures)." }),
      field("screenshots", "textarea", SCREENSHOTS_LABEL),
      field("build_code", "textarea", "Planner build code used, if any", { render: "text" }),
      field("app_version", "input", "Planner version", { description: "Filled in by the planner." })
    ])
  })
});

/** The form definition for a template file name ("planner-bug.yml"), or null. */
export function formForTemplate(template) {
  return Object.values(FEEDBACK_FORMS).find((form) => form.template === template) || null;
}

// A YAML scalar: plain when it is unambiguous, else double-quoted (JSON strings are valid YAML double-quoted scalars).
function scalar(value) {
  const text = String(value);
  const plain = text && !/^[\s&*!|>'"%@`#[\]{},?:~-]/.test(text) && !/[\s]$/.test(text) && !/: |\s#|[\n\t]/.test(text)
    && !/^(true|false|yes|no|on|off|null|~|[-+]?[\d.]+)$/i.test(text);
  return plain ? text : JSON.stringify(text);
}

/** The GitHub field type for a schema field: dropdowns become inputs (see the header). */
export const githubFieldType = (item) => (item.type === "dropdown" ? "input" : item.type);

/** The GitHub description: a dropdown's description followed by "One of: <options>." */
export function githubDescription(item) {
  if (item.type !== "dropdown") return item.description;
  return [item.description, `One of: ${item.options.join(", ")}.`].filter(Boolean).join(" ");
}

/** The GitHub issue-form YAML for one form definition (LF line endings, trailing newline). */
export function issueFormYaml(form) {
  const lines = [
    `name: ${scalar(form.name)}`,
    `description: ${scalar(form.description)}`,
    `title: ${JSON.stringify(form.titlePrefix)}`,
    `labels: [${form.label}]`,
    "body:"
  ];
  if (form.intro) {
    lines.push("  - type: markdown", "    attributes:", "      value: |");
    for (const line of form.intro.split("\n")) lines.push(line ? `        ${line}` : "");
  }
  for (const item of form.fields) {
    lines.push(`  - type: ${githubFieldType(item)}`, `    id: ${item.id}`, "    attributes:", `      label: ${scalar(item.label)}`);
    const description = githubDescription(item);
    if (description) lines.push(`      description: ${scalar(description)}`);
    if (item.placeholder && item.type !== "dropdown") lines.push(`      placeholder: ${scalar(item.placeholder)}`);
    if (item.render && item.type === "textarea") lines.push(`      render: ${item.render}`);
    lines.push("    validations:", `      required: ${item.required ? "true" : "false"}`);
  }
  return `${lines.join("\n")}\n`;
}
