using System.Security.Claims;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Notifications;

// No client-callable broadcast methods: only trusted server code emits events.
// Every connection is authenticated and joined using the server-side user/practice.
[Authorize(Roles = "Receptionist,PracticeAdmin,Dentist")]
public sealed class ClinicNotificationsHub : Hub
{
    private readonly DentalDbContext _db;

    public ClinicNotificationsHub(DentalDbContext db) => _db = db;

    public static string FrontDeskGroup(Guid practiceId) => $"frontdesk:{practiceId:N}";
    public static string DentistGroup(Guid practiceId) => $"dentists:{practiceId:N}";

    public override async Task OnConnectedAsync()
    {
        if (!Guid.TryParse(
                Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            Context.Abort();
            return;
        }

        var account = await _db.Users.AsNoTracking()
            .Where(u => u.Id == userId && u.IsActive && u.DentalPracticeId.HasValue)
            .Select(u => new { u.DentalPracticeId })
            .SingleOrDefaultAsync(Context.ConnectionAborted);

        if (account?.DentalPracticeId is not Guid practiceId ||
            !await _db.DentalPractices.AsNoTracking().AnyAsync(
                p => p.Id == practiceId && p.IsActive, Context.ConnectionAborted))
        {
            Context.Abort();
            return;
        }

        if (Context.User!.IsInRole("Receptionist") || Context.User.IsInRole("PracticeAdmin"))
            await Groups.AddToGroupAsync(
                Context.ConnectionId, FrontDeskGroup(practiceId), Context.ConnectionAborted);

        if (Context.User.IsInRole("Dentist"))
            await Groups.AddToGroupAsync(
                Context.ConnectionId, DentistGroup(practiceId), Context.ConnectionAborted);

        await base.OnConnectedAsync();
    }
}
