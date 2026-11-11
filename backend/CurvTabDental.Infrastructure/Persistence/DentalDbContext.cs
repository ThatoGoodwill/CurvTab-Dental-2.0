using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.Infrastructure.Persistence;

/// <summary>
/// One database for Identity + all practice data.
/// Tenant isolation: every IPracticeOwned entity gets a global query filter comparing its
/// DentalPracticeId with the practice of the signed-in user (from ICurrentUser).
/// A platform user (no practice) therefore sees ZERO practice-owned rows.
/// </summary>
public class DentalDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>
{
    private readonly ICurrentUser? _currentUser;

    public DentalDbContext(DbContextOptions<DentalDbContext> options, ICurrentUser? currentUser = null)
        : base(options)
    {
        _currentUser = currentUser;
    }

    // CT_RECOVERED_TREATMENT_PLANS_V1
    public DbSet<PatientTreatmentPlan> PatientTreatmentPlans => Set<PatientTreatmentPlan>();
    public DbSet<PatientTreatmentProcedure> PatientTreatmentProcedures => Set<PatientTreatmentProcedure>();

    public DbSet<DentalPractice> DentalPractices => Set<DentalPractice>();

    // CT_PHASE9B_PLATFORM_SUBSCRIPTIONS
    public DbSet<PracticeSubscription> PracticeSubscriptions
        => Set<PracticeSubscription>();

    public DbSet<SubscriptionPayment> SubscriptionPayments
        => Set<SubscriptionPayment>();

    // Appointment records stored in PostgreSQL.
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<WhatsAppConsent> WhatsAppConsents => Set<WhatsAppConsent>();
    public DbSet<WhatsAppOutboundMessage> WhatsAppOutboundMessages => Set<WhatsAppOutboundMessage>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<PracticeAppearance> PracticeAppearances => Set<PracticeAppearance>();
    public DbSet<Consultation> Consultations => Set<Consultation>();
    public DbSet<PatientMedicalHistory> PatientMedicalHistories => Set<PatientMedicalHistory>();
    // CT_REGISTRATION_COMPLETE_V2
    public DbSet<PatientRegistrationDetails> PatientRegistrationDetails => Set<PatientRegistrationDetails>();

    // CT_PROCEDURE_PRICING_V1
    public DbSet<PracticeConfiguration> PracticeConfigurations
        => Set<PracticeConfiguration>();

    public DbSet<ProcedurePrice> ProcedurePrices
        => Set<ProcedurePrice>();

    public DbSet<ProcedurePriceHistory> ProcedurePriceHistories
        => Set<ProcedurePriceHistory>();

    public DbSet<ConsultationCharge> ConsultationCharges => Set<ConsultationCharge>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PlanPayment> PlanPayments => Set<PlanPayment>();
    public DbSet<PlanPaymentAllocation> PlanPaymentAllocations => Set<PlanPaymentAllocation>();
    public DbSet<OrthodonticFinancialAgreement> OrthodonticFinancialAgreements => Set<OrthodonticFinancialAgreement>();
    public DbSet<OrthodonticInstallment> OrthodonticInstallments => Set<OrthodonticInstallment>();
    public DbSet<DentalChartEntry> DentalChartEntries => Set<DentalChartEntry>();
    public DbSet<ClinicalImage> ClinicalImages => Set<ClinicalImage>();
    public DbSet<OrthodonticCase> OrthodonticCases => Set<OrthodonticCase>();
    public DbSet<OrthodonticIntakeCase> OrthodonticIntakes => Set<OrthodonticIntakeCase>();
    public DbSet<OrthodonticIntakeDocument> OrthodonticIntakeDocuments => Set<OrthodonticIntakeDocument>();
    public DbSet<OrthodonticIntakeAdvanceReceipt> OrthodonticIntakeAdvanceReceipts => Set<OrthodonticIntakeAdvanceReceipt>();
    public DbSet<OrthodonticProgressNote> OrthodonticProgressNotes => Set<OrthodonticProgressNote>();

    // EF evaluates this per query (it is a member of the context), not once at model build time.
    private Guid? CurrentPracticeId => _currentUser?.PracticeId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // CT_PLAN_ACCOUNT_V1
        modelBuilder.Entity<PlanPayment>(e =>
        {
            e.ToTable("PlanPayments");
            e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.Amount).HasPrecision(12, 2);
            e.Property(x => x.Method).IsRequired().HasMaxLength(10);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.Property(x => x.ReceiptNumber).IsRequired().HasMaxLength(60);
            e.HasIndex(x => new { x.DentalPracticeId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.DentalPracticeId, x.TreatmentPlanId });
            e.HasIndex(x => new { x.DentalPracticeId, x.ReceivedAtUtc });
        });
        modelBuilder.Entity<PlanPaymentAllocation>(e =>
        {
            e.ToTable("PlanPaymentAllocations");
            e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.Amount).HasPrecision(12, 2);
            e.HasIndex(x => new { x.DentalPracticeId, x.TreatmentPlanId });
            e.HasIndex(x => new { x.DentalPracticeId, x.ProcedureId });
        });

        // CT_PROCEDURE_PRICING_V1
        modelBuilder.Entity<PracticeConfiguration>(e =>
        {
            e.ToTable("PracticeConfigurations");
            e.HasKey(x => x.Id);
            e.HasQueryFilter(x =>
                x.DentalPracticeId == CurrentPracticeId);
            e.HasIndex(x => x.DentalPracticeId).IsUnique();
            e.Property(x => x.OpeningHoursJson).HasMaxLength(1000).IsRequired();
            e.Property(x => x.InvoicePrefix).HasMaxLength(10).IsRequired();
            e.Property(x => x.InvoiceFooter).HasMaxLength(300).IsRequired();
            e.Property(x => x.VatRatePercent).HasPrecision(5, 2);
        });

        modelBuilder.Entity<ProcedurePrice>(e =>
        {
            e.ToTable("ProcedurePrices");
            e.HasKey(x => x.Id);
            e.HasQueryFilter(x =>
                x.DentalPracticeId == CurrentPracticeId);

            e.Property(x => x.Code)
                .HasMaxLength(40).IsRequired();

            e.Property(x => x.Name)
                .HasMaxLength(160).IsRequired();

            e.Property(x => x.Category)
                .HasMaxLength(80).IsRequired();

            e.Property(x => x.Price).HasPrecision(12, 2);
            e.Property(x => x.SupplierEstimate).HasPrecision(12, 2);

            e.HasIndex(x => new {
                x.DentalPracticeId, x.Code
            }).IsUnique();
        });

        modelBuilder.Entity<ProcedurePriceHistory>(e =>
        {
            e.ToTable("ProcedurePriceHistories");
            e.HasKey(x => x.Id);
            e.HasQueryFilter(x =>
                x.DentalPracticeId == CurrentPracticeId);

            e.Property(x => x.Action)
                .HasMaxLength(30).IsRequired();

            e.Property(x => x.Code)
                .HasMaxLength(40).IsRequired();

            e.Property(x => x.Name)
                .HasMaxLength(160).IsRequired();

            e.Property(x => x.PreviousPrice)
                .HasPrecision(12, 2);

            e.Property(x => x.NewPrice)
                .HasPrecision(12, 2);

            e.HasIndex(x => new {
                x.DentalPracticeId,
                x.ProcedurePriceId,
                x.ChangedAtUtc
            });
        });



        // CT_LAB_EXCHANGE_V1: Strict tenant filters for every laboratory record.
        modelBuilder.Entity<LaboratoryPartner>(e => {
            e.ToTable("LaboratoryPartners"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.Name).HasMaxLength(160).IsRequired();
            e.Property(x => x.Contact).HasMaxLength(120);
            e.Property(x => x.Phone).HasMaxLength(50);
            e.HasIndex(x => new { x.DentalPracticeId, x.Name }).IsUnique();
        });
        modelBuilder.Entity<LaboratoryMembership>(e => {
            e.ToTable("LaboratoryMemberships"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.HasIndex(x => new { x.DentalPracticeId, x.LaboratoryPartnerId, x.UserId }).IsUnique();
            e.HasOne<LaboratoryPartner>().WithMany().HasForeignKey(x => x.LaboratoryPartnerId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<LaboratoryOrder>(e => {
            e.ToTable("LaboratoryOrders"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.Reference).HasMaxLength(50).IsRequired();
            e.Property(x => x.Instructions).HasMaxLength(5000).IsRequired();
            e.Property(x => x.Status).HasMaxLength(32).IsRequired().IsConcurrencyToken();
            e.HasIndex(x => new { x.DentalPracticeId, x.Reference }).IsUnique();
            e.HasIndex(x => new { x.DentalPracticeId, x.PatientId });
            e.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<LaboratoryPartner>().WithMany().HasForeignKey(x => x.LaboratoryPartnerId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<LaboratoryItem>(e => {
            e.ToTable("LaboratoryItems"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.ToothCode).HasMaxLength(10).IsRequired();
            e.Property(x => x.Procedure).HasMaxLength(240).IsRequired();
            e.Property(x => x.ManufacturingStatus).HasMaxLength(36).IsRequired().IsConcurrencyToken();
            e.Property(x => x.CustodyStatus).HasMaxLength(32).IsRequired().IsConcurrencyToken();
            e.Property(x => x.QaStatus).HasMaxLength(24).IsRequired().IsConcurrencyToken();
            e.Property(x => x.ClinicalStatus).HasMaxLength(24).IsRequired().IsConcurrencyToken();
            e.Property(x => x.ActiveManifestId).IsConcurrencyToken();
            e.Property(x => x.GuaranteeNote).HasMaxLength(1000);
            e.HasIndex(x => new { x.DentalPracticeId, x.LaboratoryOrderId });
            e.HasOne<LaboratoryOrder>().WithMany().HasForeignKey(x => x.LaboratoryOrderId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<LaboratoryManifest>(e => {
            e.ToTable("LaboratoryManifests"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.Reference).HasMaxLength(70).IsRequired();
            e.Property(x => x.Direction).HasMaxLength(20).IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsRequired().IsConcurrencyToken();
            e.Property(x => x.CollectorName).HasMaxLength(140);
            e.Property(x => x.ReceiverName).HasMaxLength(140);
            e.Property(x => x.Waybill).HasMaxLength(120);
            e.Property(x => x.Acknowledgement).HasMaxLength(300);
            e.Property(x => x.Discrepancy).HasMaxLength(2000);
            e.HasIndex(x => new { x.DentalPracticeId, x.Reference }).IsUnique();
            e.HasIndex(x => new { x.DentalPracticeId, x.LaboratoryPartnerId, x.PreparedAtUtc });
            e.HasOne<LaboratoryPartner>().WithMany().HasForeignKey(x => x.LaboratoryPartnerId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<LaboratoryManifestLine>(e => {
            e.ToTable("LaboratoryManifestLines"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.HasIndex(x => new { x.DentalPracticeId, x.LaboratoryManifestId, x.LaboratoryItemId }).IsUnique();
            e.HasOne<LaboratoryManifest>().WithMany().HasForeignKey(x => x.LaboratoryManifestId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<LaboratoryItem>().WithMany().HasForeignKey(x => x.LaboratoryItemId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<LaboratoryCorrection>(e => {
            e.ToTable("LaboratoryCorrections"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.Kind).HasMaxLength(30).IsRequired();
            e.Property(x => x.Status).HasMaxLength(30).IsRequired();
            e.Property(x => x.Reason).HasMaxLength(2000).IsRequired();
            e.Property(x => x.Instructions).HasMaxLength(3000).IsRequired();
            e.Property(x => x.Priority).HasMaxLength(20).IsRequired();
            e.HasIndex(x => new { x.DentalPracticeId, x.LaboratoryItemId });
            e.HasOne<LaboratoryItem>().WithMany().HasForeignKey(x => x.LaboratoryItemId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<LaboratoryActivity>(e => {
            e.ToTable("LaboratoryActivities"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.Action).HasMaxLength(65).IsRequired();
            e.Property(x => x.Details).HasMaxLength(3000);
            e.HasIndex(x => new { x.DentalPracticeId, x.LaboratoryOrderId, x.AtUtc });
        });
        modelBuilder.Entity<LaboratoryEvidence>(e => {
            e.ToTable("LaboratoryEvidence"); e.HasKey(x => x.Id);
            e.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            e.Property(x => x.FileName).HasMaxLength(180).IsRequired();
            e.Property(x => x.ContentType).HasMaxLength(90).IsRequired();
            e.HasIndex(x => new { x.DentalPracticeId, x.LaboratoryItemId });
            e.HasOne<LaboratoryItem>().WithMany().HasForeignKey(x => x.LaboratoryItemId).OnDelete(DeleteBehavior.Restrict);
        });


        // CT_RECOVERED_TREATMENT_PLANS_V1
        modelBuilder.Entity<PatientTreatmentPlan>(entity =>
        {
            entity.ToTable("PatientTreatmentPlans");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Title).IsRequired().HasMaxLength(200);
            entity.Property(x => x.ClinicalRationale).HasMaxLength(4000);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.Property(x => x.ConsentName).HasMaxLength(200);
            entity.HasIndex(x => new { x.DentalPracticeId, x.PatientId, x.CreatedAtUtc });
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PatientTreatmentProcedure>(entity =>
        {
            entity.ToTable("PatientTreatmentProcedures");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Description).IsRequired().HasMaxLength(1000);
            entity.Property(x => x.ToothCode).HasMaxLength(2);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.Property(x => x.EstimatedCost).HasPrecision(12, 2);
            entity.HasIndex(x => new { x.DentalPracticeId, x.PatientId, x.TreatmentPlanId });
            entity.HasOne<PatientTreatmentPlan>().WithMany().HasForeignKey(x => x.TreatmentPlanId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // CT_PHASE9B_PLATFORM_SUBSCRIPTIONS
        // Platform billing data. API access must be SuperAdmin-only.
        modelBuilder.Entity<PracticeSubscription>(entity =>
        {
            // CT_PHASE9C_ENFORCEMENT_V1
            entity.Property(x => x.EnforcementEnabled)
                .HasDefaultValue(false);

            entity.ToTable("PracticeSubscriptions");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.PlanName)
                .HasMaxLength(100).IsRequired();

            entity.Property(x => x.BillingCycle)
                .HasMaxLength(20).IsRequired();

            entity.Property(x => x.Amount)
                .HasPrecision(12, 2);

            entity.Property(x => x.Currency)
                .HasMaxLength(3).IsRequired();

            entity.Property(x => x.Status)
                .HasMaxLength(30).IsRequired();

            entity.HasIndex(x => x.DentalPracticeId);

            entity.HasOne<DentalPractice>()
                .WithMany()
                .HasForeignKey(x => x.DentalPracticeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SubscriptionPayment>(entity =>
        {
            entity.ToTable("SubscriptionPayments");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Amount)
                .HasPrecision(12, 2);

            entity.Property(x => x.Currency)
                .HasMaxLength(3).IsRequired();

            entity.Property(x => x.Status)
                .HasMaxLength(30).IsRequired();

            entity.Property(x => x.PaymentReference)
                .HasMaxLength(200);

            entity.Property(x => x.PaymentMethod)
                .HasMaxLength(60);

            entity.HasIndex(x => x.PracticeSubscriptionId);

            entity.HasOne<PracticeSubscription>()
                .WithMany()
                .HasForeignKey(x => x.PracticeSubscriptionId)
                .OnDelete(DeleteBehavior.Restrict);
        });



        // CT_PHASE8A_WHATSAPP_MOCK_ONLY
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



        modelBuilder.Entity<DentalPractice>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
            entity.Property(p => p.Email).HasMaxLength(256);
            entity.Property(p => p.PhoneNumber).HasMaxLength(30);
            entity.Property(p => p.Address).HasMaxLength(500);
        });

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(u => u.FullName).IsRequired().HasMaxLength(200);
            entity.Property(u => u.PreferredThemeSurface).HasMaxLength(10);
            entity.Property(u => u.PreferredLayoutPreset).HasMaxLength(20);
            entity.Property(u => u.PreferredNavigationMode).HasMaxLength(12);
            entity.HasIndex(u => u.DentalPracticeId);
            entity.HasOne<DentalPractice>()
                .WithMany()
                .HasForeignKey(u => u.DentalPracticeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // SaaS isolation: users only query their own practice's appointments.
modelBuilder.Entity<Appointment>(entity =>
{
    entity.HasKey(a => a.Id);

    entity.HasQueryFilter(
        a => a.DentalPracticeId == CurrentPracticeId);

    entity.Property(a => a.Status)
        .HasMaxLength(40);

    entity.Property(a => a.Reason)
        .HasMaxLength(500);

    entity.HasIndex(a =>
        new { a.DentalPracticeId, a.StartUtc });

    entity.HasIndex(a =>
        new { a.DentalPracticeId, a.Status });
});

        // Phase 2: confidential clinical encounter, one per appointment.
        modelBuilder.Entity<Consultation>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasQueryFilter(c => c.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(c => new { c.DentalPracticeId, c.AppointmentId }).IsUnique();
            entity.HasIndex(c => new { c.DentalPracticeId, c.PatientId });
            entity.HasOne<Appointment>().WithMany().HasForeignKey(c => c.AppointmentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Patient>().WithMany().HasForeignKey(c => c.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(c => c.ChiefComplaint).HasMaxLength(6000);
            entity.Property(c => c.Symptoms).HasMaxLength(6000);
            entity.Property(c => c.ExaminationFindings).HasMaxLength(6000);
            entity.Property(c => c.Diagnosis).HasMaxLength(6000);
            entity.Property(c => c.TreatmentPerformed).HasMaxLength(6000);
            entity.Property(c => c.TreatmentPlan).HasMaxLength(6000);
            entity.Property(c => c.PrescriptionNotes).HasMaxLength(6000);
            entity.Property(c => c.FollowUpAdvice).HasMaxLength(6000);
        });

        modelBuilder.Entity<PatientMedicalHistory>(entity =>
        {
            entity.HasKey(h => h.Id);
            entity.HasQueryFilter(h => h.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(h => new { h.DentalPracticeId, h.PatientId }).IsUnique();
            entity.HasOne<Patient>().WithMany().HasForeignKey(h => h.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(h => h.Allergies).HasMaxLength(4000);
            entity.Property(h => h.CurrentMedications).HasMaxLength(4000);
            entity.Property(h => h.MedicalConditions).HasMaxLength(4000);
            entity.Property(h => h.DentalHistory).HasMaxLength(4000);
            entity.Property(h => h.AdditionalNotes).HasMaxLength(4000);
        });

        // Charges are what the Dentist asks reception to collect, not payments.
        modelBuilder.Entity<ConsultationCharge>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasQueryFilter(c => c.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(c => new { c.DentalPracticeId, c.ConsultationId });
            entity.HasOne<Consultation>().WithMany().HasForeignKey(c => c.ConsultationId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(c => c.Description).IsRequired().HasMaxLength(200);
            entity.Property(c => c.Amount).HasPrecision(12, 2);
        });

        // Phase 3: payments are recorded separately from clinical charges.
        // Phase 4: append-only tooth findings and chart history.

        // Private practice-owned clinical imaging metadata.
        modelBuilder.Entity<ClinicalImage>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.ImageType)
                .IsRequired().HasMaxLength(30);
            entity.Property(x => x.OriginalFileName)
                .IsRequired().HasMaxLength(255);
            entity.Property(x => x.StoredFileName)
                .IsRequired().HasMaxLength(100);
            entity.Property(x => x.ContentType)
                .IsRequired().HasMaxLength(50);

            entity.HasIndex(x => new {
                x.DentalPracticeId,
                x.PatientId,
                x.UploadedAtUtc
            });

            entity.HasOne<Patient>().WithMany()
                .HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<OrthodonticCase>().WithMany()
                .HasForeignKey(x => x.OrthodonticCaseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DentalChartEntry>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasQueryFilter(e => e.DentalPracticeId == CurrentPracticeId);
            entity.Property(e => e.ToothCode).IsRequired().HasMaxLength(2);
            entity.Property(e => e.Surface).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Finding).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.HasIndex(e => new { e.DentalPracticeId, e.PatientId, e.RecordedAtUtc });
            entity.HasOne<Patient>().WithMany().HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Consultation>().WithMany().HasForeignKey(e => e.ConsultationId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // R2,500 standard assessment advance is a real receipt-backed
        // unallocated patient credit, not an OrthodonticInstallment.
        modelBuilder.Entity<OrthodonticIntakeAdvanceReceipt>(entity =>
        {
            entity.ToTable("OrthodonticIntakeAdvanceReceipts");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.ReceiptNumber).HasMaxLength(60).IsRequired();
            entity.Property(x => x.Method).HasMaxLength(10).IsRequired();
            entity.Property(x => x.Reference).HasMaxLength(100);
            entity.Property(x => x.Amount).HasPrecision(12, 2);
            entity.HasIndex(x => new { x.DentalPracticeId, x.OrthodonticIntakeCaseId }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.RequestId }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.ReceivedAtUtc });
            entity.HasOne<OrthodonticIntakeCase>().WithMany().HasForeignKey(x => x.OrthodonticIntakeCaseId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Persistent, practice-filtered intake attachments; read access is
        // additionally enforced by the assigned-specialist API.
        modelBuilder.Entity<OrthodonticIntakeDocument>(entity =>
        {
            entity.ToTable("OrthodonticIntakeDocuments");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Category).HasMaxLength(40).IsRequired();
            entity.Property(x => x.OriginalFileName).HasMaxLength(180).IsRequired();
            entity.Property(x => x.ContentType).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Sha256).HasMaxLength(64).IsRequired();
            entity.Property(x => x.SourceProvider).HasMaxLength(250);
            entity.Property(x => x.FileBytes).HasColumnType("bytea").IsRequired();
            entity.HasIndex(x => new { x.DentalPracticeId, x.OrthodonticIntakeCaseId, x.UploadedAtUtc });
            entity.HasIndex(x => new { x.DentalPracticeId, x.PatientId });
            entity.HasOne<OrthodonticIntakeCase>().WithMany().HasForeignKey(x => x.OrthodonticIntakeCaseId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Phase 1: separate orthodontic intake; never an implicit treatment case.
        modelBuilder.Entity<OrthodonticIntakeCase>(entity =>
        {
            entity.ToTable("OrthodonticIntakes");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Source).IsRequired().HasMaxLength(20);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(40);
            entity.Property(x => x.AdvancePolicy).IsRequired().HasMaxLength(32);
            entity.Property(x => x.ReferralReason).HasMaxLength(1000);
            entity.Property(x => x.ReferralNotes).HasMaxLength(4000);
            entity.Property(x => x.PreviousProvider).HasMaxLength(250);
            entity.Property(x => x.ExistingAppliances).HasMaxLength(1000);
            entity.Property(x => x.PreviousTreatmentPlanSummary).HasMaxLength(4000);
            entity.Property(x => x.TransferReason).HasMaxLength(2000);
            entity.Property(x => x.PreviousRecordsSummary).HasMaxLength(4000);
            entity.Property(x => x.UrgentConcerns).HasMaxLength(2000);
            entity.Property(x => x.TransferContinuationDecision).IsRequired().HasMaxLength(32);
            entity.Property(x => x.TransferDecisionReason).HasMaxLength(2000);
            entity.Property(x => x.DocumentReferencesJson).IsRequired().HasColumnType("jsonb");
            entity.Property(x => x.MissingDocumentsJson).IsRequired().HasColumnType("jsonb");
            entity.Property(x => x.TermsVersion).HasMaxLength(80);
            entity.Property(x => x.TermsSha256).HasMaxLength(64);
            entity.Property(x => x.TermsSignerName).HasMaxLength(200);
            entity.Property(x => x.TermsSignerCapacity).HasMaxLength(60);
            entity.Property(x => x.TermsAcceptanceMethod).HasMaxLength(50);
            entity.Property(x => x.NextAction).HasMaxLength(500);
            entity.HasIndex(x => new { x.DentalPracticeId, x.PatientId })
                .IsUnique().HasFilter("\"ClosedAtUtc\" IS NULL");
            entity.HasIndex(x => new { x.DentalPracticeId, x.AssignedOrthodontistUserId, x.Status });
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Phase 5: an orthodontic treatment case belongs to an existing patient.
        modelBuilder.Entity<OrthodonticCase>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasQueryFilter(c => c.DentalPracticeId == CurrentPracticeId);
            entity.Property(c => c.Title).IsRequired().HasMaxLength(150);
            entity.Property(c => c.ApplianceType).IsRequired().HasMaxLength(100);
            entity.Property(c => c.Goals).IsRequired().HasMaxLength(4000);
            entity.Property(c => c.Status).IsRequired().HasMaxLength(30);
            entity.HasIndex(c => new { c.DentalPracticeId, c.PatientId });
            entity.HasOne<Patient>().WithMany().HasForeignKey(c => c.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrthodonticProgressNote>(entity =>
        {
            entity.HasKey(n => n.Id);
            entity.HasQueryFilter(n => n.DentalPracticeId == CurrentPracticeId);
            entity.Property(n => n.ProgressNotes).IsRequired().HasMaxLength(4000);
            entity.Property(n => n.Adjustments).HasMaxLength(2000);
            entity.Property(n => n.NextSteps).HasMaxLength(2000);
            entity.HasIndex(n => new { n.DentalPracticeId, n.OrthodonticCaseId, n.VisitDate });
            entity.HasOne<OrthodonticCase>().WithMany()
                .HasForeignKey(n => n.OrthodonticCaseId)
                .OnDelete(DeleteBehavior.Restrict);
        });


        // CT_FINANCE_CASH_PHASE6C
        modelBuilder.Entity<PracticeExpense>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.Category)
                .IsRequired().HasMaxLength(60);
            entity.Property(x => x.Description)
                .IsRequired().HasMaxLength(250);
            entity.Property(x => x.Method)
                .IsRequired().HasMaxLength(16);
            entity.Property(x => x.Reference).HasMaxLength(100);
            entity.Property(x => x.Amount).HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId,
                x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId,
                x.ExpenseDate
            });
        });

        modelBuilder.Entity<CashDaySignoff>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.OpeningFloat).HasPrecision(12, 2);
            entity.Property(x => x.CashReceived).HasPrecision(12, 2);
            entity.Property(x => x.CashExpenses).HasPrecision(12, 2);
            entity.Property(x => x.ExpectedCash).HasPrecision(12, 2);
            entity.Property(x => x.CountedCash).HasPrecision(12, 2);
            entity.Property(x => x.Variance).HasPrecision(12, 2);
            entity.Property(x => x.Notes).HasMaxLength(1000);

            entity.HasIndex(x => new {
                x.DentalPracticeId,
                x.BusinessDate
            }).IsUnique();
        });


        // Employee self-service: all queries are filtered by practice and controllers by employee.
        modelBuilder.Entity<EmployeeWorkspaceRecord>(entity =>
        {
            entity.ToTable("EmployeeWorkspaceRecords");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Category).IsRequired().HasMaxLength(20);
            entity.Property(x => x.Title).IsRequired().HasMaxLength(180);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.Property(x => x.Amount).HasPrecision(12, 2);
            entity.Property(x => x.DocumentReference).HasMaxLength(350);
            entity.Property(x => x.Notes).HasMaxLength(1200);
            entity.HasIndex(x => new { x.DentalPracticeId, x.RequestId }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.EmployeeUserId, x.Category, x.CreatedAtUtc });
            entity.HasOne<ApplicationUser>().WithMany()
                .HasForeignKey(x => x.EmployeeUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // CT_CLIENT_SEPARATE_DAILY_SIGNOFFS
        modelBuilder.Entity<CashDayCloseSubmission>(entity =>
        {
            entity.ToTable("CashDayCloseSubmissions");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.OpeningFloat).HasPrecision(12, 2);
            entity.Property(x => x.CountedCash).HasPrecision(12, 2);
            entity.Property(x => x.CashReceived).HasPrecision(12, 2);
            entity.Property(x => x.CashExpenses).HasPrecision(12, 2);
            entity.Property(x => x.ExpectedCash).HasPrecision(12, 2);
            entity.Property(x => x.Variance).HasPrecision(12, 2);
            entity.Property(x => x.Explanation).HasMaxLength(1000);
            entity.Property(x => x.EvidenceReference).HasMaxLength(300);
            entity.HasIndex(x => new { x.DentalPracticeId, x.BusinessDate }).IsUnique();
        });

        modelBuilder.Entity<CashDayCloseReview>(entity =>
        {
            entity.ToTable("CashDayCloseReviews");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Decision).IsRequired().HasMaxLength(20);
            entity.Property(x => x.Reason).IsRequired().HasMaxLength(1000);
            entity.HasIndex(x => new { x.DentalPracticeId, x.RequestId }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.SubmissionId, x.ReviewedAtUtc });
            entity.HasOne<CashDayCloseSubmission>().WithMany()
                .HasForeignKey(x => x.SubmissionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CashDayCloseAdjustment>(entity =>
        {
            entity.ToTable("CashDayCloseAdjustments");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.RevisedCountedCash).HasPrecision(12,2);
            entity.Property(x => x.Reason).IsRequired().HasMaxLength(1000);
            entity.Property(x => x.EvidenceReference).IsRequired().HasMaxLength(300);
            entity.HasIndex(x => new { x.DentalPracticeId, x.RequestId }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.SubmissionId, x.RecordedAtUtc });
            entity.HasOne<CashDayCloseSubmission>().WithMany()
                .HasForeignKey(x => x.SubmissionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CashDayCloseInstrumentEvidence>(entity =>
        {
            entity.ToTable("CashDayCloseInstrumentEvidence");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.Instrument).IsRequired().HasMaxLength(12);
            entity.Property(x => x.LedgerReceived).HasPrecision(12, 2);
            entity.Property(x => x.VerifiedReceived).HasPrecision(12, 2);
            entity.Property(x => x.EvidenceReference).IsRequired().HasMaxLength(300);
            entity.Property(x => x.VerificationSource).IsRequired().HasMaxLength(40);
            entity.HasIndex(x => new { x.DentalPracticeId, x.RequestId }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.SubmissionId, x.Instrument, x.RecordedAtUtc });
            entity.HasOne<CashDayCloseSubmission>().WithMany()
                .HasForeignKey(x => x.SubmissionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CashDayCloseFinancialSignoff>(entity =>
        {
            entity.ToTable("CashDayCloseFinancialSignoffs");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.SnapshotJson).IsRequired();
            entity.Property(x => x.HandoverReason).IsRequired().HasMaxLength(1000);
            entity.HasIndex(x => new { x.DentalPracticeId, x.BusinessDate }).IsUnique();
            entity.HasIndex(x => new { x.DentalPracticeId, x.RequestId }).IsUnique();
            entity.HasOne<CashDayCloseSubmission>().WithMany()
                .HasForeignKey(x => x.SubmissionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MedicalAidDaySignoff>(entity =>
        {
            entity.ToTable("MedicalAidDaySignoffs");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.SubmittedValue).HasPrecision(12, 2);
            entity.Property(x => x.SnapshotJson).IsRequired();
            entity.HasIndex(x => new { x.DentalPracticeId, x.BusinessDate }).IsUnique();
        });

        // CT_PHASE6H: Two permitted invoice sources.
        // Both existing consultation records and future orthodontic
        // invoices must reference exactly one legitimate source.
        // CT_PHASE6E_INVOICES
        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_Invoice_ExactlyOneSource",
                """
                (
                  "ConsultationId" IS NOT NULL
                  AND "AppointmentId" IS NOT NULL
                  AND "OrthodonticFinancialAgreementId" IS NULL
                )
                OR
                (
                  "ConsultationId" IS NULL
                  AND "AppointmentId" IS NULL
                  AND "OrthodonticFinancialAgreementId" IS NOT NULL
                )
                """));
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.InvoiceNumber)
                .IsRequired().HasMaxLength(64);
            entity.Property(x => x.Currency)
                .IsRequired().HasMaxLength(3);
            entity.Property(x => x.TotalAmount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.InvoiceNumber
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.ConsultationId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId,
                x.OrthodonticFinancialAgreementId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.PatientId
            });

            entity.HasOne<Patient>().WithMany()
                .HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<Appointment>().WithMany()
                .HasForeignKey(x => x.AppointmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<Consultation>().WithMany()
                .HasForeignKey(x => x.ConsultationId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<OrthodonticFinancialAgreement>()
                .WithMany()
                .HasForeignKey(x => x.OrthodonticFinancialAgreementId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InvoiceLine>(entity =>
        {
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_InvoiceLine_ExactlyOneSource",
                """
                (
                  "SourceConsultationChargeId" IS NOT NULL
                  AND "SourceOrthodonticFinancialAgreementId" IS NULL
                )
                OR
                (
                  "SourceConsultationChargeId" IS NULL
                  AND "SourceOrthodonticFinancialAgreementId" IS NOT NULL
                )
                """));
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.Description)
                .IsRequired().HasMaxLength(200);
            entity.Property(x => x.Amount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.InvoiceId
            });

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.SourceConsultationChargeId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId,
                x.SourceOrthodonticFinancialAgreementId
            }).IsUnique();

            entity.HasOne<Invoice>().WithMany()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<ConsultationCharge>().WithMany()
                .HasForeignKey(x => x.SourceConsultationChargeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<OrthodonticFinancialAgreement>()
                .WithMany()
                .HasForeignKey(
                    x => x.SourceOrthodonticFinancialAgreementId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PaymentAllocation>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.Amount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.InvoiceId
            });

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.PaymentId
            });

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.InvoiceId, x.PaymentId
            }).IsUnique();

            entity.HasOne<Invoice>().WithMany()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<Payment>().WithMany()
                .HasForeignKey(x => x.PaymentId)
                .OnDelete(DeleteBehavior.Restrict);
        });


        // CT_PHASE6G_CORRECTIONS
        modelBuilder.Entity<InvoiceCreditNote>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.CreditNoteNumber)
                .IsRequired().HasMaxLength(64);
            entity.Property(x => x.Reason)
                .IsRequired().HasMaxLength(1000);
            entity.Property(x => x.Amount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.CreditNoteNumber
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.InvoiceId
            });

            entity.HasOne<Invoice>().WithMany()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PaymentAllocationReversal>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.Reason)
                .IsRequired().HasMaxLength(1000);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.AllocationId
            }).IsUnique();

            entity.HasOne<PaymentAllocation>().WithMany()
                .HasForeignKey(x => x.AllocationId)
                .OnDelete(DeleteBehavior.Restrict);
        });


        // CT_PHASE7A_MEDICAL_AID
        modelBuilder.Entity<MedicalAidMembership>(entity =>
        {
            entity.ToTable("MedicalAidMemberships");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.SchemeName)
                .IsRequired().HasMaxLength(120);
            entity.Property(x => x.PlanName)
                .IsRequired().HasMaxLength(120);
            entity.Property(x => x.MemberNumberLast4)
                .IsRequired().HasMaxLength(4);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.PatientId
            }).IsUnique();

            entity.HasOne<Patient>().WithMany()
                .HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MedicalAidClaim>(entity =>
        {
            entity.ToTable("MedicalAidClaims");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.ClaimNumber)
                .IsRequired().HasMaxLength(64);
            entity.Property(x => x.Status)
                .IsRequired().HasMaxLength(32);
            entity.Property(x => x.Currency)
                .IsRequired().HasMaxLength(3);
            entity.Property(x => x.Notes)
                .HasMaxLength(500);
            entity.Property(x => x.ClaimedAmount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.ClaimNumber
            }).IsUnique();

            // First milestone: one draft claim per invoice.
            // Later phases may support split/multiple claims.
            entity.HasIndex(x => new {
                x.DentalPracticeId, x.InvoiceId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.PatientId
            });

            entity.HasOne<Patient>().WithMany()
                .HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<Invoice>().WithMany()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<MedicalAidMembership>().WithMany()
                .HasForeignKey(x => x.MembershipId)
                .OnDelete(DeleteBehavior.Restrict);
        });


        // CT_PHASE7B_AUTHORISATIONS
        modelBuilder.Entity<MedicalAidAuthorisation>(entity =>
        {
            entity.ToTable("MedicalAidAuthorisations");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.TreatmentDescription)
                .IsRequired().HasMaxLength(300);
            entity.Property(x => x.Status)
                .IsRequired().HasMaxLength(40);
            entity.Property(x => x.AuthorisationNumber)
                .HasMaxLength(100);
            entity.Property(x => x.EvidenceReference)
                .HasMaxLength(300);

            entity.Property(x => x.RequestedAmount)
                .HasPrecision(12, 2);
            entity.Property(x => x.ApprovedAmount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.PatientId
            });

            entity.HasOne<Patient>().WithMany()
                .HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<MedicalAidMembership>().WithMany()
                .HasForeignKey(x => x.MembershipId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MedicalAidAuthorisationEvent>(entity =>
        {
            entity.ToTable("MedicalAidAuthorisationEvents");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.EventType)
                .IsRequired().HasMaxLength(50);
            entity.Property(x => x.FromStatus)
                .IsRequired().HasMaxLength(40);
            entity.Property(x => x.ToStatus)
                .IsRequired().HasMaxLength(40);
            entity.Property(x => x.Reason)
                .IsRequired().HasMaxLength(1000);
            entity.Property(x => x.AuthorisationNumber)
                .HasMaxLength(100);
            entity.Property(x => x.EvidenceReference)
                .HasMaxLength(300);
            entity.Property(x => x.ApprovedAmount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new {
                x.DentalPracticeId, x.AuthorisationId,
                x.PerformedAtUtc
            });

            entity.HasOne<MedicalAidAuthorisation>()
                .WithMany()
                .HasForeignKey(x => x.AuthorisationId)
                .OnDelete(DeleteBehavior.Restrict);
        });


        // CT_PHASE7C_CLAIM_WORKFLOW
        modelBuilder.Entity<MedicalAidClaim>(entity =>
        {
            entity.Property(x => x.ApprovedAmount)
                .HasPrecision(12, 2);
            entity.Property(x => x.ExternalReference)
                .HasMaxLength(120);
        });

        modelBuilder.Entity<MedicalAidClaimEvent>(entity =>
        {
            entity.ToTable("MedicalAidClaimEvents");
            entity.HasKey(x => x.Id);

            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.FromStatus)
                .IsRequired().HasMaxLength(40);
            entity.Property(x => x.ToStatus)
                .IsRequired().HasMaxLength(40);
            entity.Property(x => x.ApprovedAmount)
                .HasPrecision(12, 2);
            entity.Property(x => x.ExternalReference)
                .HasMaxLength(120);
            entity.Property(x => x.EvidenceReference)
                .IsRequired().HasMaxLength(300);
            entity.Property(x => x.PayloadSnapshotJson);
            entity.Property(x => x.Reason)
                .IsRequired().HasMaxLength(1000);

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.ClaimId,
                x.PerformedAtUtc
            });

            entity.HasOne<MedicalAidClaim>().WithMany()
                .HasForeignKey(x => x.ClaimId)
                .OnDelete(DeleteBehavior.Restrict);
        });


        // CT_PHASE7D1: Reported remittance advice only.
        // This entity does NOT represent funds received.



        // CT_PHASE7E3_ALLOCATION_REVERSALS
        modelBuilder.Entity<MedicalAidInvoiceAllocationReversal>(entity =>
        {
            entity.ToTable("MedicalAidInvoiceAllocationReversals");

            entity.HasKey(x => x.Id);

            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.Reason)
                .IsRequired()
                .HasMaxLength(1000);

            // Only one full reversal per allocation.
            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.AllocationId
            }).IsUnique();

            entity.HasOne<MedicalAidInvoiceAllocation>()
                .WithMany()
                .HasForeignKey(x => x.AllocationId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // CT_PHASE7E3_INVOICE_ALLOCATIONS
        modelBuilder.Entity<MedicalAidInvoiceAllocation>(entity =>
        {
            entity.ToTable("MedicalAidInvoiceAllocations");

            entity.HasKey(x => x.Id);

            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.Amount)
                .HasPrecision(12, 2);

            entity.Property(x => x.EvidenceReference)
                .IsRequired().HasMaxLength(300);

            entity.Property(x => x.Notes)
                .IsRequired().HasMaxLength(1000);

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.RemittanceMatchId
            });

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.InvoiceId
            });

            entity.HasOne<MedicalAidRemittanceMatch>()
                .WithMany()
                .HasForeignKey(x => x.RemittanceMatchId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<Invoice>()
                .WithMany()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // CT_PHASE7E2_REMITTANCE_MATCHING
        modelBuilder.Entity<MedicalAidRemittanceMatch>(entity =>
        {
            entity.ToTable("MedicalAidRemittanceMatches");

            entity.HasKey(x => x.Id);

            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.MatchedAmount)
                .HasPrecision(12, 2);

            entity.Property(x => x.EvidenceReference)
                .IsRequired().HasMaxLength(300);

            entity.Property(x => x.Notes)
                .IsRequired().HasMaxLength(1000);

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.BankReceiptId,
                x.RemittanceAdviceId
            }).IsUnique();

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.RemittanceAdviceId
            });

            entity.HasOne<MedicalAidBankReceipt>()
                .WithMany()
                .HasForeignKey(x => x.BankReceiptId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne<MedicalAidRemittanceAdvice>()
                .WithMany()
                .HasForeignKey(x => x.RemittanceAdviceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // CT_PHASE7E1_SCHEME_BANK_RECEIPTS
        modelBuilder.Entity<MedicalAidBankReceipt>(entity =>
        {
            entity.ToTable("MedicalAidBankReceipts");

            entity.HasKey(x => x.Id);

            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.SchemeName)
                .IsRequired().HasMaxLength(160);

            entity.Property(x => x.SchemeKey)
                .IsRequired().HasMaxLength(160);

            entity.Property(x => x.BankReference)
                .IsRequired().HasMaxLength(120);

            entity.Property(x => x.BankReferenceKey)
                .IsRequired().HasMaxLength(120);

            entity.Property(x => x.Currency)
                .IsRequired().HasMaxLength(3);

            entity.Property(x => x.EvidenceReference)
                .IsRequired().HasMaxLength(300);

            entity.Property(x => x.Notes)
                .IsRequired().HasMaxLength(1000);

            entity.Property(x => x.Amount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.SchemeKey,
                x.BankReferenceKey
            }).IsUnique();

            entity.HasOne<DentalPractice>()
                .WithMany()
                .HasForeignKey(x => x.DentalPracticeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MedicalAidRemittanceAdvice>(entity =>
        {
            entity.ToTable("MedicalAidRemittanceAdvices");
            entity.HasKey(x => x.Id);

            entity.HasQueryFilter(
                x => x.DentalPracticeId == CurrentPracticeId);

            entity.Property(x => x.RemittanceReference)
                .IsRequired().HasMaxLength(120);

            entity.Property(x => x.EvidenceReference)
                .IsRequired().HasMaxLength(300);

            entity.Property(x => x.Notes)
                .IsRequired().HasMaxLength(1000);

            entity.Property(x => x.AdvisedAmount)
                .HasPrecision(12, 2);

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.RequestId
            }).IsUnique();

            entity.HasIndex(x => new
            {
                x.DentalPracticeId,
                x.ClaimId,
                x.RemittanceReference
            }).IsUnique();

            entity.HasOne<MedicalAidClaim>()
                .WithMany()
                .HasForeignKey(x => x.ClaimId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.HasQueryFilter(p => p.DentalPracticeId == CurrentPracticeId);
            entity.Property(p => p.ReceiptNumber).IsRequired().HasMaxLength(64);
            entity.Property(p => p.Method).IsRequired().HasMaxLength(16);
            entity.Property(p => p.Reference).HasMaxLength(100);
            entity.Property(p => p.Amount).HasPrecision(12, 2);
            entity.HasIndex(p => new { p.DentalPracticeId, p.AppointmentId });
            entity.HasIndex(p => new { p.DentalPracticeId, p.RequestId }).IsUnique();
            entity.HasIndex(p => new { p.DentalPracticeId, p.ReceiptNumber }).IsUnique();
            entity.HasOne<Appointment>().WithMany()
                .HasForeignKey(p => p.AppointmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // CT_REGISTRATION_DETAILS_V2
        modelBuilder.Entity<PatientRegistrationDetails>(entity =>
        {
            entity.ToTable("PatientRegistrationDetails");
            entity.HasKey(x => x.Id);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.HasIndex(x => new { x.DentalPracticeId, x.PatientId }).IsUnique();
            entity.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(x => x.HomePhone).HasMaxLength(30);
            entity.Property(x => x.WorkPhone).HasMaxLength(30);
            entity.Property(x => x.Occupation).HasMaxLength(150);
            entity.Property(x => x.Employer).HasMaxLength(200);
            entity.Property(x => x.ResponsibleName).HasMaxLength(200);
            entity.Property(x => x.ResponsibleRelationship).HasMaxLength(100);
            entity.Property(x => x.ResponsiblePhone).HasMaxLength(30);
            entity.Property(x => x.ResponsibleEmail).HasMaxLength(256);
            entity.Property(x => x.ResponsibleAddress).HasMaxLength(500);
            entity.Property(x => x.ResponsibleIdNumber).HasMaxLength(40);
            entity.Property(x => x.SignerName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.SignerCapacity).HasMaxLength(40).IsRequired();
            entity.Property(x => x.SignatureDataUrl).HasColumnType("text").IsRequired();
            entity.Property(x => x.WitnessName).HasMaxLength(200);
            entity.Property(x => x.WitnessSignatureDataUrl).HasColumnType("text");
            entity.Property(x => x.DeclarationVersion).HasMaxLength(80).IsRequired();
        });

        modelBuilder.Entity<Patient>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Title).HasMaxLength(20);
            entity.Property(p => p.FirstName).IsRequired().HasMaxLength(100);
            entity.Property(p => p.LastName).IsRequired().HasMaxLength(100);
            entity.Property(p => p.Gender).HasMaxLength(20);
            entity.Property(p => p.IdNumber).HasMaxLength(40);
            entity.Property(p => p.PhoneNumber).HasMaxLength(30);
            entity.Property(p => p.Email).HasMaxLength(256);
            entity.Property(p => p.Address).HasMaxLength(500);
            entity.Property(p => p.EmergencyContactName).HasMaxLength(200);
            entity.Property(p => p.EmergencyContactPhone).HasMaxLength(30);
            entity.Property(p => p.PaymentMethod).IsRequired().HasMaxLength(20);
            entity.Property(p => p.MedicalAidScheme).HasMaxLength(100);
            entity.Property(p => p.MedicalAidOption).HasMaxLength(100);
            entity.Property(p => p.MedicalAidMemberNumber).HasMaxLength(50);

            entity.HasIndex(p => new { p.DentalPracticeId, p.LastName, p.FirstName });
            entity.HasIndex(p => new { p.DentalPracticeId, p.IdNumber });

            entity.HasOne<DentalPractice>()
                .WithMany()
                .HasForeignKey(p => p.DentalPracticeId)
                .OnDelete(DeleteBehavior.Restrict);

            // TENANT ISOLATION: a query can only ever see its own practice's patients.
            entity.HasQueryFilter(p => p.DentalPracticeId == CurrentPracticeId);
        });

        modelBuilder.Entity<PracticeAppearance>(entity =>
        {
            entity.HasKey(x => x.DentalPracticeId);
            entity.HasQueryFilter(x => x.DentalPracticeId == CurrentPracticeId);
            entity.Property(x => x.DisplayName).IsRequired().HasMaxLength(100);
            entity.Property(x => x.Tagline).IsRequired().HasMaxLength(160);
            entity.Property(x => x.PrimaryColor).IsRequired().HasMaxLength(7);
            entity.Property(x => x.AccentColor).IsRequired().HasMaxLength(7);
            entity.Property(x => x.LayoutPreset).IsRequired().HasMaxLength(20);
            entity.Property(x => x.NavigationMode).IsRequired().HasMaxLength(12);
            entity.Property(x => x.ThemeSurface).IsRequired().HasMaxLength(10).HasDefaultValue("blue");
            entity.Property(x => x.EnabledModulesJson).IsRequired().HasColumnType("text");
            entity.HasOne<DentalPractice>().WithOne().HasForeignKey<PracticeAppearance>(x => x.DentalPracticeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AuditEvent>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.Action).IsRequired().HasMaxLength(100);
            entity.Property(a => a.EntityType).HasMaxLength(100);
            entity.Property(a => a.EntityId).HasMaxLength(100);
            entity.Property(a => a.Detail).HasMaxLength(500);
            entity.Property(a => a.IpAddress).HasMaxLength(64);
            entity.HasIndex(a => new { a.DentalPracticeId, a.OccurredAtUtc });
        });
    }
}
