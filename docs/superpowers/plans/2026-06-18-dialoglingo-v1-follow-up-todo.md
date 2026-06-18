# DialogLingo v1 Follow-up TODO

This document tracks scoped follow-up plans after the candidate mining + preclean/tool-noise slice.

## Search Preview Code/Log Collapse

Status: deprecated for v1 unless real transcript evidence shows the search preview is being overwhelmed by code/log/tool-noise output.

Reason:

- Generation noise control belongs in pre-clean + candidate mining, which already prevents code/log/tool-noise-heavy content from becoming model input.
- Search preview is a relevance-checking surface. It can keep raw indexed context visible enough to explain why a session matched search, rather than adding another denoising layer before there is a demonstrated UI problem.
- Backend filtering should remain generation-specific. Removing or hiding indexed text in the search path risks a confusing state where a query matches content that the preview no longer explains.
- If this is revisited later, prefer a display-only collapse for proven noisy preview cases; do not remove raw transcript text from the search index.
