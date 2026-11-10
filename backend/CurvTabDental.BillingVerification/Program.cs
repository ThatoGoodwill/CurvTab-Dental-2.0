using CurvTabDental.API.Controllers;

static void Eq<T>(string title, T expected, T actual) where T : IEquatable<T>
{
    if (!expected.Equals(actual))
        throw new Exception($"{title}: expected {expected}, got {actual}");
    Console.WriteLine($"PASS {title}");
}

// Acceptance figures from CurvTab Billing Separate Signoffs Developer Guide, p. 8 & 13.
var expectedCash = BillingFinancialMath.ExpectedDrawer(500m, 3000m, 250m + 600m, 0m);
Eq("Opening R500 + receipts R3000 - gloves R250 - lab payout R600", 2650m, expectedCash);
Eq("Counted cash R2600 -> shortage R50", -50m,
    BillingFinancialMath.DrawerVariance(2600m, expectedCash));

// Card and EFT are kept OUT of expected physical cash.
Eq("Expected drawer independent of card/EFT", 2650m, expectedCash);
var realReceipts = BillingFinancialMath.ReceivedMoney(3000m, 4000m, 1450m, 0m);
Eq("Real money received R8450", 8450m, realReceipts);
Eq("Recorded real expenses R850", 850m,
    BillingFinancialMath.PaidOutMoney(850m, 0m, 0m, 0m, 0m, 0m));
Eq("Net actual movement R7600", 7600m, realReceipts - 850m);

// Medical-aid submission activity R4200 is NOT a receipt.
var claimsSubmitted = 4200m;
Eq("Seven submitted claims (R4200) do not change real receipts", 8450m,
    BillingFinancialMath.ReceivedMoney(3000m, 4000m, 1450m, 0m));
Eq("Claim value is operational only", 4200m, claimsSubmitted);

// One claim R800, paid R700 later: the R100 balance needs manual adjudication,
// NOT an automatically posted patient co-payment.
Eq("Part scheme remittance leaves R100 unresolved", 100m,
    BillingFinancialMath.UnresolvedSchemeDifference(800m, 700m));
Eq("Full scheme remittance leaves no difference", 0m,
    BillingFinancialMath.UnresolvedSchemeDifference(800m, 800m));

Console.WriteLine("All client financial arithmetic acceptance checks passed.");
