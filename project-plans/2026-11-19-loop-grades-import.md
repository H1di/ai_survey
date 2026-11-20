# Grades import from DCU Loop (future)

**Date:** 2026-11-19
**Status:** Deferred — "на будущее", not planned

## Idea

On the last slide, a metric built from the person's grades shows which aspects they should aim at.
Grades come from DCU Loop (Moodle) automatically, or are typed in by hand.

## Notes from the first look

- Loop is DCU's Moodle. Moodle has a web-services API (`gradereport_user_get_grade_items`), but it needs a
  per-user token, and DCU most likely puts tokens behind SSO, so automatic import may be closed to us.
- Fallback that always works: manual entry, or importing the grade export the student downloads.
- Grades → skills of the chosen occupation (O*NET / ESCO skills) → highlight gaps on the path.

## Open

- Does DCU allow Moodle web-service tokens for students?
- Is manual entry worth shipping on its own before Loop?
