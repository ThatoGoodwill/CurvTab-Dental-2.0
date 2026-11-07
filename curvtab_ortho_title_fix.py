#!/usr/bin/env python3
"""Add compact, accessible Orthodontics title to CurvTab OrthoHub header."""
from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path.cwd()
page = root / 'frontend/src/pages/OrthodonticsPage.tsx'
css = root / 'frontend/src/pages/OrthodonticsDashboard.css'

if not (page.is_file() and css.is_file()):
    sys.exit('Could not find Orthodontics frontend files. Run from the repository root.')

original_page = page.read_text(encoding='utf-8')
original_css = css.read_text(encoding='utf-8')
marker = 'CT_ORTHO_BRAND_TITLE_V1'
header = '<div className="page-heading ct-ortho-compact-heading">'
controls = '<div className="ct-ortho-compact-controls">'

if marker in original_page or marker in original_css:
    sys.exit('The compact Orthodontics title is already installed. Nothing changed.')
if original_page.count(header) != 1 or original_page.count(controls) != 1:
    sys.exit('Expected compact OrthoHub header not found. No changes made.')
start = original_page.index(header)
where = original_page.index(controls, start)
if where - start > 300:
    sys.exit('Unexpected header structure; no files changed.')
if '<h1>Orthodontics</h1>' in original_page[start:where]:
    sys.exit('Orthodontics title already exists in the header. Nothing changed.')

heading_markup = '''<div className="ct-ortho-brand-heading">
          <span className="ct-ortho-brand-accent" aria-hidden="true" />
          <div className="ct-ortho-brand-copy">
            <h1>Orthodontics</h1>
            <p>Specialist treatment workspace</p>
          </div>
        </div>
        '''
new_page = original_page[:where] + heading_markup + original_page[where:]
new_page = new_page.replace(header, '{/* ' + marker + ' */}\n      ' + header, 1)

new_css = r'''
/* CT_ORTHO_BRAND_TITLE_V1: compact heading beside navigation */
.ct-ortho-compact .ct-ortho-compact-heading {
  display: grid !important;
  grid-template-columns: minmax(170px, 1fr) auto !important;
  align-items: center !important;
  justify-content: normal !important;
  column-gap: 18px !important;
  row-gap: 10px !important;
  margin: 0 !important;
  padding: 0 0 3px !important;
  min-height: 0 !important;
}
.ct-ortho-compact .ct-ortho-brand-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.ct-ortho-compact .ct-ortho-brand-accent {
  width: 4px;
  min-height: 43px;
  align-self: stretch;
  border-radius: 20px;
  background: var(--practice-primary, #bf9209);
}
.ct-ortho-compact .ct-ortho-brand-copy { min-width: 0; }
.ct-ortho-compact .ct-ortho-brand-heading h1 {
  font-size: clamp(20px, 2.1vw, 25px) !important;
  font-weight: 800 !important;
  line-height: 1.15 !important;
  letter-spacing: -.035em !important;
  margin: 0 0 3px !important;
  color: inherit;
}
.ct-ortho-compact .ct-ortho-brand-heading p {
  font-size: 11.5px !important;
  line-height: 1.3 !important;
  margin: 0 !important;
  color: inherit !important;
  opacity: .7;
}
.ct-ortho-compact .ct-ortho-compact-controls {
  width: auto !important;
  min-width: 0;
  margin: 0 !important;
  justify-content: flex-end !important;
}
.ct-ortho-compact .ct-ortho-hub-tabs {
  margin-left: 0 !important;
}
@media (max-width: 800px) {
  .ct-ortho-compact .ct-ortho-compact-heading {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .ct-ortho-compact .ct-ortho-compact-controls {
    justify-content: flex-start !important;
    width: 100% !important;
  }
  .ct-ortho-compact .ct-ortho-brand-heading h1 { font-size: 22px !important; }
}
'''
backup = root / '.curvtab-ortho-layout-backups' / ('brand-title-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(page, backup / page.name)
shutil.copy2(css, backup / css.name)
try:
    page.write_text(new_page, encoding='utf-8')
    css.write_text(original_css + '\n' + new_css, encoding='utf-8')
except Exception:
    page.write_text(original_page, encoding='utf-8')
    css.write_text(original_css, encoding='utf-8')
    raise
print('SUCCESS: Orthodontics heading added at top-left beside the navigation.')
print('Clinical Overview, panels, and actions unchanged.')
print('Backup:', backup.relative_to(root))
