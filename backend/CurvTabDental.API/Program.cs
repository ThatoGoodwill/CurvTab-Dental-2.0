using CurvTabDental.API.Notifications;
using System.Threading.RateLimiting;
using CurvTabDental.API.Middleware;
using CurvTabDental.API.Security;
using CurvTabDental.API.Services;
using CurvTabDental.API.Seeding;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using CurvTabDental.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Core services ----------
builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddHttpContextAccessor();

builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddHttpClient<PasswordRecoveryMailService>();
builder.Services.Configure<Microsoft.AspNetCore.DataProtection.TokenProviderOptions>(options =>
    options.TokenLifespan = TimeSpan.FromMinutes(30));
builder.Services.Configure<SecurityStampValidatorOptions>(options =>
    options.ValidationInterval = TimeSpan.FromMinutes(1));

// CT_PHASE8B_WORKER_REGISTRATION
// Disabled by default; only creates mock reminder records.
builder.Services.AddHostedService<
    CurvTabDental.API.Services.WhatsAppReminderWorker>();


// ---------- Database ----------
// ConnectionStrings:DentalDatabase lives in dotnet user-secrets (never in Git).
// Staging may accept a Neon URI through a dedicated environment variable.
// Never read this setting in production, and never print the credential.
var dentalConnection = builder.Configuration.GetConnectionString("DentalDatabase");
if (builder.Environment.IsStaging() && string.IsNullOrWhiteSpace(dentalConnection))
{
    var uriText = builder.Configuration["STAGING_DATABASE_URL"];
    if (!string.IsNullOrWhiteSpace(uriText))
    {
        var dbUri = new Uri(uriText);
        if (dbUri.Scheme is not ("postgres" or "postgresql"))
            throw new InvalidOperationException("Staging database URL must use PostgreSQL.");
        var userInfo = dbUri.UserInfo.Split(':', 2);
        if (userInfo.Length != 2)
            throw new InvalidOperationException("Staging database URL is missing credentials.");
        dentalConnection = new Npgsql.NpgsqlConnectionStringBuilder
        {
            Host = dbUri.Host,
            Port = dbUri.Port > 0 ? dbUri.Port : 5432,
            Database = Uri.UnescapeDataString(dbUri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = Uri.UnescapeDataString(userInfo[1]),
            SslMode = Npgsql.SslMode.Require,
        }.ConnectionString;
    }
}
builder.Services.AddDbContext<DentalDbContext>(options =>
    options.UseNpgsql(dentalConnection));

// ---------- Identity + cookie authentication ----------
builder.Services
    .AddIdentity<ApplicationUser, ApplicationRole>(options =>
    {
        options.User.RequireUniqueEmail = true;

        options.Password.RequiredLength = 10;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = false;

        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        options.Lockout.AllowedForNewUsers = true;
    })
    .AddEntityFrameworkStores<DentalDbContext>()
    .AddClaimsPrincipalFactory<PracticeClaimsPrincipalFactory>()
    .AddDefaultTokenProviders();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "ctd.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;

    // This is an API: answer 401/403 instead of redirecting to a login page.
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});

// Deny by default (FR-009): any endpoint without [AllowAnonymous] requires a signed-in user.
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// ---------- CORS for the React front-end ----------
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                     ?? new[] { "http://localhost:5173" };
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

// ---------- Rate limiting (login brute-force; lockout is the second layer) ----------
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    options.AddPolicy("password-recovery", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"recovery:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0
            }));
});

var app = builder.Build();

// ---------- ISOLATED STAGING SCHEMA INITIALIZATION ----------
// Only the dedicated staging service may self-migrate. Never use this
// switch on a production Render instance or against a production DB.
if (builder.Environment.IsStaging() && builder.Configuration.GetValue<bool>("Staging:AutoMigrate"))
{
    using var migrationScope = app.Services.CreateScope();
    var stagingDb = migrationScope.ServiceProvider.GetRequiredService<DentalDbContext>();
    await stagingDb.Database.MigrateAsync();
    app.Logger.LogInformation("Staging schema migrations applied to isolated database.");
}

// ---------- Seed roles / bootstrap admin / demo data ----------
try
{
    await IdentitySeeder.SeedAsync(app.Services, app.Configuration, app.Environment);
}
catch (Exception ex)
{
    app.Logger.LogError(ex,
        "Seeding failed. Have you applied the migrations? (dotnet ef database update ...)");
}

// ---------- HTTP pipeline (order matters) ----------
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseCors("Frontend");
app.UseRateLimiter();
app.UseMiddleware<CsrfHeaderMiddleware>();
app.UseAuthentication();
app.UseMiddleware<ActiveUserMiddleware>();
app.UseAuthorization();

app.MapHub<ClinicNotificationsHub>("/api/hubs/clinic");
app.MapControllers();

app.Run();

// Makes the entry point visible to future WebApplicationFactory integration tests.
public partial class Program { }
