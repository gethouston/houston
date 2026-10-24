#!/usr/bin/env bash
# Red flags in git: committing a secrets file, and rewriting shared history with a force-push.
input=$(cat)
. "$(dirname "$0")/common.sh"

project=$(academy_dir)
[ -n "$project" ] || exit 0
command=$(json_field command)
lang=$(academy_lang "$project")
langname=English; [ "$lang" = es ] && langname=Spanish

# Force-push: not forbidden, but the learner decides, knowing what it does.
if printf '%s' "$command" | grep -Eq 'git[[:space:]].*push.*(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
	if [ "$lang" = es ]; then
		reason='🚩 Houston, tenemos un problema: Claude quiere hacer un “force push”. Eso reescribe la historia guardada en GitHub y puede borrar cambios que no se pueden recuperar. Aprueba solo si Claude te explicó por qué es necesario y estás de acuerdo.'
	else
		reason='🚩 Houston, we have a problem: Claude wants to “force push”. That rewrites the history saved on GitHub and can erase changes for good. Only approve if Claude explained why it is needed and you agree.'
	fi
	printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
	exit 0
fi

# Saving a .env file in git: block, and have Claude fix .gitignore first.
if printf '%s' "$command" | grep -Eq 'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?(add|commit)'; then
	exposed=$( { git -C "$project" diff --cached --name-only 2>/dev/null; git -C "$project" ls-files --others --exclude-standard 2>/dev/null; } |
		grep -E '(^|/)\.env($|\.)' | grep -Ev '\.(example|sample|template)$' | head -n 5)
	if [ -n "$exposed" ]; then
		cat >&2 <<MSG
Houston Academy tutor blocked this git command: a secrets file would be saved in git history, where it stays forever and can end up on GitHub: $(printf '%s' "$exposed" | tr '\n' ' ')
Do not retry as is. First add the file to .gitignore (and if it is already staged, unstage it). Explain to the learner, in ${langname} and in plain words, why .env files are never saved in git (Course 1, lesson 7 "API keys"), then continue.
MSG
		exit 2
	fi
fi
exit 0
