import type { Command } from "commander";
import { CliError } from "./errors.js";

export type CompletionShell = "bash" | "zsh";
const SHELLS: CompletionShell[] = ["bash", "zsh"];

/** Long option flags for a command, including inherited --help. */
function optionFlags(command: Command): string[] {
  const flags = command.options.map((opt) => opt.long).filter((f): f is string => Boolean(f));
  return [...new Set([...flags, "--help"])];
}

function shellFunctionName(programName: string): string {
  return `_${programName.replace(/[^A-Za-z0-9_]/g, "_")}_completion`;
}

interface Tree {
  name: string;
  rootOptions: string[];
  groups: Array<{
    name: string;
    options: string[];
    subcommands: Array<{ name: string; options: string[] }>;
  }>;
}

function describe(program: Command): Tree {
  return {
    name: program.name(),
    rootOptions: optionFlags(program),
    groups: program.commands.map((group) => ({
      name: group.name(),
      options: optionFlags(group),
      subcommands: group.commands.map((sub) => ({ name: sub.name(), options: optionFlags(sub) })),
    })),
  };
}

function bashScript(tree: Tree): string {
  const fn = shellFunctionName(tree.name);
  const groupCases = tree.groups
    .map((group) => {
      const subCases = group.subcommands
        .map(
          (sub) =>
            `        ${sub.name}) COMPREPLY=( $(compgen -W "${sub.options.join(" ")}" -- "$cur") ) ;;`
        )
        .join("\n");
      const subNames = group.subcommands.map((s) => s.name).join(" ");
      return `    ${group.name})
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${subNames} ${group.options.join(" ")}" -- "$cur") )
      else
        case "\${COMP_WORDS[2]}" in
${subCases}
        *) COMPREPLY=( $(compgen -W "${group.options.join(" ")}" -- "$cur") ) ;;
        esac
      fi
      ;;`;
    })
    .join("\n");

  return `# bash completion for ${tree.name}
# Install: ${tree.name} completion bash > ~/.local/share/bash-completion/completions/${tree.name}
# or:      eval "$(${tree.name} completion bash)"
${fn}() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=()
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${tree.groups.map((g) => g.name).join(" ")} ${tree.rootOptions.join(" ")}" -- "$cur") )
    return
  fi
  case "\${COMP_WORDS[1]}" in
${groupCases}
    *) COMPREPLY=( $(compgen -W "${tree.rootOptions.join(" ")}" -- "$cur") ) ;;
  esac
}
complete -F ${fn} ${tree.name}
`;
}

function zshScript(tree: Tree): string {
  const fn = shellFunctionName(tree.name);
  const groupCases = tree.groups
    .map((group) => {
      const subCases = group.subcommands
        .map((sub) => `        ${sub.name}) compadd -- ${sub.options.join(" ")} ;;`)
        .join("\n");
      const subNames = group.subcommands.map((s) => s.name).join(" ");
      return `    ${group.name})
      if (( CURRENT == 3 )); then
        compadd -- ${subNames} ${group.options.join(" ")}
      else
        case "$words[3]" in
${subCases}
        *) compadd -- ${group.options.join(" ")} ;;
        esac
      fi
      ;;`;
    })
    .join("\n");

  return `#compdef ${tree.name}
# zsh completion for ${tree.name}
# Install: ${tree.name} completion zsh > "\${fpath[1]}/_${tree.name}" && compinit
${fn}() {
  if (( CURRENT == 2 )); then
    compadd -- ${tree.groups.map((g) => g.name).join(" ")} ${tree.rootOptions.join(" ")}
    return
  fi
  case "$words[2]" in
${groupCases}
    *) compadd -- ${tree.rootOptions.join(" ")} ;;
  esac
}
compdef ${fn} ${tree.name}
`;
}

/** Build a completion script for `shell` from the program's command tree. */
export function generateCompletion(program: Command, shell: CompletionShell): string {
  if (!SHELLS.includes(shell)) {
    throw new CliError(`Unsupported shell "${shell}". Supported: ${SHELLS.join(", ")}.`);
  }
  const tree = describe(program);
  return shell === "bash" ? bashScript(tree) : zshScript(tree);
}

export function registerCompletionCommand(program: Command): void {
  program
    .command("completion")
    .description("Print a shell completion script (bash or zsh)")
    .argument("<shell>", `One of: ${SHELLS.join(", ")}`)
    .action((shell: string) => {
      if (!SHELLS.includes(shell as CompletionShell)) {
        program.error(`Unsupported shell "${shell}". Supported: ${SHELLS.join(", ")}.`, {
          exitCode: 2,
          code: "amazon-sp.unsupportedShell",
        });
      }
      console.log(generateCompletion(program, shell as CompletionShell));
    });
}
