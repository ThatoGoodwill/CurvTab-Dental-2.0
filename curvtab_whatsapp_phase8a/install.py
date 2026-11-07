#!/usr/bin/env python3
"""Phase 8A safe installer: opt-in + mock-only appointment reminder queue."""
from pathlib import Path
from datetime import datetime
import shutil

root = Path.cwd()
assert (root / 'backend/CurvTabDental.API/Program.cs').is_file(), 'Run from CurvTab Dental repo root'
kit = Path(__file__).resolve().parent
files = {
 'backend/CurvTabDental.Domain/Entities/WhatsAppConsent.cs':'WhatsAppConsent.cs',
 'backend/CurvTabDental.Domain/Entities/WhatsAppOutboundMessage.cs':'WhatsAppOutboundMessage.cs',
 'backend/CurvTabDental.API/Controllers/WhatsAppController.cs':'WhatsAppController.cs',
 'frontend/src/pages/WhatsAppPanel.tsx':'WhatsAppPanel.tsx',
 'frontend/src/pages/WhatsAppPanel.css':'WhatsAppPanel.css'
}
ctx = root/'backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs'
app = root/'frontend/src/App.tsx'
for file in files:
    if (root/file).exists():
        raise SystemExit(f'REFUSING: already exists: {file}. No modifications made.')
code=ctx.read_text()
if code.count('    protected override void OnModelCreating(ModelBuilder modelBuilder)')!=1 or code.count('    public DbSet<Patient> Patients => Set<Patient>();')!=1:
    raise SystemExit('Database context anchors changed. No modifications made.')
app_source=app.read_text()
anchor='<PracticeSettingsPage onOpenStaff={() => navigate(\'Management\')} />'
if app_source.count(anchor)!=1:
    raise SystemExit('App settings anchor changed. No modifications made.')
if 'WhatsAppPanel' in app_source or 'WhatsAppConsent' in code:
    raise SystemExit('Phase 8A appears installed. No modifications made.')
backup = root/'.curvtab-clinical-backups'/('whatsapp-phase8a-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
shutil.copy2(ctx,backup/ctx.name)
shutil.copy2(app,backup/app.name)
for file, name in files.items():
    target=root/file
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(kit/name,target)
code=code.replace('    public DbSet<Patient> Patients => Set<Patient>();', '''    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<WhatsAppConsent> WhatsAppConsents => Set<WhatsAppConsent>();
    public DbSet<WhatsAppOutboundMessage> WhatsAppOutboundMessages => Set<WhatsAppOutboundMessage>();''',1)
model='''        // CT_PHASE8A_WHATSAPP_MOCK_ONLY
        modelBuilder.Entity<WhatsAppConsent>(entity =>
        {
            entity.ToTable("WhatsAppConsents");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(x => new { x.DentalPracticeId, x.PatientId }).IsUnique();
            entity.Property(x => x.Channel).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Source).HasMaxLength(100).IsRequired();
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<WhatsAppOutboundMessage>(entity =>
        {
            entity.ToTable("WhatsAppOutboundMessages");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Status).HasMaxLength(32).IsRequired();
            entity.Property(x => x.TemplateKey).HasMaxLength(60).IsRequired();
            entity.Property(x => x.RecipientNumber).HasMaxLength(30).IsRequired();
            entity.HasIndex(x => new { x.DentalPracticeId, x.AppointmentId, x.TemplateKey }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.CreatedAtUtc });
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Appointment>().WithMany().HasForeignKey(x => x.AppointmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

'''
code=code.replace('    protected override void OnModelCreating(ModelBuilder modelBuilder)', '    protected override void OnModelCreating(ModelBuilder modelBuilder)',1)
key='        base.OnModelCreating(modelBuilder);'
assert code.count(key)==1
code=code.replace(key,key+'\n\n'+model,1)
ctx.write_text(code)
app_source="import WhatsAppPanel from './pages/WhatsAppPanel'\n"+app_source
app_source=app_source.replace(anchor, '<>\n              '+anchor+'\n              <WhatsAppPanel />\n            </>',1)
app.write_text(app_source)
print('Installed Phase 8A mock-only WhatsApp foundation.')
print('Backup:',backup)
print('Next: generate and REVIEW EF migration, then apply to isolated test database ONLY.')
