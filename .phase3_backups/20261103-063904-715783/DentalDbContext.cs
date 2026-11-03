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
    public DbSet<Consultation> Consultations => Set<Consultation>();
    public DbSet<PatientMedicalHistory> PatientMedicalHistories => Set<PatientMedicalHistory>();
    public DbSet<ConsultationCharge> ConsultationCharges => Set<ConsultationCharge>();

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
