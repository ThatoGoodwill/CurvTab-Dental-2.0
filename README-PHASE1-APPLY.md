# CurvTab Dental 2.0 — Phase 1 backend pack

**Status: written but NOT compiled.** It was written in an environment without the .NET SDK, so your first
`dotnet build` is the real compile check. Expect zero to a few small errors (a missing `using`, a typo). Paste any
error output back and it will be fixed. Do not tell the client it is "tested" until the smoke script below passes.

## What Phase 1 gives you

| Area | What works |
|---|---|
| Identity | ASP.NET Identity (cookie), 6 roles, password policy, lockout (5 tries / 15 min), login rate limit |
| Tenancy | Every user bound to one practice; practice id comes from the signed cookie only; EF global query filter on patients |
| Provisioning | No public registration. SuperAdmin creates practice + first admin; PracticeAdmin creates staff, deactivates, resets passwords |
| Safety | Deactivated user/practice is signed out on the next request; temporary password blocks everything but `/api/auth/*`; CSRF header check |
| Patients | Create / search / get / update / archive, duplicate warning (409), role-based field hiding (Lab, Finance) |
| Audit | Login, logout, staff and patient actions written to `AuditEvents`; `GET /api/audit` for the practice admin |
| Health | `GET /api/health` actually checks the database |

Endpoints: `POST /api/auth/login|logout|change-password`, `GET /api/auth/me`, `GET|PUT /api/practices/mine`,
`GET|POST /api/platform/practices`, `PATCH /api/platform/practices/{id}/active`, `GET|POST /api/staff`,
`PATCH /api/staff/{id}/active`, `POST /api/staff/{id}/reset-password`,
`GET|POST /api/patients`, `GET|PUT /api/patients/{id}`, `POST /api/patients/{id}/archive`, `GET /api/audit`, `GET /api/health`.

**The React client must send `X-Requested-With: XMLHttpRequest` on every POST/PUT/PATCH/DELETE and use
`credentials: 'include'`.**

## 1. Copy the files

Copy the folders in `backend/` over your own `CurvTab-Dental-2.0/backend/`. Same project names, same paths.

- `CurvTabDental.API/Program.cs` and `Infrastructure/Persistence/DentalDbContext.cs` **replace** your versions.
  (Your `DentalPractice.cs` is not touched.)
- If you already pasted files from the earlier Identity guide (`ApplicationUser.cs`, `StaffRoles.cs`,
  `AuthController.cs`, `PracticesController.cs`, `AuthContracts.cs`, ...), delete those first so there are no duplicate
  class names. Keep a copy somewhere if you want to compare.

## 2. Packages (edit the `.csproj` files)

`CurvTabDental.Infrastructure.csproj` — add inside an `<ItemGroup>`:

```xml
<PackageReference Include="Microsoft.AspNetCore.Identity.EntityFrameworkCore" Version="10.0.0" />
<PackageReference Include="System.Security.Cryptography.Pkcs" Version="10.0.*" />
<PackageReference Include="System.Security.Cryptography.Xml" Version="10.0.*" />
```

`CurvTabDental.API.csproj` — add:

```xml
<PackageReference Include="System.Security.Cryptography.Pkcs" Version="10.0.*" />
```

The last two lines override the vulnerable transitive `9.0.0` versions from your NU1902/NU1903 warnings. Then check:

```powershell
cd backend
dotnet restore
dotnet list package --vulnerable --include-transitive
```

If anything is still flagged, run `dotnet list package --include-transitive` and pin the newest 10.0.x of that package the same way.

Project references must exist: Application -> Domain, Infrastructure -> Domain + Application, API -> Application + Infrastructure.
(If one is missing: `dotnet add CurvTabDental.Infrastructure reference CurvTabDental.Application`.)

Add to `CurvTabDental.API/appsettings.json` (merge, don't duplicate keys):

```json
"Cors": { "AllowedOrigins": [ "http://localhost:5173" ] }
```

## 3. Secrets (never in Git)

```powershell
cd backend\CurvTabDental.API
dotnet user-secrets set "Bootstrap:SuperAdminEmail"    "you@yourdomain.com"
dotnet user-secrets set "Bootstrap:SuperAdminPassword" "<a strong password, 10+ chars, upper+lower+digit>"
# demo practices A and B for the isolation demo (Development only):
dotnet user-secrets set "Seed:Demo"         "true"
dotnet user-secrets set "Seed:DemoPassword" "<another strong password>"
```

Your `ConnectionStrings:DentalDatabase` secret (port 5434) stays as it is.

## 4. Build, then the second migration

```powershell
cd backend
dotnet build
dotnet ef migrations list --project .\CurvTabDental.Infrastructure --startup-project .\CurvTabDental.API --context DentalDbContext
```

`InitialCreate` should be listed (and applied). Do NOT re-add it. Then:

```powershell
dotnet ef migrations add AddIdentityFoundation --project .\CurvTabDental.Infrastructure --startup-project .\CurvTabDental.API --context DentalDbContext
dotnet ef database update --project .\CurvTabDental.Infrastructure --startup-project .\CurvTabDental.API --context DentalDbContext
docker exec curvtab-dental-v2-db psql -U curvtab_v2 -d curvtab_dental_v2 -c "\dt"
```

Expect tables: `AspNetUsers`, `AspNetRoles`, `AspNetUserRoles`, `Patients`, `AuditEvents`, `DentalPractices`, ...

## 5. Run and prove it

```powershell
cd backend\CurvTabDental.API
dotnet run
# (note the http://localhost:PORT it prints)
```

In a second terminal:

```powershell
cd <this pack>\scripts
.\phase1-smoke.ps1 -BaseUrl http://localhost:PORT -DemoPassword "<Seed:DemoPassword>" `
    -SuperAdminEmail you@yourdomain.com -SuperAdminPassword "<Bootstrap:SuperAdminPassword>"
```

About 45 checks print PASS/FAIL. Wait a minute before a second run (login rate limit). All green = the Phase 1 evidence
for the SRS sign-off checklist: login/logout, roles, **cross-practice denial**, lockout, deactivation, audit.
Save the console output as your proof.

Then commit:

```powershell
git status --short
git add backend docs scripts
git diff --cached --stat
git commit -m "Phase 1: Identity, tenancy, staff provisioning, patients, audit"
```

## Known limits (be upfront with the client)

- Not yet: MFA, password-reset by email, backup/restore proof, patient-data encryption at rest, automated xUnit tests
  (the smoke script is the interim evidence), React login screen.
- `IdNumber` is stored as plain text; encrypt before real patient data.
- Cookie auth + CSRF header is fine for same-site deployment (React and API on the same registrable domain).
- Do not load real patient data until the security items in section 6.3 of your tutorial are done.

## Next (Phase 2 order)

1. Visits + live queue with atomic "call next" (`SELECT ... FOR UPDATE SKIP LOCKED`) + SignalR
2. Consultation, treatment lines, tooth chart
3. Lab work orders (independent state machine)
4. Invoices, payments (money in integer cents/decimals, immutable ledger), claims, checkout
5. Then the legacy-only modules: pre-authorisation, locum commissions, expenses, stock, orthodontics, WhatsApp recalls
