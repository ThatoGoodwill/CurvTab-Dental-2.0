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

    public DbSet<DentalPractice> DentalPractices => Set<DentalPractice>();
    // Appointment records stored in PostgreSQL.
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<PracticeAppearance> PracticeAppearances => Set<PracticeAppearance>();
    public DbSet<Consultation> Consultations => Set<Consultation>();
    public DbSet<PatientMedicalHistory> PatientMedicalHistories => Set<PatientMedicalHistory>();
    public DbSet<ConsultationCharge> ConsultationCharges => Set<ConsultationCharge>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<OrthodonticFinancialAgreement> OrthodonticFinancialAgreements => Set<OrthodonticFinancialAgreement>();
    public DbSet<OrthodonticInstallment> OrthodonticInstallments => Set<OrthodonticInstallment>();
    public DbSet<DentalChartEntry> DentalChartEntries => Set<DentalChartEntry>();
    public DbSet<ClinicalImage> ClinicalImages => Set<ClinicalImage>();
    public DbSet<OrthodonticCase> OrthodonticCases => Set<OrthodonticCase>();
    public DbSet<OrthodonticProgressNote> OrthodonticProgressNotes => Set<OrthodonticProgressNote>();

    // EF evaluates this per query (it is a member of the context), not once at model build time.
    private Guid? CurrentPracticeId => _currentUser?.PracticeId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

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
