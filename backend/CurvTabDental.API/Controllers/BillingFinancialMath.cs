namespace CurvTabDental.API.Controllers;

/// <summary>
/// Single-source arithmetic for drawer cash; medical-aid submitted claims are
/// deliberately not arguments and cannot be counted as received money.
/// </summary>
public static class BillingFinancialMath
{
    public static decimal ExpectedDrawer(decimal openingFloat, decimal cashReceived,
        decimal cashExpenses, decimal cashRefunds) =>
        openingFloat + cashReceived - cashExpenses - cashRefunds;

    public static decimal DrawerVariance(decimal countedCash, decimal expectedDrawer) =>
        countedCash - expectedDrawer;

    public static decimal ReceivedMoney(decimal cash, decimal card, decimal eft,
        decimal actualSchemeBankDeposits) =>
        cash + card + eft + actualSchemeBankDeposits;

    public static decimal PaidOutMoney(decimal cashExpenses, decimal cardExpenses,
        decimal eftExpenses, decimal cashRefunds, decimal cardRefunds,
        decimal eftRefunds) =>
        cashExpenses + cardExpenses + eftExpenses +
        cashRefunds + cardRefunds + eftRefunds;

    public static decimal UnresolvedSchemeDifference(decimal claimValue,
        decimal matchedRealRemittance) =>
        Math.Max(0m, claimValue - matchedRealRemittance);
}
