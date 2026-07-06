# DialogLingo Promo Video

This folder stores the public promo video assets that are safe to keep in the repository.

## Current Asset

- `dialoglingo-promo-v1.mp4`
  - Duration: 53.27 seconds
  - Size: 1920x1080
  - Frame rate: 30 fps
  - Audio: AAC mono voiceover
  - Language: Simplified Chinese voiceover and burned-in Chinese subtitles

## Production Notes

The source capture and intermediate edit files are not committed because they can contain local transcript content and large temporary renders. The retained public artifact is the final encoded promo video.

## Editing Workflow

This promo was produced from real product screen recordings and Chinese voiceover segments, then edited as a fixed timeline with FFmpeg. No Remotion project is required for this artifact.

Use the same lightweight FFmpeg path when an update is mostly trimming, stitching, mild speed adjustment, audio alignment, subtitles, and final encoding.

Introduce a Remotion project only when the promo needs repeatable React-based composition, parameterized captions, generated motion graphics, data-driven scenes, or frequent variant renders. In that case, keep the Remotion source in a dedicated folder and keep raw recordings or intermediate renders out of git unless they are sanitized and intentionally small.

The video demonstrates:

- Search and session selection
- Platform, project, and time filters
- Workbook generation and progress
- Source context review
- Delete, restore, and manual edit flows
- Anki and text bundle export options
