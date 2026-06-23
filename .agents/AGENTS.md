# PulseApex Synchronization Rule

Whenever you make file modifications, additions, or deletions within this workspace (`d:\My Projects\AGEIS AI`), you MUST automatically sync those changes to the external Git repository folder located at `D:\My Projects\Pulse Apex - A masterstroke\pulseapex`.

**Sync Instructions:**
Use `robocopy` or a similar robust copy tool to mirror the files, ensuring that you ALWAYS exclude Git metadata and environment folders so you don't break the destination repository.
Example command:
`robocopy "D:\My Projects\AGEIS AI" "D:\My Projects\Pulse Apex - A masterstroke\pulseapex" /E /XD node_modules .venv __pycache__ .next .git`
