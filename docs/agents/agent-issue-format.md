# Agent Issue Title and Body Format

Use this format when you want the Claude agent to process a GitHub issue.

## Title Format

Title must include the marker:

```text
[Agent Call] <brief title>
```

Example:

```text
[Agent Call] Add structured error logging for issue comments
```

## Body Format (Required)

At minimum, include:

- `Task:` (required)
- `Context:` (strongly recommended)

Template:

```text
[Agent Call]

Task:
<Describe exactly what should be done.>

Context:
<Path(s) relative to repo root.>
```

## Optional Fields

You can also include:

- `Type:` `Code Writer` | `Code Reviewer` | `Code Suggester`
- `Priority:` `Immediate` | `High` | `Normal` | `Low` | `Minimal`
- `NotifyEmail:` `<email>`

Extended template:

```text
[Agent Call]

Task:
<Detailed objective and expected behavior>

Context:
<file/or/folder/path>

Type:
Code Writer

Priority:
Normal

NotifyEmail:
you@example.com
```

## Context Path Rules

- Paths are relative to repo root.
- You can provide:
  - a single file path
  - a folder path
  - multiple paths as comma-separated values or array-like list

Examples:

```text
Context:
Services/SysScripts/AgentScripts/issueAgentFlow.js
```

```text
Context:
Services/SysScripts/AgentScripts/, Services/Integrations/CronJobs/issueScannerCron.js
```

## Notes

- If `Task:` is missing or empty, the issue is ignored.
- If `[Agent Call]` is missing from both title and body, the issue is ignored.
- Keep the title brief; put implementation details in `Task:`.

