#!/usr/bin/env python3
"""CurvTab Dental — simplify the OrthoHub header without changing clinical behavior.
Run in the repository root: python3 curvtab-ortho-clean-header.py
"""
from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path.cwd()
page = root / 'frontend/src/pages/OrthodonticsPage.tsx'
hub = root / 'frontend/src/pages/OrthoHub.tsx'
styles = root / 'frontend/src/pages/OrthodonticsDashboard.css'
marker = 'CT_ORTHO_MINIMAL_HEADER_20261105'

for p in (page, hub, styles):
    if not p.is_file():
        sys.exit(f'Missing {p.relative_to(root)}. No changes made.')

original = {p: p.read_text(encoding='utf-8') for p in (page, hub, styles)}
if any(marker in s for s in original.values()):
    sys.exit('Minimal Orthodontics header is already installed; nothing changed.')

src = original[page]
header_open = '<div className="page-heading ct-ortho-compact-heading">'
copy_open = '        <div className="ct-ortho-compact-copy">'
controls_open = '        <div className="ct-ortho-compact-controls">'

if src.count(header_open) != 1 or src.count(copy_open) != 1 or src.count(controls_open) != 1:
    sys.exit('Expected the compact Orthodontics header; no files changed.')
header_i = src.index(header_open)
copy_i = src.index(copy_open, header_i)
controls_i = src.index(controls_open, copy_i)
if controls_i - copy_i > 2000:
    sys.exit('Unexpected Orthodontics heading size; no files changed.')
copy = src[copy_i:controls_i]
if '<h1>Orthodontics</h1>' not in copy or 'DENTIST · LONG-TERM TREATMENT' not in copy:
    sys.exit('Heading content differs from expected; no files changed.')
src = src[:copy_i] + src[controls_i:]
# Preserve navigation, active-tab state, refresh button, New Case flow and all other content.
src = src.replace(
    '      <div className="page-heading ct-ortho-compact-heading">',
    '      {/* ' + marker + ' */}\n      <div className="page-heading ct-ortho-compact-heading">',
    1,
)

hub_src = original[hub]
eyebrow = '          <div className="oc-eyebrow">SPECIALIST ORTHODONTICS · PRACTICE OVERVIEW</div>\n'
subtitle = "          <p>{mode === 'overview' ? 'What needs attention, who needs reviewing, and what happened recently.' : 'All authorised orthodontic cases in this practice, linked to existing patient records.'}</p>\n"
if hub_src.count(eyebrow) != 1 or hub_src.count(subtitle) != 1:
    sys.exit('OrthoHub heading differs from the installed V1; no files changed.')
hub_src = hub_src.replace(eyebrow, '', 1).replace(subtitle, '', 1)

extra_styles = f'''\n/* {marker}: one clear heading, compact tabs and useful content above the fold */
.ct-ortho-compact {{
  gap: 10px !important;
  align-content: start;
}}
.ct-ortho-compact .ct-ortho-compact-heading {{
  display: flex !important;
  justify-content: flex-end !important;
  align-items: center !important;
  min-height: 0 !important;
  gap: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}}
.ct-ortho-compact .ct-ortho-compact-controls {{
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  min-width: 0;
  gap: 8px;
}}
.ct-ortho-compact .ct-ortho-hub-tabs {{
  margin: 0 0 0 auto !important;
  min-height: 0;
  padding: 3px !important;
}}
.ct-ortho-compact .oc-hub {{ gap: 12px; }}
.ct-ortho-compact .oc-header {{
  align-items: center;
  gap: 10px 14px;
  margin: 0;
}}
.ct-ortho-compact .oc-header h2 {{
  margin: 0 !important;
  line-height: 1.2;
  font-size: clamp(22px, 2.4vw, 28px);
}}
.ct-ortho-compact .oc-overview-grid {{ gap: 12px; }}
@media (max-width: 680px) {{
  .ct-ortho-compact .ct-ortho-compact-controls {{ justify-content: flex-start; }}
  .ct-ortho-compact .ct-ortho-hub-tabs {{ margin-left: 0 !important; }}
  .ct-ortho-compact .oc-header {{ align-items: flex-start; }}
}}
'''

backup = root / '.curvtab-ortho-layout-backups' / ('minimal-header-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True, exist_ok=False)
for p in (page, hub, styles):
    shutil.copy2(p, backup / p.name)

try:
    page.write_text(src, encoding='utf-8')
    hub.write_text(hub_src, encoding='utf-8')
    styles.write_text(original[styles] + extra_styles, encoding='utf-8')
except Exception:
    for p, s in original.items():
        p.write_text(s, encoding='utf-8')
    raise

print('SUCCESS: Removed duplicate Orthodontics title and introductory text.')
print('Retained: navigation, Clinical Overview, Refresh, New Case, all clinical panels.')
print('Backup:', backup.relative_to(root))
print('Next: cd frontend && npm run build')
