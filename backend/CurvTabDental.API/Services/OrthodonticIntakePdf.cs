using System.Text.RegularExpressions;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace CurvTabDental.API.Services;

/// <summary>
/// Generates a patient-scoped PDF from the ACTUAL versioned text stored at
/// signing. The PDF does not silently substitute a newer agreement version.
/// The stored document SHA-256 and signer evidence remain the source of truth.
/// </summary>
public static class OrthodonticIntakePdf
{
    public sealed record SignedIntakeDocument(
        Guid CaseId, string PracticeName, string PatientName,
        string Source, string DocumentVersion, string FullText,
        string Sha256, string SignerName, string SignerCapacity,
        string AcceptanceMethod, DateTime AcceptedAtUtc,
        string? SignatureDataUrl);

    public static byte[] RenderAdvanceReceipt(
        string practiceName, string patientName, string receiptNumber,
        Guid receiptId, Guid intakeId, decimal amount, string method,
        string? reference, DateTime receivedAtUtc)
    {
        using var document = new PdfDocument();
        document.Info.Title = "Orthodontic advance receipt " + receiptNumber;
        document.Info.Author = practiceName;
        var page = document.AddPage();
        page.Size = PdfSharp.PageSize.A4;
        using (var g = XGraphics.FromPdfPage(page))
        {
            var title = new XFont("DejaVu Sans", 17, XFontStyleEx.Bold);
            var strong = new XFont("DejaVu Sans", 10, XFontStyleEx.Bold);
            var ordinary = new XFont("DejaVu Sans", 10);
            var small = new XFont("DejaVu Sans", 8);
            var y = 60.0;
            void Row(string label, string value)
            {
                g.DrawString(label, strong, XBrushes.Black, new XPoint(48, y));
                g.DrawString(value, ordinary, XBrushes.Black, new XPoint(210, y));
                y += 30;
            }
            g.DrawString(practiceName, title, XBrushes.Black, new XPoint(48, y));
            y += 37;
            g.DrawString("ORTHODONTIC INTAKE ADVANCE RECEIPT", strong, XBrushes.Black, new XPoint(48, y));
            y += 33;
            Row("Receipt number", receiptNumber);
            Row("Patient", patientName);
            Row("Intake ID", intakeId.ToString("D"));
            Row("Payment ID", receiptId.ToString("D"));
            Row("Received (SA time)", receivedAtUtc.AddHours(2).ToString("yyyy-MM-dd HH:mm"));
            Row("Payment method", method);
            if (!string.IsNullOrWhiteSpace(reference)) Row("Transaction reference", reference);
            Row("Actual amount received", "R " + amount.ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("en-ZA")));
            y += 14;
            g.DrawLine(XPens.LightGray, 48, y, page.Width.Point - 48, y);
            y += 31;
            g.DrawString("Recorded as patient credit toward future agreed orthodontic treatment.", ordinary,
                XBrushes.Black, new XPoint(48, y));
            y += 22;
            g.DrawString("It is not a final treatment agreement or a second instalment payment.", small,
                XBrushes.Black, new XPoint(48, y));
            y += 20;
            g.DrawString("Refunds/forfeiture depend on the actual disclosed, accepted terms and applicable law.", small,
                XBrushes.Black, new XPoint(48, y));
        }
        using var buffer = new MemoryStream();
        document.Save(buffer, false);
        return buffer.ToArray();
    }

    private const double Margin = 44;
    private const double BodyLine = 14;

    public static byte[] Render(SignedIntakeDocument info)
    {
        if (string.IsNullOrWhiteSpace(info.FullText) || info.FullText.Length > 40_000 ||
            string.IsNullOrWhiteSpace(info.DocumentVersion) ||
            string.IsNullOrWhiteSpace(info.Sha256))
            throw new InvalidOperationException("Signed intake evidence is missing or exceeds supported length.");

        using var document = new PdfDocument();
        document.Info.Title = "Orthodontic intake terms - " + info.PatientName;
        document.Info.Subject = "Signed versioned orthodontic intake document";
        document.Info.Author = info.PracticeName;

        PdfPage? currentPage = null;
        XGraphics? graphics = null;
        double y = 0;
        var regular = new XFont("DejaVu Sans", 9.2);
        var heading = new XFont("DejaVu Sans", 15, XFontStyleEx.Bold);
        var bold = new XFont("DejaVu Sans", 9.2, XFontStyleEx.Bold);
        var small = new XFont("DejaVu Sans", 7.4);

        void NewPage()
        {
            graphics?.Dispose();
            currentPage = document.AddPage();
            currentPage.Size = PdfSharp.PageSize.A4;
            graphics = XGraphics.FromPdfPage(currentPage);
            y = Margin;
        }
        double Width() => currentPage!.Width.Point - 2 * Margin;
        void EnsureSpace(double size)
        {
            if (currentPage is null || currentPage.Height.Point - Margin - y < size)
                NewPage();
        }
        void Line(string value, XFont font, double advance = BodyLine)
        {
            EnsureSpace(advance);
            graphics!.DrawString(value, font, XBrushes.Black, new XPoint(Margin, y + advance - 3));
            y += advance;
        }
        void Paragraph(string text, XFont font, double lineHeight)
        {
            foreach (var source in text.Replace("\r\n", "\n").Split('\n'))
            {
                if (source.Length == 0) { y += lineHeight / 2; continue; }
                var words = Regex.Split(source, @"\s+").Where(w => w.Length > 0).ToArray();
                var line = "";
                foreach (var word in words)
                {
                    var candidate = line.Length == 0 ? word : line + " " + word;
                    if (graphics!.MeasureString(candidate, font).Width <= Width())
                    {
                        line = candidate;
                        continue;
                    }
                    if (line.Length > 0) { Line(line, font, lineHeight); line = ""; }
                    // Long unspaced references must still wrap within the page.
                    foreach (var ch in word)
                    {
                        var next = line + ch;
                        if (graphics.MeasureString(next, font).Width > Width() && line.Length > 0)
                        {
                            Line(line, font, lineHeight);
                            line = "";
                        }
                        line += ch;
                    }
                }
                if (line.Length > 0) Line(line, font, lineHeight);
            }
            y += 10;
        }

        NewPage();
        Line("CURVTAB DENTAL · ORTHODONTIC INTAKE", heading, 29);
        Line(info.PracticeName, bold, 19);
        Line("Patient: " + info.PatientName, regular);
        Line("Case: " + info.CaseId, small, 12);
        Line("Entry route: " + info.Source, regular);
        Line("Approved intake document version: " + info.DocumentVersion, regular);
        y += 8;
        graphics!.DrawLine(XPens.LightGray, Margin, y, Margin + Width(), y);
        y += 17;

        Paragraph(info.FullText, regular, BodyLine + 1);
        EnsureSpace(110);
        Line("ELECTRONIC INTAKE ACCEPTANCE", bold, 22);
        Line("Signed by: " + info.SignerName, regular);
        Line("Authority: " + info.SignerCapacity, regular);
        Line("Method: " + info.AcceptanceMethod, regular);
        Line("Recorded (UTC): " + info.AcceptedAtUtc.ToString("yyyy-MM-dd HH:mm:ss 'UTC'"), regular);
        y += 7;

        var prefix = "data:image/png;base64,";
        if (info.SignatureDataUrl?.StartsWith(prefix, StringComparison.Ordinal) == true)
        {
            var signatureBytes = Convert.FromBase64String(info.SignatureDataUrl[prefix.Length..]);
            using var signatureStream = new MemoryStream(signatureBytes);
            using var signature = XImage.FromStream(signatureStream);
            EnsureSpace(68);
            var imageHeight = 58.0;
            var scale = Math.Min(220.0 / signature.PixelWidth, imageHeight / signature.PixelHeight);
            graphics!.DrawImage(signature, Margin, y, signature.PixelWidth * scale, signature.PixelHeight * scale);
            y += 62;
        }
        y += 5;
        Paragraph("Full approved document SHA-256: " + info.Sha256, small, 11);
        Paragraph("This is an orthodontic INTAKE record only. It does not constitute a final braces treatment contract, diagnosis, or instalment agreement.", small, 11);

        graphics?.Dispose();
        using var output = new MemoryStream();
        document.Save(output, false);
        return output.ToArray();
    }
}

/// <summary>
/// Explicit font resolver for PDFsharp Core on Linux/Windows. No external
/// web font download or patient data transfer.
/// </summary>
public sealed class CurvTabPdfFontResolver : IFontResolver
{
    public FontResolverInfo? ResolveTypeface(string familyName, bool bold, bool italic)
        => new(bold ? "CurvTab-DejaVu-Bold" : "CurvTab-DejaVu", false, italic);

    public byte[]? GetFont(string faceName)
    {
        var bold = faceName == "CurvTab-DejaVu-Bold";
        var filename = bold ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf";
        var linux = Path.Combine("/usr/share/fonts/truetype/dejavu", filename);
        if (File.Exists(linux)) return File.ReadAllBytes(linux);
        var windows = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Fonts),
            bold ? "arialbd.ttf" : "arial.ttf");
        if (File.Exists(windows)) return File.ReadAllBytes(windows);
        throw new FileNotFoundException("No Unicode font is available for signed PDF generation.");
    }
}
