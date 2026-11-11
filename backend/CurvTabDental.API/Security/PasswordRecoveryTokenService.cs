using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using CurvTabDental.Infrastructure.Identity;
using Microsoft.AspNetCore.WebUtilities;

namespace CurvTabDental.API.Security;

/// <summary>
/// Stateless, single-use reset links: HMAC is keyed with a persistent secret
/// configured on Render, and bound to the current Identity security stamp.
/// Changing the password invalidates all previously issued links. This works
/// even after a free Render instance sleeps or restarts.
/// </summary>
public sealed class PasswordRecoveryTokenService
{
    private readonly byte[] _secret;
    private const int ValidMinutes = 30;

    public PasswordRecoveryTokenService(IConfiguration configuration)
    {
        var encoded = configuration["PasswordRecovery:SigningKey"];
        if (string.IsNullOrWhiteSpace(encoded))
        {
            _secret = [];
            return;
        }
        try { _secret = Convert.FromBase64String(encoded); }
        catch (FormatException) { _secret = []; }
    }

    public bool IsConfigured => _secret.Length >= 32;

    public string Generate(ApplicationUser user)
    {
        if (!IsConfigured) throw new InvalidOperationException("Password recovery signing key not configured.");
        var deadline = DateTimeOffset.UtcNow.AddMinutes(ValidMinutes).ToUnixTimeSeconds();
        var nonce = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(18));
        var envelope = $"{deadline}:{nonce}";
        var signature = Sign(user, envelope);
        return WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes($"{envelope}:{signature}"));
    }

    public bool Validate(ApplicationUser user, string token)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(token) || token.Length > 4096)
            return false;
        try
        {
            var envelope = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
            var parts = envelope.Split(':');
            if (parts.Length != 3 ||
                !long.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var deadline) ||
                parts[1].Length != 24 ||
                deadline <= DateTimeOffset.UtcNow.ToUnixTimeSeconds() ||
                deadline > DateTimeOffset.UtcNow.AddMinutes(ValidMinutes).ToUnixTimeSeconds())
                return false;

            var payload = $"{parts[0]}:{parts[1]}";
            var expected = WebEncoders.Base64UrlDecode(Sign(user, payload));
            var received = WebEncoders.Base64UrlDecode(parts[2]);
            return expected.Length == received.Length &&
                CryptographicOperations.FixedTimeEquals(expected, received);
        }
        catch (Exception ex) when (ex is FormatException or ArgumentException or DecoderFallbackException)
        {
            return false;
        }
    }

    private string Sign(ApplicationUser user, string envelope)
    {
        var input = Encoding.UTF8.GetBytes($"{user.Id:N}|{user.SecurityStamp}|{envelope}");
        return WebEncoders.Base64UrlEncode(HMACSHA256.HashData(_secret, input));
    }
}
