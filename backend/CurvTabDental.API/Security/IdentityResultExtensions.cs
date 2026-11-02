using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace CurvTabDental.API.Security;

public static class IdentityResultExtensions
{
    public static ValidationProblemDetails ToValidationProblem(this IdentityResult result)
    {
        var errors = result.Errors
            .GroupBy(e => e.Code)
            .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray());

        return new ValidationProblemDetails(errors) { Status = StatusCodes.Status400BadRequest };
    }
}
