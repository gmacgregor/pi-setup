/**
 * ask_user - Lets the model ask a single multiple-choice question.
 *
 * This is a byte-for-byte behavioral copy of the `ask_user` tool,
 * with exactly one difference: option descriptions word-wrap across as many
 * indented lines as needed, instead of being truncated to a single line
 * with an ellipsis when they don't fit the terminal width.
 *
 * - 2 to 5 model-provided options, plus an always-present "Write my own answer" option
 * - Popup UI: arrow keys or number keys to pick, Enter to confirm
 * - "Write my own answer" opens an inline editor (Esc returns to the options)
 * - Esc on the options dismisses the question (the model is told you declined)
 *
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

const OptionSchema = Type.Object({
  label: Type.String({ description: "Short display label for this option" }),
  description: Type.Optional(
    Type.String({
      description:
        "Optional description shown below the label; may be long, it will wrap",
    }),
  ),
});

const AskUserParams = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  options: Type.Array(OptionSchema, {
    minItems: MIN_OPTIONS,
    maxItems: MAX_OPTIONS,
    description:
      "Between 2 and 5 answer options. A free-form 'write my own answer' option is always appended automatically - never include one yourself.",
  }),
});

export type AskUserInput = Static<typeof AskUserParams>;

interface AskUserDetails {
  question: string;
  options: string[];
  answer: string | null;
  wasCustom: boolean;
  cancelled: boolean;
}

type SelectionResult = {
  answer: string;
  wasCustom: boolean;
  index?: number;
} | null;

interface DisplayOption {
  label: string;
  description?: string;
  isOther?: boolean;
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export default function askUserExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "A free-form 'write my own answer' option is always appended automatically, and the user may dismiss the question without answering. Ask exactly one question per call.",
    promptSnippet:
      "Ask the user a multiple-choice question (2-5 options plus a free-form answer)",
    promptGuidelines: [
      "When asking the user a question whose likely answers can be enumerated, use the ask_user tool instead of asking in plain text.",
      "Ask one question per ask_user call; never include a free-form option yourself, it is added automatically. Ask follow-up questions in subsequent calls.",
    ],

    parameters: AskUserParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const simpleOptions = params.options.map((o) => o.label);
      const baseDetails: Omit<
        AskUserDetails,
        "answer" | "wasCustom" | "cancelled"
      > = {
        question: params.question,
        options: simpleOptions,
      };

      if (
        params.options.length < MIN_OPTIONS ||
        params.options.length > MAX_OPTIONS
      ) {
        throw new Error(
          `ask_user requires between ${MIN_OPTIONS} and ${MAX_OPTIONS} options (got ${params.options.length}). Retry with a valid number of options.`,
        );
      }

      if (ctx.mode !== "tui") {
        return {
          content: [
            {
              type: "text",
              text: "No interactive UI is available, so the question could not be shown. Ask the user in plain text instead.",
            },
          ],
          details: {
            ...baseDetails,
            answer: null,
            wasCustom: false,
            cancelled: true,
          } satisfies AskUserDetails,
        };
      }

      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Cancelled" }],
          details: {
            ...baseDetails,
            answer: null,
            wasCustom: false,
            cancelled: true,
          } satisfies AskUserDetails,
        };
      }

      const allOptions: DisplayOption[] = [
        ...params.options,
        { label: "Write my own answer…", isOther: true },
      ];

      const result = await ctx.ui.custom<SelectionResult>(
        (tui, theme, _kb, done) => {
          let optionIndex = 0;
          let editMode = false;
          let cachedLines: string[] | undefined;

          const editorTheme: EditorTheme = {
            borderColor: (s) => theme.fg("accent", s),
            selectList: {
              selectedPrefix: (t) => theme.fg("accent", t),
              selectedText: (t) => theme.fg("accent", t),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            },
          };
          const editor = new Editor(tui, editorTheme);

          editor.onSubmit = (value) => {
            const trimmed = value.trim();
            if (trimmed) {
              done({ answer: trimmed, wasCustom: true });
            } else {
              editMode = false;
              editor.setText("");
              refresh();
            }
          };

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          function selectOption(index: number) {
            const selected = allOptions[index];
            if (selected.isOther) {
              optionIndex = index;
              editMode = true;
              refresh();
            } else {
              done({
                answer: selected.label,
                wasCustom: false,
                index: index + 1,
              });
            }
          }

          function handleInput(data: string) {
            if (editMode) {
              if (matchesKey(data, Key.escape)) {
                editMode = false;
                editor.setText("");
                refresh();
                return;
              }
              editor.handleInput(data);
              refresh();
              return;
            }

            if (matchesKey(data, Key.up)) {
              optionIndex =
                (optionIndex - 1 + allOptions.length) % allOptions.length;
              refresh();
              return;
            }
            if (matchesKey(data, Key.down)) {
              optionIndex = (optionIndex + 1) % allOptions.length;
              refresh();
              return;
            }

            // Number keys jump straight to an option
            if (
              data.length === 1 &&
              data >= "1" &&
              data <= String(allOptions.length)
            ) {
              selectOption(Number(data) - 1);
              return;
            }

            if (matchesKey(data, Key.enter)) {
              selectOption(optionIndex);
              return;
            }

            if (matchesKey(data, Key.escape)) {
              done(null);
            }
          }

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const add = (s: string) => lines.push(truncateToWidth(s, width));

            const title = " Question ";
            add(
              theme.fg(
                "accent",
                `─${title}${"─".repeat(Math.max(0, width - title.length - 1))}`,
              ),
            );
            for (const line of wrapText(
              params.question,
              Math.max(10, width - 2),
            )) {
              add(` ${theme.fg("text", theme.bold(line))}`);
            }
            lines.push("");

            const indent = "      ";

            for (let i = 0; i < allOptions.length; i++) {
              const opt = allOptions[i];
              const selected = i === optionIndex;
              const prefix = selected ? theme.fg("accent", " ❯ ") : "   ";
              const marker = opt.isOther ? "✎" : `${i + 1}.`;

              const labelColor =
                opt.isOther && editMode
                  ? "accent"
                  : selected
                    ? "accent"
                    : opt.isOther
                      ? "muted"
                      : "text";

              // Wrap the label across as many indented lines as needed
              // instead of truncating it to one line with an ellipsis.
              const labelLines = wrapText(
                opt.label,
                Math.max(10, width - indent.length),
              );
              labelLines.forEach((line, lineIdx) => {
                if (lineIdx === 0) {
                  add(prefix + theme.fg(labelColor, `${marker} ${line}`));
                } else {
                  add(indent + theme.fg(labelColor, line));
                }
              });

              if (opt.description) {
                // Unlike ask_user, wrap the description across as many
                // indented lines as needed instead of truncating it to one
                // line with an ellipsis.
                for (const line of wrapText(
                  opt.description,
                  Math.max(10, width - indent.length),
                )) {
                  add(`${indent}${theme.fg("muted", line)}`);
                }
              }
            }

            if (editMode) {
              lines.push("");
              add(theme.fg("muted", " Your answer:"));
              for (const line of editor.render(width - 2)) {
                add(` ${line}`);
              }
            }

            lines.push("");
            if (editMode) {
              add(theme.fg("dim", " Enter submit • Esc back to options"));
            } else {
              add(
                theme.fg(
                  "dim",
                  ` ↑↓ or 1-${allOptions.length} select • Enter confirm • Esc dismiss`,
                ),
              );
            }
            add(theme.fg("accent", "─".repeat(width)));

            cachedLines = lines;
            return lines;
          }

          return {
            render,
            invalidate: () => {
              cachedLines = undefined;
            },
            handleInput,
          };
        },
      );

      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: "User dismissed the question without answering. Do not assume an answer; proceed accordingly or ask differently.",
            },
          ],
          details: {
            ...baseDetails,
            answer: null,
            wasCustom: false,
            cancelled: true,
          } satisfies AskUserDetails,
        };
      }

      if (result.wasCustom) {
        return {
          content: [
            {
              type: "text",
              text: `User wrote their own answer: ${result.answer}`,
            },
          ],
          details: {
            ...baseDetails,
            answer: result.answer,
            wasCustom: true,
            cancelled: false,
          } satisfies AskUserDetails,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `User selected option ${result.index}: ${result.answer}`,
          },
        ],
        details: {
          ...baseDetails,
          answer: result.answer,
          wasCustom: false,
          cancelled: false,
        } satisfies AskUserDetails,
      };
    },

    renderCall(_args, _theme, _context) {
      // The interactive ctx.ui.custom() popup shown during execute() already
      // displays the question and options in full, readable form. Showing
      // the raw tool-call preview here as well is redundant, so render
      // nothing for this slot.
      return new Container();
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as AskUserDetails | undefined;
      if (!details) {
        const first = result.content[0];
        return new Text(first?.type === "text" ? first.text : "", 0, 0);
      }

      if (details.cancelled || details.answer === null) {
        return new Text(theme.fg("warning", "✗ dismissed"), 0, 0);
      }

      if (details.wasCustom) {
        return new Text(
          theme.fg("success", "✓ ") +
            theme.fg("muted", "(wrote) ") +
            theme.fg("accent", details.answer),
          0,
          0,
        );
      }

      const idx = details.options.indexOf(details.answer) + 1;
      const display = idx > 0 ? `${idx}. ${details.answer}` : details.answer;
      return new Text(
        theme.fg("success", "✓ ") + theme.fg("accent", display),
        0,
        0,
      );
    },
  });
}
