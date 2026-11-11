using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace CurvTabDental.API.Services;

/// <summary>
/// SMTP-based password recovery mailer. Requires externally supplied secrets.
/// Never sends credentials or writes reset tokens to logs.
/// </summary>
public sealed class PasswordRecoveryMailService
{
    private readonly IConfiguration _config;

    public PasswordRecoveryMailService(IConfiguration config) => _config = config;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config["PasswordRecovery:SmtpHost"]) &&
        !string.IsNullOrWhiteSpace(_config["PasswordRecovery:SmtpUsername"]) &&
        !string.IsNullOrWhiteSpace(_config["PasswordRecovery:SmtpPassword"]) &&
        !string.IsNullOrWhiteSpace(_config["PasswordRecovery:FromAddress"]) &&
        !string.IsNullOrWhiteSpace(_config["PasswordRecovery:FrontendOrigin"]);

    public async Task SendResetLinkAsync(string destination, string resetLink, CancellationToken ct)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Password recovery mail transport has not been configured.");

        var host = _config["PasswordRecovery:SmtpHost"]!;
        var username = _config["PasswordRecovery:SmtpUsername"]!;
        var password = _config["PasswordRecovery:SmtpPassword"]!;
        var from = _config["PasswordRecovery:FromAddress"]!;
        var port = int.TryParse(_config["PasswordRecovery:SmtpPort"], out var result) ? result : 587;
        if (port is < 1 or > 65535)
            throw new InvalidOperationException("Invalid SMTP port.");

        using var message = new MailMessage(new MailAddress(from, "CurvTab Dental"), new MailAddress(destination))
        {
            Subject = "Reset your CurvTab Dental password",
            Body = "A password reset was requested for your CurvTab Dental account.\n\n" +
                   "Open the following secure link to choose a new password:\n" +
                   resetLink + "\n\nThis link expires in 30 minutes. If you did not request this, ignore this message.\n" +
                   "Do not share the link with anyone.",
            IsBodyHtml = false
        };

        using var client = new SmtpClient(host, port)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(username, password),
            DeliveryMethod = SmtpDeliveryMethod.Network,
            Timeout = 15000
        };

        // SmtpClient has no cancellation overload on every target framework.
        // The service timeout bounds delivery and keeps the token off the UI.
        await client.SendMailAsync(message, ct);
    }

    public string BuildResetLink(string email, string token)
    {
        var root = _config["PasswordRecovery:FrontendOrigin"]!;
        if (!Uri.TryCreate(root, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrWhiteSpace(uri.UserInfo) ||
            !string.IsNullOrWhiteSpace(uri.Query) ||
            !string.IsNullOrWhiteSpace(uri.Fragment))
            throw new InvalidOperationException("Recovery frontend origin must be an HTTPS URL without query parameters.");
        return $"{root.TrimEnd('/')}/?reset-email={Uri.EscapeDataString(email)}&reset-token={Uri.EscapeDataString(token)}";
    }
}
