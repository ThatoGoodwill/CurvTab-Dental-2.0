using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Seeding;

/// <summary>
/// Startup seeding. Passwords are NEVER hard-coded: they come from configuration (dotnet user-secrets in dev).
///  1. Roles are always ensured.
///  2. A platform SuperAdmin is created if Bootstrap:SuperAdminEmail + Bootstrap:SuperAdminPassword are set.
///  3. In Development only, with Seed:Demo=true and Seed:DemoPassword set, two demo practices are created
///     (A and B) so that tenant isolation can be demonstrated and tested.
/// </summary>
public static class IdentitySeeder
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration config, IHostEnvironment env)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("Seeder");
        var db = sp.GetRequiredService<DentalDbContext>();
        var roles = sp.GetRequiredService<RoleManager<ApplicationRole>>();
        var users = sp.GetRequiredService<UserManager<ApplicationUser>>();

        foreach (var role in StaffRoles.All)
        {
            if (!await roles.RoleExistsAsync(role))
            {
                var created = await roles.CreateAsync(new ApplicationRole(role));
                if (!created.Succeeded)
                    logger.LogError("Could not create role {Role}: {Errors}", role,
                        string.Join("; ", created.Errors.Select(e => e.Description)));
            }
        }

        var adminEmail = config["Bootstrap:SuperAdminEmail"];
        var adminPassword = config["Bootstrap:SuperAdminPassword"];
        if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword))
        {
            await EnsureUserAsync(users, logger, adminEmail, "Platform Administrator", adminPassword,
                StaffRoles.SuperAdmin, practiceId: null);
        }
        else
        {
            logger.LogWarning("Bootstrap:SuperAdminEmail / Bootstrap:SuperAdminPassword not set; no SuperAdmin seeded.");
        }

        if ((env.IsDevelopment() || env.IsStaging()) && config.GetValue<bool>("Seed:Demo"))
        {
            var demoPassword = config["Seed:DemoPassword"];
            if (string.IsNullOrWhiteSpace(demoPassword))
            {
                logger.LogWarning("Seed:Demo is true but Seed:DemoPassword is not set; demo data skipped.");
                return;
            }

            await SeedDemoPracticeAsync(db, users, logger, "Demo Dental A", "a", demoPassword,
                new[] { ("Alice", "Anderson") });
            await SeedDemoPracticeAsync(db, users, logger, "Demo Dental B", "b", demoPassword,
                new[] { ("Bob", "Brown") });
        }
    }

    private static async Task SeedDemoPracticeAsync(
        DentalDbContext db,
        UserManager<ApplicationUser> users,
        ILogger logger,
        string practiceName,
        string tag,
        string password,
        (string First, string Last)[] patients)
    {
        var practice = await db.DentalPractices.FirstOrDefaultAsync(p => p.Name == practiceName);
        if (practice is null)
        {
            practice = new DentalPractice { Name = practiceName, Email = $"info.{tag}@demo.local", IsActive = true };
            db.DentalPractices.Add(practice);
            await db.SaveChangesAsync();
        }

        await EnsureUserAsync(users, logger, $"admin.{tag}@demo.local", $"Admin {tag.ToUpperInvariant()}",
            password, StaffRoles.PracticeAdmin, practice.Id);
        await EnsureUserAsync(users, logger, $"reception.{tag}@demo.local", $"Receptionist {tag.ToUpperInvariant()}",
            password, StaffRoles.Receptionist, practice.Id);
        await EnsureUserAsync(users, logger, $"dentist.{tag}@demo.local", $"Dentist {tag.ToUpperInvariant()}",
            password, StaffRoles.Dentist, practice.Id);
        await EnsureUserAsync(users, logger, $"finance.{tag}@demo.local", $"Finance {tag.ToUpperInvariant()}",
            password, StaffRoles.Finance, practice.Id);
        await EnsureUserAsync(users, logger, $"lab.{tag}@demo.local", $"Lab {tag.ToUpperInvariant()}",
            password, StaffRoles.LabTechnician, practice.Id);

        foreach (var (first, last) in patients)
        {
            var exists = await db.Patients
                .IgnoreQueryFilters()
                .AnyAsync(p => p.DentalPracticeId == practice.Id && p.FirstName == first && p.LastName == last);
            if (!exists)
            {
                db.Patients.Add(new Patient
                {
                    DentalPracticeId = practice.Id,
                    FirstName = first,
                    LastName = last,
                    PhoneNumber = "0710000000",
                    PaymentMethod = "Cash",
                    DateOfBirth = new DateOnly(1990, 1, 1)
                });
            }
        }
        await db.SaveChangesAsync();
    }

    private static async Task EnsureUserAsync(
        UserManager<ApplicationUser> users,
        ILogger logger,
        string email,
        string fullName,
        string password,
        string role,
        Guid? practiceId)
    {
        if (await users.FindByEmailAsync(email) is not null) return;

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FullName = fullName,
            DentalPracticeId = practiceId,
            MustChangePassword = false
        };

        var created = await users.CreateAsync(user, password);
        if (!created.Succeeded)
        {
            logger.LogError("Could not create {Email}: {Errors}", email,
                string.Join("; ", created.Errors.Select(e => e.Description)));
            return;
        }

        await users.AddToRoleAsync(user, role);
        logger.LogInformation("Seeded {Role} {Email}", role, email);
    }
}
