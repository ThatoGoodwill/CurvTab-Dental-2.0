using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace CurvTabDental.Infrastructure.Identity;

/// <summary>Adds the practice id to the signed auth cookie so every request knows its tenant.</summary>
public class PracticeClaimsPrincipalFactory : UserClaimsPrincipalFactory<ApplicationUser, ApplicationRole>
{
    public PracticeClaimsPrincipalFactory(
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        IOptions<IdentityOptions> options)
        : base(userManager, roleManager, options)
    {
    }

    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(ApplicationUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        if (user.DentalPracticeId is Guid practiceId)
        {
            identity.AddClaim(new Claim(ClaimNames.PracticeId, practiceId.ToString()));
        }
        return identity;
    }
}
