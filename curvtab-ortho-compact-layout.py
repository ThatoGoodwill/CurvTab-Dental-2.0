#!/usr/bin/env python3
"""Compact CurvTab OrthoHub layout; run from CurvTab-Dental-2.0 root.
Only relocates the existing Orthodontics tab nav into the existing page heading
and tightens layout CSS. Does not touch backend or clinical data.
"""
from pathlib import Path
from datetime import datetime
import shutil
import re
import sys

page = Path('frontend/src/pages/OrthodonticsPage.tsx')
css = Path('frontend/src/pages/OrthodonticsDashboard.css')

if not page.is_file() or not css.is_file():
    sys.exit('Could not find Orthodontics frontend files. Run from the project root.')
source = page.read_text(encoding='utf-8')
styles = css.read_text(encoding='utf-8')
marker = 'CT_ORTHO_COMPACT_HEADER_20261105'
if marker in source or marker in styles:
    sys.exit('Compact Orthodontics header already applied. Nothing changed.')
if "<OrthoHub mode=\"overview\"" not in source:
    sys.exit('Expected the OrthoHub version of OrthodonticsPage.tsx. Nothing changed.')

nav_re = re.compile(r'^ {6}<nav className="ct-ortho-hub-tabs"[^>]*>.*?^ {6}</nav>\s*', re.M | re.S)
nav_matches = list(nav_re.finditer(source))
header_re = re.compile(r'      <div className="page-heading"><div>.*?</button></div>', re.S)
header_matches = list(header_re.finditer(source))
if len(nav_matches) != 1 or len(header_matches) != 1:
    sys.exit(f'Expected one navigation and one old header; found {len(nav_matches)}, {len(header_matches)}. Nothing changed.')
if 'ct-ortho-primary-actions' not in source:
    sys.exit('Expected existing New Case actions. Nothing changed.')

nav_markup = nav_matches[0].group(0).rstrip()
source_without_nav = source[:nav_matches[0].start()] + source[nav_matches[0].end():]
header_matches = list(header_re.finditer(source_without_nav))
if len(header_matches) != 1:
    sys.exit('Could not isolate original heading. Nothing changed.')

header = '''      {/* CT_ORTHO_COMPACT_HEADER_20261105 */}
      <div className="page-heading ct-ortho-compact-heading">
        <div className="ct-ortho-compact-copy">
          <div className="eyebrow">DENTIST · LONG-TERM TREATMENT</div>
          <h1>Orthodontics</h1>
          <p>Create patient cases, monitor progress and schedule clinical reviews.</p>
        </div>
        <div className="ct-ortho-compact-controls">
''' + nav_markup + '''
          {(activeTab !== 'Dashboard' && activeTab !== 'Cases') && (
            <button type="button" className="secondary-button ct-ortho-secondary-refresh"
              disabled={!patientId || loading}
              onClick={() => { setLoading(true); setReload((v) => v + 1) }}>
              <RefreshCw size={16} /> Refresh
            </button>
          )}
        </div>
      </div>'''

h = header_matches[0]
source_updated = source_without_nav[:h.start()] + header + source_without_nav[h.end():]
root_open = '<div className="specialty-page">'
if source_updated.count(root_open) != 1:
    sys.exit('Expected one Orthodontics page wrapper. Nothing changed.')
source_updated = source_updated.replace(root_open, '<div className="specialty-page ct-ortho-compact">', 1)

addition = '''
/* CT_ORTHO_COMPACT_HEADER_20261105 — layout-only change */
.ct-ortho-compact {
  gap: 12px !important;
  align-content: start;
}
.ct-ortho-compact .ct-ortho-compact-heading {
  display: grid !important;
  grid-template-columns: minmax(210px, 1fr) auto;
  align-items: center;
  gap: 12px 20px;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
.ct-ortho-compact .ct-ortho-compact-copy { min-width: 0; }
.ct-ortho-compact .ct-ortho-compact-copy h1 {
  margin: 3px 0 4px !important;
  line-height: 1.15;
}
.ct-ortho-compact .ct-ortho-compact-copy p { margin: 0 !important; }
.ct-ortho-compact .ct-ortho-compact-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.ct-ortho-compact .ct-ortho-hub-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
  padding: 4px;
  margin: 0 !important;
  min-height: 0;
  width: auto;
}
.ct-ortho-compact .ct-ortho-hub-tabs button {
  padding: 9px 11px;
  min-height: 35px;
  white-space: nowrap;
}
.ct-ortho-compact .ct-ortho-secondary-refresh {
  white-space: nowrap;
  min-height: 35px;
}
.ct-ortho-compact .oc-hub { gap: 14px; }
.ct-ortho-compact .oc-header { gap: 10px; margin: 0; }
.ct-ortho-compact .oc-header h2 { margin: 3px 0; }
.ct-ortho-compact .oc-overview-grid { gap: 14px; }
@media (max-width: 1100px) {
  .ct-ortho-compact .ct-ortho-compact-heading {
    grid-template-columns: 1fr;
  }
  .ct-ortho-compact .ct-ortho-compact-controls { justify-content: flex-start; }
}
@media (max-width: 620px) {
  .ct-ortho-compact .ct-ortho-hub-tabs { width: 100%; }
  .ct-ortho-compact .ct-ortho-hub-tabs button { padding: 8px 10px; }
  .ct-ortho-compact .oc-header { align-items: flex-start; }
}
'''

backup = Path('.curvtab-ortho-layout-backups') / ('compact-header-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(page, backup / page.name)
shutil.copy2(css, backup / css.name)
page.write_text(source_updated, encoding='utf-8')
css.write_text(styles + addition, encoding='utf-8')
print('SUCCESS: Navigation moved into the top Orthodontics heading.')
print('The extra top Refresh is hidden on Overview/Cases; OrthoHub Refresh + New Case remain.')
print('Clinical Overview and panels now sit closer to the top.')
print('Backup:', backup)
