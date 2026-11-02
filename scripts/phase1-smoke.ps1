<#
  CurvTab Dental 2.0 - Phase 1 smoke test.
  Proves: login/logout, roles, tenant isolation (Practice A cannot touch Practice B), staff provisioning,
  temporary-password gate, deactivation, lockout and the CSRF header.

  Needs the demo data:   dotnet user-secrets set "Seed:Demo" "true"      (Development only)
                         dotnet user-secrets set "Seed:DemoPassword" "<password>"
  Run the API first, then:
     .\phase1-smoke.ps1 -BaseUrl http://localhost:5080 -DemoPassword "<same password>" `
         -SuperAdminEmail you@example.com -SuperAdminPassword "<bootstrap password>"
#>
param(
    [Parameter(Mandatory)] [string] $BaseUrl,
    [Parameter(Mandatory)] [string] $DemoPassword,
    [Parameter(Mandatory)] [string] $SuperAdminEmail,
    [Parameter(Mandatory)] [string] $SuperAdminPassword
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$script:results = @()

function New-Session { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

function Invoke-Api {
    param(
        [string] $Method, [string] $Path, $Session,
        $Body = $null, [switch] $NoCsrfHeader
    )
    $headers = @{}
    if (-not $NoCsrfHeader) { $headers['X-Requested-With'] = 'XMLHttpRequest' }
    $p = @{
        Uri = "$BaseUrl$Path"; Method = $Method; Headers = $headers
        WebSession = $Session; ContentType = 'application/json'; UseBasicParsing = $true
    }
    if ($null -ne $Body) { $p.Body = ($Body | ConvertTo-Json -Depth 6) }
    try {
        $r = Invoke-WebRequest @p
        $json = $null
        if ($r.Content) { try { $json = $r.Content | ConvertFrom-Json } catch { } }
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json }
    }
    catch {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { throw }
        return [pscustomobject]@{ Status = [int]$resp.StatusCode; Json = $null }
    }
}

function Test-Check {
    param([string] $Name, [bool] $Condition, [string] $Detail = '')
    $script:results += [pscustomobject]@{ Check = $Name; Result = $(if ($Condition) { 'PASS' } else { 'FAIL' }); Detail = $Detail }
    $color = if ($Condition) { 'Green' } else { 'Red' }
    Write-Host ("[{0}] {1} {2}" -f $(if ($Condition) { 'PASS' } else { 'FAIL' }), $Name, $Detail) -ForegroundColor $color
}

function Sign-In($email, $password) {
    $s = New-Session
    $r = Invoke-Api POST '/api/auth/login' $s @{ email = $email; password = $password }
    return [pscustomobject]@{ Session = $s; Response = $r }
}

# ---------------------------------------------------------------- public / anonymous
$anon = New-Session
Test-Check 'Health endpoint is up'                  ((Invoke-Api GET '/api/health' $anon).Status -eq 200)
Test-Check 'Anonymous /auth/me is 401'              ((Invoke-Api GET '/api/auth/me' $anon).Status -eq 401)
Test-Check 'Anonymous /patients is 401'             ((Invoke-Api GET '/api/patients' $anon).Status -eq 401)
Test-Check 'POST without X-Requested-With is 403 (CSRF)' `
    ((Invoke-Api POST '/api/auth/login' (New-Session) @{ email = 'x@y.z'; password = 'x' } -NoCsrfHeader).Status -eq 403)
Test-Check 'Bad credentials are 401'                ((Sign-In 'admin.a@demo.local' 'definitely-wrong').Response.Status -eq 401)

# ---------------------------------------------------------------- SuperAdmin
$sa = Sign-In $SuperAdminEmail $SuperAdminPassword
Test-Check 'SuperAdmin can log in'                  ($sa.Response.Status -eq 200 -and $sa.Response.Json.role -eq 'SuperAdmin')
Test-Check 'SuperAdmin can list practices'          ((Invoke-Api GET '/api/platform/practices' $sa.Session).Status -eq 200)
Test-Check 'SuperAdmin CANNOT read patients (no practice)' ((Invoke-Api GET '/api/patients' $sa.Session).Status -eq 403)

# ---------------------------------------------------------------- Practice A / B
$adminA = Sign-In 'admin.a@demo.local' $DemoPassword
$recA   = Sign-In 'reception.a@demo.local' $DemoPassword
$adminB = Sign-In 'admin.b@demo.local' $DemoPassword
Test-Check 'Admin A logs in and is bound to a practice' ($adminA.Response.Status -eq 200 -and $adminA.Response.Json.practiceName -eq 'Demo Dental A')
Test-Check 'Admin B logs in and is bound to a different practice' ($adminB.Response.Status -eq 200 -and $adminB.Response.Json.practiceName -eq 'Demo Dental B')

$mineA = Invoke-Api GET '/api/practices/mine' $adminA.Session
Test-Check '/practices/mine returns A for admin A'  ($mineA.Status -eq 200 -and $mineA.Json.name -eq 'Demo Dental A')

# Practice B's patient id, as seen by B
$patientsB = Invoke-Api GET '/api/patients' $adminB.Session
$bPatientId = $patientsB.Json.items[0].id
Test-Check 'Admin B can see own patient'            ($patientsB.Status -eq 200 -and $patientsB.Json.total -ge 1)

# Tenant isolation: A must not reach B's record by id, by search, update or archive
Test-Check 'ISOLATION: A GET B patient id -> 404'   ((Invoke-Api GET "/api/patients/$bPatientId" $recA.Session).Status -eq 404)
Test-Check 'ISOLATION: A archive B patient -> 404'  ((Invoke-Api POST "/api/patients/$bPatientId/archive" $recA.Session).Status -eq 404)
$searchA = Invoke-Api GET '/api/patients?q=Brown' $recA.Session
Test-Check 'ISOLATION: A search for B patient finds nothing' ($searchA.Status -eq 200 -and $searchA.Json.total -eq 0)

# Roles
Test-Check 'Receptionist cannot list staff (403)'   ((Invoke-Api GET '/api/staff' $recA.Session).Status -eq 403)
Test-Check 'Receptionist cannot read audit (403)'   ((Invoke-Api GET '/api/audit' $recA.Session).Status -eq 403)
Test-Check 'Admin A can list staff'                 ((Invoke-Api GET '/api/staff' $adminA.Session).Status -eq 200)
$staffA = (Invoke-Api GET '/api/staff' $adminA.Session).Json
Test-Check 'ISOLATION: A staff list has no B users' (@($staffA | Where-Object { $_.email -like '*.b@demo.local' }).Count -eq 0)

# Patient create / duplicate handling by the receptionist
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$newPatient = @{ firstName = "Smoke$suffix"; lastName = 'Tester'; dateOfBirth = '1985-05-05'; paymentMethod = 'Cash' }
$created = Invoke-Api POST '/api/patients' $recA.Session $newPatient
Test-Check 'Receptionist creates a patient (201)'   ($created.Status -eq 201)
Test-Check 'Duplicate name+DOB is warned (409)'     ((Invoke-Api POST '/api/patients' $recA.Session $newPatient).Status -eq 409)
Test-Check 'Duplicate allowed with ?allowDuplicate=true' ((Invoke-Api POST '/api/patients?allowDuplicate=true' $recA.Session $newPatient).Status -eq 201)
$medAidBad = @{ firstName = 'No'; lastName = 'Scheme'; paymentMethod = 'MedicalAid' }
Test-Check 'Medical aid without scheme is rejected (400)' ((Invoke-Api POST '/api/patients' $recA.Session $medAidBad).Status -eq 400)

# Lab technician sees minimum data
$labA = Sign-In 'lab.a@demo.local' $DemoPassword
$labList = Invoke-Api GET '/api/patients' $labA.Session
Test-Check 'Lab technician can read patients but not write' `
    ($labList.Status -eq 200 -and (Invoke-Api POST '/api/patients' $labA.Session $newPatient).Status -eq 403)
Test-Check 'Lab technician view hides date of birth' ($null -eq $labList.Json.items[0].dateOfBirth)

# Audit trail written
$audit = Invoke-Api GET '/api/audit?pageSize=200' $adminA.Session
Test-Check 'Audit trail records patient creation'   ($audit.Status -eq 200 -and @($audit.Json.items | Where-Object { $_.action -eq 'PATIENT_CREATED' }).Count -ge 1)

# ---------------------------------------------------------------- staff provisioning + temp-password gate
$newEmail = "smoke.$suffix@demo.local"
$tempPwd  = "Tmp#$suffix" + 'aA1xyz'
$staffBody = @{ email = $newEmail; fullName = 'Smoke Receptionist'; role = 'Receptionist'; temporaryPassword = $tempPwd }
$createStaff = Invoke-Api POST '/api/staff' $adminA.Session $staffBody
Test-Check 'Admin A provisions a Receptionist (201)' ($createStaff.Status -eq 201)
Test-Check 'Admin cannot create a PracticeAdmin'    ((Invoke-Api POST '/api/staff' $adminA.Session @{ email = "x$suffix@demo.local"; fullName = 'X'; role = 'PracticeAdmin'; temporaryPassword = $tempPwd }).Status -eq 400)
$newStaffId = $createStaff.Json.id

$newUser = Sign-In $newEmail $tempPwd
Test-Check 'New staff can log in, flagged must-change-password' ($newUser.Response.Status -eq 200 -and $newUser.Response.Json.mustChangePassword -eq $true)
Test-Check 'Temp-password user is blocked from patients (403)' ((Invoke-Api GET '/api/patients' $newUser.Session).Status -eq 403)
$newPwd = "New#$suffix" + 'bB2xyz'
$chg = Invoke-Api POST '/api/auth/change-password' $newUser.Session @{ currentPassword = $tempPwd; newPassword = $newPwd }
Test-Check 'Change password succeeds (204)'         ($chg.Status -eq 204)
Test-Check 'After change, patients are reachable (200)' ((Invoke-Api GET '/api/patients' $newUser.Session).Status -eq 200)

# Practice B admin cannot manage A's staff
Test-Check 'ISOLATION: B admin cannot deactivate A staff (404)' `
    ((Invoke-Api PATCH "/api/staff/$newStaffId/active" $adminB.Session @{ isActive = $false }).Status -eq 404)

# Deactivation takes effect on the very next request
$deact = Invoke-Api PATCH "/api/staff/$newStaffId/active" $adminA.Session @{ isActive = $false }
Test-Check 'Admin A deactivates the user (204)'     ($deact.Status -eq 204)
Test-Check 'Deactivated user is rejected immediately (401)' ((Invoke-Api GET '/api/patients' $newUser.Session).Status -eq 401)
Test-Check 'Deactivated user cannot log in again'   ((Sign-In $newEmail $newPwd).Response.Status -eq 401)

# ---------------------------------------------------------------- lockout
$lockEmail = "lock.$suffix@demo.local"
$lockPwd = "Lck#$suffix" + 'cC3xyz'
[void](Invoke-Api POST '/api/staff' $adminA.Session @{ email = $lockEmail; fullName = 'Lock Test'; role = 'Finance'; temporaryPassword = $lockPwd })
1..5 | ForEach-Object { [void](Sign-In $lockEmail 'wrong-password-123') }
$locked = Sign-In $lockEmail $lockPwd
Test-Check 'Account locks after 5 bad passwords (423)' ($locked.Response.Status -eq 423)

# ---------------------------------------------------------------- logout
$out = Invoke-Api POST '/api/auth/logout' $recA.Session
Test-Check 'Logout succeeds (204)'                  ($out.Status -eq 204)
Test-Check 'Session is dead after logout (401)'     ((Invoke-Api GET '/api/patients' $recA.Session).Status -eq 401)

# ---------------------------------------------------------------- summary
Write-Host ''
$failed = @($script:results | Where-Object { $_.Result -eq 'FAIL' })
Write-Host ("{0} checks, {1} passed, {2} failed" -f $script:results.Count, ($script:results.Count - $failed.Count), $failed.Count) `
    -ForegroundColor $(if ($failed.Count -eq 0) { 'Green' } else { 'Red' })
if ($failed.Count -gt 0) { $failed | Format-Table -AutoSize; exit 1 }